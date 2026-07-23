"""Tests for the Knowledge Graph (backend/agent_registry/knowledge_graph.py).

Covers the graph projection (agents -> owned files, decisions; builds ->
agents/files) built from an in-memory fake Mongo, plus the three read-only
API endpoints on top of it.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from agent_registry.knowledge_graph import EdgeType, KnowledgeGraphService, NodeType
from agent_registry.registry import AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from core.models import User


# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in (agent_profiles/engineering_orgs + builds)
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
        self.builds = FakeCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def _patched_kg(monkeypatch, db=None):
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.repository as repo_module
    import agent_registry.knowledge_graph as kg_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(kg_module, "get_db", _get_db)

    registry = AgentRegistry(repo=AgentRegistryRepository())
    return KnowledgeGraphService(registry=registry), registry, db


# --------------------------------------------------------------------------- #
# build_for_project
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_graph_includes_agent_and_owned_file_nodes(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    await registry.record_task_result("proj1", dev.id, success=True, files_touched=["backend/main.py"])

    graph = await kg.build_for_project("proj1")

    assert dev.id in graph.nodes
    assert graph.nodes[dev.id].type == NodeType.AGENT
    file_id = "file:backend/main.py"
    assert file_id in graph.nodes
    owns_edges = [e for e in graph.edges if e.relation == EdgeType.OWNS]
    assert any(e.source == dev.id and e.target == file_id for e in owns_edges)


@pytest.mark.asyncio
async def test_graph_includes_decision_log_nodes(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "rust_engineer")
    await registry.retire("proj1", dev.id, reason="unused")

    graph = await kg.build_for_project("proj1")
    decision_nodes = [n for n in graph.nodes.values() if n.type == NodeType.DECISION]
    events = {n.label for n in decision_nodes if n.metadata.get("reason") in ("dynamic specialist creation", "unused")}
    assert "created" in events or "retired" in events


@pytest.mark.asyncio
async def test_graph_includes_build_nodes_and_ran_as_edges(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")

    db.builds.docs.append({
        "id": "build-1",
        "project_id": "proj1",
        "status": "success",
        "prompt": "Build a todo app",
        "created_at": "2026-07-24T00:00:00Z",
        "agents": [
            {"agent": "developer", "status": "success", "agent_profile_id": dev.id,
             "files_changed": ["backend/app.py"]},
        ],
    })

    graph = await kg.build_for_project("proj1")

    build_id = "build:build-1"
    assert build_id in graph.nodes
    assert graph.nodes[build_id].type == NodeType.BUILD

    ran_as = [e for e in graph.edges if e.relation == EdgeType.RAN_AS]
    assert any(e.source == build_id and e.target == dev.id for e in ran_as)

    touched_in = [e for e in graph.edges if e.relation == EdgeType.TOUCHED_IN]
    assert any(e.source == "file:backend/app.py" and e.target == build_id for e in touched_in)


@pytest.mark.asyncio
async def test_graph_is_project_scoped(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    await registry.get_or_create_org("proj2")
    dev1, _ = await registry.get_or_create_agent("proj1", "developer")

    graph2 = await kg.build_for_project("proj2")
    assert dev1.id not in graph2.nodes


# --------------------------------------------------------------------------- #
# neighbors / search
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_neighbors_returns_connected_nodes(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    dev, _ = await registry.get_or_create_agent("proj1", "developer")
    await registry.record_task_result("proj1", dev.id, success=True, files_touched=["backend/main.py"])

    neighbors = await kg.neighbors("proj1", dev.id)
    assert any(n.id == "file:backend/main.py" for n in neighbors)


@pytest.mark.asyncio
async def test_search_matches_role_and_file_path(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    react, _ = await registry.get_or_create_agent("proj1", "react_engineer")
    await registry.record_task_result("proj1", react.id, success=True, files_touched=["frontend/src/App.tsx"])

    results = await kg.search("proj1", "react")
    assert any(n.id == react.id for n in results)

    results2 = await kg.search("proj1", "App.tsx")
    assert any(n.id == "file:frontend/src/App.tsx" for n in results2)


# --------------------------------------------------------------------------- #
# API endpoints
# --------------------------------------------------------------------------- #


def _client_for(monkeypatch, db, user):
    import agent_registry.repository as repo_module
    import agent_registry.knowledge_graph as kg_module
    import api.agent_registry as router_module

    async def _get_db():
        return db

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    monkeypatch.setattr(kg_module, "get_db", _get_db)
    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def _seed_project(db, project_id, user_id):
    db.projects = type(db.engineering_orgs)()
    db.projects.docs.append({"id": project_id, "user_id": user_id, "org_id": None})
    db.team_members = type(db.engineering_orgs)()


def test_graph_endpoint_returns_nodes_and_edges(monkeypatch):
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

    r = client.get("/projects/proj1/org/graph")
    assert r.status_code == 200
    body = r.json()
    assert any(n["id"] == agent_id for n in body["nodes"])
    assert any(e["relation"] == "owns" for e in body["edges"])


def test_graph_neighbors_endpoint(monkeypatch):
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

    r = client.get(f"/projects/proj1/org/graph/neighbors?node_id={agent_id}")
    assert r.status_code == 200
    neighbors = r.json()["neighbors"]
    assert any(n["id"] == "file:backend/main.py" for n in neighbors)


def test_graph_search_endpoint(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    client.post("/projects/proj1/org/agents", json={"role": "react_engineer"})

    r = client.get("/projects/proj1/org/graph/search?q=react")
    assert r.status_code == 200
    assert len(r.json()["results"]) >= 1


def test_graph_endpoint_denies_other_users(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    other_user = User(id="intruder", email="i@b.com", name="I", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, other_user)

    r = client.get("/projects/proj1/org/graph")
    assert r.status_code == 404
