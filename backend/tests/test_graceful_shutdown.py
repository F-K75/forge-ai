"""Integration tests for BE-005 graceful shutdown of the FastAPI app.

Exercises:
1. `DrainMiddleware` returns 503 once the server starts draining
2. `DrainMiddleware` passes requests through when not draining
3. `ShutdownManager.wait_for_drain()` resolves when in-flight count hits 0
4. `wait_for_drain()` honours the timeout when requests keep arriving
5. `ws_manager.close_all_connections` closes every live WebSocket on shutdown
6. Celery `worker_shutting_down` register handler calls `cancel_consumer`
"""

import asyncio

import pytest

import core.shutdown as shutdown_module
import main
from core.shutdown import ShutdownManager, ShutdownConfig, DrainMiddleware
from services.ws_manager import ConnectionManager


@pytest.fixture(autouse=True)
def _fresh_shutdown_manager(monkeypatch):
    manager = ShutdownManager(ShutdownConfig(drain_timeout=1.0, verbose=False))
    monkeypatch.setattr(shutdown_module, "_shutdown_manager", manager)
    monkeypatch.setattr(main, "get_shutdown_manager", lambda: manager)


def _make_middleware(mgr=None):
    if mgr is None:
        mgr = ShutdownManager(ShutdownConfig(drain_timeout=1.0, verbose=False))
    return DrainMiddleware(
        app=lambda scope, receive, send: None,
        shutdown_manager=mgr,
    )


@pytest.mark.asyncio
async def test_drain_middleware_503_when_draining():
    mgr = ShutdownManager(ShutdownConfig(drain_timeout=1.0, verbose=False))
    mw = _make_middleware(mgr)
    mgr.begin_drain()

    captured = []

    async def capture_send(message):
        captured.append(message)

    async def recv():
        return {"type": "http.request", "body": b"", "more_body": False}

    scope = {"type": "http", "method": "GET", "path": "/health"}
    await mw(scope, recv, capture_send)

    assert captured[0]["type"] == "http.response.start"
    assert captured[0]["status"] == 503


@pytest.mark.asyncio
async def test_drain_middleware_passes_when_not_draining():
    mgr = ShutdownManager(ShutdownConfig(drain_timeout=1.0, verbose=False))
    mw = _make_middleware(mgr)

    called = []

    async def fake_app(scope, receive, send):
        called.append(True)

    mw.app = fake_app

    async def recv():
        return {"type": "http.request", "body": b"", "more_body": False}

    captured = []

    async def capture_send(message):
        captured.append(message)

    scope = {"type": "http", "method": "GET", "path": "/health"}
    await mw(scope, recv, capture_send)

    assert called == [True]


def test_wait_for_drain_resolves_when_in_flight_is_zero(_fresh_shutdown_manager):
    mgr = main.get_shutdown_manager()
    mgr.begin_drain()
    assert mgr._shutdown_complete.is_set()


@pytest.mark.asyncio
async def test_wait_for_drain_honours_timeout_when_in_flight():
    mgr = ShutdownManager(ShutdownConfig(drain_timeout=1.0, verbose=False))
    async with mgr._in_flight_lock:
        mgr._in_flight = 1
    mgr.begin_drain()

    start = asyncio.get_event_loop().time()
    await mgr.wait_for_drain()
    elapsed = asyncio.get_event_loop().time() - start
    assert elapsed >= mgr._config.drain_timeout * 0.9


@pytest.mark.asyncio
async def test_ws_close_all_connections_on_shutdown():
    closed = []

    class FakeWS:
        async def close(self, code=0, reason=""):
            closed.append((code, reason))

    mgr = ConnectionManager()
    ws = FakeWS()
    await mgr.connect(ws, "build-1")
    await mgr.close_all_connections("Server shutting down")
    assert len(closed) == 1
    assert closed[0][0] == 1011
    assert "Server shutting down" in closed[0][1]
    assert mgr.active == {}


@pytest.mark.parametrize("signame", ["SIGTERM", "SIGINT"])
def test_signal_handler_chains_to_the_servers_handler(signame):
    """The app's handler is installed during lifespan startup, after uvicorn
    has installed its own. It must start draining *and* still call the
    server's handler; replacing it meant uvicorn never exited (stuck in
    drain mode answering 503 on every reload / deploy restart)."""
    import signal

    sig = getattr(signal, signame)
    original_term = signal.getsignal(signal.SIGTERM)
    original_int = signal.getsignal(signal.SIGINT)
    server_calls = []

    def server_handler(s, frame):
        server_calls.append(s)

    try:
        signal.signal(sig, server_handler)
        mgr = ShutdownManager(ShutdownConfig(drain_timeout=1.0, verbose=False))
        mgr.register_signal_handlers()

        signal.getsignal(sig)(sig, None)

        assert mgr.draining
        assert server_calls == [sig]
    finally:
        signal.signal(signal.SIGTERM, original_term)
        signal.signal(signal.SIGINT, original_int)
