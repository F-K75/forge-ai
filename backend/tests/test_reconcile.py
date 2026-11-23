"""Reconciliation invariants I-1…I-12 (core/reconcile.py) and the provider
response journal (§8.5, X1).

Clean builds are reconciled in every EX-1, RT and attribution run
(test_build_ledger.py, test_recovery.py, test_ledger_attribution.py); here
each invariant is shown to catch the defect it names.
"""

from __future__ import annotations

import asyncio
import copy
from datetime import timedelta

import pytest

from core.models import utcnow
from core.reconcile import reconcile_build, reconcile_recent
from tests.ledger_harness import LedgerHarness, Script


def _clean(monkeypatch, **kw):
    h = LedgerHarness(monkeypatch, script=Script(integrations=True, pass_at=1, debug_usable=[True], **kw))
    result, exc = h.run_to_end()
    assert exc is None
    assert h.reconcile().ok
    return h


def _break(h, mutate):
    doc = h.db.builds.docs[0]
    mutate(doc, h.db)
    return h.reconcile()


def _first(report, invariant):
    return [v for v in report.violations if v.invariant == invariant]


def test_clean_build_reconciles(monkeypatch):
    h = _clean(monkeypatch)
    report = h.reconcile()
    assert report.ok and "I-5" in report.skipped  # no usage rows without unified recording


@pytest.mark.parametrize("invariant,mutate", [
    ("I-1", lambda d, db: db.credit_transactions.docs[0].update(amount=1)),
    ("I-2", lambda d, db: d["ledger"][0].update(credits=500)),
    ("I-2", lambda d, db: d["ledger"].append({"operation_id": "x", "stage_key": "x", "status": "failed",
                                              "credits": 1, "dispatches": []})),
    ("I-3", lambda d, db: d["settlement"].update(refunded=0)),
    ("I-3", lambda d, db: db.credit_transactions.docs.append(
        {"build_id": d["id"], "kind": "release", "amount": 0})),
    ("I-4", lambda d, db: d["ledger"].append(dict(copy.deepcopy(d["ledger"][0]), operation_id="dup"))),
    ("I-6", lambda d, db: db.ai_usage.docs.append(
        {"id": "r1", "build_id": d["id"], "operation_id": None, "account": "generation", "cost": 0.0})),
    ("I-7", lambda d, db: d["ledger"][0]["dispatches"].extend([
        dict(d["ledger"][0]["dispatches"][0], dispatch_no=2, account="generation"),
        dict(d["ledger"][0]["dispatches"][0], dispatch_no=3)])),
    ("I-9", lambda d, db: d["agents"].append({"agent": "pm", "status": "running"})),
    ("I-9", lambda d, db: d["ledger"][0].update(status="dispatched", credits=0)),
    ("I-10", lambda d, db: db.build_files.docs.clear()),
    ("I-11", lambda d, db: d["settlement"]["provider_cost_summary"].update(
        generation={"attempts": 1, "tokens": 1, "cost_usd": 9.0})),
    ("I-12", lambda d, db: d["funding"].update(state="reserved")),
])
def test_each_invariant_catches_its_defect(monkeypatch, invariant, mutate):
    h = _clean(monkeypatch)
    report = _break(h, mutate)
    assert _first(report, invariant), report.summary()


def test_i5_completed_without_a_successful_attempt(monkeypatch):
    h = _clean(monkeypatch)
    op = h.db.builds.docs[0]["ledger"][0]
    h.db.ai_usage.docs.append({"id": "r", "build_id": "build-1", "operation_id": op["operation_id"],
                               "outcome": "error", "account": "generation", "cost": 0.0})
    report = h.reconcile()
    assert _first(report, "I-5") and "I-5" not in report.skipped


def test_i8_byok_rules(monkeypatch):
    h = LedgerHarness(monkeypatch, funding="byok", script=Script(integrations=False))
    h.run_to_end()
    assert h.reconcile().ok
    op = h.db.builds.docs[0]["ledger"][0]
    h.db.ai_usage.docs.append({"id": "r", "build_id": "build-1", "operation_id": op["operation_id"],
                               "outcome": "success", "account": "generation", "purpose": "generation",
                               "credential": "forge", "cost": 0.0})
    report = h.reconcile()
    assert len(_first(report, "I-8")) == 1


def test_not_a_ledger_build_is_skipped():
    from tests.a1_support import LedgerFakeDB

    db = LedgerFakeDB(builds=[{"id": "legacy", "status": "success"}])
    report = asyncio.run(reconcile_build(db, "legacy"))
    assert report.ok and report.skipped == {"all": "not a ledger build"}


def test_reconcile_recent_covers_settled_builds(monkeypatch):
    h = _clean(monkeypatch)
    reports = h.loop.run_until_complete(reconcile_recent(h.db, utcnow() - timedelta(hours=48)))
    assert [r.build_id for r in reports] == ["build-1"] and all(r.ok for r in reports)


# --------------------------------------------------------------------------- #
# Journal (§8.5, X1 interim default)
# --------------------------------------------------------------------------- #


def test_journal_holds_usable_output_only_until_w7(monkeypatch):
    """Journaled between W4 and W7, deleted at W7, TTL 24 h as a backstop;
    unusable output is never journaled."""
    seen = []
    h = LedgerHarness(monkeypatch, script=Script(integrations=False, developer_files={}))
    journal = h.db.llm_response_journal
    real = journal.update_one

    async def spy(query, update, **kw):
        seen.append((query["operation_id"], update["$set"]["stage_key"], update["$set"]["expires_at"]
                     - update["$set"]["created_at"]))
        return await real(query, update, **kw)

    monkeypatch.setattr(journal, "update_one", spy)
    h.run_to_end()
    stages = [stage for _, stage, _ in seen]
    assert "developer" not in stages  # unusable (no files): never journaled
    assert {"architect", "business_model", "designer"} <= set(stages)
    assert all(ttl == timedelta(hours=24) for _, _, ttl in seen)
    assert journal.docs == []  # every journaled response was deleted at its W7
