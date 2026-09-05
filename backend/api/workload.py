"""API surface for the per-project Agent Workload view.

Scoped under a project, same as the Agent Registry / Activity Timeline
endpoints. Read-only: workload is assembled at request time from records
several other modules already keep (see `agent_registry/workload.py`), so
there's nothing here to create, update, or delete.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from api.auth import get_current_user
from core.database import get_db
from core.models import User
from core.permissions import has_project_access

from agent_registry.workload import get_workload_service

router = APIRouter(prefix="/projects/{project_id}/workload", tags=["workload"])


async def _assert_project_access(db, project_id: str, user_id: str) -> None:
    project = await db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("")
async def get_project_workload(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return each agent's current workload -- open change requests they
    authored, change requests awaiting their review, and open tasks from
    approved plans -- sorted busiest-first. Agents with no workload are
    omitted (see `agent_registry/workload.py` for the reasoning)."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    service = get_workload_service()
    agents = await service.get_workload(project_id)
    return {"agents": agents}
