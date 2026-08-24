"""API surface for the per-project Activity Timeline.

Scoped under a project, same as the Agent Registry / Repository Memory
endpoints. Read-only: the timeline is assembled at request time from records
several other modules already keep (see `agent_registry/activity.py`), so
there's nothing here to create, update, or delete.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from api.auth import get_current_user
from core.database import get_db
from core.models import User
from core.permissions import has_project_access

from agent_registry.activity import get_activity_service

router = APIRouter(prefix="/projects/{project_id}/activity", tags=["activity"])


async def _assert_project_access(db, project_id: str, user_id: str) -> None:
    project = await db.projects.find_one({"id": project_id, "$or": [{"deleted_at": None}, {"deleted_at": {"$exists": False}}]}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("")
async def get_activity_timeline(
    project_id: str,
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """Return the project's activity timeline -- agent lifecycle events,
    change request stage transitions, plan decisions, monitoring findings,
    and team chat messages -- merged and sorted newest-first."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    service = get_activity_service()
    entries = await service.get_timeline(project_id, limit=limit)
    return {"entries": entries}
