from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query

from core.models import User
from core.database import get_db
from core.permissions import has_initiative_access
from api.auth import get_current_user

router = APIRouter(prefix="/agent-executions", tags=["agent-executions"])


async def _assert_initiative_access(db, initiative_id: str, user_id: str):
    initiative = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0})
    if not initiative or not await has_initiative_access(db, user_id, initiative):
        raise HTTPException(status_code=404, detail="Initiative not found")


@router.get("/")
async def list_agent_executions(
    current_user: User = Depends(get_current_user),
    initiative_id: str = Query(...),
    task_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    """Live execution dashboard data source (Module 10): current/recent agent
    runs, their status, logs, generated files, cost, tokens, and duration."""
    db = await get_db()
    await _assert_initiative_access(db, initiative_id, current_user.id)

    query: dict = {"initiative_id": initiative_id}
    if task_id:
        query["task_id"] = task_id
    executions = await db.agent_executions.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"executions": executions}


@router.get("/{execution_id}")
async def get_agent_execution(execution_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    execution = await db.agent_executions.find_one({"id": execution_id}, {"_id": 0})
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    await _assert_initiative_access(db, execution["initiative_id"], current_user.id)
    return execution
