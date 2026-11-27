"""Regression tests for DB-002: a versioned, idempotent database migration
runner. Verifies migrations run once, are recorded, are skipped on re-run,
safely backfill missing fields, and that a failing migration is recorded as
failed without crashing the runner.
"""
import os

os.environ.setdefault("CI_TEST_MODE", "true")
os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")
os.environ.setdefault("FIELD_ENCRYPTION_KEY", "0101010101010101010101010101010101010101010101010101010101010101")

import pytest

from core import migrations as migrations_module
from core.migrations import run_migrations, _MIGRATIONS


def _matches(doc, query):
    for k, cond in query.items():
        if k == "$or":
            if not any(_matches(doc, sub) for sub in cond):
                return False
            continue
        val = doc.get(k)
        if isinstance(cond, dict):
            if "$in" in cond:
                if val not in cond["$in"]:
                    return False
                continue
            if "$exists" in cond:
                if cond["$exists"] != (k in doc):
                    return False
                continue
            return False
        elif val != cond:
            return False
    return True


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if _matches(d, query):
                return dict(d)
        return None

    async def update_many(self, filter, update):
        class _Result:
            matched_count = 0
            modified_count = 0

        result = _Result()
        for d in self.docs:
            if _matches(d, filter):
                d.update(update.get("$set", {}))
                result.matched_count += 1
                result.modified_count += 1
        return result

    async def update_one(self, filter, update, upsert=False):
        class _Result:
            modified_count = 0
            upserted_id = None

        result = _Result()
        for d in self.docs:
            if _matches(d, filter):
                d.update(update.get("$set", {}))
                result.modified_count = 1
                return result
        if upsert:
            new_doc = dict(filter)
            new_doc.update(update.get("$set", {}))
            self.docs.append(new_doc)
        return result


class FakeDB:
    def __init__(self):
        self.users = FakeCollection()
        self._collections = {"__forge_migrations": FakeCollection()}

    def __getitem__(self, name):
        return self._collections.setdefault(name, FakeCollection())


def _reset_registry():
    _MIGRATIONS.clear()


@pytest.mark.asyncio
async def test_migrations_apply_once_and_are_idempotent():
    db = FakeDB()
    await run_migrations(db)
    # Every registered migration recorded as applied, exactly once. (This used
    # to hard-code 2 and only passed because the later migrations crashed on
    # this fake's missing matched_count.)
    applied = [d for d in db["__forge_migrations"].docs if d.get("status") == "applied"]
    assert len(applied) == len(_MIGRATIONS)

    # Re-running is a no-op (already recorded).
    await run_migrations(db)
    applied2 = [d for d in db["__forge_migrations"].docs if d.get("status") == "applied"]
    assert len(applied2) == len(_MIGRATIONS)


@pytest.mark.asyncio
async def test_backfill_sets_missing_plan_and_banned():
    db = FakeDB()
    db.users.docs = [
        {"id": "u1"},  # missing plan + banned
        {"id": "u2", "plan": "pro"},  # has plan
        {"id": "u3", "plan": ""},  # empty plan
    ]
    await run_migrations(db)
    by_id = {d["id"]: d for d in db.users.docs}
    assert by_id["u1"]["plan"] == "free"
    assert by_id["u1"]["banned"] is False
    assert by_id["u2"]["plan"] == "pro"  # untouched
    assert by_id["u3"]["plan"] == "free"  # empty -> backfilled


@pytest.mark.asyncio
async def test_failing_migration_is_recorded_and_runner_survives():
    db = FakeDB()

    # Register a migration that always raises, ahead of the real ones.
    async def _boom(db):
        raise RuntimeError("migration exploded")

    migrations_module._MIGRATIONS.insert(0, (99, "boom", "explodes", _boom))
    try:
        results = await run_migrations(db)
    finally:
        # Restore the real registry for other tests.
        migrations_module._MIGRATIONS[:] = [
            m for m in migrations_module._MIGRATIONS if m[0] != 99
        ]

    assert any(r["name"] == "boom" and r["status"] == "failed" for r in results)
    # The runner did not raise and the later migrations still ran.
    assert any(r["status"] == "applied" for r in results)


@pytest.mark.asyncio
async def test_run_migrations_never_raises_on_broken_db():
    class BrokenDB:
        @property
        def __forge_migrations(self):
            raise RuntimeError("no collection")

    # Must return (empty) rather than propagate.
    assert await run_migrations(BrokenDB()) == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
