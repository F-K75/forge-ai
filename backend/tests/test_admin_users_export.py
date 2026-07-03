"""Regression test for PROD-003: GET /admin/users/export didn't exist at
all -- no route in admin.py, no caller in the frontend's adminApi. Found
and confirmed missing 2026-07-03. Fixed by adding a CSV-export endpoint,
registered ahead of /users/{user_id} so "export" isn't swallowed as a
user_id path parameter.
"""

import csv
import io

import pytest

from api.admin import export_users
from core.models import User


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, query, projection=None):
        return _FakeCursor([d for d in self.docs if _matches(d, query)])

    async def insert_one(self, doc):
        self.docs.append(doc)


def _matches(doc, query):
    for k, v in query.items():
        if k == "$or":
            if not any(_matches(doc, clause) for clause in v):
                return False
        elif doc.get(k) != v:
            return False
    return True


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    def sort(self, *a, **kw):
        return self

    def limit(self, *a, **kw):
        return self

    def __aiter__(self):
        return self._gen()

    async def _gen(self):
        for d in self._docs:
            yield d


class FakeDB:
    def __init__(self, users=None):
        self.users = FakeCollection(users or [])
        self.audit_logs = FakeCollection([])


def _patch_db(monkeypatch, db):
    async def _get_db():
        return db

    monkeypatch.setattr("api.admin.get_db", _get_db)


def _admin_user():
    return User(id="admin-1", email="admin@forge.ai", name="Admin")


async def _read_csv_body(response):
    chunks = []
    async for chunk in response.body_iterator:
        chunks.append(chunk if isinstance(chunk, str) else chunk.decode())
    return "".join(chunks)


@pytest.mark.asyncio
async def test_export_returns_csv_with_all_users(monkeypatch):
    db = FakeDB(users=[
        {"id": "u1", "email": "a@x.com", "name": "A", "plan": "free", "credits": 10, "banned": False, "email_verified": True, "created_at": "2026-01-01"},
        {"id": "u2", "email": "b@x.com", "name": "B", "plan": "pro", "credits": 500, "banned": False, "email_verified": False, "created_at": "2026-01-02"},
    ])
    _patch_db(monkeypatch, db)

    response = await export_users(plan=None, banned=None, search=None, admin=_admin_user())

    assert response.media_type == "text/csv"
    assert "attachment" in response.headers["content-disposition"]

    body = await _read_csv_body(response)
    rows = list(csv.reader(io.StringIO(body)))
    assert rows[0] == ["id", "email", "name", "plan", "credits", "banned", "email_verified", "created_at"]
    assert len(rows) == 3  # header + 2 users
    emails = {row[1] for row in rows[1:]}
    assert emails == {"a@x.com", "b@x.com"}


@pytest.mark.asyncio
async def test_export_respects_plan_filter(monkeypatch):
    db = FakeDB(users=[
        {"id": "u1", "email": "a@x.com", "name": "A", "plan": "free", "credits": 10, "banned": False, "email_verified": True, "created_at": "2026-01-01"},
        {"id": "u2", "email": "b@x.com", "name": "B", "plan": "pro", "credits": 500, "banned": False, "email_verified": False, "created_at": "2026-01-02"},
    ])
    _patch_db(monkeypatch, db)

    response = await export_users(plan="pro", banned=None, search=None, admin=_admin_user())
    body = await _read_csv_body(response)
    rows = list(csv.reader(io.StringIO(body)))

    assert len(rows) == 2  # header + 1 matching user
    assert rows[1][1] == "b@x.com"


@pytest.mark.asyncio
async def test_export_writes_an_audit_log_entry(monkeypatch):
    db = FakeDB(users=[{"id": "u1", "email": "a@x.com", "name": "A", "plan": "free", "credits": 10, "banned": False, "email_verified": True, "created_at": "2026-01-01"}])
    _patch_db(monkeypatch, db)

    await export_users(plan=None, banned=None, search=None, admin=_admin_user())

    assert len(db.audit_logs.docs) == 1
    assert db.audit_logs.docs[0]["action"] == "export_users"
    assert db.audit_logs.docs[0]["actor_id"] == "admin-1"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
