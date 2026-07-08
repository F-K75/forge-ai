"""Celery tasks for build processing with persistence and retry logic."""

import asyncio
import logging
import time
import uuid
from datetime import datetime
from typing import Optional
from celery.exceptions import SoftTimeLimitExceeded
from celery_app import celery_app as current_app
from core.config import get_settings
from core.metrics import build_outcomes_total, build_duration_seconds, build_credits_used
from core.models import Build, BuildStatus, BuildDeadLetter, WSEvent, WSEventType, BuildFile
from core.orchestrator import Orchestrator
from core.database import get_db
from sandbox.runner import SandboxRunner
from services.ws_manager import manager

logger = logging.getLogger(__name__)

settings = get_settings()
orchestrator = Orchestrator()
sandbox = SandboxRunner()

_worker_loop: Optional[asyncio.AbstractEventLoop] = None


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

    No autoretry_for: run_build isn't resumable (every invocation restarts
    the whole pipeline from the Architect, see core/orchestrator.py), so
    blindly retrying on any exception would silently discard and re-run
    agents that already succeeded, rather than recovering anything. Instead
    run_build's except block retries manually via self.retry(), and only
    when zero agents have completed yet -- see the made_progress check.
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
            {"id": project_id}, {"_id": 0, "template": 1}
        )
        template = project_doc.get("template") if project_doc else None

        async def emit(event: WSEvent) -> None:
            await db.builds.update_one(
                {"id": build_id},
                {
                    "$set": {
                        "status": build.status,
                        "agents": [a.model_dump() for a in build.agents],
                        "credits_used": build.credits_used,
                        "business_model": build.business_model,
                    }
                },
            )
            await manager.emit(event)

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

        try:
            build, files = await orchestrator.run_build(
                build,
                emit=emit,
                sandbox_runner=sandbox,
                conversation_history=conversation_history,
                existing_files=existing_files,
                template=template,
            )
            await db.builds.update_one({"id": build_id}, {"$set": build.model_dump()})

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
                    {"id": user_id, "credits": {"$gte": reserved_credits - used}},
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
            logger.exception(
                "Build %s exceeded soft time limit of %ss",
                build_id,
                settings.build_timeout,
            )
            used = int(build.credits_used or 0)
            refund = max(0, reserved_credits - used)
            if refund and user:
                await db.users.update_one(
                    {"id": user_id},
                    {"$inc": {"credits": refund}}
                )

            await db.builds.update_one(
                {"id": build_id},
                {"$set": {"status": BuildStatus.FAILED.value, "error": "Build exceeded maximum allowed time", "credits_used": used}}
            )
            build_duration_seconds.observe(time.monotonic() - start_time)
            build_outcomes_total.labels(status="timeout").inc()
            build_credits_used.observe(used)
            await _dead_letter("timeout", "Build exceeded maximum allowed time", self.request.retries)
            raise

        except Exception as e:
            max_retries = self.retry_kwargs.get("max_retries", 0)
            is_final_attempt = self.request.retries >= max_retries
            made_progress = any(a.status == BuildStatus.SUCCESS for a in build.agents)

            if not made_progress and not is_final_attempt:
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

            await db.builds.update_one(
                {"id": build_id},
                {"$set": {"status": BuildStatus.FAILED.value, "error": str(e), "credits_used": used}}
            )
            build_duration_seconds.observe(time.monotonic() - start_time)
            build_outcomes_total.labels(status="failed").inc()
            build_credits_used.observe(used)
            await _dead_letter("exception", str(e), self.request.retries)
            raise

    return _run_async(_run())


@current_app.task(name="backend.tasks.build_tasks.update_build_status")
def update_build_status(build_id: str, status: str, error: Optional[str] = None) -> dict:
    """Update build status in database."""

    async def _update():
        db = await get_db()
        update_doc = {"status": status}
        if error:
            update_doc["error"] = error
        await db.builds.update_one({"id": build_id}, {"$set": update_doc})
        return {"status": "updated"}

    return _run_async(_update())