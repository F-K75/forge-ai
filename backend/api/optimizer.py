from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from api.admin import admin_required
from core.models import User
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
