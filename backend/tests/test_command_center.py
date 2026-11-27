"""Tests for the Command Center fleet summary (`GET /v1/command-center/summary`).

MongoDB is replaced by small in-memory fakes that understand the query
operators the summary uses ($in, $or, $gte, $lt, sort, limit, $match/$group);
the kernel and budget manager are stubbed. The clock is pinned via
``build_command_center_summary(now=...)``.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
import pytest
from fastapi import APIRouter, FastAPI

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import api.command_center as cc_api  # noqa: E402
import core.command_center as cc  # noqa: E402
from api.auth import get_current_user  # noqa: E402
from core.agent_kernel import KernelRun, KernelRunStatus, KernelTask, KernelTaskStatus  # noqa: E402
from core.models import User  # noqa: E402

NOW = datetime(2026, 11, 27, 15, 0, 0, tzinfo=timezone.utc)
ME = "user-me"
ORG = "org-mine"


def ts(delta: timedelta) -> str:
    return cc.iso(NOW + delta)


def naive(delta: timedelta) -> datetime:
    return (NOW + delta).replace(tzinfo=None)


H = timedelta(hours=1)
M = timedelta(minutes=1)


# --------------------------------------------------------------------------- #
# Fakes
# --------------------------------------------------------------------------- #


def _cmp(a: Any, b: Any) -> Any:
    # Normalise aware/naive datetimes so comparisons behave like Mongo's.
    if isinstance(a, datetime) and isinstance(b, datetime):
        return cc.parse_ts(a), cc.parse_ts(b)
    return a, b


def _match_value(value: Any, cond: Any) -> bool:
    if isinstance(cond, dict) and any(k.startswith("$") for k in cond):
        for op, arg in cond.items():
            if op == "$in":
                if value not in arg:
                    return False
            elif op in ("$gte", "$lt"):
                if value is None:
                    return False
                a, b = _cmp(value, arg)
                if op == "$gte" and not a >= b:
                    return False
                if op == "$lt" and not a < b:
                    return False
            else:  # pragma: no cover - guard against silently-ignored operators
                raise AssertionError(f"FakeCollection: unsupported operator {op}")
        return True
    return value == cond


def matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    for key, cond in query.items():
        if key == "$or":
            if not any(matches(doc, sub) for sub in cond):
                return False
        elif not _match_value(doc.get(key), cond):
            return False
    return True


class FakeCursor:
    def __init__(self, docs: List[Dict[str, Any]]):
        self._docs = docs

    def sort(self, field: str, direction: int):
        self._docs.sort(key=lambda d: (d.get(field) is not None, d.get(field)), reverse=direction < 0)
        return self

    def limit(self, n: int):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length: Optional[int] = None):
        return [dict(d) for d in self._docs[:length]]


class FakeAggregate:
    def __init__(self, rows):
        self._rows = rows

    def __aiter__(self):
        self._it = iter(self._rows)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


class FakeCollection:
    def __init__(self, docs=None):
        self.docs: List[Dict[str, Any]] = list(docs or [])
        self.find_queries: List[Dict[str, Any]] = []

    def find(self, query, projection=None):
        self.find_queries.append(query)
        return FakeCursor([d for d in self.docs if matches(d, query)])

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if matches(d, query):
                return dict(d)
        return None

    def aggregate(self, pipeline):
        docs = list(self.docs)
        rows: List[Dict[str, Any]] = []
        for stage in pipeline:
            if "$match" in stage:
                docs = [d for d in docs if matches(d, stage["$match"])]
            elif "$group" in stage:
                group = stage["$group"]
                assert group["_id"] is None
                if docs:
                    row: Dict[str, Any] = {"_id": None}
                    for out, spec in group.items():
                        if out == "_id":
                            continue
                        field = spec["$sum"]
                        row[out] = sum(d.get(field[1:], 0) for d in docs) if isinstance(field, str) else len(docs) * field
                    rows = [row]
            else:  # pragma: no cover
                raise AssertionError(f"unsupported stage {stage}")
        return FakeAggregate(rows)


class FakeDB:
    def __init__(self):
        self.projects = FakeCollection(
            [
                {"id": "p-own", "name": "Own Project", "user_id": ME, "org_id": None,
                 "deleted_at": None, "updated_at": naive(-H)},
                {"id": "p-org", "name": "Org Project", "user_id": "user-teammate", "org_id": ORG,
                 "deleted_at": None, "updated_at": naive(-2 * H)},
                {"id": "p-foreign", "name": "Foreign", "user_id": "user-stranger", "org_id": "org-other",
                 "deleted_at": None, "updated_at": naive(-H)},
                {"id": "p-deleted", "name": "Deleted", "user_id": ME, "org_id": None,
                 "deleted_at": naive(-H), "updated_at": naive(-H)},
            ]
        )
        self.team_members = FakeCollection(
            [
                {"org_id": ORG, "user_id": ME, "role": "member"},
                {"org_id": "org-other", "user_id": "user-stranger", "role": "owner"},
            ]
        )
        self.kernel_runs = FakeCollection()
        self.ai_usage = FakeCollection()
        self.deployments = FakeCollection()


class FakeKernel:
    def __init__(self, runs: Optional[List[KernelRun]] = None):
        self.runs = list(runs or [])

    def list_active_runs(self):
        return list(self.runs)


class FakeBudgetManager:
    def __init__(self, limits: Optional[Dict[str, Dict[str, Any]]] = None):
        self.limits = limits or {}

    async def get_limit(self, scope, scope_id):
        return self.limits.get(scope_id)


def run_doc(
    run_id: str,
    project_id: str,
    *,
    status: str,
    created: timedelta,
    started: Optional[timedelta] = None,
    finished: Optional[timedelta] = None,
    tasks: Optional[List[Dict[str, Any]]] = None,
    gates: Optional[List[Dict[str, Any]]] = None,
    skills: Optional[List[Dict[str, Any]]] = None,
    max_budget: float = 2.5,
) -> Dict[str, Any]:
    return {
        "id": run_id,
        "project_id": project_id,
        "objective": f"Objective {run_id}",
        "status": status,
        "created_at": ts(created),
        "started_at": ts(started) if started is not None else None,
        "finished_at": ts(finished) if finished is not None else None,
        "tasks": tasks or [],
        "approval_gates": gates or [],
        "skill_activations": skills or [],
        "config": {"max_budget_usd": max_budget},
    }


def task(task_id: str, role: str, status: str, started: Optional[timedelta], finished: Optional[timedelta] = None):
    return {
        "id": task_id,
        "role": role,
        "status": status,
        "started_at": ts(started) if started is not None else None,
        "finished_at": ts(finished) if finished is not None else None,
    }


async def summary(db, kernel=None, budget=None, user_id: str = ME):
    return await cc.build_command_center_summary(
        db, user_id, kernel=kernel or FakeKernel(), budget_manager=budget or FakeBudgetManager(), now=NOW
    )


# --------------------------------------------------------------------------- #
# Scoping
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_only_accessible_projects_contribute():
    db = FakeDB()
    db.kernel_runs.docs = [
        run_doc("r-own", "p-own", status="planned", created=-10 * M),
        run_doc("r-org", "p-org", status="planned", created=-5 * M),
        run_doc("r-foreign", "p-foreign", status="planned", created=-3 * M,
                gates=[{"gate_id": "g-f", "gate_name": "Foreign gate", "status": "pending",
                        "created_at": ts(-2 * M)}]),
        run_doc("r-deleted", "p-deleted", status="planned", created=-4 * M),
    ]
    db.ai_usage.docs = [
        {"project_id": "p-own", "cost": 1.0, "created_at": naive(-H)},
        {"project_id": "p-foreign", "cost": 99.0, "created_at": naive(-H)},
        {"project_id": None, "user_id": ME, "cost": 50.0, "created_at": naive(-H)},
    ]
    db.deployments.docs = [
        {"id": "d-foreign", "project_id": "p-foreign", "status": "live", "created_at": naive(-M)},
    ]
    foreign_live = KernelRun(id="r-live-foreign", project_id="p-foreign", objective="Not yours")
    foreign_live.status = KernelRunStatus.RUNNING
    foreign_live.started_at = ts(-M)

    out = await summary(db, kernel=FakeKernel([foreign_live]))

    assert out["scope"]["project_count"] == 2
    assert out["stats"]["active_runs"]["current"] == 2
    assert out["stats"]["pending_approvals"]["current"] == 0
    assert out["stats"]["spend_today"]["current_usd"] == pytest.approx(1.0)
    run_ids = {e.get("run_id") for e in out["activity"]}
    assert run_ids == {"r-own", "r-org"}
    assert all(e["project_id"] in {"p-own", "p-org"} for e in out["activity"])
    # The run query itself is restricted to the accessible project ids.
    assert set(db.kernel_runs.find_queries[0]["project_id"]["$in"]) == {"p-own", "p-org"}


@pytest.mark.asyncio
async def test_user_with_no_projects_gets_zeros_and_no_db_fanout():
    db = FakeDB()
    out = await summary(db, user_id="user-nobody")
    assert out["scope"]["project_count"] == 0
    assert out["activity"] == []
    assert out["stats"]["active_runs"]["current"] == 0
    assert out["stats"]["spend_today"]["current_usd"] == 0
    assert db.kernel_runs.find_queries == []


@pytest.mark.asyncio
async def test_project_count_is_capped(monkeypatch):
    monkeypatch.setattr(cc, "MAX_PROJECTS", 1)
    out = await summary(FakeDB())
    assert out["scope"]["project_count"] == 1
    assert out["scope"]["projects_truncated"] is True


# --------------------------------------------------------------------------- #
# Deltas
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_active_runs_now_vs_same_time_yesterday():
    db = FakeDB()
    db.kernel_runs.docs = [
        # Active yesterday at NOW-24h, finished since.
        run_doc("r1", "p-own", status="completed", created=-26 * H, started=-26 * H, finished=-20 * H),
        # Active yesterday, failed since.
        run_doc("r2", "p-org", status="failed", created=-25 * H, started=-25 * H, finished=-23 * H),
        # Finished before the comparison instant: not active yesterday.
        run_doc("r3", "p-own", status="completed", created=-30 * H, started=-30 * H, finished=-28 * H),
        # Active now (persisted as planned, not yet picked up).
        run_doc("r4", "p-own", status="planned", created=-2 * M),
    ]
    live = KernelRun(id="r5", project_id="p-org", objective="Live run")
    live.status = KernelRunStatus.RUNNING
    live.created_at = ts(-30 * M)
    live.started_at = ts(-29 * M)
    # The persisted snapshot of a live run is stale; the overlay must win.
    db.kernel_runs.docs.append(run_doc("r5", "p-org", status="planned", created=-30 * M))

    out = await summary(db, kernel=FakeKernel([live]))
    stat = out["stats"]["active_runs"]
    assert stat == {
        "current": 2,
        "previous": 2,
        "delta": 0,
        "compared_to": "same_time_yesterday",
        "unavailable_reason": None,
    }


@pytest.mark.asyncio
async def test_agents_working_now_vs_one_hour_ago():
    db = FakeDB()
    live = KernelRun(id="r-live", project_id="p-own", objective="Live")
    live.status = KernelRunStatus.RUNNING
    live.started_at = ts(-2 * H)
    live.tasks = [
        KernelTask("t1", "Arch", "solution_architect", "architecture", "d",
                   status=KernelTaskStatus.COMPLETED, started_at=ts(-110 * M), finished_at=ts(-50 * M)),
        KernelTask("t2", "BE", "backend_engineer", "engineering", "d",
                   status=KernelTaskStatus.RUNNING, started_at=ts(-40 * M)),
        KernelTask("t3", "FE", "frontend_engineer", "engineering", "d",
                   status=KernelTaskStatus.RUNNING, started_at=ts(-30 * M)),
        KernelTask("t4", "QA", "qa_engineer", "quality", "d", status=KernelTaskStatus.PENDING),
    ]
    db.kernel_runs.docs = [
        run_doc("r-done", "p-org", status="completed", created=-3 * H, started=-3 * H, finished=-10 * M,
                tasks=[task("x1", "security_engineer", "completed", -70 * M, -20 * M),
                       task("x2", "qa_engineer", "completed", -15 * M, -10 * M)]),
    ]
    out = await summary(db, kernel=FakeKernel([live]))
    stat = out["stats"]["agents_working"]
    # Now: backend + frontend. 1h ago: solution_architect (live run) + security_engineer.
    assert stat["current"] == 2
    assert stat["previous"] == 2
    assert stat["delta"] == 0
    assert stat["compared_to"] == "1h_ago"

    live.tasks[2].status = KernelTaskStatus.COMPLETED
    live.tasks[2].finished_at = ts(-M)
    out = await summary(db, kernel=FakeKernel([live]))
    assert out["stats"]["agents_working"]["current"] == 1
    assert out["stats"]["agents_working"]["delta"] == -1


@pytest.mark.asyncio
async def test_skills_invoked_last_24h_vs_prior_24h():
    db = FakeDB()
    db.kernel_runs.docs = [
        run_doc(
            "r1", "p-own", status="completed", created=-30 * H, started=-30 * H, finished=-29 * H,
            tasks=[task("t1", "backend_engineer", "completed", -30 * H, -29 * H)],
            # Legacy activations without activated_at fall back to the task start.
            skills=[{"task_id": "t1", "skill_name": "a"}, {"task_id": "t1", "skill_name": "b"}],
        ),
        run_doc(
            "r2", "p-org", status="completed", created=-5 * H, started=-5 * H, finished=-4 * H,
            skills=[
                {"task_id": "t9", "skill_name": "c", "activated_at": ts(-5 * H)},
                {"task_id": "t9", "skill_name": "d", "activated_at": ts(-4 * H)},
                {"task_id": "t9", "skill_name": "e", "activated_at": ts(-50 * H)},  # outside both windows
            ],
        ),
    ]
    out = await summary(db)
    assert out["stats"]["skills_invoked"] == {
        "current": 2,
        "previous": 2,
        "delta": 0,
        "compared_to": "prior_24h",
        "unavailable_reason": None,
    }
    db.kernel_runs.docs[1]["skill_activations"].append(
        {"task_id": "t9", "skill_name": "f", "activated_at": ts(-H)}
    )
    out = await summary(db)
    assert out["stats"]["skills_invoked"]["delta"] == 1


@pytest.mark.asyncio
async def test_spend_today_vs_yesterday_same_time_and_budget():
    db = FakeDB()
    day_start = NOW.replace(hour=0, minute=0, second=0, microsecond=0)
    db.ai_usage.docs = [
        {"project_id": "p-own", "cost": 3.0, "created_at": naive(-H)},
        {"project_id": "p-org", "cost": 1.5, "created_at": naive(-14 * H)},  # today 01:00
        # Yesterday before the same time of day (counts as baseline).
        {"project_id": "p-own", "cost": 6.0, "created_at": naive(-30 * H)},
        # Yesterday after the same time of day (excluded from like-for-like baseline).
        {"project_id": "p-own", "cost": 100.0, "created_at": naive(-20 * H)},
        # Before yesterday.
        {"project_id": "p-own", "cost": 50.0, "created_at": (day_start - timedelta(hours=30)).replace(tzinfo=None)},
    ]
    db.kernel_runs.docs = [run_doc("r-a", "p-own", status="planned", created=-M, max_budget=4.0)]
    budget = FakeBudgetManager(
        {
            "p-own": {"period": "daily", "hard_limit_usd": 20.0, "soft_limit_usd": 10.0},
            "p-org": {"period": "monthly", "hard_limit_usd": 500.0},
            "p-foreign": {"period": "daily", "hard_limit_usd": 999.0},
        }
    )
    out = await summary(db, budget=budget)
    spend = out["stats"]["spend_today"]
    assert spend["current_usd"] == pytest.approx(4.5)
    assert spend["previous_usd"] == pytest.approx(6.0)
    assert spend["delta_pct"] == pytest.approx(-25.0)
    assert spend["compared_to"] == "yesterday_same_time"
    assert spend["unavailable_reason"] is None
    assert spend["daily_budget_usd"] == pytest.approx(20.0)
    assert spend["active_run_caps_usd"] == pytest.approx(4.0)


# --------------------------------------------------------------------------- #
# Null comparisons
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_null_comparisons_are_explicit():
    db = FakeDB()
    db.ai_usage.docs = [{"project_id": "p-own", "cost": 2.0, "created_at": naive(-H)}]
    out = await summary(db)
    spend = out["stats"]["spend_today"]
    # No spend yesterday: a percentage change is undefined, not 0 and not +inf.
    assert spend["previous_usd"] == 0
    assert spend["delta_pct"] is None
    assert spend["unavailable_reason"] == "no_baseline"
    # No daily limit configured anywhere.
    assert spend["daily_budget_usd"] is None
    # Approvals are reported as a current value only.
    approvals = out["stats"]["pending_approvals"]
    assert approvals["previous"] is None and approvals["delta"] is None
    assert approvals["unavailable_reason"] == "not_compared"


@pytest.mark.asyncio
async def test_truncated_history_nulls_history_based_comparisons(monkeypatch):
    monkeypatch.setattr(cc, "MAX_RUNS", 2)
    db = FakeDB()
    db.kernel_runs.docs = [
        run_doc(f"r{i}", "p-own", status="completed", created=-(i + 1) * H, started=-(i + 1) * H,
                finished=-i * H)
        for i in range(3)
    ]
    out = await summary(db)
    assert out["scope"]["history_truncated"] is True
    for key in ("active_runs", "agents_working", "skills_invoked"):
        stat = out["stats"][key]
        assert stat["previous"] is None and stat["delta"] is None
        assert stat["unavailable_reason"] == "history_truncated"


# --------------------------------------------------------------------------- #
# Activity
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_activity_feed_is_newest_first_and_capped():
    db = FakeDB()
    db.kernel_runs.docs = [
        run_doc(
            "r-gated", "p-own", status="waiting_approval", created=-60 * M, started=-59 * M,
            gates=[
                {"gate_id": "g1", "gate_name": "Schema migration", "status": "approved",
                 "decided_by": "lead@forge.test", "created_at": ts(-40 * M), "decided_at": ts(-35 * M)},
                {"gate_id": "g2", "gate_name": "Delivery approval", "status": "pending",
                 "created_at": ts(-5 * M), "decided_at": None},
            ],
        ),
        run_doc("r-failed", "p-org", status="partial_failure", created=-3 * H, started=-3 * H,
                finished=-2 * H),
        run_doc("r-done", "p-org", status="completed", created=-50 * M, started=-50 * M, finished=-20 * M),
    ]
    db.deployments.docs = [
        {"id": "d1", "project_id": "p-own", "status": "live", "url": "https://app.example",
         "created_at": naive(-15 * M), "updated_at": naive(-12 * M), "deployed_at": cc.iso(NOW - 12 * M)},
        {"id": "d2", "project_id": "p-org", "status": "failed", "provider": "docker",
         "created_at": naive(-9 * H), "updated_at": naive(-8 * H)},
    ]
    out = await summary(db)
    activity = out["activity"]
    stamps = [e["at"] for e in activity]
    assert stamps == sorted(stamps, reverse=True)
    kinds = [e["kind"] for e in activity]
    assert kinds[:6] == [
        "gate_opened",      # -5m
        "deploy_live",      # -12m
        "deploy_started",   # -15m
        "run_completed",    # -20m
        "gate_approved",    # -35m
        "gate_opened",      # -40m
    ]
    assert "run_failed" in kinds and "deploy_failed" in kinds
    approved = next(e for e in activity if e["kind"] == "gate_approved")
    assert approved["actor"] == "lead@forge.test"
    assert approved["title"] == "Schema migration"
    assert approved["project_name"] == "Own Project"
    assert out["stats"]["pending_approvals"]["current"] == 1

    db.kernel_runs.docs.extend(
        run_doc(f"bulk{i}", "p-own", status="completed", created=-(10 + i) * H, started=-(10 + i) * H,
                finished=-(9 + i) * H)
        for i in range(20)
    )
    out = await summary(db)
    assert len(out["activity"]) == cc.ACTIVITY_LIMIT
    assert len({e["id"] for e in out["activity"]}) == cc.ACTIVITY_LIMIT


# --------------------------------------------------------------------------- #
# HTTP surface
# --------------------------------------------------------------------------- #


def _make_client(monkeypatch, db, *, authed: bool = True, cache_calls=None):
    async def _get_db():
        return db

    async def _passthrough(key, ttl, loader, *, enabled=True):
        if cache_calls is not None:
            cache_calls.append((key, ttl))
        return await loader()

    monkeypatch.setattr(cc_api, "get_db", _get_db)
    monkeypatch.setattr(cc_api, "get_agent_kernel", lambda: FakeKernel())
    monkeypatch.setattr(cc_api, "get_budget_manager", lambda: FakeBudgetManager())
    monkeypatch.setattr(cc_api, "cached_read", _passthrough)

    app = FastAPI()
    v1 = APIRouter(prefix="/v1")
    v1.include_router(cc_api.router)
    app.include_router(v1)
    if authed:
        app.dependency_overrides[get_current_user] = lambda: User(id=ME, email="me@forge.test", name="Me")
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://forge.test")


@pytest.mark.asyncio
async def test_endpoint_requires_auth(monkeypatch):
    async with _make_client(monkeypatch, FakeDB(), authed=False) as client:
        resp = await client.get("/v1/command-center/summary")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_endpoint_returns_summary_and_caches_per_user(monkeypatch):
    db = FakeDB()
    doc = run_doc("r-own", "p-own", status="planned", created=-M)
    # The endpoint runs on the real clock.
    doc["created_at"] = cc.iso(datetime.now(timezone.utc) - M)
    db.kernel_runs.docs = [doc]
    calls: list = []
    async with _make_client(monkeypatch, db, cache_calls=calls) as client:
        resp = await client.get("/v1/command-center/summary", params={"window": "24h"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["window"] == "24h"
    assert set(body["stats"]) == {
        "active_runs", "agents_working", "pending_approvals", "spend_today", "skills_invoked",
    }
    assert body["activity"][0]["run_id"] == "r-own"
    assert calls == [(cc_api.summary_cache_key(ME, "24h"), cc_api.SUMMARY_CACHE_TTL)]


@pytest.mark.asyncio
async def test_endpoint_rejects_unsupported_window(monkeypatch):
    async with _make_client(monkeypatch, FakeDB()) as client:
        resp = await client.get("/v1/command-center/summary", params={"window": "30d"})
    assert resp.status_code == 422


def test_router_is_mounted_under_v1():
    from api.v1 import v1_router

    app = FastAPI()
    app.include_router(v1_router)
    assert "/v1/command-center/summary" in app.openapi()["paths"]
