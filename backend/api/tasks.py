import hashlib
import hmac
import json
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel, Field

from core.models import User
from core.pm_models import Task, TaskStatus
from core.database import get_db
from core.permissions import has_initiative_access
from core.config import get_settings
from core.security import sanitize_string
from api.auth import get_current_user
from tasks.pm_tasks import execute_task
from services.pm_notifications import notify_pr_approved, notify_pr_merged

router = APIRouter(prefix="/tasks", tags=["pm-tasks"])
settings = get_settings()


class CreateTaskRequest(BaseModel):
    story_id: str
    epic_id: str
    initiative_id: str
    title: str = Field(..., max_length=300)
    description: str = Field("", max_length=5000)
    category: str = "backend"
    assigned_agent: str = "backend_agent"


class UpdateTaskRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=300)
    description: Optional[str] = None
    category: Optional[str] = None
    estimated_hours: Optional[float] = None
    complexity: Optional[str] = None
    required_skills: Optional[List[str]] = None
    dependencies: Optional[List[str]] = None
    assigned_agent: Optional[str] = None
    labels: Optional[List[str]] = None
    sprint_id: Optional[str] = None
    kanban_order: Optional[int] = None


class UpdateTaskStatusRequest(BaseModel):
    status: str
    kanban_order: Optional[int] = None


class GithubLinkRequest(BaseModel):
    branch: Optional[str] = None
    pr_number: Optional[int] = None
    pr_url: Optional[str] = None
    review_status: Optional[str] = None
    merge_status: Optional[str] = None


async def _assert_initiative_access(db, initiative_id: str, user_id: str):
    initiative = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0})
    if not initiative or not await has_initiative_access(db, user_id, initiative):
        raise HTTPException(status_code=404, detail="Initiative not found")
    return initiative


@router.post("/")
async def create_task(req: CreateTaskRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_initiative_access(db, req.initiative_id, current_user.id)
    task = Task(
        story_id=req.story_id, epic_id=req.epic_id, initiative_id=req.initiative_id,
        title=req.title, description=req.description, category=req.category, assigned_agent=req.assigned_agent,
    )
    await db.tasks.insert_one(task.model_dump())
    return task


@router.get("/")
async def list_tasks(
    current_user: User = Depends(get_current_user),
    initiative_id: str = Query(...),
    sprint_id: Optional[str] = None,
    status: Optional[str] = None,
    assigned_agent: Optional[str] = None,
    label: Optional[str] = None,
    search: Optional[str] = None,
):
    """Kanban board data source (Module 8): filterable by sprint, status,
    agent, label, and free-text search over title/description."""
    db = await get_db()
    await _assert_initiative_access(db, initiative_id, current_user.id)

    query: dict = {"initiative_id": initiative_id}
    if sprint_id:
        query["sprint_id"] = sprint_id
    if status:
        query["status"] = status
    if assigned_agent:
        query["assigned_agent"] = assigned_agent
    if label:
        query["labels"] = label
    if search:
        sanitized = sanitize_string(search, max_length=100)
        query["$or"] = [
            {"title": {"$regex": sanitized, "$options": "i"}},
            {"description": {"$regex": sanitized, "$options": "i"}},
        ]

    tasks = await db.tasks.find(query, {"_id": 0}).sort("kanban_order", 1).to_list(None)
    return {"tasks": tasks}


@router.get("/{task_id}")
async def get_task(task_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await _assert_initiative_access(db, task["initiative_id"], current_user.id)
    return task


@router.put("/{task_id}")
async def update_task(task_id: str, req: UpdateTaskRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await _assert_initiative_access(db, task["initiative_id"], current_user.id)
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = datetime.utcnow()
    await db.tasks.update_one({"id": task_id}, {"$set": update})
    return {"ok": True}


@router.patch("/{task_id}/status")
async def update_task_status(task_id: str, req: UpdateTaskStatusRequest, current_user: User = Depends(get_current_user)):
    """Drag-and-drop column move on the Kanban board."""
    db = await get_db()
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await _assert_initiative_access(db, task["initiative_id"], current_user.id)

    try:
        status = TaskStatus(req.status)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid status")

    update = {"status": status.value, "updated_at": datetime.utcnow()}
    if req.kanban_order is not None:
        update["kanban_order"] = req.kanban_order
    await db.tasks.update_one({"id": task_id}, {"$set": update})

    from services.pm_ws_manager import pm_manager
    from core.pm_models import PMWSEvent, PMWSEventType
    await pm_manager.emit(PMWSEvent(
        type=PMWSEventType.TASK_STATUS_CHANGED, initiative_id=task["initiative_id"],
        data={"task_id": task_id, "status": status.value},
    ))
    return {"ok": True}


@router.delete("/{task_id}")
async def delete_task(task_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await _assert_initiative_access(db, task["initiative_id"], current_user.id)
    await db.tasks.delete_one({"id": task_id})
    return {"ok": True}


@router.post("/{task_id}/execute")
async def execute_task_endpoint(task_id: str, current_user: User = Depends(get_current_user)):
    """Module 9/10: assign an AI agent to actually work this task."""
    db = await get_db()
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await _assert_initiative_access(db, task["initiative_id"], current_user.id)

    if task.get("status") == TaskStatus.IN_PROGRESS.value:
        raise HTTPException(status_code=429, detail="This task's agent is already running")

    execute_task.delay(task_id, current_user.id)
    return {"ok": True}


@router.post("/{task_id}/github-link")
async def link_github(task_id: str, req: GithubLinkRequest, current_user: User = Depends(get_current_user)):
    """Manually record a branch/PR against a task (Module 13)."""
    db = await get_db()
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await _assert_initiative_access(db, task["initiative_id"], current_user.id)

    github = {**(task.get("github") or {}), **{k: v for k, v in req.model_dump().items() if v is not None}}
    update = {"github": github, "updated_at": datetime.utcnow()}
    if req.merge_status == "merged":
        update["status"] = TaskStatus.DONE.value
        update["completed_at"] = datetime.utcnow()
    elif req.pr_number and task.get("status") not in (TaskStatus.DONE.value,):
        update["status"] = TaskStatus.CODE_REVIEW.value
    await db.tasks.update_one({"id": task_id}, {"$set": update})
    return {"ok": True}


@router.post("/github/webhook")
async def github_webhook(request: Request):
    """Inbound GitHub webhook (Module 13): updates task status on PR/push
    events. Matches by branch name convention `task/{task_id}[-slug]`."""
    if not settings.github_webhook_secret:
        raise HTTPException(status_code=503, detail="GitHub webhook not configured")

    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    expected = "sha256=" + hmac.new(settings.github_webhook_secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=401, detail="Invalid signature")

    event_type = request.headers.get("X-GitHub-Event", "")
    payload = json.loads(body)
    db = await get_db()

    branch = None
    if event_type == "pull_request":
        branch = (payload.get("pull_request") or {}).get("head", {}).get("ref")
    elif event_type == "push":
        ref = payload.get("ref", "")
        branch = ref.split("/")[-1] if ref else None

    if not branch or not branch.startswith("task/"):
        return {"ok": True, "ignored": True}

    # Task ids are canonical 36-char UUID4 strings (8-4-4-4-12, itself full of
    # hyphens) -- splitting the remainder on "-" to strip an optional
    # "-slug" suffix would truncate the id after its first segment. The id
    # is always exactly the first 36 characters after "task/".
    task_id = branch[len("task/"):][:36]
    task = await db.tasks.find_one({"id": task_id}, {"_id": 0})
    if not task:
        return {"ok": True, "ignored": True}

    initiative = await db.initiatives.find_one({"id": task["initiative_id"]}, {"_id": 0, "user_id": 1})
    user_id = (initiative or {}).get("user_id")
    github = dict(task.get("github") or {})
    update: dict = {"updated_at": datetime.utcnow()}

    if event_type == "pull_request":
        pr = payload["pull_request"]
        action = payload.get("action")
        github.update({"branch": branch, "pr_number": pr.get("number"), "pr_url": pr.get("html_url")})
        if action in ("opened", "reopened", "synchronize"):
            github["review_status"] = "open"
            update["status"] = TaskStatus.CODE_REVIEW.value
        elif action == "closed" and pr.get("merged"):
            github["review_status"] = "approved"
            github["merge_status"] = "merged"
            update["status"] = TaskStatus.DONE.value
            update["completed_at"] = datetime.utcnow()
            if user_id:
                await notify_pr_merged(db, user_id, task["title"])
        elif action == "closed":
            github["merge_status"] = "closed"
    elif event_type == "pull_request_review" and payload.get("review", {}).get("state") == "approved":
        github["review_status"] = "approved"
        if user_id:
            await notify_pr_approved(db, user_id, task["title"])
    elif event_type == "push":
        shas = [c.get("id") for c in payload.get("commits", []) if c.get("id")]
        github["commit_shas"] = list({*(github.get("commit_shas") or []), *shas})

    update["github"] = github
    await db.tasks.update_one({"id": task_id}, {"$set": update})
    return {"ok": True}
