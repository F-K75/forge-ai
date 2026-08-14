"""API surface for the Persistent AI Product Lead (Phase A)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional

from api.auth import get_current_user
from core.database import get_db
from core.models import User
from core.permissions import has_project_access
from services.product_lead import ProductLead

router = APIRouter(prefix="/v1/product-lead", tags=["product-lead"])
_lead = ProductLead()


async def _assert_project_access(db, project_id: str, user_id: str) -> None:
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("/projects/{project_id}/why")
async def why(
    project_id: str,
    question: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return await _lead.answer_why(project_id, question)


@router.get("/projects/{project_id}/what-changed")
async def what_changed(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return await _lead.answer_what_changed(project_id)


@router.get("/projects/{project_id}/what-next")
async def what_next(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return await _lead.answer_what_next(project_id)


@router.get("/projects/{project_id}/decisions")
async def list_decisions(
    project_id: str,
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return await _lead.list_decisions(
        project_id, status=status, category=category, page=page, per_page=per_page
    )


@router.get("/projects/{project_id}/decisions/pending")
async def list_pending_decisions(project_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return await _lead.get_pending_decisions(project_id)
