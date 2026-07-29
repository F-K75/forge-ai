from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.models import User, utcnow
from core.pm_models import Release, ReleaseStatus, TaskStatus
from core.database import get_db
from core.permissions import has_initiative_access
from api.auth import get_current_user

router = APIRouter(prefix="/releases", tags=["releases"])


class GenerateReleaseRequest(BaseModel):
    initiative_id: str
    version: str = Field(..., max_length=50)


class UpdateReleaseRequest(BaseModel):
    version: Optional[str] = None
    status: Optional[str] = None
    estimated_release_date: Optional[datetime] = None


async def _assert_initiative_access(db, initiative_id: str, user_id: str):
    initiative = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0})
    if not initiative or not await has_initiative_access(db, user_id, initiative):
        raise HTTPException(status_code=404, detail="Initiative not found")


@router.post("/generate")
async def generate_release(req: GenerateReleaseRequest, current_user: User = Depends(get_current_user)):
    """Module 12: release readiness is computed deterministically from the
    current task/story state rather than via an LLM call -- "how many tasks
    are blocked/done" is exact data, not something worth asking a model to
    approximate."""
    db = await get_db()
    await _assert_initiative_access(db, req.initiative_id, current_user.id)

    tasks = await db.tasks.find({"initiative_id": req.initiative_id}, {"_id": 0}).to_list(None)
    stories = await db.stories.find({"initiative_id": req.initiative_id}, {"_id": 0}).to_list(None)
    risk_reports = await db.risk_reports.find({"initiative_id": req.initiative_id}, {"_id": 0}).sort("created_at", -1).limit(1).to_list(1)

    total = len(tasks) or 1
    done = sum(1 for t in tasks if t["status"] == TaskStatus.DONE.value)
    blocked = [t["title"] for t in tasks if t["status"] == TaskStatus.BLOCKED.value]
    in_review_or_testing = sum(1 for t in tasks if t["status"] in (TaskStatus.CODE_REVIEW.value, TaskStatus.TESTING.value))

    completion_pct = done / total
    qa_status = "passed" if not blocked and completion_pct == 1.0 else ("at_risk" if blocked else "in_progress")
    readiness = "ready" if completion_pct == 1.0 and not blocked else ("blocked" if blocked else "in_progress")
    confidence = round(max(0, min(100, completion_pct * 100 - len(blocked) * 10 - in_review_or_testing * 2)))

    features = [s["title"] for s in stories if s.get("status") == "done"] or [s["title"] for s in stories[:10]]
    risks = [r.get("description", "") for r in (risk_reports[0].get("risks", []) if risk_reports else [])]

    release = Release(
        initiative_id=req.initiative_id,
        version=req.version,
        features=features,
        risks=risks,
        blocked_items=blocked,
        qa_status=qa_status,
        deployment_readiness=readiness,
        estimated_release_date=utcnow() + timedelta(days=max(1, round((1 - completion_pct) * 14))),
        confidence_score=confidence,
        status=ReleaseStatus.PLANNED if readiness != "ready" else ReleaseStatus.IN_PROGRESS,
    )
    await db.releases.insert_one(release.model_dump())
    return release


@router.get("/")
async def list_releases(initiative_id: str = Query(...), current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_initiative_access(db, initiative_id, current_user.id)
    releases = await db.releases.find({"initiative_id": initiative_id}, {"_id": 0}).sort("created_at", -1).to_list(None)
    return {"releases": releases}


@router.get("/{release_id}")
async def get_release(release_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    release = await db.releases.find_one({"id": release_id}, {"_id": 0})
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    await _assert_initiative_access(db, release["initiative_id"], current_user.id)
    return release


@router.put("/{release_id}")
async def update_release(release_id: str, req: UpdateReleaseRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    release = await db.releases.find_one({"id": release_id}, {"_id": 0})
    if not release:
        raise HTTPException(status_code=404, detail="Release not found")
    await _assert_initiative_access(db, release["initiative_id"], current_user.id)
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = utcnow()
    await db.releases.update_one({"id": release_id}, {"$set": update})
    return {"ok": True}
