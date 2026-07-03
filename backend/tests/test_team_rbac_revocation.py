"""Regression tests for BE-018: organization RBAC had no way to change a
member's role or remove them at all -- only invite/list/accept existed.
Found 2026-07-03 while auditing audit-logging coverage (BE-009): a
compromised or departing team member's org access could never be revoked
via the API, short of deleting the whole organization. Fixed by adding
PUT /auth/organizations/{org_id}/members/{member_id}/role and
DELETE /auth/organizations/{org_id}/members/{member_id}.
"""

import os

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "01" * 32)

import pytest
from fastapi import HTTPException

from api.auth import update_member_role, remove_member, UpdateMemberRoleRequest
from core.models import User, Role


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
        raise AssertionError("update_one matched nothing")

    async def delete_one(self, query):
        before = len(self.docs)
        self.docs = [
            d for d in self.docs if not all(d.get(k) == v for k, v in query.items())
        ]
        assert len(self.docs) < before, "delete_one matched nothing"

    async def insert_one(self, doc):
        self.docs.append(doc)


class FakeDB:
    def __init__(self, organizations=None, team_members=None):
        self.organizations = FakeCollection(organizations or [])
        self.team_members = FakeCollection(team_members or [])
        self.audit_logs = FakeCollection([])


ORG_ID = "org-1"
OWNER_ID = "user-owner"


def _org():
    return {"id": ORG_ID, "owner_id": OWNER_ID, "name": "Acme", "slug": "acme"}


def _member(member_id, user_id, role):
    return {"id": member_id, "org_id": ORG_ID, "user_id": user_id, "role": role}


def _user(user_id):
    return User(id=user_id, email=f"{user_id}@example.com", name=user_id)


def _patch_db(monkeypatch, db):
    async def _get_db():
        return db

    monkeypatch.setattr("api.auth.get_db", _get_db)


# --- update_member_role ---


@pytest.mark.asyncio
async def test_update_member_role_requires_owner_or_admin(monkeypatch):
    db = FakeDB(
        organizations=[_org()],
        team_members=[
            _member("m-owner", OWNER_ID, Role.OWNER),
            _member("m-a", "user-a", Role.MEMBER),
            _member("m-b", "user-b", Role.MEMBER),
        ],
    )
    _patch_db(monkeypatch, db)

    with pytest.raises(HTTPException) as exc_info:
        await update_member_role(
            ORG_ID, "m-b", UpdateMemberRoleRequest(role=Role.ADMIN), _user("user-a")
        )
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_update_member_role_succeeds_for_owner(monkeypatch):
    db = FakeDB(
        organizations=[_org()],
        team_members=[
            _member("m-owner", OWNER_ID, Role.OWNER),
            _member("m-b", "user-b", Role.MEMBER),
        ],
    )
    _patch_db(monkeypatch, db)

    result = await update_member_role(
        ORG_ID, "m-b", UpdateMemberRoleRequest(role=Role.ADMIN), _user(OWNER_ID)
    )

    assert result == {"ok": True}
    assert db.team_members.docs[1]["role"] == Role.ADMIN
    assert len(db.audit_logs.docs) == 1
    assert db.audit_logs.docs[0]["action"] == "update_member_role"
    assert db.audit_logs.docs[0]["changes"]["old_role"] == Role.MEMBER
    assert db.audit_logs.docs[0]["changes"]["new_role"] == Role.ADMIN


@pytest.mark.asyncio
async def test_cannot_change_owner_role(monkeypatch):
    db = FakeDB(
        organizations=[_org()],
        team_members=[
            _member("m-owner", OWNER_ID, Role.OWNER),
            _member("m-admin", "user-admin", Role.ADMIN),
        ],
    )
    _patch_db(monkeypatch, db)

    with pytest.raises(HTTPException) as exc_info:
        await update_member_role(
            ORG_ID,
            "m-owner",
            UpdateMemberRoleRequest(role=Role.MEMBER),
            _user("user-admin"),
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_cannot_promote_a_member_to_owner(monkeypatch):
    db = FakeDB(
        organizations=[_org()],
        team_members=[
            _member("m-owner", OWNER_ID, Role.OWNER),
            _member("m-b", "user-b", Role.MEMBER),
        ],
    )
    _patch_db(monkeypatch, db)

    with pytest.raises(HTTPException) as exc_info:
        await update_member_role(
            ORG_ID, "m-b", UpdateMemberRoleRequest(role=Role.OWNER), _user(OWNER_ID)
        )
    assert exc_info.value.status_code == 400


# --- remove_member ---


@pytest.mark.asyncio
async def test_member_cannot_remove_another_member(monkeypatch):
    db = FakeDB(
        organizations=[_org()],
        team_members=[
            _member("m-owner", OWNER_ID, Role.OWNER),
            _member("m-a", "user-a", Role.MEMBER),
            _member("m-b", "user-b", Role.MEMBER),
        ],
    )
    _patch_db(monkeypatch, db)

    with pytest.raises(HTTPException) as exc_info:
        await remove_member(ORG_ID, "m-b", _user("user-a"))
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_member_can_remove_themselves(monkeypatch):
    db = FakeDB(
        organizations=[_org()],
        team_members=[
            _member("m-owner", OWNER_ID, Role.OWNER),
            _member("m-a", "user-a", Role.MEMBER),
        ],
    )
    _patch_db(monkeypatch, db)

    result = await remove_member(ORG_ID, "m-a", _user("user-a"))

    assert result == {"ok": True}
    assert all(m["id"] != "m-a" for m in db.team_members.docs)
    assert db.audit_logs.docs[0]["action"] == "leave_organization"


@pytest.mark.asyncio
async def test_admin_can_remove_a_compromised_member(monkeypatch):
    """The actual real-world scenario this fixes: revoking a compromised or
    departing team member's access."""
    db = FakeDB(
        organizations=[_org()],
        team_members=[
            _member("m-owner", OWNER_ID, Role.OWNER),
            _member("m-admin", "user-admin", Role.ADMIN),
            _member("m-victim", "user-victim", Role.MEMBER),
        ],
    )
    _patch_db(monkeypatch, db)

    result = await remove_member(ORG_ID, "m-victim", _user("user-admin"))

    assert result == {"ok": True}
    assert all(m["id"] != "m-victim" for m in db.team_members.docs)
    assert db.audit_logs.docs[0]["action"] == "remove_member"
    assert db.audit_logs.docs[0]["changes"]["removed_user_id"] == "user-victim"


@pytest.mark.asyncio
async def test_cannot_remove_the_owner(monkeypatch):
    db = FakeDB(
        organizations=[_org()],
        team_members=[
            _member("m-owner", OWNER_ID, Role.OWNER),
            _member("m-admin", "user-admin", Role.ADMIN),
        ],
    )
    _patch_db(monkeypatch, db)

    with pytest.raises(HTTPException) as exc_info:
        await remove_member(ORG_ID, "m-owner", _user("user-admin"))
    assert exc_info.value.status_code == 400


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
