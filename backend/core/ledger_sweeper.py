"""The ledger sweeper (docs/architecture/agent-collaboration-plan.md §8.7;
Revision 2 amended §6.6 L4; CT-5, CT-9).

Runs every ``ledger_sweeper_interval_seconds`` (5 min) from Celery beat, over
ledger builds that are still RESERVED and unsettled:

| Found | Action |
|---|---|
| Never leased (no ``attempt_token``) and older than ``ledger_dispatch_timeout_seconds`` | Broker loss: fence, T3 release (full refund, free-grant rollback), ``failed`` (``never_dispatched``) |
| A live attempt's lease (or scheduled retry) expired more than ``ledger_sweeper_grace_seconds`` ago | Forge credential, not yet resumed: CAS ``recovery_enqueues`` 0 -> 1 and enqueue a resume (the interrupted operation then follows §8.6). Otherwise: fence (``attempt_token = swept:<uuid>``), close open operations INTERRUPTED, ``failed`` (``orphaned``, or ``interrupted_byok``), T2 settle |
| Finalized (``final:<T>``) or already fenced (``swept:<uuid>``) but unsettled (the settler died) | T2 settle under that fence |

Every action is a guarded update first, so the sweeper and a worker (or two
sweepers) never both act: a stalled worker's next fenced write matches 0
documents and it stops uncharged (CT-5). Settlement is exactly once whatever
races (T2's idempotency key and ``settlement: null`` filter).
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional

from core import execution_state
from core.credit_ledger import LEDGER_SCHEMA_VERSION, release_build, settle_build
from core.models import BuildStatus, utcnow

logger = logging.getLogger(__name__)


def _settings():
    from core.config import get_settings

    return get_settings()


def _is_byok(doc: Dict[str, Any]) -> bool:
    return ((doc.get("processing_boundary") or {}).get("credential_mode") == "byok"
            or (doc.get("funding") or {}).get("source") == "byok")


def _closing_fields(doc: Dict[str, Any], reason: str, now: datetime) -> Dict[str, Any]:
    """$set fields that close what the dead attempt left open: operations
    INTERRUPTED (uncharged), RUNNING steps failed (I-9)."""
    fields: Dict[str, Any] = {}
    for i, op in enumerate(doc.get("ledger") or []):
        if op.get("status") in ("authorized", "dispatched"):
            fields[f"ledger.{i}.status"] = "interrupted"
            fields[f"ledger.{i}.reason"] = reason
            fields[f"ledger.{i}.credits"] = 0
            fields[f"ledger.{i}.resolved_at"] = now
            dispatches = op.get("dispatches") or []
            if dispatches:
                j = len(dispatches) - 1
                fields[f"ledger.{i}.dispatches.{j}.status"] = "interrupted"
                fields[f"ledger.{i}.dispatches.{j}.resolved_at"] = now
    agents = doc.get("agents") or []
    if any(step.get("status") == BuildStatus.RUNNING.value for step in agents):
        closed = []
        for step in agents:
            step = dict(step)
            if step.get("status") == BuildStatus.RUNNING.value:
                step.update(status=BuildStatus.FAILED.value, outcome="interrupted", completed_at=now,
                            error=step.get("error") or "The attempt running this step was lost")
            closed.append(step)
        fields["agents"] = closed
    return fields


async def _fence_and_fail(db, doc: Dict[str, Any], *, expected_token: Any, reason: str, error: str,
                          now: datetime, extra_filter: Optional[Dict[str, Any]] = None) -> Optional[str]:
    fence = f"swept:{uuid.uuid4()}"
    previous = doc.get("build_status") or execution_state.canonical_for(doc.get("status"))
    update = execution_state.transition_update(
        previous, BuildStatus.FAILED, reason=reason, attempt_token=fence,
        extra_set={
            "attempt_token": fence,
            "lease_expires_at": None,
            "retry_scheduled_until": None,
            "error": error,
            "failure_reason": reason,
            "completed_at": now,
            **_closing_fields(doc, reason, now),
        },
    )
    query = {"id": doc["id"], "attempt_token": expected_token, "settlement": None}
    query.update(extra_filter or {})
    result = await db.builds.update_one(query, update)
    return fence if getattr(result, "matched_count", 0) else None


async def sweep(db, *, enqueue: Callable[[Dict[str, Any]], Any], now: Optional[datetime] = None) -> Dict[str, List[str]]:
    s = _settings()
    now = now or utcnow()
    cutoff = now - timedelta(seconds=s.ledger_sweeper_grace_seconds)
    dispatch_cutoff = now - timedelta(seconds=s.ledger_dispatch_timeout_seconds)
    report: Dict[str, List[str]] = {"resumed": [], "failed": [], "released": [], "settled": []}
    docs = await db.builds.find(
        {"schema_version": LEDGER_SCHEMA_VERSION, "funding.state": "reserved", "settlement": None},
        {"_id": 0},
    ).to_list(None)
    for doc in docs:
        try:
            await _sweep_one(db, doc, now=now, cutoff=cutoff, dispatch_cutoff=dispatch_cutoff,
                             enqueue=enqueue, report=report)
        except Exception:
            logger.exception("ledger sweeper failed on build %s", doc.get("id"))
    if any(report.values()):
        logger.info("ledger sweeper: %s", {k: len(v) for k, v in report.items()})
    return report


async def _sweep_one(db, doc, *, now, cutoff, dispatch_cutoff, enqueue, report) -> None:
    build_id = doc["id"]
    token = doc.get("attempt_token")
    if token is None:
        created = doc.get("created_at")
        if created is not None and created < dispatch_cutoff:
            fence = await _fence_and_fail(db, doc, expected_token=None, reason="never_dispatched",
                                          error="The build was never picked up by a worker", now=now)
            if fence:
                result = await release_build(db, build_id, reason="never_dispatched", fence_token=fence)
                if result.applied:
                    report["released"].append(build_id)
        return

    if isinstance(token, str) and token.startswith(("final:", "swept:")):
        # The settler died after fencing; settle under the existing fence.
        stamp = doc.get("finalized_at") or doc.get("completed_at") or doc.get("created_at")
        if stamp is None or stamp < cutoff:
            result = await settle_build(db, build_id, fence_token=token)
            if result.applied:
                report["settled"].append(build_id)
        return

    lease = doc.get("lease_expires_at")
    retry_at = doc.get("retry_scheduled_until")
    expired = (lease is not None and lease < cutoff) or (lease is None and retry_at is not None and retry_at < cutoff)
    if not expired:
        return
    byok = _is_byok(doc)
    if not byok and int(doc.get("recovery_enqueues") or 0) == 0:
        claimed = await db.builds.update_one(
            {"id": build_id, "attempt_token": token, "settlement": None, "recovery_enqueues": {"$in": [0, None]}},
            {"$inc": {"recovery_enqueues": 1}},
        )
        if getattr(claimed, "matched_count", 0):
            enqueue(doc)
            report["resumed"].append(build_id)
        return
    reason = "interrupted_byok" if byok else "orphaned"
    error = ("The build was interrupted and was not re-run automatically on your own provider key"
             if byok else "The build's worker was lost and its single recovery did not complete")
    stale = {"$or": [{"lease_expires_at": {"$lt": cutoff}}, {"lease_expires_at": None}]}
    fence = await _fence_and_fail(db, doc, expected_token=token, reason=reason, error=error, now=now,
                                  extra_filter=stale)
    if fence:
        await settle_build(db, build_id, fence_token=fence)
        report["failed"].append(build_id)
