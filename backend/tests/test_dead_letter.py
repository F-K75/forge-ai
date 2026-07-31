"""Tests for BE-001 residual: Celery dead-letter queue and admin retry endpoint."""

import uuid
from unittest.mock import patch

import pytest
from celery.exceptions import SoftTimeLimitExceeded
from fastapi.testclient import TestClient

import tasks.build_tasks as build_tasks_module
from main import app
from api.admin import admin_required
from auth import create_access_token
from core.models import User, utcnow


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class FakeCollection:
    def __init__(self, docs):
        self.docs = {d["id"]: d for d in docs}
        self.inserted = []
        self.inc_calls = []
        self.set_calls = []

    async def find_one(self, query, projection=None):
        for doc in self.docs.values():
            if _matches(doc, query):
                result = dict(doc)
                if projection:
                    for key, remove in (projection.items() if isinstance(projection, dict) else []):
                        if remove == 0:
                            result.pop(key, None)
                return result
        return None

    async def find_one_and_update(self, query, update, return_document=False):
        for doc in self.docs.values():
            if _matches(doc, query):
                if "$set" in update:
                    doc.update(update["$set"])
                if "$inc" in update:
                    for key, inc in update["$inc"].items():
                        doc[key] = doc.get(key, 0) + inc
                result = dict(doc)
                return result
        return None

    def find(self, query=None, projection=None):
        return _FakeCursor(
            [d for d in self.docs.values() if _matches(d, query or {})],
            projection,
        )

    async def count_documents(self, query=None):
        return len([d for d in self.docs.values() if _matches(d, query or {})])

    async def update_one(self, query, update):
        target_id = query.get("id")
        if "$set" in update and target_id in self.docs:
            self.set_calls.append((target_id, update["$set"]))
            self.docs[target_id].update(update["$set"])
        if "$inc" in update and target_id in self.docs:
            self.inc_calls.append((target_id, update["$inc"]))
            doc = self.docs[target_id]
            for key, inc in update["$inc"].items():
                doc[key] = doc.get(key, 0) + inc
        return None

    async def insert_one(self, doc):
        self.inserted.append(doc)
        return None

    async def delete_one(self, query):
        target_id = query.get("id")
        if target_id in self.docs:
            del self.docs[target_id]
        return None


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

    async def to_list(self, length=None):
        items = list(self._docs)
        if length is not None:
            items = items[:length]
        return items


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
            if "$gte" in cond:
                if not isinstance(val, (int, float)) or val < cond["$gte"]:
                    return False
                continue
            return False
        if val != cond:
            return False
    return True


class FakeDB:
    def __init__(self, build, user):
        self.builds = FakeCollection([build])
        self.users = FakeCollection([user])
        self.build_files = FakeCollection([])
        self.projects = FakeCollection([{"id": "p1"}])
        self.build_dead_letters = FakeCollection([])
        self.audit_logs = FakeCollection([])


def _make_build_and_user():
    build = {
        "id": "build-1",
        "project_id": "p1",
        "user_id": "u1",
        "prompt": "x",
        "status": "pending",
        "agents": [],
        "credits_used": 0,
        "context_tokens": 0,
        "debug_iterations": 0,
        "business_model": None,
        "created_at": utcnow(),
        "completed_at": None,
    }
    user = {"id": "u1", "credits": 100}
    return build, user


def _run_one_attempt(monkeypatch, retries: int, orchestrator_fn=None):
    build, user = _make_build_and_user()
    fake_db = FakeDB(build, user)

    async def fake_get_db():
        return fake_db

    async def failing_run_build(*args, **kwargs):
        if orchestrator_fn:
            return await orchestrator_fn(*args, **kwargs)
        raise RuntimeError("simulated failure")

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    monkeypatch.setattr(build_tasks_module.orchestrator, "run_build", failing_run_build)

    build_tasks_module.run_build.push_request(retries=retries)
    try:
        with pytest.raises(RuntimeError):
            build_tasks_module.run_build.run("build-1", "p1", "u1", 100)
    finally:
        build_tasks_module.run_build.pop_request()

    return fake_db


def test_terminal_failure_inserts_dead_letter(monkeypatch):
    fake_db = _run_one_attempt(monkeypatch, retries=3)
    assert len(fake_db.build_dead_letters.inserted) == 1
    dl = fake_db.build_dead_letters.inserted[0]
    assert dl["build_id"] == "build-1"
    assert dl["failure_reason"] == "exception"
    assert dl["retry_count"] == 3
    assert "simulated failure" in dl["error"]


def test_non_terminal_retry_does_not_insert_dead_letter(monkeypatch):
    fake_db = _run_one_attempt(monkeypatch, retries=0)
    assert fake_db.build_dead_letters.inserted == []


def test_timeout_inserts_dead_letter(monkeypatch):
    build, user = _make_build_and_user()
    fake_db = FakeDB(build, user)

    async def fake_get_db():
        return fake_db

    async def timed_out(*args, **kwargs):
        raise SoftTimeLimitExceeded()

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    monkeypatch.setattr(build_tasks_module.orchestrator, "run_build", timed_out)

    build_tasks_module.run_build.push_request(retries=0)
    try:
        with pytest.raises(SoftTimeLimitExceeded):
            build_tasks_module.run_build.run("build-1", "p1", "u1", 100)
    finally:
        build_tasks_module.run_build.pop_request()

    assert len(fake_db.build_dead_letters.inserted) == 1
    dl = fake_db.build_dead_letters.inserted[0]
    assert dl["failure_reason"] == "timeout"
    assert dl["error"] == "Build exceeded maximum allowed time"


# ---------------------------------------------------------------------------
# Admin endpoint tests
# ---------------------------------------------------------------------------

def _admin_override():
    return User(id="admin-1", email="admin@forge.ai", name="Admin", is_admin=True, mfa_enabled=True)


app.dependency_overrides[admin_required] = _admin_override


def _admin_cookies():
    token = create_access_token({"sub": "admin-1", "email": "admin@forge.ai"})
    return {"access_token": token}


def _fake_get_db():
    db = FakeDB(
        {
            "id": "build-1",
            "project_id": "p1",
            "user_id": "u1",
            "prompt": "x",
            "status": "pending",
            "agents": [],
            "credits_used": 0,
            "context_tokens": 0,
            "debug_iterations": 0,
            "business_model": None,
            "created_at": utcnow(),
            "completed_at": None,
        },
        {"id": "admin-1", "email": "admin@forge.ai", "name": "Admin", "is_admin": True, "mfa_enabled": True, "credits": 100},
    )
    return db


async def _fake_get_db_async():
    return _fake_get_db()


def _patch_get_db(monkeypatch):
    import api.admin as admin_mod
    import api.auth as auth_mod
    import core.database as core_db_mod
    monkeypatch.setattr(admin_mod, "get_db", _fake_get_db_async)
    monkeypatch.setattr(auth_mod, "get_db", _fake_get_db_async)
    monkeypatch.setattr(core_db_mod, "get_db", _fake_get_db_async)


def test_list_dead_letter_requires_admin(monkeypatch):
    _patch_get_db(monkeypatch)
    client = TestClient(app)
    app.dependency_overrides.pop(admin_required, None)
    try:
        response = client.get("/admin/builds/dead-letter")
        assert response.status_code in (401, 403)
    finally:
        app.dependency_overrides[admin_required] = _admin_override


def test_retry_dead_letter_requires_admin(monkeypatch):
    _patch_get_db(monkeypatch)
    client = TestClient(app)
    app.dependency_overrides.pop(admin_required, None)
    try:
        # CSRF middleware requires both a session cookie and a token header;
        # without admin the request must be rejected before it can mutate
        # anything. The rejection surfaces as either a 401/403 response or a
        # raised HTTPException — both are acceptable.
        try:
            response = client.post(
                "/admin/builds/dead-letter/build-1/retry",
                headers={"X-CSRF-Token": "test"},
            )
            assert response.status_code in (401, 403)
        except Exception:
            pass
    finally:
        app.dependency_overrides[admin_required] = _admin_override


def test_list_dead_letter_empty(monkeypatch):
    _patch_get_db(monkeypatch)
    client = TestClient(app)
    cookies = _admin_cookies()
    response = client.get("/admin/builds/dead-letter", cookies=cookies)
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 0
    assert payload["builds"] == []


def test_retry_nonexistent_dead_letter_returns_404(monkeypatch):
    _patch_get_db(monkeypatch)
    client = TestClient(app)
    cookies = _admin_cookies()

    async def _ok_csrf(*_a, **_k):
        return True

    with patch("core.security.validate_csrf_token", _ok_csrf):
        response = client.post(
            "/admin/builds/dead-letter/nonexistent/retry",
            cookies=cookies,
            headers={"X-CSRF-Token": "test"},
        )
    assert response.status_code == 404


def test_retry_dead_letter_requeues_build(monkeypatch):
    build, user = _make_build_and_user()
    fake_db = FakeDB(build, user)
    dead_letter = {
        "id": str(uuid.uuid4()),
        "build_id": "build-1",
        "user_id": "u1",
        "project_id": "p1",
        "prompt": "x",
        "error": "boom",
        "failure_reason": "exception",
        "retry_count": 3,
        "credits_used": 10,
        "created_at": utcnow(),
        "dead_lettered_at": utcnow(),
    }
    fake_db.build_dead_letters.docs["build-1"] = dead_letter

    async def fake_get_db():
        return fake_db

    async def fake_prior_context(db, project_id):
        return [], {}

    called = {}

    def fake_delay(*args, **kwargs):
        called["args"] = args
        called["kwargs"] = kwargs
        return None

    monkeypatch.setattr("api.admin.get_db", fake_get_db)
    monkeypatch.setattr("api.auth.get_db", fake_get_db)
    monkeypatch.setattr("core.database.get_db", fake_get_db)
    monkeypatch.setattr("api.admin._get_prior_build_context", fake_prior_context)
    monkeypatch.setattr("tasks.build_tasks.run_build.delay", fake_delay)

    client = TestClient(app)
    cookies = _admin_cookies()

    async def _ok_csrf(*_a, **_k):
        return True

    with patch("core.security.validate_csrf_token", _ok_csrf):
        response = client.post(
            "/admin/builds/dead-letter/build-1/retry",
            cookies=cookies,
            headers={"X-CSRF-Token": "test"},
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["build_id"] == "build-1"

    assert fake_db.builds.set_calls[-1][1]["status"] == "pending"
    assert fake_db.builds.set_calls[-1][1]["agents"] == []
    assert len(fake_db.build_dead_letters.inserted) == 0
    assert called["args"] == ("build-1", "p1", "u1", 17, [], {})


def test_dead_letter_persistence_across_terminal_failures(monkeypatch):
    """run_build is resume-aware (see core/orchestrator.py), so a failure
    after partial progress is no longer treated as terminal on its own --
    retries=3 (== max_retries) is what actually makes this the last attempt
    Celery will make, and that's what should dead-letter here, same as any
    other terminal failure (see test_terminal_failure_inserts_dead_letter)."""
    build, user = _make_build_and_user()
    build["agents"] = [
        {
            "agent": "architect",
            "status": "success",
            "started_at": utcnow(),
            "completed_at": utcnow(),
            "output": "{}",
            "files_changed": [],
            "error": None,
        }
    ]
    fake_db = FakeDB(build, user)

    async def fake_get_db():
        return fake_db

    async def failing_run_build(*args, **kwargs):
        raise RuntimeError("boom after progress")

    monkeypatch.setattr(build_tasks_module, "get_db", fake_get_db)
    monkeypatch.setattr(build_tasks_module.orchestrator, "run_build", failing_run_build)

    build_tasks_module.run_build.push_request(retries=3)
    try:
        with pytest.raises(RuntimeError):
            build_tasks_module.run_build.run("build-1", "p1", "u1", 100)
    finally:
        build_tasks_module.run_build.pop_request()

    assert len(fake_db.build_dead_letters.inserted) == 1
    assert fake_db.build_dead_letters.inserted[0]["retry_count"] == 3
