"""Tests for the persistent Agent Registry (backend/agent_registry).

Covers the AgentRegistry service against an in-memory fake Mongo (default org
seeding, dynamic specialist creation, task-result bookkeeping, promotion
thresholds, retirement) and the FastAPI router wiring on top of it.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from agent_registry.models import AgentLevel, AgentStatus
from agent_registry.registry import (
    AgentNotFound,
    AgentRegistry,
    PromotionNotEligible,
)
from agent_registry.repository import AgentRegistryRepository
from core.models import User


# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in
# --------------------------------------------------------------------------- #


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, field, direction=1):
        self._docs.sort(key=lambda d: d.get(field), reverse=(direction == -1))
        return self

    async def to_list(self, length=None):
        docs = self._docs
        if length is not None:
            docs = docs[:length]
        return [dict(d) for d in docs]


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                out = dict(d)
                out.pop("_id", None)
                return out
        return None

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(update["$set"])
                return
        if upsert:
            new_doc = dict(query)
            new_doc.update(update["$set"])
            self.docs.append(new_doc)

    def find(self, query, projection=None):
        matched = [d for d in self.docs if all(d.get(k) == v for k, v in query.items())]
        return FakeCursor(matched)


class FakeDB:
    def __init__(self):
        self.engineering_orgs = FakeCollection()
        self.agent_profiles = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def _patched_registry(monkeypatch, db=None):
    """Return an AgentRegistry backed by `db` (or a fresh FakeDB), with the
    repository module's get_db() patched so no real Mongo is touched."""
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.repository as repo_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    return AgentRegistry(repo=AgentRegistryRepository()), db


# --------------------------------------------------------------------------- #
# Org seeding
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_get_or_create_org_seeds_default_departments(monkeypatch):
    registry, db = _patched_registry(monkeypatch)

    org = await registry.get_or_create_org("proj1")

    dept_keys = {d.key for d in org.departments}
    assert dept_keys == {
        "leadership", "frontend", "backend", "ai", "infrastructure", "qa",
        "documentation", "research", "release",
    }
    assert org.leadership.cto_agent_id is not None
    assert org.leadership.pm_agent_id is not None

    agents = await registry.list_agents("proj1")
    roles = {a.role for a in agents}
    assert "react_engineer" in roles
    assert "security_engineer" in roles
    assert all(a.level == AgentLevel.JUNIOR for a in agents)
    assert all(a.status == AgentStatus.ACTIVE for a in agents)


@pytest.mark.asyncio
async def test_get_or_create_org_is_idempotent(monkeypatch):
    registry, db = _patched_registry(monkeypatch)

    org1 = await registry.get_or_create_org("proj1")
    org2 = await registry.get_or_create_org("proj1")

    assert org1.id == org2.id
    agents = await registry.list_agents("proj1")
    # Re-fetching must not duplicate the seeded roster.
    roles = [a.role for a in agents]
    assert len(roles) == len(set(roles))
    assert len(db.agent_profiles.docs) == len(roles)


@pytest.mark.asyncio
async def test_orgs_are_isolated_per_project(monkeypatch):
    registry, db = _patched_registry(monkeypatch)

    await registry.get_or_create_org("proj1")
    await registry.get_or_create_org("proj2")

    agents1 = await registry.list_agents("proj1")
    agents2 = await registry.list_agents("proj2")
    assert {a.project_id for a in agents1} == {"proj1"}
    assert {a.project_id for a in agents2} == {"proj2"}


# --------------------------------------------------------------------------- #
# Dynamic agent creation
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_get_or_create_agent_reuses_existing_role(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")

    agent, created = await registry.get_or_create_agent("proj1", "react_engineer")
    assert created is False
    assert agent.role == "react_engineer"
    assert agent.department == "frontend"


@pytest.mark.asyncio
async def test_get_or_create_agent_spins_up_new_specialist(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")

    agent, created = await registry.get_or_create_agent("proj1", "graphql_engineer")
    assert created is True
    assert agent.department == "specialists"
    assert agent.display_name == "Graphql Engineer"

    # It becomes a permanent member: a second lookup finds the same agent.
    again, created_again = await registry.get_or_create_agent("proj1", "graphql_engineer")
    assert created_again is False
    assert again.id == agent.id

    org = await registry.get_or_create_org("proj1")
    specialists = next(d for d in org.departments if d.key == "specialists")
    assert agent.id in specialists.agent_ids


@pytest.mark.asyncio
async def test_get_or_create_agent_recreates_after_retirement(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")

    agent, _ = await registry.get_or_create_agent("proj1", "rust_engineer")
    await registry.retire("proj1", agent.id, reason="tech no longer used")

    new_agent, created = await registry.get_or_create_agent("proj1", "rust_engineer")
    assert created is True
    assert new_agent.id != agent.id


@pytest.mark.asyncio
async def test_get_or_create_agent_reuses_active_replacement_not_retired_original(monkeypatch):
    """Once a retired agent's role has been re-created, further lookups must
    keep reusing that new active agent -- not keep spinning up further
    duplicates because the query happens to see the old retired doc first."""
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")

    original, _ = await registry.get_or_create_agent("proj1", "rust_engineer")
    await registry.retire("proj1", original.id, reason="tech no longer used")
    replacement, created = await registry.get_or_create_agent("proj1", "rust_engineer")
    assert created is True
    assert replacement.id != original.id

    again, created_again = await registry.get_or_create_agent("proj1", "rust_engineer")
    assert created_again is False
    assert again.id == replacement.id

    roles = [a.role for a in await registry.list_agents("proj1") if a.role == "rust_engineer"]
    assert len(roles) == 2  # exactly one retired + one active, never a third


# --------------------------------------------------------------------------- #
# Task-result bookkeeping and promotion
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_record_task_result_updates_stats(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")

    updated = await registry.record_task_result(
        "proj1", agent.id, success=True, tokens=500, cost=0.02,
        files_touched=["backend/main.py"], review_score=0.9,
    )
    assert updated.stats.tasks_completed == 1
    assert updated.stats.tasks_failed == 0
    assert updated.stats.success_rate == 1.0
    assert updated.stats.tokens_used == 500
    assert updated.owned_paths == ["backend/main.py"]
    assert updated.stats.avg_review_score == 0.9

    updated = await registry.record_task_result("proj1", agent.id, success=False)
    assert updated.stats.tasks_completed == 2
    assert updated.stats.tasks_failed == 1
    assert updated.stats.success_rate == 0.5


@pytest.mark.asyncio
async def test_record_task_result_unknown_agent_raises(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")

    with pytest.raises(AgentNotFound):
        await registry.record_task_result("proj1", "does-not-exist", success=True)


@pytest.mark.asyncio
async def test_promote_rejected_below_threshold(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")

    with pytest.raises(PromotionNotEligible):
        await registry.promote("proj1", agent.id)


@pytest.mark.asyncio
async def test_auto_promotion_on_task_result_once_eligible(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")

    # JUNIOR -> MID requires >= 10 tasks and >= 70% success rate.
    for _ in range(10):
        updated = await registry.record_task_result("proj1", agent.id, success=True)

    assert updated.level == AgentLevel.MID
    assert any(e["event"] == "promoted" for e in updated.decision_log)


@pytest.mark.asyncio
async def test_promote_force_ignores_thresholds(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")

    promoted = await registry.promote("proj1", agent.id, reason="manual override", force=True)
    assert promoted.level == AgentLevel.MID


@pytest.mark.asyncio
async def test_promote_at_max_level_raises(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    org = await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")
    cto_id = org.leadership.cto_agent_id

    # LEAD/PRINCIPAL require CTO approval regardless of force -- see the CTO
    # gate tests above; MID/SENIOR need no approval.
    for level in [AgentLevel.MID, AgentLevel.SENIOR]:
        agent = await registry.promote("proj1", agent.id, force=True)
    for level in [AgentLevel.LEAD, AgentLevel.PRINCIPAL]:
        agent = await registry.promote("proj1", agent.id, force=True, approved_by_agent_id=cto_id)
    assert agent.level == AgentLevel.PRINCIPAL

    with pytest.raises(PromotionNotEligible):
        await registry.promote("proj1", agent.id, force=True, approved_by_agent_id=cto_id)


# --------------------------------------------------------------------------- #
# Strength/weakness derivation from task-result stats
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_strength_recorded_after_five_successful_tasks(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")

    updated = None
    for _ in range(5):
        updated = await registry.record_task_result("proj1", agent.id, success=True)

    assert updated.stats.tasks_completed == 5
    assert updated.stats.success_rate == 1.0
    assert len(updated.strengths) == 1
    assert updated.weaknesses == []


@pytest.mark.asyncio
async def test_weakness_recorded_after_five_tasks_low_success_rate(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")

    outcomes = [False, False, False, True, True]  # 2/5 = 0.4 success rate
    updated = None
    for success in outcomes:
        updated = await registry.record_task_result("proj1", agent.id, success=success)

    assert updated.stats.tasks_completed == 5
    assert updated.stats.success_rate == 0.4
    assert len(updated.weaknesses) == 1
    assert updated.strengths == []


@pytest.mark.asyncio
async def test_strength_tag_not_duplicated_across_repeated_calls(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")

    updated = None
    for _ in range(8):
        updated = await registry.record_task_result("proj1", agent.id, success=True)

    assert updated.stats.tasks_completed == 8
    assert len(updated.strengths) == 1
    assert updated.strengths.count(updated.strengths[0]) == 1


@pytest.mark.asyncio
async def test_no_strength_or_weakness_before_threshold(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")

    updated = None
    for _ in range(4):
        updated = await registry.record_task_result("proj1", agent.id, success=True)

    assert updated.stats.tasks_completed == 4
    assert updated.strengths == []
    assert updated.weaknesses == []


# --------------------------------------------------------------------------- #
# CTO gate on senior (LEAD/PRINCIPAL) promotions
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_promote_to_senior_needs_no_cto_approval(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")

    agent = await registry.promote("proj1", agent.id, force=True)  # JUNIOR -> MID
    agent = await registry.promote("proj1", agent.id, force=True)  # MID -> SENIOR
    assert agent.level == AgentLevel.SENIOR


@pytest.mark.asyncio
async def test_promote_to_lead_without_approval_raises(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")
    agent = await registry.promote("proj1", agent.id, force=True)  # -> MID
    agent = await registry.promote("proj1", agent.id, force=True)  # -> SENIOR

    with pytest.raises(PromotionNotEligible):
        await registry.promote("proj1", agent.id, force=True)  # -> LEAD, no approval


@pytest.mark.asyncio
async def test_promote_to_lead_with_cto_approval_succeeds(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    org = await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")
    agent = await registry.promote("proj1", agent.id, force=True)  # -> MID
    agent = await registry.promote("proj1", agent.id, force=True)  # -> SENIOR

    promoted = await registry.promote(
        "proj1", agent.id, force=True, approved_by_agent_id=org.leadership.cto_agent_id
    )
    assert promoted.level == AgentLevel.LEAD


@pytest.mark.asyncio
async def test_promote_to_lead_with_wrong_approver_raises_even_with_force(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")
    agent = await registry.promote("proj1", agent.id, force=True)  # -> MID
    agent = await registry.promote("proj1", agent.id, force=True)  # -> SENIOR

    with pytest.raises(PromotionNotEligible):
        await registry.promote(
            "proj1", agent.id, force=True, approved_by_agent_id="not-the-cto"
        )


# --------------------------------------------------------------------------- #
# Retirement
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_retire_marks_agent_inactive(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")
    agent, _ = await registry.get_or_create_agent("proj1", "developer")

    retired = await registry.retire("proj1", agent.id, reason="role no longer needed")
    assert retired.status == AgentStatus.RETIRED
    assert retired.retired_at is not None
    assert retired.retired_reason == "role no longer needed"


@pytest.mark.asyncio
async def test_retire_unknown_agent_raises(monkeypatch):
    registry, db = _patched_registry(monkeypatch)
    await registry.get_or_create_org("proj1")

    with pytest.raises(AgentNotFound):
        await registry.retire("proj1", "does-not-exist", reason="x")


# --------------------------------------------------------------------------- #
# API endpoint wiring
# --------------------------------------------------------------------------- #


def _client_for(monkeypatch, db, user):
    import agent_registry.repository as repo_module
    import api.agent_registry as router_module

    async def _get_db():
        return db

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def _seed_project(db, project_id, user_id):
    db.projects = type(db.engineering_orgs)()
    db.projects.docs.append({"id": project_id, "user_id": user_id, "org_id": None})
    db.team_members = type(db.engineering_orgs)()


def test_get_org_endpoint_seeds_and_returns_org(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    r = client.get("/projects/proj1/org")
    assert r.status_code == 200
    body = r.json()
    assert body["org"]["project_id"] == "proj1"
    assert len(body["agents"]) > 0


def test_get_org_endpoint_denies_other_users(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    other_user = User(id="intruder", email="i@b.com", name="I", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, other_user)

    r = client.get("/projects/proj1/org")
    assert r.status_code == 404


def test_create_agent_endpoint_dynamic_creation(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    client.get("/projects/proj1/org")  # seed org first
    r = client.post("/projects/proj1/org/agents", json={"role": "swift_engineer"})
    assert r.status_code == 200
    body = r.json()
    assert body["created"] is True
    assert body["agent"]["role"] == "swift_engineer"

    # Idempotent: calling again reuses the same agent.
    r2 = client.post("/projects/proj1/org/agents", json={"role": "swift_engineer"})
    assert r2.json()["created"] is False
    assert r2.json()["agent"]["id"] == body["agent"]["id"]


def test_promote_endpoint_rejects_ineligible_agent(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    client.get("/projects/proj1/org")
    create = client.post("/projects/proj1/org/agents", json={"role": "developer"})
    agent_id = create.json()["agent"]["id"]

    r = client.post(f"/projects/proj1/org/agents/{agent_id}/promote", json={})
    assert r.status_code == 400


def test_retire_endpoint(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    client.get("/projects/proj1/org")
    create = client.post("/projects/proj1/org/agents", json={"role": "developer"})
    agent_id = create.json()["agent"]["id"]

    r = client.post(f"/projects/proj1/org/agents/{agent_id}/retire", json={"reason": "done"})
    assert r.status_code == 200
    assert r.json()["status"] == "retired"
