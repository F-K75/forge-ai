"""Ledger operations W1-W7 through the real worker, orchestrator and
reservation formula (plan §8; C3, C8, C9, U1, U6, U13; EX-1, RT-*, TX-3,
LC-1, RG-F1/F2/F13/F18/F22).

Builds run on the in-memory double (tests/ledger_harness.py); the rs0
versions of the concurrency properties are in test_tx_*.py.
"""

from __future__ import annotations

import pytest

from core import pricing
from core.pricing import quote_from_settings
from tests.ex_matrix import Combination, matrix_for_ci
from tests.ledger_harness import LedgerHarness, Script

QUOTE = quote_from_settings()
P = QUOTE.prices
N = QUOTE.params.debug_iterations
Q = QUOTE.params.clarification_questions


def _assert_balanced(h: LedgerHarness):
    """The money invariants every run must satisfy."""
    doc = h.doc
    funding, settlement = doc["funding"], doc["settlement"]
    assert settlement is not None and funding["state"] == "settled"
    consumed = sum(op["credits"] for op in doc["ledger"] if op["status"] == "completed")
    assert settlement["consumed"] == consumed == doc["credits_used"]
    # At most one charged operation per stage_key (I-4).
    charged = [op["stage_key"] for op in doc["ledger"] if op["credits"] > 0]
    assert len(charged) == len(set(charged))
    # Nothing left open, no step RUNNING (I-9).
    assert all(op["status"] not in ("authorized", "dispatched") for op in doc["ledger"])
    assert all(step["status"] != "running" for step in doc["agents"])
    reserved = funding["reserved_credits"]
    if funding["source"] == "user_credits":
        assert consumed <= reserved
        assert settlement["refunded"] == reserved - consumed
        assert h.user["credits"] == h.initial_credits - consumed
    elif funding["source"] == "free_grant":
        assert consumed <= funding["allowance"]
        assert h.user["credits"] == h.initial_credits
    else:
        assert consumed == 0 and h.user["credits"] == h.initial_credits
    assert len(h.credit_rows("settle")) == 1 and len(h.credit_rows("reserve")) == 1
    # I-1…I-12 hold in every run.
    report = h.reconcile()
    assert report.ok, report.summary()


def test_happy_path_charges_completed_stages_once(monkeypatch):
    h = LedgerHarness(monkeypatch, script=Script(integrations=False, pass_at=0))
    result, exc = h.run_to_end()
    assert exc is None and result["status"] == "success"
    assert h.charged() == {"architect": P.architect, "business_model": P.business_model,
                           "designer": P.designer, "developer": P.developer, "pm#0": P.pm}
    _assert_balanced(h)
    doc = h.doc
    assert doc["status"] == "success" and doc["build_status"] == "completed"
    assert h.user["credits"] == 100 - (P.architect + P.business_model + P.designer + P.developer + P.pm)
    # Each committed step names its operation (W7 wrote both).
    steps = {s["operation_id"] for s in doc["agents"] if s.get("operation_id")}
    assert {op["operation_id"] for op in doc["ledger"] if op["status"] == "completed"} <= steps | {
        op["operation_id"] for op in doc["ledger"] if op["stage_key"].startswith("question_pass")}


def test_question_pass_priced_zero_but_recorded(monkeypatch):
    """C3: question generation is its own recorded operation, price 0."""
    h = LedgerHarness(monkeypatch, script=Script(integrations=False, clarifications=["answered"] * 2))
    result, exc = h.run_to_end()
    assert exc is None
    [qp] = [op for op in h.ledger if op["stage_key"] == "question_pass:developer"]
    assert qp["status"] == "completed" and qp["price"] == 0 and qp["credits"] == 0
    clar = [op for op in h.ledger if op["stage_key"].startswith("clarification#")]
    assert len(clar) == 2 and all(op["credits"] == P.clarification for op in clar)
    _assert_balanced(h)


def test_clarifications_run_at_the_real_reservation(monkeypatch):
    """RG-F1: with the formula's reservation, all Q clarifications fit."""
    h = LedgerHarness(monkeypatch, script=Script(integrations=True, clarifications=["answered"] * Q,
                                                 pass_at=None, debug_usable=[True] * N))
    h.run_to_end()
    assert sum(1 for op in h.ledger if op["stage_key"].startswith("clarification#")
               and op["credits"] > 0) == Q
    # The max path consumes exactly the reservation (RG-F2: never more).
    assert h.doc["settlement"]["consumed"] == QUOTE.max_cost
    _assert_balanced(h)


def test_unusable_output_uncharged_and_retried_once(monkeypatch):
    """C8 + U13: an unusable Developer result is FAILED uncharged; one
    Celery retry for that stage_key; the second unusable result is final."""
    h = LedgerHarness(monkeypatch, script=Script(integrations=False, developer_files={}))
    result, exc = h.run_to_end()
    assert exc is not None and len(h.retries) == 1
    dev = [op for op in h.ledger if op["stage_key"] == "developer"]
    assert [op["status"] for op in dev] == ["failed", "failed"]
    assert all(op["credits"] == 0 and op["reason"] == "unusable_output" for op in dev)
    doc = h.doc
    assert doc["status"] == "failed" and doc["failure_reason"] == "model_output_exhausted"
    # Completed stages charged only (S6 fixed): architect + business model + designer.
    assert doc["settlement"]["consumed"] == P.architect + P.business_model + P.designer
    _assert_balanced(h)


def test_noop_debug_pass_is_uncharged_and_counts_toward_n(monkeypatch):
    """U6 / AR-7: an identical result ends FAILED ``no_change``, 0 credits,
    and still counts toward N."""
    h = LedgerHarness(monkeypatch, script=Script(integrations=False, pass_at=2, debug_usable=[False, True]))
    h.run_to_end()
    debug = {op["stage_key"]: op for op in h.ledger if op["stage_key"].startswith("debug#")}
    assert debug["debug#1"]["status"] == "failed" and debug["debug#1"]["reason"] == "no_change"
    assert debug["debug#1"]["credits"] == 0
    assert debug["debug#2"]["credits"] == P.debug
    assert h.doc["debug_iterations"] == 2
    _assert_balanced(h)


def test_resume_does_not_recharge(monkeypatch):
    """RG-F13: a transient failure in the Developer; the retry skips the
    completed stages and charges each stage once."""
    h = LedgerHarness(monkeypatch, script=Script(integrations=False,
                                                 failures={"developer": [ConnectionError("provider reset")]}))
    result, exc = h.run_to_end()
    assert exc is None and len(h.retries) == 1
    assert h.script.calls.count("architect") == 1 and h.script.calls.count("developer") == 2
    dev = [op for op in h.ledger if op["stage_key"] == "developer"]
    assert [op["status"] for op in dev] == ["failed", "completed"]
    assert dev[1]["retry_of"] == dev[0]["operation_id"]
    _assert_balanced(h)


def test_no_failed_state_before_a_retry(monkeypatch):
    """F22 / LC-1: a retryable failure never persists ``failed`` nor emits
    ``build_failed``; the build stays running and recovers."""
    seen = []
    h = LedgerHarness(monkeypatch, script=Script(integrations=False,
                                                 failures={"designer": [TimeoutError("slow")]}))
    h.script.on_call = lambda stage: seen.append(
        (stage, h.db.builds.docs[0]["status"], h.db.builds.docs[0]["build_status"]))
    result, exc = h.run_to_end()
    assert exc is None
    assert "build_failed" not in h.event_types()
    transitions = [t["to"] for t in h.doc["execution_transitions"]]
    assert "failed" not in transitions
    assert transitions[0] == "pending" and transitions[-1] == "completed"
    assert all(build_status == "running" for _, _, build_status in seen)


def test_running_only_under_a_lease(monkeypatch):
    """LC-1: every transition into ``running`` carries the attempt's
    fencing token, and every persisted change has a transition."""
    h = LedgerHarness(monkeypatch, script=Script(integrations=False,
                                                 failures={"designer": [TimeoutError("slow")]}))
    h.run_to_end()
    doc = h.doc
    for t in doc["execution_transitions"]:
        if t["to"] == "running":
            assert t["attempt_token"]
    assert doc["build_status"] == doc["execution_transitions"][-1]["to"]
    from core import execution_state

    assert execution_state.canonical_for(doc["status"]) == doc["build_status"]


def test_redelivery_of_a_settled_build_is_a_noop(monkeypatch):
    """RT-10: no agent call, no event, no refund."""
    h = LedgerHarness(monkeypatch, script=Script(integrations=False))
    h.run_to_end()
    calls, events, credits = len(h.script.calls), len(h.events), h.user["credits"]
    result = h.run()
    assert result["status"] == "noop" and result["reason"] == "settled"
    assert (len(h.script.calls), len(h.events), h.user["credits"]) == (calls, events, credits)


def test_duplicate_delivery_while_leased_exits(monkeypatch):
    """6a: a second task while the lease is live does nothing."""
    h = LedgerHarness(monkeypatch, script=Script(integrations=False, failures={"architect": ["crash"]}))
    with pytest.raises(BaseException):
        h.run()
    result = h.run()  # the lease from the crashed attempt is still live
    assert result["status"] == "noop" and result["reason"] == "busy"


def test_byok_build_consumes_zero(monkeypatch):
    h = LedgerHarness(monkeypatch, funding="byok", script=Script(integrations=True, pass_at=1,
                                                                 debug_usable=[True]))
    h.run_to_end()
    assert all(op["credits"] == 0 for op in h.ledger)
    assert h.doc["funding"]["reserved_credits"] == 0
    assert all(d["account"] == "customer_provider" for op in h.ledger for d in op["dispatches"])
    _assert_balanced(h)


def test_free_grant_counts_against_the_allowance(monkeypatch):
    h = LedgerHarness(monkeypatch, funding="free_grant", credits=5,
                      script=Script(integrations=False, clarifications=["answered"]))
    h.run_to_end()
    assert h.doc["settlement"]["consumed"] > 0
    assert all(d["account"] == "free_grant" for op in h.ledger for d in op["dispatches"])
    _assert_balanced(h)


# --------------------------------------------------------------------------- #
# EX-1 through the real worker: stratified 5% in PR CI, all with
# FORGE_EX_FULL=1 (nightly)
# --------------------------------------------------------------------------- #

EX1 = matrix_for_ci(N, Q)


@pytest.mark.parametrize("combo", EX1, ids=[c.id for c in EX1])
def test_ex1_ledger_matrix(monkeypatch, combo: Combination):
    script = Script(integrations=combo.integrations, clarifications=list(combo.clarifications),
                    pass_at=combo.pass_at, debug_usable=list(combo.debug_usable))
    h = LedgerHarness(monkeypatch, funding=combo.funding, script=script)
    result, exc = h.run_to_end()
    if combo.funding == "byok" and "interrupted" in combo.clarifications:
        # U1: an interrupted BYOK build terminates (A2's dispatch counter);
        # nothing re-runs on the customer's key; settled at 0.
        assert result["reason"] == "byok_interrupted"
        assert h.doc["failure_reason"] == "byok_interrupted" and h.doc["status"] == "failed"
        assert "developer" not in h.script.calls
        _assert_balanced(h)
        return
    assert exc is None, repr(exc)
    _assert_balanced(h)
    expected = combo.expected_completed(N)
    completed = [k for k in h.completed_keys()
                 if not k.startswith(("clarification#", "question_pass", "architect_clarify"))]
    assert sorted(completed) == sorted(expected)
    answered = sum(1 for op in h.ledger if op["stage_key"].startswith("clarification#")
                   and op["status"] == "completed")
    assert answered == combo.answered
    consumed = h.doc["settlement"]["consumed"]
    if combo.funding == "byok":
        assert consumed == 0
    else:
        assert consumed == pricing.closed_form_price(P, expected) + combo.answered * P.clarification
        assert consumed <= QUOTE.max_cost
    # Interrupted messages were never re-sent and never charged.
    for i, outcome in enumerate(combo.clarifications):
        if outcome == "interrupted":
            assert script.calls.count(f"answer#{i}") == 1
    assert h.doc["status"] == ("success" if combo.pass_at is not None else "failed")
