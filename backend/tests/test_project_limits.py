"""Regression tests for P0: project limit enforcement by plan tier.

Verifies that ``POST /projects/`` and ``POST /initiatives/`` respect the
``max_projects`` value defined in ``PLAN_DETAILS`` in ``api/billing.py``.
"""
import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
import api.projects as projects_module
import api.initiatives as initiatives_module

from core.models import User, PlanTier


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def count_documents(self, query):
        return sum(1 for d in self.docs if all(d.get(k) == v for k, v in query.items()))

    async def update_one(self, query, update):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                for field, val in update.get("$set", {}).items():
                    d[field] = val
                for field, val in update.get("$inc", {}).items():
                    d[field] = d.get(field, 0) + val
                break

    async def find(self, query, projection=None):
        return FakeCursor([d for d in self.docs if all(d.get(k) == v for k, v in query.items())])


class FakeCursor:
    def __init__(self, docs, projection=None):
        self.docs = docs
        self.projection = projection

    async def to_list(self, limit):
        return [dict(d) for d in self.docs[:limit]]


class FakeDB:
    def __init__(self, users=None, projects=None, initiatives=None):
        self.users = FakeCollection()
        self.projects = FakeCollection()
        self.initiatives = FakeCollection()
        self.builds = FakeCollection()
        self.audit_logs = FakeCollection()
        if users:
            for u in users:
                self.users.docs.append(u)
        if projects:
            for p in projects:
                self.projects.docs.append(p)


def _make_user(plan=PlanTier.FREE):
    return User(
        id="user-1",
        email="owner@example.com",
        name="Owner",
        hashed_password="x",
        plan=plan,
    )


def _client_for(monkeypatch, router_module, fake_db, user):
    async def _get_db():
        return fake_db

    async def _get_current_user():
        return user

    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = _get_current_user
    return TestClient(app)


class TestProjectLimitEnforcement:
    def test_free_user_can_create_up_to_three_projects(self, monkeypatch):
        db = FakeDB(users=[{"id": "user-1", "plan": PlanTier.FREE}])
        user = _make_user(PlanTier.FREE)
        client = _client_for(monkeypatch, projects_module, db, user)

        for i in range(3):
            r = client.post("/projects/", json={"name": f"Project {i+1}"})
            assert r.status_code == 200, r.text
            assert db.projects.count_documents({"user_id": "user-1"}) == i + 1

    def test_free_user_is_blocked_at_fourth_project(self, monkeypatch):
        db = FakeDB(
            users=[{"id": "user-1", "plan": PlanTier.FREE}],
            projects=[{"id": f"p{i}", "user_id": "user-1"} for i in range(3)],
        )
        user = _make_user(PlanTier.FREE)
        client = _client_for(monkeypatch, projects_module, db, user)

        r = client.post("/projects/", json={"name": "Project 4"})
        assert r.status_code == 402
        assert "Project limit reached" in r.json()["detail"]

    def test_pro_user_can_create_unlimited_projects(self, monkeypatch):
        db = FakeDB(users=[{"id": "user-1", "plan": PlanTier.PRO}])
        user = _make_user(PlanTier.PRO)
        client = _client_for(monkeypatch, projects_module, db, user)

        for i in range(5):
            r = client.post("/projects/", json={"name": f"Project {i+1}"})
            assert r.status_code == 200, r.text

    def test_enterprise_user_can_create_unlimited_projects(self, monkeypatch):
        db = FakeDB(users=[{"id": "user-1", "plan": PlanTier.ENTERPRISE}])
        user = _make_user(PlanTier.ENTERPRISE)
        client = _client_for(monkeypatch, projects_module, db, user)

        for i in range(5):
            r = client.post("/projects/", json={"name": f"Project {i+1}"})
            assert r.status_code == 200, r.text


class TestInitiativeProjectLimitEnforcement:
    def test_initiative_creation_respects_project_limit(self, monkeypatch):
        db = FakeDB(
            users=[{"id": "user-1", "plan": PlanTier.FREE}],
            projects=[{"id": f"p{i}", "user_id": "user-1"} for i in range(3)],
        )
        user = _make_user(PlanTier.FREE)
        client = _client_for(monkeypatch, initiatives_module, db, user)

        r = client.post("/initiatives/", json={"prompt": "Build a SaaS"})
        assert r.status_code == 402
        assert "Project limit reached" in r.json()["detail"]

    def test_initiative_creation_allowed_under_limit(self, monkeypatch):
        db = FakeDB(
            users=[{"id": "user-1", "plan": PlanTier.PRO}],
            projects=[{"id": "p1", "user_id": "user-1"}],
        )
        user = _make_user(PlanTier.PRO)
        client = _client_for(monkeypatch, initiatives_module, db, user)

        r = client.post("/initiatives/", json={"prompt": "Build a SaaS"})
        assert r.status_code == 200, r.text
        assert db.projects.count_documents({"user_id": "user-1"}) == 2
