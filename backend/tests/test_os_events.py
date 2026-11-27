"""WS-C: event log (atomic per-session seq, persistence, replay) and multi-worker fan-out."""

from __future__ import annotations

import asyncio
import json

import pytest

from core.os import events as events_module
from core.os.events import EventBus, EventLog, EventValidationError, SessionEvents, to_sse
from core.os.sessions import SessionRepository
from core.os_contracts import validate_os_event
from tests.os_fakes import FakeRedis, FakeRedisBroker, indexed_db


@pytest.fixture
async def db():
    return await indexed_db()


async def _session(db, user="alice"):
    return await SessionRepository(db).create(user_id=user, title="t")


def _events(db, redis=None):
    async def _get():
        return redis

    return SessionEvents(EventLog(db), EventBus(_get if redis is not None else None))


async def _emit_text(ev: SessionEvents, sid: str, user: str = "alice", text: str = "hi"):
    return await ev.emit(
        session_id=sid,
        user_id=user,
        turn_id="turn_1",
        type="text.completed",
        data={"message_id": "msg_1", "text": text, "format": "plain"},
    )


async def test_seq_is_atomic_and_monotonic_under_concurrency(db):
    s = await _session(db)
    ev = _events(db)
    emitted = await asyncio.gather(*(_emit_text(ev, s["id"], text=str(i)) for i in range(50)))
    seqs = sorted(e["seq"] for e in emitted)
    assert seqs == list(range(1, 51))
    stored = await EventLog(db).read_after(s["id"], "alice", 0)
    assert [e["seq"] for e in stored] == list(range(1, 51))
    for e in stored:
        assert validate_os_event(e) == []
    # the TTL'd timestamp is a datetime (TTL indexes ignore strings)
    raw = db["os_events"].docs[0]
    assert raw["created_at"].tzinfo is not None
    names = {i["name"] for i in db["os_events"].indexes}
    assert {"os_events_session_seq", "os_events_ttl"} <= names


async def test_invalid_event_is_rejected_and_consumes_no_seq(db):
    s = await _session(db)
    ev = _events(db)
    with pytest.raises(EventValidationError):
        await ev.emit(session_id=s["id"], user_id="alice", turn_id="t", type="text.completed", data={"text": 5})
    with pytest.raises(EventValidationError):
        # a2ui component outside the catalog never reaches the log
        await ev.emit(
            session_id=s["id"],
            user_id="alice",
            turn_id="t",
            type="a2ui.message",
            data={
                "message": {
                    "version": "1.0",
                    "createSurface": {
                        "surfaceId": "srf",
                        "catalogId": "urn:forge:a2ui:catalog:ember:1",
                        "components": [{"id": "x", "component": "Script", "src": "evil"}],
                    },
                }
            },
        )
    assert db["os_events"].docs == []
    assert (await _emit_text(ev, s["id"]))["seq"] == 1


async def test_replay_after_seq_then_live_tail_and_heartbeat(db):
    s = await _session(db)
    ev = _events(db)
    for i in range(3):
        await _emit_text(ev, s["id"], text=str(i))

    got = []

    async def consume():
        async for e in ev.stream(session_id=s["id"], user_id="alice", after_seq=1, heartbeat_seconds=0.05, max_seconds=0.6):
            got.append(e)

    task = asyncio.create_task(consume())
    await asyncio.sleep(0.15)
    await _emit_text(ev, s["id"], text="live")
    await task
    real = [e for e in got if e["type"] != "heartbeat"]
    assert [e["seq"] for e in real] == [2, 3, 4]
    beats = [e for e in got if e["type"] == "heartbeat"]
    assert beats, "idle stream must heartbeat"
    assert all(b["seq"] in (3, 4) for b in beats)  # heartbeats repeat the last seq
    assert all(validate_os_event(b) == [] for b in beats)
    assert len(db["os_events"].docs) == 4  # heartbeats are never stored
    frame = to_sse(real[0])
    assert frame.startswith("id: 2\nevent: text.completed\ndata: ")


async def test_stream_never_returns_another_users_events(db):
    s = await _session(db)
    ev = _events(db)
    await _emit_text(ev, s["id"])
    got = [e async for e in ev.stream(session_id=s["id"], user_id="mallory", heartbeat_seconds=0.05, max_seconds=0.12)]
    assert [e for e in got if e["type"] != "heartbeat"] == []


async def test_cross_worker_fanout_via_redis_psubscribe(db):
    broker = FakeRedisBroker()
    worker_a = _events(db, FakeRedis(broker))
    worker_b = _events(db, FakeRedis(broker))
    s = await _session(db)

    got = []

    async def consume():
        async for e in worker_b.stream(session_id=s["id"], user_id="alice", heartbeat_seconds=5, max_seconds=1.0):
            got.append(e)
            if e["seq"] == 2:
                return

    task = asyncio.create_task(consume())
    await asyncio.sleep(0.1)  # listener psubscribed
    await _emit_text(worker_a, s["id"], text="one")
    await _emit_text(worker_a, s["id"], text="two")
    await asyncio.wait_for(task, 2)
    assert [e["seq"] for e in got] == [1, 2]
    redis_a = await worker_a.bus._redis_getter()
    channel, payload = redis_a.published[0]
    assert channel == f"os:session:{s['id']}"
    assert json.loads(payload)["o"] == worker_a.bus.instance_id
    await worker_a.bus.aclose()
    await worker_b.bus.aclose()


async def test_own_echo_is_ignored(db):
    bus = EventBus(None)
    q = bus.subscribe("ses_1")
    bus.handle_pubsub_message(
        {"type": "pmessage", "channel": "os:session:ses_1", "data": json.dumps({"o": bus.instance_id, "e": {"session_id": "ses_1", "seq": 1}})}
    )
    assert q.empty()
    bus.handle_pubsub_message(
        {"type": "pmessage", "channel": "os:session:ses_1", "data": json.dumps({"o": "other", "e": {"session_id": "ses_2", "seq": 1}})}
    )
    assert q.empty()  # channel/session mismatch is dropped
    bus.handle_pubsub_message({"type": "pmessage", "channel": "os:session:ses_1", "data": "not json"})
    assert q.empty()


async def test_redis_down_other_worker_recovers_from_log_on_heartbeat(db):
    broker = FakeRedisBroker()
    worker_a = _events(db, FakeRedis(broker, fail=True))
    worker_b = _events(db, FakeRedis(broker))
    s = await _session(db)
    got = []

    async def consume():
        async for e in worker_b.stream(session_id=s["id"], user_id="alice", heartbeat_seconds=0.05, max_seconds=1.0):
            if e["type"] != "heartbeat":
                got.append(e)
                return

    task = asyncio.create_task(consume())
    await asyncio.sleep(0.05)
    await _emit_text(worker_a, s["id"])  # publish fails open; event is in the log
    await asyncio.wait_for(task, 2)
    assert [e["seq"] for e in got] == [1]
    await worker_b.bus.aclose()


async def test_gap_is_refilled_from_log(db, monkeypatch):
    monkeypatch.setattr(events_module, "GAP_RETRY_SECONDS", 0.01)
    s = await _session(db)
    ev = _events(db)
    # seq 1 and 2 are persisted but only seq 2 reaches the local queue.
    original = ev.bus.deliver_local
    dropped = []

    def flaky(session_id, event):
        if event["seq"] == 1:
            dropped.append(event)
            return
        original(session_id, event)

    got = []

    async def consume():
        async for e in ev.stream(session_id=s["id"], user_id="alice", heartbeat_seconds=5, max_seconds=1.0):
            got.append(e["seq"])
            if e["seq"] == 2:
                return

    task = asyncio.create_task(consume())
    await asyncio.sleep(0.02)
    monkeypatch.setattr(ev.bus, "deliver_local", flaky)
    await _emit_text(ev, s["id"])
    await _emit_text(ev, s["id"])
    await asyncio.wait_for(task, 2)
    assert dropped and got == [1, 2]
