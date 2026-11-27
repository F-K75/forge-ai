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
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile

from api.auth import get_current_user
from core.feature_flags import is_os_shell_enabled
from core.models import User
from core.os import actions as os_actions
from core.os import models_catalog
from core.os.attachments import MAX_ATTACHMENT_BYTES, attachment_ref
from core.os.common import OsHTTPError
from core.os.limits import ATTACHMENT_LIMIT, check_rate_limit
from core.os.runtime import OsRuntime, get_os_runtime
from core.os.sessions import workspace_wire
from core.os_contracts import CapabilityInvocation, UserActionRequest, WorkspaceState

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
