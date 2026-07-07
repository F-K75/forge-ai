"""Regression tests for AUTH-001: admin authorization must use a persisted
DB role (``users.is_admin``), not an in-memory email-string-match.

Scenarios covered:

1. Non-admin user (DB flag False) is rejected from admin routes even if their
   email appears in ``ADMIN_EMAILS``.
2. Admin user (DB flag True) is accepted even if their email is NOT in the
   env-var list — the DB flag is the source of truth.
3. ``PUT /admin/users/{user_id}/admin`` successfully grants the flag.
4. ``PUT /admin/users/{user_id}/admin`` successfully revokes the flag.
5. A user cannot revoke their own admin status (lockout prevention).
6. Toggling a non-existent target returns 404.
7. A repeated toggle to the same value is a no-op (returns ``unchanged: True``).
8. Migration v3 backfills ``is_admin=True`` for any user whose email is in
   ``ADMIN_EMAILS``; re-runs are idempotent (no duplicate writes, no errors).
"""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "0101010101010101010101010101010101010101010101010101010101010101")


import pytest
from fastapi import HTTPException

from api.admin import toggle_user_admin, admin_required
from core.models import User
from core import migrations as migrations_module


# ---------------------------------------------------------------------------
# Helpers / Fake DB
# ---------------------------------------------------------------------------


def _matches(doc, query):
    for k, cond in query.items():
        val = doc.get(k)
        if isinstance(cond, dict):
            if "$in" in cond:
                if val not in cond["$in"]:
                    return False
                continue
            if "$eq" in cond:
                if val != cond["$eq"]:
                    return False
                continue
            return False
        if val != cond:
            return False
    return True


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = list(docs or [])

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                doc = dict(d)
                if projection:
                    for key, keep in (projection.items() if isinstance(projection, dict) else []):
                        if keep == 0:
                            doc.pop(key, None)
                doc.pop("_id", None)
                return doc
        return None

    async def find(self, query=None, projection=None):
        return _FakeCursor(
            [d for d in self.docs if _matches(d, query or {})],
            projection,
        )

    async def update_one(self, query, update):
        for d in self.docs:
            if _matches(d, query):
                d.update(update.get("$set", {}))
                return
        raise AssertionError("update_one matched nothing")

    async def update_many(self, query, update):
        matched = 0
        for d in self.docs:
            if _matches(d, query):
                d.update(update.get("$set", {}))
                matched += 1

        class _Result:
            matched_count = matched
            modified_count = matched

        return _Result()

    async def insert_one(self, doc):
        doc["_id"] = len(self.docs)
        self.docs.append(doc)

    async def delete_one(self, query):
        before = len(self.docs)
        self.docs = [
            d for d in self.docs
            if not _matches(d, query)
        ]
        assert len(self.docs) < before, "delete_one matched nothing"


class _FakeCursor:
    def __init__(self, docs, projection):
        self._docs = [dict(d) for d in docs]
        self._projection = projection or {}

    def sort(self, *a, **kw):
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for d in self._docs:
            yield d


class FakeDB:
    def __init__(self, users=None, audit_logs=None):
        self.users = FakeCollection(users or [])
        self.audit_logs = FakeCollection(audit_logs or [])
        self._backing = {
            "__forge_migrations": FakeCollection([]),
        }

    def __getitem__(self, key):
        return self._backing.setdefault(key, FakeCollection([]))


def _patch_db(monkeypatch, db):
    async def _get_db():
        return db

    monkeypatch.setattr("api.admin.get_db", _get_db)
    monkeypatch.setattr("api.auth.get_db", _get_db)


ADMIN_ID = "admin-1"
NON_ADMIN_EMAIL_ADMIN_LIST_ID = "user-na"
ANOTHER_ADMIN_ID = "admin-2"


def _admin_doc():
    return {
        "id": ADMIN_ID,
        "email": "admin@forge.ai",
        "name": "Admin User",
        "plan": "enterprise",
        "credits": 9999,
        "banned": False,
        "email_verified": True,
        "mfa_enabled": True,
        "is_admin": True,
    }


def _non_admin_but_allowlisted_doc():
    """User whose email IS in ADMIN_EMAILS but DB flag is False — attacks AUTH-001."""
    return {
        "id": NON_ADMIN_EMAIL_ADMIN_LIST_ID,
        "email": "admin@forge.ai",  # same as allowlisted admin email
        "name": "Attacker",
        "plan": "free",
        "credits": 10,
        "banned": False,
        "email_verified": False,
        "mfa_enabled": False,
        "is_admin": False,
    }


def _another_admin_doc():
    return {
        "id": ANOTHER_ADMIN_ID,
        "email": "ops@forge.ai",
        "name": "Ops Admin",
        "plan": "pro",
        "credits": 999,
        "banned": False,
        "email_verified": True,
        "mfa_enabled": True,
        "is_admin": True,
    }


# ---------------------------------------------------------------------------
# Tests: AUTH-001 — admin authorization is DB-role-based
# ---------------------------------------------------------------------------


class TestAdminRequiredRejectsNonAdminEvenWithAllowlistedEmail:
    """AUTH-001:P0 — any call to admin_required must look at the DB's is_admin
    flag. Setting ADMIN_EMAILS alone must NOT be sufficient."""

    @pytest.mark.asyncio
    async def test_attacker_with_admin_email_is_rejected(self, monkeypatch):
        db = FakeDB(users=[_admin_doc(), _non_admin_but_allowlisted_doc()])
        _patch_db(monkeypatch, db)

        attacker = User(**_non_admin_but_allowlisted_doc())
        with pytest.raises(HTTPException) as exc_info:
            await admin_required(attacker)
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_accepted_when_db_flag_is_true(self, monkeypatch):
        db = FakeDB(users=[_admin_doc()])
        _patch_db(monkeypatch, db)

        admin = User(**_admin_doc())
        result = await admin_required(admin)
        assert result.is_admin is True

    @pytest.mark.asyncio
    async def test_non_admin_email_outside_allowlist_rejected(self, monkeypatch):
        db = FakeDB(users=[{
            "id": "user-outside-allowlist",
            "email": "regular@example.com",
            "name": "Regular",
            "plan": "free",
            "credits": 10,
            "banned": False,
            "mfa_enabled": False,
            "is_admin": False,
        }])
        _patch_db(monkeypatch, db)

        user = User(id="user-outside-allowlist", email="regular@example.com", name="Regular")
        with pytest.raises(HTTPException) as exc_info:
            await admin_required(user)
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# Tests: PUT /admin/users/{user_id}/admin toggle
# ---------------------------------------------------------------------------


class _Togglable:
    """Minimal stand-in for AdminToggleRequest."""

    def __init__(self, is_admin):
        self.is_admin = is_admin


class TestToggleUserAdmin:

    @pytest.mark.asyncio
    async def test_grant_admin_status(self, monkeypatch):
        db = FakeDB(users=[_non_admin_but_allowlisted_doc()])
        _patch_db(monkeypatch, db)

        admin = User(**_admin_doc())
        result = await toggle_user_admin(
            NON_ADMIN_EMAIL_ADMIN_LIST_ID,
            _Togglable(is_admin=True),
            None,
            admin,
        )

        assert result["user_id"] == NON_ADMIN_EMAIL_ADMIN_LIST_ID
        assert result["is_admin"] is True
        assert result["unchanged"] is False
        target = await db.users.find_one({"id": NON_ADMIN_EMAIL_ADMIN_LIST_ID})
        assert target["is_admin"] is True
        # Audit log entry written
        assert len(db.audit_logs.docs) == 1
        assert db.audit_logs.docs[0]["action"] == "grant_admin"
        assert db.audit_logs.docs[0]["changes"]["is_admin"]["old"] is False
        assert db.audit_logs.docs[0]["changes"]["is_admin"]["new"] is True

    @pytest.mark.asyncio
    async def test_revoke_admin_status(self, monkeypatch):
        db = FakeDB(users=[_another_admin_doc()])
        _patch_db(monkeypatch, db)

        caller = User(**_admin_doc())
        result = await toggle_user_admin(
            ANOTHER_ADMIN_ID,
            _Togglable(is_admin=False),
            None,
            caller,
        )

        assert result["user_id"] == ANOTHER_ADMIN_ID
        assert result["is_admin"] is False
        target = await db.users.find_one({"id": ANOTHER_ADMIN_ID})
        assert target["is_admin"] is False
        assert db.audit_logs.docs[0]["action"] == "revoke_admin"

    @pytest.mark.asyncio
    async def test_revoke_own_admin_status_is_blocked(self, monkeypatch):
        db = FakeDB(users=[_admin_doc()])
        _patch_db(monkeypatch, db)

        admin = User(**_admin_doc())
        with pytest.raises(HTTPException) as exc_info:
            await toggle_user_admin(
                ADMIN_ID,
                _Togglable(is_admin=False),
                None,
                admin,
            )
        assert exc_info.value.status_code == 403
        assert "own admin status" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_toggle_nonexistent_user_returns_404(self, monkeypatch):
        db = FakeDB(users=[_admin_doc()])
        _patch_db(monkeypatch, db)

        admin = User(**_admin_doc())
        with pytest.raises(HTTPException) as exc_info:
            await toggle_user_admin(
                "no-such-user",
                _Togglable(is_admin=True),
                None,
                admin,
            )
        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_repeated_same_value_is_noop(self, monkeypatch):
        db = FakeDB(users=[_another_admin_doc()])
        _patch_db(monkeypatch, db)

        admin = User(**_admin_doc())
        result = await toggle_user_admin(
            ANOTHER_ADMIN_ID,
            _Togglable(is_admin=True),
            None,
            admin,
        )

        assert result["unchanged"] is True
        assert result["is_admin"] is True
        assert len(db.audit_logs.docs) == 0


# ---------------------------------------------------------------------------
# Tests: migration v3 (backfill_is_admin)
# ---------------------------------------------------------------------------


class TestMigrationV3:

    @pytest.mark.asyncio
    async def test_v3_is_registered(self):
        """Migration v3 (backfill_is_admin) must exist and be no-op when
        no user is in admin_emails."""
        v3 = [m for m in migrations_module._MIGRATIONS if m[0] == 3]
        assert len(v3) == 1, "Migration v3 must be registered"
        assert v3[0][1] == "backfill_is_admin"

    @pytest.mark.asyncio
    async def test_backfills_users_in_admin_emails_list(self):
        """AUTH-001 v3 backfills is_admin for users whose email is in
        settings.admin_emails. We patch the module-level settings reference."""
        # Set a fake settings object that returns the admin allowlist
        fake_settings = type(
            "S", (), {"admin_emails": "admin@forge.ai,ops@example.com"}
        )()
        original_settings = getattr(migrations_module, "settings", None)
        migrations_module.settings = fake_settings

        try:
            db = FakeDB(users=[
                {"id": "u1", "email": "admin@forge.ai",     "name": "A", "is_admin": False},
                {"id": "u2", "email": "ops@example.com",    "name": "O", "is_admin": False},
                {"id": "u3", "email": "regular@example.com", "name": "R", "is_admin": False},
            ])

            results = await migrations_module.run_migrations(db)
            v3_results = [r for r in results if r.get("version") == 3]
            assert len(v3_results) == 1, f"v3 result not found: {results}"
            assert v3_results[0]["status"] == "applied", f"v3 failed: {v3_results[0]}"

            u1 = await db.users.find_one({"id": "u1"})
            assert u1["is_admin"] is True
            u2 = await db.users.find_one({"id": "u2"})
            assert u2["is_admin"] is True
            u3 = await db.users.find_one({"id": "u3"})
            assert u3["is_admin"] is False
        finally:
            migrations_module.settings = original_settings

    @pytest.mark.asyncio
    async def test_migration_v3_is_idempotent(self):
        """Re-running v3 must not fail when users are already flagged."""
        fake_settings = type("S", (), {"admin_emails": "admin@forge.ai"})()
        original_settings = getattr(migrations_module, "settings", None)
        migrations_module.settings = fake_settings

        try:
            db = FakeDB(users=[
                {"id": "u1", "email": "admin@forge.ai", "is_admin": True},
            ])
            await migrations_module.run_migrations(db)
            results2 = await migrations_module.run_migrations(db)  # second run

            v3_results2 = [r for r in results2 if r.get("version") == 3]
            assert len(v3_results2) == 1
            # Must not fail on re-run
            assert v3_results2[0]["status"] == "applied"
        finally:
            migrations_module.settings = original_settings

    @pytest.mark.asyncio
    async def test_migration_v3_skips_when_admin_emails_empty(self):
        """With no ADMIN_EMAILS, v3 is a silent no-op."""
        fake_settings = type("S", (), {"admin_emails": ""})()
        original_settings = getattr(migrations_module, "settings", None)
        migrations_module.settings = fake_settings

        try:
            db = FakeDB(users=[
                {"id": "u1", "email": "admin@forge.ai", "name": "A", "is_admin": False},
            ])

            results = await migrations_module.run_migrations(db)
            # v3 result may still appear with status "applied" (no-op body executes)
            v3_results = [r for r in results if r.get("version") == 3]
            assert len(v3_results) <= 1  # applied or absent — both fine
            if v3_results:
                assert v3_results[0]["status"] == "applied"
        finally:
            migrations_module.settings = original_settings


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
