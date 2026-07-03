"""Unit tests for the core auth endpoints (TEST-001): register, login,
refresh, logout. Exercises the real FastAPI route handlers via TestClient
against a FakeDB, rather than just asserting a code pattern exists.
"""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
import core.security as security_module
from api.auth import router as auth_router, hash_password


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    async def insert_one(self, doc):
        if any(d.get("email") == doc.get("email") for d in self.docs if "email" in doc):
            err = Exception("E11000 duplicate key error")
            err.code = 11000
            raise err
        self.docs.append(dict(doc))

    async def update_one(self, query, update, upsert=False):
        class _Result:
            matched_count = 0

        result = _Result()
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(update.get("$set", {}))
                result.matched_count = 1
                return result
        if upsert:
            new_doc = dict(query)
            new_doc.update(update.get("$set", {}))
            self.docs.append(new_doc)
            result.matched_count = 1
        return result

    async def count_documents(self, query):
        return sum(1 for d in self.docs if all(d.get(k) == v for k, v in query.items()))


class FakeDB:
    def __init__(self, users=None):
        self.users = FakeCollection(users or [])
        self.sessions = FakeCollection([])
        self.token_blacklist = FakeCollection([])


@pytest.fixture
def app_client(monkeypatch):
    monkeypatch.setattr(security_module, "get_redis", _broken_redis)
    monkeypatch.setattr(security_module, "_in_memory_rate_limits", {})

    fake_db = FakeDB()

    async def _get_db():
        return fake_db

    monkeypatch.setattr(auth_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(auth_router)
    return TestClient(app), fake_db


async def _broken_redis():
    raise ConnectionError("simulated Redis outage -- forces in-memory rate limiting")


STRONG_PASSWORD = "Str0ngPassw0rd!"


def test_register_creates_user_and_returns_tokens(app_client):
    client, db = app_client
    resp = client.post(
        "/auth/register",
        json={"email": "new@example.com", "name": "New User", "password": STRONG_PASSWORD},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["email"] == "new@example.com"

    stored = db.users.docs[0]
    assert stored["hashed_password"] != STRONG_PASSWORD
    assert "hashed_password" not in body["user"]


def test_register_rejects_weak_password(app_client):
    client, _ = app_client
    resp = client.post(
        "/auth/register",
        json={"email": "weak@example.com", "name": "Weak", "password": "short"},
    )
    assert resp.status_code == 400


def test_register_rejects_duplicate_email(app_client):
    client, db = app_client
    db.users.docs.append(
        {
            "id": "existing-user",
            "email": "dupe@example.com",
            "name": "Existing",
            "hashed_password": hash_password(STRONG_PASSWORD),
            "plan": "free",
            "credits": 10,
        }
    )
    resp = client.post(
        "/auth/register",
        json={"email": "dupe@example.com", "name": "New", "password": STRONG_PASSWORD},
    )
    assert resp.status_code == 400
    assert "already registered" in resp.json()["detail"].lower()


def test_login_succeeds_with_correct_credentials(app_client):
    client, db = app_client
    db.users.docs.append(
        {
            "id": "user-1",
            "email": "user@example.com",
            "name": "User",
            "hashed_password": hash_password(STRONG_PASSWORD),
            "plan": "free",
            "credits": 10,
        }
    )
    resp = client.post(
        "/auth/login", json={"email": "user@example.com", "password": STRONG_PASSWORD}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert len(db.sessions.docs) == 1


def test_login_rejects_wrong_password(app_client):
    client, db = app_client
    db.users.docs.append(
        {
            "id": "user-1",
            "email": "user@example.com",
            "name": "User",
            "hashed_password": hash_password(STRONG_PASSWORD),
            "plan": "free",
            "credits": 10,
        }
    )
    resp = client.post(
        "/auth/login", json={"email": "user@example.com", "password": "WrongPassword123!"}
    )
    assert resp.status_code == 401
    assert len(db.sessions.docs) == 0


def test_login_rejects_unknown_email(app_client):
    client, _ = app_client
    resp = client.post(
        "/auth/login", json={"email": "nobody@example.com", "password": STRONG_PASSWORD}
    )
    assert resp.status_code == 401


def test_login_with_mfa_enabled_returns_challenge_not_tokens(app_client):
    client, db = app_client
    db.users.docs.append(
        {
            "id": "user-1",
            "email": "mfa@example.com",
            "name": "MFA User",
            "hashed_password": hash_password(STRONG_PASSWORD),
            "plan": "free",
            "credits": 10,
            "mfa_enabled": True,
        }
    )
    resp = client.post(
        "/auth/login", json={"email": "mfa@example.com", "password": STRONG_PASSWORD}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("mfa_required") is True
    assert body.get("mfa_token")
    assert "access_token" not in body
    # No session should be recorded until the MFA challenge is completed.
    assert len(db.sessions.docs) == 0


def test_refresh_issues_new_tokens(app_client):
    client, db = app_client
    db.users.docs.append(
        {
            "id": "user-1",
            "email": "user@example.com",
            "name": "User",
            "hashed_password": hash_password(STRONG_PASSWORD),
            "plan": "free",
            "credits": 10,
        }
    )
    login_resp = client.post(
        "/auth/login", json={"email": "user@example.com", "password": STRONG_PASSWORD}
    )
    old_refresh = login_resp.json()["refresh_token"]

    refresh_resp = client.post("/auth/refresh", json={"refresh_token": old_refresh})
    assert refresh_resp.status_code == 200
    body = refresh_resp.json()
    assert body["access_token"]
    assert body["refresh_token"]
    # The refresh flow updates the existing session row in place rather
    # than growing a new one (BE-010) -- still exactly one session.
    assert len(db.sessions.docs) == 1


def test_refresh_rejects_garbage_token(app_client):
    client, _ = app_client
    resp = client.post("/auth/refresh", json={"refresh_token": "not-a-real-token"})
    assert resp.status_code == 401


def test_logout_blacklists_access_token(app_client):
    client, db = app_client
    db.users.docs.append(
        {
            "id": "user-1",
            "email": "user@example.com",
            "name": "User",
            "hashed_password": hash_password(STRONG_PASSWORD),
            "plan": "free",
            "credits": 10,
        }
    )
    client.post("/auth/login", json={"email": "user@example.com", "password": STRONG_PASSWORD})

    logout_resp = client.post("/auth/logout")
    assert logout_resp.status_code == 200
    assert len(db.token_blacklist.docs) >= 1

    # Sessions revoked at logout should reflect revoked_at being set.
    assert any(s.get("revoked_at") is not None for s in db.sessions.docs)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
