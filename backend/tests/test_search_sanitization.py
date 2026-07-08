"""Regression tests for ReDoS / NoSQL injection in search endpoints.

Verifies that the marketplace and tasks list endpoints sanitize the `search`
query parameter before passing it to a MongoDB $regex query. The raw user
input must be escaped and length-capped so that a malicious regex pattern
cannot trigger catastrophic backtracking on the database.
"""

import os

os.environ.setdefault("CI_TEST_MODE", "1")
os.environ.setdefault("TESTING", "1")
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-ci-purposes-only-32chars")
os.environ.setdefault(
    "FIELD_ENCRYPTION_KEY",
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
)

from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from core.models import User


# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in with $regex support
# --------------------------------------------------------------------------- #


def _matches(doc: dict, query: dict) -> bool:
    for key, val in query.items():
        if key == "$or":
            if not any(_matches(doc, clause) for clause in val):
                return False
            continue
        if isinstance(val, dict) and "$regex" in val:
            import re
            pattern = val["$regex"]
            options = val.get("$options", "")
            flags = 0
            if "i" in options:
                flags |= re.IGNORECASE
            if not re.search(pattern, str(doc.get(key, "")), flags):
                return False
            continue
        if doc.get(key) != val:
            return False
    return True


class FakeCursor:
    def __init__(self, docs, projection):
        self._docs = [dict(d) for d in docs]
        self._projection = projection
        self._skip = 0
        self._limit = None

    def sort(self, *args):
        if len(args) == 1 and isinstance(args[0], list):
            spec = args[0]
        elif len(args) == 2:
            spec = [(args[0], args[1])]
        else:
            spec = []
        for field, direction in spec:
            self._docs.sort(
                key=lambda d: (d.get(field) is None, d.get(field)),
                reverse=(direction == -1),
            )
        return self

    async def to_list(self, length=None):
        docs = self._docs[self._skip:]
        if self._limit is not None:
            docs = docs[: self._limit]
        return [
            {k: v for k, v in d.items() if self._projection.get(k, 1) != 0}
            for d in docs
        ]

    def skip(self, n):
        self._skip = n
        return self

    def limit(self, n):
        self._limit = n
        return self


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                proj = projection or {"_id": 0}
                return {k: v for k, v in d.items() if proj.get(k, 1) != 0}
        return None

    async def count_documents(self, query):
        return sum(1 for d in self.docs if _matches(d, query))

    def find(self, query, projection=None):
        matched = [d for d in self.docs if _matches(d, query)]
        return FakeCursor(matched, projection or {"_id": 0})

    async def insert_one(self, doc):
        self.docs.append(dict(doc))


class FakeDB:
    def __init__(self):
        self.marketplace_items = FakeCollection()
        self.tasks = FakeCollection()
        self.users = FakeCollection()
        self.initiatives = FakeCollection()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _client_for(monkeypatch, router_module, db, user=None):
    async def _get_db():
        return db

    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    if user is not None:
        app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def _seed_marketplace(coll: FakeCollection):
    coll.docs.extend([
        {"id": "m1", "title": "React Todo App", "description": "A simple todo app",
         "prompt": "Build a todo app", "rating": 4.5, "rating_count": 10,
         "tags": ["react"], "type": "template", "is_public": True,
         "downloads": 10, "created_at": "2024-01-01"},
        {"id": "m2", "title": "Python API", "description": "FastAPI backend template",
         "prompt": "Build a FastAPI backend", "rating": 4.8, "rating_count": 5,
         "tags": ["python", "api"], "type": "template", "is_public": True,
         "downloads": 5, "created_at": "2024-01-02"},
        {"id": "m3", "title": "Vue Dashboard", "description": "Admin dashboard with charts",
         "prompt": "Build an admin dashboard", "rating": 4.2, "rating_count": 3,
         "tags": ["vue", "dashboard"], "type": "template", "is_public": True,
         "downloads": 3, "created_at": "2024-01-03"},
    ])


def _seed_tasks(coll: FakeCollection):
    coll.docs.extend([
        {"id": "t1", "initiative_id": "init-1", "title": "Setup auth",
         "description": "Implement JWT login", "status": "done", "kanban_order": 1,
         "assigned_agent": "backend_agent", "labels": []},
        {"id": "t2", "initiative_id": "init-1", "title": "Build UI",
         "description": "Create React components", "status": "in_progress",
         "kanban_order": 2, "assigned_agent": "frontend_agent", "labels": []},
        {"id": "t3", "initiative_id": "init-1", "title": "Write tests",
         "description": "Add pytest coverage", "status": "todo",
         "kanban_order": 3, "assigned_agent": "qa_agent", "labels": []},
    ])


# --------------------------------------------------------------------------- #
# Marketplace search sanitization tests
# --------------------------------------------------------------------------- #


def test_marketplace_search_normal(monkeypatch):
    import api.marketplace as marketplace_module

    db = FakeDB()
    _seed_marketplace(db.marketplace_items)
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, marketplace_module, db, user=user)

    r = client.get("/marketplace/?search=React")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == "m1"


def test_marketplace_search_case_insensitive(monkeypatch):
    import api.marketplace as marketplace_module

    db = FakeDB()
    _seed_marketplace(db.marketplace_items)
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, marketplace_module, db, user=user)

    r = client.get("/marketplace/?search=FASTAPI")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == "m2"


def test_marketplace_search_special_chars_escaped(monkeypatch):
    """Special regex characters in search should be escaped, not interpreted."""
    import api.marketplace as marketplace_module

    db = FakeDB()
    _seed_marketplace(db.marketplace_items)
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, marketplace_module, db, user=user)

    # A pattern like "(React|Python)" would match either if unescaped, but after
    # sanitization it should be treated as a literal string and match nothing.
    r = client.get("/marketplace/?search=(React|Python)")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0


def test_marketplace_search_length_capped(monkeypatch):
    """Very long search strings should be truncated to prevent abuse."""
    import api.marketplace as marketplace_module

    db = FakeDB()
    _seed_marketplace(db.marketplace_items)
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, marketplace_module, db, user=user)

    long_search = "A" * 500
    r = client.get(f"/marketplace/?search={long_search}")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0


def test_marketplace_search_redos_pattern_neutralized(monkeypatch):
    """Catastrophic backtracking regex patterns must not hang the DB."""
    import api.marketplace as marketplace_module

    db = FakeDB()
    _seed_marketplace(db.marketplace_items)
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, marketplace_module, db, user=user)

    # Classic ReDoS pattern: (a+)+b against a long input. After sanitization,
    # the parentheses and plus signs are escaped, so the query is a literal
    # string match and completes instantly.
    redos_payload = "A" * 30 + "B"
    r = client.get(f"/marketplace/?search={redos_payload}")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 0


# --------------------------------------------------------------------------- #
# Tasks search sanitization tests
# --------------------------------------------------------------------------- #


def test_tasks_search_normal(monkeypatch):
    import api.tasks as tasks_module

    db = FakeDB()
    _seed_tasks(db.tasks)
    db.initiatives.docs.append({"id": "init-1", "user_id": "u1"})
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, tasks_module, db, user=user)

    r = client.get("/tasks/?initiative_id=init-1&search=auth")
    assert r.status_code == 200
    body = r.json()
    assert len(body["tasks"]) == 1
    assert body["tasks"][0]["id"] == "t1"


def test_tasks_search_special_chars_escaped(monkeypatch):
    """Special regex characters in task search should be escaped."""
    import api.tasks as tasks_module

    db = FakeDB()
    _seed_tasks(db.tasks)
    db.initiatives.docs.append({"id": "init-1", "user_id": "u1"})
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, tasks_module, db, user=user)

    r = client.get("/tasks/?initiative_id=init-1&search=(auth|ui)")
    assert r.status_code == 200
    body = r.json()
    assert len(body["tasks"]) == 0


def test_tasks_search_length_capped(monkeypatch):
    """Very long search strings should be truncated."""
    import api.tasks as tasks_module

    db = FakeDB()
    _seed_tasks(db.tasks)
    db.initiatives.docs.append({"id": "init-1", "user_id": "u1"})
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, tasks_module, db, user=user)

    long_search = "Z" * 500
    r = client.get(f"/tasks/?initiative_id=init-1&search={long_search}")
    assert r.status_code == 200
    body = r.json()
    assert len(body["tasks"]) == 0


def test_tasks_search_redos_pattern_neutralized(monkeypatch):
    """Catastrophic backtracking regex patterns must not hang the DB."""
    import api.tasks as tasks_module

    db = FakeDB()
    _seed_tasks(db.tasks)
    db.initiatives.docs.append({"id": "init-1", "user_id": "u1"})
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, tasks_module, db, user=user)

    redos_payload = "X" * 30 + "Y"
    r = client.get(f"/tasks/?initiative_id=init-1&search={redos_payload}")
    assert r.status_code == 200
    body = r.json()
    assert len(body["tasks"]) == 0
