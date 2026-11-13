"""Tests for initiative API endpoints.

Covers create/list/get/update/regenerate/cancel/approve/prd/comments/
approvals/export with a FakeDB, focusing on the P0/P1/P2 fixes:
safe-field filtering, encryption on create, version concurrency, confirm
gating, write-access checks, PRD validation, and cancel flow.
"""

from __future__ import annotations

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

from unittest.mock import MagicMock

import pytest
from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
import core.security as security_module
from api.auth import router as auth_router, get_current_user
from core.models import User


# --------------------------------------------------------------------------- #
# Fake Mongo
# --------------------------------------------------------------------------- #

class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                out = dict(d)
                if projection:
                    for k in list(out.keys()):
                        if k in projection and projection[k] == 0:
                            out.pop(k, None)
                return out
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def insert_many(self, docs):
        self.docs.extend(dict(d) for d in docs)

    async def update_one(self, query, update, upsert=False):
        class _Result:
            matched_count = 0
            modified_count = 0

        result = _Result()
        for d in self.docs:
            if _matches(d, query):
                self._apply_update(d, update)
                result.matched_count = 1
                result.modified_count = 1
                return result
        if upsert:
            new_doc = dict(query)
            self._apply_update(new_doc, update)
            self.docs.append(new_doc)
            result.matched_count = 1
            result.modified_count = 1
        return result

    async def find_one_and_update(self, query, update, **kwargs):
        for d in self.docs:
            if _matches(d, query):
                self._apply_update(d, update)
                return dict(d)
        return None

    def _apply_update(self, doc, update):
        if "$set" in update:
            doc.update(update["$set"])
        if "$inc" in update:
            for k, amount in update["$inc"].items():
                doc[k] = doc.get(k, 0) + amount

    async def delete_many(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not _matches(d, query)]
        class _Result:
            deleted_count = before - len(self.docs)
        return _Result()

    def find(self, query, projection=None):
        matched = [d for d in self.docs if _matches(d, query)]
        return FakeCursor(matched)

    async def count_documents(self, query):
        return sum(1 for d in self.docs if _matches(d, query))

    async def create_index(self, *args, **kwargs):
        pass


class FakeCursor:
    def __init__(self, docs):
        self._docs = list(docs)

    def sort(self, field, direction=1):
        if isinstance(field, list):
            for key, dirn in field:
                self._docs.sort(key=lambda d: d.get(key), reverse=(dirn == -1))
        else:
            self._docs.sort(key=lambda d: d.get(field), reverse=(direction == -1))
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, length=None):
        docs = self._docs
        if length is not None:
            docs = docs[:length]
        return [dict(d) for d in docs]


_COMPARISON_OPS = (("$gt", ">"), ("$gte", ">="), ("$lt", "<"), ("$lte", "<="))


def _matches(doc, query):
    for k, v in query.items():
        if k == "$or":
            if not any(_matches(doc, sub) for sub in v):
                return False
            continue
        if k.startswith("$"):
            continue
        actual = doc.get(k)
        if isinstance(v, dict) and any(op in v for op, _ in _COMPARISON_OPS):
            for op, _ in _COMPARISON_OPS:
                if op in v and not _compare(actual, op, v[op]):
                    return False
            continue
        if isinstance(v, dict) and "$ne" in v:
            if actual == v["$ne"]:
                return False
            continue
        if isinstance(v, dict) and "$in" in v:
            if actual not in v["$in"]:
                return False
            continue
        if isinstance(v, dict) and "$nin" in v:
            if actual in v["$nin"]:
                return False
            continue
        if isinstance(v, dict) and "$exists" in v:
            if bool(v["$exists"]) != (k in doc):
                return False
            continue
        if doc.get(k) != v:
            return False
    return True


def _compare(actual, op, limit):
    if not isinstance(actual, (int, float)) or not isinstance(limit, (int, float)):
        return False
    if op == "$gt":
        return actual > limit
    if op == "$gte":
        return actual >= limit
    if op == "$lt":
        return actual < limit
    if op == "$lte":
        return actual <= limit
    return False


class FakeDB:
    def __init__(self):
        self.users = FakeCollection([])
        self.projects = FakeCollection([])
        self.initiatives = FakeCollection([])
        self.prds = FakeCollection([])
        self.epics = FakeCollection([])
        self.stories = FakeCollection([])
        self.tasks = FakeCollection([])
        self.sprints = FakeCollection([])
        self.agent_executions = FakeCollection([])
        self.prd_comments = FakeCollection([])
        self.prd_approvals = FakeCollection([])
        self.initiative_comments = FakeCollection([])
        self.initiative_approvals = FakeCollection([])
        self.audit_logs = FakeCollection([])
        self.analytics_events = FakeCollection([])
        self.team_members = FakeCollection([])
        self.notifications = FakeCollection([])

    def __getitem__(self, name):
        return getattr(self, name)


# --------------------------------------------------------------------------- #
# Fixtures
# --------------------------------------------------------------------------- #

@pytest.fixture
def app_client(monkeypatch):
    monkeypatch.setattr(security_module, "get_redis", lambda: None)
    monkeypatch.setattr(security_module, "_in_memory_rate_limits", {})

    fake_db = FakeDB()

    async def _get_db():
        return fake_db

    monkeypatch.setattr(auth_module, "get_db", _get_db)

    import api.initiatives as initiatives_module
    monkeypatch.setattr(initiatives_module, "get_db", _get_db)
    monkeypatch.setattr(initiatives_module, "generate_initiative_plan", MagicMock())

    app = FastAPI()
    app.include_router(auth_router)
    v1_router = APIRouter(prefix="/v1")
    v1_router.include_router(initiatives_module.router)
    app.include_router(v1_router)

    async def _fake_get_current_user():
        return User(id="user-1", email="user-1@example.com", name="Test User")

    app.dependency_overrides[get_current_user] = _fake_get_current_user
    return TestClient(app), fake_db


def _auth_headers(user_id: str = "user-1"):
    import api.auth as auth_module
    token = auth_module.create_access_token({"sub": user_id, "email": f"{user_id}@example.com"})
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #

async def test_create_initiative_encrypts_prompt(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    resp = client.post("/v1/initiatives/", json={"prompt": "Secret AI idea"}, headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Secret AI idea"
    assert "prompt" not in data
    stored = await db.initiatives.find_one({"id": data["id"]})
    assert stored["prompt"] != "Secret AI idea"


async def test_create_initiative_response_excludes_plaintext_prompt(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    resp = client.post("/v1/initiatives/", json={"prompt": "Secret AI idea"}, headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert "prompt" not in data
    assert data["name"] == "Secret AI idea"


async def test_list_initiatives_filters_safe_fields(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({
        "id": "init-1",
        "user_id": "user-1",
        "name": "Test",
        "prompt": "secret",
        "status": "draft",
        "generation_error": "traceback...",
    })
    resp = client.get("/v1/initiatives/", headers=_auth_headers())
    assert resp.status_code == 200
    items = resp.json()["initiatives"]
    assert len(items) == 1
    assert "prompt" not in items[0]
    assert "generation_error" not in items[0]
    assert items[0]["name"] == "Test"


async def test_get_initiative_returns_safe_fields(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({
        "id": "init-1",
        "user_id": "user-1",
        "name": "Test",
        "prompt": "secret",
        "status": "draft",
    })
    resp = client.get("/v1/initiatives/init-1", headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert "prompt" not in data
    assert data["name"] == "Test"


async def test_update_initiative_version_concurrency(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "version": 1})
    resp = client.put("/v1/initiatives/init-1", json={"name": "New", "version": 1}, headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.json()["version"] == 2
    resp2 = client.put("/v1/initiatives/init-1", json={"name": "Stale", "version": 1}, headers=_auth_headers())
    assert resp2.status_code == 409


async def test_regenerate_requires_confirm(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    resp = client.post("/v1/initiatives/init-1/regenerate", headers=_auth_headers())
    assert resp.status_code == 400
    assert "confirmation" in resp.json()["detail"].lower()


async def test_cancel_generation(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "generating"})
    resp = client.post("/v1/initiatives/init-1/cancel", headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.json()["status"] == "failed"
    doc = await db.initiatives.find_one({"id": "init-1"})
    assert doc["generation_error"] == "Cancelled by user"


async def test_approve_only_failed_or_review(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "generating"})
    resp = client.post("/v1/initiatives/init-1/approve", headers=_auth_headers())
    assert resp.status_code == 400
    assert "not pending approval" in resp.json()["detail"].lower()

    await db.initiatives.update_one({"id": "init-1"}, {"$set": {"status": "review"}})
    resp = client.post("/v1/initiatives/init-1/approve", headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"

    await db.initiatives.update_one({"id": "init-1"}, {"$set": {"status": "failed"}})
    resp = client.post("/v1/initiatives/init-1/approve", headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


async def test_prd_update_validation(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    await db.prds.insert_one({"initiative_id": "init-1", "id": "prd-1", "version": 1})
    resp = client.put(
        "/v1/initiatives/init-1/prd",
        json={"executive_summary": "x" * 6000, "version": 1},
        headers=_auth_headers(),
    )
    assert resp.status_code == 422


async def test_prd_update_encrypts_sensitive_fields(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    await db.prds.insert_one({"initiative_id": "init-1", "id": "prd-1", "version": 1})
    resp = client.put(
        "/v1/initiatives/init-1/prd",
        json={"security": "secret security plan", "version": 1},
        headers=_auth_headers(),
    )
    assert resp.status_code == 200
    stored = await db.prds.find_one({"id": "prd-1"})
    assert stored["security"] != "secret security plan"


async def test_prd_update_version_conflict_returns_409(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    await db.prds.insert_one({"initiative_id": "init-1", "id": "prd-1", "version": 2})
    resp = client.put(
        "/v1/initiatives/init-1/prd",
        json={"security": "plan", "version": 1},
        headers=_auth_headers(),
    )
    assert resp.status_code == 409


async def test_export_safe_fields(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    await db.prds.insert_one({"initiative_id": "init-1", "id": "prd-1", "version": 1})
    await db.epics.insert_one({"id": "epic-1", "initiative_id": "init-1", "title": "E1", "generated_files": ["/tmp/x"]})
    await db.tasks.insert_one({"id": "task-1", "initiative_id": "init-1", "story_id": "s1", "epic_id": "epic-1", "title": "T1", "generated_files": ["/tmp/y"], "github": {"commit_shas": ["abc123"]}})
    resp = client.get("/v1/initiatives/init-1/export", headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert "generated_files" not in data["epics"][0]
    assert "generated_files" not in data["tasks"][0]
    assert "github" not in data["tasks"][0]


async def test_initiative_comments_do_not_require_prd(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "draft"})
    resp = client.post("/v1/initiatives/init-1/initiative-comments", json={"comment": "Looks good"}, headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.json()["comment"] == "Looks good"


async def test_initiative_approvals_do_not_require_prd(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "draft"})
    resp = client.post("/v1/initiatives/init-1/initiative-approvals", json={"approved": True, "comment": "Approved"}, headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.json()["approved"] is True
    assert resp.json()["comment"] == "Approved"


async def test_credit_preview_returns_cost_and_free_flag(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    resp = client.get("/v1/initiatives/credit-preview", headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert data["free_available"] is True
    assert data["cost"] == 0
    assert data["credits_remaining"] == 10

    await db.users.update_one({"id": "user-1"}, {"$set": {"free_initiative_used": True}})
    resp = client.get("/v1/initiatives/credit-preview", headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert data["free_available"] is False
    assert data["cost"] > 0


async def test_create_initiative_respects_project_cap(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    for i in range(3):
        await db.projects.insert_one({"id": f"proj-{i}", "user_id": "user-1"})
    resp = client.post("/v1/initiatives/", json={"prompt": "Blocked by cap"}, headers=_auth_headers())
    assert resp.status_code == 402
    assert "Project limit" in resp.json()["detail"]
    assert db.initiatives.docs == []
    user = await db.users.find_one({"id": "user-1"})
    assert user["credits"] == 10


async def test_create_initiative_allows_enterprise_unlimited_projects(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "enterprise"})
    for i in range(10):
        await db.projects.insert_one({"id": f"proj-{i}", "user_id": "user-1"})
    resp = client.post("/v1/initiatives/", json={"prompt": "Allowed"}, headers=_auth_headers())
    assert resp.status_code == 200


async def test_regenerate_charges_credits(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": True, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    resp = client.post("/v1/initiatives/init-1/regenerate?confirm=true", headers=_auth_headers())
    assert resp.status_code == 200
    user = await db.users.find_one({"id": "user-1"})
    assert user["credits"] == 5


async def test_regenerate_insufficient_credits(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 2, "free_initiative_used": True, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    resp = client.post("/v1/initiatives/init-1/regenerate?confirm=true", headers=_auth_headers())
    assert resp.status_code == 402
    assert "Insufficient credits" in resp.json()["detail"]
    user = await db.users.find_one({"id": "user-1"})
    assert user["credits"] == 2


async def _seed_plan_artifacts(db, initiative_id="init-1"):
    for name in ("prds", "epics", "stories", "tasks", "sprints"):
        await db[name].insert_one({"id": f"old-{name}", "initiative_id": initiative_id})


async def _plan_artifact_ids(db, initiative_id="init-1"):
    ids = []
    for name in ("prds", "epics", "stories", "tasks", "sprints"):
        ids += [d["id"] for d in await db[name].find({"initiative_id": initiative_id}).to_list(None)]
    return ids


async def test_regenerate_keeps_plan_until_worker_replaces_it(app_client):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": True, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "review"})
    await _seed_plan_artifacts(db)

    resp = client.post("/v1/initiatives/init-1/regenerate?confirm=true", headers=_auth_headers())

    assert resp.status_code == 200
    assert len(await _plan_artifact_ids(db)) == 5


async def test_regenerate_enqueue_failure_keeps_plan_and_refunds(app_client, monkeypatch):
    client, db = app_client
    await db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": True, "plan": "free"})
    await db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "review"})
    await _seed_plan_artifacts(db)

    import api.initiatives as initiatives_module
    broken = MagicMock()
    broken.delay.side_effect = ConnectionError("redis down")
    monkeypatch.setattr(initiatives_module, "generate_initiative_plan", broken)

    with pytest.raises(ConnectionError):
        client.post("/v1/initiatives/init-1/regenerate?confirm=true", headers=_auth_headers())

    assert len(await _plan_artifact_ids(db)) == 5
    user = await db.users.find_one({"id": "user-1"})
    assert user["credits"] == 10


async def test_worker_replaces_old_plan_artifacts():
    from tasks.pm_tasks import _replace_plan_artifacts

    db = FakeDB()
    await _seed_plan_artifacts(db)
    await db.tasks.insert_one({"id": "other-task", "initiative_id": "init-2"})

    def _model(doc_id):
        m = MagicMock()
        m.model_dump.return_value = {"id": doc_id, "initiative_id": "init-1"}
        return m

    result = {
        "prd": _model("new-prd"),
        "epics": [_model("new-epic")],
        "stories": [_model("new-story")],
        "tasks": [_model("new-task")],
        "sprints": [],
    }
    await _replace_plan_artifacts(db, "init-1", result)

    assert sorted(await _plan_artifact_ids(db)) == ["new-epic", "new-prd", "new-story", "new-task"]
    assert await db.tasks.find_one({"id": "other-task"})
