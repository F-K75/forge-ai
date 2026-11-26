"""Durable, multi-worker-safe state for inbound A2A tasks.

`A2AGateway` (core/a2a_adapter.py) keeps inbound A2A task state behind the
`A2ATaskStore` interface so every API worker sees the same tasks:

- `InMemoryA2ATaskStore`: single-process store (tests / local dev). Retains at
  most `max_records` records, evicting the oldest non-running ones.
- `MongoA2ATaskStore`: MongoDB collections `a2a_tasks` (unique index on
  `(project_id, task_id)`, TTL index on `expires_at` for retention) and
  `a2a_task_slots` (fixed set of concurrency slot documents).

Cross-worker guarantees:

- Idempotent create: `create_if_absent` is a single atomic insert guarded by
  the unique index, so two workers receiving the same task id cannot both win.
- Global concurrency: a run must hold one of N slot documents, claimed with an
  atomic `find_one_and_update` (free or lease-expired slot). Slots carry a lease
  that the running worker renews, so a crashed worker's slots free themselves.
- Cancellation / ownership: running records carry `worker_id` and
  `lease_expires_at`; the owning worker renews the lease (heartbeat) and reads
  `cancel_requested` back on every renewal.
- Recovery: `reap_stale` marks `submitted`/`working` records whose owner's
  lease expired as `failed` (never re-run: that would double LLM spend).

Records are plain dicts (the `A2ATaskResponse` fields plus the bookkeeping
fields above). Lease timestamps are epoch seconds (floats) supplied by the
caller so tests can drive time deterministically.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import os
import socket
import uuid
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, FrozenSet, Iterable, List, Optional, Tuple

logger = logging.getLogger(__name__)

A2A_TASKS_COLLECTION = "a2a_tasks"
A2A_TASK_SLOTS_COLLECTION = "a2a_task_slots"
DEFAULT_RETENTION_SECONDS = 7 * 24 * 3600
REAPABLE_STATES: FrozenSet[str] = frozenset({"submitted", "working"})
STALE_LEASE_REASON = (
    "Task interrupted: the Forge worker running it stopped heartbeating (restart or crash). "
    "It was not re-run automatically to avoid duplicate LLM spend; resubmit with a new task id."
)

Key = Tuple[str, str]


def make_worker_id() -> str:
    """Process-unique worker identity (host:pid:nonce)."""
    try:
        host = socket.gethostname()[:64]
    except Exception:  # pragma: no cover - defensive
        host = "host"
    return f"{host}:{os.getpid()}:{uuid.uuid4().hex[:8]}"


def _utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class A2ATaskStore:
    """Interface for inbound A2A task state shared by all gateway workers."""

    async def get(self, project_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        raise NotImplementedError

    async def create_if_absent(self, record: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
        """Atomically insert `record` unless (project_id, task_id) exists.

        Returns `(stored_record, created)`; when `created` is False the
        existing record is returned untouched.
        """
        raise NotImplementedError

    async def put(self, record: Dict[str, Any]) -> None:
        """Insert or replace a record (legacy REST path with server-made ids)."""
        raise NotImplementedError

    async def update(
        self,
        project_id: str,
        task_id: str,
        fields: Dict[str, Any],
        *,
        unless_states: Iterable[str] = (),
        worker_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Conditionally `$set` fields; returns the updated record or None if no match.

        `unless_states`: skip when the current state is one of these.
        `worker_id`: only update when the record is owned by this worker.
        """
        raise NotImplementedError

    async def reap_stale(
        self, now: float, *, project_id: Optional[str] = None, task_id: Optional[str] = None
    ) -> int:
        """Mark owned `submitted`/`working` records with an expired lease as failed."""
        raise NotImplementedError

    async def acquire_slot(
        self, holder: str, worker_id: str, *, limit: int, now: float, lease_until: float
    ) -> Optional[str]:
        """Claim one of `limit` global run slots; returns the slot id or None if all busy."""
        raise NotImplementedError

    async def renew_slot(self, slot_id: str, holder: str, worker_id: str, *, lease_until: float) -> bool:
        raise NotImplementedError

    async def release_slot(self, slot_id: str, holder: str, worker_id: str) -> None:
        raise NotImplementedError

    async def count_running(self, now: float) -> int:
        """Slots currently held under a live lease (observability / tests)."""
        raise NotImplementedError


def _stale_update() -> Dict[str, Any]:
    return {
        "state": "failed",
        "summary": STALE_LEASE_REASON,
        "failure_reason": "worker_lease_expired",
        "updated_at": _utc_iso(),
    }


def is_stale_record(rec: Dict[str, Any], now: float) -> bool:
    return (
        rec.get("state") in REAPABLE_STATES
        and rec.get("worker_id") is not None
        and float(rec.get("lease_expires_at") or 0.0) < now
    )


# --------------------------------------------------------------------------- #
# In-memory store
# --------------------------------------------------------------------------- #


class InMemoryA2ATaskStore(A2ATaskStore):
    """Process-local store. Shared between gateways in one process (tests)."""

    def __init__(self, *, max_records: int = 1000) -> None:
        self.max_records = max(1, int(max_records))
        self._records: "OrderedDict[Key, Dict[str, Any]]" = OrderedDict()
        # slot_id -> (holder, worker_id, lease_until)
        self._slots: Dict[str, Tuple[str, str, float]] = {}
        self._lock = asyncio.Lock()

    @staticmethod
    def _key(rec: Dict[str, Any]) -> Key:
        return (str(rec["project_id"]), str(rec["task_id"]))

    def _evict(self) -> None:
        while len(self._records) > self.max_records:
            victim = next(
                (k for k, v in self._records.items() if v.get("state") != "working"),
                None,
            )
            if victim is None:
                break
            self._records.pop(victim, None)

    async def get(self, project_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        rec = self._records.get((project_id, task_id))
        return copy.deepcopy(rec) if rec is not None else None

    async def create_if_absent(self, record: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
        key = self._key(record)
        existing = self._records.get(key)
        if existing is not None:
            return copy.deepcopy(existing), False
        self._records[key] = copy.deepcopy(record)
        self._evict()
        return copy.deepcopy(record), True

    async def put(self, record: Dict[str, Any]) -> None:
        key = self._key(record)
        self._records[key] = copy.deepcopy(record)
        self._records.move_to_end(key)
        self._evict()

    async def update(
        self,
        project_id: str,
        task_id: str,
        fields: Dict[str, Any],
        *,
        unless_states: Iterable[str] = (),
        worker_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        rec = self._records.get((project_id, task_id))
        if rec is None:
            return None
        if rec.get("state") in set(unless_states):
            return None
        if worker_id is not None and rec.get("worker_id") != worker_id:
            return None
        rec.update(copy.deepcopy(fields))
        return copy.deepcopy(rec)

    async def reap_stale(
        self, now: float, *, project_id: Optional[str] = None, task_id: Optional[str] = None
    ) -> int:
        count = 0
        for (pid, tid), rec in self._records.items():
            if project_id is not None and pid != project_id:
                continue
            if task_id is not None and tid != task_id:
                continue
            if is_stale_record(rec, now):
                rec.update(_stale_update())
                count += 1
        return count

    async def acquire_slot(
        self, holder: str, worker_id: str, *, limit: int, now: float, lease_until: float
    ) -> Optional[str]:
        async with self._lock:
            for sid, (_h, _w, until) in list(self._slots.items()):
                if until < now:
                    self._slots.pop(sid, None)
            if len(self._slots) >= max(1, int(limit)):
                return None
            sid = f"slot-{uuid.uuid4().hex[:12]}"
            self._slots[sid] = (holder, worker_id, lease_until)
            return sid

    async def renew_slot(self, slot_id: str, holder: str, worker_id: str, *, lease_until: float) -> bool:
        cur = self._slots.get(slot_id)
        if cur is None or cur[:2] != (holder, worker_id):
            return False
        self._slots[slot_id] = (holder, worker_id, lease_until)
        return True

    async def release_slot(self, slot_id: str, holder: str, worker_id: str) -> None:
        cur = self._slots.get(slot_id)
        if cur is not None and cur[:2] == (holder, worker_id):
            self._slots.pop(slot_id, None)

    async def count_running(self, now: float) -> int:
        return sum(1 for _h, _w, until in self._slots.values() if until >= now)


# --------------------------------------------------------------------------- #
# MongoDB store
# --------------------------------------------------------------------------- #


def _is_duplicate_key(exc: BaseException) -> bool:
    try:
        from pymongo.errors import DuplicateKeyError
    except Exception:  # pragma: no cover - pymongo is a hard dependency
        DuplicateKeyError = ()  # type: ignore[assignment]
    if DuplicateKeyError and isinstance(exc, DuplicateKeyError):
        return True
    return getattr(exc, "code", None) == 11000


def _return_after() -> Any:
    try:
        from pymongo import ReturnDocument

        return ReturnDocument.AFTER
    except Exception:  # pragma: no cover
        return True


class MongoA2ATaskStore(A2ATaskStore):
    """MongoDB-backed store (Motor `AsyncIOMotorDatabase` or compatible fake).

    Retention: every write stamps `expires_at = now + retention_seconds`; a TTL
    index on `expires_at` lets MongoDB delete old records (replaces the
    in-memory 1000-record cap). Running tasks are re-stamped on each heartbeat
    so they never expire while live.
    """

    def __init__(
        self,
        db: Any,
        *,
        retention_seconds: int = DEFAULT_RETENTION_SECONDS,
        slot_count: int = 8,
        tasks_collection: str = A2A_TASKS_COLLECTION,
        slots_collection: str = A2A_TASK_SLOTS_COLLECTION,
    ) -> None:
        self._db = db
        self._tasks = db[tasks_collection]
        self._slots = db[slots_collection]
        self.retention_seconds = max(60, int(retention_seconds))
        self._slot_count = max(1, int(slot_count))
        self._ready = False
        self._ready_lock = asyncio.Lock()

    def _expiry(self) -> datetime:
        return datetime.now(timezone.utc) + timedelta(seconds=self.retention_seconds)

    @staticmethod
    def _clean(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if doc is None:
            return None
        out = dict(doc)
        out.pop("_id", None)
        out.pop("expires_at", None)
        return out

    @staticmethod
    def _slot_ids(limit: int) -> List[str]:
        return [f"slot-{i}" for i in range(max(1, int(limit)))]

    async def ensure_indexes(self, *, slot_count: Optional[int] = None) -> None:
        """Create indexes and slot documents (idempotent)."""
        if slot_count is not None:
            self._slot_count = max(self._slot_count, int(slot_count))
        await self._tasks.create_index(
            [("project_id", 1), ("task_id", 1)], unique=True, name="a2a_task_project_task_unique"
        )
        await self._tasks.create_index("expires_at", expireAfterSeconds=0, name="a2a_task_ttl")
        await self._tasks.create_index(
            [("state", 1), ("lease_expires_at", 1)], name="a2a_task_state_lease"
        )
        for sid in self._slot_ids(self._slot_count):
            await self._slots.update_one(
                {"_id": sid},
                {"$setOnInsert": {"holder": None, "worker_id": None, "lease_expires_at": 0.0}},
                upsert=True,
            )
        self._ready = True

    async def _ensure_ready(self) -> None:
        if self._ready:
            return
        async with self._ready_lock:
            if not self._ready:
                await self.ensure_indexes()

    async def get(self, project_id: str, task_id: str) -> Optional[Dict[str, Any]]:
        await self._ensure_ready()
        return self._clean(await self._tasks.find_one({"project_id": project_id, "task_id": task_id}))

    async def create_if_absent(self, record: Dict[str, Any]) -> Tuple[Dict[str, Any], bool]:
        await self._ensure_ready()
        doc = dict(record)
        doc["expires_at"] = self._expiry()
        try:
            await self._tasks.insert_one(doc)
            return self._clean(doc) or {}, True
        except Exception as exc:
            if not _is_duplicate_key(exc):
                raise
        existing = await self.get(str(record["project_id"]), str(record["task_id"]))
        if existing is None:  # pragma: no cover - deleted between insert and read
            raise RuntimeError("A2A task vanished after duplicate-key insert")
        return existing, False

    async def put(self, record: Dict[str, Any]) -> None:
        await self._ensure_ready()
        doc = dict(record)
        doc["expires_at"] = self._expiry()
        await self._tasks.update_one(
            {"project_id": record["project_id"], "task_id": record["task_id"]},
            {"$set": doc},
            upsert=True,
        )

    async def update(
        self,
        project_id: str,
        task_id: str,
        fields: Dict[str, Any],
        *,
        unless_states: Iterable[str] = (),
        worker_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        await self._ensure_ready()
        query: Dict[str, Any] = {"project_id": project_id, "task_id": task_id}
        blocked = sorted(set(unless_states))
        if blocked:
            query["state"] = {"$nin": blocked}
        if worker_id is not None:
            query["worker_id"] = worker_id
        updates = dict(fields)
        updates["expires_at"] = self._expiry()
        doc = await self._tasks.find_one_and_update(
            query, {"$set": updates}, return_document=_return_after()
        )
        return self._clean(doc)

    async def reap_stale(
        self, now: float, *, project_id: Optional[str] = None, task_id: Optional[str] = None
    ) -> int:
        await self._ensure_ready()
        query: Dict[str, Any] = {
            "state": {"$in": sorted(REAPABLE_STATES)},
            "worker_id": {"$ne": None},
            "lease_expires_at": {"$lt": float(now)},
        }
        if project_id is not None:
            query["project_id"] = project_id
        if task_id is not None:
            query["task_id"] = task_id
        updates = _stale_update()
        updates["expires_at"] = self._expiry()
        res = await self._tasks.update_many(query, {"$set": updates})
        return int(getattr(res, "modified_count", 0) or 0)

    async def acquire_slot(
        self, holder: str, worker_id: str, *, limit: int, now: float, lease_until: float
    ) -> Optional[str]:
        await self._ensure_ready()
        if int(limit) > self._slot_count:
            await self.ensure_indexes(slot_count=int(limit))
        doc = await self._slots.find_one_and_update(
            {
                "_id": {"$in": self._slot_ids(limit)},
                "$or": [{"holder": None}, {"lease_expires_at": {"$lt": float(now)}}],
            },
            {"$set": {"holder": holder, "worker_id": worker_id, "lease_expires_at": float(lease_until)}},
            return_document=_return_after(),
        )
        return str(doc["_id"]) if doc is not None else None

    async def renew_slot(self, slot_id: str, holder: str, worker_id: str, *, lease_until: float) -> bool:
        await self._ensure_ready()
        res = await self._slots.update_one(
            {"_id": slot_id, "holder": holder, "worker_id": worker_id},
            {"$set": {"lease_expires_at": float(lease_until)}},
        )
        return bool(getattr(res, "matched_count", 0))

    async def release_slot(self, slot_id: str, holder: str, worker_id: str) -> None:
        await self._ensure_ready()
        await self._slots.update_one(
            {"_id": slot_id, "holder": holder, "worker_id": worker_id},
            {"$set": {"holder": None, "worker_id": None, "lease_expires_at": 0.0}},
        )

    async def count_running(self, now: float) -> int:
        await self._ensure_ready()
        return int(
            await self._slots.count_documents(
                {"holder": {"$ne": None}, "lease_expires_at": {"$gte": float(now)}}
            )
        )


async def bootstrap_a2a_task_store(db: Any) -> Dict[str, Any]:
    """Startup hook: switch the A2A gateway singleton to MongoDB and reap stale tasks.

    Called from main.py's non-blocking background startup init after the
    MongoDB ping succeeds. Tasks left `submitted`/`working` by a worker whose
    lease expired (crash / redeploy) are marked `failed`; tasks owned by live
    workers keep renewing their lease and are untouched.
    """
    from core.a2a_adapter import get_a2a_gateway

    gw = get_a2a_gateway()
    store = gw.task_store
    if not isinstance(store, MongoA2ATaskStore):
        store = MongoA2ATaskStore(db, slot_count=gw.max_inflight)
        gw.attach_task_store(store)
    await store.ensure_indexes(slot_count=gw.max_inflight)
    reaped = await gw.reap_stale_tasks()
    if reaped:
        logger.warning("Marked %d orphaned A2A task(s) as failed (dead worker lease)", reaped)
    return {"store": type(store).__name__, "reaped": reaped, "worker_id": gw.worker_id}
