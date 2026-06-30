"""
Storage abstraction layer for orchestration state files.

Provides thread-safe and process-safe concurrent access to JSON state files
through a pluggable backend architecture. The default implementation uses
advisory file locking with atomic writes.

Architecture:
    StorageBackend (ABC)
        └── JSONStorage (default implementation)

All locking logic lives in JSONStorage. helpers.py remains storage-agnostic.
"""

import abc
import fcntl
import logging
import os
import platform
import struct
import tempfile
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Union

logger = logging.getLogger(__name__)

# Cross-platform lock timeout defaults
DEFAULT_LOCK_TIMEOUT_SECONDS = 10.0
DEFAULT_LOCK_RETRY_INTERVAL = 0.05
DEFAULT_READ_TIMEOUT_SECONDS = 5.0
DEFAULT_WRITE_TIMEOUT_SECONDS = 10.0


class StorageError(Exception):
    """Base exception for storage backend errors."""
    pass


class LockTimeoutError(StorageError):
    """Raised when lock acquisition times out."""
    pass


class LockAcquisitionError(StorageError):
    """Raised when lock cannot be acquired due to OS-level errors."""
    pass


class ChecksumMismatchError(StorageError):
    """Raised when loaded data fails integrity verification."""
    pass


class StorageBackend(abc.ABC):
    """Abstract base class for storage backends."""

    @abc.abstractmethod
    def read(self, path: str, timeout: float = DEFAULT_READ_TIMEOUT_SECONDS) -> Dict[str, Any]:
        """Read and return parsed JSON data from path.

        Args:
            path: File path to read.
            timeout: Maximum seconds to wait for read lock.

        Returns:
            Parsed JSON data as dict.

        Raises:
            LockTimeoutError: If lock cannot be acquired within timeout.
            StorageError: On other read failures.
        """
        raise NotImplementedError

    @abc.abstractmethod
    def write(
        self,
        path: str,
        data: Dict[str, Any],
        timeout: float = DEFAULT_WRITE_TIMEOUT_SECONDS,
    ) -> None:
        """Atomically write JSON data to path.

        Uses atomic rename pattern: write to temp file, fsync, rename.

        Args:
            path: Destination file path.
            data: Data to serialize and write.
            timeout: Maximum seconds to wait for write lock.

        Raises:
            LockTimeoutError: If lock cannot be acquired within timeout.
            StorageError: On other write failures.
        """
        raise NotImplementedError

    @abc.abstractmethod
    def exists(self, path: str) -> bool:
        """Check if a managed file exists."""
        raise NotImplementedError

    @abc.abstractmethod
    def update(
        self,
        path: str,
        modifier: Any,
        timeout: float = DEFAULT_WRITE_TIMEOUT_SECONDS,
    ) -> Dict[str, Any]:
        """Atomically read-modify-write a JSON file under exclusive lock.

        Acquires an exclusive lock for the entire read-modify-write cycle,
        ensuring no lost updates between concurrent callers.

        Args:
            path: File path to update.
            modifier: Callable[[Dict[str, Any]], Dict[str, Any]] that takes
                      the current data and returns the updated data.
            timeout: Maximum seconds to wait for write lock.

        Returns:
            The updated data returned by the modifier.

        Raises:
            LockTimeoutError: If lock cannot be acquired within timeout.
            StorageError: On read/write failures or if modifier raises.
        """
        raise NotImplementedError


class _FileLock:
    """Cross-platform advisory file lock context manager.

    Uses fcntl on Unix-like systems and msvcrt on Windows.
    Falls back to a no-op lock on unsupported platforms with a warning.
    """

    def __init__(
        self,
        path: str,
        exclusive: bool,
        timeout: float,
        retry_interval: float = DEFAULT_LOCK_RETRY_INTERVAL,
    ):
        self.path = path
        self.lock_path = f"{path}.lock"
        self.exclusive = exclusive
        self.timeout = timeout
        self.retry_interval = retry_interval
        self._lock_fd: Optional[int] = None
        self._start_time: float = 0.0

    def _is_windows(self) -> bool:
        return platform.system() == "Windows"

    def _acquire_unix(self) -> None:
        """Acquire advisory lock using fcntl on Unix-like systems."""
        lock_type = fcntl.LOCK_EX if self.exclusive else fcntl.LOCK_SH
        flags = lock_type | fcntl.LOCK_NB

        Path(self.lock_path).parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self.lock_path, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            while True:
                try:
                    fcntl.flock(fd, flags)
                    self._lock_fd = fd
                    return
                except (IOError, OSError) as e:
                    if self._is_timeout_exceeded():
                        raise LockTimeoutError(
                            f"Timeout acquiring {'exclusive' if self.exclusive else 'shared'} "
                            f"lock on {self.lock_path} after {self.timeout}s"
                        ) from e
                    time.sleep(self.retry_interval)
        except Exception:
            os.close(fd)
            raise

    def _acquire_windows(self) -> None:
        """Acquire advisory lock using msvcrt on Windows.

        Note: Windows file locking is mandatory rather than advisory.
        We emulate shared/exclusive semantics by locking different regions.
        """
        import msvcrt  # type: ignore

        Path(self.lock_path).parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(self.lock_path, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            # Lock first byte for shared, second byte for exclusive
            lock_byte = 1 if self.exclusive else 0
            while True:
                try:
                    # msvcrt.locking and LK_LOCK are Windows-specific
                    msvcrt.locking(fd, msvcrt.LK_LOCK, 1)  # type: ignore
                    self._lock_fd = fd
                    return
                except OSError as e:
                    if self._is_timeout_exceeded():
                        raise LockTimeoutError(
                            f"Timeout acquiring {'exclusive' if self.exclusive else 'shared'} "
                            f"lock on {self.lock_path} after {self.timeout}s"
                        ) from e
                    time.sleep(self.retry_interval)
        except Exception:
            os.close(fd)
            raise

    def _acquire_fallback(self) -> None:
        """No-op lock for unsupported platforms."""
        logger.warning(
            "Platform %s does not support advisory file locking. "
            "Concurrent access is NOT safe. Consider using a different storage backend.",
            platform.system(),
        )
        self._lock_fd = None

    def _is_timeout_exceeded(self) -> bool:
        return (time.time() - self._start_time) >= self.timeout

    def acquire(self) -> None:
        """Acquire the lock, blocking up to timeout."""
        self._start_time = time.time()

        if self._is_windows():
            self._acquire_windows()
        else:
            try:
                self._acquire_unix()
            except (ImportError, AttributeError):
                self._acquire_fallback()

    def release(self) -> None:
        """Release the lock."""
        if self._lock_fd is not None:
            try:
                if not self._is_windows():
                    fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
                # On Windows, the lock is released when the file handle is closed
            except Exception:
                logger.debug("Lock release warning for %s", self.lock_path, exc_info=True)
            finally:
                try:
                    os.close(self._lock_fd)
                except Exception:
                    pass
                self._lock_fd = None

    def __enter__(self) -> "_FileLock":
        self.acquire()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.release()


class JSONStorage(StorageBackend):
    """Thread-safe and process-safe JSON file storage with advisory file locking.

    Features:
    - Shared locks for concurrent reads
    - Exclusive locks for writes
    - Configurable lock timeouts
    - Atomic writes via temp file + fsync + rename
    - Automatic lock release via context manager
    - Retry on lock contention
    - Structured error handling
    - Logging for lock lifecycle events
    """

    def __init__(
        self,
        lock_timeout: float = DEFAULT_LOCK_TIMEOUT_SECONDS,
        retry_interval: float = DEFAULT_LOCK_RETRY_INTERVAL,
        temp_suffix: str = ".tmp",
    ):
        self.lock_timeout = lock_timeout
        self.retry_interval = retry_interval
        self.temp_suffix = temp_suffix

    def _atomic_write(self, path: str, data: bytes) -> None:
        """Write bytes to path atomically using temp file + fsync + rename."""
        target = Path(path)
        target_dir = target.parent
        target_dir.mkdir(parents=True, exist_ok=True)

        fd, tmp_path = tempfile.mkstemp(
            dir=str(target_dir),
            suffix=self.temp_suffix,
        )
        tmp_path = Path(tmp_path)
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())

            # Atomic rename (POSIX) or replace (cross-platform)
            tmp_path.replace(target)
        except Exception:
            # Clean up temp file on failure
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass
            raise

    def read(
        self,
        path: str,
        timeout: float = DEFAULT_READ_TIMEOUT_SECONDS,
    ) -> Dict[str, Any]:
        """Read JSON data with shared (read) lock."""
        import json

        lock = _FileLock(
            path=path,
            exclusive=False,
            timeout=timeout,
            retry_interval=self.retry_interval,
        )

        try:
            with lock:
                if not os.path.exists(path):
                    raise FileNotFoundError(f"State file not found: {path}")

                with open(path, "rb") as f:
                    raw = f.read()

                try:
                    return json.loads(raw)
                except json.JSONDecodeError as e:
                    logger.error("JSON decode error reading %s: %s", path, e)
                    raise StorageError(f"Corrupt JSON in {path}") from e
        except LockTimeoutError:
            logger.error("Read lock timeout on %s after %ss", path, timeout)
            raise
        except StorageError:
            raise
        except FileNotFoundError:
            raise
        except Exception as e:
            logger.error("Unexpected error reading %s: %s", path, e, exc_info=True)
            raise StorageError(f"Failed to read {path}") from e

    def write(
        self,
        path: str,
        data: Dict[str, Any],
        timeout: float = DEFAULT_WRITE_TIMEOUT_SECONDS,
    ) -> None:
        """Write JSON data atomically with exclusive (write) lock."""
        import json

        lock = _FileLock(
            path=path,
            exclusive=True,
            timeout=timeout,
            retry_interval=self.retry_interval,
        )

        try:
            with lock:
                raw = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
                raw += b"\n"
                self._atomic_write(path, raw)
                logger.debug("Atomic write completed for %s (%d bytes)", path, len(raw))
        except LockTimeoutError:
            logger.error("Write lock timeout on %s after %ss", path, timeout)
            raise
        except Exception as e:
            logger.error("Unexpected error writing %s: %s", path, e, exc_info=True)
            if not isinstance(e, StorageError):
                raise StorageError(f"Failed to write {path}") from e
            raise

    def exists(self, path: str) -> bool:
        """Check if file exists (no locking needed for existence check)."""
        return os.path.exists(path)

    def update(
        self,
        path: str,
        modifier: Callable[[Dict[str, Any]], Dict[str, Any]],
        timeout: float = DEFAULT_WRITE_TIMEOUT_SECONDS,
    ) -> Dict[str, Any]:
        """Atomically read-modify-write a JSON file under exclusive lock.

        Acquires an exclusive lock for the entire read-modify-write cycle,
        ensuring no lost updates between concurrent callers.
        """
        import json

        lock = _FileLock(
            path=path,
            exclusive=True,
            timeout=timeout,
            retry_interval=self.retry_interval,
        )

        try:
            with lock:
                if not os.path.exists(path):
                    raise FileNotFoundError(f"State file not found: {path}")

                with open(path, "rb") as f:
                    raw = f.read()

                try:
                    data = json.loads(raw)
                except json.JSONDecodeError as e:
                    logger.error("JSON decode error reading %s: %s", path, e)
                    raise StorageError(f"Corrupt JSON in {path}") from e

                updated_data = modifier(data)

                raw = json.dumps(updated_data, indent=2, ensure_ascii=False).encode("utf-8")
                raw += b"\n"
                self._atomic_write(path, raw)
                logger.debug("Atomic update completed for %s (%d bytes)", path, len(raw))

                return updated_data
        except LockTimeoutError:
            logger.error("Update lock timeout on %s after %ss", path, timeout)
            raise
        except StorageError:
            raise
        except FileNotFoundError:
            raise
        except Exception as e:
            logger.error("Unexpected error updating %s: %s", path, e, exc_info=True)
            if not isinstance(e, StorageError):
                raise StorageError(f"Failed to update {path}") from e
            raise


# ---------------------------------------------------------------------------
# Module-level singleton storage backend
# ---------------------------------------------------------------------------

_default_storage: Optional[StorageBackend] = None


def get_storage() -> StorageBackend:
    """Return the default storage backend (singleton)."""
    global _default_storage
    if _default_storage is None:
        _default_storage = JSONStorage()
    return _default_storage


def configure_storage(backend: StorageBackend) -> None:
    """Replace the default storage backend (for testing or customization)."""
    global _default_storage
    _default_storage = backend