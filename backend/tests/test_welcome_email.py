"""The onboarding welcome email is sent once, after verification, without
ever affecting the verification response."""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

from datetime import timedelta

import pytest
from fastapi import BackgroundTasks

import api.auth as auth_module
from api.auth import _hash_token, _send_welcome_email_once, verify_email
from core.models import utcnow


def _matches(doc, query):
    for k, v in query.items():
        if isinstance(v, dict) and "$ne" in v:
            if doc.get(k) == v["$ne"]:
                return False
        elif doc.get(k) != v:
            return False
    return True


class FakeUsers:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        return next((dict(d) for d in self.docs if _matches(d, query)), None)

    async def update_one(self, query, update):
        for d in self.docs:
            if _matches(d, query):
                d.update(update.get("$set", {}))
                return

    async def find_one_and_update(self, query, update, return_document=False):
        for d in self.docs:
            if _matches(d, query):
                d.update(update.get("$set", {}))
                return dict(d)
        return None


class FakeDB:
    def __init__(self, users):
        self.users = FakeUsers(users)


@pytest.fixture
def env(monkeypatch):
    db = FakeDB([{
        "id": "user-1",
        "email": "ada@example.com",
        "name": "Ada Lovelace",
        "credits": 10,
        "email_verified": False,
        "verification_token": _hash_token("tok"),
        "verification_expires": utcnow() + timedelta(hours=1),
    }])

    async def _get_db():
        return db

    sent = []
    monkeypatch.setattr(auth_module, "get_db", _get_db)
    monkeypatch.setattr(auth_module.settings, "resend_api_key", "re_test")
    monkeypatch.setattr(auth_module.resend.Emails, "send", lambda params: sent.append(params))
    return db, sent


async def _run(tasks: BackgroundTasks):
    for task in tasks.tasks:
        await task.func(*task.args, **task.kwargs)


@pytest.mark.asyncio
async def test_verification_sends_welcome_email(env):
    db, sent = env
    tasks = BackgroundTasks()
    assert await verify_email("tok", tasks) == {"ok": True}
    await _run(tasks)

    assert len(sent) == 1
    assert sent[0]["to"] == ["ada@example.com"]
    assert sent[0]["subject"].startswith("Welcome to Forge")
    assert "Hi Ada," in sent[0]["text"]
    assert "10 credits" in sent[0]["text"]  # the user's real balance
    assert db.users.docs[0]["welcome_email_sent"] is True


@pytest.mark.asyncio
async def test_welcome_email_sent_only_once(env):
    _, sent = env
    await _send_welcome_email_once("user-1")
    await _send_welcome_email_once("user-1")
    assert len(sent) == 1


@pytest.mark.asyncio
async def test_no_api_key_sends_nothing_and_does_not_claim_flag(env, monkeypatch):
    db, sent = env
    monkeypatch.setattr(auth_module.settings, "resend_api_key", "")
    await _send_welcome_email_once("user-1")
    assert sent == []
    assert "welcome_email_sent" not in db.users.docs[0]


@pytest.mark.asyncio
async def test_send_failure_is_swallowed(env, monkeypatch):
    def _boom(params):
        raise RuntimeError("resend down")

    monkeypatch.setattr(auth_module.resend.Emails, "send", _boom)
    tasks = BackgroundTasks()
    assert await verify_email("tok", tasks) == {"ok": True}
    await _run(tasks)  # must not raise


@pytest.mark.asyncio
async def test_invalid_token_queues_nothing(env):
    _, sent = env
    tasks = BackgroundTasks()
    with pytest.raises(Exception):
        await verify_email("wrong", tasks)
    assert tasks.tasks == []


# --------------------------------------------------------------------------- #
# Google sign-up: accounts arrive verified, so the welcome email is sent when
# the account is first created. Also a regression test for the callback itself,
# which used to `await` authlib's synchronous client and 400 on every login.
# --------------------------------------------------------------------------- #

class _GoogleUserInfo:
    status_code = 200

    def json(self):
        return {"email": "grace@example.com", "name": "Grace Hopper"}


@pytest.fixture
def google_env(env, monkeypatch):
    from authlib.integrations.requests_client import OAuth2Session
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    db, sent = env

    async def insert_one(doc):
        db.users.docs.append(dict(doc))

    async def _no_session(*a, **kw):
        return None

    db.users.insert_one = insert_one
    # Synchronous, like the real authlib requests client.
    monkeypatch.setattr(OAuth2Session, "fetch_token", lambda self, *a, **k: {"access_token": "t", "token_type": "Bearer"})
    monkeypatch.setattr(OAuth2Session, "get", lambda self, *a, **k: _GoogleUserInfo())
    monkeypatch.setattr(auth_module, "_record_session", _no_session)

    app = FastAPI()
    app.include_router(auth_module.router)
    return TestClient(app), db, sent


def test_google_signup_logs_in_and_sends_welcome_once(google_env):
    client, db, sent = google_env

    first = client.get("/auth/google/callback?code=abc", follow_redirects=False)
    assert first.status_code in (302, 307), first.text
    assert "access_token" in first.cookies
    assert [p["to"] for p in sent] == [["grace@example.com"]]
    assert "Hi Grace," in sent[0]["text"]

    # Returning Google user: logs in again, no second welcome email.
    again = client.get("/auth/google/callback?code=abc", follow_redirects=False)
    assert again.status_code in (302, 307)
    assert len(sent) == 1
