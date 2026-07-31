"""Regression tests for BUS-007: build idempotency keys.

A client that retries ``POST /builds/`` (network retry, double-submit) with the
same ``idempotency_key`` must receive the *existing* build rather than a second
one. The guard is also scoped per-user: the same key belonging to a different
user must NOT resolve to someone else's build (the DB index is partial on
``[user_id, idempotency_key]``).

The idempotency short-circuit returns *before* credit reservation and before the
Celery ``run_build.delay`` enqueue, so a duplicated request must not consume
credits or spin up a worker task.
"""


from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
import api.builds as builds_module
from core.models import User, utcnow


# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in (subset of operations the build flow touches)
# --------------------------------------------------------------------------- #


def _matches(doc: dict, query: dict) -> bool:
    for key, val in query.items():
        if isinstance(val, dict):
            matched = True
            for op, opval in val.items():
                doc_val = doc.get(key)
                if op == "$in":
                    if doc_val not in opval:
                        matched = False
                        break
                elif op == "$gte":
                    if not (doc_val >= opval):
                        matched = False
                        break
                elif op == "$gt":
                    if not (doc_val > opval):
                        matched = False
                        break
                elif op == "$lte":
                    if not (doc_val <= opval):
                        matched = False
                        break
                elif op == "$lt":
                    if not (doc_val < opval):
                        matched = False
                        break
                elif op == "$ne":
                    if doc_val == opval:
                        matched = False
                        break
                else:
                    if doc_val != val:
                        matched = False
                        break
            if not matched:
                return False
            continue
        if doc.get(key) != val:
            return False
    return True


def _apply_projection(doc: dict, projection) -> dict:
    out = dict(doc)
    if not projection:
        out.pop("_id", None)
        return out
    for key, keep in projection.items():
        if keep == 0:
            out.pop(key, None)
    return out


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def find_one(self, query, projection=None, sort=None):
        for d in self.docs:
            if _matches(d, query):
                return _apply_projection(d, projection or {"_id": 0})
        return None

    async def count_documents(self, query):
        return sum(1 for d in self.docs if _matches(d, query))

    def find(self, query, projection=None):
        matched = [d for d in self.docs if _matches(d, query)]
        return FakeCursor(matched, projection)

    async def find_one_and_update(self, query, update, return_document=False):
        for d in self.docs:
            if _matches(d, query):
                for field, val in update.get("$inc", {}).items():
                    d[field] = d.get(field, 0) + val
                for field, val in update.get("$set", {}).items():
                    d[field] = val
                return dict(d)
        return None

    async def update_one(self, query, update):
        class _Result:
            modified_count = 0

        result = _Result()
        for d in self.docs:
            if _matches(d, query):
                for field, val in update.get("$inc", {}).items():
                    d[field] = d.get(field, 0) + val
                for field, val in update.get("$set", {}).items():
                    d[field] = val
                for field, val in update.get("$addToSet", {}).items():
                    existing = d.get(field, [])
                    items = val.get("$each", [val]) if isinstance(val, dict) else [val]
                    for item in items:
                        if item not in existing:
                            existing.append(item)
                    d[field] = existing
                result.modified_count = 1
                break
        return result


class FakeCursor:
    def __init__(self, docs, projection):
        self._docs = [dict(d) for d in docs]
        self._projection = projection

    async def to_list(self, length=None):
        return [_apply_projection(d, self._projection) for d in self._docs]


class FakeDB:
    def __init__(self):
        self.projects = FakeCollection()
        self.users = FakeCollection()
        self.builds = FakeCollection()
        self.build_files = FakeCollection()


class FakeRunBuild:
    def __init__(self):
        self.calls = []

    def delay(self, *args, **kwargs):
        self.calls.append((args, kwargs))


# --------------------------------------------------------------------------- #
# Tests
# --------------------------------------------------------------------------- #


def _client(monkeypatch, db, user, run_build):
    async def _get_db():
        return db

    monkeypatch.setattr(builds_module, "get_db", _get_db)
    monkeypatch.setattr(builds_module, "run_build", run_build)

    app = FastAPI()
    app.include_router(builds_module.router)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def test_duplicate_idempotency_key_returns_existing_build(monkeypatch):
    db = FakeDB()
    db.projects.docs.append({"id": "proj1", "user_id": "u1", "tech_stack": {}})
    db.users.docs.append({"id": "u1", "email_verified": True, "credits": 1000})
    # An existing build for u1 with the retried key.
    db.builds.docs.append(
        {
            "id": "b1",
            "user_id": "u1",
            "project_id": "proj1",
            "idempotency_key": "key-123",
            "status": "pending",
        }
    )

    run_build = FakeRunBuild()
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client(monkeypatch, db, user, run_build)

    r = client.post(
        "/builds/",
        json={"project_id": "proj1", "prompt": "build me an app", "idempotency_key": "key-123"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["idempotent"] is True
    assert body["build_id"] == "b1"
    # No second build document was created.
    assert len(db.builds.docs) == 1
    # The build pipeline was NOT enqueued for the duplicate request.
    assert run_build.calls == []


def test_idempotency_key_is_scoped_per_user(monkeypatch):
    db = FakeDB()
    db.projects.docs.append({"id": "proj1", "user_id": "u1", "tech_stack": {}})
    db.projects.docs.append({"id": "proj2", "user_id": "u2", "tech_stack": {}})
    db.users.docs.append({"id": "u1", "email_verified": True, "credits": 1000})
    db.users.docs.append({"id": "u2", "email_verified": True, "credits": 1000})
    # u1 already has a build under "shared-key".
    db.builds.docs.append(
        {
            "id": "b1",
            "user_id": "u1",
            "project_id": "proj1",
            "idempotency_key": "shared-key",
            "status": "pending",
        }
    )

    run_build = FakeRunBuild()
    # A different user submits the same key -> must NOT resolve to u1's build.
    user2 = User(id="u2", email="b@b.com", name="U2", hashed_password="x", plan="free")
    client = _client(monkeypatch, db, user2, run_build)

    r = client.post(
        "/builds/",
        json={"project_id": "proj2", "prompt": "my own app", "idempotency_key": "shared-key"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "idempotent" not in body
    assert body["build_id"] != "b1"
    # A brand-new build was created for u2 (not a duplicate of u1's).
    u2_builds = [b for b in db.builds.docs if b["user_id"] == "u2"]
    assert len(u2_builds) == 1
    assert u2_builds[0]["idempotency_key"] == "shared-key"
    # The new build was actually enqueued.
    assert len(run_build.calls) == 1


def test_recent_build_blocks_duplicate_within_30_seconds(monkeypatch):
    """BE-013 residual: the dedup query must compare datetime to datetime, not
    datetime to isoformat() string, so a recent pending/building build actually
    blocks a duplicate request."""
    import datetime

    db = FakeDB()
    db.projects.docs.append({"id": "proj1", "user_id": "u1", "tech_stack": {}})
    db.users.docs.append({"id": "u1", "email_verified": True, "credits": 1000})
    # An existing build created 10 seconds ago (within the 30s dedup window).
    recent_time = utcnow() - datetime.timedelta(seconds=10)
    db.builds.docs.append(
        {
            "id": "b-recent",
            "user_id": "u1",
            "project_id": "proj1",
            "idempotency_key": "key-recent",
            "status": "building",
            "created_at": recent_time,
        }
    )

    run_build = FakeRunBuild()
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client(monkeypatch, db, user, run_build)

    # Use a DIFFERENT idempotency_key so the idempotency short-circuit does
    # not fire before the dedup check.
    r = client.post(
        "/builds/",
        json={"project_id": "proj1", "prompt": "build me an app", "idempotency_key": "key-new"},
    )
    assert r.status_code == 429
    assert "already in progress" in r.json()["detail"]
    # No second build was created.
    assert len(db.builds.docs) == 1
    assert run_build.calls == []


def test_stale_build_does_not_block_new_build_after_30_seconds(monkeypatch):
    """A build older than 30 seconds must not trigger the dedup 429."""
    import datetime

    db = FakeDB()
    db.projects.docs.append({"id": "proj1", "user_id": "u1", "tech_stack": {}})
    db.users.docs.append({"id": "u1", "email_verified": True, "credits": 1000})
    # An existing build created 40 seconds ago (outside the 30s dedup window).
    stale_time = utcnow() - datetime.timedelta(seconds=40)
    db.builds.docs.append(
        {
            "id": "b-stale",
            "user_id": "u1",
            "project_id": "proj1",
            "idempotency_key": "key-stale",
            "status": "building",
            "created_at": stale_time,
        }
    )

    run_build = FakeRunBuild()
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client(monkeypatch, db, user, run_build)

    # Use a DIFFERENT idempotency_key so the idempotency short-circuit does
    # not fire before the dedup check.
    r = client.post(
        "/builds/",
        json={"project_id": "proj1", "prompt": "build me an app", "idempotency_key": "key-newer"},
    )
    assert r.status_code == 200
    # A new build was created.
    assert len(db.builds.docs) == 2
    assert len(run_build.calls) == 1
