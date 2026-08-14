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
            if self._matches(d, query):
                return self._apply_projection(dict(d), projection)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def count_documents(self, query):
        return sum(1 for d in self.docs if self._matches(d, query))

    async def update_one(self, query, update):
        for d in self.docs:
            if self._matches(d, query):
                for field, val in update.get("$set", {}).items():
                    d[field] = val
                for field, val in update.get("$inc", {}).items():
                    d[field] = d.get(field, 0) + val
                break

    async def find_one_and_update(self, query, update, **kwargs):
        for d in self.docs:
            if self._matches(d, query):
                for field, val in update.get("$set", {}).items():
                    d[field] = val
                for field, val in update.get("$inc", {}).items():
                    d[field] = d.get(field, 0) + val
                return dict(d)
        return None

    async def find(self, query, projection=None):
        return FakeCursor([dict(d) for d in self.docs if self._matches(d, query)], projection)

    async def delete_many(self, query):
        class _Result:
            deleted_count = 0
        result = _Result()
        before = len(self.docs)
        self.docs = [d for d in self.docs if not self._matches(d, query)]
        result.deleted_count = before - len(self.docs)
        return result

    @staticmethod
    def _matches(doc: dict, query: dict) -> bool:
        for key, val in query.items():
            if isinstance(val, dict):
                matched = True
                for op, opval in val.items():
                    doc_val = doc.get(key)
                    if op == "$exists":
                        if opval and key not in doc:
                            matched = False
                            break
                        if not opval and key in doc:
                            matched = False
                            break
                    elif op == "$ne":
                        if doc_val == opval:
                            matched = False
                            break
                    else:
                        if doc_val != val:
                            matched = False
                            break
                if not matched:
                    return False
                continue
            if doc.get(key) != val:
                return False
        return True

    @staticmethod
    def _apply_projection(doc: dict, projection) -> dict:
        if not projection:
            doc.pop("_id", None)
            return doc
        for key, keep in projection.items():
            if keep == 0:
                doc.pop(key, None)
        return doc


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


class TestProjectSoftDelete:
    def test_deleted_project_excluded_from_list(self, monkeypatch):
        db = FakeDB(
            users=[{"id": "user-1", "plan": PlanTier.PRO}],
            projects=[
                {"id": "p1", "user_id": "user-1", "name": "Active"},
                {"id": "p2", "user_id": "user-1", "name": "Deleted", "deleted_at": "2026-08-11T15:00:00"},
            ],
        )
        user = _make_user(PlanTier.PRO)
        client = _client_for(monkeypatch, projects_module, db, user)

        r = client.get("/projects/")
        assert r.status_code == 200
        names = [p["name"] for p in r.json()["projects"]]
        assert names == ["Active"]

    def test_deleted_project_not_accessible_by_id(self, monkeypatch):
        db = FakeDB(
            users=[{"id": "user-1", "plan": PlanTier.PRO}],
            projects=[{"id": "p1", "user_id": "user-1", "deleted_at": "2026-08-11T15:00:00"}],
        )
        user = _make_user(PlanTier.PRO)
        client = _client_for(monkeypatch, projects_module, db, user)

        r = client.get("/projects/p1")
        assert r.status_code == 404

    def test_deleted_project_cannot_be_updated(self, monkeypatch):
        db = FakeDB(
            users=[{"id": "user-1", "plan": PlanTier.PRO}],
            projects=[{"id": "p1", "user_id": "user-1", "deleted_at": "2026-08-11T15:00:00"}],
        )
        user = _make_user(PlanTier.PRO)
        client = _client_for(monkeypatch, projects_module, db, user)

        r = client.put("/projects/p1", json={"name": "Hacked"})
        assert r.status_code == 404

    def test_soft_delete_does_not_count_toward_limit(self, monkeypatch):
        db = FakeDB(
            users=[{"id": "user-1", "plan": PlanTier.FREE}],
            projects=[
                {"id": "p1", "user_id": "user-1"},
                {"id": "p2", "user_id": "user-1", "deleted_at": "2026-08-11T15:00:00"},
            ],
        )
        user = _make_user(PlanTier.FREE)
        client = _client_for(monkeypatch, projects_module, db, user)

        r = client.post("/projects/", json={"name": "Project 3"})
        assert r.status_code == 200, r.text


class TestProjectAccessControl:
    def test_org_member_can_view_shared_project(self, monkeypatch):
        db = FakeDB(
            users=[
                {"id": "user-1", "plan": PlanTier.PRO},
                {"id": "user-2", "plan": PlanTier.PRO},
            ],
            projects=[{"id": "p1", "user_id": "user-1", "org_id": "org-1"}],
            team_members=[{"org_id": "org-1", "user_id": "user-2"}],
        )
        owner = _make_user(PlanTier.PRO)
        owner.id = "user-1"
        member = _make_user(PlanTier.PRO)
        member.id = "user-2"
        owner_client = _client_for(monkeypatch, projects_module, db, owner)
        member_client = _client_for(monkeypatch, projects_module, db, member)

        r = member_client.get("/projects/p1")
        assert r.status_code == 200
        assert r.json()["id"] == "p1"

    def test_org_member_sees_all_builds_in_project(self, monkeypatch):
        db = FakeDB(
            users=[
                {"id": "user-1", "plan": PlanTier.PRO},
                {"id": "user-2", "plan": PlanTier.PRO},
            ],
            projects=[{"id": "p1", "user_id": "user-1", "org_id": "org-1"}],
            builds=[
                {"id": "b1", "project_id": "p1", "user_id": "user-1", "prompt": "owner build"},
                {"id": "b2", "project_id": "p1", "user_id": "user-2", "prompt": "member build"},
            ],
            team_members=[{"org_id": "org-1", "user_id": "user-2"}],
        )
        owner = _make_user(PlanTier.PRO)
        owner.id = "user-1"
        member = _make_user(PlanTier.PRO)
        member.id = "user-2"
        member_client = _client_for(monkeypatch, projects_module, db, member)

        r = member_client.get("/projects/p1/builds")
        assert r.status_code == 200
        build_ids = [b["id"] for b in r.json()["builds"]]
        assert "b1" in build_ids
        assert "b2" in build_ids


class TestProjectAuditLogging:
    def test_create_project_is_audited(self, monkeypatch):
        db = FakeDB(users=[{"id": "user-1", "plan": PlanTier.PRO}])
        user = _make_user(PlanTier.PRO)
        client = _client_for(monkeypatch, projects_module, db, user)

        r = client.post("/projects/", json={"name": "Audited Project"})
        assert r.status_code == 200
        assert len(db.audit_logs.docs) == 1
        log = db.audit_logs.docs[0]
        assert log["action"] == "create_project"
        assert log["resource_type"] == "project"
        assert log["resource_id"] == r.json()["id"]
        assert log["actor_id"] == "user-1"

    def test_update_project_is_audited(self, monkeypatch):
        db = FakeDB(
            users=[{"id": "user-1", "plan": PlanTier.PRO}],
            projects=[{"id": "p1", "user_id": "user-1", "name": "Old Name"}],
        )
        user = _make_user(PlanTier.PRO)
        client = _client_for(monkeypatch, projects_module, db, user)

        r = client.put("/projects/p1", json={"name": "New Name"})
        assert r.status_code == 200
        assert len(db.audit_logs.docs) == 1
        log = db.audit_logs.docs[0]
        assert log["action"] == "update_project"
        assert log["resource_id"] == "p1"
        assert log["changes"]["name"] == "New Name"
