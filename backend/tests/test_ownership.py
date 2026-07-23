"""Tests for code ownership (backend/agent_registry/ownership.py).

Covers the CodeOwnership service against an in-memory fake Mongo (reverse
path lookup, change classification, per-agent summary) and the two API
endpoints built on top of it.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from agent_registry.ownership import CodeOwnership
from agent_registry.registry import AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from core.models import User


# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in (same shape as test_agent_registry.py's fake)
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


def _patched_ownership(monkeypatch, db=None):
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.repository as repo_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    registry = AgentRegistry(repo=AgentRegistryRepository())
    return CodeOwnership(registry=registry), registry, db


# --------------------------------------------------------------------------- #
# owners_for_paths / check_change
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_check_change_classifies_unclaimed_owned_and_other(monkeypatch):
    ownership, registry, db = _patched_ownership(monkeypatch)
    await registry.get_or_create_org("proj1")

    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    react, _ = await registry.get_or_create_agent("proj1", "react_engineer")

    await registry.record_task_result(
        "proj1", dev.id, success=True, files_touched=["backend/main.py"]
    )
    await registry.record_task_result(
        "proj1", react.id, success=True, files_touched=["frontend/src/App.tsx"]
    )

    results = await ownership.check_change(
        "proj1", dev.id, ["backend/main.py", "frontend/src/App.tsx", "docs/README.md"]
    )
    by_path = {r.path: r for r in results}

    assert by_path["backend/main.py"].status == "owned_by_you"
    assert by_path["frontend/src/App.tsx"].status == "owned_by_other"
    assert by_path["frontend/src/App.tsx"].owner_agent_id == react.id
    assert by_path["docs/README.md"].status == "unclaimed"


@pytest.mark.asyncio
async def test_owners_for_paths_returns_all_agents_touching_a_path(monkeypatch):
    ownership, registry, db = _patched_ownership(monkeypatch)
    await registry.get_or_create_org("proj1")

    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    debugger, _ = await registry.get_or_create_agent("proj1", "debugger")

    await registry.record_task_result("proj1", dev.id, success=True, files_touched=["backend/app.py"])
    await registry.record_task_result("proj1", debugger.id, success=True, files_touched=["backend/app.py"])

    owners = await ownership.owners_for_paths("proj1", ["backend/app.py"])
    ids = {o.agent_id for o in owners["backend/app.py"]}
    assert ids == {dev.id, debugger.id}


@pytest.mark.asyncio
async def test_ownership_is_project_scoped(monkeypatch):
    ownership, registry, db = _patched_ownership(monkeypatch)
    await registry.get_or_create_org("proj1")
    await registry.get_or_create_org("proj2")

    dev1, _ = await registry.get_or_create_agent("proj1", "developer")
    await registry.record_task_result("proj1", dev1.id, success=True, files_touched=["shared/util.py"])

    owners_proj2 = await ownership.owners_for_paths("proj2", ["shared/util.py"])
    assert owners_proj2["shared/util.py"] == []


# --------------------------------------------------------------------------- #
# ownership_summary
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_ownership_summary_buckets_by_top_level_dir(monkeypatch):
    ownership, registry, db = _patched_ownership(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    await registry.record_task_result(
        "proj1", dev.id, success=True,
        files_touched=["frontend/a.tsx", "frontend/b.tsx", "backend/main.py"],
    )

    summary = await ownership.ownership_summary("proj1")
    entry = next(s for s in summary if s.agent_id == dev.id)
    assert entry.file_count == 3
    assert entry.top_level_breakdown == {"frontend": 2, "backend": 1}


@pytest.mark.asyncio
async def test_ownership_summary_omits_agents_with_no_files(monkeypatch):
    ownership, registry, db = _patched_ownership(monkeypatch)
    org = await registry.get_or_create_org("proj1")

    summary = await ownership.ownership_summary("proj1")
    # Freshly seeded org: no agent has touched any files yet.
    assert summary == []


# --------------------------------------------------------------------------- #
# API endpoints
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


def test_ownership_summary_endpoint(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    create = client.post("/projects/proj1/org/agents", json={"role": "developer"})
    agent_id = create.json()["agent"]["id"]
    client.post(
        f"/projects/proj1/org/agents/{agent_id}/tasks",
        json={"success": True, "files_touched": ["backend/main.py"]},
    )

    r = client.get("/projects/proj1/org/ownership")
    assert r.status_code == 200
    summary = r.json()["summary"]
    assert len(summary) == 1
    assert summary[0]["agent_id"] == agent_id
    assert summary[0]["top_level_breakdown"] == {"backend": 1}


def test_ownership_check_endpoint(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    create = client.post("/projects/proj1/org/agents", json={"role": "developer"})
    agent_id = create.json()["agent"]["id"]
    client.post(
        f"/projects/proj1/org/agents/{agent_id}/tasks",
        json={"success": True, "files_touched": ["backend/main.py"]},
    )

    r = client.post(
        "/projects/proj1/org/ownership/check",
        json={"agent_id": agent_id, "paths": ["backend/main.py", "new/file.py"]},
    )
    assert r.status_code == 200
    results = {item["path"]: item["status"] for item in r.json()["results"]}
    assert results["backend/main.py"] == "owned_by_you"
    assert results["new/file.py"] == "unclaimed"


def test_ownership_endpoints_deny_other_users(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    other_user = User(id="intruder", email="i@b.com", name="I", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, other_user)

    r = client.get("/projects/proj1/org/ownership")
    assert r.status_code == 404
