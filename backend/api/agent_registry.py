"""API surface for the persistent Agent Registry / engineering org chart.

Scoped under a project because each imported repository gets its own
persistent org -- agents are never recreated per-request, only looked up,
created once (dynamic specialists), promoted, or retired.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from api.auth import get_current_user
from core.database import get_db
from core.models import User
from core.permissions import has_project_access
from services.org_ws_manager import org_manager, authenticate_org_websocket

from agent_registry import (
    AgentNotFound,
    ChangeRequestNotFound,
    FindingCategory,
    FindingNotFound,
    FindingSeverity,
    FindingStatus,
    InvalidStageTransition,
    MessageType,
    PRStage,
    PromotionNotEligible,
    UnknownAgent,
    get_agent_registry,
    get_code_ownership,
    get_knowledge_graph,
    get_pr_workflow,
    get_repository_monitor,
    get_task_router,
    get_team_chat,
)
from agent_registry.planning import PlanNotFound
from agent_registry.pr_workflow import PlanNotApproved

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
    approved_by_agent_id: Optional[str] = None


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


class OpenChangeRequest(BaseModel):
    title: str
    author_agent_id: str
    description: str = ""
    changed_paths: Optional[list[str]] = None
    plan_id: Optional[str] = None


class AdvanceStageRequest(BaseModel):
    to_stage: PRStage
    actor_agent_id: str
    note: str = ""


class RequestReviewRequest(BaseModel):
    requester_agent_id: str
    reviewer_agent_id: str


class SubmitReviewRequest(BaseModel):
    reviewer_agent_id: str
    approved: bool
    comment: str = ""


class MergeRequest(BaseModel):
    actor_agent_id: str


class RecordFindingRequest(BaseModel):
    category: FindingCategory
    severity: FindingSeverity
    title: str
    description: str = ""
    source: str = "manual"
    auto_escalate: bool = True


class ResolveFindingRequest(BaseModel):
    resolved_by_agent_id: str


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
        agent = await registry.promote(
            project_id,
            agent_id,
            reason=req.reason,
            force=req.force,
            approved_by_agent_id=req.approved_by_agent_id,
        )
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


@router.post("/changes")
async def open_change_request(
    project_id: str, req: OpenChangeRequest, current_user: User = Depends(get_current_user)
):
    """Open a change request in the PLANNING stage. Reviewers are
    auto-suggested from whoever already owns the touched paths."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    workflow = get_pr_workflow()
    try:
        cr = await workflow.open(
            project_id, req.title, req.author_agent_id,
            description=req.description, changed_paths=req.changed_paths,
            plan_id=req.plan_id,
        )
    except (AgentNotFound, PlanNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PlanNotApproved as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return cr


@router.get("/changes")
async def list_change_requests(project_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    workflow = get_pr_workflow()
    changes = await workflow.list_for_project(project_id)
    return {"changes": changes}


@router.get("/changes/{cr_id}")
async def get_change_request(project_id: str, cr_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    workflow = get_pr_workflow()
    try:
        cr = await workflow.get(project_id, cr_id)
    except ChangeRequestNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return cr


@router.post("/changes/{cr_id}/advance")
async def advance_change_request(
    project_id: str, cr_id: str, req: AdvanceStageRequest, current_user: User = Depends(get_current_user)
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    workflow = get_pr_workflow()
    try:
        cr = await workflow.advance(project_id, cr_id, req.to_stage, req.actor_agent_id, note=req.note)
    except (ChangeRequestNotFound, AgentNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidStageTransition as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return cr


@router.post("/changes/{cr_id}/request-review")
async def request_change_review(
    project_id: str, cr_id: str, req: RequestReviewRequest, current_user: User = Depends(get_current_user)
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    workflow = get_pr_workflow()
    try:
        cr = await workflow.request_review(project_id, cr_id, req.requester_agent_id, req.reviewer_agent_id)
    except (ChangeRequestNotFound, AgentNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return cr


@router.post("/changes/{cr_id}/review")
async def submit_change_review(
    project_id: str, cr_id: str, req: SubmitReviewRequest, current_user: User = Depends(get_current_user)
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    workflow = get_pr_workflow()
    try:
        cr = await workflow.submit_review(
            project_id, cr_id, req.reviewer_agent_id, approved=req.approved, comment=req.comment
        )
    except (ChangeRequestNotFound, AgentNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return cr


@router.post("/changes/{cr_id}/merge")
async def merge_change_request(
    project_id: str, cr_id: str, req: MergeRequest, current_user: User = Depends(get_current_user)
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    workflow = get_pr_workflow()
    try:
        cr = await workflow.merge(project_id, cr_id, req.actor_agent_id)
    except (ChangeRequestNotFound, AgentNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except InvalidStageTransition as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return cr


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


@router.post("/monitoring/findings")
async def record_finding(
    project_id: str, req: RecordFindingRequest, current_user: User = Depends(get_current_user)
):
    """Intake a monitoring finding (CI failure, security issue, performance
    regression, etc.) from any watch source. HIGH/CRITICAL findings are
    auto-escalated into a routed change request unless disabled."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    monitor = get_repository_monitor()
    finding = await monitor.record_finding(
        project_id,
        req.category,
        req.severity,
        req.title,
        description=req.description,
        source=req.source,
        auto_escalate=req.auto_escalate,
    )
    return finding


@router.get("/monitoring/findings")
async def list_findings(
    project_id: str,
    status: Optional[FindingStatus] = None,
    category: Optional[FindingCategory] = None,
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    monitor = get_repository_monitor()
    findings = await monitor.list_findings(project_id, status=status, category=category, limit=limit)
    return {"findings": findings}


@router.post("/monitoring/findings/{finding_id}/resolve")
async def resolve_finding(
    project_id: str,
    finding_id: str,
    req: ResolveFindingRequest,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    monitor = get_repository_monitor()
    try:
        finding = await monitor.resolve(project_id, finding_id, resolved_by_agent_id=req.resolved_by_agent_id)
    except (FindingNotFound, AgentNotFound) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return finding


@router.websocket("/ws")
async def org_websocket(websocket: WebSocket, project_id: str):
    user = await authenticate_org_websocket(websocket, project_id)
    if not user:
        return

    await org_manager.connect(websocket, project_id)
    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        org_manager.disconnect(websocket, project_id)
