"""Tests for Repository Memory (backend/agent_registry/repo_memory.py).

Covers the RepositoryMemoryService against an in-memory fake Mongo
(get-or-create, partial update semantics, agent validation, list-field
round-tripping, project scoping) and the API endpoints on top of it.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from agent_registry.registry import AgentNotFound, AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from agent_registry.repo_memory import (
    RepositoryMemoryRepository,
    RepositoryMemoryService,
)
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
        self.repository_memory = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def _patched_service(monkeypatch, db=None):
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.repo_memory as repo_memory_module
    import agent_registry.repository as repo_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(repo_memory_module, "get_db", _get_db)

    registry = AgentRegistry(repo=AgentRegistryRepository())
    service = RepositoryMemoryService(registry=registry, repo=RepositoryMemoryRepository())
    return service, registry, db


# --------------------------------------------------------------------------- #
# get_or_create()
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_get_or_create_returns_empty_doc_on_first_call(monkeypatch):
    service, registry, db = _patched_service(monkeypatch)

    memory = await service.get_or_create("proj1")

    assert memory.project_id == "proj1"
    assert memory.architecture_summary == ""
    assert memory.tech_stack == []
    assert memory.api_map == []
    assert memory.known_issues == []
    assert memory.database_schema_notes == ""
    assert memory.roadmap_notes == ""
    assert memory.design_system_notes == ""
    assert memory.updated_by_agent_id is None


@pytest.mark.asyncio
async def test_get_or_create_returns_same_doc_on_second_call(monkeypatch):
    service, registry, db = _patched_service(monkeypatch)

    first = await service.get_or_create("proj1")
    second = await service.get_or_create("proj1")

    assert first.id == second.id
    assert len(db.repository_memory.docs) == 1


# --------------------------------------------------------------------------- #
# update()
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_update_partial_field_set_only_changes_those_fields(monkeypatch):
    service, registry, db = _patched_service(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    await service.update(
        "proj1",
        updated_by_agent_id=dev.id,
        architecture_summary="Layered pipeline: Prompt Builder -> AI Optimizer -> AI Gateway.",
        tech_stack=["FastAPI", "Mongo", "React"],
    )

    updated = await service.update(
        "proj1",
        updated_by_agent_id=dev.id,
        known_issues=["Flaky CI on windows runners"],
    )

    # The fields set in the first update are untouched by the second, which
    # only touched known_issues.
    assert updated.architecture_summary == "Layered pipeline: Prompt Builder -> AI Optimizer -> AI Gateway."
    assert updated.tech_stack == ["FastAPI", "Mongo", "React"]
    assert updated.known_issues == ["Flaky CI on windows runners"]
    assert updated.database_schema_notes == ""
    assert updated.roadmap_notes == ""
    assert updated.design_system_notes == ""
    assert updated.updated_by_agent_id == dev.id


@pytest.mark.asyncio
async def test_update_unknown_agent_raises(monkeypatch):
    service, registry, db = _patched_service(monkeypatch)
    await registry.get_or_create_org("proj1")

    with pytest.raises(AgentNotFound):
        await service.update("proj1", updated_by_agent_id="does-not-exist", architecture_summary="x")


@pytest.mark.asyncio
async def test_list_fields_round_trip(monkeypatch):
    service, registry, db = _patched_service(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    api_map = [
        {"method": "GET", "path": "/v1/projects/{project_id}/memory", "description": "Fetch repo memory"},
        {"method": "PUT", "path": "/v1/projects/{project_id}/memory", "description": "Update repo memory"},
    ]
    tech_stack = ["FastAPI", "Motor", "Pydantic"]
    known_issues = ["No auto-introspection yet", "Manual edits only"]

    await service.update(
        "proj1",
        updated_by_agent_id=dev.id,
        api_map=api_map,
        tech_stack=tech_stack,
        known_issues=known_issues,
    )

    fetched = await service.get_or_create("proj1")
    assert fetched.api_map == api_map
    assert fetched.tech_stack == tech_stack
    assert fetched.known_issues == known_issues


@pytest.mark.asyncio
async def test_memory_is_project_scoped(monkeypatch):
    service, registry, db = _patched_service(monkeypatch)
    await registry.get_or_create_org("proj1")
    await registry.get_or_create_org("proj2")
    dev1, _ = await registry.get_or_create_agent("proj1", "developer")

    await service.update("proj1", updated_by_agent_id=dev1.id, architecture_summary="proj1 architecture")

    proj2_memory = await service.get_or_create("proj2")
    assert proj2_memory.architecture_summary == ""
    assert proj2_memory.project_id == "proj2"

    proj1_memory = await service.get_or_create("proj1")
    assert proj1_memory.architecture_summary == "proj1 architecture"


# --------------------------------------------------------------------------- #
# API endpoints
# --------------------------------------------------------------------------- #


def _client_for(monkeypatch, db, user):
    import agent_registry.repo_memory as repo_memory_module
    import agent_registry.repository as repo_module
    import api.repo_memory as router_module

    async def _get_db():
        return db

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(repo_memory_module, "get_db", _get_db)
    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def _seed_project(db, project_id, user_id):
    db.projects = type(db.engineering_orgs)()
    db.projects.docs.append({"id": project_id, "user_id": user_id, "org_id": None})
    db.team_members = type(db.engineering_orgs)()


def _create_agent(db, project_id):
    """Seed a developer agent directly via the registry (no agent-registry
    router mounted in these tests) so PUT requests have a valid actor."""
    import asyncio

    registry = AgentRegistry(repo=AgentRegistryRepository())

    async def _get_db():
        return db

    import agent_registry.repository as repo_module

    orig = repo_module.get_db
    repo_module.get_db = _get_db
    try:
        # asyncio.run() always creates and cleanly tears down its own fresh
        # event loop, unlike asyncio.get_event_loop() -- which, called from
        # sync code with no loop already set on this thread, raises
        # "There is no current event loop" (the exact pre-existing bug
        # behind this codebase's flaky test_circuit_breaker.py/
        # test_ai_gateway.py failures) whenever it runs after another test
        # has already closed out its own loop.
        agent, _ = asyncio.run(registry.get_or_create_agent(project_id, "developer"))
    finally:
        repo_module.get_db = orig
    return agent


def test_get_memory_endpoint_creates_if_missing(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    r = client.get("/projects/proj1/memory")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["project_id"] == "proj1"
    assert body["architecture_summary"] == ""
    assert body["tech_stack"] == []

    r2 = client.get("/projects/proj1/memory")
    assert r2.status_code == 200
    assert r2.json()["id"] == body["id"]


def test_put_memory_endpoint_updates_and_returns_doc(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)
    dev = _create_agent(db, "proj1")

    r = client.put(
        "/projects/proj1/memory",
        json={
            "updated_by_agent_id": dev.id,
            "architecture_summary": "Layered pipeline",
            "tech_stack": ["FastAPI", "Mongo"],
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["architecture_summary"] == "Layered pipeline"
    assert body["tech_stack"] == ["FastAPI", "Mongo"]
    assert body["updated_by_agent_id"] == dev.id

    # A second, narrower update leaves the previously-set fields intact.
    r2 = client.put(
        "/projects/proj1/memory",
        json={"updated_by_agent_id": dev.id, "known_issues": ["Flaky test"]},
    )
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    assert body2["known_issues"] == ["Flaky test"]
    assert body2["architecture_summary"] == "Layered pipeline"
    assert body2["tech_stack"] == ["FastAPI", "Mongo"]


def test_put_memory_endpoint_unknown_agent_404(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    r = client.put(
        "/projects/proj1/memory",
        json={"updated_by_agent_id": "does-not-exist", "architecture_summary": "x"},
    )
    assert r.status_code == 404


def test_memory_endpoints_deny_other_users(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    other_user = User(id="intruder", email="i@b.com", name="I", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, other_user)

    r = client.get("/projects/proj1/memory")
    assert r.status_code == 404

    r2 = client.put(
        "/projects/proj1/memory",
        json={"updated_by_agent_id": "some-agent", "architecture_summary": "x"},
    )
    assert r2.status_code == 404
