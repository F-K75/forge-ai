"""Tests for the Agent Workload aggregation (backend/agent_registry/workload.py).

Covers the read-time aggregation over change_requests and plans against an
in-memory fake Mongo, plus the read-only API endpoint on top of it.
"""

from __future__ import annotations

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from agent_registry.registry import AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from agent_registry.workload import WorkloadService
from core.models import User


# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in (same pattern as test_activity.py)
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
        self.change_requests = FakeCollection()
        self.plans = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def _patched_workload(monkeypatch, db=None):
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.repository as repo_module
    import agent_registry.workload as workload_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(workload_module, "get_db", _get_db)

    registry = AgentRegistry(repo=AgentRegistryRepository())
    return WorkloadService(registry=registry), registry, db


def _cr_doc(
    cr_id,
    project_id,
    author_agent_id,
    *,
    stage="planning",
    pending_reviewer_ids=None,
    title="A change",
):
    return {
        "id": cr_id,
        "project_id": project_id,
        "title": title,
        "description": "",
        "author_agent_id": author_agent_id,
        "changed_paths": [],
        "plan_id": None,
        "stage": stage,
        "suggested_reviewer_ids": [],
        "pending_reviewer_ids": pending_reviewer_ids or [],
        "reviews": [],
        "history": [],
        "created_at": "2026-07-20T00:00:00Z",
        "updated_at": "2026-07-20T00:00:00Z",
    }


def _plan_doc(plan_id, project_id, *, status="draft", tasks=None):
    return {
        "id": plan_id,
        "project_id": project_id,
        "objective": "Ship something",
        "status": status,
        "tasks": tasks or [],
        "affected_paths": [],
        "risk_level": "low",
        "risk_notes": "",
        "rollback_strategy": "",
        "success_metrics": [],
        "created_at": "2026-07-20T00:00:00Z",
        "updated_at": "2026-07-20T00:00:00Z",
        "approved_by_agent_id": None,
        "decided_at": None,
    }


def _task(agent_id, description="Do the thing", role="developer", department="engineering"):
    return {
        "id": f"task_{agent_id}",
        "role": role,
        "department": department,
        "agent_id": agent_id,
        "description": description,
        "depends_on": [],
    }


# --------------------------------------------------------------------------- #
# open_change_requests_authored
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_open_authored_change_request_counts(monkeypatch):
    service, registry, db = _patched_workload(monkeypatch)
    await registry.get_or_create_org("proj1")
    author, _ = await registry.get_or_create_agent("proj1", "developer")

    db.change_requests.docs.append(
        _cr_doc("cr-1", "proj1", author.id, stage="implementing")
    )

    workload = await service.get_workload("proj1")

    entry = next(s for s in workload if s.agent_id == author.id)
    assert entry.open_change_requests_authored == 1
    assert entry.open_change_requests_authored_ids == ["cr-1"]


@pytest.mark.asyncio
async def test_merged_change_request_does_not_count_as_open(monkeypatch):
    service, registry, db = _patched_workload(monkeypatch)
    await registry.get_or_create_org("proj1")
    author, _ = await registry.get_or_create_agent("proj1", "developer")

    db.change_requests.docs.append(_cr_doc("cr-1", "proj1", author.id, stage="merged"))

    workload = await service.get_workload("proj1")

    assert not any(s.agent_id == author.id for s in workload)


@pytest.mark.asyncio
async def test_rejected_change_request_does_not_count_as_open(monkeypatch):
    service, registry, db = _patched_workload(monkeypatch)
    await registry.get_or_create_org("proj1")
    author, _ = await registry.get_or_create_agent("proj1", "developer")

    db.change_requests.docs.append(_cr_doc("cr-1", "proj1", author.id, stage="rejected"))

    workload = await service.get_workload("proj1")

    assert not any(s.agent_id == author.id for s in workload)


# --------------------------------------------------------------------------- #
# pending_reviews
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_pending_reviewer_shows_up_under_pending_reviews(monkeypatch):
    service, registry, db = _patched_workload(monkeypatch)
    await registry.get_or_create_org("proj1")
    author, _ = await registry.get_or_create_agent("proj1", "developer")
    reviewer, _ = await registry.get_or_create_agent("proj1", "qa_engineer")

    db.change_requests.docs.append(
        _cr_doc("cr-1", "proj1", author.id, stage="peer_review", pending_reviewer_ids=[reviewer.id])
    )

    workload = await service.get_workload("proj1")

    entry = next(s for s in workload if s.agent_id == reviewer.id)
    assert entry.pending_reviews == 1
    assert entry.pending_review_ids == ["cr-1"]
    # The reviewer didn't author it, so their authored count stays 0.
    assert entry.open_change_requests_authored == 0


@pytest.mark.asyncio
async def test_rejected_change_request_does_not_count_as_pending_review(monkeypatch):
    # A change request can be rejected (a terminal stage) via advance()
    # directly, without submit_review() ever being called to clear
    # pending_reviewer_ids -- so a reviewer left in that list on a REJECTED
    # (dead) change request must not still show up as "on their plate",
    # the same way a rejected/merged change request no longer counts under
    # open_change_requests_authored.
    service, registry, db = _patched_workload(monkeypatch)
    await registry.get_or_create_org("proj1")
    author, _ = await registry.get_or_create_agent("proj1", "developer")
    reviewer, _ = await registry.get_or_create_agent("proj1", "qa_engineer")

    db.change_requests.docs.append(
        _cr_doc("cr-1", "proj1", author.id, stage="rejected", pending_reviewer_ids=[reviewer.id])
    )

    workload = await service.get_workload("proj1")

    assert not any(s.agent_id == reviewer.id for s in workload)


# --------------------------------------------------------------------------- #
# open_plan_tasks
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_task_in_approved_plan_counts_as_open_plan_task(monkeypatch):
    service, registry, db = _patched_workload(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    db.plans.docs.append(
        _plan_doc("plan-1", "proj1", status="approved", tasks=[_task(dev.id, description="Build the API")])
    )

    workload = await service.get_workload("proj1")

    entry = next(s for s in workload if s.agent_id == dev.id)
    assert entry.open_plan_tasks == 1
    assert entry.open_plan_task_descriptions == ["Build the API"]


@pytest.mark.asyncio
async def test_task_in_draft_plan_does_not_count(monkeypatch):
    service, registry, db = _patched_workload(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    db.plans.docs.append(
        _plan_doc("plan-1", "proj1", status="draft", tasks=[_task(dev.id)])
    )

    workload = await service.get_workload("proj1")

    assert not any(s.agent_id == dev.id for s in workload)


@pytest.mark.asyncio
async def test_task_in_rejected_plan_does_not_count(monkeypatch):
    service, registry, db = _patched_workload(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    db.plans.docs.append(
        _plan_doc("plan-1", "proj1", status="rejected", tasks=[_task(dev.id)])
    )

    workload = await service.get_workload("proj1")

    assert not any(s.agent_id == dev.id for s in workload)


# --------------------------------------------------------------------------- #
# Inclusion policy: zero-workload agents are omitted
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_zero_workload_agent_is_omitted(monkeypatch):
    service, registry, db = _patched_workload(monkeypatch)
    await registry.get_or_create_org("proj1")
    idle, _ = await registry.get_or_create_agent("proj1", "developer")
    busy, _ = await registry.get_or_create_agent("proj1", "qa_engineer")

    db.change_requests.docs.append(_cr_doc("cr-1", "proj1", busy.id, stage="implementing"))

    workload = await service.get_workload("proj1")

    assert any(s.agent_id == busy.id for s in workload)
    assert not any(s.agent_id == idle.id for s in workload)


# --------------------------------------------------------------------------- #
# Sorting and project scoping
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_results_sorted_by_total_workload_descending(monkeypatch):
    service, registry, db = _patched_workload(monkeypatch)
    await registry.get_or_create_org("proj1")
    light, _ = await registry.get_or_create_agent("proj1", "developer")
    heavy, _ = await registry.get_or_create_agent("proj1", "qa_engineer")

    db.change_requests.docs.append(_cr_doc("cr-1", "proj1", light.id, stage="implementing"))
    db.change_requests.docs.append(_cr_doc("cr-2", "proj1", heavy.id, stage="implementing"))
    db.change_requests.docs.append(
        _cr_doc("cr-3", "proj1", light.id, stage="peer_review", pending_reviewer_ids=[heavy.id])
    )
    db.plans.docs.append(
        _plan_doc("plan-1", "proj1", status="approved", tasks=[_task(heavy.id), _task(heavy.id, description="Second task")])
    )

    workload = await service.get_workload("proj1")

    ids_in_order = [s.agent_id for s in workload]
    assert ids_in_order.index(heavy.id) < ids_in_order.index(light.id)


@pytest.mark.asyncio
async def test_workload_is_project_scoped(monkeypatch):
    service, registry, db = _patched_workload(monkeypatch)
    await registry.get_or_create_org("proj1")
    await registry.get_or_create_org("proj2")
    dev1, _ = await registry.get_or_create_agent("proj1", "developer")

    db.change_requests.docs.append(_cr_doc("cr-1", "proj1", dev1.id, stage="implementing"))

    workload_proj2 = await service.get_workload("proj2")
    assert not any(s.agent_id == dev1.id for s in workload_proj2)

    workload_proj1 = await service.get_workload("proj1")
    assert any(s.agent_id == dev1.id for s in workload_proj1)


# --------------------------------------------------------------------------- #
# API endpoint
# --------------------------------------------------------------------------- #


def _client_for(monkeypatch, db, user):
    import agent_registry.repository as repo_module
    import agent_registry.workload as workload_module
    import api.workload as router_module

    async def _get_db():
        return db

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(workload_module, "get_db", _get_db)
    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def _seed_project(db, project_id, user_id):
    db.projects = type(db.engineering_orgs)()
    db.projects.docs.append({"id": project_id, "user_id": user_id, "org_id": None})
    db.team_members = type(db.engineering_orgs)()


def _create_agent(db, project_id, role="developer"):
    """Seed an agent directly via the registry (no agent-registry router
    mounted in these tests)."""
    import agent_registry.repository as repo_module

    async def _get_db():
        return db

    orig = repo_module.get_db
    repo_module.get_db = _get_db
    try:
        registry = AgentRegistry(repo=AgentRegistryRepository())
        agent, _ = asyncio.run(registry.get_or_create_agent(project_id, role))
    finally:
        repo_module.get_db = orig
    return agent


def test_workload_endpoint_returns_agents(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    dev = _create_agent(db, "proj1")

    db.change_requests.docs.append(_cr_doc("cr-1", "proj1", dev.id, stage="implementing"))

    client = _client_for(monkeypatch, db, user)
    r = client.get("/projects/proj1/workload")
    assert r.status_code == 200, r.text
    agents = r.json()["agents"]
    assert any(a["agent_id"] == dev.id for a in agents)


def test_workload_endpoint_denies_other_users(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    other_user = User(id="intruder", email="i@b.com", name="I", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, other_user)

    r = client.get("/projects/proj1/workload")
    assert r.status_code == 404
