"""Regression tests for BE-003: pagination for list endpoints.

These verify two things:

1. The shared :func:`core.database.paginated_query` helper produces a correct,
   consistent envelope and clamps/sanitises its inputs (page >= 1, per_page in
   [1, max_page_size], ``total_pages`` is always >= 1, and an out-of-range page
   is clamped to the last page). This is the logic that every list endpoint now
   routes through, replacing per-endpoint hand-rolled ``count``/``skip``/``limit``
   math that previously returned ``total_pages == 0`` for an empty result set.

2. The wired list endpoints (projects, admin users, webhooks) actually return
   the standard envelope via a real ``TestClient`` against a fake DB, proving the
   refactor is end-to-end and that ``total_pages`` is never ``0``.
"""

from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
from core.database import paginated_query
from core.models import User


# --------------------------------------------------------------------------- #
# In-memory Mongo stand-in
# --------------------------------------------------------------------------- #


def _matches(doc: dict, query: dict) -> bool:
    for key, val in query.items():
        if isinstance(val, dict) and "$in" in val:
            if doc.get(key) not in val["$in"]:
                return False
            continue
        if isinstance(val, dict) and "$exists" in val:
            if (key in doc) != val["$exists"]:
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


class FakeCursor:
    def __init__(self, docs, projection):
        self._docs = [dict(d) for d in docs]
        self._projection = projection
        self._sort_spec = None
        self._skip = 0
        self._limit = None

    def sort(self, spec):
        for field, direction in spec:
            self._docs.sort(
                key=lambda d: (d.get(field) is None, d.get(field)),
                reverse=(direction == -1),
            )
        return self

    def skip(self, n):
        self._skip = n
        return self

    def limit(self, n):
        self._limit = n
        return self

    async def to_list(self, length=None):
        docs = self._docs[self._skip:]
        if self._limit is not None:
            docs = docs[: self._limit]
        return [_apply_projection(d, self._projection) for d in docs]


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                return _apply_projection(d, projection or {"_id": 0})
        return None

    async def count_documents(self, query):
        return sum(1 for d in self.docs if _matches(d, query))

    def find(self, query, projection=None):
        matched = [d for d in self.docs if _matches(d, query)]
        return FakeCursor(matched, projection)


class FakeDB:
    def __init__(self):
        self.projects = FakeCollection()
        self.builds = FakeCollection()
        self.users = FakeCollection()
        self.webhooks = FakeCollection()
        self.audit_logs = FakeCollection()
        self.deployments = FakeCollection()
        self.initiatives = FakeCollection()
        self.marketplace_items = FakeCollection()
        self.invoices = FakeCollection()
        self.referrals = FakeCollection()
        self.notifications = FakeCollection()
        self.support_tickets = FakeCollection()


# --------------------------------------------------------------------------- #
# paginated_query helper unit tests
# --------------------------------------------------------------------------- #


def _seed_projects(coll: FakeCollection, n: int):
    for i in range(n):
        coll.docs.append(
            {"id": f"p{i}", "name": f"p{i}", "updated_at": i, "user_id": "u1"}
        )


@pytest.mark.asyncio
async def test_paginated_query_basic_math():
    coll = FakeCollection()
    _seed_projects(coll, 25)

    result = await paginated_query(
        coll, {}, page=1, per_page=10, sort=[("updated_at", -1)]
    )
    assert result.total == 25
    assert result.page == 1
    assert result.per_page == 10
    assert result.total_pages == 3
    assert len(result.items) == 10
    # Newest first (desc by updated_at).
    assert result.items[0]["updated_at"] == 24


@pytest.mark.asyncio
async def test_paginated_query_empty_total_pages_is_one():
    coll = FakeCollection()
    result = await paginated_query(coll, {}, page=1, per_page=20)
    assert result.total == 0
    assert result.total_pages == 1
    assert result.items == []


@pytest.mark.asyncio
async def test_paginated_query_clamps_page_and_per_page():
    coll = FakeCollection()
    _seed_projects(coll, 5)

    # page 0 -> 1, per_page 0 -> 1
    result = await paginated_query(coll, {}, page=0, per_page=0)
    assert result.page == 1
    assert result.per_page == 1
    assert len(result.items) == 1

    # per_page above max is clamped
    result = await paginated_query(coll, {}, page=1, per_page=500, max_page_size=100)
    assert result.per_page == 100
    assert len(result.items) == 5


@pytest.mark.asyncio
async def test_paginated_query_out_of_range_page_clamped_to_last():
    coll = FakeCollection()
    _seed_projects(coll, 25)

    result = await paginated_query(
        coll, {}, page=99, per_page=10, sort=[("updated_at", -1)]
    )
    # Clamped to the last existing page (3) rather than an empty page.
    assert result.page == 3
    assert result.total_pages == 3
    assert len(result.items) == 5
    assert result.items[0]["updated_at"] == 4


@pytest.mark.asyncio
async def test_paginated_query_applies_projection():
    coll = FakeCollection()
    coll.docs.append({"id": "x", "secret": "s3cr3t", "url": "https://x", "user_id": "u1"})

    result = await paginated_query(
        coll, {"user_id": "u1"}, page=1, per_page=10,
        projection={"_id": 0, "secret": 0},
    )
    assert "secret" not in result.items[0]
    assert result.items[0]["id"] == "x"


# --------------------------------------------------------------------------- #
# Endpoint integration tests
# --------------------------------------------------------------------------- #


def _client_for(monkeypatch, router_module, db, user=None, admin_override=None):
    async def _get_db():
        return db

    monkeypatch.setattr(router_module, "get_db", _get_db)

    app = FastAPI()
    app.include_router(router_module.router)
    if admin_override is not None:
        app.dependency_overrides[router_module.admin_required] = lambda: admin_override
    if user is not None:
        app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def test_projects_list_uses_pagination(monkeypatch):
    import api.projects as projects_module

    db = FakeDB()
    for i in range(25):
        db.projects.docs.append(
            {
                "id": f"p{i}",
                "user_id": "u1",
                "name": f"p{i}",
                "updated_at": i,
                "template": None,
                "description": "",
                "github_repo": None,
            }
        )

    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, projects_module, db, user=user)

    r = client.get("/projects/?page=2&per_page=10")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 25
    assert body["page"] == 2
    assert body["per_page"] == 10
    assert body["total_pages"] == 3
    assert len(body["projects"]) == 10

    # Out-of-range page is clamped to the last page, never an empty set.
    r = client.get("/projects/?page=99&per_page=10")
    assert r.json()["page"] == 3


def test_admin_users_list_uses_pagination_and_typed_mapping(monkeypatch):
    import api.admin as admin_module

    db = FakeDB()
    for i in range(45):
        db.users.docs.append(
            {
                "id": f"u{i}",
                "email": f"u{i}@x.com",
                "name": f"U{i}",
                "plan": "free",
                "credits": 10,
                "created_at": datetime(2024, 1, 1) + timedelta(seconds=i),
            }
        )

    admin_user = User(
        id="admin1", email="admin@x.com", name="Admin",
        hashed_password="x", plan="pro",
    )
    client = _client_for(monkeypatch, admin_module, db, admin_override=admin_user)

    r = client.get("/admin/users?page=1&per_page=20")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 45
    assert body["total_pages"] == 3
    assert len(body["users"]) == 20
    # Sensitive field is excluded by the projection.
    assert "hashed_password" not in body["users"][0]

    # Empty result set still reports total_pages == 1 (the old bug returned 0).
    db.users.docs = []
    r = client.get("/admin/users")
    assert r.status_code == 200
    assert r.json()["total_pages"] == 1


def test_webhooks_list_uses_pagination(monkeypatch):
    import api.webhooks as webhooks_module

    db = FakeDB()
    for i in range(35):
        db.webhooks.docs.append(
            {
                "id": f"wh{i}",
                "user_id": "u1",
                "url": f"https://x.com/{i}",
                "secret": "should-be-hidden",
                "events": ["build.completed"],
                "active": True,
                "created_at": datetime(2024, 1, 1) + timedelta(seconds=i),
                "last_triggered": None,
            }
        )

    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, webhooks_module, db, user=user)

    r = client.get("/webhooks/?page=1&per_page=10")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 35
    assert body["total_pages"] == 4
    assert len(body["webhooks"]) == 10
    # `secret` projection is honoured by the shared helper.
    assert "secret" not in body["webhooks"][0]


def test_deployments_list_uses_pagination_and_real_total(monkeypatch):
    import api.deployments as deployments_module

    db = FakeDB()
    for i in range(25):
        db.deployments.docs.append(
            {
                "id": f"dep{i}",
                "user_id": "u1",
                "project_id": f"p{i}",
                "build_id": f"b{i}",
                "status": "live",
                "provider": "docker",
                "url": f"https://app{i}.example.com",
                "logs": "",
                "env_vars": {},
                "created_at": datetime(2024, 1, 1) + timedelta(seconds=i),
                "updated_at": datetime(2024, 1, 1) + timedelta(seconds=i),
            }
        )

    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, deployments_module, db, user=user)

    r = client.get("/deployments/?page=2&per_page=10")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 25
    assert body["page"] == 2
    assert body["per_page"] == 10
    assert body["total_pages"] == 3
    assert len(body["deployments"]) == 10
    assert "env_vars" not in body["deployments"][0]

    db.deployments.docs = []
    r = client.get("/deployments/")
    assert r.status_code == 200
    assert r.json()["total_pages"] == 1


def test_initiatives_list_total_pages_never_zero(monkeypatch):
    import api.initiatives as initiatives_module

    db = FakeDB()
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, initiatives_module, db, user=user)

    r = client.get("/initiatives/")
    assert r.status_code == 200
    assert r.json()["total_pages"] == 1


def test_marketplace_list_total_pages_never_zero(monkeypatch):
    import api.marketplace as marketplace_module

    db = FakeDB()
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, marketplace_module, db, user=user)

    r = client.get("/marketplace/?page=1&per_page=20")
    assert r.status_code == 200
    assert r.json()["total_pages"] == 1


def test_billing_invoices_list_total_pages_never_zero(monkeypatch):
    import api.billing as billing_module

    db = FakeDB()
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, billing_module, db, user=user)

    r = client.get("/billing/invoices?page=1&per_page=20")
    assert r.status_code == 200
    assert r.json()["total_pages"] == 1


def test_growth_referrals_list_total_pages_never_zero(monkeypatch):
    import api.growth as growth_module

    db = FakeDB()
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, growth_module, db, user=user)

    r = client.get("/growth/referrals?page=1&per_page=20")
    assert r.status_code == 200
    assert r.json()["total_pages"] == 1


def test_growth_notifications_list_total_pages_never_zero(monkeypatch):
    import api.growth as growth_module

    db = FakeDB()
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, growth_module, db, user=user)

    r = client.get("/growth/notifications?page=1&per_page=20")
    assert r.status_code == 200
    assert r.json()["total_pages"] == 1


def test_support_tickets_list_total_pages_never_zero(monkeypatch):
    import api.support as support_module

    db = FakeDB()
    user = User(id="u1", email="a@b.com", name="U", hashed_password="x", plan="free")
    client = _client_for(monkeypatch, support_module, db, user=user)

    r = client.get("/support/tickets?page=1&per_page=20")
    assert r.status_code == 200
    assert r.json()["total_pages"] == 1
