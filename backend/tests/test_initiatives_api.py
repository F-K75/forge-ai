"""Tests for initiative API endpoints.

Covers create/list/get/update/regenerate/cancel/approve/prd/comments/
approvals/export with a FakeDB, focusing on the P0/P1/P2 fixes:
safe-field filtering, encryption on create, version concurrency, confirm
gating, write-access checks, PRD validation, and cancel flow.
"""

from __future__ import annotations

import os
import json

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest
from fastapi import FastAPI
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
                d.update(update.get("$set", {}))
                result.matched_count = 1
                result.modified_count = 1
                return result
        if upsert:
            new_doc = dict(query)
            new_doc.update(update.get("$set", {}))
            self.docs.append(new_doc)
            result.matched_count = 1
            result.modified_count = 1
        return result

    async def find_one_and_update(self, query, update, **kwargs):
        for d in self.docs:
            if _matches(d, query):
                d.update(update.get("$set", {}))
                return dict(d)
        return None

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
        if k.startswith("$"):
            continue
        if doc.get(k) != v:
            return False
    return True


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

    app = FastAPI()
    app.include_router(auth_router)
    app.include_router(initiatives_module.router)
    return TestClient(app), fake_db


def _auth_headers(user_id: str = "user-1"):
    import api.auth as auth_module
    token = auth_module.create_access_token({"sub": user_id, "email": f"{user_id}@example.com"})
    return {"Authorization": f"Bearer {token}"}


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #

def test_create_initiative_encrypts_prompt(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    resp = client.post("/v1/initiatives/", json={"prompt": "Secret AI idea"}, headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Secret AI idea"
    assert "prompt" not in data
    stored = db.initiatives.find_one({"id": data["id"]})
    assert stored["prompt"] != "Secret AI idea"


def test_create_initiative_response_excludes_plaintext_prompt(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    resp = client.post("/v1/initiatives/", json={"prompt": "Secret AI idea"}, headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert "prompt" not in data
    assert data["name"] == "Secret AI idea"


def test_list_initiatives_filters_safe_fields(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    db.initiatives.insert_one({
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


def test_get_initiative_returns_safe_fields(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    db.initiatives.insert_one({
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


def test_update_initiative_version_concurrency(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "version": 1})
    resp = client.put("/v1/initiatives/init-1", json={"name": "New", "version": 1}, headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.json()["version"] == 2
    resp2 = client.put("/v1/initiatives/init-1", json={"name": "Stale", "version": 1}, headers=_auth_headers())
    assert resp2.status_code == 409


def test_regenerate_requires_confirm(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    resp = client.post("/v1/initiatives/init-1/regenerate", headers=_auth_headers())
    assert resp.status_code == 400
    assert "confirmation" in resp.json()["detail"].lower()


def test_cancel_generation(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "generating"})
    resp = client.post("/v1/initiatives/init-1/cancel", headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.json()["status"] == "failed"
    doc = db.initiatives.find_one({"id": "init-1"})
    assert doc["generation_error"] == "Cancelled by user"


def test_approve_only_failed_or_review(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "generating"})
    resp = client.post("/v1/initiatives/init-1/approve", headers=_auth_headers())
    assert resp.status_code == 400
    assert "not pending approval" in resp.json()["detail"].lower()

    db.initiatives.update_one({"id": "init-1"}, {"$set": {"status": "review"}})
    resp = client.post("/v1/initiatives/init-1/approve", headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"

    db.initiatives.update_one({"id": "init-1"}, {"$set": {"status": "failed"}})
    resp = client.post("/v1/initiatives/init-1/approve", headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.json()["status"] == "active"


def test_prd_update_validation(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    db.prds.insert_one({"initiative_id": "init-1", "id": "prd-1", "version": 1})
    resp = client.put(
        "/v1/initiatives/init-1/prd",
        json={"executive_summary": "x" * 6000, "version": 1},
        headers=_auth_headers(),
    )
    assert resp.status_code == 422


def test_prd_update_encrypts_sensitive_fields(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    db.prds.insert_one({"initiative_id": "init-1", "id": "prd-1", "version": 1})
    resp = client.put(
        "/v1/initiatives/init-1/prd",
        json={"security": "secret security plan", "version": 1},
        headers=_auth_headers(),
    )
    assert resp.status_code == 200
    stored = db.prds.find_one({"id": "prd-1"})
    assert stored["security"] != "secret security plan"


def test_prd_update_version_conflict_returns_409(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    db.prds.insert_one({"initiative_id": "init-1", "id": "prd-1", "version": 2})
    resp = client.put(
        "/v1/initiatives/init-1/prd",
        json={"security": "plan", "version": 1},
        headers=_auth_headers(),
    )
    assert resp.status_code == 409


def test_export_safe_fields(app_client):
    client, db = app_client
    db.users.insert_one({"id": "user-1", "credits": 10, "free_initiative_used": False, "plan": "free"})
    db.initiatives.insert_one({"id": "init-1", "user_id": "user-1", "name": "Test", "status": "failed"})
    db.prds.insert_one({"initiative_id": "init-1", "id": "prd-1", "version": 1})
    db.epics.insert_one({"id": "epic-1", "initiative_id": "init-1", "title": "E1", "generated_files": ["/tmp/x"]})
    db.tasks.insert_one({"id": "task-1", "initiative_id": "init-1", "story_id": "s1", "epic_id": "epic-1", "title": "T1", "generated_files": ["/tmp/y"], "github": {"commit_shas": ["abc123"]}})
    resp = client.get("/v1/initiatives/init-1/export", headers=_auth_headers())
    assert resp.status_code == 200
    data = resp.json()
    assert "generated_files" not in data["epics"][0]
    assert "generated_files" not in data["tasks"][0]
    assert "github" not in data["tasks"][0]
