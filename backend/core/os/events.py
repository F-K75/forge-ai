"""Session event log + multi-worker fan-out for the ``forge-os/1`` stream.

* **Ordering.** ``seq`` is allocated per session by an atomic ``$inc`` on
  ``os_sessions.seq_counter`` (``find_one_and_update``), so it is monotonic
  across every worker.
* **Durability.** Every event except ``heartbeat`` is validated against the
  shared contract, then appended to ``os_events`` (unique ``(session_id, seq)``)
  *before* it is published. The log is the replay source.
* **Fan-out.** After the append the event is delivered to this process's local
  SSE queues and published on Redis ``os:session:{id}``. A per-process
  ``psubscribe("os:session:*")`` listener (the ``services/ws_manager.py``
  pattern) delivers events published by other workers to local queues.
  Messages carry the publishing process id so a process ignores its own echo.
* **Gaps.** A subscriber that sees ``seq`` jump (pub/sub dropped, queue full,
  a concurrent writer persisted out of order) refills the gap from the log.
  Idle subscribers re-poll the log every heartbeat, so a missed pub/sub
  message is recovered within one heartbeat interval.
* **Replay.** ``stream`` replays ``seq > after_seq`` from the log, then tails.
  Heartbeats repeat the last seq and are never stored.
"""

from __future__ import annotations

import asyncio
import json
import logging
import secrets
import time
from typing import Any, AsyncIterator, Awaitable, Callable, Dict, List, Optional, Set

from pymongo import ReturnDocument

from core.os.common import EVENTS, SESSIONS, iso, utc_now
from core.os_contracts import OS_EVENT_ADAPTER, OS_PROTOCOL_VERSION, os_event_to_sse, validate_os_event

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "os:session:"
CHANNEL_PATTERN = "os:session:*"
HEARTBEAT_SECONDS = 15.0
# Bound one SSE connection's lifetime; the client resumes with Last-Event-ID.
STREAM_MAX_SECONDS = 30 * 60
GAP_RETRY_SECONDS = 0.25
REPLAY_PAGE = 500
LOCAL_QUEUE_MAX = 1000


class EventValidationError(ValueError):
    """An event failed contract validation and was not emitted."""


class EventLog:
    def __init__(self, db):
        self.sessions = db[SESSIONS]
        self.events = db[EVENTS]

    async def allocate_seq(self, session_id: str) -> int:
        doc = await self.sessions.find_one_and_update(
            {"id": session_id},
            {"$inc": {"seq_counter": 1}},
            projection={"_id": 0, "seq_counter": 1},
            return_document=ReturnDocument.AFTER,
        )
        if doc is None:
            raise LookupError(f"session {session_id} not found")
        return int(doc["seq_counter"])

    async def current_seq(self, session_id: str) -> int:
        doc = await self.sessions.find_one({"id": session_id}, {"_id": 0, "seq_counter": 1})
        return int((doc or {}).get("seq_counter") or 0)

    async def append(self, event: Dict[str, Any], *, user_id: str) -> None:
        await self.events.insert_one(
            {
                "session_id": event["session_id"],
                "user_id": user_id,
                "seq": event["seq"],
                "turn_id": event.get("turn_id"),
                "type": event["type"],
                "event": event,
                # datetime (not string) so the 30-day TTL index applies.
                "created_at": utc_now(),
            }
        )

    async def read_after(
        self, session_id: str, user_id: str, after_seq: int, *, upto: Optional[int] = None, limit: int = REPLAY_PAGE
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {"session_id": session_id, "user_id": user_id, "seq": {"$gt": after_seq}}
        if upto is not None:
            query["seq"]["$lte"] = upto
        cursor = self.events.find(query, {"_id": 0, "event": 1, "seq": 1}).sort([("seq", 1)]).limit(limit)
        docs = await cursor.to_list(length=limit)
        return [d["event"] for d in docs]


RedisGetter = Callable[[], Awaitable[Any]]


class EventBus:
    """Per-process fan-out: local SSE queues + Redis pub/sub between workers."""

    def __init__(self, redis_getter: Optional[RedisGetter] = None):
        self._redis_getter = redis_getter
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
        self._listener: Optional[asyncio.Task] = None
        self.instance_id = secrets.token_hex(8)

    # -- local -------------------------------------------------------------- #

    def subscribe(self, session_id: str) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=LOCAL_QUEUE_MAX)
        self._subscribers.setdefault(session_id, set()).add(queue)
        self.ensure_listener()
        return queue

    def unsubscribe(self, session_id: str, queue: asyncio.Queue) -> None:
        subs = self._subscribers.get(session_id)
        if subs is None:
            return
        subs.discard(queue)
        if not subs:
            self._subscribers.pop(session_id, None)

    def subscriber_count(self, session_id: str) -> int:
        return len(self._subscribers.get(session_id, ()))

    def deliver_local(self, session_id: str, event: Dict[str, Any]) -> None:
        for queue in list(self._subscribers.get(session_id, ())):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # The subscriber refills the gap from the log when it catches up.
                logger.debug("OS stream queue full for session %s; subscriber will replay", session_id)

    # -- cross-worker ------------------------------------------------------- #

    async def publish(self, session_id: str, event: Dict[str, Any]) -> None:
        self.deliver_local(session_id, event)
        if self._redis_getter is None:
            return
        try:
            redis = await self._redis_getter()
            payload = json.dumps({"o": self.instance_id, "e": event}, separators=(",", ":"), default=str)
            await redis.publish(f"{CHANNEL_PREFIX}{session_id}", payload)
        except Exception:
            # Fail open: other workers' subscribers recover from the log on
            # their next heartbeat poll.
            logger.debug("OS stream Redis publish failed for session %s", session_id, exc_info=True)

    def handle_pubsub_message(self, message: Dict[str, Any]) -> None:
        if not isinstance(message, dict) or message.get("type") not in ("pmessage", "message"):
            return
        channel = message.get("channel")
        if isinstance(channel, bytes):
            channel = channel.decode("utf-8", "replace")
        data = message.get("data")
        if isinstance(data, bytes):
            data = data.decode("utf-8", "replace")
        if not isinstance(channel, str) or not channel.startswith(CHANNEL_PREFIX) or not isinstance(data, str):
            return
        try:
            body = json.loads(data)
        except ValueError:
            return
        if not isinstance(body, dict) or body.get("o") == self.instance_id:
            return
        event = body.get("e")
        session_id = channel[len(CHANNEL_PREFIX):]
        if not isinstance(event, dict) or event.get("session_id") != session_id:
            return
        self.deliver_local(session_id, event)

    def ensure_listener(self) -> None:
        if self._redis_getter is None:
            return
        if self._listener is not None and not self._listener.done():
            return
        try:
            self._listener = asyncio.get_running_loop().create_task(self._listen())
        except RuntimeError:  # no running loop (sync context)
            self._listener = None

    async def _listen(self) -> None:
        backoff = 1.0
        while True:
            pubsub = None
            try:
                redis = await self._redis_getter()  # type: ignore[misc]
                pubsub = redis.pubsub()
                await pubsub.psubscribe(CHANNEL_PATTERN)
                backoff = 1.0
                while True:
                    message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                    if message is not None:
                        self.handle_pubsub_message(message)
                    elif not self._subscribers:
                        await asyncio.sleep(0.05)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("OS stream pub/sub listener error, retrying in %.0fs: %s", backoff, exc)
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)
            finally:
                if pubsub is not None:
                    try:
                        await pubsub.punsubscribe(CHANNEL_PATTERN)
                        await pubsub.aclose()
                    except Exception:
                        pass

    async def aclose(self) -> None:
        if self._listener is not None:
            self._listener.cancel()
            try:
                await self._listener
            except BaseException:
                pass
            self._listener = None


def heartbeat_event(session_id: str, last_seq: int) -> Dict[str, Any]:
    return {
        "v": OS_PROTOCOL_VERSION,
        "seq": max(0, last_seq),
        "session_id": session_id,
        "turn_id": None,
        "ts": iso(),
        "type": "heartbeat",
        "data": {},
    }


def to_sse(event: Dict[str, Any]) -> str:
    """Frame through the contract model + ``os_event_to_sse`` (``id`` = seq)."""
    return os_event_to_sse(OS_EVENT_ADAPTER.validate_python(event))


class SessionEvents:
    """Emit and stream ``OsEvent``s for sessions."""

    def __init__(self, log: EventLog, bus: EventBus):
        self.log = log
        self.bus = bus

    async def emit(
        self,
        *,
        session_id: str,
        user_id: str,
        turn_id: Optional[str],
        type: str,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        event = {
            "v": OS_PROTOCOL_VERSION,
            "seq": 0,
            "session_id": session_id,
            "turn_id": turn_id,
            "ts": iso(),
            "type": type,
            "data": data,
        }
        errors = validate_os_event(event)
        if errors:
            # Never stream (or persist) something the client would reject.
            logger.warning("Dropping invalid OS event %s for session %s: %s", type, session_id, errors[:5])
            raise EventValidationError("; ".join(errors[:5]))
        event["seq"] = await self.log.allocate_seq(session_id)
        await self.log.append(event, user_id=user_id)
        await self.bus.publish(session_id, event)
        return event

    async def stream(
        self,
        *,
        session_id: str,
        user_id: str,
        after_seq: int = 0,
        heartbeat_seconds: float = HEARTBEAT_SECONDS,
        max_seconds: float = STREAM_MAX_SECONDS,
    ) -> AsyncIterator[Dict[str, Any]]:
        """Yield events with ``seq > after_seq`` in order: replay from the log, then live.

        The caller must already have authorised ``user_id`` for ``session_id``;
        the log query is scoped by both regardless.
        """
        queue = self.bus.subscribe(session_id)  # before replay, so nothing slips between
        last = max(0, int(after_seq))
        deadline = time.monotonic() + max_seconds
        try:
            async for ev in self._catch_up(session_id, user_id, last, None):
                last = ev["seq"]
                yield ev
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return
                try:
                    ev = await asyncio.wait_for(queue.get(), timeout=min(heartbeat_seconds, remaining))
                except asyncio.TimeoutError:
                    # Recover anything a dropped pub/sub message hid from us.
                    caught = False
                    async for past in self._catch_up(session_id, user_id, last, None):
                        last = past["seq"]
                        caught = True
                        yield past
                    if not caught and time.monotonic() < deadline:
                        yield heartbeat_event(session_id, last)
                    continue
                seq = int(ev.get("seq") or 0)
                if seq <= last:
                    continue
                if seq > last + 1:
                    async for past in self._catch_up(session_id, user_id, last, seq - 1):
                        last = past["seq"]
                        yield past
                    if seq <= last:
                        continue
                last = seq
                yield ev
        finally:
            self.bus.unsubscribe(session_id, queue)

    async def _catch_up(
        self, session_id: str, user_id: str, after: int, upto: Optional[int]
    ) -> AsyncIterator[Dict[str, Any]]:
        """Read the log after ``after`` (optionally up to ``upto``), contiguously.

        A hole means an event was allocated but not yet persisted (a concurrent
        writer); wait once, briefly, then accept the hole (it may also be an
        event that aged out of the 30-day replay window).
        """
        last = after
        waited = False
        while True:
            batch = await self.log.read_after(session_id, user_id, last, upto=upto)
            if not batch:
                return
            hole = False
            for ev in batch:
                if ev["seq"] != last + 1 and not waited:
                    hole = True
                    break
                last = ev["seq"]
                yield ev
            if hole:
                waited = True
                await asyncio.sleep(GAP_RETRY_SECONDS)
                continue
            waited = False
            if len(batch) < REPLAY_PAGE:
                return
