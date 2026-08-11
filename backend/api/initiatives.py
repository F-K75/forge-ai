import asyncio
import json
import logging
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel, Field

from core.models import User, PaginationParams, Project, utcnow
from core.database import get_db, paginated_query
from core.pm_models import Initiative, InitiativeStatus
from core.permissions import has_initiative_access
from api.auth import get_current_user
from tasks.pm_tasks import generate_initiative_plan
from services.pm_ws_manager import pm_manager, authenticate_pm_websocket_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/initiatives", tags=["initiatives"])


class CreateInitiativeRequest(BaseModel):
    prompt: str = Field(..., max_length=20000)
    name: Optional[str] = Field(None, max_length=200)


class UpdateInitiativeRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    vision: Optional[str] = None
    business_goals: Optional[List[str]] = None
    product_scope: Optional[str] = None
    functional_requirements: Optional[List[str]] = None
    non_functional_requirements: Optional[List[str]] = None
    success_metrics: Optional[List[str]] = None
    roadmap: Optional[List[Dict[str, Any]]] = None
    tech_stack: Optional[List[str]] = None
    risks: Optional[List[Dict[str, Any]]] = None
    estimated_timeline: Optional[str] = None
    project_ids: Optional[List[str]] = None


class PaginatedInitiatives(BaseModel):
    initiatives: List[Dict[str, Any]]
    total: int
    page: int
    per_page: int
    total_pages: int


@router.post("/")
async def create_initiative(req: CreateInitiativeRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    name = req.name or req.prompt[:60]
    initiative = Initiative(
        user_id=current_user.id,
        name=name,
        prompt=req.prompt,
        status=InitiativeStatus.DRAFT,
    )

    # Every initiative gets one companion Project up front, in the same slot
    # execute_task already reads from (initiative.project_ids[0], via
    # tasks/pm_tasks.py) to reuse the latest successful build's files as
    # codegen context for later tasks. Without this, that reuse path was
    # silently a no-op because project_ids was never populated anywhere.
    project = Project(
        user_id=current_user.id,
        org_id=initiative.org_id,
        name=name,
        description=req.prompt,
    )
    initiative.project_ids = [project.id]

    await db.projects.insert_one(project.model_dump())
    await db.initiatives.insert_one(initiative.model_dump())
    try:
        generate_initiative_plan.delay(initiative.id)
    except Exception:
        logger.exception("Failed to queue initiative plan generation")
    return initiative


@router.get("/", response_model=PaginatedInitiatives)
async def list_initiatives(
    current_user: User = Depends(get_current_user),
    params: PaginationParams = Depends(),
):
    db = await get_db()
    result = await paginated_query(
        db.initiatives,
        {"user_id": current_user.id},
        page=params.page,
        per_page=params.per_page,
        sort=[("updated_at", -1)],
    )
    return PaginatedInitiatives(
        initiatives=result.items,
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        total_pages=result.total_pages,
    )


async def _get_owned_initiative(db, initiative_id: str, user_id: str) -> dict:
    initiative = await db.initiatives.find_one({"id": initiative_id}, {"_id": 0})
    if not initiative or not await has_initiative_access(db, user_id, initiative):
        raise HTTPException(status_code=404, detail="Initiative not found")
    return initiative


@router.get("/{initiative_id}")
async def get_initiative(initiative_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    return await _get_owned_initiative(db, initiative_id, current_user.id)


@router.put("/{initiative_id}")
async def update_initiative(initiative_id: str, req: UpdateInitiativeRequest, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _get_owned_initiative(db, initiative_id, current_user.id)
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    update["updated_at"] = utcnow()
    await db.initiatives.update_one({"id": initiative_id}, {"$set": update})
    return {"ok": True}


@router.post("/{initiative_id}/regenerate")
async def regenerate_initiative(initiative_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    initiative = await _get_owned_initiative(db, initiative_id, current_user.id)
    if initiative.get("status") == InitiativeStatus.GENERATING.value:
        raise HTTPException(status_code=429, detail="Generation already in progress")

    # Clear out any previously generated plan so regeneration starts clean.
    await db.prds.delete_many({"initiative_id": initiative_id})
    await db.epics.delete_many({"initiative_id": initiative_id})
    await db.stories.delete_many({"initiative_id": initiative_id})
    await db.tasks.delete_many({"initiative_id": initiative_id})
    await db.sprints.delete_many({"initiative_id": initiative_id})

    generate_initiative_plan.delay(initiative_id)
    return {"ok": True}


@router.get("/{initiative_id}/prd")
async def get_prd(initiative_id: str, format: Optional[str] = None, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _get_owned_initiative(db, initiative_id, current_user.id)
    prd = await db.prds.find_one({"initiative_id": initiative_id}, {"_id": 0})
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not generated yet")
    if format == "markdown":
        return {"markdown": _prd_to_markdown(prd)}
    return prd


def _prd_to_markdown(prd: dict) -> str:
    def section(title: str, body) -> str:
        if isinstance(body, list):
            body = "\n".join(f"- {item}" for item in body) if body else "_None_"
        return f"## {title}\n\n{body or '_None_'}\n"

    parts = [
        "# Product Requirements Document\n",
        section("Executive Summary", prd.get("executive_summary")),
        section("Problem Statement", prd.get("problem_statement")),
        section("Solution", prd.get("solution")),
        section("Functional Requirements", prd.get("functional_requirements")),
        section("Non-Functional Requirements", prd.get("non_functional_requirements")),
        section("Security", prd.get("security")),
        section("Performance", prd.get("performance")),
        section("Scalability", prd.get("scalability")),
        section("API Overview", prd.get("api_overview")),
        section("Database Overview", prd.get("database_overview")),
        section("Release Plan", prd.get("release_plan")),
    ]
    return "\n".join(parts)


@router.put("/{initiative_id}/prd")
async def update_prd(initiative_id: str, req: Dict[str, Any], current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _get_owned_initiative(db, initiative_id, current_user.id)
    allowed = {
        "executive_summary", "problem_statement", "solution", "personas", "user_journeys",
        "functional_requirements", "non_functional_requirements", "security", "performance",
        "scalability", "api_overview", "database_overview", "release_plan",
    }
    update = {k: v for k, v in req.items() if k in allowed}
    update["updated_at"] = utcnow()
    await db.prds.update_one({"initiative_id": initiative_id}, {"$set": update})
    return {"ok": True}


@router.get("/{initiative_id}/graph")
async def get_dependency_graph(initiative_id: str, current_user: User = Depends(get_current_user)):
    """Module 11: Project -> Epics -> Stories -> Tasks -> AgentExecutions ->
    generated files -> git commits/deployments, as graph nodes/edges."""
    db = await get_db()
    initiative = await _get_owned_initiative(db, initiative_id, current_user.id)

    epics = await db.epics.find({"initiative_id": initiative_id}, {"_id": 0}).to_list(None)
    stories = await db.stories.find({"initiative_id": initiative_id}, {"_id": 0}).to_list(None)
    tasks = await db.tasks.find({"initiative_id": initiative_id}, {"_id": 0}).to_list(None)
    executions = await db.agent_executions.find({"initiative_id": initiative_id}, {"_id": 0}).to_list(None)

    nodes: List[Dict[str, Any]] = [{"id": f"initiative:{initiative_id}", "type": "initiative", "label": initiative.get("name")}]
    edges: List[Dict[str, Any]] = []

    for epic in epics:
        nodes.append({"id": f"epic:{epic['id']}", "type": "epic", "label": epic["title"], "data": epic})
        edges.append({"source": f"initiative:{initiative_id}", "target": f"epic:{epic['id']}"})
        for dep in epic.get("dependencies", []):
            edges.append({"source": f"epic:{dep}", "target": f"epic:{epic['id']}", "kind": "dependency"})

    for story in stories:
        nodes.append({"id": f"story:{story['id']}", "type": "story", "label": story["title"], "data": story})
        edges.append({"source": f"epic:{story['epic_id']}", "target": f"story:{story['id']}"})
        for dep in story.get("dependencies", []):
            edges.append({"source": f"story:{dep}", "target": f"story:{story['id']}", "kind": "dependency"})

    for task in tasks:
        nodes.append({"id": f"task:{task['id']}", "type": "task", "label": task["title"], "data": task})
        edges.append({"source": f"story:{task['story_id']}", "target": f"task:{task['id']}"})
        for dep in task.get("dependencies", []):
            edges.append({"source": f"task:{dep}", "target": f"task:{task['id']}", "kind": "dependency"})
        for path in task.get("generated_files", []):
            file_id = f"file:{task['id']}:{path}"
            nodes.append({"id": file_id, "type": "file", "label": path})
            edges.append({"source": f"task:{task['id']}", "target": file_id})
        github = task.get("github") or {}
        for sha in github.get("commit_shas", []) or []:
            commit_id = f"commit:{sha}"
            nodes.append({"id": commit_id, "type": "commit", "label": sha[:7]})
            edges.append({"source": f"task:{task['id']}", "target": commit_id})

    for execution in executions:
        exec_id = f"execution:{execution['id']}"
        nodes.append({"id": exec_id, "type": "agent_execution", "label": execution["agent"], "data": execution})
        edges.append({"source": f"task:{execution['task_id']}", "target": exec_id})

    return {"nodes": nodes, "edges": edges}


@router.websocket("/ws/{initiative_id}")
async def initiative_websocket(websocket: WebSocket, initiative_id: str, token: Optional[str] = Query(None)):
    user = await authenticate_pm_websocket_token(token, initiative_id=initiative_id)
    if not user:
        await websocket.accept()
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await pm_manager.connect(websocket, initiative_id)
    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pm_manager.disconnect(websocket, initiative_id)
