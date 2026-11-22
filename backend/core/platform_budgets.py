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
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import List, Optional

from core.models import utcnow

logger = logging.getLogger(__name__)

COLLECTION = "platform_budgets"
ACCOUNT_GUARDRAIL = "guardrail"

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

    @property
    def amount_usd(self) -> float:
        return from_micros(self.amount_micros)


def month_period(now=None) -> str:
    now = now or utcnow()
    return f"{now.year:04d}-{now.month:02d}"


async def _ensure(coll, doc_id: str, *, account: str, period: str, limit_micros: int) -> None:
    now = utcnow()
    await coll.update_one(
        {"_id": doc_id},
        {
            "$setOnInsert": {
                "account": account,
                "period": period,
                "reserved_micros": 0,
                "spent_micros": 0,
                "created_at": now,
            },
            "$set": {"limit_micros": int(limit_micros), "updated_at": now},
        },
        upsert=True,
    )


async def _guarded_reserve(coll, doc_id: str, amount_micros: int):
    return await coll.find_one_and_update(
        {
            "_id": doc_id,
            "$expr": {
                "$lte": [
                    {"$add": ["$reserved_micros", "$spent_micros", int(amount_micros)]},
                    "$limit_micros",
                ]
            },
        },
        {"$inc": {"reserved_micros": int(amount_micros)}},
    )


async def reserve(
    db,
    *,
    account: str,
    amount_usd: float,
    monthly_limit_usd: Optional[float],
    per_build_limit_usd: Optional[float] = None,
    build_id: Optional[str] = None,
    now=None,
) -> BudgetReservation:
    """Reserve ``amount_usd`` against the monthly budget and, when a build id
    and a per-build limit are given, against the per-build cap too. An unset
    monthly limit means the account cannot spend at all (X12 interim
    default). Never raises for an exhausted budget; DB errors propagate so
    the caller can fail closed."""
    amount_micros = max(1, to_micros(max(0.0, float(amount_usd))))
    if monthly_limit_usd is None:
        return BudgetReservation(ok=False, account=account, amount_micros=amount_micros, reason="budget_unset")
    coll = db[COLLECTION]
    period = month_period(now)
    month_id = f"{account}:{period}"
    await _ensure(coll, month_id, account=account, period=period, limit_micros=to_micros(float(monthly_limit_usd)))
    if await _guarded_reserve(coll, month_id, amount_micros) is None:
        return BudgetReservation(ok=False, account=account, amount_micros=amount_micros, reason="budget_exhausted")
    reservation = BudgetReservation(ok=True, account=account, amount_micros=amount_micros, doc_ids=[month_id])

    if build_id and per_build_limit_usd is not None:
        build_doc_id = f"{account}:build:{build_id}"
        await _ensure(coll, build_doc_id, account=account, period=f"build:{build_id}",
                      limit_micros=to_micros(float(per_build_limit_usd)))
        if await _guarded_reserve(coll, build_doc_id, amount_micros) is None:
            await settle(db, reservation, actual_usd=0.0)
            return BudgetReservation(
                ok=False, account=account, amount_micros=amount_micros, reason="build_budget_exhausted",
            )
        reservation.doc_ids.append(build_doc_id)
    return reservation


async def settle(db, reservation: BudgetReservation, *, actual_usd: float) -> None:
    """Release the reservation and record the actual spend."""
    if not reservation.ok or reservation.settled or not reservation.doc_ids:
        return
    actual = to_micros(max(0.0, float(actual_usd))) if actual_usd else 0
    inc = {"reserved_micros": -reservation.amount_micros, "spent_micros": actual}
    overrun = actual - reservation.amount_micros
    if overrun > 0:
        inc["overrun_micros"] = overrun
        logger.warning(
            "platform budget %s overran its reservation by %s micro-USD", reservation.account, overrun,
        )
    coll = db[COLLECTION]
    for doc_id in reservation.doc_ids:
        await coll.update_one({"_id": doc_id}, {"$inc": dict(inc)})
    reservation.settled = True


async def release(db, reservation: BudgetReservation) -> None:
    await settle(db, reservation, actual_usd=0.0)
