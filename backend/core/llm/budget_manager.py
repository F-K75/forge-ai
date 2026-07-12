from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from core.database import get_db
from core.llm.provider import ProviderError
from core.metrics import llm_budget_downgrades_total, llm_budget_rejections_total

logger = logging.getLogger(__name__)


class BudgetScope(str, Enum):
    ORG = "org"
    PROJECT = "project"
    AGENT = "agent"


class BudgetPeriod(str, Enum):
    DAILY = "daily"
    MONTHLY = "monthly"


DEFAULT_PERIOD = BudgetPeriod.MONTHLY

_SCOPE_FIELD = {
    BudgetScope.ORG: "org_id",
    BudgetScope.PROJECT: "project_id",
    BudgetScope.AGENT: "agent",
}


class BudgetLimitExceeded(ProviderError):
    """Raised when a hard org/project/agent spend limit would be crossed.

    A `ProviderError` subtype so the existing retry/circuit-breaker exception
    handling in `LLMRouter` needs no changes -- same shape as
    `PolicyViolation` (core.llm.policy) and `BudgetExceeded` (core.ai_usage,
    which enforces the per-user *daily token* budget; this enforces
    org/project/agent *dollar* budgets on top of it).
    """

    def __init__(self, message: str, scope: str, scope_id: str, used_usd: float, limit_usd: float):
        self.scope = scope
        self.scope_id = scope_id
        self.used_usd = used_usd
        self.limit_usd = limit_usd
        super().__init__(message)


@dataclass
class BudgetCheckResult:
    downgraded: bool = False
    warnings: List[str] = field(default_factory=list)


def _period_start(period: BudgetPeriod) -> datetime:
    now = datetime.utcnow()
    if period == BudgetPeriod.DAILY:
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _cheapest_first(model_chain: List[str]) -> List[str]:
    from core.ai_usage import MODEL_COSTS, DEFAULT_MODEL

    def cost_key(model: str) -> float:
        costs = MODEL_COSTS.get(model, MODEL_COSTS[DEFAULT_MODEL])
        return costs["input"] + costs["output"]

    return sorted(model_chain, key=cost_key)


class BudgetManager:
    """Enforces spend limits (USD) at the org/project/agent scope, layered on
    top of the per-user daily token budget already enforced by
    `core.ai_usage.check_budget`. Mirrors `PolicyEngine`/`LLMConfigLoader`:
    limits are stored per-scope in Mongo (`budget_limits`), spend is derived
    from the existing `ai_usage` collection -- no separate ledger to keep in
    sync.

    Each limit has an optional hard ceiling (rejects the request) and an
    optional soft ceiling (reorders the caller's model fallback chain
    cheapest-first instead of rejecting, so the request still succeeds --
    just on a cheaper model).

    Limits are read from an in-memory cache, not Mongo, on the request path
    -- mirrors `LLMConfigLoader._org_policy_overrides`, for the same reason:
    every gateway request would otherwise pay a DB round-trip even when no
    budgets are configured at all (the common case), which conflicts with
    the engine's own <50ms optimization-overhead goal. The cache is
    populated by `refresh_limits()` at startup and kept in sync by
    `set_limit`/`delete_limit`.
    """

    def __init__(self) -> None:
        self._limits: Dict[Tuple[str, str], Dict[str, Any]] = {}

    async def refresh_limits(self) -> None:
        db = await get_db()
        limits: Dict[Tuple[str, str], Dict[str, Any]] = {}
        async for doc in db.budget_limits.find({}, {"_id": 0}):
            limits[(doc["scope"], doc["scope_id"])] = doc
        self._limits = limits

    async def get_limit(self, scope: BudgetScope, scope_id: str) -> Optional[Dict[str, Any]]:
        return self._limits.get((scope.value, scope_id))

    async def list_limits(self) -> List[Dict[str, Any]]:
        return list(self._limits.values())

    async def set_limit(
        self,
        scope: BudgetScope,
        scope_id: str,
        *,
        soft_limit_usd: Optional[float],
        hard_limit_usd: Optional[float],
        period: BudgetPeriod = DEFAULT_PERIOD,
        updated_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        if soft_limit_usd is not None and hard_limit_usd is not None and soft_limit_usd > hard_limit_usd:
            raise ValueError("soft_limit_usd must be <= hard_limit_usd")

        db = await get_db()
        doc = {
            "scope": scope.value,
            "scope_id": scope_id,
            "soft_limit_usd": soft_limit_usd,
            "hard_limit_usd": hard_limit_usd,
            "period": period.value,
            "updated_by": updated_by,
            "updated_at": datetime.utcnow(),
        }
        await db.budget_limits.update_one(
            {"scope": scope.value, "scope_id": scope_id},
            {"$set": doc},
            upsert=True,
        )
        self._limits[(scope.value, scope_id)] = doc
        return doc

    async def delete_limit(self, scope: BudgetScope, scope_id: str) -> bool:
        db = await get_db()
        res = await db.budget_limits.delete_one({"scope": scope.value, "scope_id": scope_id})
        self._limits.pop((scope.value, scope_id), None)
        return res.deleted_count > 0

    async def get_spend(self, scope: BudgetScope, scope_id: str, period: BudgetPeriod) -> float:
        db = await get_db()
        since = _period_start(period)
        pipeline = [
            {"$match": {_SCOPE_FIELD[scope]: scope_id, "created_at": {"$gte": since}}},
            {"$group": {"_id": None, "cost": {"$sum": "$cost"}}},
        ]
        agg = [doc async for doc in db.ai_usage.aggregate(pipeline)]
        return round(agg[0]["cost"], 6) if agg else 0.0

    async def enforce(
        self,
        *,
        org_id: Optional[str],
        project_id: Optional[str],
        agent_name: Optional[str],
        estimated_cost_usd: float,
        model_chain: List[str],
    ) -> Tuple[List[str], BudgetCheckResult]:
        """Check org/project/agent spend against configured limits.

        Returns a possibly-reordered `model_chain` (cheapest-first if a soft
        limit was crossed) and a `BudgetCheckResult` describing what
        happened. Raises `BudgetLimitExceeded` if a hard limit would be
        crossed. Scopes with no configured limit are skipped entirely (no
        limit set == unlimited), matching `PolicyEngine.enforce`'s
        opt-in behavior.
        """
        result = BudgetCheckResult()
        scopes: List[Tuple[BudgetScope, Optional[str]]] = [
            (BudgetScope.ORG, org_id),
            (BudgetScope.PROJECT, project_id),
            (BudgetScope.AGENT, agent_name),
        ]

        for scope, scope_id in scopes:
            if not scope_id:
                continue
            limit = await self.get_limit(scope, scope_id)
            if not limit:
                continue

            period = BudgetPeriod(limit.get("period", DEFAULT_PERIOD.value))
            spend = await self.get_spend(scope, scope_id, period)
            projected = spend + estimated_cost_usd

            hard_limit = limit.get("hard_limit_usd")
            if hard_limit is not None and projected > hard_limit:
                llm_budget_rejections_total.labels(scope=scope.value).inc()
                raise BudgetLimitExceeded(
                    f"{scope.value} '{scope_id}' {period.value} spend limit exceeded "
                    f"(${projected:.4f} would be used, limit ${hard_limit:.4f})",
                    scope=scope.value,
                    scope_id=scope_id,
                    used_usd=spend,
                    limit_usd=hard_limit,
                )

            soft_limit = limit.get("soft_limit_usd")
            if soft_limit is not None and projected > soft_limit and len(model_chain) > 1:
                result.warnings.append(
                    f"{scope.value} '{scope_id}' {period.value} spend ${projected:.4f} "
                    f"crossed soft limit ${soft_limit:.4f}; downgrading to cheapest available model"
                )
                model_chain = _cheapest_first(model_chain)
                result.downgraded = True
                llm_budget_downgrades_total.labels(scope=scope.value).inc()

        return model_chain, result


_budget_manager: Optional[BudgetManager] = None


def get_budget_manager() -> BudgetManager:
    global _budget_manager
    if _budget_manager is None:
        _budget_manager = BudgetManager()
    return _budget_manager
