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
        self.change_requests = FakeCollection()
        self.team_messages = FakeCollection()
        self.repository_memory = FakeCollection()

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


@pytest.mark.asyncio
async def test_graph_includes_change_request_node_with_authored_and_touches_edges(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    author, _ = await registry.get_or_create_agent("proj1", "developer")

    db.change_requests.docs.append({
        "id": "cr-1",
        "project_id": "proj1",
        "title": "Add login endpoint",
        "description": "Implements the login endpoint",
        "author_agent_id": author.id,
        "changed_paths": ["backend/api/auth.py"],
        "stage": "planning",
        "suggested_reviewer_ids": [],
        "pending_reviewer_ids": [],
        "reviews": [],
        "history": [],
        "created_at": "2026-07-24T00:00:00Z",
        "updated_at": "2026-07-24T00:00:00Z",
    })

    graph = await kg.build_for_project("proj1")

    cr_id = "cr:cr-1"
    assert cr_id in graph.nodes
    assert graph.nodes[cr_id].type == NodeType.CHANGE_REQUEST
    assert graph.nodes[cr_id].label == "Add login endpoint"

    authored = [e for e in graph.edges if e.relation == EdgeType.AUTHORED]
    assert any(e.source == author.id and e.target == cr_id for e in authored)

    file_id = "file:backend/api/auth.py"
    assert file_id in graph.nodes
    touches = [e for e in graph.edges if e.relation == EdgeType.TOUCHES]
    assert any(e.source == cr_id and e.target == file_id for e in touches)


@pytest.mark.asyncio
async def test_graph_includes_change_request_suggested_reviewer_edges(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    author, _ = await registry.get_or_create_agent("proj1", "developer")
    reviewer, _ = await registry.get_or_create_agent("proj1", "react_engineer")

    db.change_requests.docs.append({
        "id": "cr-2",
        "project_id": "proj1",
        "title": "Add checkout flow",
        "description": "",
        "author_agent_id": author.id,
        "changed_paths": [],
        "stage": "peer_review",
        "suggested_reviewer_ids": [reviewer.id],
        "pending_reviewer_ids": [reviewer.id],
        "reviews": [],
        "history": [],
        "created_at": "2026-07-24T00:00:00Z",
        "updated_at": "2026-07-24T00:00:00Z",
    })

    graph = await kg.build_for_project("proj1")

    cr_id = "cr:cr-2"
    suggested = [e for e in graph.edges if e.relation == EdgeType.SUGGESTED_REVIEWER]
    assert any(e.source == cr_id and e.target == reviewer.id for e in suggested)


@pytest.mark.asyncio
async def test_graph_includes_message_node_with_sent_and_addressed_to_edges(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    sender, _ = await registry.get_or_create_agent("proj1", "developer")
    recipient, _ = await registry.get_or_create_agent("proj1", "react_engineer")

    db.team_messages.docs.append({
        "id": "msg-1",
        "project_id": "proj1",
        "thread_id": "thread-1",
        "reply_to_id": None,
        "message_type": "review_request",
        "from_agent_id": sender.id,
        "to_agent_ids": [recipient.id],
        "content": "Could you take a look at this change request?",
        "context": {},
        "created_at": "2026-07-24T00:00:00Z",
    })

    graph = await kg.build_for_project("proj1")

    msg_id = "msg:msg-1"
    assert msg_id in graph.nodes
    assert graph.nodes[msg_id].type == NodeType.MESSAGE
    assert graph.nodes[msg_id].label == "Could you take a look at this change request?"

    sent = [e for e in graph.edges if e.relation == EdgeType.SENT]
    assert any(e.source == sender.id and e.target == msg_id for e in sent)

    addressed_to = [e for e in graph.edges if e.relation == EdgeType.ADDRESSED_TO]
    assert any(e.source == msg_id and e.target == recipient.id for e in addressed_to)


@pytest.mark.asyncio
async def test_graph_change_requests_and_messages_are_project_scoped(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    await registry.get_or_create_org("proj2")
    author, _ = await registry.get_or_create_agent("proj1", "developer")

    db.change_requests.docs.append({
        "id": "cr-3",
        "project_id": "proj1",
        "title": "Proj1-only change",
        "description": "",
        "author_agent_id": author.id,
        "changed_paths": [],
        "stage": "planning",
        "suggested_reviewer_ids": [],
        "pending_reviewer_ids": [],
        "reviews": [],
        "history": [],
        "created_at": "2026-07-24T00:00:00Z",
        "updated_at": "2026-07-24T00:00:00Z",
    })
    db.team_messages.docs.append({
        "id": "msg-2",
        "project_id": "proj1",
        "thread_id": "thread-2",
        "reply_to_id": None,
        "message_type": "comment",
        "from_agent_id": author.id,
        "to_agent_ids": [],
        "content": "Proj1-only message",
        "context": {},
        "created_at": "2026-07-24T00:00:00Z",
    })

    graph2 = await kg.build_for_project("proj2")
    assert "cr:cr-3" not in graph2.nodes
    assert "msg:msg-2" not in graph2.nodes


# --------------------------------------------------------------------------- #
# repository_memory
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_graph_includes_repository_memory_node_with_metadata(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    author, _ = await registry.get_or_create_agent("proj1", "developer")

    db.repository_memory.docs.append({
        "id": "repomem_1",
        "project_id": "proj1",
        "architecture_summary": "A layered pipeline: Prompt Builder -> AI Optimizer -> AI Gateway -> providers.",
        "tech_stack": ["FastAPI", "Mongo", "React"],
        "api_map": [{"method": "GET", "path": "/v1/projects", "description": "List projects"}],
        "database_schema_notes": "Mongo collections keyed by project_id.",
        "known_issues": ["Circuit breaker flaps under load"],
        "roadmap_notes": "Ship the knowledge graph next.",
        "design_system_notes": "Uses shadcn/ui + Tailwind.",
        "created_at": "2026-07-24T00:00:00Z",
        "updated_at": "2026-07-24T00:00:00Z",
        "updated_by_agent_id": author.id,
    })

    graph = await kg.build_for_project("proj1")

    mem_id = "memory:repomem_1"
    assert mem_id in graph.nodes
    node = graph.nodes[mem_id]
    assert node.type == NodeType.REPOSITORY_MEMORY
    assert node.label == "Repository Memory"
    assert node.metadata["tech_stack"] == ["FastAPI", "Mongo", "React"]
    assert node.metadata["known_issues"] == ["Circuit breaker flaps under load"]
    assert node.metadata["api_map"] == [{"method": "GET", "path": "/v1/projects", "description": "List projects"}]
    assert node.metadata["architecture_summary"].startswith("A layered pipeline")


@pytest.mark.asyncio
async def test_repository_memory_truncates_long_text_fields(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")

    long_text = "x" * 1000
    db.repository_memory.docs.append({
        "id": "repomem_2",
        "project_id": "proj1",
        "architecture_summary": long_text,
        "tech_stack": [],
        "api_map": [],
        "database_schema_notes": long_text,
        "known_issues": [],
        "roadmap_notes": long_text,
        "design_system_notes": long_text,
        "created_at": "2026-07-24T00:00:00Z",
        "updated_at": "2026-07-24T00:00:00Z",
        "updated_by_agent_id": None,
    })

    graph = await kg.build_for_project("proj1")

    node = graph.nodes["memory:repomem_2"]
    assert len(node.metadata["architecture_summary"]) < len(long_text)
    assert len(node.metadata["database_schema_notes"]) < len(long_text)
    assert len(node.metadata["roadmap_notes"]) < len(long_text)
    assert len(node.metadata["design_system_notes"]) < len(long_text)


@pytest.mark.asyncio
async def test_repository_memory_search_finds_architecture_and_tech_stack_terms(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")

    db.repository_memory.docs.append({
        "id": "repomem_3",
        "project_id": "proj1",
        "architecture_summary": "Uses a bespoke Zephyrine caching layer.",
        "tech_stack": ["QuantumDB"],
        "api_map": [],
        "database_schema_notes": "",
        "known_issues": ["Flaky Widgetronic export job"],
        "roadmap_notes": "",
        "design_system_notes": "",
        "created_at": "2026-07-24T00:00:00Z",
        "updated_at": "2026-07-24T00:00:00Z",
        "updated_by_agent_id": None,
    })

    results = await kg.search("proj1", "zephyrine")
    assert any(n.id == "memory:repomem_3" for n in results)

    results2 = await kg.search("proj1", "quantumdb")
    assert any(n.id == "memory:repomem_3" for n in results2)

    results3 = await kg.search("proj1", "widgetronic")
    assert any(n.id == "memory:repomem_3" for n in results3)


@pytest.mark.asyncio
async def test_repository_memory_updated_by_edge_present_when_agent_set(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    updater, _ = await registry.get_or_create_agent("proj1", "developer")

    db.repository_memory.docs.append({
        "id": "repomem_4",
        "project_id": "proj1",
        "architecture_summary": "",
        "tech_stack": [],
        "api_map": [],
        "database_schema_notes": "",
        "known_issues": [],
        "roadmap_notes": "",
        "design_system_notes": "",
        "created_at": "2026-07-24T00:00:00Z",
        "updated_at": "2026-07-24T00:00:00Z",
        "updated_by_agent_id": updater.id,
    })

    graph = await kg.build_for_project("proj1")

    mem_id = "memory:repomem_4"
    updated_by = [e for e in graph.edges if e.relation == EdgeType.UPDATED_BY]
    # actor-as-source, matching OWNS/AUTHORED/SENT/DECIDED: the agent is the
    # source, the memory node is the target.
    assert any(e.source == updater.id and e.target == mem_id for e in updated_by)


@pytest.mark.asyncio
async def test_repository_memory_no_updated_by_edge_when_agent_id_none(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")

    db.repository_memory.docs.append({
        "id": "repomem_5",
        "project_id": "proj1",
        "architecture_summary": "",
        "tech_stack": [],
        "api_map": [],
        "database_schema_notes": "",
        "known_issues": [],
        "roadmap_notes": "",
        "design_system_notes": "",
        "created_at": "2026-07-24T00:00:00Z",
        "updated_at": "2026-07-24T00:00:00Z",
        "updated_by_agent_id": None,
    })

    graph = await kg.build_for_project("proj1")

    mem_id = "memory:repomem_5"
    assert mem_id in graph.nodes
    updated_by = [e for e in graph.edges if e.relation == EdgeType.UPDATED_BY]
    assert not any(e.target == mem_id for e in updated_by)


@pytest.mark.asyncio
async def test_repository_memory_is_project_scoped(monkeypatch):
    kg, registry, db = _patched_kg(monkeypatch)
    await registry.get_or_create_org("proj1")
    await registry.get_or_create_org("proj2")

    db.repository_memory.docs.append({
        "id": "repomem_6",
        "project_id": "proj1",
        "architecture_summary": "Proj1-only architecture notes.",
        "tech_stack": [],
        "api_map": [],
        "database_schema_notes": "",
        "known_issues": [],
        "roadmap_notes": "",
        "design_system_notes": "",
        "created_at": "2026-07-24T00:00:00Z",
        "updated_at": "2026-07-24T00:00:00Z",
        "updated_by_agent_id": None,
    })

    graph2 = await kg.build_for_project("proj2")
    assert "memory:repomem_6" not in graph2.nodes

    graph1 = await kg.build_for_project("proj1")
    assert "memory:repomem_6" in graph1.nodes


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
