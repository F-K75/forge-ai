"""API surface for Forge AI's P0 Protocol Gateway (AG-UI, MCP, A2UI).

Exposes authenticated, project-scoped endpoints under
`/v1/projects/{project_id}/protocols/*`:
- AG-UI SSE stream (`GET /agui/runs/{run_id}/stream`) with Last-Event-ID replay
- MCP governed tool catalog & invocation (`GET /mcp/tools`, `POST /mcp/invoke`)
- A2UI declarative surfaces (`GET /a2ui/runs/{run_id}/surfaces`)
- MCP Apps sandboxed UI resources (`GET /mcp/apps/{app_id}/resource`)
- A2A inbound JSON-RPC (`POST /a2a/rpc`: tasks/send, tasks/get, tasks/cancel), the
  project-scoped agent card (`GET /a2a/.well-known/agent.json`), and governed
  outbound calls to remote A2A agents (`/a2a/remote/*`)
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from api.auth import get_current_user
from core.a2a_adapter import (
    JSONRPC_PARSE_ERROR,
    MAX_A2A_RPC_BODY_BYTES,
    A2ABlockedURLError,
    A2ARemoteError,
    A2ARpcError,
    A2ATaskRequest,
    build_forge_agent_card,
    get_a2a_gateway,
    jsonrpc_error,
)
from core.config import get_settings
from core.mcp_apps import MCPAppResourceError, MCPAppsService
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

    a2a = get_a2a_gateway()
    if a2a._audit_persister is None:
        async def _persist_a2a_audit(record: Dict[str, Any]) -> None:
            await db.a2a_audit_logs.insert_one(dict(record))

        a2a.attach_audit_persister(_persist_a2a_audit)


async def read_bounded_json(request: Request, *, limit: int = MAX_A2A_RPC_BODY_BYTES) -> Any:
    """Read and parse a JSON request body without buffering more than `limit` bytes.

    Raises HTTP 413 when the declared or streamed size exceeds `limit`, HTTP 415
    on a non-JSON content type, and `json.JSONDecodeError` on malformed JSON.
    """
    ctype = request.headers.get("content-type", "").split(";")[0].strip().lower()
    if ctype != "application/json":
        raise HTTPException(status_code=415, detail="Content-Type must be application/json")
    declared = request.headers.get("content-length")
    if declared is not None:
        if not declared.isdigit():
            raise HTTPException(status_code=400, detail="Invalid Content-Length")
        if int(declared) > limit:
            raise HTTPException(status_code=413, detail=f"Request body exceeds {limit} bytes")
    buf = bytearray()
    async for chunk in request.stream():
        buf.extend(chunk)
        if len(buf) > limit:
            raise HTTPException(status_code=413, detail=f"Request body exceeds {limit} bytes")
    return json.loads(bytes(buf).decode("utf-8"))


def public_api_base_url() -> str:
    """Canonical public API origin for advertised URLs (never the Host header)."""
    return (get_settings().api_url or "").rstrip("/")


class MCPInvokeRequest(BaseModel):
    tool_name: str = Field(..., min_length=2, max_length=128)
    role: str = Field(..., min_length=2, max_length=64)
    department: str = Field(..., min_length=2, max_length=64)
    arguments: Dict[str, Any] = Field(default_factory=dict)


class RegisterMCPServerRequest(BaseModel):
    server_id: str = Field(..., min_length=2, max_length=48)
    endpoint_url: str = Field(..., min_length=10, max_length=512)
    discover_tools: bool = Field(False)


class A2ARemoteDiscoverBody(BaseModel):
    agent_url: str = Field(..., min_length=10, max_length=2048)


class A2ARemoteSendBody(BaseModel):
    endpoint_url: str = Field(..., min_length=10, max_length=2048)
    text: str = Field(..., min_length=3, max_length=4000)
    task_id: Optional[str] = Field(None, min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:\-]{0,127}$")
    wait_seconds: float = Field(0.0, ge=0.0, le=30.0)


class A2ARemoteTaskBody(BaseModel):
    endpoint_url: str = Field(..., min_length=10, max_length=2048)


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


# --------------------------------------------------------------------------- #
# MCP Apps: sandboxed ui:// resources
# --------------------------------------------------------------------------- #

_TASK_ID_PATH = Path(..., min_length=1, max_length=128, pattern=r"^[A-Za-z0-9][A-Za-z0-9_.:\-]{0,127}$")


@router.get("/mcp/apps/{app_id}/resource")
async def get_mcp_app_resource(
    project_id: str,
    app_id: str = Path(..., min_length=2, max_length=128, pattern=r"^[A-Za-z0-9_\-]+$"),
    role: str = Query(..., min_length=2, max_length=64),
    department: str = Query(..., min_length=2, max_length=64),
    current_user: User = Depends(get_current_user),
):
    """Fetch an MCP App's `ui://` resource, validated and wrapped for a sandboxed iframe.

    The returned `html` must only be rendered via `<iframe srcdoc sandbox="allow-scripts">`
    using the `sandbox` metadata; it is never served as a document from Forge's origin.
    """
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    service = MCPAppsService(get_mcp_gateway())
    try:
        payload = await service.fetch_app_resource(
            app_id=app_id, role=role, department=department, project_id=project_id
        )
    except MCPAppResourceError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    return JSONResponse(payload.to_dict(), headers={"Cache-Control": "no-store"})


# --------------------------------------------------------------------------- #
# A2A inbound: project-scoped agent card + JSON-RPC task endpoint
# --------------------------------------------------------------------------- #


@router.get("/a2a/.well-known/agent.json")
async def get_project_a2a_agent_card(
    project_id: str,
    current_user: User = Depends(get_current_user),
):
    """Project-scoped A2A Agent Card advertising this project's JSON-RPC endpoint."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    base = public_api_base_url()
    card = build_forge_agent_card(
        project_id=project_id,
        base_url=base,
        endpoint_url=f"{base}/v1/projects/{project_id}/protocols/a2a/rpc",
    )
    return card.to_dict()


@router.post("/a2a/rpc")
async def a2a_jsonrpc(
    project_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """A2A JSON-RPC 2.0 endpoint: `tasks/send`, `tasks/get`, `tasks/cancel`.

    Body is capped at 64 KB; protocol errors are returned as JSON-RPC errors.
    """
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    try:
        payload = await read_bounded_json(request)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return jsonrpc_error(None, JSONRPC_PARSE_ERROR, "Parse error")
    return await get_a2a_gateway().handle_jsonrpc(
        payload, project_id=project_id, actor=current_user.id
    )


@router.get("/a2a/tasks/{task_id}")
async def get_a2a_task(
    project_id: str,
    task_id: str = _TASK_ID_PATH,
    current_user: User = Depends(get_current_user),
):
    """REST view of an inbound A2A task (A2A `Task` shape)."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    rec = get_a2a_gateway().get_task(project_id=project_id, task_id=task_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="A2A task not found")
    return rec.to_a2a_task()


@router.post("/a2a/tasks/{task_id}/cancel")
async def cancel_a2a_task(
    project_id: str,
    task_id: str = _TASK_ID_PATH,
    current_user: User = Depends(get_current_user),
):
    """REST cancel for an inbound A2A task."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    try:
        rec = await get_a2a_gateway().cancel_task(project_id=project_id, task_id=task_id)
    except A2ARpcError as exc:
        raise HTTPException(status_code=404 if exc.code == -32001 else 409, detail=exc.message) from exc
    return rec.to_a2a_task()


@router.get("/a2a/audit")
async def get_a2a_audit_log(
    project_id: str,
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
):
    """Inbound & outbound A2A audit trail for this project."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    return {"audit_log": get_a2a_gateway().get_audit_log(project_id=project_id, limit=limit)}


# --------------------------------------------------------------------------- #
# A2A outbound: governed calls to remote agents
# --------------------------------------------------------------------------- #


def _remote_error(exc: A2ARemoteError) -> HTTPException:
    status = 400 if isinstance(exc, A2ABlockedURLError) else 502
    return HTTPException(status_code=status, detail=str(exc)[:300])


@router.post("/a2a/remote/discover")
async def discover_remote_a2a_agent(
    project_id: str,
    body: A2ARemoteDiscoverBody,
    current_user: User = Depends(get_current_user),
):
    """Fetch and validate a remote agent's A2A card (SSRF-guarded)."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    try:
        return await get_a2a_gateway().fetch_remote_agent_card(
            body.agent_url, project_id=project_id, actor=current_user.id
        )
    except A2ARemoteError as exc:
        raise _remote_error(exc) from exc


@router.post("/a2a/remote/tasks/send")
async def send_remote_a2a_task(
    project_id: str,
    body: A2ARemoteSendBody,
    current_user: User = Depends(get_current_user),
):
    """Send a task to a remote A2A agent; optionally poll up to `wait_seconds`."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    gw = get_a2a_gateway()
    try:
        task = await gw.send_remote_task(
            body.endpoint_url,
            project_id=project_id,
            text=body.text,
            task_id=body.task_id,
            actor=current_user.id,
        )
        if body.wait_seconds > 0 and task["status"]["state"] not in ("completed", "canceled", "failed"):
            task = await gw.poll_remote_task(
                body.endpoint_url,
                project_id=project_id,
                task_id=task["id"],
                interval_seconds=min(2.0, max(0.25, body.wait_seconds / 10)),
                timeout_seconds=body.wait_seconds,
                actor=current_user.id,
            )
    except A2ARemoteError as exc:
        raise _remote_error(exc) from exc
    return task


@router.post("/a2a/remote/tasks/{task_id}/get")
async def get_remote_a2a_task(
    project_id: str,
    body: A2ARemoteTaskBody,
    task_id: str = _TASK_ID_PATH,
    current_user: User = Depends(get_current_user),
):
    """Fetch a remote A2A task's status."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    try:
        return await get_a2a_gateway().get_remote_task(
            body.endpoint_url, project_id=project_id, task_id=task_id, actor=current_user.id
        )
    except A2ARemoteError as exc:
        raise _remote_error(exc) from exc


@router.post("/a2a/remote/tasks/{task_id}/cancel")
async def cancel_remote_a2a_task(
    project_id: str,
    body: A2ARemoteTaskBody,
    task_id: str = _TASK_ID_PATH,
    current_user: User = Depends(get_current_user),
):
    """Cancel a remote A2A task."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)
    _ensure_distributed_hooks(db)
    try:
        return await get_a2a_gateway().cancel_remote_task(
            body.endpoint_url, project_id=project_id, task_id=task_id, actor=current_user.id
        )
    except A2ARemoteError as exc:
        raise _remote_error(exc) from exc
