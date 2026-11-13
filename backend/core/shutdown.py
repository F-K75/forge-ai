"""Graceful shutdown coordination for the FastAPI application (BE-005).

Provides a small, async-safe state machine that coordinates signal handling,
in-flight request draining, health-check drain mode, and WebSocket closure.
"""

import asyncio
import logging
import signal
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException
from fastapi.responses import JSONResponse

from core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


@dataclass
class ShutdownConfig:
    """Configuration for graceful shutdown behavior."""

    # How long to wait for in-flight requests to finish after SIGTERM/SIGINT.
    # Should be <= k8s terminationGracePeriodSeconds / Compose stop_grace_period.
    drain_timeout: float = 30.0

    # If True, log each transition for debugging.
    verbose: bool = False


class ShutdownManager:
    """
    Coordinates graceful shutdown across the FastAPI application.

    Lifecycle:
      1. Startup: create manager, call `register_signal_handlers()`
      2. On SIGTERM/SIGINT: `draining` event is set; new requests get 503
      3. Middleware increments/decrements `in_flight` counter per request
      4. `wait_for_drain()` blocks until `in_flight == 0` or `drain_timeout`
      5. On timeout: force-exit (Celery warm shutdown + `acks_late` handles the rest)
    """

    def __init__(self, config: Optional[ShutdownConfig] = None):
        self._config = config or ShutdownConfig()
        self._draining = asyncio.Event()
        self._in_flight: int = 0
        self._in_flight_lock = asyncio.Lock()
        self._shutdown_complete = asyncio.Event()
        self._signal_registered = False

    @property
    def draining(self) -> bool:
        """Whether the server is in drain mode (no new requests accepted)."""
        return self._draining.is_set()

    @property
    def in_flight(self) -> int:
        """Current number of requests being processed."""
        return self._in_flight

    async def start_request(self) -> bool:
        """
        Call at the start of each HTTP request.

        Returns True if the request should proceed, False if the server is
        draining and the request should be rejected with 503.
        """
        if self._draining.is_set():
            return False
        async with self._in_flight_lock:
            if self._draining.is_set():
                return False
            self._in_flight += 1
            return True

    async def end_request(self) -> None:
        """Call when an HTTP request finishes (success or error)."""
        async with self._in_flight_lock:
            if self._in_flight > 0:
                self._in_flight -= 1
            if self._in_flight == 0 and self._draining.is_set():
                self._shutdown_complete.set()

    def begin_drain(self) -> None:
        """Called by the signal handler to initiate drain mode."""
        if self._config.verbose:
            logger.info("Drain mode initiated; waiting for %d in-flight request(s)", self._in_flight)
        self._draining.set()
        if self._in_flight == 0:
            self._shutdown_complete.set()

    async def wait_for_drain(self) -> None:
        """
        Block until all in-flight requests complete or the drain timeout expires.
        Call this from the application's shutdown lifespan.
        """
        try:
            await asyncio.wait_for(self._shutdown_complete.wait(), timeout=self._config.drain_timeout)
            if self._config.verbose:
                logger.info("All in-flight requests completed; shutdown proceeding")
        except asyncio.TimeoutError:
            if self._config.verbose:
                logger.warning(
                    "Drain timeout (%ss) reached with %d request(s) still in flight; forcing shutdown",
                    self._config.drain_timeout,
                    self._in_flight,
                )

    def register_signal_handlers(self) -> None:
        """Register SIGTERM/SIGINT handlers. Idempotent."""
        if self._signal_registered:
            return

        # This runs inside the app's lifespan, *after* the ASGI server (uvicorn)
        # has installed its own SIGTERM/SIGINT handlers. Replacing them outright
        # meant uvicorn never learned it should exit: the app sat in drain mode
        # answering 503 forever (stuck --reload, and every deploy restart
        # waited out the platform's kill timeout). Chain to the previous
        # handler so the server still shuts down -- its shutdown then runs the
        # lifespan's wait_for_drain().
        previous = {
            sig: signal.getsignal(sig) for sig in (signal.SIGTERM, signal.SIGINT)
        }

        def _handler(sig, frame):
            if self._config.verbose:
                logger.info("Received signal %s", sig)
            self.begin_drain()
            prev = previous.get(sig)
            if callable(prev):
                prev(sig, frame)

        # FastAPI runs in the main thread; signal handlers must be registered there.
        signal.signal(signal.SIGTERM, _handler)
        signal.signal(signal.SIGINT, _handler)
        self._signal_registered = True
        if self._config.verbose:
            logger.info("Signal handlers registered for SIGTERM/SIGINT")


# Global manager instance (created in main.py lifespan)
_shutdown_manager: Optional[ShutdownManager] = None


def get_shutdown_manager() -> ShutdownManager:
    """Get the global shutdown manager instance."""
    if _shutdown_manager is None:
        raise RuntimeError("ShutdownManager not initialized. Call init_shutdown_manager() first.")
    return _shutdown_manager


def init_shutdown_manager(config: Optional[ShutdownConfig] = None) -> ShutdownManager:
    """Initialize the global shutdown manager."""
    global _shutdown_manager
    if _shutdown_manager is not None:
        return _shutdown_manager
    _shutdown_manager = ShutdownManager(config)
    return _shutdown_manager


# --------------------------------------------------------------------------- #
# FastAPI middleware for request draining
# --------------------------------------------------------------------------- #


class DrainMiddleware:
    """ASGI middleware that rejects new requests during drain and tracks in-flight count."""

    def __init__(self, app, shutdown_manager=None):
        self.app = app
        # Resolve the shutdown manager lazily in __call__ so that test code
        # (which builds the middleware stack before the lifespan has run) does
        # not crash with "ShutdownManager not initialized". In production the
        # lifespan calls init_shutdown_manager() before any request arrives, so
        # the first call to __call__ always finds a live manager.
        self._shutdown_manager = shutdown_manager

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        manager = self._shutdown_manager
        if manager is None:
            try:
                manager = get_shutdown_manager()
                self._shutdown_manager = manager
            except RuntimeError:
                # Shutdown manager not yet initialized (e.g. test code that
                # builds the app before the lifespan runs). Allow the request
                # through without drain tracking.
                await self.app(scope, receive, send)
                return

        if not await manager.start_request():
            response = JSONResponse(
                status_code=503,
                content={"detail": "Service shutting down, please retry later"},
            )
            await response(scope, receive, send)
            return

        try:
            await self.app(scope, receive, send)
        finally:
            await manager.end_request()


# --------------------------------------------------------------------------- #
# FastAPI dependency for health checks
# --------------------------------------------------------------------------- #


async def require_not_draining() -> None:
    """FastAPI dependency that raises 503 if the server is draining."""
    manager = get_shutdown_manager()
    if manager.draining:
        raise HTTPException(status_code=503, detail="Service shutting down")


# --------------------------------------------------------------------------- #
# Health check helper
# --------------------------------------------------------------------------- #


def get_health_status(manager: ShutdownManager) -> dict:
    """Return health status dict that includes drain state."""
    if manager.draining:
        return {"status": "draining", "in_flight": manager.in_flight}
    return {"status": "ok"}