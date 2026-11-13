"""Signed unsubscribe links and marketing-email preferences."""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

from collections import OrderedDict
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.email_prefs as prefs_module
import core.security as security_module
from api.auth import get_current_user
from core.models import User
from services.email_prefs import (
    list_unsubscribe_headers,
    make_unsubscribe_token,
    unsubscribe_url,
    verify_unsubscribe_token,
    wants_marketing_email,
)


# --------------------------------------------------------------------------- #
# Tokens
# --------------------------------------------------------------------------- #

def test_token_round_trip():
    assert verify_unsubscribe_token(make_unsubscribe_token("user-1")) == "user-1"


@pytest.mark.parametrize("token", [
    "",
    "user-1",
    "user-1.",
    ".abc",
    "user-1.not-the-signature",
    "x" * 600,
])
def test_malformed_tokens_rejected(token):
    assert verify_unsubscribe_token(token) is None


def test_token_cannot_be_reused_for_another_user():
    sig = make_unsubscribe_token("user-1").rpartition(".")[2]
    assert verify_unsubscribe_token(f"user-2.{sig}") is None


def test_token_depends_on_secret(monkeypatch):
    import services.email_prefs as email_prefs_service

    token = make_unsubscribe_token("user-1")
    monkeypatch.setattr(email_prefs_service.get_settings(), "jwt_secret", "another-secret-that-is-at-least-32-chars")
    assert verify_unsubscribe_token(token) is None


def test_url_and_list_unsubscribe_headers():
    url = unsubscribe_url("user-1")
    parsed = urlparse(url)
    assert parsed.path == "/v1/email/unsubscribe"
    assert verify_unsubscribe_token(parse_qs(parsed.query)["token"][0]) == "user-1"
    headers = list_unsubscribe_headers("user-1")
    assert headers["List-Unsubscribe"] == f"<{url}>"
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


def test_wants_marketing_email():
    assert wants_marketing_email({"id": "u"}) is True
    assert wants_marketing_email({"id": "u", "marketing_emails_opt_out": True}) is False
    assert wants_marketing_email(None) is False


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #

class FakeUsers:
    def __init__(self, docs):
        self.docs = docs

    async def find_one(self, query, projection=None):
        return next((dict(d) for d in self.docs if all(d.get(k) == v for k, v in query.items())), None)

    async def update_one(self, query, update):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(update.get("$set", {}))


class FakeDB:
    def __init__(self):
        self.users = FakeUsers([{"id": "user-1", "email": "ada@example.com"}])


@pytest.fixture
def db(monkeypatch):
    fake = FakeDB()

    async def _get_db():
        return fake

    monkeypatch.setattr(prefs_module, "get_db", _get_db)
    return fake


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(prefs_module.router, prefix="/v1")

    async def _user():
        return User(id="user-1", email="ada@example.com", name="Ada")

    app.dependency_overrides[get_current_user] = _user
    return TestClient(app)


def _opted_out(db):
    return db.users.docs[0].get("marketing_emails_opt_out", False)


def test_get_shows_confirmation_and_changes_nothing(client, db):
    token = make_unsubscribe_token("user-1")
    resp = client.get("/v1/email/unsubscribe", params={"token": token})
    assert resp.status_code == 200
    assert "Unsubscribe from Forge product emails?" in resp.text
    assert 'method="post"' in resp.text
    assert _opted_out(db) is False


def test_get_with_bad_token_is_400(client, db):
    resp = client.get("/v1/email/unsubscribe", params={"token": "user-1.forged"})
    assert resp.status_code == 400
    assert "isn't valid" in resp.text


def test_confirm_button_post_unsubscribes(client, db):
    token = make_unsubscribe_token("user-1")
    resp = client.post("/v1/email/unsubscribe", data={"token": token})
    assert resp.status_code == 200
    assert "You're unsubscribed" in resp.text
    assert _opted_out(db) is True


def test_one_click_post_from_mail_client_unsubscribes(client, db):
    # RFC 8058: token in the URL, fixed form body.
    parsed = urlparse(unsubscribe_url("user-1"))
    resp = client.post(
        f"{parsed.path}?{parsed.query}",
        content="List-Unsubscribe=One-Click",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200
    assert _opted_out(db) is True


def test_post_with_forged_token_changes_nothing(client, db):
    resp = client.post("/v1/email/unsubscribe", params={"token": "user-1.forged"})
    assert resp.status_code == 400
    assert _opted_out(db) is False


def test_token_is_escaped_in_page(client, monkeypatch):
    monkeypatch.setattr(prefs_module, "verify_unsubscribe_token", lambda t: "user-1")
    resp = client.get("/v1/email/unsubscribe", params={"token": '"><script>x</script>'})
    assert "<script>x</script>" not in resp.text


def test_preferences_round_trip(client, db):
    assert client.get("/v1/email/preferences").json() == {"marketing_emails": True}
    assert client.put("/v1/email/preferences", json={"marketing_emails": False}).status_code == 200
    assert _opted_out(db) is True
    assert client.get("/v1/email/preferences").json() == {"marketing_emails": False}
    client.put("/v1/email/preferences", json={"marketing_emails": True})
    assert _opted_out(db) is False


# --------------------------------------------------------------------------- #
# Through the real app: mail clients POST with no session, so the CSRF
# middleware must let the one-click unsubscribe through.
# --------------------------------------------------------------------------- #

def test_one_click_post_passes_csrf_in_real_app(db, monkeypatch):
    from main import app

    monkeypatch.setattr(security_module, "get_redis", lambda: None)
    monkeypatch.setattr(security_module, "_in_memory_rate_limits", OrderedDict())
    token = make_unsubscribe_token("user-1")
    resp = TestClient(app, raise_server_exceptions=False).post(
        "/v1/email/unsubscribe",
        params={"token": token},
        content="List-Unsubscribe=One-Click",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert resp.status_code == 200, resp.text
    assert _opted_out(db) is True


# --------------------------------------------------------------------------- #
# Promotional sends
# --------------------------------------------------------------------------- #

def test_promotional_email_has_unsubscribe_link_and_headers():
    from services.email_prefs import build_promotional_email

    params = build_promotional_email({"id": "user-1", "email": "ada@example.com", "name": "Ada"}, "planning_tips")
    url = unsubscribe_url("user-1")
    assert params["to"] == ["ada@example.com"]
    assert "Unsubscribe" in params["html"] and f"Unsubscribe: {url}" in params["text"]
    assert params["headers"] == list_unsubscribe_headers("user-1")


def test_promotional_email_skipped_after_opt_out():
    from services.email_prefs import build_promotional_email

    user = {"id": "user-1", "email": "ada@example.com", "marketing_emails_opt_out": True}
    assert build_promotional_email(user, "first_build_nudge") is None


def test_welcome_is_not_a_promotional_template():
    from services.email_prefs import build_promotional_email

    with pytest.raises(ValueError):
        build_promotional_email({"id": "user-1", "email": "a@example.com"}, "welcome")
