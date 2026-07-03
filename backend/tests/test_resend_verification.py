"""Regression tests for the /auth/resend-verification endpoint (part of
PROD-005). Found 2026-07-03 while auditing PROD-005 ("email verification
missing") -- verification was actually already fully implemented server-side
(register() sends the email, GET /verify-email confirms it, builds.py blocks
unverified users), but there was no way to get a *second* link if the first
never arrived (RESEND_API_KEY unconfigured, spam filter, or the 24h token
simply expired) and no frontend page to land on after clicking the link
either (see VerifyEmail.tsx). This tests the resend half.
"""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest

from api.auth import resend_verification, ResendVerificationRequest


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    async def update_one(self, query, update):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                d.update(update.get("$set", {}))
                return


class FakeDB:
    def __init__(self, users=None):
        self.users = FakeCollection(users or [])


def _patch_db(monkeypatch, db):
    async def _get_db():
        return db

    monkeypatch.setattr("api.auth.get_db", _get_db)


async def _allow_rate_limit(*a, **kw):
    return True, 99


@pytest.mark.asyncio
async def test_resend_generates_new_token_for_unverified_user(monkeypatch):
    db = FakeDB(users=[{"email": "a@example.com", "email_verified": False, "verification_token": "old"}])
    _patch_db(monkeypatch, db)
    monkeypatch.setattr("api.auth.check_email_rate_limit", _allow_rate_limit)
    sent = []
    monkeypatch.setattr("api.auth._send_verification_email", lambda email, token: sent.append((email, token)))

    result = await resend_verification(ResendVerificationRequest(email="a@example.com"))

    assert result == {"ok": True}
    assert db.users.docs[0]["verification_token"] != "old"
    assert len(sent) == 1
    assert sent[0][0] == "a@example.com"


@pytest.mark.asyncio
async def test_resend_does_nothing_for_already_verified_user(monkeypatch):
    db = FakeDB(users=[{"email": "a@example.com", "email_verified": True, "verification_token": None}])
    _patch_db(monkeypatch, db)
    monkeypatch.setattr("api.auth.check_email_rate_limit", _allow_rate_limit)
    sent = []
    monkeypatch.setattr("api.auth._send_verification_email", lambda email, token: sent.append((email, token)))

    result = await resend_verification(ResendVerificationRequest(email="a@example.com"))

    assert result == {"ok": True}
    assert sent == []  # no email sent -- already verified


@pytest.mark.asyncio
async def test_resend_does_not_leak_whether_account_exists(monkeypatch):
    """Same {"ok": True} response whether the account exists or not."""
    db = FakeDB(users=[])
    _patch_db(monkeypatch, db)
    monkeypatch.setattr("api.auth.check_email_rate_limit", _allow_rate_limit)
    sent = []
    monkeypatch.setattr("api.auth._send_verification_email", lambda email, token: sent.append((email, token)))

    result = await resend_verification(ResendVerificationRequest(email="nobody@example.com"))

    assert result == {"ok": True}
    assert sent == []


@pytest.mark.asyncio
async def test_resend_is_rate_limited(monkeypatch):
    from fastapi import HTTPException

    db = FakeDB(users=[{"email": "a@example.com", "email_verified": False}])
    _patch_db(monkeypatch, db)

    async def _blocked(*a, **kw):
        return False, 0

    monkeypatch.setattr("api.auth.check_email_rate_limit", _blocked)

    with pytest.raises(HTTPException) as exc_info:
        await resend_verification(ResendVerificationRequest(email="a@example.com"))
    assert exc_info.value.status_code == 429


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
