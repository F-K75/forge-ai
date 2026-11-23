"""Quotas (plan §13.3; C2, U4, U5; QT-1…QT-5).

QT-5 (the daily build limit inside T1) is in test_tx_admission.py, as a
logic test through the API and as an rs0 test of 12 concurrent admissions.
"""

from __future__ import annotations

import asyncio

import pytest

from core import credit_ledger, quotas
from core.ai_usage import BudgetExceeded
from core.build_ledger import LedgerRun, ledger_scope
from core.credit_ledger import FundingSource
from core.models import utcnow
from core.operation_context import operation_scope
from core.pricing import quote_from_settings
from tests.a1_support import RS0_URL, LedgerFakeDB, rs0, set_flags

QUOTE = quote_from_settings()


class Budget:
    """Stands in for core.ai_usage.check_budget: the free plan's daily
    10,000 tokens."""

    def __init__(self, limit=10_000):
        self.limit, self.calls = limit, []

    async def __call__(self, user_id, estimated_tokens=0, org_id=None):
        self.calls.append(estimated_tokens)
        if estimated_tokens > self.limit:
            raise BudgetExceeded("daily budget", used=0, limit=self.limit)


def _run(db=None):
    db = db or LedgerFakeDB(users=[{"id": "u1", "email": "u@x", "credits": 100, "free_build_used": True}])
    loop = asyncio.new_event_loop()

    async def setup():
        await credit_ledger.admit_build(
            db, build_doc={"id": "b1", "user_id": "u1", "project_id": "p1", "prompt": "x", "status": "pending",
                           "agents": [], "credits_used": 0, "created_at": utcnow(),
                           "processing_boundary": {"credential_mode": "forge"}},
            source=FundingSource.USER_CREDITS, quote=QUOTE,
        )
        return (await LedgerRun.acquire(db, "b1")).run

    return db, loop, loop.run_until_complete(setup())


async def _bound_call(run, budget, estimated, *, stage="developer", user_id="u1"):
    handle = await run.begin(stage)
    with ledger_scope(run), handle.scope():
        await quotas.enforce_call_budget(user_id, estimated, None, budget)
    return handle


def test_qt1_exemption_flag_off_keeps_the_daily_budget(monkeypatch):
    set_flags(monkeypatch, build_token_exemption=False)
    db, loop, run = _run()
    budget = Budget()
    with pytest.raises(BudgetExceeded):
        loop.run_until_complete(_bound_call(run, budget, 12_000))
    assert budget.calls == [12_000]


def test_exemption_on_skips_the_daily_budget_only_for_a_bound_call(monkeypatch):
    set_flags(monkeypatch, build_token_exemption=True)
    db, loop, run = _run()
    budget = Budget()
    loop.run_until_complete(_bound_call(run, budget, 12_000))
    assert budget.calls == []


@pytest.mark.parametrize("case", ["no_operation", "no_ledger", "other_user", "superseded", "not_dispatched"])
def test_qt2_exemption_without_a_live_binding_is_rejected(monkeypatch, case):
    """The exemption applies only to a call bound to a DISPATCHED operation
    of a leased build the caller owns; anything else pays the daily
    budget."""
    set_flags(monkeypatch, build_token_exemption=True)
    db, loop, run = _run()
    budget = Budget()

    async def call():
        handle = await run.begin("developer")
        if case == "no_operation":
            with ledger_scope(run):
                await quotas.enforce_call_budget("u1", 12_000, None, budget)
        elif case == "no_ledger":
            with handle.scope():
                await quotas.enforce_call_budget("u1", 12_000, None, budget)
        elif case == "other_user":
            with ledger_scope(run), handle.scope():
                await quotas.enforce_call_budget("u2", 12_000, None, budget)
        elif case == "superseded":
            run.superseded = True
            with ledger_scope(run), handle.scope():
                await quotas.enforce_call_budget("u1", 12_000, None, budget)
        else:
            await run.commit(handle)
            with ledger_scope(run), operation_scope(handle.operation_id, dispatch_no=1):
                await quotas.enforce_call_budget("u1", 12_000, None, budget)

    with pytest.raises(BudgetExceeded):
        loop.run_until_complete(call())
    assert budget.calls == [12_000]


def test_per_operation_ceiling_refuses_before_the_call(monkeypatch):
    set_flags(monkeypatch, operation_token_ceilings={"developer": 5_000})
    db, loop, run = _run()
    budget = Budget(limit=10 ** 9)
    with pytest.raises(quotas.QuotaRefused) as err:
        loop.run_until_complete(_bound_call(run, budget, 6_000))
    assert err.value.reason == "operation_token_ceiling" and budget.calls == []


def test_byok_calls_skip_the_daily_budget_but_honour_ceilings(monkeypatch):
    """§13.2: BYOK reserves 0 and is not Forge's spend, but a bound call is
    still held to the per-operation ceiling (U5)."""
    from core.llm import router

    set_flags(monkeypatch, operation_token_ceilings={"developer": 50})
    db, loop, run = _run()

    async def call(text):
        handle = await run.begin("developer")
        with ledger_scope(run), handle.scope():
            await router._enforce_byok_ceilings("u1", [{"role": "user", "content": text}], "", 10)

    with pytest.raises(quotas.QuotaRefused):
        loop.run_until_complete(call("x" * 2_000))
    # Unbound (no ledger build): never refused here.
    loop.run_until_complete(router._enforce_byok_ceilings("u1", [{"role": "user", "content": "x" * 2_000}], "", 10))


def test_build_ceiling_refuses_at_w1(monkeypatch):
    """U5 per-build ceiling: once the generation meter cannot fit the
    operation's ceiling, W1 refuses it (no provider call)."""
    set_flags(monkeypatch, build_generation_token_ceiling=1_000, operation_token_ceilings={"pm": 400})
    db, loop, run = _run()
    run.token_meters = {"generation": {"consumed": 700}}
    from core.build_ledger import LedgerRefused

    with pytest.raises(LedgerRefused) as err:
        loop.run_until_complete(run.begin("pm#0"))
    assert err.value.reason == "quota"
    op = db.builds.docs[0]["ledger"][-1]
    assert (op["status"], op["reason"], op["dispatches"]) == ("refused", "quota", [])


def test_meter_records_each_attempt_and_the_operation_tokens(monkeypatch):
    db, loop, run = _run()

    async def scenario():
        handle = await run.begin("developer")
        with ledger_scope(run), handle.scope():
            await quotas.record_attempt_tokens(120, account="generation")
            await quotas.record_attempt_tokens(30, account="guardrail")
        return handle

    handle = loop.run_until_complete(scenario())
    doc = db.builds.docs[0]
    assert doc["token_meters"]["generation"]["consumed"] == 120
    assert doc["token_meters"]["platform"]["consumed"] == 30
    assert doc["ledger"][handle.index]["tokens"] == 120


def test_qt3_meter_increments_are_atomic_logic():
    db, loop, run = _run()

    async def burst():
        with ledger_scope(run):
            await asyncio.gather(*(quotas.record_attempt_tokens(10, account="generation") for _ in range(50)))

    loop.run_until_complete(burst())
    assert db.builds.docs[0]["token_meters"]["generation"]["consumed"] == 500


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_qt3_meter_atomic_rs0():
    from motor.motor_asyncio import AsyncIOMotorClient

    from core.database import _ensure_indexes

    client = AsyncIOMotorClient(RS0_URL)
    try:
        assert (await client.admin.command("hello")).get("setName") == "rs0"
        await client.drop_database("forge_a1_qt3")
        db = client["forge_a1_qt3"]
        await _ensure_indexes(db)
        await db.users.insert_one({"id": "u1", "email": "u@x", "credits": 100})
        await credit_ledger.admit_build(
            db, build_doc={"id": "b1", "user_id": "u1", "project_id": "p1", "prompt": "x",
                           "status": "pending", "created_at": utcnow(),
                           "processing_boundary": {"credential_mode": "forge"}},
            source=FundingSource.USER_CREDITS, quote=QUOTE,
        )
        runs = [(await LedgerRun.acquire(db, "b1")).run]
        runs.append(LedgerRun(db, await db.builds.find_one({"id": "b1"}), "other"))

        async def meter(run):
            with ledger_scope(run):
                for _ in range(25):
                    await quotas.record_attempt_tokens(10, account="generation")

        await asyncio.gather(*(meter(r) for r in runs))
        doc = await db.builds.find_one({"id": "b1"})
        assert doc["token_meters"]["generation"]["consumed"] == 500
    finally:
        await client.drop_database("forge_a1_qt3")
        client.close()


def test_qt4_operation_ceiling_refusal_in_validation_is_incomplete(monkeypatch):
    """QT-4 through the real gateway and router: the PM's per-operation
    ceiling is below what one call needs, so its operation is REFUSED
    before any provider call; the code exists, so the build completes with
    the stage recorded as incomplete and the PM uncharged."""
    from tests.test_ledger_attribution import _ledger_build

    db, forge, harness = _ledger_build(monkeypatch, flags={"operation_token_ceilings": {"pm": 50}})
    result = harness.run(reserved=QUOTE.max_cost)
    assert result["status"] == "success", result
    doc = db.builds.docs[0]
    pm = [op for op in doc["ledger"] if op["stage_key"] == "pm#0"]
    assert pm and pm[0]["status"] == "refused" and pm[0]["reason"] == "quota" and pm[0]["credits"] == 0
    assert doc["quality"]["incomplete_stages"] == [{"stage_key": "pm#0", "reason": "operation_token_ceiling"}]
    assert not any("[op:validate" in str(c["messages"]) for c in forge.calls)
    assert doc["settlement"]["consumed"] == sum(op["credits"] for op in doc["ledger"])
