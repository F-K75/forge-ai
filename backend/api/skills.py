"""API surface for Forge AI's Intelligent Skill Engine.

Exposes authenticated, project-scoped skill discovery, filtering across the
9 skill domains, and dependency/permission-aware task routing under
`/v1/projects/{project_id}/skills/*`.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.auth import get_current_user
from core.database import get_db
from core.models import User
from core.permissions import has_project_access
from core.skill_engine import get_skill_registry, get_skill_router

router = APIRouter(prefix="/projects/{project_id}/skills", tags=["skill-engine"])


async def _assert_project_access(db, project_id: str, user_id: str) -> Dict[str, Any]:
    project = await db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")
    return project


class RouteSkillsRequest(BaseModel):
    role: str = Field(..., min_length=2, max_length=64)
    department: str = Field(..., min_length=2, max_length=64)
    objective: str = Field(..., min_length=3, max_length=2000)
    task_description: str = Field("", max_length=2000)
    top_k: int = Field(3, ge=1, le=8)


@router.get("")
async def list_project_skills(
    project_id: str,
    domain: Optional[str] = Query(None, max_length=64),
    department: Optional[str] = Query(None, max_length=64),
    search: Optional[str] = Query(None, max_length=128),
    current_user: User = Depends(get_current_user),
):
    """List discovered filesystem + canonical 9-domain skills."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    registry = get_skill_registry()
    skills = registry.list_skills(domain=domain, department=department, search=search)
    return {
        "summary": registry.domain_summary(),
        "skills": skills,
    }


@router.post("/route")
async def route_skills_for_task(
    project_id: str,
    req: RouteSkillsRequest,
    current_user: User = Depends(get_current_user),
):
    """Score, permission-check, and resolve dependencies for a role's task."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    activations = get_skill_router().route_for_task(
        role=req.role,
        department=req.department,
        objective=req.objective,
        task_description=req.task_description,
        top_k=req.top_k,
    )
    return {
        "role": req.role,
        "department": req.department,
        "activations": [a.to_dict() for a in activations],
    }


@router.get("/telemetry")
async def get_skill_telemetry(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return observed skill quality scores, latencies, costs, and routing boosts."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return {
        "telemetry": get_skill_registry().get_telemetry(),
    }
