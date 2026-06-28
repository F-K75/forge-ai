import asyncio
import time
from fastapi import (
    APIRouter,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    Depends,
    BackgroundTasks,
    Request,
    Query,
)
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
from datetime import datetime, timedelta

from core.models import (
    Build,
    BuildStatus,
    Project,
    User,
    PlanTier,
    WSEvent,
    WSEventType,
)
from core.orchestrator import Orchestrator, MAX_DEBUG_ITERATIONS
from core.database import get_db
from sandbox.runner import SandboxRunner
from services.ws_manager import manager, get_ws_user
from api.auth import get_current_user
from core.config import get_settings

router = APIRouter(prefix="/builds", tags=["builds"])
orchestrator = Orchestrator()
sandbox = SandboxRunner()
settings = get_settings()


# Credit costs
CREDIT_COSTS = {
    "architect": settings.credits_architect,
    "designer": settings.credits_designer,
    "developer": settings.credits_developer,
    "integration": settings.credits_integration,
    "pm": settings.credits_pm,
    "debug": settings.credits_debug,
}


class CreateBuildRequest(BaseModel):
    project_id: str
    prompt: str = Field(..., max_length=50000)


@router.post("/")
async def create_build(
    req: CreateBuildRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()

    project = await db.projects.find_one({"id": req.project_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # User isolation: check if user owns project or belongs to org
    if project.get("user_id") != current_user.id:
        org_id = project.get("org_id")
        if org_id:
            membership = await db.team_members.find_one(
                {"org_id": org_id, "user_id": current_user.id}, {"_id": 0}
            )
            if not membership:
                raise HTTPException(status_code=404, detail="Project not found")
        else:
            raise HTTPException(status_code=404, detail="Project not found")

    # Credit reservation (atomic) to prevent concurrent deduction race.
    estimated_credits = sum(CREDIT_COSTS.values()) * (
        len(project.get("tech_stack", {})) + 1
    )
    max_credits = max(
        MAX_DEBUG_ITERATIONS * CREDIT_COSTS.get("debug", 2), estimated_credits
    )

    reserved = await db.users.find_one_and_update(
        {"id": current_user.id, "credits": {"$gte": max_credits}},
        {"$inc": {"credits": -max_credits}},
        return_document=True,
    )
    if not reserved:
        raise HTTPException(status_code=402, detail="Insufficient credits")

    # Build deduplication: prevent duplicate builds for the same project within 30 seconds
    thirty_seconds_ago = datetime.utcnow() - timedelta(seconds=30)
    recent_build = await db.builds.find_one(
        {
            "project_id": req.project_id,
            "user_id": current_user.id,
            "status": {"$in": ["pending", "building"]},
            "created_at": {"$gte": thirty_seconds_ago.isoformat()},
        },
        {"_id": 0},
    )
    if recent_build:
        raise HTTPException(
            status_code=429,
            detail="A build is already in progress for this project. Please wait.",
        )

    build = Build(
        project_id=req.project_id,
        user_id=current_user.id,
        prompt=req.prompt,
        status=BuildStatus.PENDING,
    )

    await db.builds.insert_one(build.model_dump())

    background_tasks.add_task(
        _run_build_background,
        build,
        req.project_id,
        current_user.id,
        max_credits,
    )

    return {"build_id": build.id, "status": build.status}


async def _run_build_background(
    build: Build, project_id: str, user_id: str, reserved_credits: int
):
    db = await get_db()

    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return

    async def emit(event):
        await manager.emit(event)
        await db.builds.update_one(
            {"id": build.id},
            {
                "$set": {
                    "status": build.status,
                    "agents": [a.model_dump() for a in build.agents],
                    "files": build.files,
                    "credits_used": build.credits_used,
                }
            },
        )

    # Build already reserved credits at creation time.
    # On success: refund un-used credits.
    # On failure: refund reserved credits.
    try:
        await asyncio.wait_for(
            orchestrator.run_build(build, emit=emit, sandbox_runner=sandbox),
            timeout=settings.build_timeout,
        )
        await db.builds.update_one({"id": build.id}, {"$set": build.model_dump()})

        used = int(build.credits_used or 0)
        refund = max(0, reserved_credits - used)
        if refund:
            # Atomic refund with guard: only refund if user still has deducted credits
            result = await db.users.find_one_and_update(
                {"id": user_id, "credits": {"$gte": reserved_credits - used}},
                {"$inc": {"credits": refund}},
                return_document=True,
            )
            if not result:
                # Credits were already modified (shouldn't happen, but fail safe)
                pass

        user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "credits": 1})
        remaining = int((user_doc or {}).get("credits", 0))
        await manager.emit(
            WSEvent(
                type=WSEventType.CREDITS_UPDATE,
                build_id=build.id,
                data={"credits_used": used, "remaining": remaining},
            )
        )
    except Exception as e:
        # refund everything reserved since build didn't complete
        if reserved_credits:
            await db.users.update_one(
                {"id": user_id},
                {"$inc": {"credits": reserved_credits}},
            )

        await db.builds.update_one(
            {"id": build.id},
            {"$set": {"status": BuildStatus.FAILED, "error": str(e)}},
        )



@router.get("/{build_id}")
async def get_build(build_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    build = await db.builds.find_one(
        {"id": build_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    return build


@router.get("/{build_id}/files")
async def get_build_files(
    build_id: str, current_user: User = Depends(get_current_user)
):
    db = await get_db()
    build = await db.builds.find_one(
        {"id": build_id, "user_id": current_user.id}, {"_id": 0, "files": 1}
    )
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    return build.get("files", {})


@router.post("/{build_id}/rollback/{version}")
async def rollback_build(
    build_id: str, version: int, current_user: User = Depends(get_current_user)
):
    """Roll back to a previous build version."""
    db = await get_db()
    build = await db.builds.find_one(
        {"id": build_id, "user_id": current_user.id}, {"_id": 0}
    )
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")

    project_id = build.get("project_id")
    if not project_id:
        raise HTTPException(status_code=400, detail="Build has no project_id")

    builds = (
        await db.builds.find(
            {"project_id": project_id, "user_id": current_user.id}, {"_id": 0}
        )
        .sort("created_at", 1)
        .to_list(None)
    )

    if version >= len(builds):
        raise HTTPException(status_code=400, detail="Version not found")

    target = builds[version]
    return {"files": target.get("files", {}), "version": version}


@router.websocket("/ws/{build_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    build_id: str,
    token: Optional[str] = Query(None),
):
    # Do not accept/register until auth + ownership checks have passed.
    try:
        user = await get_ws_user(token, build_id=build_id)
    except HTTPException as e:
        await websocket.close(code=4001, reason=str(e.detail))
        return

    db = await get_db()
    build = await db.builds.find_one(
        {"id": build_id, "user_id": user.id}, {"_id": 0}
    )
    if not build:
        await websocket.close(code=4003, reason="Foreign build")
        return

    # Ownership verified: register and accept.
    await manager.connect(websocket, build_id)
    await manager.accept(websocket)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, build_id)

