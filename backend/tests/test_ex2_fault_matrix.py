"""EX-2: the fault matrix (plan §16.4; Revision 2 amended §11.4).

Every mandatory operation position of a base path x fault x funding, run
through the real worker, orchestrator, ledger and settlement. Each run
asserts I-1…I-12 (reconciliation), exactly-once settlement, and the
§12 row semantics of the fault:

| Fault | Forge / free grant (§12) | BYOK (§12) |
|---|---|---|
| transient x1..x3 | row 2b: Celery retries, then completes; faulted ops uncharged | row 2b': no retry, failed ``byok_no_auto_retry`` |
| model output | row 2c: one retry for the stage_key, completes | row 2c': failed, no repair or retry |
| non-transient | row 3: failed, no retry | same |
| interrupt, journal present | row 5a: committed from the journal, no new call | row 5a (RT-11) |
| interrupt, no journal | row 5b: dispatch 2 under ``recovery``, completes | row 5c: failed ``byok_interrupted`` |
| interrupt, dispatch 2 fails | row 5b: failed ``recovery_failed``, no third dispatch | row 5c |
| duplicate delivery | row 6a: the second task exits; then as 5b | as 5c |

Clarification positions are optional operations; their faults are the
EX-1 outcomes (failed, timed out, interrupted). PR CI runs every row of the
max path; ``FORGE_EX_FULL=1`` adds the other base paths (min, max without
integrations, all clarifications failing).
"""

from __future__ import annotations

import pytest

from core.build_ledger import LedgerRun
from core.orchestrator import BuildCancelled
from core.pricing import quote_from_settings
from tests.ex_matrix import FULL_MATRIX
from tests.ledger_harness import LedgerHarness, Script, WorkerCrash

QUOTE = quote_from_settings()
P = QUOTE.prices
N = QUOTE.params.debug_iterations
Q = QUOTE.params.clarification_questions

FAULTS = ("transient1", "transient2", "transient3", "model_output", "non_transient",
          "interrupt_journal", "interrupt", "interrupt_d2_fails", "duplicate_delivery")

BASE_PATHS = {
    # name: (integrations, clarifications, pass_at, debug_usable)
    "max": (True, ["answered"] * Q, None, [True] * N),
    "min": (False, [], 0, []),
    "max_no_integrations": (False, ["answered"] * Q, None, [True] * N),
    "clarifications_failing": (True, ["failed"] * Q, 1, [True]),
}


def _positions(integrations, pass_at):
    """(stage_key, stub stage name, index of that stub call)."""
    out = [("architect", "architect", 0), ("business_model", "business_model", 0),
           ("designer", "designer", 0), ("developer", "developer", 0)]
    if integrations:
        out.append(("integration", "integration", 0))
    passes = (pass_at + 1) if pass_at is not None else N + 1
    for k in range(passes):
        out.append((f"pm#{k}", "pm", k))
        if k < passes - 1:
            out.append((f"debug#{k + 1}", "debug", k))
    return out


def _rows():
    paths = BASE_PATHS if FULL_MATRIX else {"max": BASE_PATHS["max"]}
    rows = []
    for path, (integrations, _, pass_at, _) in paths.items():
        for stage_key, stage, index in _positions(integrations, pass_at):
            for fault in FAULTS:
                for funding in ("user_credits", "byok", "free_grant"):
                    rows.append((path, stage_key, stage, index, fault, funding))
    return rows


ROWS = _rows()


def _crash_commit_once(monkeypatch, stage_key):
    real = LedgerRun.commit
    state = {"done": False}

    async def commit(self, handle, **kw):
        if handle.stage_key == stage_key and not state["done"]:
            state["done"] = True
            raise WorkerCrash(stage_key)
        return await real(self, handle, **kw)

    monkeypatch.setattr(LedgerRun, "commit", commit)


@pytest.mark.parametrize("path,stage_key,stage,index,fault,funding", ROWS,
                         ids=["|".join(map(str, r)) for r in ROWS])
def test_ex2_fault_matrix(monkeypatch, path, stage_key, stage, index, fault, funding):
    integrations, clarifications, pass_at, debug_usable = BASE_PATHS[path]
    prefix = [None] * index
    failures = {
        "transient1": [ConnectionError("503")],
        "transient2": [ConnectionError("503")] * 2,
        "transient3": [ConnectionError("503")] * 3,
        "model_output": [ValueError("model returned invalid JSON")],
        "non_transient": [BuildCancelled("declined")],
        "interrupt": ["crash"],
        "duplicate_delivery": ["crash"],
        "interrupt_d2_fails": ["crash", "crash"],
        "interrupt_journal": [],
    }[fault]
    script = Script(integrations=integrations, clarifications=list(clarifications), pass_at=pass_at,
                    debug_usable=list(debug_usable), failures={stage: prefix + list(failures)})
    if fault == "interrupt_journal":
        _crash_commit_once(monkeypatch, stage_key)
    h = LedgerHarness(monkeypatch, funding=funding, script=script)

    if fault == "duplicate_delivery":
        with pytest.raises(WorkerCrash):
            h.run()
        assert h.run()["reason"] == "busy"  # 6a: the lease is still live
        h.expire_lease()
    result, exc = h.run_to_end()

    byok = funding == "byok"
    doc = h.doc
    report = h.reconcile()
    assert report.ok, report.summary()
    assert doc["settlement"] is not None and len(h.credit_rows("settle")) == 1
    ops = [op for op in doc["ledger"] if op["stage_key"] == stage_key]
    calls = h.script.calls.count(stage)
    baseline_calls = sum(1 for _, name, _ in _positions(integrations, pass_at) if name == stage)

    if byok and fault in ("transient1", "transient2", "transient3", "model_output"):
        expected = ("failed", "byok_no_auto_retry")
    elif byok and fault in ("interrupt", "interrupt_d2_fails", "duplicate_delivery"):
        expected = ("failed", "byok_interrupted")
    elif fault == "non_transient":
        expected = ("failed", "cancelled")
    elif fault == "interrupt_d2_fails":
        expected = ("failed", "recovery_failed")
    else:
        expected = ("success" if pass_at is not None else "failed", None)
    assert (doc["status"], doc.get("failure_reason")) == expected, (doc["status"], doc.get("failure_reason"))

    if expected[1] is None:
        # The faulted stage completed exactly once, charged once.
        completed = [op for op in ops if op["status"] == "completed"]
        assert len(completed) == 1 and completed[0]["credits"] == (0 if byok else P.price_for(stage_key))
        retries = {"transient1": 1, "transient2": 2, "transient3": 3, "model_output": 1}.get(fault, 0)
        assert len(h.retries) == retries
        if fault == "interrupt_journal":
            assert calls == baseline_calls and completed[0]["dispatches"][-1]["journaled"]
        if fault in ("interrupt", "duplicate_delivery"):
            assert [d["account"] for d in completed[0]["dispatches"]][-1] == "recovery"
    else:
        # Terminal: no retry on BYOK or for a non-transient fault; no third
        # dispatch; the faulted operation uncharged.
        assert h.retries == []
        assert all(op["credits"] == 0 for op in ops)
        assert all(len(op["dispatches"]) <= 2 for op in ops)
        # The faulted call is never repeated, except once by the recovery
        # dispatch 2 on the Forge credential (no third, never on BYOK).
        assert calls == index + (2 if fault == "interrupt_d2_fails" and not byok else 1)
        if byok:
            assert all(len(op["dispatches"]) <= 1 for op in doc["ledger"])
    consumed = doc["settlement"]["consumed"]
    if byok:
        assert consumed == 0 and h.user["credits"] == h.initial_credits
    else:
        assert consumed <= QUOTE.max_cost
        assert consumed == sum(P.price_for(op["stage_key"]) for op in doc["ledger"]
                               if op["status"] == "completed" and op["credits"])
