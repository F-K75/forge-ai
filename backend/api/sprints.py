from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field

from core.models import User, utcnow
from core.pm_models import SprintStatus, StandUp, SprintReview, SprintRetro, RiskReport, TechDebtSummary
from core.database import get_db
from core.permissions import has_initiative_access
from api.auth import get_current_user
from agents.scrum_master import ScrumMasterAgent
from services.pm_notifications import notify_sprint_completed

router = APIRouter(prefix="/sprints", tags=["sprints"])
scrum_master = ScrumMasterAgent()


class UpdateSprintRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    goal: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    capacity: Optional[int] = None
    status: Optional[str] = None
    task_ids: Optional[List[str]] = None


async def _assert_initiative_access(db, initiative_id: str, user_id: str):
    initiative = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0})
    if not initiative or not await has_initiative_access(db, user_id, initiative):
        raise HTTPException(status_code=404, detail="Initiative not found")
    return initiative


async def _owned_sprint(db, sprint_id: str, user_id: str) -> dict:
    sprint = await db.sprints.find_one({"id": sprint_id}, {"_id": 0})
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint not found")
    await _assert_initiative_access(db, sprint["initiative_id"], user_id)
    return sprint


@router.get("/")
async def list_sprints(initiative_id: str = Query(...), current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_initiative_access(db, initiative_id, current_user.id)
    sprints = await db.sprints.find({"initiative_id": initiative_id}, {"_id": 0}).sort("sprint_number", 1).to_list(None)
    return {"sprints": sprints}


@router.get("/{sprint_id}")
async def get_sprint(sprint_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    return await _owned_sprint(db, sprint_id, current_user.id)


@router.put("/{sprint_id}")
async def update_sprint(sprint_id: str, req: UpdateSprintRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    sprint = await _owned_sprint(db, sprint_id, current_user.id)
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = utcnow()
    await db.sprints.update_one({"id": sprint_id}, {"$set": update})

    if update.get("status") == SprintStatus.COMPLETED.value and sprint.get("status") != SprintStatus.COMPLETED.value:
        initiative = await db.initiatives.find_one({"id": sprint["initiative_id"]}, {"_id": 0, "user_id": 1})
        if initiative:
            await notify_sprint_completed(db, initiative["user_id"], sprint.get("name") or f"Sprint {sprint['sprint_number']}")
    return {"ok": True}


async def _sprint_tasks(db, sprint: dict) -> list:
    return await db.tasks.find({"sprint_id": sprint["id"]}, {"_id": 0}).to_list(None)


@router.post("/{sprint_id}/standup")
async def generate_standup(sprint_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    sprint = await _owned_sprint(db, sprint_id, current_user.id)
    tasks = await _sprint_tasks(db, sprint)
    data = await scrum_master.standup(sprint, tasks, user_id=current_user.id, initiative_id=sprint["initiative_id"])
    standup = StandUp(sprint_id=sprint_id, initiative_id=sprint["initiative_id"], **{
        k: v for k, v in data.items() if k in StandUp.model_fields
    })
    await db.standups.insert_one(standup.model_dump())
    return standup


@router.get("/{sprint_id}/standups")
async def list_standups(sprint_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _owned_sprint(db, sprint_id, current_user.id)
    standups = await db.standups.find({"sprint_id": sprint_id}, {"_id": 0}).sort("date", -1).to_list(None)
    return {"standups": standups}


@router.post("/{sprint_id}/review")
async def generate_review(sprint_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    sprint = await _owned_sprint(db, sprint_id, current_user.id)
    tasks = await _sprint_tasks(db, sprint)
    data = await scrum_master.review(sprint, tasks, user_id=current_user.id, initiative_id=sprint["initiative_id"])
    review = SprintReview(sprint_id=sprint_id, initiative_id=sprint["initiative_id"], **{
        k: v for k, v in data.items() if k in SprintReview.model_fields
    })
    await db.sprint_reviews.insert_one(review.model_dump())
    return review


@router.post("/{sprint_id}/retro")
async def generate_retro(sprint_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    sprint = await _owned_sprint(db, sprint_id, current_user.id)
    tasks = await _sprint_tasks(db, sprint)
    data = await scrum_master.retro(sprint, tasks, user_id=current_user.id, initiative_id=sprint["initiative_id"])
    retro = SprintRetro(sprint_id=sprint_id, initiative_id=sprint["initiative_id"], **{
        k: v for k, v in data.items() if k in SprintRetro.model_fields
    })
    await db.sprint_retros.insert_one(retro.model_dump())
    return retro


@router.post("/{sprint_id}/risk-report")
async def generate_risk_report(sprint_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    sprint = await _owned_sprint(db, sprint_id, current_user.id)
    tasks = await _sprint_tasks(db, sprint)
    data = await scrum_master.risk_report(sprint, tasks, user_id=current_user.id, initiative_id=sprint["initiative_id"])
    report = RiskReport(initiative_id=sprint["initiative_id"], sprint_id=sprint_id, risks=data.get("risks", []))
    await db.risk_reports.insert_one(report.model_dump())
    return report


@router.post("/{sprint_id}/tech-debt")
async def generate_tech_debt(sprint_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    sprint = await _owned_sprint(db, sprint_id, current_user.id)
    tasks = await _sprint_tasks(db, sprint)
    data = await scrum_master.tech_debt(sprint, tasks, user_id=current_user.id, initiative_id=sprint["initiative_id"])
    summary = TechDebtSummary(initiative_id=sprint["initiative_id"], items=data.get("items", []))
    await db.tech_debt_summaries.insert_one(summary.model_dump())
    return summary


@router.get("/{sprint_id}/reports")
async def get_sprint_reports(sprint_id: str, current_user: User = Depends(get_current_user)):
    """All generated ceremony docs for a sprint, latest first."""
    db = await get_db()
    sprint = await _owned_sprint(db, sprint_id, current_user.id)
    reviews = await db.sprint_reviews.find({"sprint_id": sprint_id}, {"_id": 0}).sort("created_at", -1).to_list(None)
    retros = await db.sprint_retros.find({"sprint_id": sprint_id}, {"_id": 0}).sort("created_at", -1).to_list(None)
    risk_reports = await db.risk_reports.find({"sprint_id": sprint_id}, {"_id": 0}).sort("created_at", -1).to_list(None)
    tech_debt = await db.tech_debt_summaries.find({"initiative_id": sprint["initiative_id"]}, {"_id": 0}).sort("created_at", -1).to_list(None)
    return {"reviews": reviews, "retros": retros, "risk_reports": risk_reports, "tech_debt": tech_debt}
