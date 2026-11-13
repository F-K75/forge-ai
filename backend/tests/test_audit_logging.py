"""Regression tests for BE-009: audit logging on critical operations.

Verifies that project deletion, API key create/delete, and webhook
create/delete each write an attributable, append-only ``AuditLog`` (with actor,
IP, and user-agent), and that the shared ``record_audit_log`` helper captures
the request context correctly.
"""
import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

import api.auth as auth_module
from core.audit import record_audit_log
from core.models import User


class FakeCollection:
    def __init__(self):
        self.docs = []
        self.inserted = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            matches = True
            for k, v in query.items():
                if isinstance(v, dict) and "$exists" in v:
                    if (k in d) != v["$exists"]:
                        matches = False
                        break
                elif d.get(k) != v:
                    matches = False
                    break
            if matches:
                return dict(d)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        self.inserted.append(dict(doc))

    async def update_one(self, query, update, **kwargs):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                for op, fields in update.items():
                    if op == "$set":
                        d.update(fields)
                    elif op == "$inc":
                        for f, amount in fields.items():
                            d[f] = d.get(f, 0) + amount
                return True
        return False

    async def delete_one(self, query):
        class _Result:
            deleted_count = 0

        result = _Result()
        for i, d in enumerate(self.docs):
            if all(d.get(k) == v for k, v in query.items()):
                self.docs.pop(i)
                result.deleted_count = 1
                break
        return result

    async def delete_many(self, query):
        class _Result:
            deleted_count = 0

        before = len(self.docs)
        self.docs = [
            d for d in self.docs if not all(d.get(k) == v for k, v in query.items())
        ]
        result = _Result()
        result.deleted_count = before - len(self.docs)
        return result


class FakeDB:
    def __init__(self):
        self.projects = FakeCollection()
        self.builds = FakeCollection()
        self.api_keys = FakeCollection()
        self.webhooks = FakeCollection()
        self.audit_logs = FakeCollection()


@pytest.fixture
def fake_db():
    return FakeDB()


def _make_user():
    return User(
        id="user-1",
        email="owner@example.com",
        name="Owner",
        hashed_password="x",
        plan="pro",
    )


def _client_for(monkeypatch, router_module, fake_db, user):
    # get_db() is invoked directly inside the endpoints, so monkeypatch the
    # source symbol. get_current_user is supplied via Depends(), so use
    # dependency_overrides (which matches the captured callable object).
    async def _get_db():
        return fake_db

    async def _get_current_user():
        return user

    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[auth_module.get_current_user] = _get_current_user
    return TestClient(app)


class TestRecordAuditLog:
    async def test_captures_actor_ip_and_user_agent(self, fake_db):
        user = _make_user()
        scope = {
            "type": "http",
            "method": "POST",
            "headers": [(b"user-agent", b"pytest")],
            "client": ("203.0.113.9", 1234),
        }
        request = Request(scope)

        await record_audit_log(
            fake_db, request, user, "do_thing", "widget",
            resource_id="w-1", changes={"k": "v"},
        )

        assert len(fake_db.audit_logs.inserted) == 1
        log = fake_db.audit_logs.inserted[0]
        assert log["actor_id"] == "user-1"
        assert log["actor_email"] == "owner@example.com"
        assert log["action"] == "do_thing"
        assert log["resource_type"] == "widget"
        assert log["resource_id"] == "w-1"
        assert log["changes"] == {"k": "v"}
        assert log["ip_address"] == "203.0.113.9"
        assert log["user_agent"] == "pytest"

    async def test_handles_missing_request(self, fake_db):
        user = _make_user()
        await record_audit_log(fake_db, None, user, "x", "y")
        log = fake_db.audit_logs.inserted[0]
        assert log["ip_address"] is None
        assert log["user_agent"] is None


class TestCriticalOpAudit:
    def test_project_deletion_is_audited(self, fake_db, monkeypatch):
        import api.projects as projects_module

        user = _make_user()
        fake_db.projects.docs.append({"id": "p-1", "user_id": "user-1", "name": "My App"})
        client = _client_for(monkeypatch, projects_module, fake_db, user)

        resp = client.delete("/projects/p-1")
        assert resp.status_code == 200
        assert len(fake_db.audit_logs.inserted) == 1
        log = fake_db.audit_logs.inserted[0]
        assert log["action"] == "delete_project"
        assert log["resource_id"] == "p-1"
        assert log["changes"] == {"name": "My App"}

    def test_api_key_create_and_delete_audited(self, fake_db, monkeypatch):
        import api.api_keys as api_keys_module

        user = _make_user()
        client = _client_for(monkeypatch, api_keys_module, fake_db, user)

        resp = client.post("/api-keys/", json={"name": "ci-key", "scopes": ["builds"]})
        assert resp.status_code == 200
        key_id = resp.json()["id"]
        assert any(
            l["action"] == "create_api_key" and l["resource_id"] == key_id
            for l in fake_db.audit_logs.inserted
        )

        fake_db.api_keys.docs.append({"id": key_id, "user_id": "user-1"})
        fake_db.audit_logs.inserted.clear()
        resp = client.delete(f"/api-keys/{key_id}")
        assert resp.status_code == 200
        assert fake_db.audit_logs.inserted[0]["action"] == "delete_api_key"
        assert fake_db.audit_logs.inserted[0]["resource_id"] == key_id

    def test_webhook_create_and_delete_audited(self, fake_db, monkeypatch):
        import api.webhooks as webhooks_module

        import core.security as security_module

        async def _resolve_public(hostname):
            # Webhook URLs are DNS-checked against SSRF; don't depend on the
            # test machine's network for that (covered in test_ssrf_protection.py).
            return [(2, 1, 6, "", ("93.184.216.34", 0))]

        monkeypatch.setattr(security_module, "_resolve_host", _resolve_public)
        user = _make_user()
        client = _client_for(monkeypatch, webhooks_module, fake_db, user)

        resp = client.post("/webhooks/", json={"url": "https://example.com/hook", "events": ["build.completed"]})
        assert resp.status_code == 200
        wh_id = resp.json()["id"]
        logs = [l for l in fake_db.audit_logs.inserted if l["action"] == "create_webhook"]
        assert logs and logs[0]["resource_id"] == wh_id

        fake_db.webhooks.docs.append({"id": wh_id, "user_id": "user-1"})
        fake_db.audit_logs.inserted.clear()
        resp = client.delete(f"/webhooks/{wh_id}")
        assert resp.status_code == 200
        assert fake_db.audit_logs.inserted[0]["action"] == "delete_webhook"
        assert fake_db.audit_logs.inserted[0]["resource_id"] == wh_id
