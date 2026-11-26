"""API surface for Forge AI's P0 Protocol Gateway (AG-UI, MCP, A2UI).

Exposes authenticated, project-scoped endpoints under
`/v1/projects/{project_id}/protocols/*`:
- AG-UI SSE stream (`GET /agui/runs/{run_id}/stream`) with Last-Event-ID replay
- MCP governed tool catalog & invocation (`GET /mcp/tools`, `POST /mcp/invoke`)
- A2UI declarative surfaces (`GET /a2ui/runs/{run_id}/surfaces`)
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.auth import get_current_user
from core.a2a_adapter import A2ATaskRequest, build_forge_agent_card, get_a2a_gateway
from core.agent_kernel import get_agent_kernel, get_kernel_run_repository
from core.database import get_db, get_redis
from core.models import User
from core.permissions import has_project_access
from core.protocol_gateway import (
    agui_event_to_ai_sdk_chunks,
    build_a2ui_surfaces_for_run,
    get_agui_broker,
    get_mcp_gateway,
)

router = APIRouter(prefix="/projects/{project_id}/protocols", tags=["protocol-gateway"])


async def _assert_project_access(db, project_id: str, user_id: str) -> Dict[str, Any]:
    project = await db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _load_project_run_dict(project_id: str, run_id: str) -> Dict[str, Any]:
    active = get_agent_kernel().get_active_run(run_id)
    if active is not None and active.project_id == project_id:
        return active.to_dict()
    repo = get_kernel_run_repository()
    doc = await repo.get(project_id, run_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Kernel run not found")
    return doc


def _ensure_distributed_hooks(db) -> None:
    """Attach fail-open Redis Pub/Sub & MongoDB audit hooks to protocol singletons."""
    broker = get_agui_broker()
    if broker._redis_publisher is None:
        async def _publish_redis(channel: str, payload: str) -> None:
            redis = await get_redis()
            await redis.publish(channel, payload)

        broker.attach_redis_publisher(_publish_redis)

    gw = get_mcp_gateway()
    if gw._audit_persister is None:
        async def _persist_audit(record: Dict[str, Any]) -> None:
            await db.mcp_audit_logs.insert_one(dict(record))

        gw.attach_audit_persister(_persist_audit)


class MCPInvokeRequest(BaseModel):
    tool_name: str = Field(..., min_length=2, max_length=128)
    role: str = Field(..., min_length=2, max_length=64)
    department: str = Field(..., min_length=2, max_length=64)
    arguments: Dict[str, Any] = Field(default_factory=dict)


class RegisterMCPServerRequest(BaseModel):
    server_id: str = Field(..., min_length=2, max_length=48)
    endpoint_url: str = Field(..., min_length=10, max_length=512)
    discover_tools: bool = Field(False)


class A2ASendTaskBody(BaseModel):
    objective: str = Field(..., min_length=3, max_length=4000)
    caller_agent: str = Field("external-a2a-client", min_length=2, max_length=128)
    max_agents: int = Field(6, ge=2, le=10)
    max_budget_usd: float = Field(1.50, ge=0.05, le=25.0)
    execute_now: bool = Field(False)


@router.get("/agui/runs/{run_id}/stream")
async def stream_agui_run_events(
    project_id: str,
    run_id: str,
    after_event_id: int = Query(0, ge=0),
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
    current_user: User = Depends(get_current_user),
):
    """Stream live AG-UI Server-Sent Events for a KernelRun with idempotent replay."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    await _load_project_run_dict(project_id, run_id)

    resume_id = after_event_id
    if last_event_id and last_event_id.isdigit():
        resume_id = max(resume_id, int(last_event_id))

    broker = get_agui_broker()

    async def _event_generator():
        async for ev in broker.subscribe(run_id, after_event_id=resume_id):
            yield ev.to_sse()

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/ai-sdk/runs/{run_id}/stream")
async def stream_ai_sdk_run_events(
    project_id: str,
    run_id: str,
    after_event_id: int = Query(0, ge=0),
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
    current_user: User = Depends(get_current_user),
):
    """Stream AI SDK UI Stream Protocol v1 SSE frames backed by AGUIStreamBroker."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    await _load_project_run_dict(project_id, run_id)

    resume_id = after_event_id
    if last_event_id and last_event_id.isdigit():
        resume_id = max(resume_id, int(last_event_id))

    broker = get_agui_broker()

    async def _ai_sdk_generator():
        async for ev in broker.subscribe(run_id, after_event_id=resume_id):
            for chunk in agui_event_to_ai_sdk_chunks(ev):
                yield chunk

    return StreamingResponse(
        _ai_sdk_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "x-vercel-ai-ui-message-stream": "v1",
        },
    )


@router.get("/mcp/tools")
async def list_mcp_tools(
    project_id: str,
    department: Optional[str] = Query(None, max_length=64),
    current_user: User = Depends(get_current_user),
):
    """List registered MCP servers, governed tools, P1 MCP Apps, and project audit log."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    gw = get_mcp_gateway()
    return {
        "servers": gw.list_servers(),
        "tools": gw.list_tools(department=department),
        "apps": gw.list_apps(),
        "audit_log": gw.get_audit_log(project_id=project_id, limit=25),
    }


@router.get("/mcp/apps")
async def list_mcp_apps(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """List declarative P1 MCP Apps bound to governed tools."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    gw = get_mcp_gateway()
    return {
        "protocol": "mcp-apps/v1",
        "apps": gw.list_apps(),
    }


@router.post("/mcp/servers")
async def register_external_mcp_server(
    project_id: str,
    req: RegisterMCPServerRequest,
    current_user: User = Depends(get_current_user),
):
    """Register an external HTTPS Streamable HTTP MCP server with SSRF validation."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    gw = get_mcp_gateway()
    try:
        server = gw.register_external_server(req.server_id, req.endpoint_url)
        discovered = []
        if req.discover_tools:
            discovered = await gw.discover_external_tools(server["server_id"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "server": server,
        "discovered_tools": discovered,
    }


@router.post("/mcp/invoke")
async def invoke_mcp_tool(
    project_id: str,
    req: MCPInvokeRequest,
    current_user: User = Depends(get_current_user),
):
    """Invoke a governed MCP tool subject to per-department allowlist and audit logging."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    gw = get_mcp_gateway()
    result = await gw.invoke_tool(
        tool_name=req.tool_name,
        arguments=req.arguments,
        role=req.role,
        department=req.department,
        project_id=project_id,
    )
    if not result.get("ok") and result.get("audit", {}).get("status") == "denied":
        raise HTTPException(status_code=403, detail=result.get("error") or "Tool invocation denied")
    return result


@router.get("/a2ui/runs/{run_id}/surfaces")
async def get_a2ui_run_surfaces(
    project_id: str,
    run_id: str,
    current_user: User = Depends(get_current_user),
):
    """Return declarative, typed A2UI surfaces synthesized from the KernelRun state."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    run_doc = await _load_project_run_dict(project_id, run_id)
    return {
        "run_id": run_id,
        "protocol": "a2ui/v1",
        "surfaces": build_a2ui_surfaces_for_run(run_doc),
    }


@router.get("/a2a/agent-card")
async def get_a2a_agent_card(
    project_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Return Forge AI's dynamic P1 A2A Agent Card for project-scoped interoperability."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    base_url = str(request.base_url).rstrip("/")
    card = build_forge_agent_card(project_id=project_id, base_url=base_url)
    return card.to_dict()


@router.post("/a2a/tasks/send")
async def send_a2a_task(
    project_id: str,
    body: A2ASendTaskBody,
    current_user: User = Depends(get_current_user),
):
    """Accept a governed P1 A2A task request and dispatch it through Forge's AgentKernel."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    try:
        resp = await get_a2a_gateway().send_task(
            A2ATaskRequest(
                objective=body.objective,
                project_id=project_id,
                caller_agent=body.caller_agent,
                max_agents=body.max_agents,
                max_budget_usd=body.max_budget_usd,
                execute_now=body.execute_now,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return resp.to_dict()
