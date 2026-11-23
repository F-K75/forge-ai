"""The credit ledger's multi-document money moves
(docs/architecture/agent-collaboration-plan.md §7, §10.2, §13.2).

| Txn | Operation | Documents |
|---|---|---|
| T1 | Admission and reservation | ``credit_transactions`` (insert ``reserve``), ``users`` (guarded ``$inc -R`` with ``credits >= R``, or the free-grant claim with ``free_build_id``), ``usage_counters`` (daily build count, guarded by the plan limit), ``builds`` (insert with ``funding.state = RESERVED``) |
| T2 | Settlement | ``credit_transactions`` (insert ``settle``), ``users`` (``$inc +refund``), ``builds`` (``$set settlement``, ``funding.state = SETTLED``, filter ``settlement: null``) |
| T3 | Release (dispatch failure, orphan, never dispatched) | as T2 with ``consumed = 0``, kind ``release``; free-grant rollback (``users`` filter ``free_build_id = bid``) |

Every callback inserts its ``credit_transactions(build_id, kind)`` row first;
the unique index makes a repeated application abort as ``AlreadyApplied``.
The ``builds`` filter ``settlement: null`` makes T2 and T3 mutually
exclusive, so a build settles exactly once (rule 4, TX-2, TX-4).
``credit_transactions`` is written nowhere else.

Funding sources (§7.2): ``user_credits`` reserves ``max_build_cost`` and is
charged per completed operation; ``byok`` reserves and is charged 0 (C4);
``free_grant`` reserves 0 and counts its operations in credit-equivalents
against the free-build allowance, ``max_build_cost``.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional

from pymongo.errors import DuplicateKeyError

from core.db_tx import AlreadyApplied, run_financial_txn
from core.models import utcnow
from core.pricing import Quote

logger = logging.getLogger(__name__)

LEDGER_SCHEMA_VERSION = 2
USAGE_COUNTER_TTL = timedelta(days=7)


class FundingSource(str, Enum):
    USER_CREDITS = "user_credits"
    BYOK = "byok"
    FREE_GRANT = "free_grant"


class FundingState(str, Enum):
    RESERVED = "reserved"
    SETTLED = "settled"
    RELEASED = "released"


class CreditKind(str, Enum):
    RESERVE = "reserve"
    SETTLE = "settle"
    RELEASE = "release"


class InsufficientCredits(Exception):
    def __init__(self, required: int):
        self.required = required
        super().__init__(f"insufficient credits: {required} required")


class FreeGrantTaken(Exception):
    """The free-build grant was claimed concurrently; admit as user_credits."""


class DailyBuildLimitReached(Exception):
    def __init__(self, limit: int):
        self.limit = limit
        super().__init__(f"daily build limit of {limit} reached")


def reserved_for(source: FundingSource, quote: Quote) -> int:
    return quote.max_cost if FundingSource(source) == FundingSource.USER_CREDITS else 0


def allowance_for(source: FundingSource, quote: Quote) -> int:
    """The credit-equivalent cap operations are authorized against: the
    reservation, the free-build allowance, or 0 for BYOK (price 0)."""
    source = FundingSource(source)
    if source == FundingSource.BYOK:
        return 0
    return quote.max_cost


def funding_doc(source: FundingSource, quote: Quote) -> Dict[str, Any]:
    source = FundingSource(source)
    return {
        "source": source.value,
        "state": FundingState.RESERVED.value,
        "reserved_credits": reserved_for(source, quote),
        "max_cost": quote.max_cost,
        "allowance": allowance_for(source, quote),
        "breakdown": quote.breakdown_lines(),
        "pricing_version": quote.pricing_version,
        "quote": quote.to_doc(),
    }


def day_key(now: Optional[datetime] = None) -> str:
    return (now or utcnow()).strftime("%Y-%m-%d")


def _txn_row(build_id: str, user_id: str, kind: CreditKind, amount: int, source: str, **extra) -> Dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "build_id": build_id,
        "user_id": user_id,
        "kind": CreditKind(kind).value,
        "amount": int(amount),
        "funding_source": source,
        "created_at": utcnow(),
        **extra,
    }


# --------------------------------------------------------------------------- #
# T1: admission
# --------------------------------------------------------------------------- #


@dataclass
class Admission:
    build_id: str
    source: FundingSource
    reserved: int
    daily_builds: Optional[int] = None


async def _count_daily_build(db, session, *, user_id: str, limit: Optional[int], now: datetime) -> None:
    """Guarded daily build counter (U4, QT-5), inside T1. With a limit, the
    filter only matches below it; at the limit the upsert collides with the
    unique ``(scope, scope_id, day)`` key and the admission aborts."""
    query: Dict[str, Any] = {"scope": "user", "scope_id": user_id, "day": day_key(now)}
    if limit is not None:
        query["builds"] = {"$lt": int(limit)}
    try:
        await db.usage_counters.update_one(
            query,
            {"$inc": {"builds": 1}, "$setOnInsert": {"created_at": now, "expires_at": now + USAGE_COUNTER_TTL}},
            upsert=True,
            session=session,
        )
    except DuplicateKeyError as exc:
        raise DailyBuildLimitReached(int(limit or 0)) from exc


async def admit_build(
    db,
    *,
    build_doc: Dict[str, Any],
    source: FundingSource,
    quote: Quote,
    daily_build_limit: Optional[int] = None,
    now: Optional[datetime] = None,
) -> Admission:
    """T1. ``build_doc`` is the complete build to insert; its ``funding``
    is set here. All four documents are written, or none (TX-1)."""
    source = FundingSource(source)
    now = now or utcnow()
    build_id = build_doc["id"]
    user_id = build_doc["user_id"]
    reserved = reserved_for(source, quote)
    doc = dict(build_doc)
    doc["schema_version"] = LEDGER_SCHEMA_VERSION
    doc["funding"] = funding_doc(source, quote)
    doc["settlement"] = None
    doc["ledger"] = []
    doc["attempt_token"] = None
    doc["lease_expires_at"] = None
    doc["recovery_enqueues"] = 0

    async def txn(session):
        await db.credit_transactions.insert_one(
            _txn_row(build_id, user_id, CreditKind.RESERVE, reserved, source.value,
                     pricing_version=quote.pricing_version),
            session=session,
        )
        if source == FundingSource.USER_CREDITS:
            res = await db.users.update_one(
                {"id": user_id, "credits": {"$gte": reserved}},
                {"$inc": {"credits": -reserved}},
                session=session,
            )
            if not res.matched_count:
                raise InsufficientCredits(reserved)
        elif source == FundingSource.FREE_GRANT:
            res = await db.users.update_one(
                {"id": user_id, "free_build_used": {"$ne": True}},
                {"$set": {"free_build_used": True, "free_build_id": build_id}},
                session=session,
            )
            if not res.matched_count:
                raise FreeGrantTaken()
        await _count_daily_build(db, session, user_id=user_id, limit=daily_build_limit, now=now)
        await db.builds.insert_one(doc, session=session)
        return Admission(build_id=build_id, source=source, reserved=reserved)

    return await run_financial_txn(db, txn, label=f"reserve:{build_id}")


# --------------------------------------------------------------------------- #
# T2 / T3: settlement and release
# --------------------------------------------------------------------------- #


@dataclass
class Settlement:
    build_id: str
    kind: CreditKind
    applied: bool
    consumed: int = 0
    refunded: int = 0
    anomaly: Optional[str] = None
    summary: Dict[str, Any] = field(default_factory=dict)


def consumed_credits(ledger: Optional[List[Dict[str, Any]]]) -> int:
    """Σ credits of COMPLETED operations (the only ones that carry any)."""
    return sum(int(op.get("credits") or 0) for op in (ledger or []) if op.get("status") == "completed")


async def provider_cost_summary(db, build_id: str) -> Dict[str, Dict[str, float]]:
    """``account -> {attempts, tokens, cost_usd}`` from ``ai_usage``. Read
    outside the transaction; it moves no money. Best-effort."""
    try:
        cursor = db.ai_usage.aggregate([
            {"$match": {"build_id": build_id}},
            {"$group": {
                "_id": "$account",
                "attempts": {"$sum": 1},
                "tokens": {"$sum": "$total_tokens"},
                "cost_usd": {"$sum": "$cost"},
            }},
        ])
        rows = await cursor.to_list(None)
    except Exception:
        logger.warning("provider_cost_summary failed for build %s", build_id, exc_info=True)
        return {}
    return {
        str(r.get("_id") or "unattributed"): {
            "attempts": int(r.get("attempts") or 0),
            "tokens": int(r.get("tokens") or 0),
            "cost_usd": round(float(r.get("cost_usd") or 0.0), 9),
        }
        for r in rows
    }


async def settle_build(
    db,
    build_id: str,
    *,
    kind: CreditKind = CreditKind.SETTLE,
    fence_token: Optional[str] = None,
    terminal_update: Optional[Dict[str, Any]] = None,
    reason: Optional[str] = None,
) -> Settlement:
    """T2 (``settle``) or T3 (``release``: consumed 0, full refund,
    free-grant rollback). Exactly once per build: a second call, from any
    worker, sweeper or retried request, returns ``applied=False`` and moves
    nothing.

    ``fence_token``: the ``attempt_token`` the caller fenced the build with;
    the settlement only applies while it still holds. ``terminal_update``:
    extra ``$set``/``$push`` for the build in the same write (T3 marks the
    build failed)."""
    kind = CreditKind(kind)
    summary = await provider_cost_summary(db, build_id)
    target = FundingState.SETTLED if kind == CreditKind.SETTLE else FundingState.RELEASED
    outcome: Dict[str, Any] = {}

    async def txn(session):
        build = await db.builds.find_one({"id": build_id}, session=session)
        if build is None:
            raise AlreadyApplied(f"{kind.value}:{build_id}", "build not found")
        if build.get("settlement"):
            raise AlreadyApplied(f"{kind.value}:{build_id}", "already settled")
        funding = build.get("funding") or {}
        source = FundingSource(funding.get("source") or FundingSource.USER_CREDITS.value)
        reserved = int(funding.get("reserved_credits") or 0)
        consumed = 0 if kind == CreditKind.RELEASE else consumed_credits(build.get("ledger"))
        cap = reserved if source == FundingSource.USER_CREDITS else int(funding.get("allowance") or 0)
        anomaly = None
        if consumed < 0 or consumed > cap or (source == FundingSource.BYOK and consumed):
            # Impossible by construction (EX-1). Never refund a negative or
            # charge past the reservation: refund nothing and flag it.
            anomaly = f"consumed {consumed} outside [0, {cap}] for {source.value}"
            logger.critical("Build %s settlement anomaly: %s", build_id, anomaly)
            refund = 0
        else:
            refund = reserved - consumed if source == FundingSource.USER_CREDITS else 0
        user_id = build["user_id"]
        await db.credit_transactions.insert_one(
            _txn_row(build_id, user_id, kind, refund, source.value, consumed=consumed, reason=reason),
            session=session,
        )
        if refund > 0:
            await db.users.update_one({"id": user_id}, {"$inc": {"credits": refund}}, session=session)
        if kind == CreditKind.RELEASE and source == FundingSource.FREE_GRANT:
            await db.users.update_one(
                {"id": user_id, "free_build_id": build_id},
                {"$set": {"free_build_used": False}, "$unset": {"free_build_id": ""}},
                session=session,
            )
        settlement = {
            "kind": kind.value,
            "consumed": consumed,
            "refunded": refund,
            "settled_at": utcnow(),
            "provider_cost_summary": summary,
            "anomaly": anomaly,
            "reason": reason,
        }
        update: Dict[str, Any] = {"$set": {"settlement": settlement, "funding.state": target.value}}
        for op, fields in (terminal_update or {}).items():
            update.setdefault(op, {}).update(fields)
        query: Dict[str, Any] = {"id": build_id, "settlement": None}
        if fence_token is not None:
            query["attempt_token"] = fence_token
        res = await db.builds.update_one(query, update, session=session)
        if not res.matched_count:
            raise AlreadyApplied(f"{kind.value}:{build_id}", "settled concurrently or fenced off")
        outcome.update(consumed=consumed, refunded=refund, anomaly=anomaly)
        return True

    try:
        await run_financial_txn(db, txn, label=f"{kind.value}:{build_id}")
    except AlreadyApplied:
        return Settlement(build_id=build_id, kind=kind, applied=False, summary=summary)
    return Settlement(
        build_id=build_id, kind=kind, applied=True, consumed=outcome["consumed"],
        refunded=outcome["refunded"], anomaly=outcome["anomaly"], summary=summary,
    )


async def release_build(db, build_id: str, *, reason: str, fence_token: Optional[str] = None,
                        terminal_update: Optional[Dict[str, Any]] = None) -> Settlement:
    """T3: nothing was consumed; refund the full reservation."""
    return await settle_build(db, build_id, kind=CreditKind.RELEASE, fence_token=fence_token,
                              terminal_update=terminal_update, reason=reason)
