"""Attribution of provider attempts to ledger operations (plan §7.1, W3,
I-5, I-6) through the real gateway and router: A2's ``operation_scope`` is
entered around every dispatch of a ledger build."""

from __future__ import annotations

import asyncio

from core import credit_ledger, execution_state
from core.credit_ledger import FundingSource
from core.models import Build
from core.pricing import quote_from_settings
from tests.a1_support import LedgerFakeDB, patch_ledger_infra, set_flags
from tests.a2_support import CountingProvider, StubBuildHarness, build_responses, make_user, op_marker

QUOTE = quote_from_settings()


def _ledger_build(monkeypatch, *, flags=None, pm_failures=1):
    db = LedgerFakeDB(users=[make_user(byok=False)], projects=[{"id": "p1"}])
    patch_ledger_infra(monkeypatch, db)
    set_flags(monkeypatch, ledger_v2=True, unified_usage_recording=True, collab_protocol_v2=False,
              **(flags or {}))
    build = Build(id="build-1", project_id="p1", user_id="u1", prompt="Build a todo API")
    execution_state.admit(build)
    doc = build.model_dump()
    doc.pop("idempotency_key", None)
    doc["processing_boundary"] = {"credential_mode": "forge", "consents": [], "policy_version": "2026-11",
                                  "byok_auto_retry_max": 0, "owner_user_id": "u1"}
    loop = asyncio.new_event_loop()
    loop.run_until_complete(credit_ledger.admit_build(db, build_doc=doc, source=FundingSource.USER_CREDITS,
                                                      quote=QUOTE))
    loop.close()
    responses = build_responses()
    forge = CountingProvider(responder=lambda model, messages: responses.get(op_marker(messages) or "", "ok"))
    harness = StubBuildHarness(monkeypatch, db=db, forge=forge, pm_failures=pm_failures)
    return db, forge, harness


def test_every_provider_attempt_carries_its_operation(monkeypatch):
    db, forge, harness = _ledger_build(monkeypatch)
    result = harness.run(reserved=QUOTE.max_cost)
    assert result["status"] == "success", result
    built = db.builds.docs[0]
    ops = {op["operation_id"]: op for op in built["ledger"]}
    rows = [r for r in db.ai_usage.docs if r.get("build_id") == "build-1"]
    assert rows and len(rows) == len(forge.calls)
    for row in rows:
        assert row["operation_id"] in ops, row
        assert row["dispatch_no"] == 1 and row["account"] == "generation"
    # Each charged operation had at least one successful attempt (I-5).
    for op in ops.values():
        if op["credits"]:
            assert any(r["operation_id"] == op["operation_id"] and r["outcome"] == "success" for r in rows)
    meter = built["token_meters"]["generation"]["consumed"]
    assert meter == sum(r["total_tokens"] for r in rows) > 0
    assert built["settlement"]["provider_cost_summary"]["generation"]["attempts"] == len(rows)
    assert built["settlement"]["consumed"] == sum(op["credits"] for op in ops.values())
    # I-1…I-12, including I-5/I-6/I-11 which need the usage rows.
    from core.reconcile import reconcile_build

    loop = asyncio.new_event_loop()
    report = loop.run_until_complete(reconcile_build(db, "build-1"))
    loop.close()
    assert report.ok and not report.skipped, (report.summary(), report.skipped)
