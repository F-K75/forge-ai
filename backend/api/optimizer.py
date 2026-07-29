from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.admin import admin_required
from core.models import User, utcnow
from optimizer.service import get_optimizer

router = APIRouter(prefix="/api/optimizer", tags=["optimizer"])


class EstimateTokensRequest(BaseModel):
    messages: List[Dict[str, Any]]
    provider: str = "anthropic"
    model: str = "claude-sonnet-4-6"
    max_output_tokens: Optional[int] = None


class EstimateCostRequest(EstimateTokensRequest):
    monthly_request_volume: int = 10_000


@router.post("/estimate-tokens")
async def estimate_tokens_endpoint(request: EstimateTokensRequest, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    optimizer = get_optimizer()
    estimate = optimizer.estimate_tokens(
        request.messages, provider=request.provider, model=request.model, max_output_tokens=request.max_output_tokens
    )
    return estimate.model_dump()


@router.post("/estimate-cost")
async def estimate_cost_endpoint(request: EstimateCostRequest, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    optimizer = get_optimizer()
    token_estimate = optimizer.estimate_tokens(
        request.messages, provider=request.provider, model=request.model, max_output_tokens=request.max_output_tokens
    )
    from optimizer.cost_estimator import estimate_request_cost

    cost = estimate_request_cost(token_estimate, monthly_request_volume=request.monthly_request_volume)
    return cost.model_dump()


@router.get("/pricing")
async def pricing_table(admin: User = Depends(admin_required)) -> Dict[str, Any]:
    return get_optimizer().get_pricing_table()


@router.get("/metrics")
async def optimization_metrics(admin: User = Depends(admin_required)) -> Dict[str, Any]:
    return get_optimizer().get_optimization_metrics().model_dump()


@router.get("/cache-stats")
async def cache_statistics(admin: User = Depends(admin_required)) -> Dict[str, Any]:
    return get_optimizer().get_cache_statistics().model_dump()


@router.get("/cost-breakdown")
async def cost_breakdown(days: int = 30, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    """Cost/token totals grouped by provider, agent, and project over the
    trailing `days`, plus cache/optimization savings for the same window.
    Complements /cache-stats and /metrics (cumulative, in-process) with a
    persisted, time-boxed view sourced from `ai_usage`."""
    from datetime import datetime, timedelta

    from core.database import get_db

    db = await get_db()
    since = utcnow() - timedelta(days=days)

    async def _group_by(field: str) -> List[Dict[str, Any]]:
        pipeline = [
            {"$match": {"created_at": {"$gte": since}}},
            {
                "$group": {
                    "_id": f"${field}",
                    "prompt_tokens": {"$sum": "$prompt_tokens"},
                    "completion_tokens": {"$sum": "$completion_tokens"},
                    "cached_tokens": {"$sum": "$cached_tokens"},
                    "cost_usd": {"$sum": "$cost"},
                    "requests": {"$sum": 1},
                }
            },
            {"$sort": {"cost_usd": -1}},
        ]
        results = []
        async for doc in db.ai_usage.aggregate(pipeline):
            results.append(
                {
                    field: doc["_id"],
                    "prompt_tokens": doc.get("prompt_tokens", 0),
                    "completion_tokens": doc.get("completion_tokens", 0),
                    "cached_tokens": doc.get("cached_tokens", 0),
                    "cost_usd": round(doc.get("cost_usd", 0.0), 6),
                    "requests": doc.get("requests", 0),
                }
            )
        return results

    optimizer = get_optimizer()
    cache_stats = optimizer.get_cache_statistics()
    opt_metrics = optimizer.get_optimization_metrics()

    return {
        "days": days,
        "by_provider": await _group_by("provider"),
        "by_agent": await _group_by("agent"),
        "by_project": await _group_by("project_id"),
        "cache_savings": cache_stats.model_dump(),
        "optimization_savings": opt_metrics.model_dump(),
    }
