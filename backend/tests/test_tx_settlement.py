"""T2 settlement and T3 release (plan §10.2, §3.3; TX-2, TX-4, RT-7, CT-2,
CT-3).

Exactly once: the ``credit_transactions(build_id, kind)`` unique index and
the ``builds`` filter ``settlement: null`` admit one settlement per build,
whoever runs it and however often. TX-3 (settlement racing a late W7) is in
test_build_ledger.py next to W7.
"""

from __future__ import annotations

import asyncio

import pytest

from core import credit_ledger
from core.credit_ledger import CreditKind, FundingSource
from core.pricing import quote_from_settings
from tests.a1_support import RS0_URL, LedgerFakeDB, rs0

QUOTE = quote_from_settings()
R = QUOTE.max_cost


def _op(stage_key, credits, status="completed"):
    return {"operation_id": f"b1:{stage_key}:1", "stage_key": stage_key, "status": status, "credits": credits}


async def _admitted(db, build_id="b1", source=FundingSource.USER_CREDITS, ledger=None, user_id="u1"):
    await credit_ledger.admit_build(
        db, build_doc={"id": build_id, "user_id": user_id, "project_id": "p", "prompt": "x", "status": "pending"},
        source=source, quote=QUOTE,
    )
    if ledger is not None:
        await db.builds.update_one({"id": build_id}, {"$set": {"ledger": ledger}})


def _fresh(credits=100, free_build_used=True):
    db = LedgerFakeDB(users=[{"id": "u1", "email": "u@x", "credits": credits, "free_build_used": free_build_used}])
    asyncio.run(db.credit_transactions.create_index([("build_id", 1), ("kind", 1)], unique=True))
    return db


def test_settle_refunds_reserved_minus_consumed_exactly_once():
    db = _fresh()
    ledger = [_op("architect", 3), _op("developer", 5), _op("pm#0", 1), _op("debug#1", 0, "failed")]

    async def run():
        await _admitted(db, ledger=ledger)
        first = await credit_ledger.settle_build(db, "b1")
        second = await credit_ledger.settle_build(db, "b1")
        return first, second

    first, second = asyncio.run(run())
    assert first.applied and (first.consumed, first.refunded) == (9, R - 9)
    assert not second.applied
    assert db.users.docs[0]["credits"] == 100 - R + (R - 9)
    build = db.builds.docs[0]
    assert build["funding"]["state"] == "settled"
    assert build["settlement"]["consumed"] == 9 and build["settlement"]["refunded"] == R - 9
    settles = [r for r in db.credit_transactions.docs if r["kind"] == "settle"]
    assert len(settles) == 1 and settles[0]["amount"] == R - 9


def test_concurrent_settlers_one_refund():
    """CT-2 / TX-2 (logic): worker + sweeper + duplicate x 10."""
    db = _fresh()

    async def run():
        await _admitted(db, ledger=[_op("architect", 3)])
        return await asyncio.gather(*(credit_ledger.settle_build(db, "b1") for _ in range(10)))

    results = asyncio.run(run())
    assert sum(r.applied for r in results) == 1
    assert db.users.docs[0]["credits"] == 100 - 3
    assert len([r for r in db.credit_transactions.docs if r["kind"] == "settle"]) == 1


def test_ten_builds_settle_simultaneously():
    """CT-3 (logic): final balance = initial - Σ consumed."""
    db = _fresh(credits=10 * R)

    async def run():
        for i in range(10):
            await _admitted(db, build_id=f"b{i}", ledger=[_op("architect", 3), _op("developer", 5)])
        await asyncio.gather(*(credit_ledger.settle_build(db, f"b{i}") for i in range(10)))

    asyncio.run(run())
    assert db.users.docs[0]["credits"] == 10 * R - 10 * 8


def test_settle_and_release_are_mutually_exclusive():
    db = _fresh()

    async def run():
        await _admitted(db)
        a = await credit_ledger.release_build(db, "b1", reason="orphaned")
        b = await credit_ledger.settle_build(db, "b1")
        return a, b

    a, b = asyncio.run(run())
    assert a.applied and not b.applied
    assert db.users.docs[0]["credits"] == 100
    assert db.builds.docs[0]["funding"]["state"] == "released"


@pytest.mark.parametrize("applied", [True, False])
def test_unknown_commit_result_never_double_refunds(applied):
    """TX-4 (logic): the connection drops at commit. Whether or not the
    first commit applied, the refund happens exactly once."""
    db = _fresh()

    async def run():
        await _admitted(db, ledger=[_op("architect", 3)])
        db.unknown_commit.append(applied)
        return await credit_ledger.settle_build(db, "b1")

    result = asyncio.run(run())
    assert db.users.docs[0]["credits"] == 100 - 3
    assert len([r for r in db.credit_transactions.docs if r["kind"] == "settle"]) == 1
    assert db.builds.docs[0]["settlement"]["refunded"] == R - 3
    # If the first commit applied, the re-run finds it already applied.
    assert result.applied is (not applied)
    assert ("commit_unknown" if applied else "commit_unknown_not_applied") in db.log


@pytest.mark.parametrize("fault_at", [1, 2, 3])
def test_fault_at_every_settlement_write_exactly_once(fault_at):
    """RT-7 (logic): a fault at every write of T2, then a re-run."""
    db = _fresh()

    async def run():
        await _admitted(db, ledger=[_op("architect", 3)])
        db.fault_at_write(fault_at)
        with pytest.raises(RuntimeError):
            await credit_ledger.settle_build(db, "b1")
        assert db.users.docs[0]["credits"] == 100 - R
        assert db.builds.docs[0]["settlement"] is None
        return await credit_ledger.settle_build(db, "b1")

    assert asyncio.run(run()).applied
    assert db.users.docs[0]["credits"] == 100 - 3


def test_release_rolls_back_the_free_grant():
    db = _fresh(credits=5, free_build_used=False)

    async def run():
        await _admitted(db, source=FundingSource.FREE_GRANT)
        assert db.users.docs[0]["free_build_id"] == "b1"
        return await credit_ledger.release_build(db, "b1", reason="never_dispatched")

    assert asyncio.run(run()).applied
    user = db.users.docs[0]
    assert user["free_build_used"] is False and "free_build_id" not in user
    assert user["credits"] == 5


def test_free_grant_settles_with_no_refund_and_consumed_recorded():
    db = _fresh(credits=5, free_build_used=False)

    async def run():
        await _admitted(db, source=FundingSource.FREE_GRANT, ledger=[_op("architect", 3), _op("developer", 5)])
        return await credit_ledger.settle_build(db, "b1")

    result = asyncio.run(run())
    assert (result.consumed, result.refunded) == (8, 0)
    assert db.users.docs[0]["credits"] == 5


def test_anomaly_refunds_nothing_and_is_recorded():
    db = _fresh()

    async def run():
        await _admitted(db, ledger=[_op("architect", R + 1)])
        return await credit_ledger.settle_build(db, "b1")

    result = asyncio.run(run())
    assert result.anomaly and result.refunded == 0
    assert db.builds.docs[0]["settlement"]["anomaly"]
    assert db.users.docs[0]["credits"] == 100 - R


def test_byok_settles_at_zero():
    db = _fresh()

    async def run():
        await _admitted(db, source=FundingSource.BYOK, ledger=[_op("architect", 0)])
        return await credit_ledger.settle_build(db, "b1")

    result = asyncio.run(run())
    assert result.applied and (result.consumed, result.refunded) == (0, 0)
    assert db.users.docs[0]["credits"] == 100


def test_fenced_settlement_applies_only_under_the_fence():
    db = _fresh()

    async def run():
        await _admitted(db, ledger=[_op("architect", 3)])
        await db.builds.update_one({"id": "b1"}, {"$set": {"attempt_token": "swept:1"}})
        stale = await credit_ledger.settle_build(db, "b1", fence_token="T-old")
        fenced = await credit_ledger.settle_build(db, "b1", fence_token="swept:1")
        return stale, fenced

    stale, fenced = asyncio.run(run())
    assert not stale.applied and fenced.applied


def test_provider_cost_summary_by_account():
    db = _fresh()
    db.ai_usage.docs.extend([
        {"build_id": "b1", "account": "generation", "total_tokens": 100, "cost": 0.01},
        {"build_id": "b1", "account": "generation", "total_tokens": 50, "cost": 0.02},
        {"build_id": "b1", "account": "guardrail", "total_tokens": 7, "cost": 0.001},
        {"build_id": "b2", "account": "generation", "total_tokens": 999, "cost": 9.0},
    ])

    async def run():
        await _admitted(db, ledger=[])
        await credit_ledger.settle_build(db, "b1")

    asyncio.run(run())
    summary = db.builds.docs[0]["settlement"]["provider_cost_summary"]
    assert summary["generation"] == {"attempts": 2, "tokens": 150, "cost_usd": 0.03}
    assert summary["guardrail"]["attempts"] == 1


# --------------------------------------------------------------------------- #
# rs0
# --------------------------------------------------------------------------- #


async def _rs0_db(name):
    from motor.motor_asyncio import AsyncIOMotorClient

    from core.database import _ensure_indexes

    client = AsyncIOMotorClient(RS0_URL)
    assert (await client.admin.command("hello")).get("setName") == "rs0"
    await client.drop_database(name)
    db = client[name]
    await _ensure_indexes(db)
    return client, db


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_tx2_concurrent_settlement_rs0():
    """TX-2: worker + sweeper + duplicate x 10 concurrently."""
    client, db = await _rs0_db("forge_a1_tx2")
    try:
        await db.users.insert_one({"id": "u1", "email": "u@x", "credits": 100})
        await _admitted(db, ledger=[_op("architect", 3), _op("developer", 5)])
        results = await asyncio.gather(*(credit_ledger.settle_build(db, "b1") for _ in range(10)))
        assert sum(r.applied for r in results) == 1
        assert (await db.users.find_one({"id": "u1"}))["credits"] == 100 - 8
        assert await db.credit_transactions.count_documents({"build_id": "b1", "kind": "settle"}) == 1
    finally:
        await client.drop_database("forge_a1_tx2")
        client.close()


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_ct3_ten_builds_settle_simultaneously_rs0():
    client, db = await _rs0_db("forge_a1_ct3")
    try:
        await db.users.insert_one({"id": "u1", "email": "u@x", "credits": 10 * R})
        for i in range(10):
            await _admitted(db, build_id=f"b{i}", ledger=[_op("architect", 3)])
        await asyncio.gather(*(credit_ledger.settle_build(db, f"b{i}") for i in range(10)))
        assert (await db.users.find_one({"id": "u1"}))["credits"] == 10 * R - 30
    finally:
        await client.drop_database("forge_a1_ct3")
        client.close()


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_tx4_unknown_commit_result_rs0(monkeypatch):
    """TX-4: the driver reports UnknownTransactionCommitResult after the
    commit applied (a connection drop at commit). The idempotent re-run
    finds the settle row; the refund happens once."""
    from motor.motor_asyncio import AsyncIOMotorClientSession
    from pymongo.errors import PyMongoError

    client, db = await _rs0_db("forge_a1_tx4")
    try:
        await db.users.insert_one({"id": "u1", "email": "u@x", "credits": 100})
        await _admitted(db, ledger=[_op("architect", 3)])
        real = AsyncIOMotorClientSession.with_transaction
        state = {"raised": False}

        async def flaky(self, coro, **kw):
            result = await real(self, coro, **kw)
            if not state["raised"]:
                state["raised"] = True
                raise PyMongoError("connection reset at commit", error_labels=["UnknownTransactionCommitResult"])
            return result

        monkeypatch.setattr(AsyncIOMotorClientSession, "with_transaction", flaky)
        await credit_ledger.settle_build(db, "b1")
        assert (await db.users.find_one({"id": "u1"}))["credits"] == 100 - 3
        assert await db.credit_transactions.count_documents({"build_id": "b1", "kind": "settle"}) == 1
    finally:
        await client.drop_database("forge_a1_tx4")
        client.close()


def test_settlement_kinds():
    assert {k.value for k in CreditKind} == {"reserve", "settle", "release"}
