"""Tests for the Planning phase (backend/agent_registry/planning.py).

Covers plan creation from a free-text objective via TaskRouter, heuristic
risk assessment (architecturally-sensitive affected paths, department
fan-out), the approve/reject decision gate, and project scoping against an
in-memory fake Mongo -- plus the API endpoints on top of it.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from agent_registry.planning import (
    InitiativeNotFound,
    PlanNotEditable,
    PlanNotFound,
    PlanningRepository,
    PlanningService,
    PlanStatus,
    RiskLevel,
)
from agent_registry.registry import AgentNotFound, AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from agent_registry.task_router import TaskRouter
from core.models import User

# --------------------------------------------------------------------------- #
# Objectives crafted against task_router.ROLE_KEYWORDS to hit a known,
# stable set of departments without tripping unrelated keyword substrings.
# --------------------------------------------------------------------------- #

# Matches only react_engineer (frontend): "react", "dashboard", "component".
SINGLE_DEPT_OBJECTIVE = "Rework the react dashboard component."

# Matches react_engineer (frontend) + database_engineer (backend):
# "database", "schema", "migration".
TWO_DEPT_OBJECTIVE = "Rework the react dashboard component and add a new database schema migration."

# Matches react_engineer (frontend), database_engineer (backend),
# security_engineer (infrastructure), and prompt_engineer (ai).
MULTI_DEPT_OBJECTIVE = (
    "Rework the react dashboard component, add a new database schema migration, "
    "patch a security vulnerability, and update the system prompt."
)


# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in
# --------------------------------------------------------------------------- #


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, field, direction=1):
        self._docs.sort(key=lambda d: d.get(field), reverse=(direction == -1))
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length=None):
        docs = self._docs
        if length is not None:
            docs = docs[:length]
        return [dict(d) for d in docs]


def _matches(doc, query):
    for k, v in query.items():
        if k == "$or":
            if not any(_matches(doc, sub) for sub in v):
                return False
            continue
        if k == "to_agent_ids":
            if v not in (doc.get(k) or []):
                return False
            continue
        if doc.get(k) != v:
            return False
    return True


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                out = dict(d)
                out.pop("_id", None)
                return out
        return None

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if _matches(d, query):
                d.update(update["$set"])
                return
        if upsert:
            new_doc = dict(query)
            new_doc.update(update["$set"])
            self.docs.append(new_doc)

    def find(self, query, projection=None):
        matched = [d for d in self.docs if _matches(d, query)]
        return FakeCursor(matched)


class FakeDB:
    def __init__(self):
        self.engineering_orgs = FakeCollection()
        self.agent_profiles = FakeCollection()
        self.plans = FakeCollection()
        self.initiatives = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def _patched_planning(monkeypatch, db=None):
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.planning as planning_module
    import agent_registry.repository as repo_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(planning_module, "get_db", _get_db)

    registry = AgentRegistry(repo=AgentRegistryRepository())
    router = TaskRouter(registry=registry)
    service = PlanningService(registry=registry, router=router, repo=PlanningRepository())
    return service, registry, db


# --------------------------------------------------------------------------- #
# create_plan()
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_plan_one_task_per_router_assignment(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")

    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)

    assert plan.project_id == "proj1"
    assert plan.status == PlanStatus.DRAFT
    assert len(plan.tasks) == 1

    task = plan.tasks[0]
    assert task.role == "react_engineer"
    assert task.department == "frontend"
    assert task.agent_id
    assert task.depends_on == []


@pytest.mark.asyncio
async def test_create_plan_low_risk_single_department(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")

    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)

    assert plan.risk_level == RiskLevel.LOW
    assert "1 department" in plan.risk_notes


@pytest.mark.asyncio
async def test_create_plan_medium_risk_two_departments(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")

    plan = await service.create_plan("proj1", TWO_DEPT_OBJECTIVE)

    departments = {t.department for t in plan.tasks}
    assert departments == {"frontend", "backend"}
    assert plan.risk_level == RiskLevel.MEDIUM
    assert "2 departments" in plan.risk_notes


@pytest.mark.asyncio
async def test_create_plan_high_risk_three_plus_departments(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")

    plan = await service.create_plan("proj1", MULTI_DEPT_OBJECTIVE)

    departments = {t.department for t in plan.tasks}
    assert len(departments) >= 3
    assert plan.risk_level == RiskLevel.HIGH
    assert "departments" in plan.risk_notes


@pytest.mark.asyncio
async def test_create_plan_high_risk_architecturally_sensitive_paths(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")

    plan = await service.create_plan(
        "proj1", SINGLE_DEPT_OBJECTIVE, affected_paths=["backend/core/database.py", "docs/README.md"]
    )

    assert plan.risk_level == RiskLevel.HIGH
    assert "architecturally-sensitive" in plan.risk_notes
    assert "backend/core/database.py" in plan.risk_notes
    assert "docs/README.md" not in plan.risk_notes


@pytest.mark.asyncio
async def test_create_plan_and_decisions_succeed_even_when_org_event_emission_unavailable(monkeypatch):
    """create_plan()/approve()/reject() each emit a best-effort OrgEvent
    (PLAN_CREATED/PLAN_DECIDED) after saving. services.org_ws_manager's
    get_db/get_redis are deliberately left unpatched here (no real Redis is
    reachable in this environment) to prove the try/except around each
    emission actually protects the caller."""
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)
    assert plan.status == PlanStatus.DRAFT

    approved = await service.approve("proj1", plan.id, approved_by_agent_id=dev.id)
    assert approved.status == PlanStatus.APPROVED

    plan2 = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)
    rejected = await service.reject("proj1", plan2.id, rejected_by_agent_id=dev.id, reason="not needed")
    assert rejected.status == PlanStatus.REJECTED


@pytest.mark.asyncio
async def test_create_plan_default_rollback_and_success_metrics(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")

    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)

    assert "No automated rollback exists yet" in plan.rollback_strategy
    assert plan.success_metrics == [
        "all suggested reviewers approve",
        "no new HIGH/CRITICAL findings introduced",
    ]


@pytest.mark.asyncio
async def test_create_plan_overridable_rollback_and_success_metrics(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")

    plan = await service.create_plan(
        "proj1",
        SINGLE_DEPT_OBJECTIVE,
        rollback_strategy="Revert via feature flag.",
        success_metrics=["custom metric"],
    )

    assert plan.rollback_strategy == "Revert via feature flag."
    assert plan.success_metrics == ["custom metric"]


# --------------------------------------------------------------------------- #
# initiative_id linkage (optional, additive, read-only against `initiatives`)
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_create_plan_with_no_initiative_id_is_unchanged(monkeypatch):
    """Regression check: omitting `initiative_id` entirely behaves exactly
    as it did before the field existed."""
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")

    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)

    assert plan.initiative_id is None


@pytest.mark.asyncio
async def test_create_plan_with_valid_initiative_id_sets_field(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")
    db.initiatives.docs.append(
        {
            "id": "init1",
            "user_id": "u1",
            "org_id": None,
            "name": "Q3 Roadmap",
            "prompt": "Build the Q3 roadmap",
            "status": "active",
            "vision": "Ship it",
        }
    )

    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE, initiative_id="init1")

    assert plan.initiative_id == "init1"


@pytest.mark.asyncio
async def test_create_plan_with_unknown_initiative_id_raises_initiative_not_found(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")

    with pytest.raises(InitiativeNotFound):
        await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE, initiative_id="does-not-exist")


# --------------------------------------------------------------------------- #
# approve() / reject()
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_approve_sets_status_and_decision(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)

    approved = await service.approve("proj1", plan.id, approved_by_agent_id=dev.id)
    assert approved.status == PlanStatus.APPROVED
    assert approved.approved_by_agent_id == dev.id
    assert approved.decided_at is not None


@pytest.mark.asyncio
async def test_approve_twice_raises_plan_not_editable(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)

    await service.approve("proj1", plan.id, approved_by_agent_id=dev.id)
    with pytest.raises(PlanNotEditable):
        await service.approve("proj1", plan.id, approved_by_agent_id=dev.id)


@pytest.mark.asyncio
async def test_reject_sets_status_and_records_reason(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)

    rejected = await service.reject("proj1", plan.id, rejected_by_agent_id=dev.id, reason="not now")
    assert rejected.status == PlanStatus.REJECTED
    assert rejected.decided_at is not None
    assert "not now" in rejected.risk_notes
    assert dev.id in rejected.risk_notes


@pytest.mark.asyncio
async def test_reject_twice_raises_plan_not_editable(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)

    await service.reject("proj1", plan.id, rejected_by_agent_id=dev.id)
    with pytest.raises(PlanNotEditable):
        await service.reject("proj1", plan.id, rejected_by_agent_id=dev.id)


@pytest.mark.asyncio
async def test_approve_after_reject_raises_plan_not_editable(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)

    await service.reject("proj1", plan.id, rejected_by_agent_id=dev.id)
    with pytest.raises(PlanNotEditable):
        await service.approve("proj1", plan.id, approved_by_agent_id=dev.id)


@pytest.mark.asyncio
async def test_approve_unknown_plan_raises_plan_not_found(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    with pytest.raises(PlanNotFound):
        await service.approve("proj1", "does-not-exist", approved_by_agent_id=dev.id)


@pytest.mark.asyncio
async def test_approve_unknown_agent_raises_agent_not_found(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")
    plan = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)

    with pytest.raises(AgentNotFound):
        await service.approve("proj1", plan.id, approved_by_agent_id="does-not-exist")


@pytest.mark.asyncio
async def test_get_unknown_plan_raises_plan_not_found(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")

    with pytest.raises(PlanNotFound):
        await service.get("proj1", "does-not-exist")


# --------------------------------------------------------------------------- #
# Project scoping / listing
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_plans_are_scoped_to_project(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")
    await registry.get_or_create_org("proj2")

    plan1 = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)
    await service.create_plan("proj2", SINGLE_DEPT_OBJECTIVE)

    with pytest.raises(PlanNotFound):
        await service.get("proj2", plan1.id)

    plans_proj1 = await service.list_for_project("proj1")
    assert [p.id for p in plans_proj1] == [plan1.id]


@pytest.mark.asyncio
async def test_list_for_project_filters_by_status(monkeypatch):
    service, registry, db = _patched_planning(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    plan1 = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)
    plan2 = await service.create_plan("proj1", SINGLE_DEPT_OBJECTIVE)
    await service.approve("proj1", plan2.id, approved_by_agent_id=dev.id)

    drafts = await service.list_for_project("proj1", status=PlanStatus.DRAFT)
    assert [p.id for p in drafts] == [plan1.id]

    approved = await service.list_for_project("proj1", status=PlanStatus.APPROVED)
    assert [p.id for p in approved] == [plan2.id]


# --------------------------------------------------------------------------- #
# API endpoints
# --------------------------------------------------------------------------- #


def _client_for(monkeypatch, db, user):
    import agent_registry.planning as planning_module
    import agent_registry.repository as repo_module
    import api.agent_registry as org_router_module
    import api.planning as router_module

    async def _get_db():
        return db

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(planning_module, "get_db", _get_db)
    monkeypatch.setattr(router_module, "get_db", _get_db)
    monkeypatch.setattr(org_router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(org_router_module.router)
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def _seed_project(db, project_id, user_id):
    db.projects = type(db.engineering_orgs)()
    db.projects.docs.append({"id": project_id, "user_id": user_id, "org_id": None})
    db.team_members = type(db.engineering_orgs)()


def test_create_list_get_plan_endpoints(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    r = client.post("/projects/proj1/planning/plans", json={"objective": SINGLE_DEPT_OBJECTIVE})
    assert r.status_code == 200, r.text
    plan = r.json()
    assert plan["status"] == "draft"
    assert plan["risk_level"] == "low"
    assert len(plan["tasks"]) == 1

    r2 = client.get("/projects/proj1/planning/plans")
    assert r2.status_code == 200
    assert len(r2.json()["plans"]) == 1

    r3 = client.get(f"/projects/proj1/planning/plans/{plan['id']}")
    assert r3.status_code == 200
    assert r3.json()["id"] == plan["id"]

    r4 = client.get("/projects/proj1/planning/plans/does-not-exist")
    assert r4.status_code == 404


def test_create_plan_endpoint_high_risk_from_affected_paths(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    r = client.post(
        "/projects/proj1/planning/plans",
        json={"objective": SINGLE_DEPT_OBJECTIVE, "affected_paths": ["backend/api/planning.py"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["risk_level"] == "high"


def test_approve_endpoint_success_and_double_approve_400(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    dev = client.post("/projects/proj1/org/agents", json={"role": "developer"}).json()["agent"]
    plan = client.post("/projects/proj1/planning/plans", json={"objective": SINGLE_DEPT_OBJECTIVE}).json()

    r = client.post(
        f"/projects/proj1/planning/plans/{plan['id']}/approve",
        json={"approved_by_agent_id": dev["id"]},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"
    assert r.json()["approved_by_agent_id"] == dev["id"]

    r2 = client.post(
        f"/projects/proj1/planning/plans/{plan['id']}/approve",
        json={"approved_by_agent_id": dev["id"]},
    )
    assert r2.status_code == 400


def test_approve_endpoint_unknown_agent_404(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    plan = client.post("/projects/proj1/planning/plans", json={"objective": SINGLE_DEPT_OBJECTIVE}).json()

    r = client.post(
        f"/projects/proj1/planning/plans/{plan['id']}/approve",
        json={"approved_by_agent_id": "does-not-exist"},
    )
    assert r.status_code == 404


def test_reject_endpoint(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    dev = client.post("/projects/proj1/org/agents", json={"role": "developer"}).json()["agent"]
    plan = client.post("/projects/proj1/planning/plans", json={"objective": SINGLE_DEPT_OBJECTIVE}).json()

    r = client.post(
        f"/projects/proj1/planning/plans/{plan['id']}/reject",
        json={"rejected_by_agent_id": dev["id"], "reason": "not needed"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "rejected"
    assert "not needed" in r.json()["risk_notes"]


def test_create_plan_endpoint_unknown_initiative_id_404(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    r = client.post(
        "/projects/proj1/planning/plans",
        json={"objective": SINGLE_DEPT_OBJECTIVE, "initiative_id": "does-not-exist"},
    )
    assert r.status_code == 404


def test_create_plan_endpoint_valid_initiative_id(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    db.initiatives.docs.append(
        {
            "id": "init1",
            "user_id": "u1",
            "org_id": None,
            "name": "Q3 Roadmap",
            "prompt": "Build the Q3 roadmap",
            "status": "active",
            "vision": "Ship it",
        }
    )
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    r = client.post(
        "/projects/proj1/planning/plans",
        json={"objective": SINGLE_DEPT_OBJECTIVE, "initiative_id": "init1"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["initiative_id"] == "init1"


def test_planning_endpoints_deny_other_users(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    other_user = User(id="intruder", email="i@b.com", name="I", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, other_user)

    r = client.get("/projects/proj1/planning/plans")
    assert r.status_code == 404

    r2 = client.post("/projects/proj1/planning/plans", json={"objective": SINGLE_DEPT_OBJECTIVE})
    assert r2.status_code == 404
