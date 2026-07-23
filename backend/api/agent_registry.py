"""API surface for the persistent Agent Registry / engineering org chart.

Scoped under a project because each imported repository gets its own
persistent org -- agents are never recreated per-request, only looked up,
created once (dynamic specialists), promoted, or retired.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.auth import get_current_user
from core.database import get_db
from core.models import User
from core.permissions import has_project_access

from agent_registry import (
    AgentNotFound,
    MessageType,
    PromotionNotEligible,
    UnknownAgent,
    get_agent_registry,
    get_code_ownership,
    get_knowledge_graph,
    get_task_router,
    get_team_chat,
)

router = APIRouter(prefix="/projects/{project_id}/org", tags=["agent-registry"])


async def _assert_project_access(db, project_id: str, user_id: str) -> None:
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")


class CreateAgentRequest(BaseModel):
    role: str
    department: Optional[str] = None
    display_name: Optional[str] = None


class TaskResultRequest(BaseModel):
    success: bool
    tokens: int = 0
    cost: float = 0.0
    files_touched: Optional[list[str]] = None
    review_score: Optional[float] = None


class PromoteRequest(BaseModel):
    reason: str = ""
    force: bool = False


class RetireRequest(BaseModel):
    reason: str = ""


class RouteRequest(BaseModel):
    request: str
    max_assignments: int = 3


class OwnershipCheckRequest(BaseModel):
    agent_id: str
    paths: list[str]


class PostMessageRequest(BaseModel):
    from_agent_id: str
    content: str
    message_type: MessageType = MessageType.COMMENT
    to_agent_ids: Optional[list[str]] = None
    thread_id: Optional[str] = None
    reply_to_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


@router.get("")
async def get_org(project_id: str, current_user: User = Depends(get_current_user)):
    """Return the project's engineering org chart, seeding the default one
    (CTO/PM/Architect/Tech Lead + departments) on first access."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    registry = get_agent_registry()
    org = await registry.get_or_create_org(project_id)
    agents = await registry.list_agents(project_id)
    return {"org": org, "agents": agents}


@router.get("/agents/{agent_id}")
async def get_agent(project_id: str, agent_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    registry = get_agent_registry()
    try:
        agent = await registry.get_agent(project_id, agent_id)
    except AgentNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return agent


@router.post("/agents")
async def create_agent(
    project_id: str, req: CreateAgentRequest, current_user: User = Depends(get_current_user)
):
    """Dynamic agent creation: if a persistent agent for `role` already
    exists it's returned as-is; otherwise a new specialist is created and
    permanently joins the org."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    registry = get_agent_registry()
    agent, created = await registry.get_or_create_agent(
        project_id, req.role, department=req.department, display_name=req.display_name
    )
    return {"agent": agent, "created": created}


@router.post("/agents/{agent_id}/tasks")
async def record_task_result(
    project_id: str,
    agent_id: str,
    req: TaskResultRequest,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    registry = get_agent_registry()
    try:
        agent = await registry.record_task_result(
            project_id,
            agent_id,
            success=req.success,
            tokens=req.tokens,
            cost=req.cost,
            files_touched=req.files_touched,
            review_score=req.review_score,
        )
    except AgentNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return agent


@router.post("/agents/{agent_id}/promote")
async def promote_agent(
    project_id: str,
    agent_id: str,
    req: PromoteRequest,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    registry = get_agent_registry()
    try:
        agent = await registry.promote(project_id, agent_id, reason=req.reason, force=req.force)
    except AgentNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PromotionNotEligible as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return agent


@router.post("/route")
async def route_request(
    project_id: str, req: RouteRequest, current_user: User = Depends(get_current_user)
):
    """Intelligent Task Router: classify a free-text request ("improve
    dashboard performance") into the department/role(s) that should own it,
    resolving (or creating) the persistent agent for each."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    router_ = get_task_router()
    assignments = await router_.route(project_id, req.request, max_assignments=req.max_assignments)
    return {"assignments": assignments}


@router.get("/ownership")
async def get_ownership_summary(project_id: str, current_user: User = Depends(get_current_user)):
    """Per-agent breakdown of owned files, bucketed by top-level path segment."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    ownership = get_code_ownership()
    summary = await ownership.ownership_summary(project_id)
    return {"summary": summary}


@router.post("/ownership/check")
async def check_ownership(
    project_id: str, req: OwnershipCheckRequest, current_user: User = Depends(get_current_user)
):
    """Classify each path in a proposed changeset relative to `agent_id`:
    owned_by_you / unclaimed / owned_by_other (should probably get that
    agent's review)."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    ownership = get_code_ownership()
    results = await ownership.check_change(project_id, req.agent_id, req.paths)
    return {"results": results}


@router.get("/chat")
async def list_messages(
    project_id: str,
    thread_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    """List team-chat messages for the project, optionally filtered to a
    thread or to messages involving a specific agent."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    chat = get_team_chat()
    messages = await chat.list_messages(project_id, thread_id=thread_id, agent_id=agent_id, limit=limit)
    return {"messages": messages}


@router.post("/chat")
async def post_message(
    project_id: str, req: PostMessageRequest, current_user: User = Depends(get_current_user)
):
    """Post a message from one registered agent to zero or more others --
    a comment, question, review request, approval/rejection, escalation,
    delegation, or shared finding. Only real agents in this project's org
    may send or receive messages."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    chat = get_team_chat()
    try:
        message = await chat.post(
            project_id,
            req.from_agent_id,
            req.content,
            message_type=req.message_type,
            to_agent_ids=req.to_agent_ids,
            thread_id=req.thread_id,
            reply_to_id=req.reply_to_id,
            context=req.context,
        )
    except UnknownAgent as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return message


@router.get("/graph")
async def get_graph(project_id: str, current_user: User = Depends(get_current_user)):
    """Full knowledge graph for the project: agents, the files they own,
    recent builds, and each agent's decision history (promotions, creation,
    retirement)."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    kg = get_knowledge_graph()
    graph = await kg.build_for_project(project_id)
    return {"nodes": list(graph.nodes.values()), "edges": graph.edges}


@router.get("/graph/neighbors")
async def get_graph_neighbors(
    project_id: str, node_id: str = Query(...), current_user: User = Depends(get_current_user)
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    kg = get_knowledge_graph()
    neighbors = await kg.neighbors(project_id, node_id)
    return {"neighbors": neighbors}


@router.get("/graph/search")
async def search_graph(
    project_id: str, q: str = Query(...), current_user: User = Depends(get_current_user)
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    kg = get_knowledge_graph()
    results = await kg.search(project_id, q)
    return {"results": results}


@router.post("/agents/{agent_id}/retire")
async def retire_agent(
    project_id: str,
    agent_id: str,
    req: RetireRequest,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    registry = get_agent_registry()
    try:
        agent = await registry.retire(project_id, agent_id, reason=req.reason)
    except AgentNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return agent
