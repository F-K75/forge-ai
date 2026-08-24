"""API surface for the pre-coding Planning phase: given a free-text
objective, decompose it into per-department/role tasks (via `TaskRouter`),
assess risk heuristically, and require an explicit approve/reject decision
from a real registered agent before the plan is considered ready to act on.
"""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.auth import get_current_user
from core.database import get_db
from core.models import User
from core.permissions import has_project_access

from agent_registry.registry import AgentNotFound
from agent_registry.planning import (
    InitiativeNotFound,
    PlanNotEditable,
    PlanNotFound,
    PlanStatus,
    get_planning_service,
)

router = APIRouter(prefix="/projects/{project_id}/planning", tags=["planning"])


async def _assert_project_access(db, project_id: str, user_id: str) -> None:
    project = await db.projects.find_one({"id": project_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")


class CreatePlanRequest(BaseModel):
    objective: str
    affected_paths: Optional[List[str]] = None
    rollback_strategy: Optional[str] = None
    success_metrics: Optional[List[str]] = None
    initiative_id: Optional[str] = None


class ApprovePlanRequest(BaseModel):
    approved_by_agent_id: str


class RejectPlanRequest(BaseModel):
    rejected_by_agent_id: str
    reason: str = ""


@router.post("/plans")
async def create_plan(
    project_id: str, req: CreatePlanRequest, current_user: User = Depends(get_current_user)
):
    """Decompose a free-text objective into per-department/role tasks and
    assess risk heuristically. Returns a plan in DRAFT status -- coding
    should not begin until it is explicitly approved."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    service = get_planning_service()
    try:
        plan = await service.create_plan(
            project_id,
            req.objective,
            affected_paths=req.affected_paths,
            rollback_strategy=req.rollback_strategy,
            success_metrics=req.success_metrics,
            initiative_id=req.initiative_id,
        )
    except InitiativeNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return plan


@router.get("/plans")
async def list_plans(
    project_id: str,
    status: Optional[PlanStatus] = None,
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    service = get_planning_service()
    plans = await service.list_for_project(project_id, status=status, limit=limit)
    return {"plans": plans}


@router.get("/plans/{plan_id}")
async def get_plan(project_id: str, plan_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    service = get_planning_service()
    try:
        plan = await service.get(project_id, plan_id)
    except PlanNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return plan


@router.post("/plans/{plan_id}/approve")
async def approve_plan(
    project_id: str, plan_id: str, req: ApprovePlanRequest, current_user: User = Depends(get_current_user)
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    service = get_planning_service()
    try:
        plan = await service.approve(project_id, plan_id, approved_by_agent_id=req.approved_by_agent_id)
    except (PlanNotFound, AgentNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PlanNotEditable as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return plan


@router.post("/plans/{plan_id}/reject")
async def reject_plan(
    project_id: str, plan_id: str, req: RejectPlanRequest, current_user: User = Depends(get_current_user)
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    service = get_planning_service()
    try:
        plan = await service.reject(
            project_id, plan_id, rejected_by_agent_id=req.rejected_by_agent_id, reason=req.reason
        )
    except (PlanNotFound, AgentNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PlanNotEditable as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return plan
