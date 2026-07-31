from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from core.models import User, utcnow
from core.pm_models import Story
from core.database import get_db
from core.permissions import has_initiative_access
from api.auth import get_current_user

router = APIRouter(prefix="/stories", tags=["stories"])


class CreateStoryRequest(BaseModel):
    epic_id: str
    initiative_id: str
    title: str = Field(..., max_length=300)
    description: str = Field("", max_length=5000)
    priority: str = "p2"


class UpdateStoryRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=300)
    description: Optional[str] = None
    acceptance_criteria: Optional[List[str]] = None
    definition_of_done: Optional[List[str]] = None
    priority: Optional[str] = None
    story_points: Optional[int] = None
    business_value: Optional[str] = None
    risk: Optional[str] = None
    dependencies: Optional[List[str]] = None
    status: Optional[str] = None
    order: Optional[int] = None


async def _assert_initiative_access(db, initiative_id: str, user_id: str):
    initiative = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0})
    if not initiative or not await has_initiative_access(db, user_id, initiative):
        raise HTTPException(status_code=404, detail="Initiative not found")


@router.post("/")
async def create_story(req: CreateStoryRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_initiative_access(db, req.initiative_id, current_user.id)
    story = Story(
        epic_id=req.epic_id, initiative_id=req.initiative_id,
        title=req.title, description=req.description, priority=req.priority,
    )
    await db.stories.insert_one(story.model_dump())
    return story


@router.get("/")
async def list_stories(
    current_user: User = Depends(get_current_user),
    initiative_id: Optional[str] = None,
    epic_id: Optional[str] = None,
):
    db = await get_db()
    if not initiative_id and not epic_id:
        raise HTTPException(status_code=400, detail="initiative_id or epic_id is required")
    query = {}
    if epic_id:
        epic = await db.epics.find_one({"id": epic_id}, {"_id": 0})
        if not epic:
            raise HTTPException(status_code=404, detail="Epic not found")
        await _assert_initiative_access(db, epic["initiative_id"], current_user.id)
        query["epic_id"] = epic_id
    else:
        await _assert_initiative_access(db, initiative_id, current_user.id)
        query["initiative_id"] = initiative_id
    stories = await db.stories.find(query, {"_id": 0}).sort("order", 1).to_list(None)
    return {"stories": stories}


@router.get("/{story_id}")
async def get_story(story_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    story = await db.stories.find_one({"id": story_id}, {"_id": 0})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    await _assert_initiative_access(db, story["initiative_id"], current_user.id)
    return story


@router.put("/{story_id}")
async def update_story(story_id: str, req: UpdateStoryRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    story = await db.stories.find_one({"id": story_id}, {"_id": 0})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    await _assert_initiative_access(db, story["initiative_id"], current_user.id)
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = utcnow()
    await db.stories.update_one({"id": story_id}, {"$set": update})
    return {"ok": True}


@router.delete("/{story_id}")
async def delete_story(story_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    story = await db.stories.find_one({"id": story_id}, {"_id": 0})
    if not story:
        raise HTTPException(status_code=404, detail="Story not found")
    await _assert_initiative_access(db, story["initiative_id"], current_user.id)
    await db.stories.delete_one({"id": story_id})
    await db.tasks.delete_many({"story_id": story_id})
    return {"ok": True}
