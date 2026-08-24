"""API surface for the unified decision_log (Phase A)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List

from api.auth import get_current_user
from core.database import get_db
from core.models import User
from core.permissions import has_project_access
from services.decision_log import DecisionLogService

router = APIRouter(prefix="/v1/decision-log", tags=["decision-log"])
_service = DecisionLogService()


async def _assert_project_access(db, project_id: str, user_id: str) -> None:
    project = await db.projects.find_one({"id": project_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("/projects/{project_id}/decisions")
async def list_project_decisions(
    project_id: str,
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return await _service.list_for_project(
        project_id, status=status, category=category, page=page, per_page=per_page
    )


@router.get("/initiatives/{initiative_id}/decisions")
async def list_initiative_decisions(
    initiative_id: str,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    initiative = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0})
    if not initiative or not await has_project_access(db, current_user.id, initiative):
        raise HTTPException(status_code=404, detail="Initiative not found")
    return await _service.list_for_initiative(initiative_id)


class CreateDecisionRequest(BaseModel):
    project_id: Optional[str] = None
    initiative_id: Optional[str] = None
    task_id: Optional[str] = None
    trigger: str = ""
    actions: List[str] = []
    category: Optional[str] = None
    rationale: Optional[str] = None
    alternatives_considered: Optional[List[str]] = None
    approver: Optional[str] = None
    status: Optional[str] = None
    confidence_score: Optional[float] = None
    superseded_by: Optional[str] = None
    last_validated_at: Optional[str] = None
    source_ref: Optional[str] = None
    source_type: Optional[str] = None
    tags: Optional[List[str]] = None


@router.post("/decisions")
async def create_decision(req: CreateDecisionRequest, current_user: User = Depends(get_current_user)):
    doc = req.model_dump()
    doc["approver"] = doc.get("approver") or current_user.id
    doc.setdefault("status", "pending")
    await _service.record_decision(doc)
    return {"ok": True}


@router.get("/projects/{project_id}/decisions/pending")
async def list_pending_decisions(project_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return await _service.pending_for_project(project_id)
