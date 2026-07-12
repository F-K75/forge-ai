from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.admin import admin_required
from core.ai_usage import get_spending_dashboard
from core.database import get_db
from core.llm.budget_manager import BudgetPeriod, BudgetScope, get_budget_manager
from core.models import User

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


class SetBudgetLimitRequest(BaseModel):
    soft_limit_usd: Optional[float] = None
    hard_limit_usd: Optional[float] = None
    period: BudgetPeriod = BudgetPeriod.MONTHLY


@router.get("")
async def list_budget_limits(admin: User = Depends(admin_required)) -> Dict[str, Any]:
    return {"limits": await get_budget_manager().list_limits()}


@router.get("/{scope}/{scope_id}")
async def get_budget_limit(scope: BudgetScope, scope_id: str, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    manager = get_budget_manager()
    limit = await manager.get_limit(scope, scope_id)
    period = BudgetPeriod(limit["period"]) if limit else BudgetPeriod.MONTHLY
    spend = await manager.get_spend(scope, scope_id, period)
    return {"scope": scope.value, "scope_id": scope_id, "limit": limit, "current_spend_usd": spend}


@router.put("/{scope}/{scope_id}")
async def set_budget_limit(
    scope: BudgetScope, scope_id: str, payload: SetBudgetLimitRequest, admin: User = Depends(admin_required)
) -> Dict[str, Any]:
    try:
        updated = await get_budget_manager().set_limit(
            scope,
            scope_id,
            soft_limit_usd=payload.soft_limit_usd,
            hard_limit_usd=payload.hard_limit_usd,
            period=payload.period,
            updated_by=admin.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"configured": True, "limit": updated}


@router.delete("/{scope}/{scope_id}")
async def delete_budget_limit(scope: BudgetScope, scope_id: str, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    deleted = await get_budget_manager().delete_limit(scope, scope_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="No budget limit configured for this scope")
    return {"deleted": True}


@router.get("/analytics/spending")
async def spending_dashboard(days: int = 30, limit: int = 100, admin: User = Depends(admin_required)) -> Dict[str, Any]:
    """Per-user spend over the trailing `days`. See /api/analytics/costs for
    the provider/agent/project breakdown."""
    return {"days": days, "users": await get_spending_dashboard(days=days, limit=limit)}
