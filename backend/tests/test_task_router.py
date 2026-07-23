"""Tests for the Intelligent Task Router (backend/agent_registry/task_router.py).

Covers the keyword classifier in isolation, the TaskRouter service (which
resolves/creates persistent agents for each match) against an in-memory fake
Mongo, and the `/route` API endpoint.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from agent_registry.registry import AgentRegistry
from agent_registry.repository import AgentRegistryRepository
from agent_registry.task_router import TaskRouter, classify
from core.models import User


# --------------------------------------------------------------------------- #
# classify() -- pure function, no DB
# --------------------------------------------------------------------------- #


def test_classify_matches_frontend_and_performance_for_dashboard_perf():
    matches = classify("Improve dashboard performance")
    roles = {m.role for m in matches}
    assert "react_engineer" in roles  # "dashboard"
    assert "performance_engineer" in roles  # "performance"


def test_classify_ranks_more_keyword_hits_higher():
    matches = classify("Fix the slow, latency-heavy caching layer performance issue")
    assert matches[0].role == "performance_engineer"
    assert matches[0].score >= 2


def test_classify_security_request():
    # max_matches raised so ties with the default top-3 cap don't hide a
    # correctly-scored match -- this test is about recognizing both signals,
    # not about the ranking cutoff.
    matches = classify("There's a SQL injection vulnerability in the login endpoint", max_matches=5)
    roles = {m.role for m in matches}
    assert "security_engineer" in roles
    assert "auth_engineer" in roles


def test_classify_falls_back_to_generic_developer_when_nothing_matches():
    matches = classify("asdkjfh qwerty nonsense request")
    assert len(matches) == 1
    assert matches[0].role == "developer"
    assert matches[0].department == "specialists"
    assert matches[0].score == 0


def test_classify_respects_max_matches():
    matches = classify("api database auth performance security testing docs release research", max_matches=2)
    assert len(matches) == 2


# --------------------------------------------------------------------------- #
# TaskRouter -- against a fake Mongo
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


def _patched_router(monkeypatch, db=None):
    db = db or FakeDB()

    async def _get_db():
        return db

    import agent_registry.repository as repo_module

    monkeypatch.setattr(repo_module, "get_db", _get_db)
    registry = AgentRegistry(repo=AgentRegistryRepository())
    return TaskRouter(registry=registry), db


@pytest.mark.asyncio
async def test_route_resolves_persistent_agents(monkeypatch):
    router, db = _patched_router(monkeypatch)

    assignments = await router.route("proj1", "Improve dashboard performance")
    roles = {a.role for a in assignments}
    assert "react_engineer" in roles
    assert "performance_engineer" in roles
    assert all(a.agent_id for a in assignments)


@pytest.mark.asyncio
async def test_route_reuses_same_agent_across_calls(monkeypatch):
    router, db = _patched_router(monkeypatch)

    first = await router.route("proj1", "Optimize API endpoint latency")
    second = await router.route("proj1", "Another API endpoint is slow")

    first_api = next(a for a in first if a.role == "api_engineer")
    second_api = next(a for a in second if a.role == "api_engineer")
    assert first_api.agent_id == second_api.agent_id


@pytest.mark.asyncio
async def test_route_is_project_scoped(monkeypatch):
    router, db = _patched_router(monkeypatch)

    a1 = await router.route("proj1", "database query is slow")
    a2 = await router.route("proj2", "database query is slow")

    id1 = next(a.agent_id for a in a1 if a.role == "database_engineer")
    id2 = next(a.agent_id for a in a2 if a.role == "database_engineer")
    assert id1 != id2


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


def test_route_endpoint_returns_assignments(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "u1")
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, user)

    r = client.post("/projects/proj1/org/route", json={"request": "Improve dashboard performance"})
    assert r.status_code == 200
    body = r.json()
    roles = {a["role"] for a in body["assignments"]}
    assert "react_engineer" in roles
    assert "performance_engineer" in roles


def test_route_endpoint_denies_other_users(monkeypatch):
    db = FakeDB()
    _seed_project(db, "proj1", "owner")
    other_user = User(id="intruder", email="i@b.com", name="I", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, db, other_user)

    r = client.post("/projects/proj1/org/route", json={"request": "anything"})
    assert r.status_code == 404
