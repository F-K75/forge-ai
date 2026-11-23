"""Recovery, retry classes, lease/fencing and the sweeper (plan §8.4, §8.6,
§8.7, §12; RT-1…RT-11, TX-3 logic, CT-4/CT-5 logic, C9, U1, U13, X4).

RT numbering follows Revision 2 (amended) §11.3 with RT-4 = BYOK
terminate and RT-11 = BYOK journal-present commit. RT-7 (fault at every
settlement write) is in test_tx_settlement.py; RT-10 in
test_build_ledger.py. rs0 versions of TX-3/CT-4/CT-5 are at the end.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

import pytest
from celery.exceptions import SoftTimeLimitExceeded

from core import credit_ledger, ledger_sweeper
from core.build_ledger import AttemptSuperseded, LedgerRun
from core.credit_ledger import FundingSource
from core.llm.provider import ProviderError
from core.models import utcnow
from core.orchestrator import BuildCancelled
from core.pricing import quote_from_settings
from tests.a1_support import RS0_URL, LedgerFakeDB, rs0
from tests.ledger_harness import LedgerHarness, Script, WorkerCrash

QUOTE = quote_from_settings()
P = QUOTE.prices

# A path through every mandatory stage: PM fails once, one usable debug.
STAGES = [("architect", "architect"), ("business_model", "business_model"), ("designer", "designer"),
          ("developer", "developer"), ("integration", "integration"), ("pm#0", "pm"), ("debug#1", "debug")]


def _script(**kw) -> Script:
    return Script(integrations=True, pass_at=1, debug_usable=[True], **kw)


def _crash_at_commit(monkeypatch, stage_key: str):
    """WorkerCrash at W7 of ``stage_key``: the response is journaled (W4)
    and its output persisted (W6), the commit never happens."""
    real = LedgerRun.commit
    state = {"crashed": False}

    async def commit(self, handle, **kw):
        if handle.stage_key == stage_key and not state["crashed"]:
            state["crashed"] = True
            raise WorkerCrash(f"commit {stage_key}")
        return await real(self, handle, **kw)

    monkeypatch.setattr(LedgerRun, "commit", commit)
    return state


def _op(h, stage_key):
    ops = [op for op in h.ledger if op["stage_key"] == stage_key]
    assert len(ops) == 1, ops
    return ops[0]


def _settled_ok(h):
    doc = h.doc
    assert doc["settlement"] is not None and doc["funding"]["state"] == "settled"
    assert all(op["status"] not in ("authorized", "dispatched") for op in doc["ledger"])
    assert all(step["status"] != "running" for step in doc["agents"])
    consumed = sum(op["credits"] for op in doc["ledger"] if op["status"] == "completed")
    assert doc["settlement"]["consumed"] == consumed
    if doc["funding"]["source"] == "user_credits":
        assert h.user["credits"] == h.initial_credits - consumed
    else:
        assert h.user["credits"] == h.initial_credits
    report = h.reconcile()
    assert report.ok, report.summary()


@pytest.mark.parametrize("stage_key,call", STAGES)
def test_rt1_interrupted_with_journal_commits_without_a_call(monkeypatch, stage_key, call):
    state = _crash_at_commit(monkeypatch, stage_key)
    h = LedgerHarness(monkeypatch, script=_script())
    result, exc = h.run_to_end()
    assert state["crashed"] and exc is None and result["status"] == "success"
    expected_calls = 2 if call == "pm" else 1
    assert h.script.calls.count(call) == expected_calls  # pm runs twice on this path anyway
    op = _op(h, stage_key)
    assert op["status"] == "completed" and op["credits"] == P.price_for(stage_key)
    assert len(op["dispatches"]) == 1 and op["dispatches"][0]["journaled"] is True
    assert h.db.llm_response_journal.docs == []  # deleted at W7 (X1)
    _settled_ok(h)


@pytest.mark.parametrize("stage_key,call", STAGES)
def test_rt2_interrupted_without_journal_gets_one_recovery_dispatch(monkeypatch, stage_key, call):
    h = LedgerHarness(monkeypatch, script=_script(failures={call: ["crash"]}))
    result, exc = h.run_to_end()
    assert exc is None and result["status"] == "success"
    op = _op(h, stage_key)
    assert op["status"] == "completed" and op["credits"] == P.price_for(stage_key)  # charged once
    d1, d2 = op["dispatches"]
    assert (d1["dispatch_no"], d1["status"]) == (1, "interrupted")
    assert (d2["dispatch_no"], d2["status"], d2["account"]) == (2, "completed", "recovery")
    assert d1["credential"] == d2["credential"] == "forge"  # I-7
    _settled_ok(h)


@pytest.mark.parametrize("second", ["crash", ConnectionError("provider reset")])
def test_rt3_recovery_dispatch_fails_terminates_without_a_third(monkeypatch, second):
    h = LedgerHarness(monkeypatch, script=_script(failures={"designer": ["crash", second]}))
    result, exc = h.run_to_end()
    assert exc is not None and h.retries == []
    assert h.script.calls.count("designer") == 2
    op = _op(h, "designer")
    assert op["status"] == "failed" and op["credits"] == 0 and len(op["dispatches"]) == 2
    doc = h.doc
    assert doc["status"] == "failed" and doc["failure_reason"] == "recovery_failed"
    assert doc["settlement"]["consumed"] == P.architect + P.business_model
    _settled_ok(h)


def test_rt4_byok_interruption_terminates(monkeypatch):
    """BY-6 on the ledger path: no dispatch 2 on any credential; settled
    at 0; completed stages kept."""
    h = LedgerHarness(monkeypatch, funding="byok", script=_script(failures={"designer": ["crash"]}))
    result, exc = h.run_to_end()
    assert result["reason"] == "byok_interrupted"
    assert h.script.calls.count("designer") == 1
    op = _op(h, "designer")
    assert op["status"] == "interrupted" and len(op["dispatches"]) == 1
    assert [s["agent"] for s in h.doc["agents"] if s["status"] == "success"] == ["architect", "business_improver"]
    assert h.doc["failure_reason"] == "byok_interrupted" and h.doc["build_status"] == "failed"
    _settled_ok(h)


def test_rt11_byok_journal_present_commits_without_a_customer_key_call(monkeypatch):
    _crash_at_commit(monkeypatch, "designer")
    h = LedgerHarness(monkeypatch, funding="byok", script=_script())
    result, exc = h.run_to_end()
    assert exc is None and result["status"] == "success"
    assert h.script.calls.count("designer") == 1
    op = _op(h, "designer")
    assert op["status"] == "completed" and op["dispatches"][0]["journaled"] is True
    assert op["dispatches"][0]["account"] == "customer_provider"
    _settled_ok(h)


def test_rt5_interrupted_optional_operation_is_never_redispatched(monkeypatch):
    h = LedgerHarness(monkeypatch, script=_script(clarifications=["answered", "answered"],
                                                  failures={"question_pass": ["crash"]}))
    result, exc = h.run_to_end()
    assert exc is None
    assert h.script.calls.count("question_pass") == 1
    qp = _op(h, "question_pass:developer")
    assert qp["status"] == "interrupted" and qp["credits"] == 0
    assert not any(op["stage_key"].startswith("clarification#") for op in h.ledger)
    _settled_ok(h)


def test_rt6_failure_after_the_developer_keeps_the_files(monkeypatch):
    h = LedgerHarness(monkeypatch, script=_script(failures={"pm": [BuildCancelled("stop")]}))
    result, exc = h.run_to_end()
    assert isinstance(exc, BuildCancelled)
    files = {f["path"] for f in h.db.build_files.docs}
    assert {"main.py", "stripe.py"} <= files  # I-10
    assert h.doc["settlement"]["consumed"] == (P.architect + P.business_model + P.designer
                                               + P.developer + P.integration)
    _settled_ok(h)


def test_rt8_transient_retries_bounded_then_terminal(monkeypatch):
    h = LedgerHarness(monkeypatch, script=_script(failures={"designer": [ConnectionError("reset")] * 4}))
    result, exc = h.run_to_end()
    assert isinstance(exc, ConnectionError) and len(h.retries) == 3
    designer = [op for op in h.ledger if op["stage_key"] == "designer"]
    assert len(designer) == 4 and all(op["status"] == "failed" and op["credits"] == 0 for op in designer)
    assert h.doc["failure_reason"] == "retries_exhausted"
    # build_failed only once, at the end (F22).
    assert h.event_types().count("build_failed") == 1
    _settled_ok(h)


def test_rt9_soft_time_limit_mid_stream_is_uncharged(monkeypatch):
    h = LedgerHarness(monkeypatch, script=_script(failures={"developer": [SoftTimeLimitExceeded()]}))
    result, exc = h.run_to_end()
    assert isinstance(exc, SoftTimeLimitExceeded) and h.retries == []
    dev = _op(h, "developer")
    assert dev["status"] == "failed" and dev["reason"] == "cancelled" and dev["credits"] == 0
    assert h.doc["failure_reason"] == "timeout"
    _settled_ok(h)


@pytest.mark.parametrize("error,reason", [
    (BuildCancelled("declined"), "cancelled"),
    (ProviderError("401 unauthorized: invalid api key"), "exception"),
])
def test_non_transient_failures_are_never_retried(monkeypatch, error, reason):
    h = LedgerHarness(monkeypatch, script=_script(failures={"designer": [error]}))
    result, exc = h.run_to_end()
    assert exc is not None and h.retries == []
    assert h.doc["failure_reason"] == reason
    _settled_ok(h)


def test_byok_transient_failure_is_not_retried_without_authorization(monkeypatch):
    """U13 / X4 / BY-4 on the ledger path: one customer-key call, no retry,
    failed with the reason, settled at 0."""
    h = LedgerHarness(monkeypatch, funding="byok", script=_script(failures={"designer": [ConnectionError("503")]}))
    result, exc = h.run_to_end()
    assert exc is not None and h.retries == []
    assert h.script.calls.count("designer") == 1
    assert h.doc["failure_reason"] == "byok_no_auto_retry"
    _settled_ok(h)


# --------------------------------------------------------------------------- #
# Lease, fencing and the sweeper (logic)
# --------------------------------------------------------------------------- #


def _admitted_db(source=FundingSource.USER_CREDITS, credits=100, free_build_used=True, byok=False):
    db = LedgerFakeDB(users=[{"id": "u1", "email": "u@x", "credits": credits, "free_build_used": free_build_used}])
    loop = asyncio.new_event_loop()

    async def setup():
        await db.credit_transactions.create_index([("build_id", 1), ("kind", 1)], unique=True)
        doc = {"id": "b1", "user_id": "u1", "project_id": "p1", "prompt": "x", "status": "pending",
               "build_status": "pending", "execution_transitions": [], "agents": [], "credits_used": 0,
               "created_at": utcnow(),
               "processing_boundary": {"credential_mode": "byok" if byok else "forge"}}
        await credit_ledger.admit_build(db, build_doc=doc, source=source, quote=QUOTE)

    loop.run_until_complete(setup())
    return db, loop


def test_tx3_settlement_racing_a_late_w7_logic():
    """TX-3 (logic): the sweeper fences and settles; the stalled attempt's
    late W7 matches nothing, and consumed excludes it."""
    db, loop = _admitted_db()

    async def scenario():
        acquired = await LedgerRun.acquire(db, "b1")
        run = acquired.run
        arch = await run.begin("architect")
        await run.commit(arch)
        late = await run.begin("business_model")
        await db.builds.update_one({"id": "b1"}, {"$set": {"attempt_token": "swept:x"}})
        settled = await credit_ledger.settle_build(db, "b1", fence_token="swept:x")
        with pytest.raises(AttemptSuperseded):
            await run.commit(late)
        return settled

    settled = loop.run_until_complete(scenario())
    doc = db.builds.docs[0]
    assert settled.consumed == P.architect and doc["settlement"]["consumed"] == P.architect
    assert [op["status"] for op in doc["ledger"]] == ["completed", "dispatched"]
    assert db.users.docs[0]["credits"] == 100 - P.architect


def test_ct4_two_attempts_race_for_the_lease_logic():
    db, loop = _admitted_db()

    async def race():
        return await asyncio.gather(LedgerRun.acquire(db, "b1"), LedgerRun.acquire(db, "b1"))

    a, b = loop.run_until_complete(race())
    assert sorted([a.outcome, b.outcome]) == ["acquired", "busy"]
    winner = a.run or b.run
    assert db.builds.docs[0]["attempt_token"] == winner.token
    transitions = db.builds.docs[0]["execution_transitions"]
    assert [t["to"] for t in transitions] == ["running"] and transitions[0]["attempt_token"] == winner.token


def test_heartbeat_renews_and_stops_when_fenced():
    db, loop = _admitted_db()

    async def scenario():
        run = (await LedgerRun.acquire(db, "b1")).run
        before = db.builds.docs[0]["lease_expires_at"]
        assert await run.renew(now=utcnow() + timedelta(seconds=10))
        assert db.builds.docs[0]["lease_expires_at"] > before
        await db.builds.update_one({"id": "b1"}, {"$set": {"attempt_token": "other"}})
        assert not await run.renew()
        assert run.superseded
        run.start_heartbeat(interval=0.01)
        await asyncio.sleep(0.05)
        await run.stop_heartbeat()

    loop.run_until_complete(scenario())


def test_ct5_sweeper_leaves_a_live_lease_alone_logic():
    db, loop = _admitted_db()
    enqueued = []

    async def scenario():
        await LedgerRun.acquire(db, "b1")
        return await ledger_sweeper.sweep(db, enqueue=enqueued.append)

    report = loop.run_until_complete(scenario())
    assert not any(report.values()) and enqueued == []


def test_ct5_stalled_worker_resumed_once_then_fenced_and_settled_logic():
    db, loop = _admitted_db()
    enqueued = []
    later = utcnow() + timedelta(seconds=600)

    async def scenario():
        run = (await LedgerRun.acquire(db, "b1")).run
        arch = await run.begin("architect")
        await run.commit(arch)
        stalled = await run.begin("business_model")
        first = await ledger_sweeper.sweep(db, enqueue=enqueued.append, now=later)
        # The resumed attempt is lost too: the same stale lease is found again.
        second = await ledger_sweeper.sweep(db, enqueue=enqueued.append, now=later)
        with pytest.raises(AttemptSuperseded):
            await run.commit(stalled)
        return first, second

    first, second = loop.run_until_complete(scenario())
    assert first["resumed"] == ["b1"] and len(enqueued) == 1
    assert second["failed"] == ["b1"]
    doc = db.builds.docs[0]
    assert doc["recovery_enqueues"] == 1
    assert doc["status"] == "failed" and doc["failure_reason"] == "orphaned"
    assert doc["attempt_token"].startswith("swept:")
    assert [op["status"] for op in doc["ledger"]] == ["completed", "interrupted"]
    assert doc["settlement"]["consumed"] == P.architect
    assert db.users.docs[0]["credits"] == 100 - P.architect


def test_sweeper_fails_an_orphaned_byok_build_without_resuming():
    db, loop = _admitted_db(source=FundingSource.BYOK, byok=True)
    enqueued = []

    async def scenario():
        await LedgerRun.acquire(db, "b1")
        return await ledger_sweeper.sweep(db, enqueue=enqueued.append, now=utcnow() + timedelta(seconds=600))

    report = loop.run_until_complete(scenario())
    assert report["failed"] == ["b1"] and enqueued == []
    assert db.builds.docs[0]["failure_reason"] == "interrupted_byok"
    assert db.builds.docs[0]["settlement"]["refunded"] == 0


@pytest.mark.parametrize("source", [FundingSource.USER_CREDITS, FundingSource.FREE_GRANT])
def test_sweeper_releases_a_reservation_never_dispatched(source):
    """CT-9 (broker loss): RESERVED, never leased, past the dispatch
    timeout -> T3 release."""
    db, loop = _admitted_db(source=source, free_build_used=(source != FundingSource.FREE_GRANT), credits=100)
    report = loop.run_until_complete(ledger_sweeper.sweep(
        db, enqueue=lambda d: None, now=utcnow() + timedelta(hours=1)))
    assert report["released"] == ["b1"]
    doc = db.builds.docs[0]
    assert doc["funding"]["state"] == "released" and doc["failure_reason"] == "never_dispatched"
    assert doc["build_status"] == "failed"
    user = db.users.docs[0]
    assert user["credits"] == 100
    if source == FundingSource.FREE_GRANT:
        assert user["free_build_used"] is False


def test_sweeper_settles_a_finalized_build_whose_settler_died():
    db, loop = _admitted_db()

    async def scenario():
        run = (await LedgerRun.acquire(db, "b1")).run
        arch = await run.begin("architect")
        await run.commit(arch)
        await run.finalize({"$set": {"status": "failed", "build_status": "failed"}})
        return await ledger_sweeper.sweep(db, enqueue=lambda d: None, now=utcnow() + timedelta(seconds=600))

    report = loop.run_until_complete(scenario())
    assert report["settled"] == ["b1"]
    assert db.builds.docs[0]["settlement"]["consumed"] == P.architect


def test_sweeper_waits_for_a_scheduled_retry():
    db, loop = _admitted_db()

    async def scenario():
        run = (await LedgerRun.acquire(db, "b1")).run
        await run.release_for_retry(utcnow() + timedelta(seconds=60))
        early = await ledger_sweeper.sweep(db, enqueue=lambda d: None, now=utcnow() + timedelta(seconds=90))
        late = await ledger_sweeper.sweep(db, enqueue=lambda d: None, now=utcnow() + timedelta(seconds=400))
        return early, late

    early, late = loop.run_until_complete(scenario())
    assert not any(early.values()) and late["resumed"] == ["b1"]


# --------------------------------------------------------------------------- #
# rs0
# --------------------------------------------------------------------------- #


async def _rs0_admitted(name):
    from motor.motor_asyncio import AsyncIOMotorClient

    from core.database import _ensure_indexes

    client = AsyncIOMotorClient(RS0_URL)
    assert (await client.admin.command("hello")).get("setName") == "rs0"
    await client.drop_database(name)
    db = client[name]
    await _ensure_indexes(db)
    await db.users.insert_one({"id": "u1", "email": "u@x", "credits": 100})
    await credit_ledger.admit_build(
        db, build_doc={"id": "b1", "user_id": "u1", "project_id": "p1", "prompt": "x", "status": "pending",
                       "agents": [], "credits_used": 0, "created_at": utcnow(),
                       "processing_boundary": {"credential_mode": "forge"}},
        source=FundingSource.USER_CREDITS, quote=QUOTE,
    )
    return client, db


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_tx3_settlement_racing_a_late_w7_rs0():
    client, db = await _rs0_admitted("forge_a1_tx3")
    try:
        run = (await LedgerRun.acquire(db, "b1")).run
        await run.commit(await run.begin("architect"))
        late = await run.begin("business_model")
        await db.builds.update_one({"id": "b1"}, {"$set": {"attempt_token": "swept:x"}})
        commit_task = asyncio.ensure_future(run.commit(late))
        settled = await credit_ledger.settle_build(db, "b1", fence_token="swept:x")
        with pytest.raises(AttemptSuperseded):
            await commit_task
        doc = await db.builds.find_one({"id": "b1"})
        assert settled.consumed == doc["settlement"]["consumed"] == P.architect
        assert (await db.users.find_one({"id": "u1"}))["credits"] == 100 - P.architect
    finally:
        await client.drop_database("forge_a1_tx3")
        client.close()


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_ct4_lease_race_rs0():
    client, db = await _rs0_admitted("forge_a1_ct4")
    try:
        results = await asyncio.gather(*(LedgerRun.acquire(db, "b1") for _ in range(10)))
        assert sum(r.outcome == "acquired" for r in results) == 1
    finally:
        await client.drop_database("forge_a1_ct4")
        client.close()


@rs0
@pytest.mark.rs0
@pytest.mark.asyncio
async def test_ct5_sweeper_vs_stalled_worker_rs0():
    client, db = await _rs0_admitted("forge_a1_ct5")
    try:
        run = (await LedgerRun.acquire(db, "b1")).run
        stalled = await run.begin("architect")
        later = utcnow() + timedelta(seconds=600)
        await db.builds.update_one({"id": "b1"}, {"$set": {"recovery_enqueues": 1}})
        report = await ledger_sweeper.sweep(db, enqueue=lambda d: None, now=later)
        assert report["failed"] == ["b1"]
        with pytest.raises(AttemptSuperseded):
            await run.commit(stalled)
        doc = await db.builds.find_one({"id": "b1"})
        assert doc["settlement"]["consumed"] == 0
        assert (await db.users.find_one({"id": "u1"}))["credits"] == 100
    finally:
        await client.drop_database("forge_a1_ct5")
        client.close()
