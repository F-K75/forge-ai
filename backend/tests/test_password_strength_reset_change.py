"""Regression tests for the password-strength gap found in the frontend
audit: reset_password and change_password previously accepted any
new_password at all (no length or complexity check), unlike register,
which already calls validate_password_strength. Exercises the real
route handlers via TestClient against a FakeDB, not just a code pattern.
"""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

from datetime import datetime, timedelta

from api.auth import _hash_token, hash_password
from auth import verify_password

from tests.test_auth_endpoints import app_client, STRONG_PASSWORD  # noqa: F401 (fixture + shared constant)


def test_reset_password_rejects_weak_password(app_client):
    client, db = app_client
    token = "a-valid-reset-token"
    db.users.docs.append(
        {
            "id": "user-1",
            "email": "reset@example.com",
            "hashed_password": hash_password(STRONG_PASSWORD),
            "password_reset_token": _hash_token(token),
            "password_reset_expires": datetime.utcnow() + timedelta(hours=1),
        }
    )

    resp = client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": "short"},
    )
    assert resp.status_code == 400
    assert "12 characters" in resp.json()["detail"]

    # The weak attempt must not have overwritten the password or consumed the token.
    stored = db.users.docs[0]
    assert verify_password(STRONG_PASSWORD, stored["hashed_password"])
    assert stored["password_reset_token"] is not None


def test_reset_password_rejects_password_missing_complexity(app_client):
    client, db = app_client
    token = "a-valid-reset-token"
    db.users.docs.append(
        {
            "id": "user-1",
            "email": "reset@example.com",
            "hashed_password": hash_password(STRONG_PASSWORD),
            "password_reset_token": _hash_token(token),
            "password_reset_expires": datetime.utcnow() + timedelta(hours=1),
        }
    )

    # 12+ chars but no uppercase/digit/special -- must still be rejected.
    resp = client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": "lowercaseonlypassword"},
    )
    assert resp.status_code == 400


def test_reset_password_accepts_strong_password(app_client):
    client, db = app_client
    token = "a-valid-reset-token"
    db.users.docs.append(
        {
            "id": "user-1",
            "email": "reset@example.com",
            "hashed_password": hash_password(STRONG_PASSWORD),
            "password_reset_token": _hash_token(token),
            "password_reset_expires": datetime.utcnow() + timedelta(hours=1),
        }
    )

    new_password = "AnotherStr0ng!Pass"
    resp = client.post(
        "/auth/reset-password",
        json={"token": token, "new_password": new_password},
    )
    assert resp.status_code == 200

    stored = db.users.docs[0]
    assert verify_password(new_password, stored["hashed_password"])
    assert not verify_password(STRONG_PASSWORD, stored["hashed_password"])
    assert stored["password_reset_token"] is None
