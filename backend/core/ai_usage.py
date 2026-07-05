"""LLM cost tracking and budget management for AI pipeline."""

import uuid
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

from core.database import get_db

# cost per 1K tokens, in USD.
# NOTE: OpenRouter-namespaced model IDs (e.g. "anthropic/claude-opus-4.8")
# are priced here at the same rate as their underlying Anthropic model,
# using standard Anthropic list-pricing tiers as the basis. OpenRouter may
# add its own margin on top -- verify against https://openrouter.ai/models
# before relying on this for real billing/invoicing.
MODEL_COSTS = {
    "claude-sonnet-4-6": {"input": 0.003, "output": 0.015, "provider": "anthropic"},
    "claude-opus-3": {"input": 0.015, "output": 0.075, "provider": "anthropic"},
    "gpt-4-turbo": {"input": 0.01, "output": 0.03, "provider": "openai"},
    "anthropic/claude-opus-4.8": {"input": 0.015, "output": 0.075, "provider": "openrouter"},
    "anthropic/claude-sonnet-5": {"input": 0.003, "output": 0.015, "provider": "openrouter"},
    "anthropic/claude-haiku-4.5": {"input": 0.0008, "output": 0.004, "provider": "openrouter"},
}
DEFAULT_MODEL = "claude-sonnet-4-6"

# Anthropic prompt-cache reads are billed at ~10% of the input rate
CACHED_INPUT_DISCOUNT = 0.1

DEFAULT_DAILY_TOKEN_BUDGETS = {
    "free": 10_000,
    "standard": 100_000,
    "pro": 500_000,
    "enterprise": 2_000_000,
}


class BudgetExceeded(Exception):
    def __init__(self, message: str, used: int, limit: int):
        self.message = message
        self.used = used
        self.limit = limit
        super().__init__(message)


def get_model_provider(model: str) -> str:
    return MODEL_COSTS.get(model, MODEL_COSTS[DEFAULT_MODEL])["provider"]


def calculate_cost(
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cached_tokens: int = 0,
) -> float:
    """Cost in USD for one LLM call. `cached_tokens` is a subset of prompt_tokens billed at a discount."""
    costs = MODEL_COSTS.get(model, MODEL_COSTS[DEFAULT_MODEL])
    cached_tokens = min(cached_tokens, prompt_tokens)
    billable_prompt = prompt_tokens - cached_tokens
    cost = (
        billable_prompt * costs["input"]
        + cached_tokens * costs["input"] * CACHED_INPUT_DISCOUNT
        + completion_tokens * costs["output"]
    ) / 1000
    return cost


async def _effective_daily_limit(db, user_id: str, org_id: Optional[str]) -> int:
    plan = "free"
    if org_id:
        org = await db.organizations.find_one({"id": org_id}, {"_id": 0, "plan": 1})
        if org and org.get("plan"):
            plan = org["plan"]
    else:
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "plan": 1})
        if user and user.get("plan"):
            plan = user["plan"]
    plan = getattr(plan, "value", plan)
    return DEFAULT_DAILY_TOKEN_BUDGETS.get(plan, DEFAULT_DAILY_TOKEN_BUDGETS["free"])


async def get_user_budget(user_id: str, org_id: Optional[str] = None) -> Dict[str, Any]:
    """Aggregate today's (UTC) token usage for a user or organization against its plan's daily limit."""
    db = await get_db()
    limit = await _effective_daily_limit(db, user_id, org_id)
    day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    match: Dict[str, Any] = {"created_at": {"$gte": day_start}}
    match["org_id" if org_id else "user_id"] = org_id if org_id else user_id

    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": None,
                "prompt_tokens": {"$sum": "$prompt_tokens"},
                "completion_tokens": {"$sum": "$completion_tokens"},
                "cost": {"$sum": "$cost"},
            }
        },
    ]
    agg = [doc async for doc in db.ai_usage.aggregate(pipeline)]
    prompt_tokens = agg[0]["prompt_tokens"] if agg else 0
    completion_tokens = agg[0]["completion_tokens"] if agg else 0
    cost = agg[0]["cost"] if agg else 0.0
    used = prompt_tokens + completion_tokens

    return {
        "used": used,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost_usd": round(cost, 6),
        "limit": limit,
        "remaining": max(0, limit - used),
    }


async def check_budget(user_id: str, estimated_tokens: int = 0, org_id: Optional[str] = None) -> None:
    """Raise BudgetExceeded if the next call would push usage past the daily limit. Fail-closed."""
    budget = await get_user_budget(user_id, org_id=org_id)
    if budget["used"] + estimated_tokens > budget["limit"]:
        raise BudgetExceeded(
            f"Daily token budget exceeded ({budget['used']}/{budget['limit']} tokens used)",
            used=budget["used"],
            limit=budget["limit"],
        )


async def track_usage(
    user_id: str,
    build_id: Optional[str],
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost_usd: float,
    org_id: Optional[str] = None,
    project_id: Optional[str] = None,
    cached_tokens: int = 0,
    provider: Optional[str] = None,
    agent: Optional[str] = None,
) -> Dict[str, Any]:
    """Persist a single LLM call's usage record. Called after every completed LLM call, win or lose."""
    db = await get_db()
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "org_id": org_id,
        "project_id": project_id,
        "build_id": build_id,
        "agent": agent,
        "model": model,
        "provider": provider or get_model_provider(model),
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "cached_tokens": cached_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
        "cost": round(cost_usd, 6),
        "created_at": datetime.utcnow(),
    }
    await db.ai_usage.insert_one(record)
    budget = await get_user_budget(user_id, org_id=org_id)
    record["budget_remaining"] = budget["remaining"]
    return record


async def get_spending_dashboard(days: int = 30, limit: int = 100) -> List[Dict[str, Any]]:
    """Admin-facing per-user spending summary over the trailing `days`."""
    db = await get_db()
    since = datetime.utcnow() - timedelta(days=days)
    pipeline = [
        {"$match": {"created_at": {"$gte": since}}},
        {
            "$group": {
                "_id": "$user_id",
                "prompt_tokens": {"$sum": "$prompt_tokens"},
                "completion_tokens": {"$sum": "$completion_tokens"},
                "total_tokens": {"$sum": "$total_tokens"},
                "cost_usd": {"$sum": "$cost"},
                "requests": {"$sum": 1},
            }
        },
        {"$sort": {"cost_usd": -1}},
        {"$limit": limit},
    ]
    results = []
    async for doc in db.ai_usage.aggregate(pipeline):
        results.append(
            {
                "user_id": doc["_id"],
                "prompt_tokens": doc.get("prompt_tokens", 0),
                "completion_tokens": doc.get("completion_tokens", 0),
                "total_tokens": doc.get("total_tokens", 0),
                "cost_usd": round(doc.get("cost_usd", 0.0), 6),
                "requests": doc.get("requests", 0),
            }
        )
    return results
