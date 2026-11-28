"""Turn lifecycle: accept (idempotent) -> intent -> plan -> execute -> exactly one terminal event.

* ``client_turn_id`` makes retries idempotent: a repeat returns the original
  ``TurnAccepted`` (same session, turn and ``after_seq``), also for
  ``sessions/new/turns``.
* One running turn per session (atomic lease on the session doc) -> 409.
* The work runs as an ``asyncio`` task in the accepting worker; a per-turn
  timeout bounds it. Cancel sets a flag the runner polls (works across
  workers) and cancels the local task when it is here.
* ``TurnRepository.finish`` is an atomic running -> terminal transition, so
  exactly one ``turn.completed`` / ``turn.failed`` is ever emitted per turn.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import timedelta
from typing import Any, Dict, Optional

from core.os import intent as intent_module
from core.os.actions import load_project
from core.os.common import OsHTTPError, iso, new_id, not_found, utc_now
from core.os.events import EventValidationError
from core.os.executors import StepFailed, TurnCancelled, TurnCtx, execute_step
from core.os.limits import TURN_LIMIT, check_rate_limit
from core.os.models_catalog import resolve_selection
from core.os.planner import plan_turn
from core.os.sessions import derive_title

logger = logging.getLogger(__name__)

TURN_TIMEOUT_SECONDS = 300.0
PREVIEW_CHARS = 280


def _accepted(session_id: str, turn_id: str, after_seq: int) -> Dict[str, Any]:
    return {
        "session_id": session_id,
        "turn_id": turn_id,
        "stream_path": f"/v1/os/sessions/{session_id}/stream",
        "after_seq": max(0, int(after_seq)),
    }


async def submit_turn(rt, user, session_id: Optional[str], request) -> Dict[str, Any]:
    """``TurnRequest`` -> ``TurnAccepted`` (the turn then runs in the background)."""
    # Idempotent retries are answered before the rate limit so a flaky client
    # cannot lock itself out by retrying the same turn.
    if session_id is None:
        existing = await rt.turns.find_by_client_id(user.id, request.client_turn_id)
        if existing and existing.get("via_new"):
            return _accepted(existing["session_id"], existing["id"], existing.get("after_seq", 0))
    else:
        session = await rt.sessions.require(user.id, session_id)
        existing = await rt.turns.find_by_client_id(user.id, request.client_turn_id, session_id=session["id"])
        if existing:
            return _accepted(existing["session_id"], existing["id"], existing.get("after_seq", 0))

    await check_rate_limit(rt.redis_getter, f"rl:os:turns:{user.id}", *TURN_LIMIT)
    model = resolve_selection(user, request.model)
    attachments = await rt.attachments.resolve_refs(user.id, request.attachments)

    if session_id is None:
        project = await load_project(rt, user, request.project_id)
        session = await rt.sessions.create(
            user_id=user.id,
            title=derive_title(request.prompt),
            project_id=(project or {}).get("id"),
            org_id=(project or {}).get("org_id"),
        )
    else:
        project = await load_project(rt, user, request.project_id or session.get("project_id"))

    turn_id = new_id("turn")
    if not await rt.sessions.acquire_turn_lease(user.id, session["id"], turn_id):
        raise OsHTTPError(409, "conflict", "A turn is already running in this session")
    try:
        turn_doc = {
            "id": turn_id,
            "session_id": session["id"],
            "user_id": user.id,
            "org_id": session.get("org_id"),
            "client_turn_id": request.client_turn_id,
            "via_new": session_id is None,
            "status": "running",
            "created_at": iso(),
            "project_id": (project or {}).get("id"),
            "model": {"tier": model.tier, "model": model.model, "provider": model.provider},
            "cancel_requested": False,
            "after_seq": 0,
        }
        doc, created = await rt.turns.create(turn_doc)
        if not created:  # lost a race with an identical retry
            await rt.sessions.release_turn_lease(session["id"], turn_id)
            return _accepted(doc["session_id"], doc["id"], doc.get("after_seq", 0))
        user_msg = await rt.messages.add(
            user_id=user.id, session_id=session["id"], turn_id=turn_id, role="user",
            text=request.prompt, attachments=attachments,
        )
        started = await rt.emit(
            session_id=session["id"], user_id=user.id, turn_id=turn_id, type="turn.started",
            data={"message_id": user_msg["id"], "prompt_preview": request.prompt[:PREVIEW_CHARS]},
        )
        after_seq = started["seq"] - 1
        await rt.turns.update(turn_id, {"after_seq": after_seq})
        await rt.sessions.touch(user.id, session["id"], new_turn=True)
    except BaseException:
        await rt.sessions.release_turn_lease(session["id"], turn_id)
        raise

    ctx = TurnCtx(rt=rt, user=user, session=session, turn_id=turn_id, prompt=request.prompt, project=project,
                  attachments=attachments, model=model)
    context = request.context.model_dump(mode="json") if request.context else {}
    task = asyncio.get_running_loop().create_task(_run_turn(ctx, context))
    rt.tasks[turn_id] = task
    task.add_done_callback(lambda _t, tid=turn_id: rt.tasks.pop(tid, None))
    return _accepted(session["id"], turn_id, after_seq)


async def _finish(ctx: TurnCtx, status: str, *, error: Optional[Dict[str, Any]] = None) -> None:
    rt = ctx.rt
    terminal = "failed" if error else status
    if not await rt.turns.finish(ctx.turn_id, terminal, error=error, usage=ctx.usage):
        return  # someone else (a cancel) already ended this turn
    try:
        if error:
            await ctx.emit("turn.failed", {"error": error})
        else:
            usage = {"input_tokens": int(ctx.usage["input_tokens"]), "output_tokens": int(ctx.usage["output_tokens"]),
                     "cost_usd": float(ctx.usage["cost_usd"])}
            await ctx.emit("turn.completed", {"status": status, "usage": usage})
    finally:
        await rt.sessions.release_turn_lease(ctx.session_id, ctx.turn_id)
        await rt.sessions.touch(ctx.user.id, ctx.session_id)


async def _run_turn(ctx: TurnCtx, context: Dict[str, Any]) -> None:
    try:
        await asyncio.wait_for(_pipeline(ctx, context), timeout=TURN_TIMEOUT_SECONDS)
        await _finish(ctx, "completed")
    except (TurnCancelled, asyncio.CancelledError):
        await asyncio.shield(_finish(ctx, "cancelled"))
    except asyncio.TimeoutError:
        await _finish(ctx, "failed", error={"code": "internal", "message": "The turn took too long.", "retryable": True})
    except StepFailed as exc:
        await _finish(ctx, "failed", error={"code": exc.code, "message": exc.message[:1000], "retryable": exc.retryable})
    except OsHTTPError as exc:
        code = exc.code if exc.code in ("forbidden", "not_found", "validation_failed", "rate_limited", "conflict") else "internal"
        await _finish(ctx, "failed", error={"code": code, "message": exc.message[:1000], "retryable": False})
    except Exception:
        logger.exception("OS turn %s failed", ctx.turn_id)
        await _finish(ctx, "failed", error={"code": "internal", "message": "Something went wrong.", "retryable": True})


async def _pipeline(ctx: TurnCtx, context: Dict[str, Any]) -> None:
    rt = ctx.rt
    intent = await intent_module.classify(
        rt, user=ctx.user, prompt=ctx.prompt, attachments=ctx.attachments,
        project_id=(ctx.project or {}).get("id"), org_id=ctx.session.get("org_id"),
    )
    try:
        await ctx.emit("intent.resolved", {"intent": intent})
    except EventValidationError:
        intent = intent_module.intent_rules.classify(ctx.prompt, rt.registry, attachments=ctx.attachments)
        await ctx.emit("intent.resolved", {"intent": intent})
    await ctx.check_cancelled(force=True)

    plan = await plan_turn(
        rt, user=ctx.user, intent=intent, project=ctx.project, context=context,
        model_ref=ctx.model.model_ref(), prompt=ctx.prompt, attachments=ctx.attachments,
    )
    await rt.turns.update(ctx.turn_id, {
        "plan": plan.wire,
        "steps": [s.to_doc() for s in plan.steps],
        "intent_kind": intent["kind"],
        "intent_source": intent["source"],
        "capability_id": (plan.capability or {}).get("id"),
    })
    await ctx.emit("plan.ready", {"plan": plan.wire})
    for step in plan.steps:
        await ctx.check_cancelled(force=True)
        await execute_step(ctx, step)


async def cancel_turn(rt, user, session_id: str, turn_id: str) -> None:
    await rt.sessions.require(user.id, session_id)
    turn = await rt.turns.get(user.id, session_id, turn_id)
    if turn is None:
        raise not_found("Turn not found")
    if turn.get("status") != "running":
        return  # already over: cancel is idempotent
    await rt.turns.request_cancel(turn_id)
    task = rt.tasks.get(turn_id)
    if task is not None and not task.done():
        task.cancel()
        return
    # Not running on this worker. If the owning worker is alive it sees the
    # flag within a second; end the turn here only if its lease is gone
    # (worker crashed) so the session never stays stuck.
    session = await rt.sessions.get(user.id, session_id)
    started = turn.get("created_at") or ""
    dead_before = iso(utc_now() - timedelta(seconds=TURN_TIMEOUT_SECONDS + 60))
    if session and (session.get("active_turn_id") != turn_id or started < dead_before):
        ctx = TurnCtx(rt=rt, user=user, session=session, turn_id=turn_id, prompt="", project=None,
                      attachments=[], model=resolve_selection(user, None))
        await _finish(ctx, "cancelled")
