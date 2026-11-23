"""T1 admission and reservation (plan §10.2, §13.2; TX-1, CT-1, CT-8, QT-5).

The in-memory double runs the real transaction callback and restores every
collection when it raises, so these tests prove the callback writes all four
documents or none and that every guard holds. Atomicity and concurrency on a
real server are the rs0-marked tests at the end (``FORGE_RS0_MONGODB_URL``).
"""

from __future__ import annotations

import asyncio
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import api.auth as auth_module
import api.builds as builds_module
from core import credit_ledger
from core.credit_ledger import FundingSource
from core.models import User
from core.pricing import quote_from_settings
from tests.a1_support import RS0_URL, LedgerFakeDB, patch_ledger_infra, rs0, set_flags

QUOTE = quote_from_settings()
R = QUOTE.max_cost


class FakeRunBuild:
    def __init__(self, fail: bool = False):
        self.calls = []
        self.fail = fail

    def apply_async(self, args=(), kwargs=None, **extra):
        if self.fail:
            raise RuntimeError("broker unavailable")
        self.calls.append(args)


def _db(**user_fields) -> LedgerFakeDB:
    user = {"id": "u1", "email": "u@example.test", "email_verified": True, "credits": 100,
            "plan": "standard", "free_build_used": True, **user_fields}
    return LedgerFakeDB(users=[user], projects=[{"id": "proj1", "user_id": "u1", "tech_stack": {}}])


def _client(monkeypatch, db, run_build, plan="standard"):
    patch_ledger_infra(monkeypatch, db)
    set_flags(monkeypatch, ledger_v2=True)
    monkeypatch.setattr(builds_module, "run_build", run_build)
    app = FastAPI()
    app.include_router(builds_module.router)
    user = User(id="u1", email="u@example.test", name="U", plan=plan)
    app.dependency_overrides[auth_module.get_current_user] = lambda: user
    return TestClient(app)


def _post(client, **extra):
    return client.post("/builds/", json={"project_id": "proj1", "prompt": "build me an app", **extra})


def _build_doc(build_id="b1", user_id="u1"):
    return {"id": build_id, "user_id": user_id, "project_id": "proj1", "prompt": "x", "status": "pending",
            "agents": [], "credits_used": 0}


# --------------------------------------------------------------------------- #
# Through the API
# --------------------------------------------------------------------------- #


def test_user_credits_reserve_max_build_cost_in_one_transaction(monkeypatch):
    db = _db()
    run = FakeRunBuild()
    r = _post(_client(monkeypatch, db, run))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["funding"] == "user_credits" and body["reserved_credits"] == R == 27
    assert db.users.docs[0]["credits"] == 100 - R
    build = db.builds.docs[0]
    assert build["schema_version"] == 2
    assert build["funding"]["state"] == "reserved" and build["funding"]["reserved_credits"] == R
    assert sum(line["credits"] for line in build["funding"]["breakdown"]) == R
    assert build["build_status"] == "pending" and build["execution_transitions"][0]["to"] == "pending"
    assert build["processing_boundary"]["credential_mode"] == "forge"
    [row] = db.credit_transactions.docs
    assert (row["build_id"], row["kind"], row["amount"]) == (build["id"], "reserve", R)
    assert db.usage_counters.docs[0]["builds"] == 1
    # The task is enqueued after the commit, with the stored reservation.
    assert run.calls[0][3] == R
    assert db.log.count("commit") == 1


def test_flag_off_keeps_the_legacy_reservation(monkeypatch):
    db = _db()
    run = FakeRunBuild()
    client = _client(monkeypatch, db, run)
    set_flags(monkeypatch, ledger_v2=False)
    r = _post(client)
    assert r.status_code == 200
    assert run.calls[0][3] == 17  # sum(CREDIT_COSTS), as before A1
    assert db.credit_transactions.docs == []
    assert "schema_version" not in db.builds.docs[0] or db.builds.docs[0]["schema_version"] == 1


def test_insufficient_credits_402_moves_nothing(monkeypatch):
    db = _db(credits=R - 1)
    run = FakeRunBuild()
    r = _post(_client(monkeypatch, db, run))
    assert r.status_code == 402
    detail = r.json()["detail"]
    assert detail["code"] == "insufficient_credits"
    assert (detail["required"], detail["available"]) == (R, R - 1)
    assert sum(line["credits"] for line in detail["breakdown"]) == R
    assert db.users.docs[0]["credits"] == R - 1
    assert db.builds.docs == [] and db.credit_transactions.docs == [] and db.usage_counters.docs == []
    assert run.calls == []


def test_free_grant_reserves_zero_and_claims_with_build_id(monkeypatch):
    db = _db(credits=5, free_build_used=False)
    run = FakeRunBuild()
    r = _post(_client(monkeypatch, db, run))
    assert r.status_code == 200
    assert r.json()["funding"] == "free_grant"
    user = db.users.docs[0]
    assert user["credits"] == 5 and user["free_build_used"] is True
    assert user["free_build_id"] == r.json()["build_id"]
    funding = db.builds.docs[0]["funding"]
    assert funding["reserved_credits"] == 0 and funding["allowance"] == R
    assert run.calls[0][3] == 0


def test_byok_reserves_zero(monkeypatch):
    from tests.a2_support import make_user

    user = make_user(byok=True)
    user.update(email_verified=True, credits=3)
    db = LedgerFakeDB(users=[user], projects=[{"id": "proj1", "user_id": "u1"}])
    run = FakeRunBuild()
    r = _post(_client(monkeypatch, db, run, plan="pro"))
    assert r.status_code == 200, r.text
    assert r.json()["funding"] == "byok" and r.json()["reserved_credits"] == 0
    assert db.users.docs[0]["credits"] == 3
    assert db.builds.docs[0]["processing_boundary"]["credential_mode"] == "byok"
    assert db.credit_transactions.docs[0]["amount"] == 0


def test_dispatch_failure_releases_through_t3(monkeypatch):
    db = _db(credits=5, free_build_used=False)
    with pytest.raises(RuntimeError):
        _post(_client(monkeypatch, db, FakeRunBuild(fail=True)))
    user = db.users.docs[0]
    assert user["free_build_used"] is False and "free_build_id" not in user
    build = db.builds.docs[0]
    assert build["funding"]["state"] == "released"
    assert build["settlement"]["kind"] == "release" and build["settlement"]["consumed"] == 0
    assert build["status"] == "failed" and build["build_status"] == "failed"
    assert [t["to"] for t in build["execution_transitions"]] == ["pending", "failed"]
    assert sorted(r["kind"] for r in db.credit_transactions.docs) == ["release", "reserve"]


def test_dispatch_failure_refunds_user_credits(monkeypatch):
    db = _db()
    with pytest.raises(RuntimeError):
        _post(_client(monkeypatch, db, FakeRunBuild(fail=True)))
    assert db.users.docs[0]["credits"] == 100
    release = [r for r in db.credit_transactions.docs if r["kind"] == "release"][0]
    assert release["amount"] == R


def test_idempotent_retry_returns_the_existing_build(monkeypatch):
    db = _db()
    run = FakeRunBuild()
    client = _client(monkeypatch, db, run)
    first = _post(client, idempotency_key="k1").json()
    second = _post(client, idempotency_key="k1").json()
    assert second["build_id"] == first["build_id"] and second["idempotent"] is True
    assert db.users.docs[0]["credits"] == 100 - R
    assert len(db.builds.docs) == 1 and len(run.calls) == 1


def test_daily_build_limit_inside_t1(monkeypatch):
    """QT-5 (logic): at the plan limit T1 aborts; nothing is debited."""
    db = _db(credits=1000)
    run = FakeRunBuild()
    client = _client(monkeypatch, db, run)
    set_flags(monkeypatch, plan_daily_build_limits={"standard": 2})
    asyncio.run(db.usage_counters.create_index([("scope", 1), ("scope_id", 1), ("day", 1)], unique=True))
    for i in range(2):
        db.builds.docs.clear()  # keep the 30 s duplicate guard out of the way
        assert _post(client).status_code == 200
    db.builds.docs.clear()
    r = _post(client)
    assert r.status_code == 429 and r.json()["detail"]["code"] == "daily_build_limit"
    assert db.users.docs[0]["credits"] == 1000 - 2 * R
    assert db.usage_counters.docs[0]["builds"] == 2
    assert len([t for t in db.credit_transactions.docs if t["kind"] == "reserve"]) == 2


# --------------------------------------------------------------------------- #
# TX-1 (logic): a fault at every write of T1 leaves nothing behind
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("source", [FundingSource.USER_CREDITS, FundingSource.FREE_GRANT, FundingSource.BYOK])
@pytest.mark.parametrize("fault_at", [1, 2, 3, 4])
def test_fault_at_every_t1_write_writes_all_or_none(source, fault_at):
    db = _db(credits=100, free_build_used=(source != FundingSource.FREE_GRANT))
    writes = 3 if source == FundingSource.BYOK else 4
    if fault_at > writes:
        pytest.skip("BYOK admission has three writes")
    db.fault_at_write(fault_at)
    with pytest.raises(RuntimeError):
        asyncio.run(credit_ledger.admit_build(db, build_doc=_build_doc(), source=source, quote=QUOTE))
    assert db.log[-1] == "abort"
    assert db.builds.docs == [] and db.credit_transactions.docs == [] and db.usage_counters.docs == []
    assert db.users.docs[0]["credits"] == 100
    assert db.users.docs[0].get("free_build_id") is None
    # And with no fault, all four.
    asyncio.run(credit_ledger.admit_build(db, build_doc=_build_doc(), source=source, quote=QUOTE))
    assert len(db.builds.docs) == 1 and len(db.credit_transactions.docs) == 1 and len(db.usage_counters.docs) == 1


def test_t1_uses_snapshot_majority_primary():
    db = _db()
    asyncio.run(credit_ledger.admit_build(db, build_doc=_build_doc(), source=FundingSource.USER_CREDITS,
                                          quote=QUOTE))
    opts = db.txn_options[-1]
    assert opts["read_concern"].level == "snapshot"
    assert opts["write_concern"].document["w"] == "majority"
    assert opts["read_preference"].name == "Primary"


def test_concurrent_admissions_never_overdraw_logic():
    """CT-1 (logic): 20 concurrent admissions for a balance funding 3."""
    db = _db(credits=3 * R + 5)

    async def one(i):
        try:
            await credit_ledger.admit_build(db, build_doc=_build_doc(f"b{i}"), source=FundingSource.USER_CREDITS,
                                            quote=QUOTE)
            return True
        except credit_ledger.InsufficientCredits:
            return False

    async def run():
        return await asyncio.gather(*(one(i) for i in range(20)))

    results = asyncio.run(run())
    assert sum(results) == 3
    assert db.users.docs[0]["credits"] == 5
    assert len(db.builds.docs) == 3 == len(db.credit_transactions.docs)


# --------------------------------------------------------------------------- #
# rs0: the same properties on a real replica set
# --------------------------------------------------------------------------- #


async def _rs0_db(name):
    from motor.motor_asyncio import AsyncIOMotorClient

    from core.database import _ensure_indexes

    client = AsyncIOMotorClient(RS0_URL)
    hello = await client.admin.command("hello")
    assert hello.get("setName") == "rs0"
    db = client[name]
    await client.drop_database(name)
    await _ensure_indexes(db)
    return client, db


class _Boom(Exception):
    pass


class _FaultingDB:
    """Proxies a Motor database and raises at the n-th insert/update."""

    def __init__(self, db, fault_at):
        self._db, self._fault_at, self.n = db, fault_at, 0

    @property
    def client(self):
        return self._db.client

    def __getattr__(self, name):
        coll, outer = getattr(self._db, name), self

        class _Coll:
            def __getattr__(self, attr):
                fn = getattr(coll, attr)
                if attr not in ("insert_one", "update_one"):
                    return fn

                async def wrapped(*a, **k):
                    outer.n += 1
                    if outer.n == outer._fault_at:
                        raise _Boom()
                    return await fn(*a, **k)

                return wrapped

        return _Coll()


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_tx1_fault_injection_rs0():
    """TX-1: a fault at every statement inside T1 -> all four documents
    written, or none."""
    client, db = await _rs0_db("forge_a1_tx1")
    try:
        await db.users.insert_one({"id": "u1", "email": "u@example.test", "credits": 100})
        for fault_at in (1, 2, 3, 4):
            with pytest.raises(_Boom):
                await credit_ledger.admit_build(_FaultingDB(db, fault_at), build_doc=_build_doc(f"tx1-{fault_at}"),
                                                source=FundingSource.USER_CREDITS, quote=QUOTE)
            assert await db.builds.count_documents({}) == 0
            assert await db.credit_transactions.count_documents({}) == 0
            assert await db.usage_counters.count_documents({}) == 0
            assert (await db.users.find_one({"id": "u1"}))["credits"] == 100
        await credit_ledger.admit_build(db, build_doc=_build_doc("tx1-ok"), source=FundingSource.USER_CREDITS,
                                        quote=QUOTE)
        assert await db.credit_transactions.count_documents({"build_id": "tx1-ok"}) == 1
        assert await db.builds.count_documents({"id": "tx1-ok"}) == 1
        assert (await db.users.find_one({"id": "u1"}))["credits"] == 100 - R
    finally:
        await client.drop_database("forge_a1_tx1")
        client.close()


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_ct1_concurrent_admissions_rs0():
    client, db = await _rs0_db("forge_a1_ct1")
    try:
        await db.users.insert_one({"id": "u1", "email": "u@example.test", "credits": 3 * R + 5})

        async def one(i):
            try:
                await credit_ledger.admit_build(db, build_doc=_build_doc(f"b{i}-{uuid.uuid4()}"),
                                                source=FundingSource.USER_CREDITS, quote=QUOTE)
                return True
            except credit_ledger.InsufficientCredits:
                return False

        results = await asyncio.gather(*(one(i) for i in range(20)))
        assert sum(results) == 3
        assert (await db.users.find_one({"id": "u1"}))["credits"] == 5
    finally:
        await client.drop_database("forge_a1_ct1")
        client.close()


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_ct8_one_free_grant_rs0():
    client, db = await _rs0_db("forge_a1_ct8")
    try:
        await db.users.insert_one({"id": "u1", "email": "u@example.test", "credits": 0})

        async def one(i):
            try:
                await credit_ledger.admit_build(db, build_doc=_build_doc(f"g{i}"), source=FundingSource.FREE_GRANT,
                                                quote=QUOTE)
                return "free_grant"
            except credit_ledger.FreeGrantTaken:
                return "taken"

        results = await asyncio.gather(*(one(i) for i in range(10)))
        assert results.count("free_grant") == 1
    finally:
        await client.drop_database("forge_a1_ct8")
        client.close()


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_qt5_daily_build_limit_inside_t1_rs0():
    client, db = await _rs0_db("forge_a1_qt5")
    try:
        await db.users.insert_one({"id": "u1", "email": "u@example.test", "credits": 10_000})

        async def one(i):
            try:
                await credit_ledger.admit_build(db, build_doc=_build_doc(f"d{i}"), source=FundingSource.USER_CREDITS,
                                                quote=QUOTE, daily_build_limit=4)
                return True
            except credit_ledger.DailyBuildLimitReached:
                return False

        results = await asyncio.gather(*(one(i) for i in range(12)))
        assert sum(results) == 4
        assert (await db.users.find_one({"id": "u1"}))["credits"] == 10_000 - 4 * R
        assert (await db.usage_counters.find_one({"scope_id": "u1"}))["builds"] == 4
    finally:
        await client.drop_database("forge_a1_qt5")
        client.close()

