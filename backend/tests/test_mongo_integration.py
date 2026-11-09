"""Integration tests against a REAL MongoDB server (no mocks, no fakes).

The rest of the suite replaces the database with fakes or lets calls fail
open, so a driver upgrade (pymongo/motor) can pass it while being broken
against an actual server. These tests drive the app's own database code --
core.database.get_db() with its index provisioning, paginated_query, the
atomic credit reservation, aggregation pipelines, the budget manager and the
Celery build task -- through Motor against a live mongod.

Opt-in: set FORGE_MONGO_INTEGRATION_URL to a disposable server, e.g.

    FORGE_MONGO_INTEGRATION_URL=mongodb://127.0.0.1:27017 pytest tests/test_mongo_integration.py

The tests write to (and drop) the "forge" database on that server -- the
name core.database.get_db() hard-codes -- so never point this at a server
holding real data. Without the variable every test is skipped.
"""

import asyncio
import os
from datetime import timedelta

import pytest

INTEGRATION_URL = os.environ.get("FORGE_MONGO_INTEGRATION_URL")

pytestmark = pytest.mark.skipif(
    not INTEGRATION_URL,
    reason="set FORGE_MONGO_INTEGRATION_URL to run real-MongoDB integration tests",
)

DB_NAME = "forge"  # core.database.get_db() always returns client.forge


@pytest.fixture
def real_db(monkeypatch):
    """Point core.database at the live server with a fresh "forge" DB and a
    client bound to the current event loop; drop the DB afterwards."""
    import pymongo

    import core.database as database

    monkeypatch.setattr(database.settings, "mongodb_url", INTEGRATION_URL)
    sync = pymongo.MongoClient(INTEGRATION_URL, serverSelectionTimeoutMS=3000)
    sync.drop_database(DB_NAME)
    database.reset_db_clients()
    yield database
    database.reset_db_clients()
    sync.drop_database(DB_NAME)
    sync.close()


async def test_driver_versions_and_server_handshake(real_db):
    import motor
    import pymongo

    db = await real_db.get_db()
    info = await db.client.server_info()
    # Record what was actually exercised.
    print(f"pymongo={pymongo.version} motor={motor.version} server={info['version']}")
    assert (await db.command("ping"))["ok"] == 1


async def test_get_db_provisions_unique_and_ttl_indexes(real_db):
    db = await real_db.get_db()

    users = await db.users.index_information()
    assert any(spec["key"] == [("email", 1)] and spec.get("unique") for spec in users.values())

    prompts = await db.prompt_templates.index_information()
    assert any(
        spec["key"] == [("role", 1), ("version", 1)] and spec.get("unique") for spec in prompts.values()
    )

    # Every retention-policy collection gets its TTL index.
    for collection, ttl in real_db.RETENTION_TTL_SECONDS.items():
        idx = (await db[collection].index_information()).get(f"retention_ttl_{collection}")
        assert idx is not None, collection
        assert idx["expireAfterSeconds"] == ttl

    # Provisioning is idempotent: a fresh client re-runs it without error.
    real_db.reset_db_clients()
    await real_db.get_db()


async def test_unique_email_index_rejects_duplicates(real_db):
    from pymongo.errors import DuplicateKeyError

    db = await real_db.get_db()
    await db.users.insert_one({"id": "u1", "email": "a@example.com"})
    with pytest.raises(DuplicateKeyError):
        await db.users.insert_one({"id": "u2", "email": "a@example.com"})


async def test_paginated_query_sort_skip_limit_projection(real_db):
    from core.models import utcnow

    db = await real_db.get_db()
    now = utcnow()
    await db.webhooks.insert_many([
        {"id": f"wh{i}", "user_id": "u1", "secret": f"s{i}", "created_at": now + timedelta(seconds=i)}
        for i in range(25)
    ] + [{"id": "other", "user_id": "u2", "secret": "x", "created_at": now}])

    page = await real_db.paginated_query(
        db.webhooks, {"user_id": "u1"}, page=2, per_page=10,
        sort=[("created_at", -1)], projection={"_id": 0, "secret": 0},
    )
    assert page.total == 25 and page.total_pages == 3 and page.page == 2
    assert [d["id"] for d in page.items] == [f"wh{i}" for i in range(14, 4, -1)]
    assert all("secret" not in d and "_id" not in d for d in page.items)

    past_end = await real_db.paginated_query(db.webhooks, {"user_id": "u1"}, page=99, per_page=10)
    assert past_end.page == 3 and len(past_end.items) == 5


async def test_atomic_credit_reservation_never_overdraws_under_concurrency(real_db):
    """api/builds.py reserves credits with a conditional find_one_and_update;
    under concurrent requests the server must let exactly as many succeed as
    the balance covers."""
    db = await real_db.get_db()
    await db.users.insert_one({"id": "u1", "email": "r@example.com", "credits": 100})

    async def reserve():
        return await db.users.find_one_and_update(
            {"id": "u1", "credits": {"$gte": 17}},
            {"$inc": {"credits": -17}},
            return_document=True,
        )

    results = await asyncio.gather(*[reserve() for _ in range(20)])
    granted = [r for r in results if r is not None]
    assert len(granted) == 5  # floor(100 / 17)
    assert (await db.users.find_one({"id": "u1"}))["credits"] == 100 - 5 * 17
    # return_document=True hands back the post-update document.
    assert sorted(r["credits"] for r in granted) == [15, 32, 49, 66, 83]


async def test_billing_style_aggregation_with_unwind(real_db):
    db = await real_db.get_db()
    await db.builds.insert_many([
        {"id": "b1", "user_id": "u1", "status": "success", "credits_used": 15,
         "agents": [{"agent": "architect"}, {"agent": "developer"}]},
        {"id": "b2", "user_id": "u1", "status": "failed", "credits_used": 7,
         "agents": [{"agent": "architect"}]},
        {"id": "b3", "user_id": "u2", "status": "success", "credits_used": 99, "agents": []},
    ])
    total = [d async for d in db.builds.aggregate([
        {"$match": {"user_id": "u1"}},
        {"$group": {"_id": None, "total": {"$sum": "$credits_used"}}},
    ])]
    assert total[0]["total"] == 22
    runs = {d["_id"]: d["count"] async for d in db.builds.aggregate([
        {"$match": {"user_id": "u1"}},
        {"$unwind": "$agents"},
        {"$group": {"_id": "$agents.agent", "count": {"$sum": 1}}},
    ])}
    assert runs == {"architect": 2, "developer": 1}


async def test_budget_manager_limits_and_spend(real_db):
    from core.llm.budget_manager import BudgetManager, BudgetPeriod, BudgetScope
    from core.models import utcnow

    db = await real_db.get_db()
    bm = BudgetManager()
    await bm.set_limit(BudgetScope.PROJECT, "p1", soft_limit_usd=1.0, hard_limit_usd=2.0)
    await bm.set_limit(BudgetScope.PROJECT, "p1", soft_limit_usd=1.5, hard_limit_usd=2.0)  # upsert
    assert await db.budget_limits.count_documents({}) == 1

    fresh = BudgetManager()
    await fresh.refresh_limits()
    assert (await fresh.get_limit(BudgetScope.PROJECT, "p1"))["soft_limit_usd"] == 1.5

    await db.ai_usage.insert_many([
        {"project_id": "p1", "cost": 0.25, "created_at": utcnow()},
        {"project_id": "p1", "cost": 0.5, "created_at": utcnow()},
        {"project_id": "p2", "cost": 9.0, "created_at": utcnow()},
    ])
    assert await bm.get_spend(BudgetScope.PROJECT, "p1", BudgetPeriod.MONTHLY) == 0.75
    assert await bm.delete_limit(BudgetScope.PROJECT, "p1") is True


def test_celery_build_task_persists_and_refunds_against_real_db(real_db, monkeypatch):
    """Runs tasks/build_tasks.run_build end to end (stub agents, real DB):
    the build document, its agent steps, build_files rows and the credit
    refund all go through Motor to the live server."""
    import pymongo

    import tasks.build_tasks as build_tasks
    from core.models import Build, BuildStatus

    class _Stub:
        async def blueprint(self, *a, **kw): return {"integrations": [], "features": ["f"]}
        async def clarify(self, *a, **kw): return []
        async def improve(self, *a, **kw): return {"summary": "ok"}
        async def design(self, *a, **kw): return {"theme": "default"}
        async def generate_files(self, *a, **kw): return {"files": {"src/App.tsx": "// v1", "README.md": "# app"}}
        async def integrate(self, *a, **kw): return {"files": {}, "instructions": ""}
        async def validate(self, *a, **kw): return {"passed": True}
        async def patch_files(self, *a, **kw): return {"files": {}}

    for attr in ("architect", "business_model", "designer", "developer", "integration", "pm"):
        monkeypatch.setattr(build_tasks.orchestrator, attr, _Stub())

    async def _no_byok(self, user_id):
        return False

    monkeypatch.setattr(type(build_tasks.orchestrator), "_is_byok_active", _no_byok)

    sync = pymongo.MongoClient(INTEGRATION_URL)[DB_NAME]
    reserved = 40
    sync.users.insert_one({"id": "u1", "email": "b@example.com", "credits": 100 - reserved})
    sync.projects.insert_one({"id": "p1", "deleted_at": None})
    sync.builds.insert_one(Build(id="b1", project_id="p1", user_id="u1", prompt="todo app").model_dump())

    # run_build drives its own long-lived worker event loop; make sure the
    # Motor client is created on that loop, not on a test loop.
    real_db.reset_db_clients()
    result = build_tasks.run_build.run("b1", "p1", "u1", reserved)

    assert result["status"] == "success"
    doc = sync.builds.find_one({"id": "b1"})
    assert doc["status"] == BuildStatus.SUCCESS.value
    assert [a["agent"] for a in doc["agents"]][:4] == ["architect", "business_improver", "designer", "developer"]
    assert all(a["status"] == "success" for a in doc["agents"])
    assert {f["path"] for f in sync.build_files.find({"build_id": "b1"})} == {"src/App.tsx", "README.md"}
    used = doc["credits_used"]
    assert 0 < used <= reserved
    # Unused reservation refunded exactly once.
    assert sync.users.find_one({"id": "u1"})["credits"] == 100 - used
    real_db.reset_db_clients()
