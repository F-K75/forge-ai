"""ADMIN_EMAILS must default to empty.

The frontend's demo shortcut "Sign in as Admin" uses admin@forge.ai. If the
backend also allowlisted that address by default, any deploy that forgot to
set ADMIN_EMAILS would hand admin to whoever registered it first.
"""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest

import api.auth as auth_module
from core.config import Settings
from tests.test_auth_endpoints import STRONG_PASSWORD, app_client  # noqa: F401 (fixture)

DEFAULT_ADMIN_EMAILS = Settings.model_fields["admin_emails"].default


def test_admin_emails_defaults_to_empty(monkeypatch):
    monkeypatch.delenv("ADMIN_EMAILS", raising=False)
    assert DEFAULT_ADMIN_EMAILS == ""
    assert Settings(_env_file=None).admin_emails == ""


def test_register_with_demo_admin_email_is_not_admin_by_default(app_client, monkeypatch):  # noqa: F811
    client, db = app_client
    monkeypatch.setattr(auth_module.settings, "admin_emails", DEFAULT_ADMIN_EMAILS)
    resp = client.post(
        "/auth/register",
        json={"email": "admin@forge.ai", "name": "Claimant", "password": STRONG_PASSWORD},
    )
    assert resp.status_code == 200
    assert db.users.docs[0].get("is_admin") is not True


def test_register_with_configured_admin_email_is_admin(app_client, monkeypatch):  # noqa: F811
    client, db = app_client
    monkeypatch.setattr(auth_module.settings, "admin_emails", "ops@example.com")
    resp = client.post(
        "/auth/register",
        json={"email": "ops@example.com", "name": "Ops", "password": STRONG_PASSWORD},
    )
    assert resp.status_code == 200
    assert db.users.docs[0].get("is_admin") is True


@pytest.mark.asyncio
async def test_admin_migration_is_noop_with_default_admin_emails(monkeypatch):
    from core import migrations

    calls = []

    class _Users:
        async def update_many(self, *args, **kwargs):
            calls.append(args)

    class _DB:
        users = _Users()

    monkeypatch.setattr(migrations.settings, "admin_emails", DEFAULT_ADMIN_EMAILS)
    await migrations._migration_reapply_is_admin_from_env(_DB())
    assert calls == []
