from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.models import User, utcnow
from core.pm_models import Epic
from core.database import get_db
from core.permissions import has_initiative_access
from api.auth import get_current_user

router = APIRouter(prefix="/epics", tags=["epics"])


class CreateEpicRequest(BaseModel):
    initiative_id: str
    title: str = Field(..., max_length=300)
    description: str = Field("", max_length=5000)
    priority: str = "p2"


class UpdateEpicRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=300)
    description: Optional[str] = None
    priority: Optional[str] = None
    story_points: Optional[int] = None
    estimated_duration: Optional[str] = None
    dependencies: Optional[List[str]] = None
    owner: Optional[str] = None
    status: Optional[str] = None
    order: Optional[int] = None


async def _assert_initiative_access(db, initiative_id: str, user_id: str):
    initiative = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0})
    if not initiative or not await has_initiative_access(db, user_id, initiative):
        raise HTTPException(status_code=404, detail="Initiative not found")


@router.post("/")
async def create_epic(req: CreateEpicRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_initiative_access(db, req.initiative_id, current_user.id)
    epic = Epic(initiative_id=req.initiative_id, title=req.title, description=req.description, priority=req.priority)
    await db.epics.insert_one(epic.model_dump())
    return epic


@router.get("/")
async def list_epics(initiative_id: str = Query(...), current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_initiative_access(db, initiative_id, current_user.id)
    epics = await db.epics.find({"initiative_id": initiative_id}, {"_id": 0}).sort("order", 1).to_list(None)
    return {"epics": epics}


@router.get("/{epic_id}")
async def get_epic(epic_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    epic = await db.epics.find_one({"id": epic_id}, {"_id": 0})
    if not epic:
        raise HTTPException(status_code=404, detail="Epic not found")
    await _assert_initiative_access(db, epic["initiative_id"], current_user.id)
    return epic


@router.put("/{epic_id}")
async def update_epic(epic_id: str, req: UpdateEpicRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    epic = await db.epics.find_one({"id": epic_id}, {"_id": 0})
    if not epic:
        raise HTTPException(status_code=404, detail="Epic not found")
    await _assert_initiative_access(db, epic["initiative_id"], current_user.id)
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = utcnow()
    await db.epics.update_one({"id": epic_id}, {"$set": update})
    return {"ok": True}


@router.delete("/{epic_id}")
async def delete_epic(epic_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    epic = await db.epics.find_one({"id": epic_id}, {"_id": 0})
    if not epic:
        raise HTTPException(status_code=404, detail="Epic not found")
    await _assert_initiative_access(db, epic["initiative_id"], current_user.id)
    await db.epics.delete_one({"id": epic_id})
    story_ids = [s["id"] for s in await db.stories.find({"epic_id": epic_id}, {"_id": 0, "id": 1}).to_list(None)]
    await db.stories.delete_many({"epic_id": epic_id})
    if story_ids:
        await db.tasks.delete_many({"story_id": {"$in": story_ids}})
    return {"ok": True}
