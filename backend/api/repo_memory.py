"""API surface for per-project Repository Memory.

Scoped under a project, same as the Agent Registry endpoints -- each imported
repository gets its own single, structured memory document (architecture
summary, tech stack, API map, database schema notes, known issues, roadmap
notes, design system notes) that agents and humans edit directly, the same
way a README or ARCHITECTURE.md would be maintained by hand.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import get_current_user
from core.database import get_db
from core.models import User
from core.permissions import has_project_access

from agent_registry.repo_memory import (
    AgentNotFound,
    RepositoryMemory,
    get_repository_memory_service,
)

router = APIRouter(prefix="/projects/{project_id}/memory", tags=["repo-memory"])


async def _assert_project_access(db, project_id: str, user_id: str) -> None:
    project = await db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")


class UpdateRepositoryMemoryRequest(BaseModel):
    updated_by_agent_id: str
    architecture_summary: Optional[str] = None
    tech_stack: Optional[List[str]] = None
    api_map: Optional[List[Dict[str, str]]] = None
    database_schema_notes: Optional[str] = None
    known_issues: Optional[List[str]] = None
    roadmap_notes: Optional[str] = None
    design_system_notes: Optional[str] = None


@router.get("")
async def get_repository_memory(
    project_id: str, current_user: User = Depends(get_current_user)
) -> RepositoryMemory:
    """Return the project's repository memory document, creating an empty
    one on first access."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    service = get_repository_memory_service()
    return await service.get_or_create(project_id)


@router.put("")
async def update_repository_memory(
    project_id: str,
    req: UpdateRepositoryMemoryRequest,
    current_user: User = Depends(get_current_user),
) -> RepositoryMemory:
    """Partially update the project's repository memory document. Only
    fields explicitly present in the request body are applied; the rest are
    left untouched."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    fields = req.model_dump(exclude={"updated_by_agent_id"}, exclude_none=True)

    service = get_repository_memory_service()
    try:
        memory = await service.update(
            project_id, updated_by_agent_id=req.updated_by_agent_id, **fields
        )
    except AgentNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return memory
