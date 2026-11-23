"""Platform budget account ``shadow`` and transaction T4
(docs/architecture/agent-collaboration-plan.md §10.2 T4, §10.3 G4, §17.1;
C12b, X5, U7).

Budget: ``settings.shadow_monthly_usd`` ($100) per month, with a secondary
cap of ``settings.shadow_monthly_call_cap`` (1,000) provider calls per month.
Each review reserves its worst case up front, ``shadow_review_max_usd``
($0.20) and ``shadow_review_max_calls`` (2: the review and at most one
repair), through A2's guarded reservation (G4, ``core.platform_budgets``).

Hooks for S1 (which owns the reviewer and the rest of ``shadow_reviews``):

1. ``reserve_shadow_review(db, review_id=..., build_id=..., owner_user_id=...)``
   before calling the reviewer. It records the reservation on the
   ``shadow_reviews`` document (creating it with status ``reserved`` if S1
   has not yet), so settlement never depends on process memory. Idempotent
   per review id. ``ok=False`` (``budget_exhausted`` /
   ``call_cap_exhausted`` / ``budget_unset``) means: do not call the model.
2. ``settle_shadow_review(db, review_id=..., actual_usd=..., actual_calls=...,
   status=...)`` once the review ends, whatever the outcome (a failed or
   skipped review settles with what it actually spent, possibly 0).

T4 runs as one MongoDB transaction: the ``shadow_reviews`` document is
claimed (``settled`` false -> true, with status and cost) and the budget
documents move ``reserved -est``, ``spent +actual`` and the call counters,
all or nothing. The settled flag makes it exactly-once: a retry, a
concurrent settle or a drop on consent revocation finds it settled and
changes nothing. Where the server cannot run transactions (a standalone
development server), the same writes run in that order without one; a crash
between them can only leave headroom reserved (never overspend), which is
the safe direction.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Iterable, Optional

from pymongo.errors import DuplicateKeyError

from core import platform_budgets
from core.config import get_settings
from core.models import utcnow
from core.platform_budgets import ACCOUNT_SHADOW, BudgetReservation

logger = logging.getLogger(__name__)

SHADOW_REVIEWS = "shadow_reviews"
STATUS_RESERVED = "reserved"


def _reviews(db):
    return getattr(db, SHADOW_REVIEWS)


def _budgets(db):
    return getattr(db, platform_budgets.COLLECTION)


async def reserve_shadow_review(
    db,
    *,
    review_id: str,
    build_id: Optional[str] = None,
    owner_user_id: Optional[str] = None,
    estimate_usd: Optional[float] = None,
    calls: Optional[int] = None,
    now=None,
) -> BudgetReservation:
    """Reserve the worst case of one shadow review against the ``shadow``
    account (G4) and record it on ``shadow_reviews.{review_id}``."""
    if not review_id:
        raise ValueError("review_id is required")
    settings = get_settings()
    now = now or utcnow()
    existing = await _reviews(db).find_one({"id": review_id}, {"_id": 0})
    if existing and existing.get("settled"):
        return BudgetReservation(ok=False, account=ACCOUNT_SHADOW, reason="already_settled")
    if existing and existing.get("budget_reservation"):
        return BudgetReservation.from_doc(existing["budget_reservation"])

    estimate = float(settings.shadow_review_max_usd if estimate_usd is None else estimate_usd)
    n_calls = int(settings.shadow_review_max_calls if calls is None else calls)
    reservation = await platform_budgets.reserve(
        db,
        account=ACCOUNT_SHADOW,
        amount_usd=estimate,
        monthly_limit_usd=settings.shadow_monthly_usd,
        max_calls=int(settings.shadow_monthly_call_cap),
        calls=n_calls,
        now=now,
    )
    if not reservation.ok:
        logger.info("shadow review %s not reserved: %s", review_id, reservation.reason)
        return reservation
    try:
        await _reviews(db).update_one(
            {"id": review_id, "budget_reservation": {"$exists": False}, "settled": {"$ne": True}},
            {
                "$set": {"budget_reservation": dict(reservation.to_doc(), reserved_at=now), "account": ACCOUNT_SHADOW},
                "$setOnInsert": {
                    "id": review_id, "build_id": build_id, "owner_user_id": owner_user_id,
                    "status": STATUS_RESERVED, "settled": False, "created_at": now,
                },
            },
            upsert=True,
        )
    except DuplicateKeyError:
        # Lost a race on the unique id (another reservation or a settlement
        # got there first): give ours back and report what is stored.
        await platform_budgets.release(db, reservation)
        current = await _reviews(db).find_one({"id": review_id}, {"_id": 0}) or {}
        if current.get("budget_reservation") and not current.get("settled"):
            return BudgetReservation.from_doc(current["budget_reservation"])
        return BudgetReservation(ok=False, account=ACCOUNT_SHADOW, reason="already_settled")
    return reservation


@dataclass
class SettlementResult:
    applied: bool
    review_id: str
    status: Optional[str] = None
    cost_usd: float = 0.0
    calls: int = 0
    reason: str = "settled"


async def _run_transaction(db, callback: Callable[[Any], Awaitable[Any]]):
    """Run ``callback(session)`` in a transaction (§10.4: snapshot read
    concern, majority writes, primary reads; the driver retries transient
    errors, so the callback is idempotent). Falls back to ``callback(None)``
    where transactions are unavailable."""
    client = getattr(db, "client", None)
    start_session = getattr(client, "start_session", None) if client is not None else None
    if start_session is None:
        return await callback(None)
    try:
        from pymongo import ReadPreference
        from pymongo.errors import ConfigurationError, OperationFailure
        from pymongo.read_concern import ReadConcern
        from pymongo.write_concern import WriteConcern
    except ImportError:  # pragma: no cover - pymongo is a dependency
        return await callback(None)
    try:
        async with await start_session() as session:
            return await session.with_transaction(
                callback,
                read_concern=ReadConcern("snapshot"),
                write_concern=WriteConcern("majority"),
                read_preference=ReadPreference.PRIMARY,
            )
    except (OperationFailure, ConfigurationError) as exc:
        # 20 IllegalOperation: "Transaction numbers are only allowed on a
        # replica set member or mongos" (standalone dev server). Nothing was
        # committed, so running the writes once without a session is safe.
        if isinstance(exc, OperationFailure) and getattr(exc, "code", None) not in (20, 263):
            raise
        logger.warning("T4 settlement running without a transaction: %s", exc)
        return await callback(None)


async def settle_shadow_review(
    db,
    *,
    review_id: str,
    actual_usd: float,
    actual_calls: Optional[int] = None,
    status: str = "completed",
    extra: Optional[Dict[str, Any]] = None,
    only_if_status: Optional[Iterable[str]] = None,
    now=None,
) -> SettlementResult:
    """T4: settle one shadow review exactly once. ``actual_calls`` defaults
    to the calls reserved (never undercount the cap). ``only_if_status``
    settles only a review still in one of those statuses (the consent drop
    uses it so it can never settle a review S1 has already started)."""
    now = now or utcnow()
    actual = max(0.0, float(actual_usd or 0.0))
    claim_filter: Dict[str, Any] = {"id": review_id, "settled": {"$ne": True}}
    if only_if_status is not None:
        claim_filter["status"] = {"$in": list(only_if_status)}

    async def _settle(session) -> SettlementResult:
        kw = {"session": session} if session is not None else {}
        claimed = await _reviews(db).find_one_and_update(
            claim_filter,
            {"$set": {
                "settled": True,
                "status": status,
                "cost_usd": actual,
                "settled_at": now,
                **(extra or {}),
            }},
            **kw,
        )
        if claimed is None:
            exists = await _reviews(db).find_one({"id": review_id}, {"_id": 0, "id": 1, "settled": 1}, **kw)
            if not exists:
                return SettlementResult(False, review_id, reason="unknown_review")
            return SettlementResult(False, review_id, reason="already_settled" if exists.get("settled")
                                    else "status_changed")
        stored = claimed.get("budget_reservation")
        made = 0
        if stored and stored.get("doc_ids"):
            reservation = BudgetReservation.from_doc(stored)
            made = reservation.calls if actual_calls is None else max(0, int(actual_calls))
            incs = platform_budgets.settlement_incs(reservation, actual_usd=actual, actual_calls=made)
            for doc_id, inc in incs.items():
                await _budgets(db).update_one({"_id": doc_id}, {"$inc": inc}, **kw)
            await _reviews(db).update_one({"id": review_id}, {"$set": {"calls": made}}, **kw)
        elif actual > 0:
            logger.warning("shadow review %s settled with cost but no reservation", review_id)
        return SettlementResult(True, review_id, status=status, cost_usd=actual, calls=made)

    return await _run_transaction(db, _settle)


async def shadow_budget_status(db, *, now=None) -> Dict[str, Any]:
    """This month's ``shadow`` account, for monitoring (USD and calls)."""
    settings = get_settings()
    period = platform_budgets.month_period(now)
    doc = await _budgets(db).find_one({"_id": f"{ACCOUNT_SHADOW}:{period}"}) or {}
    return {
        "account": ACCOUNT_SHADOW,
        "period": period,
        "limit_usd": float(settings.shadow_monthly_usd),
        "reserved_usd": platform_budgets.from_micros(int(doc.get("reserved_micros") or 0)),
        "spent_usd": platform_budgets.from_micros(int(doc.get("spent_micros") or 0)),
        "max_calls": int(settings.shadow_monthly_call_cap),
        "calls_reserved": int(doc.get("calls_reserved") or 0),
        "calls": int(doc.get("calls") or 0),
    }
