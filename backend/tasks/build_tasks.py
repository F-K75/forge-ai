"""Celery tasks for build processing with persistence and retry logic."""

import asyncio
import logging
import time
from typing import Optional
from celery.exceptions import SoftTimeLimitExceeded
from celery_app import celery_app as current_app
from core.config import get_settings
from core.security import request_id_var
from core.metrics import build_outcomes_total, build_duration_seconds, build_credits_used
from core.models import Build, BuildStatus, BuildDeadLetter, WSEvent, WSEventType, BuildFile
from core.orchestrator import BuildCancelled, Orchestrator
from core.database import get_db
from core import execution_state
from core.llm.guardrail_errors import GuardrailBlocked, GuardrailUnavailable
from core.processing_boundary import (
    PlatformProcessingDenied,
    ProcessingBoundary,
    build_scope,
    credential_mode_for_user_doc,
    refresh_boundary,
    reserve_byok_extra_call,
)
from sandbox.runner import SandboxRunner
from services.ws_manager import manager

logger = logging.getLogger(__name__)

settings = get_settings()
orchestrator = Orchestrator()
sandbox = SandboxRunner()

_worker_loop: Optional[asyncio.AbstractEventLoop] = None

# Never retried on any credential: retrying cannot change the outcome
# (processing boundary refusal, guardrail block, required screen that could
# not run). The rest of the retry classes (§8.4) arrive with A1.
_NON_RETRYABLE = (BuildCancelled, PlatformProcessingDenied, GuardrailBlocked, GuardrailUnavailable)

BYOK_NO_AUTO_RETRY = "byok_no_auto_retry"
BYOK_INTERRUPTED = "byok_interrupted"


def _build_boundary(build_doc: dict, user_doc: Optional[dict], user_id: str) -> ProcessingBoundary:
    """The build's processing boundary: the snapshot taken at admission
    (api/builds.py), or -- for a build admitted before A2 -- the safe
    default: the credential mode the orchestrator will use, and no consents
    (a consent granted after admission never widens a build, BY-7)."""
    snapshot = ProcessingBoundary.from_doc(build_doc.get("processing_boundary"))
    if snapshot is not None:
        return snapshot
    return ProcessingBoundary(
        credential_mode=credential_mode_for_user_doc(user_doc),
        owner_user_id=user_id,
        policy_version=settings.processing_policy_version,
        source="default",
    )


def _byok_retry_class(exc: BaseException) -> str:
    """§8.4 retry class of a failure on a BYOK build: ``transient``,
    ``model_output`` or ``non_transient``. Only the first two may be retried,
    and only with `byok_auto_retry` authorization."""
    from core.ai_usage import BudgetExceeded
    from core.llm.provider import CircuitBreakerOpen, ProviderError
    from core.llm.router import _is_retryable_error

    if isinstance(exc, _NON_RETRYABLE) or isinstance(exc, BudgetExceeded):
        return "non_transient"
    if isinstance(exc, CircuitBreakerOpen):
        return "transient"
    if isinstance(exc, ProviderError):
        return "transient" if _is_retryable_error(exc) else "non_transient"
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError, ConnectionError, OSError)):
        return "transient"
    if isinstance(exc, ValueError):
        if "prompt injection" in str(exc).lower():
            return "non_transient"
        return "model_output"
    return "transient"


def _run_async(coro):
    """Run a coroutine on a single event loop kept alive for this worker
    process's lifetime.

    The Mongo client in core.database is a process-global singleton, so
    asyncio.run() (which closes its loop when done) would leave that client
    bound to a dead loop after the first task — every task after the first
    would fail with "Event loop is closed". Reusing one loop per process
    keeps the client's loop binding valid across tasks.
    """
    global _worker_loop
    if _worker_loop is None or _worker_loop.is_closed():
        _worker_loop = asyncio.new_event_loop()
    return _worker_loop.run_until_complete(coro)


class BuildTask(current_app.Task):
    """Base task class with error handling and retry configuration.

    No autoretry_for: retries need to happen through the resume-aware path
    below, not Celery's blind autoretry. run_build is resumable at agent-step
    granularity for the architect/business_model/designer/developer/
    integration stages (see core/orchestrator.py's `_try_recover_json`/
    `resume_ok` chain and this module's `persist_files`/`resumed_files`
    wiring) -- a retried attempt of the same build_id skips any step that
    already has a persisted SUCCESS record instead of re-running (and
    re-charging) it. The PM/debug loop always restarts from PM validation on
    resume; it is never resumed at sub-step granularity. run_build's except
    block retries manually via self.retry() for any exception up to
    max_retries (see the retry call below).
    """

    retry_kwargs = {"max_retries": 3, "countdown": 60}
    acks_late = True  # Only acknowledge after task completes


@current_app.task(
    bind=True,
    base=BuildTask,
    name="backend.tasks.build_tasks.run_build",
    # `settings.build_timeout` used to be dead config — nothing enforced it, so a
    # hung pipeline (agent retry storm, a stuck network call outside the LLM
    # client's own per-call timeout, a debug-loop bug bypassing MAX_DEBUG_ITERATIONS)
    # would occupy a worker slot forever with the user's credits reserved and never
    # refunded. soft_time_limit raises SoftTimeLimitExceeded inside the task so it can
    # clean up (see except clause below); time_limit is the hard SIGKILL backstop.
    soft_time_limit=settings.build_timeout,
    time_limit=settings.build_timeout + 30,
)
def run_build(
    self,
    build_id: str,
    project_id: str,
    user_id: str,
    reserved_credits: int,
    conversation_history: Optional[list] = None,
    existing_files: Optional[dict] = None,
) -> dict:
    """Celery task to run a build asynchronously.

    This replaces the BackgroundTasks implementation with:
    - Persistence on Redis restart
    - Automatic retry on failure (3 retries)
    - Proper error handling and resource cleanup

    Usage: run_build.delay(build_id, project_id, user_id, reserved_credits)
    """

    async def _run():
        db = await get_db()

        start_time = time.monotonic()

        # Fetch the build
        build_doc = await db.builds.find_one({"id": build_id}, {"_id": 0})
        if not build_doc:
            raise ValueError(f"Build {build_id} not found")

        build = Build(**build_doc)
        user = await db.users.find_one({"id": user_id}, {"_id": 0})

        project_doc = await db.projects.find_one(
            {"id": project_id, "deleted_at": None}, {"_id": 0, "template": 1, "org_id": 1}
        )
        template = project_doc.get("template") if project_doc else None
        org_id = project_doc.get("org_id") if project_doc else None

        # The processing boundary this build runs under (§5.2). Carried to
        # every agent, gateway and router call below via the build scope.
        boundary = _build_boundary(build_doc, user, user_id)

        if boundary.is_byok:
            # U1 / BY-6: an interrupted BYOK build terminates. A redelivered
            # task (worker crash, acks_late) that was not an authorized retry
            # must not re-run anything on the customer's key.
            claimed = await db.builds.find_one_and_update(
                {"id": build_id},
                {"$inc": {"byok_dispatches": 1}},
                return_document=True,
            )
            dispatches = int((claimed or {}).get("byok_dispatches", 1) or 1)
            authorized = int((claimed or {}).get("byok_authorized_redispatches", 0) or 0)
            if dispatches > 1 + authorized:
                return await _terminate_interrupted_byok(db, build, user, reserved_credits)

        # If this build_id already has persisted files -- i.e. this is a
        # resumed attempt after a mid-pipeline crash, since build_id is a
        # fresh UUID per Build and never reused across distinct attempts --
        # those take priority over the `existing_files` task argument, which
        # represents a *different* prior build's files for the amend flow
        # (see api/builds.py's _get_prior_build_context). On a first attempt
        # this collection has no rows for this build_id yet, so behavior is
        # unchanged.
        resumed_files: Optional[dict] = None
        existing_build_files = await db.build_files.find(
            {"build_id": build_id}, {"_id": 0, "path": 1, "content": 1}
        ).to_list(None)
        if existing_build_files:
            resumed_files = {f["path"]: f["content"] for f in existing_build_files}
        effective_existing_files = resumed_files if resumed_files else existing_files

        async def emit(event: WSEvent) -> None:
            if event.type == WSEventType.STREAM_TOKEN:
                # F3: a token changes no persisted state; only state-changing
                # events write the build document.
                await manager.emit(event)
                return
            execution_state.sync(build)
            await db.builds.update_one(
                {"id": build_id},
                {
                    "$set": {
                        **execution_state.state_fields(build),
                        "agents": [a.model_dump() for a in build.agents],
                        "credits_used": build.credits_used,
                        "business_model": build.business_model,
                        "agent_messages": [m.model_dump() for m in build.agent_messages],
                    }
                },
            )
            await manager.emit(event)

        async def persist_files(current_files: dict) -> None:
            """Incrementally persists generated files as the pipeline runs,
            so a crash after e.g. the developer step doesn't lose that work
            -- see core/orchestrator.py's resume-check logic, which reads
            these back in as `effective_existing_files` on a retried attempt
            of the same build_id."""
            if not current_files:
                return
            await db.build_files.delete_many({"build_id": build_id})
            await db.build_files.insert_many([
                BuildFile(build_id=build_id, path=path, content=content).model_dump()
                for path, content in current_files.items()
            ])

        async def _dead_letter(reason: str, error_msg: str, retry_count: int) -> None:
            await db.build_dead_letters.insert_one(
                BuildDeadLetter(
                    build_id=build_id,
                    user_id=user_id,
                    project_id=project_id,
                    prompt=build.prompt,
                    error=error_msg,
                    failure_reason=reason,
                    retry_count=retry_count,
                    credits_used=used,
                    created_at=build.created_at,
                ).model_dump()
            )

        scope_cm = build_scope(
            boundary, build_id=build_id, user_id=user_id, project_id=project_id, org_id=org_id,
        )
        scope = scope_cm.__enter__()

        def _guardrail_fields() -> dict:
            # GR-5/GR-6 at the outcome level: what B2 (quality INCOMPLETE)
            # and A3 (withheld versions) read. Only written when the gateway
            # recorded guardrail outcomes for this build.
            if not scope.guardrail_outcomes:
                return {}
            return {"guardrail_report": {
                "unverified": [o for o in scope.guardrail_outcomes if o.get("unverified")],
                "withheld": [o for o in scope.guardrail_outcomes if o.get("withheld")],
                "ltier_calls": sum(int(o.get("ltier_calls") or 0) for o in scope.guardrail_outcomes),
                "artifacts": len(scope.guardrail_outcomes),
            }}

        try:
            build, files = await orchestrator.run_build(
                build,
                emit=emit,
                sandbox_runner=sandbox,
                conversation_history=conversation_history,
                existing_files=effective_existing_files,
                template=template,
                persist_files=persist_files,
                reserved_credits=reserved_credits,
            )
            execution_state.sync(build)
            await db.builds.update_one({"id": build_id}, {"$set": {**build.model_dump(), **_guardrail_fields()}})

            if files:
                await db.build_files.delete_many({"build_id": build_id})
                await db.build_files.insert_many([
                    BuildFile(build_id=build_id, path=path, content=content).model_dump()
                    for path, content in files.items()
                ])

            used = int(build.credits_used or 0)
            refund = max(0, reserved_credits - used)
            if refund and user:
                await db.users.find_one_and_update(
                    {"id": user_id},
                    {"$inc": {"credits": refund}},
                    return_document=True,
                )

            user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "credits": 1})
            remaining = int((user_doc or {}).get("credits", 0))
            await manager.emit(
                WSEvent(
                    type=WSEventType.CREDITS_UPDATE,
                    build_id=build_id,
                    data={"credits_used": used, "remaining": remaining},
                )
            )

            build_duration_seconds.observe(time.monotonic() - start_time)
            build_outcomes_total.labels(status="success").inc()
            build_credits_used.observe(used)
            return {"status": "success", "build_id": build_id, "credits_used": used}

        except SoftTimeLimitExceeded:
            correlation_id = request_id_var.get()
            logger.exception(
                "Build %s exceeded soft time limit of %s [correlation_id=%s]",
                build_id,
                settings.build_timeout,
                correlation_id,
            )
            used = int(build.credits_used or 0)
            refund = max(0, reserved_credits - used)
            if refund and user:
                await db.users.update_one(
                    {"id": user_id},
                    {"$inc": {"credits": refund}}
                )

            execution_state.set_status(build, BuildStatus.FAILED, reason="timeout")
            await db.builds.update_one(
                {"id": build_id},
                {"$set": {
                    **execution_state.state_fields(build),
                    "error": "Build exceeded maximum allowed time",
                    "credits_used": used,
                }}
            )
            build_duration_seconds.observe(time.monotonic() - start_time)
            build_outcomes_total.labels(status="timeout").inc()
            build_credits_used.observe(used)
            await _dead_letter("timeout", "Build exceeded maximum allowed time", self.request.retries)
            raise

        except Exception as e:
            max_retries = self.retry_kwargs.get("max_retries", 0)
            is_final_attempt = self.request.retries >= max_retries

            # A user declining an interactive gate is a decision, not a
            # transient failure — retrying would rerun agents they cancelled.
            # Boundary refusals and guardrail blocks cannot change on retry.
            if isinstance(e, _NON_RETRYABLE):
                is_final_attempt = True

            # BYOK (U13, X4, BY-4/BY-5): a retry is another billed call on
            # the customer's key, so it needs `byok_auto_retry` consent and
            # counts against its N (shared with gateway repairs). Without it
            # the build fails now and settles; nothing is re-run.
            failure_reason = None
            if boundary.is_byok and not is_final_attempt:
                retry_class = _byok_retry_class(e)
                current = await refresh_boundary(boundary, db)
                if retry_class != "non_transient" and await reserve_byok_extra_call(
                    current, build_id=build_id, db=db,
                ):
                    await db.builds.update_one(
                        {"id": build_id}, {"$inc": {"byok_authorized_redispatches": 1}},
                    )
                else:
                    is_final_attempt = True
                    failure_reason = BYOK_NO_AUTO_RETRY

            # Retry regardless of prior progress: run_build is now
            # resume-aware (see BuildTask's docstring above), so a retry
            # after partial success skips already-completed agents instead
            # of wastefully -- and expensively -- re-running the whole
            # pipeline from the Architect.
            if not is_final_attempt:
                raise self.retry(
                    exc=e,
                    countdown=self.retry_kwargs.get("countdown", 60),
                    max_retries=max_retries,
                )

            used = int(build.credits_used or 0)
            refund = max(0, reserved_credits - used)
            if refund and user:
                await db.users.update_one(
                    {"id": user_id},
                    {"$inc": {"credits": refund}}
                )

            execution_state.set_status(
                build, BuildStatus.FAILED,
                reason=failure_reason or ("cancelled" if isinstance(e, BuildCancelled) else "exception"),
            )
            failure = {**execution_state.state_fields(build), "error": str(e), "credits_used": used}
            if failure_reason == BYOK_NO_AUTO_RETRY:
                failure["error"] = (
                    f"{e} (not retried: automatic retries on your own provider key are off)"
                )
                failure["failure_reason"] = BYOK_NO_AUTO_RETRY
            elif isinstance(e, PlatformProcessingDenied):
                failure["failure_reason"] = e.error_class
            elif isinstance(e, GuardrailBlocked):
                failure["failure_reason"] = "blocked_by_guardrail"
            failure.update(_guardrail_fields())
            await db.builds.update_one({"id": build_id}, {"$set": failure})
            build_duration_seconds.observe(time.monotonic() - start_time)
            build_outcomes_total.labels(status="failed").inc()
            build_credits_used.observe(used)
            await _dead_letter(
                "cancelled" if isinstance(e, BuildCancelled) else (failure_reason or "exception"),
                str(e),
                self.request.retries,
            )
            raise
        finally:
            scope_cm.__exit__(None, None, None)

    return _run_async(_run())


async def _terminate_interrupted_byok(db, build: Build, user: Optional[dict], reserved_credits: int) -> dict:
    """BY-6 / U1: a BYOK build whose task was redelivered without an
    authorized retry (an interruption) terminates and settles: no dispatch 2
    on any credential, the reservation refunded minus what completed stages
    already consumed (0 for BYOK)."""
    used = int(build.credits_used or 0)
    refund = max(0, reserved_credits - used)
    if refund and user:
        await db.users.update_one({"id": build.user_id}, {"$inc": {"credits": refund}})
    message = (
        "Build was interrupted and was not re-run automatically on your own provider key"
    )
    execution_state.set_status(build, BuildStatus.FAILED, reason=BYOK_INTERRUPTED)
    await db.builds.update_one(
        {"id": build.id},
        {"$set": {
            **execution_state.state_fields(build),
            "error": message,
            "failure_reason": BYOK_INTERRUPTED,
            "credits_used": used,
        }},
    )
    await db.build_dead_letters.insert_one(
        BuildDeadLetter(
            build_id=build.id,
            user_id=build.user_id,
            project_id=build.project_id,
            prompt=build.prompt,
            error=message,
            failure_reason=BYOK_INTERRUPTED,
            retry_count=0,
            credits_used=used,
            created_at=build.created_at,
        ).model_dump()
    )
    build_outcomes_total.labels(status="failed").inc()
    return {"status": "failed", "build_id": build.id, "credits_used": used, "reason": BYOK_INTERRUPTED}


@current_app.task(name="backend.tasks.build_tasks.update_build_status")
def update_build_status(build_id: str, status: str, error: Optional[str] = None) -> dict:
    """Update build status in database."""

    async def _update():
        db = await get_db()
        current = await db.builds.find_one({"id": build_id}, {"_id": 0, "status": 1, "build_status": 1}) or {}
        previous = current.get("build_status") or (
            execution_state.canonical_for(current["status"]) if current.get("status") else None
        )
        extra = {"error": error} if error else {}
        await db.builds.update_one(
            {"id": build_id},
            execution_state.transition_update(previous, status, reason="status_update", extra_set=extra),
        )
        return {"status": "updated"}

    return _run_async(_update())