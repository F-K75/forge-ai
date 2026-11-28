"""Capability invocations and generated-surface actions.

Two entry points share one authorisation path (``CapabilityRegistry.invoke``):

* ``invoke_capability`` -- palette / library launches
  (``POST /v1/os/capabilities/{id}/invoke``).
* ``handle_user_action`` -- clicks on generated components
  (``POST /v1/os/sessions/{id}/actions``). The click is only honoured if the
  stored surface (owned by the caller, in that session) actually offers that
  ``Action.event.name`` on that component; the server-authored ``context`` of
  that event wins over anything the client sends for the same keys.

Whatever a handler returns (A2UI messages, placements) is re-validated
(drop-and-log, text fallback) before it is persisted or streamed.
"""

from __future__ import annotations

import logging
from typing import Any, Awaitable, Callable, Dict, List, Optional

from core.os.common import OsHTTPError, new_id, not_found
from core.os.limits import ACTION_LIMIT, check_rate_limit
from core.os.surface_validation import (
    action_context_for,
    collect_action_names,
    sanitize_a2ui_message,
    text_fallback_surface,
    validate_placement,
)
from core.os_contracts import ActionOutcome

logger = logging.getLogger(__name__)

# Built-in (non-capability) surface actions, handled by WS-C: name -> handler(rt, user, session, request, server_ctx)
BuiltinAction = Callable[..., Awaitable[ActionOutcome]]
BUILTIN_ACTIONS: Dict[str, BuiltinAction] = {}


def builtin_action(name: str):
    def deco(fn: BuiltinAction) -> BuiltinAction:
        BUILTIN_ACTIONS[name] = fn
        return fn

    return deco


async def load_project(rt, user, project_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """Project doc if the caller may access it; 404 otherwise (never 403, never a leak)."""
    if not project_id:
        return None
    from core.permissions import has_project_access

    project = await rt.db.projects.find_one({"id": project_id, "deleted_at": None}, {"_id": 0})
    if not project or not await has_project_access(rt.db, user.id, project):
        raise not_found("Project not found")
    return project


async def emit_surface(
    rt,
    *,
    user_id: str,
    session_id: str,
    turn_id: Optional[str],
    message: Dict[str, Any],
    title: str = "",
    capability_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Validate, snapshot and stream one A2UI message. Returns the safe message or ``None`` if refused."""
    safe, problems = sanitize_a2ui_message(message)
    if safe is None:
        logger.warning("Refusing A2UI message for session %s: %s", session_id, problems[:5])
        return None
    try:
        await rt.surfaces.apply(
            user_id=user_id, session_id=session_id, turn_id=turn_id, message=safe, title=title, capability_id=capability_id
        )
    except (ValueError, OsHTTPError) as exc:
        logger.warning("Refusing A2UI message for session %s: %s", session_id, exc)
        return None
    await rt.emit(session_id=session_id, user_id=user_id, turn_id=turn_id, type="a2ui.message", data={"message": safe})
    return safe


async def emit_outcome(
    rt, *, user_id: str, session_id: str, turn_id: Optional[str], action_id: str, outcome: ActionOutcome,
    capability_id: Optional[str] = None,
) -> None:
    failed_surfaces: List[str] = []
    for msg in outcome.a2ui_messages or []:
        sid = None
        for key in ("createSurface", "updateComponents", "updateDataModel", "deleteSurface"):
            if isinstance(msg, dict) and isinstance(msg.get(key), dict):
                sid = msg[key].get("surfaceId")
        safe = await emit_surface(rt, user_id=user_id, session_id=session_id, turn_id=turn_id, message=msg, capability_id=capability_id)
        if safe is None and isinstance(sid, str) and isinstance(msg, dict) and "createSurface" in msg:
            failed_surfaces.append(sid)
    for placement in outcome.placements or []:
        if validate_placement(placement):
            logger.warning("Dropping invalid placement from %s: %s", capability_id, validate_placement(placement)[:3])
            continue
        sid = placement["surface_id"]
        if sid in failed_surfaces:
            fallback = text_fallback_surface(sid, placement.get("title") or "Result", capability_id)
            if await emit_surface(rt, user_id=user_id, session_id=session_id, turn_id=turn_id, message=fallback,
                                  title=placement.get("title") or "", capability_id=capability_id) is None:
                continue
        elif await rt.surfaces.get(user_id, session_id, sid) is None:
            # Placements may only reference this caller's surfaces in this session.
            logger.warning("Dropping placement for unknown surface %s", sid)
            continue
        await rt.emit(session_id=session_id, user_id=user_id, turn_id=turn_id, type="surface.placed", data={"placement": placement})
    message = (outcome.message or "")[:1000] or None
    await rt.emit(
        session_id=session_id,
        user_id=user_id,
        turn_id=turn_id,
        type="action.result",
        data={"action_id": action_id, "status": outcome.status, "message": message},
    )


def _session_emitter(rt, user_id: str, session_id: Optional[str], turn_id: Optional[str], sink: List[Dict[str, Any]]):
    async def emit(event_type: str, data: Dict[str, Any]) -> None:
        if session_id is None:
            sink.append({"type": event_type, "data": data})
            return
        if event_type == "a2ui.message":
            await emit_surface(rt, user_id=user_id, session_id=session_id, turn_id=turn_id, message=data.get("message"))
            return
        if event_type in ("turn.started", "turn.completed", "turn.failed", "heartbeat"):
            raise ValueError(f"handlers may not emit {event_type}")
        await rt.emit(session_id=session_id, user_id=user_id, turn_id=turn_id, type=event_type, data=data)

    return emit


async def invoke_capability(rt, user, invocation) -> Dict[str, Any]:
    """``CapabilityInvocation`` -> 202 (streamed into its session) or the result inline."""
    await check_rate_limit(rt.redis_getter, f"rl:os:actions:{user.id}", *ACTION_LIMIT)
    session = await rt.sessions.require(user.id, invocation.session_id) if invocation.session_id else None
    project_id = invocation.project_id or (session or {}).get("project_id")
    project = await load_project(rt, user, project_id)
    sink: List[Dict[str, Any]] = []
    sid = session["id"] if session else None
    outcome = await rt.registry.invoke(
        rt.db,
        user=user,
        capability_id=invocation.capability_id,
        action_id=invocation.action,
        input=invocation.input,
        emit=_session_emitter(rt, user.id, sid, None, sink),
        session_id=sid,
        project=project,
        metadata={"entry_point": "palette", "presentation": invocation.presentation},
    )
    if session:
        await emit_outcome(rt, user_id=user.id, session_id=sid, turn_id=None, action_id=invocation.action_id,
                           outcome=outcome, capability_id=invocation.capability_id)
        return {"action_id": invocation.action_id, "status": "accepted", "session_id": sid}
    safe_messages = []
    for msg in outcome.a2ui_messages or []:
        safe, _ = sanitize_a2ui_message(msg)
        if safe is not None:
            safe_messages.append(safe)
    return {
        "action_id": invocation.action_id,
        "status": outcome.status,
        "message": (outcome.message or "")[:1000] or None,
        "a2ui_messages": safe_messages,
        "placements": [p for p in outcome.placements or [] if not validate_placement(p)],
    }


async def handle_user_action(rt, user, session_id: str, request) -> Dict[str, Any]:
    """``UserActionRequest`` from a generated surface -> 202; the result arrives as ``action.result``."""
    await check_rate_limit(rt.redis_getter, f"rl:os:actions:{user.id}", *ACTION_LIMIT)
    if request.session_id != session_id:
        raise OsHTTPError(422, "validation_failed", "session_id does not match the path")
    session = await rt.sessions.require(user.id, session_id)
    body = request.a2ui.action
    surface = await rt.surfaces.get(user.id, session_id, body.surfaceId)
    if surface is None:
        raise not_found("Surface not found")
    components = surface.get("components") or []
    if body.name not in collect_action_names(components):
        raise not_found("This surface does not offer that action")
    server_ctx = action_context_for(components, body.name, body.sourceComponentId)
    if server_ctx is None:
        raise not_found("This component does not offer that action")
    # Client context carries user input (form values); server-authored keys win.
    merged = {**(body.context or {}), **server_ctx}
    turn_id = request.turn_id
    if turn_id and await rt.turns.get(user.id, session_id, turn_id) is None:
        turn_id = None

    builtin = BUILTIN_ACTIONS.get(body.name)
    if builtin is not None:
        outcome = await builtin(rt, user, session, request, merged)
        await emit_outcome(rt, user_id=user.id, session_id=session_id, turn_id=turn_id, action_id=request.action_id, outcome=outcome)
        return {"action_id": request.action_id, "status": "accepted"}

    resolved = rt.registry.resolve_action_name(body.name)
    if resolved is None:
        raise not_found("Unknown action")
    capability_id, action_id = resolved
    project_id = merged.pop("project_id", None) or session.get("project_id")
    project = await load_project(rt, user, project_id) if isinstance(project_id, str) else None
    sink: List[Dict[str, Any]] = []
    try:
        outcome = await rt.registry.invoke(
            rt.db,
            user=user,
            capability_id=capability_id,
            action_id=action_id,
            input=merged,
            emit=_session_emitter(rt, user.id, session_id, turn_id, sink),
            session_id=session_id,
            turn_id=turn_id,
            project=project,
            metadata={"entry_point": "surface", "surface_id": body.surfaceId, "source_component_id": body.sourceComponentId},
        )
    except OsHTTPError as exc:
        if exc.status in (404,):
            raise
        outcome = ActionOutcome(status="rejected", message=exc.message)
    await emit_outcome(rt, user_id=user.id, session_id=session_id, turn_id=turn_id, action_id=request.action_id,
                       outcome=outcome, capability_id=capability_id)
    return {"action_id": request.action_id, "status": "accepted"}


def new_action_id() -> str:
    return new_id("act")
