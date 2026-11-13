"""Tests for the public waitlist endpoint (api/waitlist.py)."""

from __future__ import annotations

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

from collections import OrderedDict

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

import core.security as security_module
from core.security import _CSRF_EXCLUDED_PATHS, _get_limit_config


class FakeWaitlist:
    def __init__(self):
        self.docs: list[dict] = []
        self.raise_duplicate = False

    async def update_one(self, query, update, upsert=False):
        if self.raise_duplicate:
            raise DuplicateKeyError("dup")
        for d in self.docs:
            if d["email"] == query["email"]:
                d.update(update.get("$set", {}))
                return
        if upsert:
            doc = dict(update.get("$setOnInsert", {}))
            doc.update(update.get("$set", {}))
            self.docs.append(doc)


class FakeDB:
    def __init__(self):
        self.waitlist = FakeWaitlist()


@pytest.fixture
def client_db(monkeypatch):
    monkeypatch.setattr(security_module, "get_redis", lambda: None)
    monkeypatch.setattr(security_module, "_in_memory_rate_limits", OrderedDict())
    db = FakeDB()

    async def _get_db():
        return db

    import api.waitlist as waitlist_module
    monkeypatch.setattr(waitlist_module, "get_db", _get_db)
    app = FastAPI()
    app.include_router(waitlist_module.router, prefix="/v1")
    return TestClient(app), db


def test_signup_stores_normalized_email(client_db):
    client, db = client_db
    resp = client.post("/v1/waitlist", json={"email": "  Ada@Example.com ", "source": "hn"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
    assert len(db.waitlist.docs) == 1
    doc = db.waitlist.docs[0]
    assert doc["email"] == "ada@example.com"
    assert doc["source"] == "hn"
    assert doc["id"].startswith("wl_")
    assert "created_at" in doc and "last_seen_at" in doc


def test_repeat_signup_is_idempotent_and_indistinguishable(client_db):
    client, db = client_db
    first = client.post("/v1/waitlist", json={"email": "ada@example.com"})
    second = client.post("/v1/waitlist", json={"email": "ADA@example.com"})
    assert first.json() == second.json() == {"ok": True}
    assert len(db.waitlist.docs) == 1
    assert db.waitlist.docs[0]["source"] == "landing"


def test_invalid_email_rejected(client_db):
    client, db = client_db
    resp = client.post("/v1/waitlist", json={"email": "not-an-email"})
    assert resp.status_code == 422
    assert db.waitlist.docs == []


def test_honeypot_returns_ok_without_storing(client_db):
    client, db = client_db
    resp = client.post("/v1/waitlist", json={"email": "bot@example.com", "website": "http://spam"})
    assert resp.status_code == 200
    assert db.waitlist.docs == []


def test_per_email_rate_limit_skips_writes_but_answers_ok(client_db):
    client, db = client_db
    # Redis is unavailable in tests, so the in-memory fallback applies at half
    # the configured limit (EMAIL_RATE_LIMITS["waitlist"] = 3 -> 1).
    first = client.post("/v1/waitlist", json={"email": "ada@example.com"})
    seen = db.waitlist.docs[0]["last_seen_at"]
    later = [client.post("/v1/waitlist", json={"email": "ada@example.com"}) for _ in range(3)]
    assert first.status_code == 200
    assert all(r.status_code == 200 and r.json() == {"ok": True} for r in later)
    assert db.waitlist.docs[0]["last_seen_at"] == seen  # no further writes


def test_duplicate_key_race_still_ok(client_db):
    client, db = client_db
    db.waitlist.raise_duplicate = True
    resp = client.post("/v1/waitlist", json={"email": "ada@example.com"})
    assert resp.status_code == 200


def test_security_config_covers_waitlist():
    assert "/v1/waitlist" in _CSRF_EXCLUDED_PATHS
    assert _get_limit_config("/v1/waitlist")[0] == "waitlist"
    assert _get_limit_config("/v1/waitlistx")[0] != "waitlist"


def test_route_is_mounted_on_v1_router():
    from api.v1 import v1_router
    app = FastAPI()
    app.include_router(v1_router)
    assert "post" in app.openapi()["paths"]["/v1/waitlist"]
