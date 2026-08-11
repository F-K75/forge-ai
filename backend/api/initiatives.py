import asyncio
import json
import logging
import time
from collections import OrderedDict
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Query, Request
from pydantic import BaseModel, Field, field_validator

from core.models import User, PaginationParams, Project, utcnow
from core.database import get_db, paginated_query
from core.pm_models import Initiative, InitiativeStatus, PRD
from core.permissions import has_initiative_access, has_initiative_write_access
from core.config import get_settings
from core.audit import record_audit_log
from core.security import sanitize_prompt, _detect_prompt_injection
from core.encryption import encrypt_field, decrypt_field
from services.credit_alerts import check_and_send_credit_alerts
from services.pm_notifications import notify_slack
from api.auth import get_current_user
from api.billing import get_max_projects_for_user
from tasks.pm_tasks import generate_initiative_plan
from services.pm_ws_manager import pm_manager, authenticate_pm_websocket_token

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/initiatives", tags=["initiatives"])

_INITIATIVE_RATE_LIMIT_WINDOW = 3600
_INITIATIVE_RATE_LIMIT_MAX = 5
_initiative_rate_timestamps: "OrderedDict[str, list[float]]" = OrderedDict()

_ENCRYPTED_INITIATIVE_FIELDS = {"prompt", "business_goals", "risks"}
_ENCRYPTED_PRD_FIELDS = {"executive_summary", "problem_statement", "solution", "security", "performance", "scalability", "api_overview", "database_overview", "release_plan"}


def _maybe_encrypt(value: Any, field_name: str) -> Any:
    if field_name not in _ENCRYPTED_INITIATIVE_FIELDS:
        return value
    if isinstance(value, str):
        return encrypt_field(value)
    if isinstance(value, list):
        return [encrypt_field(item) for item in value if isinstance(item, str)]
    return value


def _maybe_decrypt(value: Any, field_name: str) -> Any:
    if field_name not in _ENCRYPTED_INITIATIVE_FIELDS:
        return value
    if isinstance(value, str):
        return decrypt_field(value)
    if isinstance(value, list):
        return [decrypt_field(item) for item in value if isinstance(item, str)]
    return value


def _maybe_decrypt_prd(value: Any, field_name: str) -> Any:
    if field_name not in _ENCRYPTED_PRD_FIELDS:
        return value
    if isinstance(value, str):
        return decrypt_field(value)
    return value


def _check_initiative_rate_limit(user_id: str) -> None:
    now = time.time()
    if user_id in _initiative_rate_timestamps:
        _initiative_rate_timestamps.move_to_end(user_id)
    timestamps = _initiative_rate_timestamps.get(user_id, [])
    timestamps = [t for t in timestamps if now - t < _INITIATIVE_RATE_LIMIT_WINDOW]
    if len(timestamps) >= _INITIATIVE_RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Too many initiatives created recently. Please wait before creating another.")
    timestamps.append(now)
    _initiative_rate_timestamps[user_id] = timestamps
    if len(_initiative_rate_timestamps) > 10000:
        _initiative_rate_timestamps.popitem(last=False)


def _is_allowed_ws_origin(origin: Optional[str]) -> bool:
    if not origin:
        return True
    allowed = {o.strip() for o in settings.allowed_origins if o.strip()}
    if not allowed:
        return True
    return origin in allowed


async def _record_initiative_analytics(db, user_id: str, event_name: str, initiative_id: Optional[str] = None, properties: Optional[Dict[str, Any]] = None) -> None:
    try:
        await db.analytics_events.insert_one({
            "id": f"evt_{utcnow().timestamp()}",
            "user_id": user_id,
            "project_id": None,
            "event_name": event_name,
            "properties": {
                "initiative_id": initiative_id,
                **(properties or {}),
            },
            "created_at": utcnow(),
        })
    except Exception:
        logger.debug("Failed to record initiative analytics", exc_info=True)


SAFE_INITIATIVE_FIELDS = {
    "id", "user_id", "org_id", "name", "status", "vision", "business_goals",
    "product_scope", "functional_requirements", "non_functional_requirements",
    "success_metrics", "roadmap", "tech_stack", "risks", "estimated_timeline",
    "project_ids", "created_at", "updated_at", "version",
}

SAFE_PRD_FIELDS = {
    "id", "initiative_id", "executive_summary", "problem_statement", "solution",
    "personas", "user_journeys", "functional_requirements", "non_functional_requirements",
    "security", "performance", "scalability", "api_overview", "database_overview",
    "release_plan", "version", "created_at", "updated_at",
}

GRAPH_DEFAULT_NODE_LIMIT = 200
GRAPH_DEFAULT_EDGE_LIMIT = 500
GRAPH_SAFE_TASK_FIELDS = {"id", "story_id", "epic_id", "initiative_id", "title", "status", "assigned_agent", "kanban_order", "sprint_id", "created_at", "updated_at"}
GRAPH_SAFE_EXECUTION_FIELDS = {"id", "task_id", "initiative_id", "agent", "status", "progress", "cost_usd", "tokens_used", "started_at", "completed_at", "duration_seconds", "created_at"}


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
    version: Optional[int] = None

    @field_validator("roadmap", "risks")
    @classmethod
    def validate_structured_items(cls, value: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
        if value is None:
            return None
        if len(value) > 100:
            raise ValueError("Item list exceeds maximum length of 100")
        cleaned = []
        for item in value:
            if not isinstance(item, dict):
                raise ValueError("Each item must be a dictionary")
            cleaned.append({k: v for k, v in item.items() if isinstance(k, str)})
        return cleaned

    @field_validator("tech_stack", "business_goals", "functional_requirements", "non_functional_requirements", "success_metrics")
    @classmethod
    def validate_string_lists(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        if len(value) > 200:
            raise ValueError("List exceeds maximum length of 200")
        return [str(item) for item in value]


class PaginatedInitiatives(BaseModel):
    initiatives: List[Dict[str, Any]]
    total: int
    page: int
    per_page: int
    total_pages: int


@router.post("/")
async def create_initiative(req: CreateInitiativeRequest, request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    _check_initiative_rate_limit(current_user.id)

    sanitized_prompt = sanitize_prompt(req.prompt)
    if _detect_prompt_injection(sanitized_prompt):
        raise HTTPException(status_code=400, detail="Prompt contains disallowed content")
    name = req.name or sanitized_prompt[:60]

    initiative_cost = settings.credits_initiative_generation

    free_first = await db.users.find_one_and_update(
        {"id": current_user.id, "free_initiative_used": {"$ne": True}},
        {"$set": {"free_initiative_used": True}},
        return_document=True,
    )

    if free_first is not None:
        max_credits = 0
        reserved = free_first
    else:
        reserved = await db.users.find_one_and_update(
            {"id": current_user.id, "credits": {"$gte": initiative_cost}},
            {"$inc": {"credits": -initiative_cost}},
            return_document=True,
        )
        if not reserved:
            raise HTTPException(status_code=402, detail="Insufficient credits")
        max_credits = initiative_cost

    initiative = Initiative(
        user_id=current_user.id,
        name=name,
        prompt=sanitized_prompt,
        status=InitiativeStatus.DRAFT,
    )

    project = Project(
        user_id=current_user.id,
        org_id=initiative.org_id,
        name=name,
        description=sanitized_prompt,
    )
    initiative.project_ids = [project.id]

    try:
        await db.projects.insert_one(project.model_dump())
        await db.initiatives.insert_one(initiative.model_dump())
        await record_audit_log(
            db, request, current_user, "create_initiative", "initiative",
            resource_id=initiative.id,
            changes={"name": name, "credits_reserved": max_credits},
        )
        await _record_initiative_analytics(db, current_user.id, "initiative_created", initiative_id=initiative.id)
        await notify_slack("New initiative created", f"{current_user.name or current_user.id} created initiative: {name}")
        await check_and_send_credit_alerts(
            db, current_user.id, reserved.get("plan", "free"), reserved.get("credits", 0)
        )
        generate_initiative_plan.delay(initiative.id)
    except Exception:
        if max_credits > 0:
            await db.users.update_one(
                {"id": current_user.id}, {"$inc": {"credits": max_credits}}
            )
        elif free_first is not None:
            await db.users.update_one(
                {"id": current_user.id}, {"$set": {"free_initiative_used": False}}
            )
        raise
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
    return {k: _maybe_decrypt(v, k) for k, v in initiative.items() if k in SAFE_INITIATIVE_FIELDS}


@router.get("/{initiative_id}")
async def get_initiative(initiative_id: str, request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    initiative = await _get_owned_initiative(db, initiative_id, current_user.id)
    await record_audit_log(db, request, current_user, "view_initiative", "initiative", resource_id=initiative_id)
    return initiative


@router.put("/{initiative_id}")
async def update_initiative(initiative_id: str, req: UpdateInitiativeRequest, request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    initiative = await _get_owned_initiative(db, initiative_id, current_user.id)
    if not await has_initiative_write_access(db, current_user.id, initiative):
        raise HTTPException(status_code=403, detail="Permission denied")
    update = {k: _maybe_encrypt(v, k) for k, v in req.model_dump().items() if k != "version" and v is not None}
    update["updated_at"] = utcnow()
    update["version"] = 1

    if req.version is not None:
        result = await db.initiatives.update_one(
            {"id": initiative_id, "version": req.version},
            {"$set": update},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=409, detail="Initiative was modified by another session; please reload")
    else:
        await db.initiatives.update_one({"id": initiative_id}, {"$set": update})

    await record_audit_log(
        db, request, current_user, "update_initiative", "initiative",
        resource_id=initiative_id,
        changes={k: v for k, v in update.items() if k != "updated_at" and k != "version"},
    )
    return {"ok": True, "version": update["version"]}


@router.post("/{initiative_id}/regenerate")
async def regenerate_initiative(initiative_id: str, request: Request, confirm: bool = Query(False), current_user: User = Depends(get_current_user)):
    db = await get_db()
    initiative = await _get_owned_initiative(db, initiative_id, current_user.id)
    if not await has_initiative_write_access(db, current_user.id, initiative):
        raise HTTPException(status_code=403, detail="Permission denied")
    if initiative.get("status") == InitiativeStatus.GENERATING.value:
        raise HTTPException(status_code=429, detail="Generation already in progress")

    if not confirm:
        raise HTTPException(status_code=400, detail="Regeneration requires explicit confirmation")

    await record_audit_log(
        db, request, current_user, "regenerate_initiative", "initiative",
        resource_id=initiative_id,
        changes={"name": initiative.get("name")},
    )
    await _record_initiative_analytics(db, current_user.id, "initiative_regenerated", initiative_id=initiative_id)

    await db.prds.delete_many({"initiative_id": initiative_id})
    await db.epics.delete_many({"initiative_id": initiative_id})
    await db.stories.delete_many({"initiative_id": initiative_id})
    await db.tasks.delete_many({"initiative_id": initiative_id})
    await db.sprints.delete_many({"initiative_id": initiative_id})

    generate_initiative_plan.delay(initiative_id)
    return {"ok": True}


@router.get("/{initiative_id}/prd")
async def get_prd(initiative_id: str, format: Optional[str] = None, request: Optional[Request] = None, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _get_owned_initiative(db, initiative_id, current_user.id)
    prd = await db.prds.find_one({"initiative_id": initiative_id}, {"_id": 0})
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not generated yet")
    safe_prd = {k: _maybe_decrypt_prd(v, k) for k, v in prd.items() if k in SAFE_PRD_FIELDS}
    await record_audit_log(db, request, current_user, "view_prd", "prd", resource_id=prd.get("id"))
    await _record_initiative_analytics(db, current_user.id, "prd_viewed", initiative_id=initiative_id)
    if format == "markdown":
        return {"markdown": _prd_to_markdown(safe_prd)}
    return safe_prd


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
async def update_prd(initiative_id: str, req: Dict[str, Any], request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    initiative = await _get_owned_initiative(db, initiative_id, current_user.id)
    if not await has_initiative_write_access(db, current_user.id, initiative):
        raise HTTPException(status_code=403, detail="Permission denied")
    allowed = {
        "executive_summary", "problem_statement", "solution", "personas", "user_journeys",
        "functional_requirements", "non_functional_requirements", "security", "performance",
        "scalability", "api_overview", "database_overview", "release_plan",
    }
    update = {k: _maybe_decrypt_prd(v, k) for k, v in req.items() if k in allowed}
    update["updated_at"] = utcnow()
    update["version"] = 1

    result = await db.prds.update_one({"initiative_id": initiative_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="PRD not generated yet")

    await record_audit_log(
        db, request, current_user, "update_prd", "prd",
        resource_id=initiative_id,
        changes={k: v for k, v in update.items() if k != "updated_at" and k != "version"},
    )
    return {"ok": True, "version": update["version"]}


@router.get("/{initiative_id}/graph")
async def get_dependency_graph(
    initiative_id: str,
    request: Request,
    node_limit: int = Query(GRAPH_DEFAULT_NODE_LIMIT, ge=1, le=1000),
    edge_limit: int = Query(GRAPH_DEFAULT_EDGE_LIMIT, ge=1, le=5000),
    include_files: bool = Query(False),
    include_commits: bool = Query(False),
    include_executions: bool = Query(False),
    current_user: User = Depends(get_current_user),
):
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
        nodes.append({"id": f"epic:{epic['id']}", "type": "epic", "label": epic["title"]})
        edges.append({"source": f"initiative:{initiative_id}", "target": f"epic:{epic['id']}"})
        for dep in epic.get("dependencies", []):
            edges.append({"source": f"epic:{dep}", "target": f"epic:{epic['id']}", "kind": "dependency"})

    for story in stories:
        nodes.append({"id": f"story:{story['id']}", "type": "story", "label": story["title"]})
        edges.append({"source": f"epic:{story['epic_id']}", "target": f"story:{story['id']}"})
        for dep in story.get("dependencies", []):
            edges.append({"source": f"story:{dep}", "target": f"story:{story['id']}", "kind": "dependency"})

    for task in tasks:
        nodes.append({"id": f"task:{task['id']}", "type": "task", "label": task["title"], "data": {k: v for k, v in task.items() if k in GRAPH_SAFE_TASK_FIELDS}})
        edges.append({"source": f"story:{task['story_id']}", "target": f"task:{task['id']}"})
        for dep in task.get("dependencies", []):
            edges.append({"source": f"task:{dep}", "target": f"task:{task['id']}", "kind": "dependency"})
        if include_files:
            for path in task.get("generated_files", []):
                file_id = f"file:{task['id']}:{path}"
                nodes.append({"id": file_id, "type": "file", "label": path})
                edges.append({"source": f"task:{task['id']}", "target": file_id})
        github = task.get("github") or {}
        if include_commits:
            for sha in github.get("commit_shas", []) or []:
                commit_id = f"commit:{sha}"
                nodes.append({"id": commit_id, "type": "commit", "label": sha[:7]})
                edges.append({"source": f"task:{task['id']}", "target": commit_id})

    if include_executions:
        for execution in executions:
            exec_id = f"execution:{execution['id']}"
            nodes.append({"id": exec_id, "type": "agent_execution", "label": execution["agent"], "data": {k: v for k, v in execution.items() if k in GRAPH_SAFE_EXECUTION_FIELDS}})
            edges.append({"source": f"task:{execution['task_id']}", "target": exec_id})

    await record_audit_log(db, request, current_user, "view_graph", "initiative", resource_id=initiative_id)
    return {
        "nodes": nodes[:node_limit],
        "edges": edges[:edge_limit],
        "truncated": len(nodes) > node_limit or len(edges) > edge_limit,
    }


@router.post("/{initiative_id}/approve")
async def approve_initiative(initiative_id: str, request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    initiative = await _get_owned_initiative(db, initiative_id, current_user.id)
    if not await has_initiative_write_access(db, current_user.id, initiative):
        raise HTTPException(status_code=403, detail="Permission denied")
    status = initiative.get("status")
    if status not in (InitiativeStatus.GENERATING.value, InitiativeStatus.FAILED.value):
        raise HTTPException(status_code=400, detail="Initiative is not pending approval")

    await db.initiatives.update_one(
        {"id": initiative_id},
        {"$set": {"status": InitiativeStatus.ACTIVE.value, "updated_at": utcnow()}},
    )
    await record_audit_log(
        db, request, current_user, "approve_initiative", "initiative",
        resource_id=initiative_id,
        changes={"status": InitiativeStatus.ACTIVE.value},
    )
    await _record_initiative_analytics(db, current_user.id, "initiative_approved", initiative_id=initiative_id)
    await notify_slack("Initiative approved", f"{current_user.name or current_user.id} approved initiative: {initiative.get('name')}")
    return {"ok": True, "status": InitiativeStatus.ACTIVE.value}


class PRDCommentRequest(BaseModel):
    section: Optional[str] = Field(None, max_length=200)
    comment: str = Field(..., max_length=5000)


class PRDApprovalRequest(BaseModel):
    approved: bool
    comment: Optional[str] = Field(None, max_length=5000)


@router.get("/{initiative_id}/comments")
async def list_prd_comments(initiative_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _get_owned_initiative(db, initiative_id, current_user.id)
    comments = await db.prd_comments.find({"initiative_id": initiative_id}, {"_id": 0}).sort("created_at", -1).to_list(None)
    return {"comments": comments}


@router.post("/{initiative_id}/comments")
async def create_prd_comment(initiative_id: str, req: PRDCommentRequest, request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    initiative = await _get_owned_initiative(db, initiative_id, current_user.id)
    prd = await db.prds.find_one({"initiative_id": initiative_id}, {"_id": 0})
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not generated yet")

    comment = PRDComment(
        initiative_id=initiative_id,
        prd_id=prd["id"],
        user_id=current_user.id,
        section=req.section or "",
        comment=req.comment,
    )
    await db.prd_comments.insert_one(comment.model_dump())
    await record_audit_log(
        db, request, current_user, "create_prd_comment", "prd",
        resource_id=initiative_id,
        changes={"section": req.section, "comment": req.comment},
    )
    await _record_initiative_analytics(db, current_user.id, "prd_commented", initiative_id=initiative_id)
    return comment.model_dump()


@router.get("/{initiative_id}/approvals")
async def list_prd_approvals(initiative_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _get_owned_initiative(db, initiative_id, current_user.id)
    approvals = await db.prd_approvals.find({"initiative_id": initiative_id}, {"_id": 0}).sort("created_at", -1).to_list(None)
    return {"approvals": approvals}


@router.post("/{initiative_id}/approvals")
async def create_prd_approval(initiative_id: str, req: PRDApprovalRequest, request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    initiative = await _get_owned_initiative(db, initiative_id, current_user.id)
    prd = await db.prds.find_one({"initiative_id": initiative_id}, {"_id": 0})
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not generated yet")

    approval = PRDApproval(
        initiative_id=initiative_id,
        prd_id=prd["id"],
        user_id=current_user.id,
        approved=req.approved,
        comment=req.comment or "",
    )
    await db.prd_approvals.insert_one(approval.model_dump())
    await record_audit_log(
        db, request, current_user, "create_prd_approval", "prd",
        resource_id=initiative_id,
        changes={"approved": req.approved, "comment": req.comment},
    )
    await _record_initiative_analytics(db, current_user.id, "prd_approval_created", initiative_id=initiative_id)
    return approval.model_dump()


@router.get("/{initiative_id}/export")
async def export_initiative(initiative_id: str, request: Request, current_user: User = Depends(get_current_user)):
    db = await get_db()
    initiative = await _get_owned_initiative(db, initiative_id, current_user.id)
    prd = await db.prds.find_one({"initiative_id": initiative_id}, {"_id": 0})
    epics = await db.epics.find({"initiative_id": initiative_id}, {"_id": 0}).to_list(None)
    stories = await db.stories.find({"initiative_id": initiative_id}, {"_id": 0}).to_list(None)
    tasks = await db.tasks.find({"initiative_id": initiative_id}, {"_id": 0}).to_list(None)
    sprints = await db.sprints.find({"initiative_id": initiative_id}, {"_id": 0}).to_list(None)

    export_data = {
        "initiative": initiative,
        "prd": {k: v for k, v in prd.items() if k in SAFE_PRD_FIELDS} if prd else None,
        "epics": epics,
        "stories": stories,
        "tasks": tasks,
        "sprints": sprints,
        "exported_at": utcnow().isoformat(),
    }
    await record_audit_log(db, request, current_user, "export_initiative", "initiative", resource_id=initiative_id)
    await _record_initiative_analytics(db, current_user.id, "initiative_exported", initiative_id=initiative_id)
    return export_data


@router.websocket("/ws/{initiative_id}")
async def initiative_websocket(websocket: WebSocket, initiative_id: str, token: Optional[str] = Query(None)):
    origin = websocket.headers.get("origin")
    if not _is_allowed_ws_origin(origin):
        await websocket.accept()
        await websocket.close(code=4001, reason="Invalid origin")
        return

    header_token = websocket.headers.get("sec-websocket-protocol")
    ws_token = token or header_token
    user = await authenticate_pm_websocket_token(ws_token, initiative_id=initiative_id)
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
