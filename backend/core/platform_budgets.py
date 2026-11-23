"""`platform_budgets`: platform-funded spend accounts with an atomic
reservation before each call (docs/architecture/agent-collaboration-plan.md
§4.6, §10.3 G4, §15.2).

A2 implements account ``guardrail``; S0 adds ``shadow`` and Phase 3
``mandatory_review`` on the same documents.

Each budget is one document keyed by a deterministic ``_id`` (so an upsert
can never create a duplicate): ``guardrail:2026-11`` for the monthly budget
and ``guardrail:build:<build_id>`` for the per-build cap. Amounts are integer
micro-dollars so ``$inc`` is exact and the invariant

    reserved_micros + spent_micros <= limit_micros

holds exactly. A reservation is a single guarded ``find_one_and_update``
whose filter carries that invariant with the new amount added (``$expr``),
so concurrent reservations can never overshoot: on a replica set each
update is atomic per document, and the losing writer simply matches no
document.

Settlement moves the reserved amount to ``spent``. Callers reserve the worst
case (input cap and max output tokens, with a margin), so the actual cost
should never exceed the reservation; if it does, the true cost is still
recorded (overruns are never absorbed silently, §7) and counted in
``overrun_micros`` with a warning.

Optional call cap (S0, account ``shadow``, X5): with ``max_calls`` the
monthly document also carries ``calls_reserved`` and ``calls`` and the same
guarded update enforces ``calls_reserved + calls + n <= max_calls`` next to
the USD invariant. Settlement releases the reserved calls and counts the
calls actually made. Without ``max_calls`` nothing changes.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from core.models import utcnow

logger = logging.getLogger(__name__)

COLLECTION = "platform_budgets"
ACCOUNT_GUARDRAIL = "guardrail"
ACCOUNT_SHADOW = "shadow"

_MICROS = 1_000_000


def to_micros(usd: float) -> int:
    # Round up: a reservation must never be smaller than the true cost.
    micros = usd * _MICROS
    whole = int(micros)
    return whole if micros == whole else whole + 1


def from_micros(micros: int) -> float:
    return micros / _MICROS


@dataclass
class BudgetReservation:
    ok: bool
    account: str
    amount_micros: int = 0
    reason: str = "reserved"
    doc_ids: List[str] = field(default_factory=list)
    settled: bool = False
    # Call-capped accounts only: calls reserved, and the documents (the
    # monthly one) that count them.
    calls: int = 0
    calls_doc_ids: List[str] = field(default_factory=list)

    @property
    def amount_usd(self) -> float:
        return from_micros(self.amount_micros)

    def to_doc(self) -> Dict[str, Any]:
        return {
            "account": self.account, "amount_micros": int(self.amount_micros), "doc_ids": list(self.doc_ids),
            "calls": int(self.calls), "calls_doc_ids": list(self.calls_doc_ids),
        }

    @classmethod
    def from_doc(cls, doc: Dict[str, Any], *, settled: bool = False) -> "BudgetReservation":
        return cls(
            ok=True, account=str(doc.get("account") or ""), amount_micros=int(doc.get("amount_micros") or 0),
            doc_ids=list(doc.get("doc_ids") or []), settled=settled, calls=int(doc.get("calls") or 0),
            calls_doc_ids=list(doc.get("calls_doc_ids") or []),
        )


def month_period(now=None) -> str:
    now = now or utcnow()
    return f"{now.year:04d}-{now.month:02d}"


async def _ensure(coll, doc_id: str, *, account: str, period: str, limit_micros: int,
                  max_calls: Optional[int] = None) -> None:
    now = utcnow()
    on_insert: Dict[str, Any] = {
        "account": account,
        "period": period,
        "reserved_micros": 0,
        "spent_micros": 0,
        "created_at": now,
    }
    to_set: Dict[str, Any] = {"limit_micros": int(limit_micros), "updated_at": now}
    if max_calls is not None:
        on_insert.update(calls_reserved=0, calls=0)
        to_set["max_calls"] = int(max_calls)
    await coll.update_one({"_id": doc_id}, {"$setOnInsert": on_insert, "$set": to_set}, upsert=True)


async def _guarded_reserve(coll, doc_id: str, amount_micros: int, *, calls: int = 0,
                           max_calls: Optional[int] = None):
    usd_ok = {
        "$lte": [
            {"$add": ["$reserved_micros", "$spent_micros", int(amount_micros)]},
            "$limit_micros",
        ]
    }
    inc = {"reserved_micros": int(amount_micros)}
    expr: Dict[str, Any] = usd_ok
    if max_calls is not None:
        calls_ok = {
            "$lte": [
                {"$add": [{"$ifNull": ["$calls_reserved", 0]}, {"$ifNull": ["$calls", 0]}, int(calls)]},
                "$max_calls",
            ]
        }
        expr = {"$and": [usd_ok, calls_ok]}
        inc["calls_reserved"] = int(calls)
    return await coll.find_one_and_update({"_id": doc_id, "$expr": expr}, {"$inc": inc})


async def reserve(
    db,
    *,
    account: str,
    amount_usd: float,
    monthly_limit_usd: Optional[float],
    per_build_limit_usd: Optional[float] = None,
    build_id: Optional[str] = None,
    max_calls: Optional[int] = None,
    calls: int = 0,
    now=None,
) -> BudgetReservation:
    """Reserve ``amount_usd`` against the monthly budget and, when a build id
    and a per-build limit are given, against the per-build cap too. With
    ``max_calls``, ``calls`` provider calls are reserved against the monthly
    call cap in the same guarded update. An unset monthly limit means the
    account cannot spend at all (X12 interim default). Never raises for an
    exhausted budget; DB errors propagate so the caller can fail closed."""
    amount_micros = max(1, to_micros(max(0.0, float(amount_usd))))
    if monthly_limit_usd is None:
        return BudgetReservation(ok=False, account=account, amount_micros=amount_micros, reason="budget_unset")
    calls = max(0, int(calls)) if max_calls is not None else 0
    coll = db[COLLECTION]
    period = month_period(now)
    month_id = f"{account}:{period}"
    await _ensure(coll, month_id, account=account, period=period, limit_micros=to_micros(float(monthly_limit_usd)),
                  max_calls=max_calls)
    if await _guarded_reserve(coll, month_id, amount_micros, calls=calls, max_calls=max_calls) is None:
        reason = "budget_exhausted"
        if max_calls is not None:
            doc = await coll.find_one({"_id": month_id})
            if doc and (doc.get("calls_reserved") or 0) + (doc.get("calls") or 0) + calls > int(max_calls):
                reason = "call_cap_exhausted"
        return BudgetReservation(ok=False, account=account, amount_micros=amount_micros, reason=reason)
    reservation = BudgetReservation(
        ok=True, account=account, amount_micros=amount_micros, doc_ids=[month_id],
        calls=calls, calls_doc_ids=[month_id] if max_calls is not None else [],
    )

    if build_id and per_build_limit_usd is not None:
        build_doc_id = f"{account}:build:{build_id}"
        await _ensure(coll, build_doc_id, account=account, period=f"build:{build_id}",
                      limit_micros=to_micros(float(per_build_limit_usd)))
        if await _guarded_reserve(coll, build_doc_id, amount_micros) is None:
            await settle(db, reservation, actual_usd=0.0, actual_calls=0)
            return BudgetReservation(
                ok=False, account=account, amount_micros=amount_micros, reason="build_budget_exhausted",
            )
        reservation.doc_ids.append(build_doc_id)
    return reservation


def settlement_incs(
    reservation: BudgetReservation, *, actual_usd: float, actual_calls: Optional[int] = None,
) -> Dict[str, Dict[str, int]]:
    """The ``$inc`` to apply to each budget document to settle
    ``reservation``: reserved −est, spent +actual (and, on call-capped
    documents, calls_reserved −reserved, calls +actual). Shared by
    ``settle`` and the transactional T4 settlement."""
    actual = to_micros(max(0.0, float(actual_usd))) if actual_usd else 0
    inc = {"reserved_micros": -reservation.amount_micros, "spent_micros": actual}
    overrun = actual - reservation.amount_micros
    if overrun > 0:
        inc["overrun_micros"] = overrun
        logger.warning(
            "platform budget %s overran its reservation by %s micro-USD", reservation.account, overrun,
        )
    made = reservation.calls if actual_calls is None else max(0, int(actual_calls))
    out: Dict[str, Dict[str, int]] = {}
    for doc_id in reservation.doc_ids:
        doc_inc = dict(inc)
        if doc_id in reservation.calls_doc_ids:
            doc_inc["calls_reserved"] = -reservation.calls
            doc_inc["calls"] = made
            if made > reservation.calls:
                doc_inc["calls_overrun"] = made - reservation.calls
        out[doc_id] = doc_inc
    return out


async def settle(db, reservation: BudgetReservation, *, actual_usd: float,
                 actual_calls: Optional[int] = None) -> None:
    """Release the reservation and record the actual spend (and, for a
    call-capped account, the calls actually made; default: as reserved)."""
    if not reservation.ok or reservation.settled or not reservation.doc_ids:
        return
    coll = db[COLLECTION]
    for doc_id, inc in settlement_incs(reservation, actual_usd=actual_usd, actual_calls=actual_calls).items():
        await coll.update_one({"_id": doc_id}, {"$inc": inc})
    reservation.settled = True


async def release(db, reservation: BudgetReservation) -> None:
    await settle(db, reservation, actual_usd=0.0, actual_calls=0)
