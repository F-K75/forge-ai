"""Durable, multi-worker A2A inbound task state (`core/a2a_task_store.py`).

Covers both store implementations (in-memory and MongoDB through a small
Motor-shaped fake, matching the hand-rolled fake-collection pattern used across
this suite) and simulates several API workers as separate `A2AGateway`
instances, each with its own AgentKernel and worker id, sharing one store.
"""

from __future__ import annotations

import asyncio
import copy
import sys
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest
from pymongo.errors import DuplicateKeyError

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import core.a2a_adapter as a2a_module  # noqa: E402
from core.a2a_adapter import A2AGateway  # noqa: E402
from core.a2a_task_store import (  # noqa: E402
    STALE_LEASE_REASON,
    InMemoryA2ATaskStore,
    MongoA2ATaskStore,
    bootstrap_a2a_task_store,
)
from core.agent_kernel import AgentKernel, KernelTask  # noqa: E402

PROJECT_ID = "proj_store"


# --------------------------------------------------------------------------- #
# Minimal Motor-compatible fake (only the operators the store uses)
# --------------------------------------------------------------------------- #


def _cmp(val: Any, op: str, arg: Any) -> bool:
    if op == "$in":
        return val in arg
    if op == "$nin":
        return val not in arg
    if op == "$ne":
        return val != arg
    if val is None:
        return False
    return {"$lt": val < arg, "$lte": val <= arg, "$gt": val > arg, "$gte": val >= arg}[op]


def _match(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    for key, cond in query.items():
        if key == "$or":
            if not any(_match(doc, sub) for sub in cond):
                return False
            continue
        val = doc.get(key)
        if isinstance(cond, dict) and cond and all(k.startswith("$") for k in cond):
            if not all(_cmp(val, op, arg) for op, arg in cond.items()):
                return False
        elif val != cond:
            return False
    return True


class FakeMongoCollection:
    def __init__(self) -> None:
        self.docs: List[Dict[str, Any]] = []
        self.indexes: List[Dict[str, Any]] = []
        self._unique: List[List[str]] = []
        self._next_id = 0

    async def create_index(self, keys, **kwargs):
        fields = [keys] if isinstance(keys, str) else [k for k, _ in keys]
        self.indexes.append({"fields": fields, **kwargs})
        if kwargs.get("unique"):
            self._unique.append(fields)
        return kwargs.get("name", "_".join(fields))

    def _check_unique(self, doc: Dict[str, Any], *, ignore: Optional[Dict[str, Any]] = None) -> None:
        for fields in self._unique:
            for other in self.docs:
                if other is ignore:
                    continue
                if all(other.get(f) == doc.get(f) for f in fields):
                    raise DuplicateKeyError("E11000 duplicate key error")

    async def insert_one(self, doc):
        new = copy.deepcopy(doc)
        if "_id" not in new:
            self._next_id += 1
            new["_id"] = f"oid{self._next_id}"
        if any(d["_id"] == new["_id"] for d in self.docs):
            raise DuplicateKeyError("E11000 duplicate _id")
        self._check_unique(new)
        self.docs.append(new)
        return SimpleNamespace(inserted_id=new["_id"])

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _match(d, query):
                return copy.deepcopy(d)
        return None

    def _upsert_doc(self, query, update):
        new = {k: v for k, v in query.items() if not k.startswith("$") and not isinstance(v, dict)}
        new.update(copy.deepcopy(update.get("$setOnInsert", {})))
        new.update(copy.deepcopy(update.get("$set", {})))
        return new

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if _match(d, query):
                d.update(copy.deepcopy(update.get("$set", {})))
                return SimpleNamespace(matched_count=1, modified_count=1, upserted_id=None)
        if upsert:
            res = await self.insert_one(self._upsert_doc(query, update))
            return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=res.inserted_id)
        return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=None)

    async def update_many(self, query, update):
        n = 0
        for d in self.docs:
            if _match(d, query):
                d.update(copy.deepcopy(update.get("$set", {})))
                n += 1
        return SimpleNamespace(matched_count=n, modified_count=n)

    async def find_one_and_update(self, query, update, return_document=False, upsert=False):
        for d in self.docs:
            if _match(d, query):
                before = copy.deepcopy(d)
                d.update(copy.deepcopy(update.get("$set", {})))
                return copy.deepcopy(d) if return_document else before
        return None

    async def count_documents(self, query):
        return sum(1 for d in self.docs if _match(d, query))


class FakeMongoDB:
    def __init__(self) -> None:
        self._cols: Dict[str, FakeMongoCollection] = {}

    def __getitem__(self, name: str) -> FakeMongoCollection:
        return self._cols.setdefault(name, FakeMongoCollection())

    def __getattr__(self, name: str) -> FakeMongoCollection:
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]


# --------------------------------------------------------------------------- #
# Fixtures / helpers
# --------------------------------------------------------------------------- #


@pytest.fixture(params=["memory", "mongo"])
def store(request):
    if request.param == "memory":
        return InMemoryA2ATaskStore()
    return MongoA2ATaskStore(FakeMongoDB(), slot_count=8)


class CountingKernel(AgentKernel):
    """Real kernel with a stub executor that counts started runs."""

    def __init__(self, delay: float = 0.0) -> None:
        async def _exec(task: KernelTask, _ctx, _dctx):
            self.tasks_executed += 1
            if delay:
                await asyncio.sleep(delay)
            return {"summary": f"{task.role} delivered.", "touched_files": [f"src/{task.id}.py"]}

        super().__init__(task_executor=_exec)
        self.runs_started = 0
        self.tasks_executed = 0

    async def execute_run(self, run, **kwargs):
        self.runs_started += 1
        return await super().execute_run(run, **kwargs)


def _worker(store, name: str, *, delay: float = 0.0, max_inflight: int = 8, **kw) -> A2AGateway:
    kw.setdefault("lease_ttl_seconds", 1.0)
    kw.setdefault("heartbeat_interval_seconds", 0.02)
    return A2AGateway(
        kernel=CountingKernel(delay),
        task_store=store,
        worker_id=name,
        max_inflight_tasks=max_inflight,
        **kw,
    )


def _rpc(method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}


def _send(task_id: str, **meta) -> Dict[str, Any]:
    params: Dict[str, Any] = {
        "id": task_id,
        "message": {"role": "user", "parts": [{"type": "text", "text": "Build an API endpoint with tests"}]},
    }
    if meta:
        params["metadata"] = meta
    return _rpc("tasks/send", params)


async def _state(gw: A2AGateway, task_id: str) -> Optional[str]:
    rec = await gw.get_task(project_id=PROJECT_ID, task_id=task_id)
    return rec.state if rec else None


async def _wait_state(gw: A2AGateway, task_id: str, states, timeout: float = 10.0) -> str:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        st = await _state(gw, task_id)
        if st in states:
            return st
        await asyncio.sleep(0.02)
    raise AssertionError(f"{task_id} never reached {states} (last={await _state(gw, task_id)})")


async def _drain(*gws: A2AGateway, timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    while any(gw._runners for gw in gws) and time.monotonic() < deadline:
        await asyncio.sleep(0.02)
    assert not any(gw._runners for gw in gws)


def _rec(task_id: str, **over) -> Dict[str, Any]:
    rec = {
        "project_id": PROJECT_ID,
        "task_id": task_id,
        "kernel_run_id": "run_x",
        "state": "working",
        "summary": "Executing",
        "wave_count": 1,
        "task_count": 1,
        "artifacts": [],
        "evaluations": [],
        "session_id": None,
        "caller_agent": "partner",
        "updated_at": "2026-01-01T00:00:00Z",
        "worker_id": "w1",
        "lease_expires_at": time.time() + 60,
        "cancel_requested": False,
        "plan_only": False,
    }
    rec.update(over)
    return rec


# --------------------------------------------------------------------------- #
# Store contract (both implementations)
# --------------------------------------------------------------------------- #


async def test_store_create_if_absent_is_idempotent(store):
    first, created = await store.create_if_absent(_rec("t1", summary="first"))
    assert created and first["summary"] == "first"
    second, created2 = await store.create_if_absent(_rec("t1", summary="second"))
    assert not created2 and second["summary"] == "first"
    # Same task id in another project is a different task
    _, created3 = await store.create_if_absent(_rec("t1", project_id="proj_other"))
    assert created3
    assert (await store.get(PROJECT_ID, "t1"))["summary"] == "first"
    assert await store.get(PROJECT_ID, "missing") is None


async def test_store_concurrent_creates_have_one_winner(store):
    results = await asyncio.gather(*(store.create_if_absent(_rec("race", worker_id=f"w{i}")) for i in range(6)))
    assert sum(1 for _, created in results if created) == 1
    winner = next(r for r, created in results if created)
    assert all(r["worker_id"] == winner["worker_id"] for r, _ in results)


async def test_store_conditional_update(store):
    await store.create_if_absent(_rec("t2"))
    assert await store.update(PROJECT_ID, "t2", {"summary": "x"}, worker_id="other") is None
    upd = await store.update(PROJECT_ID, "t2", {"summary": "x"}, worker_id="w1")
    assert upd["summary"] == "x"
    await store.update(PROJECT_ID, "t2", {"state": "canceled"})
    assert await store.update(PROJECT_ID, "t2", {"state": "completed"}, unless_states={"canceled"}) is None
    assert (await store.get(PROJECT_ID, "t2"))["state"] == "canceled"
    assert await store.update(PROJECT_ID, "nope", {"state": "failed"}) is None


async def test_store_reap_only_expired_owned_tasks(store):
    now = time.time()
    await store.create_if_absent(_rec("dead", worker_id="dead-w", lease_expires_at=now - 5))
    await store.create_if_absent(_rec("dead-sub", state="submitted", worker_id="dead-w", lease_expires_at=now - 5))
    await store.create_if_absent(_rec("live", worker_id="live-w", lease_expires_at=now + 30))
    await store.create_if_absent(_rec("plan", state="submitted", worker_id=None, lease_expires_at=None))
    await store.create_if_absent(_rec("done", state="completed", worker_id="dead-w", lease_expires_at=now - 5))

    assert await store.reap_stale(now) == 2
    dead = await store.get(PROJECT_ID, "dead")
    assert dead["state"] == "failed" and dead["summary"] == STALE_LEASE_REASON
    assert dead["failure_reason"] == "worker_lease_expired"
    assert (await store.get(PROJECT_ID, "dead-sub"))["state"] == "failed"
    assert (await store.get(PROJECT_ID, "live"))["state"] == "working"
    assert (await store.get(PROJECT_ID, "plan"))["state"] == "submitted"
    assert (await store.get(PROJECT_ID, "done"))["state"] == "completed"
    assert await store.reap_stale(now) == 0


async def test_store_slots_bound_global_concurrency(store):
    now = time.time()
    a = await store.acquire_slot("p/a", "w1", limit=2, now=now, lease_until=now + 30)
    b = await store.acquire_slot("p/b", "w2", limit=2, now=now, lease_until=now + 30)
    assert a and b and a != b
    assert await store.acquire_slot("p/c", "w1", limit=2, now=now, lease_until=now + 30) is None
    assert await store.count_running(now) == 2
    # Release is owner-checked
    await store.release_slot(a, "p/a", "intruder")
    assert await store.count_running(now) == 2
    await store.release_slot(a, "p/a", "w1")
    assert await store.acquire_slot("p/c", "w1", limit=2, now=now, lease_until=now + 30)
    # An expired (dead worker) slot lease is reclaimable; a renewed one is not
    later = now + 60
    assert await store.renew_slot(b, "p/b", "w2", lease_until=later + 30)
    assert await store.acquire_slot("p/d", "w3", limit=2, now=later, lease_until=later + 30)
    assert await store.acquire_slot("p/e", "w3", limit=2, now=later, lease_until=later + 30) is None


async def test_in_memory_store_retention_cap_keeps_running_tasks():
    store = InMemoryA2ATaskStore(max_records=3)
    await store.create_if_absent(_rec("run-1"))
    for i in range(5):
        await store.create_if_absent(_rec(f"done-{i}", state="completed"))
    assert await store.get(PROJECT_ID, "run-1") is not None
    assert await store.get(PROJECT_ID, "done-0") is None
    assert await store.get(PROJECT_ID, "done-4") is not None


async def test_mongo_store_indexes_and_ttl_retention():
    db = FakeMongoDB()
    store = MongoA2ATaskStore(db, retention_seconds=3600, slot_count=3)
    await store.ensure_indexes()
    await store.ensure_indexes()  # idempotent
    idx = db.a2a_tasks.indexes
    assert any(i["fields"] == ["project_id", "task_id"] and i.get("unique") for i in idx)
    assert any(i["fields"] == ["expires_at"] and i.get("expireAfterSeconds") == 0 for i in idx)
    assert sorted(d["_id"] for d in db.a2a_task_slots.docs) == ["slot-0", "slot-1", "slot-2"]

    await store.create_if_absent(_rec("ttl"))
    raw = db.a2a_tasks.docs[0]
    remaining = (raw["expires_at"] - __import__("datetime").datetime.now(__import__("datetime").timezone.utc))
    assert 3500 < remaining.total_seconds() <= 3600
    # Bookkeeping fields are not leaked back to callers
    got = await store.get(PROJECT_ID, "ttl")
    assert "_id" not in got and "expires_at" not in got


# --------------------------------------------------------------------------- #
# Two simulated workers sharing one store
# --------------------------------------------------------------------------- #


async def test_task_visible_from_other_worker(store):
    a, b = _worker(store, "worker-a"), _worker(store, "worker-b")
    sent = await a.handle_jsonrpc(_send("shared-1"), project_id=PROJECT_ID)
    assert sent["result"]["status"]["state"] == "working"
    got = await b.handle_jsonrpc(_rpc("tasks/get", {"id": "shared-1"}), project_id=PROJECT_ID)
    assert got["result"]["id"] == "shared-1"
    assert await _wait_state(b, "shared-1", {"completed"}) == "completed"
    # Not visible from another project through either worker
    other = await b.handle_jsonrpc(_rpc("tasks/get", {"id": "shared-1"}), project_id="proj_other")
    assert other["error"]["code"] == -32001
    await _drain(a, b)
    assert await a.running_count() == 0


async def test_duplicate_send_across_workers_starts_one_run(store):
    a, b = _worker(store, "worker-a", delay=0.05), _worker(store, "worker-b", delay=0.05)
    results = await asyncio.gather(
        a.handle_jsonrpc(_send("dup-1"), project_id=PROJECT_ID),
        b.handle_jsonrpc(_send("dup-1"), project_id=PROJECT_ID),
        a.handle_jsonrpc(_send("dup-1"), project_id=PROJECT_ID),
        b.handle_jsonrpc(_send("dup-1"), project_id=PROJECT_ID),
    )
    assert all(r["result"]["id"] == "dup-1" for r in results)
    assert len({r["result"]["metadata"]["kernelRunId"] for r in results}) == 1
    await _drain(a, b)
    assert a._kernel.runs_started + b._kernel.runs_started == 1
    assert await _state(a, "dup-1") == "completed"
    # Loser's slot was released and the winner's slot released on completion
    assert await a.running_count() == 0
    # Re-send after completion is still idempotent
    again = await b.handle_jsonrpc(_send("dup-1"), project_id=PROJECT_ID)
    assert again["result"]["status"]["state"] == "completed"
    assert a._kernel.runs_started + b._kernel.runs_started == 1


async def test_cancel_from_other_worker_stops_run(store):
    a = _worker(store, "worker-a", delay=1.0)
    b = _worker(store, "worker-b")
    await a.handle_jsonrpc(_send("cancel-x"), project_id=PROJECT_ID)
    await asyncio.sleep(0.05)
    assert a._runners, "worker A should be running the task"

    t0 = time.monotonic()
    canceled = await b.handle_jsonrpc(_rpc("tasks/cancel", {"id": "cancel-x"}), project_id=PROJECT_ID)
    assert canceled["result"]["status"]["state"] == "canceled"
    await _drain(a, timeout=5.0)
    # A's heartbeat saw the cancel and fired the kernel's cooperative cancel hook:
    # the in-flight first wave finishes (~1s), later waves (~2s more) never start.
    assert time.monotonic() - t0 < 1.8
    planned = canceled["result"]["metadata"]["taskCount"]
    assert 0 < a._kernel.tasks_executed < planned
    assert await _state(a, "cancel-x") == "canceled"
    assert await a.running_count() == 0
    # Terminal: cancel again from either worker is rejected
    again = await a.handle_jsonrpc(_rpc("tasks/cancel", {"id": "cancel-x"}), project_id=PROJECT_ID)
    assert again["error"]["code"] == -32002


async def test_global_concurrency_limit_across_workers(store):
    a = _worker(store, "worker-a", delay=0.3, max_inflight=2)
    b = _worker(store, "worker-b", delay=0.3, max_inflight=2)
    r1 = await a.handle_jsonrpc(_send("cc-1"), project_id=PROJECT_ID)
    r2 = await b.handle_jsonrpc(_send("cc-2"), project_id=PROJECT_ID)
    assert "result" in r1 and "result" in r2
    assert await a.running_count() == 2
    busy_a = await a.handle_jsonrpc(_send("cc-3"), project_id=PROJECT_ID)
    busy_b = await b.handle_jsonrpc(_send("cc-3"), project_id=PROJECT_ID)
    assert busy_a["error"]["code"] == -32000 and busy_b["error"]["code"] == -32000
    assert await _state(a, "cc-3") is None  # rejected sends leave no record
    # Plan-only tasks don't consume run slots
    plan = await b.handle_jsonrpc(_send("cc-plan", planOnly=True), project_id=PROJECT_ID)
    assert plan["result"]["status"]["state"] == "submitted"

    await _drain(a, b)
    assert await a.running_count() == 0
    ok = await b.handle_jsonrpc(_send("cc-3"), project_id=PROJECT_ID)
    assert ok["result"]["status"]["state"] == "working"
    await _drain(a, b)


async def test_restart_reaps_dead_worker_but_not_live_lease(store):
    live = _worker(store, "worker-live", delay=0.5, lease_ttl_seconds=0.5)
    await live.handle_jsonrpc(_send("live-task"), project_id=PROJECT_ID)
    # A worker that crashed: its record has an expired lease and nobody renews it
    now = time.time()
    await store.create_if_absent(_rec("orphan", worker_id="worker-crashed", lease_expires_at=now - 1))
    await store.create_if_absent(_rec("planned", state="submitted", worker_id=None, lease_expires_at=None))

    restarted = _worker(store, "worker-restarted")
    await asyncio.sleep(0.6)  # longer than the live lease TTL: only heartbeats keep it alive
    assert await restarted.reap_stale_tasks() == 1
    orphan = await restarted.get_task(project_id=PROJECT_ID, task_id="orphan")
    assert orphan.state == "failed" and "not re-run" in orphan.summary
    assert await _state(restarted, "live-task") == "working"
    assert await _state(restarted, "planned") == "submitted"

    await _drain(live)
    assert await _state(restarted, "live-task") == "completed"
    assert live._kernel.runs_started == 1  # nothing was re-run


async def test_reaped_task_stops_owner_and_is_not_overwritten(store):
    owner = _worker(store, "worker-owner", delay=1.0, lease_ttl_seconds=1.0)
    await owner.handle_jsonrpc(_send("hung"), project_id=PROJECT_ID)
    await asyncio.sleep(0.05)
    # Another worker whose clock is past the owner's lease (owner presumed dead)
    future = _worker(store, "worker-future", clock=lambda: time.time() + 120)
    got = await future.handle_jsonrpc(_rpc("tasks/get", {"id": "hung"}), project_id=PROJECT_ID)
    assert got["result"]["status"]["state"] == "failed"  # lazily reaped on read
    # The owner notices on its next heartbeat, stops, and keeps the failed state
    await _drain(owner, timeout=3.0)
    assert await _state(owner, "hung") == "failed"


async def test_get_lazily_reaps_expired_lease(store):
    gw = _worker(store, "worker-a")
    await store.create_if_absent(_rec("stale", worker_id="gone", lease_expires_at=time.time() - 1))
    assert await _state(gw, "stale") == "failed"
    canceled = await gw.handle_jsonrpc(_rpc("tasks/cancel", {"id": "stale"}), project_id=PROJECT_ID)
    assert canceled["error"]["code"] == -32002


# --------------------------------------------------------------------------- #
# Store selection & startup bootstrap
# --------------------------------------------------------------------------- #


async def test_store_selection_and_startup_bootstrap(monkeypatch):
    db = FakeMongoDB()
    explicit = A2AGateway(kernel=CountingKernel())
    explicit.ensure_db_task_store(db)
    assert isinstance(explicit.task_store, InMemoryA2ATaskStore)  # tests/dev stay in-memory

    auto = A2AGateway(kernel=CountingKernel(), auto_select_store=True)
    assert isinstance(auto.task_store, InMemoryA2ATaskStore)
    auto.ensure_db_task_store(db)
    assert isinstance(auto.task_store, MongoA2ATaskStore)

    singleton = A2AGateway(kernel=CountingKernel(), auto_select_store=True)
    monkeypatch.setattr(a2a_module, "_a2a_gateway", singleton)
    seeded = MongoA2ATaskStore(db)
    now = time.time()
    await seeded.create_if_absent(_rec("orphan", worker_id="old-pod", lease_expires_at=now - 1))
    await seeded.create_if_absent(_rec("alive", worker_id="other-pod", lease_expires_at=now + 30))

    info = await bootstrap_a2a_task_store(db)
    assert info["store"] == "MongoA2ATaskStore" and info["reaped"] == 1
    assert isinstance(singleton.task_store, MongoA2ATaskStore)
    assert (await singleton.get_task(project_id=PROJECT_ID, task_id="orphan")).state == "failed"
    assert (await singleton.get_task(project_id=PROJECT_ID, task_id="alive")).state == "working"
    assert len(db.a2a_task_slots.docs) == singleton.max_inflight
