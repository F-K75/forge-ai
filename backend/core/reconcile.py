"""Reconstruction and reconciliation of a ledger build
(docs/architecture/agent-collaboration-plan.md §14.3; Revision 2 amended
§6.9; accounting rule 7).

``reconcile_build`` is pure and read-only. It checks the build document,
its ``credit_transactions``, ``ai_usage`` rows and ``build_files`` against
invariants I-1…I-12 and returns every violation it finds. The C13c staging
gate requires zero mismatches over 24 h; ``reconcile_recent`` is the batch
form for a nightly job or an admin check.

| # | Invariant |
|---|---|
| I-1 | Exactly one ``reserve`` row, equal to ``funding.reserved_credits`` |
| I-2 | consumed = Σ credits of COMPLETED operations <= reservation (``user_credits``), <= allowance (``free_grant``), = 0 (``byok``); only COMPLETED operations carry credits |
| I-3 | Settled: exactly one ``settle`` or ``release`` row; refunded = reserved - consumed (0 unless ``user_credits``); the row and the settlement agree |
| I-4 | At most one charged operation per ``stage_key`` |
| I-5 | Every COMPLETED operation has a successful provider attempt under its id, or committed from the journal (checked when the build has usage rows) |
| I-6 | Every ``ai_usage`` row of the build maps to one of its operations or a named platform account: no orphan provider calls |
| I-7 | Dispatches <= 2 for mandatory operations, <= 1 for optional ones; dispatch 2 is account ``recovery`` on the credential of dispatch 1; never on BYOK |
| I-8 | BYOK: 0 credits, generation-channel attempts on the customer's credential, no ``generation`` account rows |
| I-9 | Terminal build: no AgentStep RUNNING and no operation left open |
| I-10 | Files of every COMPLETED file-producing operation still exist |
| I-11 | ``provider_cost_summary`` equals Σ ``ai_usage`` cost per account |
| I-12 | Terminal build <=> funding SETTLED or RELEASED |
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from core import pricing
from core.credit_ledger import LEDGER_SCHEMA_VERSION

logger = logging.getLogger(__name__)

PLATFORM_ACCOUNTS = frozenset({"guardrail", "shadow", "monitoring", "mandatory_review"})
_OPEN = ("authorized", "dispatched")
_GENERATION_PURPOSES = frozenset({"generation", "repair", "retry", "fallback", "cache_hit", "recovery"})


@dataclass
class Violation:
    invariant: str
    detail: str


@dataclass
class ReconcileReport:
    build_id: str
    violations: List[Violation] = field(default_factory=list)
    skipped: Dict[str, str] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.violations

    def add(self, invariant: str, detail: str) -> None:
        self.violations.append(Violation(invariant, detail))

    def summary(self) -> str:
        return "; ".join(f"{v.invariant}: {v.detail}" for v in self.violations) or "ok"


async def reconcile_build(db, build_id: str) -> ReconcileReport:
    report = ReconcileReport(build_id)
    build = await db.builds.find_one({"id": build_id}, {"_id": 0})
    if build is None:
        report.add("I-0", "build not found")
        return report
    if build.get("schema_version") != LEDGER_SCHEMA_VERSION:
        report.skipped["all"] = "not a ledger build"
        return report

    funding = build.get("funding") or {}
    source = funding.get("source")
    reserved = int(funding.get("reserved_credits") or 0)
    allowance = int(funding.get("allowance") or funding.get("max_cost") or 0)
    ledger: List[Dict[str, Any]] = build.get("ledger") or []
    settlement = build.get("settlement")
    rows = await db.credit_transactions.find({"build_id": build_id}, {"_id": 0}).to_list(None)
    usage = await db.ai_usage.find({"build_id": build_id}, {"_id": 0}).to_list(None)
    terminal = build.get("build_status") in ("completed", "failed")

    # I-1
    reserves = [r for r in rows if r.get("kind") == "reserve"]
    if len(reserves) != 1:
        report.add("I-1", f"{len(reserves)} reserve rows")
    elif int(reserves[0].get("amount") or 0) != reserved:
        report.add("I-1", f"reserve row {reserves[0].get('amount')} != reserved {reserved}")

    # I-2
    consumed = sum(int(op.get("credits") or 0) for op in ledger if op.get("status") == "completed")
    stray = [op["operation_id"] for op in ledger if op.get("status") != "completed" and op.get("credits")]
    if stray:
        report.add("I-2", f"credits on operations that did not complete: {stray}")
    cap = reserved if source == "user_credits" else (allowance if source == "free_grant" else 0)
    if consumed < 0 or consumed > cap:
        report.add("I-2", f"consumed {consumed} outside [0, {cap}] for {source}")

    # I-3
    closes = [r for r in rows if r.get("kind") in ("settle", "release")]
    if settlement:
        if len(closes) != 1:
            report.add("I-3", f"{len(closes)} settle/release rows")
        expected_consumed = 0 if settlement.get("kind") == "release" else consumed
        expected_refund = (reserved - expected_consumed) if source == "user_credits" else 0
        if settlement.get("anomaly"):
            report.add("I-3", f"settlement anomaly recorded: {settlement['anomaly']}")
        else:
            if int(settlement.get("consumed") or 0) != expected_consumed:
                report.add("I-3", f"settlement consumed {settlement.get('consumed')} != {expected_consumed}")
            if int(settlement.get("refunded") or 0) != expected_refund:
                report.add("I-3", f"refunded {settlement.get('refunded')} != {expected_refund}")
        if closes and int(closes[0].get("amount") or 0) != int(settlement.get("refunded") or 0):
            report.add("I-3", "credit_transactions row and settlement disagree")
    elif closes:
        report.add("I-3", "a settle/release row exists but the build is unsettled")

    # I-4
    charged: Dict[str, int] = {}
    for op in ledger:
        if op.get("status") == "completed" and int(op.get("credits") or 0) > 0:
            charged[op["stage_key"]] = charged.get(op["stage_key"], 0) + 1
    doubles = sorted(k for k, n in charged.items() if n > 1)
    if doubles:
        report.add("I-4", f"charged more than once: {doubles}")

    op_ids = {op.get("operation_id") for op in ledger}

    # I-5
    if usage:
        for op in ledger:
            if op.get("status") != "completed":
                continue
            journaled = any(d.get("journaled") for d in op.get("dispatches") or [])
            ok = any(r.get("operation_id") == op["operation_id"] and r.get("outcome") in ("success", "cache_hit")
                     for r in usage)
            if not (ok or journaled):
                report.add("I-5", f"{op['operation_id']} completed without a successful attempt")
    else:
        report.skipped["I-5"] = "no ai_usage rows (unified_usage_recording off)"

    # I-6
    for r in usage:
        if r.get("operation_id") in op_ids:
            continue
        if r.get("account") in PLATFORM_ACCOUNTS or r.get("platform_principal"):
            continue
        report.add("I-6", f"orphan provider attempt {r.get('id')} (operation {r.get('operation_id')})")

    # I-7
    for op in ledger:
        dispatches = op.get("dispatches") or []
        limit = 2 if op.get("mandatory") else 1
        if len(dispatches) > limit:
            report.add("I-7", f"{op['operation_id']} has {len(dispatches)} dispatches (max {limit})")
        if len(dispatches) >= 2:
            d1, d2 = dispatches[0], dispatches[1]
            if d2.get("account") != "recovery" or d2.get("credential") != d1.get("credential"):
                report.add("I-7", f"{op['operation_id']} dispatch 2 is not a same-credential recovery")
            if d1.get("credential") == "byok":
                report.add("I-7", f"{op['operation_id']} re-dispatched on BYOK")

    # I-8
    if source == "byok":
        if consumed:
            report.add("I-8", f"BYOK build charged {consumed}")
        for r in usage:
            if r.get("account") == "generation":
                report.add("I-8", f"generation-account row {r.get('id')} on a BYOK build")
            elif r.get("purpose") in _GENERATION_PURPOSES and r.get("credential") not in (None, "byok"):
                report.add("I-8", f"Forge-credential generation attempt {r.get('id')} on a BYOK build")

    # I-9
    if terminal:
        running = [s.get("agent") for s in build.get("agents") or [] if s.get("status") == "running"]
        if running:
            report.add("I-9", f"steps still running: {running}")
        open_ops = [op["operation_id"] for op in ledger if op.get("status") in _OPEN]
        if open_ops:
            report.add("I-9", f"operations left open: {open_ops}")

    # I-10
    file_ops = [op for op in ledger if op.get("status") == "completed" and pricing.is_file_producing(op["stage_key"])]
    if file_ops:
        files = await db.build_files.find({"build_id": build_id}, {"_id": 0, "path": 1}).to_list(None)
        paths = {f.get("path") for f in files}
        steps = {s.get("operation_id"): s for s in build.get("agents") or [] if s.get("operation_id")}
        if not paths:
            report.add("I-10", "file-producing operations completed but the build has no files")
        for op in file_ops:
            changed = (steps.get(op["operation_id"]) or {}).get("files_changed") or []
            missing = [p for p in changed if p not in paths]
            if missing:
                report.add("I-10", f"{op['operation_id']} files missing: {missing}")

    # I-11
    if settlement and not settlement.get("anomaly"):
        summary = settlement.get("provider_cost_summary") or {}
        totals: Dict[str, float] = {}
        for r in usage:
            account = r.get("account") or "unattributed"
            totals[account] = totals.get(account, 0.0) + float(r.get("cost") or 0.0)
        for account in set(totals) | set(summary):
            recorded = float((summary.get(account) or {}).get("cost_usd") or 0.0)
            if abs(recorded - totals.get(account, 0.0)) > 1e-6:
                report.add("I-11", f"{account}: summary {recorded} != attempts {totals.get(account, 0.0)}")

    # I-12
    state = funding.get("state")
    if terminal and state not in ("settled", "released"):
        report.add("I-12", f"terminal build with funding {state}")
    if not terminal and state in ("settled", "released"):
        report.add("I-12", f"funding {state} but the build is {build.get('build_status')}")

    if report.violations:
        logger.error("Ledger reconciliation mismatch for build %s: %s", build_id, report.summary())
    return report


async def reconcile_recent(db, since: datetime, *, limit: Optional[int] = None) -> List[ReconcileReport]:
    """Every ledger build settled or released since ``since`` (nightly over
    the last 48 h)."""
    cursor = db.builds.find(
        {"schema_version": LEDGER_SCHEMA_VERSION, "settlement.settled_at": {"$gte": since}},
        {"_id": 0, "id": 1},
    )
    docs = await cursor.to_list(limit)
    return [await reconcile_build(db, d["id"]) for d in docs]
