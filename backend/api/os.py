"""Forge OS API (``/v1/os/*``, WS-C) -- docs/os/ARCHITECTURE.md, "New backend API".

Every route requires ``get_current_user`` (cookie or Bearer, like every other
v1 route); POSTs pass the global CSRF middleware. Every query is scoped to the
caller's ``user_id`` (plus project access where a project is involved); a
foreign id is indistinguishable from a missing one (404). The whole router is
gated by the ``os_shell`` feature flag (default on).

Not to be confused with ``/v1/projects/{project_id}/os/*`` (api/enterprise.py).
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Path, Query, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.datastructures import UploadFile

from api.auth import get_current_user
from core.feature_flags import is_os_shell_enabled
from core.models import User
from core.os import actions as os_actions
from core.os import events as os_events
from core.os import models_catalog
from core.os import turns as os_turns
from core.os.attachments import MAX_ATTACHMENT_BYTES, attachment_ref
from core.os.common import OsHTTPError
from core.os.limits import ATTACHMENT_LIMIT, check_rate_limit
from core.os.runtime import OsRuntime, get_os_runtime
from core.os.sessions import session_summary, workspace_wire
from core.os_contracts import CapabilityInvocation, TurnRequest, UserActionRequest, WorkspaceState

logger = logging.getLogger(__name__)

ID_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$"
CAPABILITY_PATTERN = r"^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$"


async def require_os_shell() -> None:
    if not await is_os_shell_enabled():
        raise HTTPException(status_code=404, detail="Not found")


router = APIRouter(prefix="/os", tags=["forge-os"], dependencies=[Depends(require_os_shell)])


def _raise(exc: OsHTTPError) -> None:
    detail: Dict[str, Any] = {"code": exc.code, "message": exc.message}
    detail.update(exc.extra)
    raise HTTPException(status_code=exc.status, detail=detail) from exc


# --------------------------------------------------------------------------- #
# Capabilities
# --------------------------------------------------------------------------- #


@router.get("/capabilities")
async def list_capabilities(
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    """``CapabilityCatalog`` filtered by the caller's admin flag and plan."""
    return rt.registry.catalog_for(user)


@router.post("/capabilities/{capability_id}/invoke", status_code=202)
async def invoke_capability(
    body: CapabilityInvocation,
    capability_id: str = Path(..., max_length=96, pattern=CAPABILITY_PATTERN),
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    if body.capability_id != capability_id:
        raise HTTPException(status_code=422, detail={"code": "validation_failed", "message": "capability_id does not match the path"})
    try:
        result = await os_actions.invoke_capability(rt, user, body)
    except OsHTTPError as exc:
        _raise(exc)
    if result.get("status") == "accepted":
        return result
    return JSONResponse(status_code=200, content=result)


# --------------------------------------------------------------------------- #
# Models (non-admin, secret-free)
# --------------------------------------------------------------------------- #


@router.get("/models")
async def list_models(user: User = Depends(get_current_user)):
    try:
        from core.llm.router import get_llm_router

        router_ = get_llm_router()
    except Exception:  # pragma: no cover - router import failure
        router_ = None
    return models_catalog.catalog_for(user, router_)


# --------------------------------------------------------------------------- #
# Attachments
# --------------------------------------------------------------------------- #

_MULTIPART_OVERHEAD = 64 * 1024


@router.post("/attachments", status_code=201)
async def upload_attachment(
    request: Request,
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    """multipart/form-data with one ``file`` part -> ``AttachmentRef``."""
    try:
        await check_rate_limit(rt.redis_getter, f"rl:os:attachments:{user.id}", *ATTACHMENT_LIMIT)
    except OsHTTPError as exc:
        _raise(exc)
    length = request.headers.get("content-length")
    if length is None or not length.isdigit():
        raise HTTPException(status_code=411, detail={"code": "validation_failed", "message": "Content-Length is required"})
    if int(length) > MAX_ATTACHMENT_BYTES + _MULTIPART_OVERHEAD:
        raise HTTPException(status_code=413, detail={"code": "validation_failed", "message": "Attachments are limited to 50 MB"})
    try:
        form = await request.form(max_files=1, max_fields=4)
    except Exception:
        raise HTTPException(status_code=422, detail={"code": "validation_failed", "message": "Expected multipart/form-data"})
    upload = form.get("file")
    if not isinstance(upload, UploadFile):
        raise HTTPException(status_code=422, detail={"code": "validation_failed", "message": "Missing 'file' part"})
    session_id = form.get("session_id")
    if isinstance(session_id, str) and session_id:
        try:
            await rt.sessions.require(user.id, session_id)
        except OsHTTPError as exc:
            _raise(exc)
    else:
        session_id = None

    async def _chunks():
        while True:
            data = await upload.read(256 * 1024)
            if not data:
                return
            yield data

    try:
        doc = await rt.attachments.store(
            user_id=user.id,
            filename=upload.filename or "upload",
            declared_mime=upload.content_type,
            stream=_chunks(),
            session_id=session_id,
        )
    except OsHTTPError as exc:
        _raise(exc)
    finally:
        await upload.close()
    return attachment_ref(doc)


# --------------------------------------------------------------------------- #
# Workspaces
# --------------------------------------------------------------------------- #


@router.get("/workspaces/current")
async def get_current_workspace(
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    return await rt.workspaces.get_current(user.id)


@router.put("/workspaces/{workspace_id}")
async def put_workspace(
    body: WorkspaceState,
    workspace_id: str = Path(..., pattern=ID_PATTERN),
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    """Optimistic concurrency: ``body.version`` must equal the stored version (409 otherwise)."""
    if body.id != workspace_id:
        raise HTTPException(status_code=422, detail={"code": "validation_failed", "message": "id does not match the path"})
    state = body.model_dump(mode="json")
    if state.get("active_session_id"):
        if await rt.sessions.get(user.id, state["active_session_id"]) is None:
            state["active_session_id"] = None
    try:
        return workspace_wire(await rt.workspaces.put(user.id, workspace_id, state))
    except OsHTTPError as exc:
        _raise(exc)


# --------------------------------------------------------------------------- #
# Generated-surface actions
# --------------------------------------------------------------------------- #


@router.post("/sessions/{session_id}/actions", status_code=202)
async def post_action(
    body: UserActionRequest,
    session_id: str = Path(..., pattern=ID_PATTERN),
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    try:
        return await os_actions.handle_user_action(rt, user, session_id, body)
    except OsHTTPError as exc:
        _raise(exc)


# --------------------------------------------------------------------------- #
# Sessions, turns and the event stream
# --------------------------------------------------------------------------- #


class SessionPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    pinned: Optional[bool] = None
    archived: Optional[bool] = None


@router.post("/sessions/new/turns", status_code=202)
async def create_session_turn(
    body: TurnRequest,
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    """First prompt: creates the session (title from the prompt) and starts the turn."""
    try:
        return await os_turns.submit_turn(rt, user, None, body)
    except OsHTTPError as exc:
        _raise(exc)


@router.post("/sessions/{session_id}/turns", status_code=202)
async def create_turn(
    body: TurnRequest,
    session_id: str = Path(..., pattern=ID_PATTERN),
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    """Idempotent on ``client_turn_id``; 409 while another turn is running."""
    try:
        return await os_turns.submit_turn(rt, user, session_id, body)
    except OsHTTPError as exc:
        _raise(exc)


@router.post("/sessions/{session_id}/turns/{turn_id}/cancel", status_code=204)
async def cancel_turn(
    session_id: str = Path(..., pattern=ID_PATTERN),
    turn_id: str = Path(..., pattern=ID_PATTERN),
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    try:
        await os_turns.cancel_turn(rt, user, session_id, turn_id)
    except OsHTTPError as exc:
        _raise(exc)
    return Response(status_code=204)


@router.get("/sessions/{session_id}/stream")
async def stream_session(
    request: Request,
    session_id: str = Path(..., pattern=ID_PATTERN),
    after_seq: int = Query(0, ge=0),
    last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    """SSE of ``OsEvent`` (``id`` = seq): replay after ``Last-Event-ID`` / ``after_seq``, then live."""
    try:
        await rt.sessions.require(user.id, session_id)  # authorised once, on connect
    except OsHTTPError as exc:
        _raise(exc)
    resume = after_seq
    if last_event_id and last_event_id.strip().isdigit():
        resume = max(resume, int(last_event_id.strip()))

    async def _gen():
        async for event in rt.events.stream(
            session_id=session_id,
            user_id=user.id,
            after_seq=resume,
            heartbeat_seconds=os_events.HEARTBEAT_SECONDS,
            max_seconds=os_events.STREAM_MAX_SECONDS,
        ):
            if await request.is_disconnected():
                return
            yield os_events.to_sse(event)

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.get("/sessions")
async def list_sessions(
    page: int = Query(1, ge=1, le=10000),
    per_page: int = Query(30, ge=1, le=100),
    archived: bool = Query(False),
    pinned: Optional[bool] = Query(None),
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    """History panel: ``{items: SessionSummary[], total, page, per_page}`` (pinned first, newest first)."""
    docs, total = await rt.sessions.list(user.id, page=page, per_page=per_page, include_archived=archived, pinned=pinned)
    return {"items": [session_summary(d) for d in docs], "total": total, "page": page, "per_page": per_page}


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str = Path(..., pattern=ID_PATTERN),
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    """Session + ``SessionMessage[]`` + ``StoredSurface[]`` + the seq to resume the stream from."""
    try:
        doc = await rt.sessions.require(user.id, session_id)
    except OsHTTPError as exc:
        _raise(exc)
    return {
        "session": session_summary(doc),
        "messages": await rt.messages.list(user.id, session_id),
        "surfaces": await rt.surfaces.list(user.id, session_id),
        "last_seq": int(doc.get("seq_counter") or 0),
        "active_turn_id": doc.get("active_turn_id"),
    }


@router.patch("/sessions/{session_id}")
async def patch_session(
    body: SessionPatch,
    session_id: str = Path(..., pattern=ID_PATTERN),
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    try:
        return session_summary(await rt.sessions.update(user.id, session_id, body.model_dump(exclude_none=True)))
    except OsHTTPError as exc:
        _raise(exc)


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: str = Path(..., pattern=ID_PATTERN),
    user: User = Depends(get_current_user),
    rt: OsRuntime = Depends(get_os_runtime),
):
    """Soft delete (``deleted_at``); the session disappears from every read."""
    try:
        await rt.sessions.soft_delete(user.id, session_id)
    except OsHTTPError as exc:
        _raise(exc)
    return Response(status_code=204)
