"""Celery tasks for build processing with persistence and retry logic."""

from typing import Optional
from celery import current_app
from core.models import Build, BuildStatus, WSEvent, WSEventType, BuildFile
from core.orchestrator import Orchestrator
from core.database import get_db
from sandbox.runner import SandboxRunner
from services.ws_manager import manager

orchestrator = Orchestrator()
sandbox = SandboxRunner()


class BuildTask(current_app.Task):
    """Base task class with error handling and retry configuration."""
    
    autoretry_for = (Exception,)
    retry_kwargs = {"max_retries": 3, "countdown": 60}
    retry_backoff = True
    retry_jitter = True
    acks_late = True  # Only acknowledge after task completes


@current_app.task(bind=True, base=BuildTask, name="backend.tasks.build_tasks.run_build")
def run_build(
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
    import asyncio

    async def _run():
        db = await get_db()

        # Fetch the build
        build_doc = await db.builds.find_one({"id": build_id}, {"_id": 0})
        if not build_doc:
            raise ValueError(f"Build {build_id} not found")

        build = Build(**build_doc)
        user = await db.users.find_one({"id": user_id}, {"_id": 0})

        async def emit(event: WSEvent) -> None:
            # Persist before broadcasting so a REST fallback triggered by a client
            # reacting to this event can never observe pre-update state.
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

        try:
            build, files = await orchestrator.run_build(
                build,
                emit=emit,
                sandbox_runner=sandbox,
                conversation_history=conversation_history,
                existing_files=existing_files,
            )
            await db.builds.update_one({"id": build_id}, {"$set": build.model_dump()})

            # Files live in a separate collection to avoid the 16MB doc limit.
            if files:
                await db.build_files.delete_many({"build_id": build_id})
                await db.build_files.insert_many([
                    BuildFile(build_id=build_id, path=path, content=content).model_dump()
                    for path, content in files.items()
                ])

            # On success: refund whatever portion of the reservation wasn't
            # actually consumed by agents that ran before completion.
            used = int(build.credits_used or 0)
            refund = max(0, reserved_credits - used)
            if refund and user:
                # Atomic refund with guard: only refund if user still has deducted credits
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

            return {"status": "success", "build_id": build_id, "credits_used": used}

        except Exception as e:
            # On failure: refund only the unused portion of the reservation —
            # agents that already ran before the failure already spent their share.
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
            raise
    
    return asyncio.run(_run())


@current_app.task(name="backend.tasks.build_tasks.update_build_status")
def update_build_status(build_id: str, status: str, error: Optional[str] = None) -> dict:
    """Update build status in database."""
    import asyncio
    
    async def _update():
        db = await get_db()
        update_doc = {"status": status}
        if error:
            update_doc["error"] = error
        await db.builds.update_one({"id": build_id}, {"$set": update_doc})
        return {"status": "updated"}
    
    return asyncio.run(_update())