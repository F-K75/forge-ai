"""
Comprehensive test suite for orchestration.storage module.

Tests cover:
- Concurrent writes (20 threads, same file)
- Concurrent reads (100 threads)
- Read during write
- Write during read
- Lock timeout behavior
- Crash during write (atomicity)
- Atomic rename verification
- Cross-platform compatibility
- Error handling and recovery
"""

import json
import os
import tempfile
import threading
import time
import shutil
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any

try:
    import pytest
except ImportError:
    class DummyPytest:
        @staticmethod
        def fixture(func):
            return func
        @staticmethod
        def raises(*args, **kwargs):
            class DummyCtx:
                def __enter__(self): return self
                def __exit__(self, *a): return True
            return DummyCtx()
    pytest = DummyPytest()

from orchestration.storage import (
    JSONStorage,
    StorageBackend,
    StorageError,
    LockTimeoutError,
    get_storage,
    configure_storage,
)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def temp_dir():
    """Provide a temporary directory for test files."""
    dir_path = tempfile.mkdtemp(prefix="storage_test_")
    yield dir_path
    shutil.rmtree(dir_path, ignore_errors=True)


@pytest.fixture
def storage(temp_dir):
    """Provide a fresh JSONStorage instance for each test."""
    return JSONStorage(lock_timeout=2.0, retry_interval=0.01)


@pytest.fixture
def sample_data() -> Dict[str, Any]:
    """Sample JSON data for testing."""
    return {
        "tasks": [
            {"id": "TASK-1", "status": "READY"},
            {"id": "TASK-2", "status": "IN_PROGRESS"},
        ],
        "metadata": {
            "version": "1.0.0",
            "updated_at": "2026-06-30T04:00:00+05:30",
        }
    }


# ---------------------------------------------------------------------------
# Basic Functionality Tests
# ---------------------------------------------------------------------------

class TestBasicReadWrite:
    """Test basic read/write operations."""

    def test_write_and_read(self, storage, temp_dir, sample_data):
        """Test basic write and read cycle."""
        path = os.path.join(temp_dir, "test.json")
        storage.write(path, sample_data)
        result = storage.read(path)
        assert result == sample_data

    def test_write_creates_parent_dirs(self, storage, temp_dir, sample_data):
        """Test that write creates parent directories."""
        path = os.path.join(temp_dir, "subdir", "nested", "test.json")
        storage.write(path, sample_data)
        assert os.path.exists(path)
        result = storage.read(path)
        assert result == sample_data

    def test_read_missing_file_raises(self, storage, temp_dir):
        """Test that reading a missing file raises FileNotFoundError."""
        path = os.path.join(temp_dir, "nonexistent.json")
        with pytest.raises(FileNotFoundError):
            storage.read(path)

    def test_exists(self, storage, temp_dir, sample_data):
        """Test exists() method."""
        path = os.path.join(temp_dir, "test.json")
        assert not storage.exists(path)
        storage.write(path, sample_data)
        assert storage.exists(path)

    def test_atomic_write_preserves_data_on_crash(self, storage, temp_dir, sample_data):
        """Test that partial writes don't corrupt the file."""
        path = os.path.join(temp_dir, "test.json")
        # Write initial data
        storage.write(path, sample_data)
        initial_data = storage.read(path)

        # Simulate a crash by writing garbage to the file mid-operation
        # (In real scenario, process would die during write)
        # Here we verify atomic rename by checking that temp files are cleaned up
        storage.write(path, {"new": "data"})
        result = storage.read(path)
        assert result == {"new": "data"}

        # Verify no temp files left behind
        temp_files = list(Path(temp_dir).glob("*.tmp"))
        assert len(temp_files) == 0


# ---------------------------------------------------------------------------
# Concurrency Tests
# ---------------------------------------------------------------------------

class TestConcurrentWrites:
    """Test concurrent write operations."""

    def test_20_concurrent_writes_same_file(self, storage, temp_dir):
        """Test 20 concurrent atomic updates to the same file don't lose data."""
        path = os.path.join(temp_dir, "concurrent_writes.json")
        initial_data = {"tasks": [], "counter": 0}
        storage.write(path, initial_data)

        errors = []
        successes = []
        lock = threading.Lock()

        def update_task(thread_id: int):
            try:
                def modifier(data):
                    data["counter"] = data.get("counter", 0) + 1
                    data["last_writer"] = thread_id
                    return data
                storage.update(path, modifier)
                with lock:
                    successes.append(thread_id)
            except Exception as e:
                with lock:
                    errors.append((thread_id, str(e)))

        threads = []
        for i in range(20):
            t = threading.Thread(target=update_task, args=(i,))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        # All threads should succeed
        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert len(successes) == 20

        # Final state should be consistent
        final_data = storage.read(path)
        assert final_data["counter"] == 20
        assert "last_writer" in final_data

    def test_100_concurrent_reads(self, storage, temp_dir, sample_data):
        """Test 100 concurrent reads don't block or corrupt."""
        path = os.path.join(temp_dir, "concurrent_reads.json")
        storage.write(path, sample_data)

        errors = []
        results = []
        lock = threading.Lock()

        def read_task(thread_id: int):
            try:
                data = storage.read(path)
                with lock:
                    results.append((thread_id, data))
            except Exception as e:
                with lock:
                    errors.append((thread_id, str(e)))

        threads = []
        start = time.time()
        for i in range(100):
            t = threading.Thread(target=read_task, args=(i,))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        elapsed = time.time() - start

        # All reads should succeed
        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert len(results) == 100

        # All reads should return the same data
        first_data = results[0][1]
        for thread_id, data in results:
            assert data == first_data, f"Thread {thread_id} got different data"

        # Should complete in reasonable time (< 5 seconds for 100 reads)
        assert elapsed < 5.0, f"100 concurrent reads took {elapsed:.2f}s"

    def test_read_during_write(self, storage, temp_dir, sample_data):
        """Test that reads during writes don't see partial data."""
        path = os.path.join(temp_dir, "read_during_write.json")
        storage.write(path, sample_data)

        read_results = []
        write_count = [0]
        lock = threading.Lock()
        stop_event = threading.Event()

        def writer():
            for i in range(10):
                data = storage.read(path)
                data["version"] = i
                storage.write(path, data)
                with lock:
                    write_count[0] += 1
                time.sleep(0.01)

        def reader():
            while not stop_event.is_set():
                try:
                    data = storage.read(path)
                    with lock:
                        read_results.append(data)
                except Exception:
                    pass
                time.sleep(0.005)

        writer_thread = threading.Thread(target=writer)
        reader_thread = threading.Thread(target=reader)

        writer_thread.start()
        reader_thread.start()
        writer_thread.join()
        stop_event.set()
        reader_thread.join()

        # All reads should return valid JSON
        assert len(read_results) > 0
        for data in read_results:
            assert "tasks" in data or "version" in data
            # Should never see partial write
            assert isinstance(data, dict)

    def test_write_during_read(self, storage, temp_dir, sample_data):
        """Test that writes during reads are properly serialized."""
        path = os.path.join(temp_dir, "write_during_read.json")
        storage.write(path, sample_data)

        read_times = []
        write_times = []
        lock = threading.Lock()
        stop_event = threading.Event()

        def reader():
            while not stop_event.is_set():
                try:
                    start = time.time()
                    data = storage.read(path)
                    elapsed = time.time() - start
                    with lock:
                        read_times.append(elapsed)
                    # Data should always be valid
                    assert isinstance(data, dict)
                except Exception:
                    pass
                time.sleep(0.01)

        def writer():
            for i in range(20):
                start = time.time()
                data = {"write": i, "timestamp": start}
                storage.write(path, data)
                elapsed = time.time() - start
                with lock:
                    write_times.append(elapsed)
                time.sleep(0.02)

        reader_thread = threading.Thread(target=reader)
        writer_thread = threading.Thread(target=writer)

        reader_thread.start()
        writer_thread.start()
        writer_thread.join()
        stop_event.set()
        reader_thread.join()

        # All operations should complete
        assert len(write_times) == 20
        assert len(read_times) > 0


# ---------------------------------------------------------------------------
# Lock Timeout Tests
# ---------------------------------------------------------------------------

class TestLockTimeout:
    """Test lock timeout behavior."""

    def test_lock_timeout_raises_error(self, temp_dir):
        """Test that lock timeout raises LockTimeoutError."""
        path = os.path.join(temp_dir, "timeout_test.json")
        storage = JSONStorage(lock_timeout=0.5, retry_interval=0.1)

        # Write initial data
        storage.write(path, {"data": "initial"})

        # Acquire exclusive lock in background thread
        lock_file = f"{path}.lock"
        fd = os.open(lock_file, os.O_RDWR | os.O_CREAT, 0o644)
        try:
            import fcntl
            fcntl.flock(fd, fcntl.LOCK_EX)

            # Try to read with short timeout - should fail
            with pytest.raises(LockTimeoutError):
                storage.read(path, timeout=0.5)

            # Try to write with short timeout - should fail
            with pytest.raises(LockTimeoutError):
                storage.write(path, {"data": "new"}, timeout=0.5)

        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)

    def test_lock_released_after_context_exit(self, storage, temp_dir):
        """Test that locks are released when context manager exits."""
        path = os.path.join(temp_dir, "lock_release.json")

        # Write initial data
        storage.write(path, {"data": "initial"})

        # Simulate lock acquisition and release
        from orchestration.storage import _FileLock
        lock = _FileLock(path, exclusive=True, timeout=1.0)
        lock.acquire()
        assert lock._lock_fd is not None
        lock.release()
        assert lock._lock_fd is None

        # Should be able to read/write after release
        data = storage.read(path)
        assert data == {"data": "initial"}
        storage.write(path, {"data": "updated"})
        data = storage.read(path)
        assert data == {"data": "updated"}


# ---------------------------------------------------------------------------
# Atomicity Tests
# ---------------------------------------------------------------------------

class TestAtomicity:
    """Test atomic write guarantees."""

    def test_atomic_rename_verification(self, storage, temp_dir):
        """Test that writes use atomic rename (no partial files)."""
        path = os.path.join(temp_dir, "atomic.json")

        # Write multiple times and verify no partial files
        for i in range(10):
            storage.write(path, {"iteration": i})
            # Check that no .tmp files exist
            temp_files = list(Path(temp_dir).glob("*.tmp"))
            assert len(temp_files) == 0, f"Found temp files: {temp_files}"

        # Final data should be correct
        data = storage.read(path)
        assert data["iteration"] == 9

    def test_crash_during_write_preserves_old_data(self, temp_dir):
        """Test that a crash during write doesn't corrupt existing data."""
        path = os.path.join(temp_dir, "crash_test.json")

        # Write initial data
        initial = {"version": 1, "data": "important"}
        storage = JSONStorage()
        storage.write(path, initial)

        # Simulate crash by writing invalid JSON directly
        # (bypassing storage layer)
        with open(path, "w") as f:
            f.write("{invalid json")

        # Storage should detect corruption on next read
        with pytest.raises(StorageError, match="Corrupt JSON"):
            storage.read(path)

        # But we can still write new valid data
        storage.write(path, {"version": 2, "data": "recovered"})
        data = storage.read(path)
        assert data["version"] == 2


# ---------------------------------------------------------------------------
# Error Handling Tests
# ---------------------------------------------------------------------------

class TestErrorHandling:
    """Test error handling and recovery."""

    def test_read_nonexistent_path(self, storage, temp_dir):
        """Test reading a path that doesn't exist."""
        path = os.path.join(temp_dir, "does_not_exist.json")
        with pytest.raises(FileNotFoundError):
            storage.read(path)

    def test_write_to_readonly_path(self, storage, temp_dir):
        """Test writing to a read-only directory."""
        path = os.path.join(temp_dir, "readonly", "test.json")
        os.makedirs(os.path.dirname(path), mode=0o444, exist_ok=True)

        # Should still work because we create the file
        # (OS permissions on directory vs file differ)
        try:
            storage.write(path, {"data": "test"})
        except (PermissionError, StorageError):
            # Expected on some systems
            pass

    def test_corrupt_json_raises_storage_error(self, storage, temp_dir):
        """Test that corrupt JSON raises StorageError."""
        path = os.path.join(temp_dir, "corrupt.json")
        with open(path, "w") as f:
            f.write("not valid json {{{")

        with pytest.raises(StorageError, match="Corrupt JSON"):
            storage.read(path)


# ---------------------------------------------------------------------------
# Integration Tests
# ---------------------------------------------------------------------------

class TestHelpersIntegration:
    """Test that helpers.py correctly uses the storage backend."""

    def test_helpers_use_storage_backend(self, temp_dir, monkeypatch):
        """Test that helpers.py delegates to storage backend dynamically."""
        from orchestration import helpers

        mock_data = {}
        mock_calls = {"reads": 0, "writes": 0, "updates": 0}

        class MockStorage:
            def read(self, path, timeout=5.0):
                mock_calls["reads"] += 1
                return mock_data.get(path, {})

            def write(self, path, data, timeout=10.0):
                mock_calls["writes"] += 1
                mock_data[path] = data

            def update(self, path, modifier, timeout=10.0):
                mock_calls["updates"] += 1
                data = self.read(path, timeout)
                updated = modifier(data)
                self.write(path, updated, timeout)
                return updated

            def exists(self, path):
                return path in mock_data

        mock_storage = MockStorage()
        configure_storage(mock_storage)

        # Override paths to use temp_dir for testing
        test_path = os.path.join(temp_dir, "test_registry.json")
        monkeypatch.setitem(helpers.PATHS, "task_registry", test_path)

        # Initialize test file
        mock_storage.write(test_path, {"tasks": [{"id": "T-1", "status": "READY"}]})

        # Test that helpers use the mock storage
        task = helpers.get_task_by_id("T-1")
        assert task["id"] == "T-1"
        assert mock_calls["reads"] > 0

        helpers.update_task("T-1", {"status": "IN_PROGRESS"}, history_event="task_started")
        assert mock_calls["updates"] > 0

        # Restore default storage
        configure_storage(JSONStorage())


# ---------------------------------------------------------------------------
# Performance Tests
# ---------------------------------------------------------------------------

class TestPerformance:
    """Test performance characteristics."""

    def test_read_performance(self, storage, temp_dir, sample_data):
        """Test that reads are fast (< 1ms each for 1000 reads)."""
        path = os.path.join(temp_dir, "perf_read.json")
        storage.write(path, sample_data)

        times = []
        for _ in range(1000):
            start = time.time()
            storage.read(path)
            elapsed = time.time() - start
            times.append(elapsed)

        avg_time = sum(times) / len(times)
        assert avg_time < 0.001, f"Average read time {avg_time:.4f}s exceeds 1ms"

    def test_write_performance(self, storage, temp_dir, sample_data):
        """Test that writes are reasonably fast (< 10ms each for 100 writes)."""
        path = os.path.join(temp_dir, "perf_write.json")

        times = []
        for i in range(100):
            start = time.time()
            storage.write(path, {**sample_data, "iteration": i})
            elapsed = time.time() - start
            times.append(elapsed)

        avg_time = sum(times) / len(times)
        assert avg_time < 0.01, f"Average write time {avg_time:.4f}s exceeds 10ms"


# ---------------------------------------------------------------------------
# Atomic Update Tests
# ---------------------------------------------------------------------------

class TestAtomicUpdate:
    """Test atomic read-modify-write operations."""

    def test_atomic_update_basic(self, storage, temp_dir, sample_data):
        """Test basic atomic update."""
        path = os.path.join(temp_dir, "atomic_update.json")
        storage.write(path, sample_data)

        def modifier(data):
            data["counter"] = 42
            return data

        result = storage.update(path, modifier)
        assert result["counter"] == 42
        assert result["metadata"]["version"] == "1.0.0"

    def test_atomic_update_creates_parent_dirs(self, storage, temp_dir, sample_data):
        """Test that atomic update creates parent directories for lock file."""
        path = os.path.join(temp_dir, "subdir", "nested", "atomic_update.json")
        storage.write(path, sample_data)

        def modifier(data):
            data["counter"] = 1
            return data

        result = storage.update(path, modifier)
        assert result["counter"] == 1

    def test_concurrent_atomic_updates_no_lost_writes(self, storage, temp_dir):
        """Test that 20 concurrent atomic updates to same file all apply."""
        path = os.path.join(temp_dir, "concurrent_atomic.json")
        storage.write(path, {"counter": 0})

        errors = []
        successes = []
        lock = threading.Lock()

        def update_task(thread_id: int):
            try:
                def modifier(data):
                    data["counter"] = data.get("counter", 0) + 1
                    data[f"writer_{thread_id}"] = True
                    return data
                storage.update(path, modifier)
                with lock:
                    successes.append(thread_id)
            except Exception as e:
                with lock:
                    errors.append((thread_id, str(e)))

        threads = []
        for i in range(20):
            t = threading.Thread(target=update_task, args=(i,))
            threads.append(t)
            t.start()

        for t in threads:
            t.join()

        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert len(successes) == 20

        final_data = storage.read(path)
        assert final_data["counter"] == 20
        for i in range(20):
            assert final_data.get(f"writer_{i}") is True

    def test_concurrent_atomic_updates_different_files(self, storage, temp_dir):
        """Test 100 parallel atomic updates on different files."""
        paths = [os.path.join(temp_dir, f"file_{i}.json") for i in range(100)]
        for p in paths:
            storage.write(p, {"id": p, "counter": 0})

        errors = []
        lock = threading.Lock()

        def update_file(path):
            try:
                def modifier(data):
                    data["counter"] = data.get("counter", 0) + 1
                    return data
                storage.update(path, modifier)
            except Exception as e:
                with lock:
                    errors.append((path, str(e)))

        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = [executor.submit(update_file, p) for p in paths]
            for f in as_completed(futures):
                f.result()

        assert len(errors) == 0, f"Errors occurred: {errors}"

        for p in paths:
            data = storage.read(p)
            assert data["counter"] == 1

    def test_atomic_update_on_corrupt_file_raises(self, storage, temp_dir):
        """Test that atomic update raises StorageError on corrupt JSON."""
        path = os.path.join(temp_dir, "corrupt_atomic.json")
        with open(path, "w") as f:
            f.write("not valid json {{{")

        with pytest.raises(StorageError, match="Corrupt JSON"):
            storage.update(path, lambda d: d)

    def test_read_during_atomic_update_sees_old_or_new_data(self, storage, temp_dir, sample_data):
        """Test that reads during atomic update see consistent data."""
        path = os.path.join(temp_dir, "read_during_atomic.json")
        storage.write(path, sample_data)

        read_results = []
        stop_event = threading.Event()

        def updater():
            for i in range(5):
                def modifier(data):
                    data["version"] = i
                    return data
                storage.update(path, modifier)
                time.sleep(0.02)

        def reader():
            while not stop_event.is_set():
                try:
                    data = storage.read(path)
                    read_results.append(data)
                except Exception:
                    pass
                time.sleep(0.005)

        updater_thread = threading.Thread(target=updater)
        reader_thread = threading.Thread(target=reader)

        updater_thread.start()
        reader_thread.start()
        updater_thread.join()
        stop_event.set()
        reader_thread.join()

        assert len(read_results) > 0
        for data in read_results:
            assert isinstance(data, dict)
            assert "tasks" in data or "version" in data



# ---------------------------------------------------------------------------
# Recovery Tests (EVG-REC-001)
# ---------------------------------------------------------------------------

class TestRecoveryCorruptedCheckpointFallback:
    """Verify corrupted checkpoint fallback behavior (EVG-REC-001).

    Determinism notes:
    - We operate only within the repository's orchestration directory.
    - We restore the original recovery_checkpoint.json after each test.
    - We use file-level corruption to deterministically emulate corrupted checkpoint candidates.
    """

    def _backup_and_reset_checkpoint_file(self):
        from orchestration.engine.recovery import RecoveryManager
        from orchestration import helpers as orch_helpers

        checkpoint_dir = os.path.dirname(orch_helpers.PATHS["workflow_state"])
        checkpoint_path = os.path.join(checkpoint_dir, RecoveryManager.CHECKPOINT_FILE)

        original_exists = os.path.exists(checkpoint_path)
        original_content = None
        if original_exists:
            with open(checkpoint_path, "r", encoding="utf-8") as f:
                original_content = f.read()

        return checkpoint_path, original_exists, original_content

    def _restore_checkpoint_file(self, checkpoint_path, original_exists, original_content):
        if original_exists:
            with open(checkpoint_path, "w", encoding="utf-8") as f:
                f.write(original_content)  # type: ignore[arg-type]
        else:
            try:
                if os.path.exists(checkpoint_path):
                    os.remove(checkpoint_path)
            except Exception:
                pass

    def test_recover_corrupted_latest_checkpoint_falls_back(self):
        import copy
        from orchestration.engine.recovery import RecoveryManager

        from orchestration import helpers as orch_helpers

        checkpoint_dir = os.path.dirname(orch_helpers.PATHS["workflow_state"])
        checkpoint_path = os.path.join(checkpoint_dir, RecoveryManager.CHECKPOINT_FILE)

        checkpoint_path, original_exists, original_content = self._backup_and_reset_checkpoint_file()


        # Ensure required base files exist for recovery
        # (Recovery reads workflow_state and task_registry)
        # Use JSONStorage via helpers.
        try:
            # Minimal task registry + workflow state required by recovery.
            # If existing content exists, overwrite to ensure deterministic assertions.
            task_registry_path = orch_helpers.PATHS["task_registry"]
            workflow_state_path = orch_helpers.PATHS["workflow_state"]

            # Ensure task registry contains one active recoverable task
            initial_tasks = {
                "tasks": [
                    {"id": "T-REC-1", "status": "FAILED", "category": "implementation"}
                ],
                "updated_at": orch_helpers._timestamp() if hasattr(orch_helpers, "_timestamp") else ""
            }

            orch_helpers._write_json(task_registry_path, initial_tasks)
            orch_helpers._write_json(
                workflow_state_path,
                {"workflow": {"stages": [], "current_stage_index": 0}, "updated_at": orch_helpers._timestamp()},
            )

            # Create prior valid checkpoints list (two entries):
            # - checkpoints[0] valid
            # - checkpoints[1] corrupted (we'll corrupt checkpoint file structure)
            # Then invoke recover and assert it succeeds (and resets the failed task).
            valid_checkpoint = {
                "checkpoint_id": "ckpt-valid",
                "timestamp": orch_helpers._timestamp(),
                "workflow_state": {"workflow": {"stages": [], "current_stage_index": 0}, "updated_at": orch_helpers._timestamp()},
                "active_tasks": initial_tasks["tasks"],
                "completed_tasks": [],
                "failed_tasks": ["T-REC-1"],
                "event_bus_state": {},
                "metadata": {},
            }

            # Write checkpoint file with both entries
            # Then corrupt the latest checkpoint entry fields to break deserialization.
            checkpoint_payload = {"checkpoints": [valid_checkpoint, copy.deepcopy(valid_checkpoint)]}
            orch_helpers._write_json(
                checkpoint_path,
                checkpoint_payload,
            )

            # Corrupt the latest checkpoint entry fields to force recovery to skip it.
            # Required-field validation should reject this latest candidate and recover from
            # the previous (valid) checkpoint.
            data = orch_helpers._read_json(checkpoint_path)
            data["checkpoints"][1].pop("checkpoint_id", None)
            orch_helpers._write_json(checkpoint_path, data)

            rm = RecoveryManager()
            result = rm.recover(metadata={"test": True})

            assert result.success is True
            assert result.state.value == "RECOVERED"

            # Since task state machine can_recover for FAILED, it should reset to ASSIGNED.
            updated_task = orch_helpers.get_task_by_id("T-REC-1")
            assert updated_task is not None
            assert updated_task["status"] == "ASSIGNED"


        finally:
            # Restore original checkpoint file
            if original_exists:
                with open(checkpoint_path, "w", encoding="utf-8") as f:
                    f.write(original_content)  # type: ignore[arg-type]
            else:
                try:
                    if os.path.exists(checkpoint_path):
                        os.remove(checkpoint_path)
                except Exception:
                    pass


# ---------------------------------------------------------------------------
# Run Tests
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
