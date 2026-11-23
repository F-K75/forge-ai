"""S0 privacy controls for shadow reviews and human adjudication
(docs/architecture/agent-collaboration-plan.md §5.4, §17; Revision 2 amended
§12.3, PV-1…PV-6).

Runs on the in-memory Mongo double from ``a2_support`` (extended below with
the few operators S0 uses: ``update_many``, ``delete_one``, cursor
``sort``/``skip``/``limit`` and projections are ignored).
"""

from __future__ import annotations

import copy
from datetime import timedelta

import pytest

from core.data_use_consents import (
    SCOPE_AI_QUALITY_REVIEW,
    SCOPE_HUMAN_QUALITY_REVIEW,
    SCOPE_PLATFORM_MODEL_PROCESSING,
    ConsentUnavailable,
    active_from_docs,
    get_active_consents,
    grant_consent,
    list_consents,
    revoke_consent,
)
from core.models import utcnow
from tests.a2_support import FakeCollection, FakeDB, _Cursor, _UpdateResult, matches, set_flags


# --------------------------------------------------------------------------- #
# Mongo double extensions
# --------------------------------------------------------------------------- #


class _SortableCursor(_Cursor):
    def sort(self, key, direction=1):
        if isinstance(key, list):
            key, direction = key[0]
        self._docs = sorted(self._docs, key=lambda d: (d.get(key) is None, d.get(key)), reverse=direction == -1)
        return self

    def skip(self, n):
        self._docs = self._docs[n:]
        return self


class _DeleteResult:
    def __init__(self, n):
        self.deleted_count = n


class S0Collection(FakeCollection):
    def find(self, query=None, projection=None, **_):
        return _SortableCursor([copy.deepcopy(d) for d in self.docs if matches(d, query)])

    async def update_many(self, query, update):
        n = 0
        for d in self.docs:
            if matches(d, query):
                self._apply(d, update, inserting=False)
                n += 1
        return _UpdateResult(n, n)

    async def delete_many(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not matches(d, query)]
        return _DeleteResult(before - len(self.docs))

    async def delete_one(self, query):
        for i, d in enumerate(self.docs):
            if matches(d, query):
                self.docs.pop(i)
                return _DeleteResult(1)
        return _DeleteResult(0)

    async def count_documents(self, query):
        return sum(1 for d in self.docs if matches(d, query))


class S0DB(FakeDB):
    def __getattr__(self, name):
        if name.startswith("__"):
            raise AttributeError(name)
        cols = self.__dict__.setdefault("_collections", {})
        if name not in cols:
            cols[name] = S0Collection()
        return cols[name]


def make_db(**collections) -> S0DB:
    db = S0DB()
    for name, docs in collections.items():
        db._collections[name] = S0Collection(docs)
    return db


@pytest.fixture
def external_flag(monkeypatch):
    """Turn the external adjudication flag on (it defaults to off, U12)."""
    set_flags(monkeypatch, external_adjudication_opt_in=True)


# --------------------------------------------------------------------------- #
# Consent scopes and revocation
# --------------------------------------------------------------------------- #


@pytest.mark.asyncio
async def test_s0_scopes_are_versioned_to_their_own_policy_text(monkeypatch):
    set_flags(monkeypatch, external_adjudication_opt_in=True, ai_quality_review_policy_version="ai-v1")
    db = make_db()
    doc = await grant_consent(db, user_id="u1", scope=SCOPE_AI_QUALITY_REVIEW)
    assert doc["policy_version"] == "ai-v1"
    await grant_consent(db, user_id="u1", scope=SCOPE_PLATFORM_MODEL_PROCESSING)
    assert (await get_active_consents(db, "u1")).scopes == {SCOPE_AI_QUALITY_REVIEW, SCOPE_PLATFORM_MODEL_PROCESSING}

    # Changing the AI-review text requires re-consent for that scope only.
    set_flags(monkeypatch, ai_quality_review_policy_version="ai-v2")
    assert (await get_active_consents(db, "u1")).scopes == {SCOPE_PLATFORM_MODEL_PROCESSING}


@pytest.mark.asyncio
async def test_human_quality_review_not_grantable_while_external_flag_off(monkeypatch):
    set_flags(monkeypatch, external_adjudication_opt_in=False)
    db = make_db()
    with pytest.raises(ConsentUnavailable):
        await grant_consent(db, user_id="u1", scope=SCOPE_HUMAN_QUALITY_REVIEW)
    assert await list_consents(db, "u1") == []

    # A consent stored while the flag was on stops counting when it is off.
    set_flags(monkeypatch, external_adjudication_opt_in=True)
    await grant_consent(db, user_id="u1", scope=SCOPE_HUMAN_QUALITY_REVIEW)
    assert SCOPE_HUMAN_QUALITY_REVIEW in (await get_active_consents(db, "u1")).scopes
    set_flags(monkeypatch, external_adjudication_opt_in=False)
    assert active_from_docs(await list_consents(db, "u1")).scopes == frozenset()


@pytest.mark.asyncio
async def test_revoking_ai_quality_review_drops_queued_reviews_and_calls_s1_hook(external_flag):
    from core.quality_review import register_ai_review_revocation_handler, unregister_ai_review_revocation_handler

    db = make_db(
        users=[{"id": "u1"}],
        shadow_reviews=[
            {"id": "r1", "owner_user_id": "u1", "status": "queued", "consent_basis": "opt_in"},
            {"id": "r2", "owner_user_id": "u1", "status": "running", "consent_basis": "opt_in"},
            {"id": "r3", "owner_user_id": "u2", "status": "queued", "consent_basis": "opt_in"},
        ],
    )
    calls = []

    async def s1_handler(_db, user_id):
        calls.append(user_id)

    register_ai_review_revocation_handler(s1_handler)
    try:
        await grant_consent(db, user_id="u1", scope=SCOPE_AI_QUALITY_REVIEW)
        assert await revoke_consent(db, user_id="u1", scope=SCOPE_AI_QUALITY_REVIEW) is True
    finally:
        unregister_ai_review_revocation_handler(s1_handler)

    by_id = {d["id"]: d for d in db.shadow_reviews.docs}
    assert by_id["r1"]["status"] == "dropped"
    assert by_id["r2"]["status"] == "running"  # already calling the reviewer
    assert by_id["r3"]["status"] == "queued"  # another user
    assert calls == ["u1"]
    assert SCOPE_AI_QUALITY_REVIEW not in (await get_active_consents(db, "u1")).scopes
    # The consent record is kept, revoked (§18.2).
    [record] = await list_consents(db, "u1")
    assert record["revoked_at"] is not None


# --------------------------------------------------------------------------- #
# users.is_internal: admin-set only, audited
# --------------------------------------------------------------------------- #


def _admin(user_id="admin-1"):
    from core.models import User

    return User(id=user_id, email=f"{user_id}@forge.test", name="Admin", is_admin=True)


def _request():
    from starlette.requests import Request

    return Request({"type": "http", "method": "PUT", "path": "/", "headers": [(b"user-agent", b"pytest")],
                    "client": ("10.0.0.9", 1234), "query_string": b""})


@pytest.mark.asyncio
async def test_is_internal_change_is_admin_only_and_audited(monkeypatch):
    import api.admin as admin_api

    db = make_db(users=[{"id": "u1", "email": "u1@x.test"}, {"id": "admin-1", "email": "a@forge.test"}])

    async def fake_get_db():
        return db

    monkeypatch.setattr(admin_api, "get_db", fake_get_db)
    req = admin_api.InternalToggleRequest(is_internal=True, reason="staff account")
    out = await admin_api.set_user_internal_flag("u1", req, _request(), admin=_admin())
    assert out == {"user_id": "u1", "is_internal": True, "unchanged": False}
    assert db.users.docs[0]["is_internal"] is True
    [entry] = db.audit_logs.docs
    assert entry["action"] == "grant_internal" and entry["resource_id"] == "u1"
    assert entry["actor_id"] == "admin-1" and entry["ip_address"] == "10.0.0.9"
    assert entry["changes"]["is_internal"] == {"old": False, "new": True}

    # A no-op writes no audit entry; every real change writes exactly one.
    out = await admin_api.set_user_internal_flag("u1", req, _request(), admin=_admin())
    assert out["unchanged"] is True and len(db.audit_logs.docs) == 1
    out = await admin_api.set_user_internal_flag(
        "u1", admin_api.InternalToggleRequest(is_internal=False), _request(), admin=_admin(),
    )
    assert out["unchanged"] is False and db.users.docs[0]["is_internal"] is False
    assert [e["action"] for e in db.audit_logs.docs] == ["grant_internal", "revoke_internal"]

    with pytest.raises(Exception) as exc:
        await admin_api.set_user_internal_flag("nobody", req, _request(), admin=_admin())
    assert getattr(exc.value, "status_code", None) == 404


def test_is_internal_route_requires_admin_and_users_cannot_set_it():
    import inspect

    import api.admin as admin_api
    from api.auth import UpdateProfileRequest
    from core.models import User

    sig = inspect.signature(admin_api.set_user_internal_flag)
    assert sig.parameters["admin"].default.dependency is admin_api.admin_required
    # Neither the self-service profile update nor the User model carries it.
    assert "is_internal" not in UpdateProfileRequest.model_fields
    assert "is_internal" not in User.model_fields
