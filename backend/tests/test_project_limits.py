"""Regression tests for P0: project limit enforcement by plan tier.

Verifies that ``POST /projects/`` and ``POST /initiatives/`` respect the
``max_projects`` value defined in ``PLAN_DETAILS`` in ``api/billing.py``.
"""
import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import asyncio

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

    def find(self, query, projection=None):
        # Motor semantics: find() is sync and returns a cursor; the cursor's
        # to_list() is async. sort()/limit() are chained synchronously.
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

    def sort(self, key, direction=None):
        if isinstance(key, list):
            for field, dirn in key:
                self.docs.sort(key=lambda d, f=field: d.get(f) or "", reverse=(dirn < 0))
        else:
            self.docs.sort(key=lambda d: d.get(key) or "", reverse=(direction is not None and direction < 0))
        return self

    def limit(self, n):
        self.docs = self.docs[:n]
        return self

    def skip(self, n):
        self.docs = self.docs[n:]
        return self

    async def to_list(self, length=None):
        # Motor's AsyncIOMotorCursor.to_list(length=None)
        if length is not None:
            return [dict(d) for d in self.docs[:length]]
        return [dict(d) for d in self.docs]


class FakeDB:
    def __init__(self, users=None, projects=None, initiatives=None, builds=None, team_members=None):
        self.users = FakeCollection()
        self.projects = FakeCollection()
        self.initiatives = FakeCollection()
        self.builds = FakeCollection()
        self.team_members = FakeCollection()
        self.audit_logs = FakeCollection()
        for collection, seed in (
            (self.users, users),
            (self.projects, projects),
            (self.initiatives, initiatives),
            (self.builds, builds),
            (self.team_members, team_members),
        ):
            if seed:
                for doc in seed:
                    collection.docs.append(doc)


def _make_user(plan=PlanTier.FREE):
    return User(
        id="user-1",
        email="owner@example.com",
        name="Owner",
        hashed_password="x",
        plan=plan,
    )


class FakeRedis:
    """In-memory Redis stand-in so rate-limit counters never leak across
    tests (the real client would persist rl:project_create:user-1 counters
    in the dev Redis and trip the 429 after enough test runs)."""

    def __init__(self):
        self.counts = {}

    async def incr(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    async def expire(self, key, ttl):
        return True


def _client_for(monkeypatch, router_module, fake_db, user):
    async def _get_db():
        return fake_db

    async def _get_current_user():
        return user

    monkeypatch.setattr(router_module, "get_db", _get_db)
    monkeypatch.setattr(router_module, "get_redis", lambda: FakeRedis())
    if hasattr(router_module, "generate_initiative_plan"):
        from unittest.mock import MagicMock
        monkeypatch.setattr(router_module, "generate_initiative_plan", MagicMock())

    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = _get_current_user
    return TestClient(app)


class TestProjectLimitEnforcement:
    def test_free_user_can_create_one_project_then_is_blocked(self, monkeypatch):
        db = FakeDB(users=[{"id": "user-1", "plan": PlanTier.FREE}])
        user = _make_user(PlanTier.FREE)
        client = _client_for(monkeypatch, projects_module, db, user)

        r = client.post("/projects/", json={"name": "Project 1", "description": "audit fixture"})
        assert r.status_code == 200, r.text
        assert asyncio.run(db.projects.count_documents({"user_id": "user-1"})) == 1

        r = client.post("/projects/", json={"name": "Project 2", "description": "audit fixture"})
        assert r.status_code == 402
        assert "Project limit reached" in r.json()["detail"]
        assert asyncio.run(db.projects.count_documents({"user_id": "user-1"})) == 1

    def test_free_user_is_blocked_at_second_project(self, monkeypatch):
        db = FakeDB(
            users=[{"id": "user-1", "plan": PlanTier.FREE}],
            projects=[{"id": "p0", "user_id": "user-1"}],
        )
        user = _make_user(PlanTier.FREE)
        client = _client_for(monkeypatch, projects_module, db, user)

        r = client.post("/projects/", json={"name": "Project 2", "description": "audit fixture"})
        assert r.status_code == 402
        assert "Project limit reached" in r.json()["detail"]

    def test_standard_user_can_create_unlimited_projects(self, monkeypatch):
        db = FakeDB(users=[{"id": "user-1", "plan": PlanTier.STANDARD}])
        user = _make_user(PlanTier.STANDARD)
        client = _client_for(monkeypatch, projects_module, db, user)

        for i in range(5):
            r = client.post("/projects/", json={"name": f"Project {i+1}", "description": "audit fixture"})
            assert r.status_code == 200, r.text

    def test_pro_user_can_create_unlimited_projects(self, monkeypatch):
        db = FakeDB(users=[{"id": "user-1", "plan": PlanTier.PRO}])
        user = _make_user(PlanTier.PRO)
        client = _client_for(monkeypatch, projects_module, db, user)

        for i in range(5):
            r = client.post("/projects/", json={"name": f"Project {i+1}", "description": "audit fixture"})
            assert r.status_code == 200, r.text

    def test_enterprise_user_can_create_unlimited_projects(self, monkeypatch):
        db = FakeDB(users=[{"id": "user-1", "plan": PlanTier.ENTERPRISE}])
        user = _make_user(PlanTier.ENTERPRISE)
        client = _client_for(monkeypatch, projects_module, db, user)

        for i in range(5):
            r = client.post("/projects/", json={"name": f"Project {i+1}", "description": "audit fixture"})
            assert r.status_code == 200, r.text


class TestInitiativeProjectLimitEnforcement:
    def test_initiative_creation_respects_project_limit(self, monkeypatch):
        db = FakeDB(
            users=[{"id": "user-1", "plan": PlanTier.FREE}],
            projects=[{"id": "p0", "user_id": "user-1"}],
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
        assert asyncio.run(db.projects.count_documents({"user_id": "user-1"})) == 2


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
                {"id": "p1", "user_id": "user-1", "deleted_at": "2026-08-11T15:00:00"},
            ],
        )
        user = _make_user(PlanTier.FREE)
        client = _client_for(monkeypatch, projects_module, db, user)

        # The free plan allows 1 project; a deleted one doesn't use it up.
        r = client.post("/projects/", json={"name": "Project 2", "description": "audit fixture"})
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

        r = client.post("/projects/", json={"name": "Audited Project", "description": "audit fixture"})
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
