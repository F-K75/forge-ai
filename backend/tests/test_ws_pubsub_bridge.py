"""Regression tests for the Redis pub/sub bridge in services/ws_manager.py.

Real bug found 2026-07-03: ConnectionManager.emit()/broadcast() published to
Redis, but nothing ever subscribed to those channels. Build-progress events
are emitted from the Celery worker process, which never holds any real
WebSocket connections — only the FastAPI web process does. Without a
subscriber bridging Redis -> local connections, every event from a worker
was silently dropped, for every build, regardless of instance count. This
was verified live (a connected WebSocket client received zero of several
confirmed-emitted events) before the fix, and receives every event after it.

These tests use a small in-memory fake Redis so they don't need a live Redis
server (CI doesn't provision one) but still exercise the exact same
ConnectionManager code — including the origin-tagging that prevents an
instance from double-delivering its own published events to itself.
"""

import asyncio
import json


from core.models import WSEvent, WSEventType
from services.ws_manager import ConnectionManager


class FakePubSub:
    def __init__(self, hub):
        self.hub = hub
        self.queue = asyncio.Queue()
        hub.subscribers.append(self.queue)

    async def psubscribe(self, pattern):
        pass

    async def punsubscribe(self, pattern):
        pass

    async def listen(self):
        while True:
            message = await self.queue.get()
            if message is None:
                return
            yield message

    async def aclose(self):
        pass


class FakeRedisHub:
    """Shared in-memory bus standing in for a real Redis pub/sub channel."""

    def __init__(self):
        self.subscribers = []

    async def publish(self, channel, data):
        for queue in self.subscribers:
            await queue.put(
                {"type": "pmessage", "pattern": "build:*", "channel": channel, "data": data}
            )
        return len(self.subscribers)

    def pubsub(self):
        return FakePubSub(self)


class FakeWebSocket:
    def __init__(self):
        self.sent = []

    async def send_text(self, data):
        self.sent.append(data)


async def _make_manager(hub: FakeRedisHub) -> ConnectionManager:
    manager = ConnectionManager()

    async def _get_redis():
        return hub

    manager._get_redis = _get_redis
    return manager


async def test_same_process_emit_still_delivers_directly():
    """Sanity check: emit() must still reach a connection in its own process
    without needing the pub/sub round trip at all.
    """
    hub = FakeRedisHub()
    manager = await _make_manager(hub)
    ws = FakeWebSocket()
    await manager.connect(ws, "build-1")

    await manager.emit(WSEvent(type=WSEventType.BUILD_START, build_id="build-1", data={}))

    assert len(ws.sent) == 1
    assert json.loads(ws.sent[0])["build_id"] == "build-1"


async def test_worker_process_event_reaches_web_process_connection():
    """The actual bug: an event emitted by a *different* ConnectionManager
    instance (standing in for the Celery worker process) must reach a
    WebSocket connection registered on *this* instance (standing in for the
    FastAPI web process) via the Redis pub/sub bridge.
    """
    hub = FakeRedisHub()
    worker_manager = await _make_manager(hub)
    web_manager = await _make_manager(hub)

    ws = FakeWebSocket()
    await web_manager.connect(ws, "build-2")

    listener = asyncio.create_task(web_manager.start_pubsub_listener())
    try:
        await asyncio.sleep(0.05)  # let psubscribe register before publishing

        await worker_manager.emit(
            WSEvent(type=WSEventType.AGENT_START, build_id="build-2", data={"agent": "architect"})
        )

        await asyncio.sleep(0.05)  # let the listener task drain the queue

        assert len(ws.sent) == 1
        event = json.loads(ws.sent[0])
        assert event["build_id"] == "build-2"
        assert event["data"] == {"agent": "architect"}
    finally:
        listener.cancel()
        try:
            await listener
        except asyncio.CancelledError:
            pass


async def test_own_published_event_is_not_delivered_twice():
    """_publish() delivers directly to same-process connections *and*
    publishes to Redis. Without origin-tagging, a process's own pub/sub
    listener would receive its own publish back and deliver it a second
    time. Every event must reach each connection exactly once.
    """
    hub = FakeRedisHub()
    manager = await _make_manager(hub)
    ws = FakeWebSocket()
    await manager.connect(ws, "build-3")

    listener = asyncio.create_task(manager.start_pubsub_listener())
    try:
        await asyncio.sleep(0.05)

        await manager.emit(WSEvent(type=WSEventType.BUILD_START, build_id="build-3", data={}))

        await asyncio.sleep(0.05)

        assert len(ws.sent) == 1
    finally:
        listener.cancel()
        try:
            await listener
        except asyncio.CancelledError:
            pass
