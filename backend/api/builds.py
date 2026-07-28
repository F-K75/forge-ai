import asyncio
import json

from fastapi import (
    APIRouter,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    Depends,
)
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime, timedelta

from core.models import (
    Build,
    BuildStatus,
    User,
    PlanTier,
    BuildFile,
    PaginationParams,
)
from core.orchestrator import MAX_DEBUG_ITERATIONS
from core.database import get_db, with_transaction
from services.ws_manager import manager, authenticate_websocket
from tasks.build_tasks import run_build
from api.auth import get_current_user
from core.config import get_settings
from core.security import sanitize_prompt
from core.permissions import has_build_access
from services.credit_alerts import check_and_send_credit_alerts

router = APIRouter(prefix="/builds", tags=["builds"])
settings = get_settings()


# Credit costs
CREDIT_COSTS = {
    "architect": settings.credits_architect,
    "business_model": settings.credits_business_model,
    "designer": settings.credits_designer,
    "developer": settings.credits_developer,
    "integration": settings.credits_integration,
    "pm": settings.credits_pm,
    "debug": settings.credits_debug,
}


class CreateBuildRequest(BaseModel):
    project_id: str
    prompt: str = Field(..., max_length=50000)
    idempotency_key: Optional[str] = Field(None, max_length=64)
    # Interactive builds pause after the planning agents (architect,
    # business model, designer) for user approval, and let the architect
    # ask clarifying questions before drawing the blueprint.
    interactive: bool = False


@router.post("/")
async def create_build(
    req: CreateBuildRequest,
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

    # Trial enforcement: check if trial has expired
    if current_user.trial_ends_at and datetime.utcnow() > current_user.trial_ends_at:
        if current_user.plan == PlanTier.FREE:
            raise HTTPException(
                status_code=402,
                detail="Your trial has expired. Please upgrade to continue building.",
            )

    # Email verification: block builds for unverified users
    user_doc = await db.users.find_one({"id": current_user.id}, {"_id": 0, "email_verified": 1})
    if user_doc and not user_doc.get("email_verified"):
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before building. Check your inbox for the verification link.",
        )

    # Idempotency key: if provided, return the existing build if one already
    # exists with the same key for this user. This prevents duplicate builds
    # from network retries (BUS-007).
    if req.idempotency_key:
        existing = await db.builds.find_one(
            {
                "user_id": current_user.id,
                "idempotency_key": req.idempotency_key,
            },
            {"_id": 0},
        )
        if existing:
            return {
                "build_id": existing["id"],
                "status": existing.get("status", BuildStatus.PENDING),
                "idempotent": True,
            }

    # Credit reservation (atomic) to prevent concurrent deduction race.
    estimated_credits = sum(CREDIT_COSTS.values()) * (
        len(project.get("tech_stack", {})) + 1
    )
    max_credits = max(
        MAX_DEBUG_ITERATIONS * CREDIT_COSTS.get("debug", 2), estimated_credits
    )

    build = None
    reserved_doc = None
    used_free_build = False

    if req.idempotency_key:
        existing = await db.builds.find_one(
            {
                "user_id": current_user.id,
                "idempotency_key": req.idempotency_key,
            },
            {"_id": 0},
        )
        if existing:
            return {
                "build_id": existing["id"],
                "status": existing.get("status", BuildStatus.PENDING),
                "idempotent": True,
            }

    thirty_seconds_ago = datetime.utcnow() - timedelta(seconds=30)
    recent_build = await db.builds.find_one(
        {
            "project_id": req.project_id,
            "user_id": current_user.id,
            "status": {"$in": ["pending", "building"]},
            "created_at": {"$gte": thirty_seconds_ago},
        },
        {"_id": 0},
    )
    if recent_build:
        raise HTTPException(
            status_code=429,
            detail="A build is already in progress for this project. Please wait.",
        )

    async def _create_build_in_txn(session) -> None:
        nonlocal reserved_doc, build, used_free_build
        users = db.users
        builds = db.builds
        free_build = await users.find_one_and_update(
            {"id": current_user.id, "free_build_used": {"$ne": True}},
            {"$set": {"free_build_used": True}},
            session=session,
            return_document=True,
        )

        if free_build is not None:
            used_free_build = True
            reserved_doc = free_build
        else:
            reserved_doc = await users.find_one_and_update(
                {"id": current_user.id, "credits": {"$gte": max_credits}},
                {"$inc": {"credits": -max_credits}},
                session=session,
                return_document=True,
            )
            if not reserved_doc:
                raise HTTPException(status_code=402, detail="Insufficient credits")

        build = Build(
            project_id=req.project_id,
            user_id=current_user.id,
            prompt=sanitize_prompt(req.prompt),
            idempotency_key=req.idempotency_key,
            status=BuildStatus.PENDING,
            interactive=req.interactive,
        )
        build_dict = build.model_dump()
        if build_dict.get("idempotency_key") is None:
            build_dict.pop("idempotency_key", None)

        await builds.insert_one(build_dict, session=session)

    await with_transaction(_create_build_in_txn)

    if reserved_doc is None or build is None:
        raise HTTPException(status_code=500, detail="Build creation failed")

    await check_and_send_credit_alerts(
        db, current_user.id, reserved_doc.get("plan", "free"), reserved_doc.get("credits", 0)
    )

    try:
        conversation_history, existing_files = await _get_prior_build_context(
            db, req.project_id
        )

        run_build.delay(
            build.id,
            req.project_id,
            current_user.id,
            max_credits if not used_free_build else 0,
            conversation_history,
            existing_files,
        )
    except Exception:
        await db.users.update_one(
            {"id": current_user.id}, {"$inc": {"credits": max_credits}}
        )
        if used_free_build:
            await db.users.update_one(
                {"id": current_user.id}, {"$set": {"free_build_used": False}}
            )
        raise

    return {"build_id": build.id, "status": build.status}


async def _get_prior_build_context(db, project_id: str):
    """Fetch the most recent successful build for this project so a follow-up
    prompt can amend the existing app instead of regenerating it from scratch."""
    prior_build = await db.builds.find_one(
        {"project_id": project_id, "status": BuildStatus.SUCCESS},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not prior_build:
        return None, None

    conversation_history = None
    for step in prior_build.get("agents", []):
        if step.get("agent") == "architect" and step.get("output"):
            conversation_history = [
                {"role": "user", "content": f"Previous app idea: {prior_build.get('prompt', '')}"},
                {"role": "assistant", "content": step["output"]},
            ]
            break

    build_files = await db.build_files.find({"build_id": prior_build["id"]}, {"_id": 0, "path": 1, "content": 1}).to_list(None)
    existing_files = {f["path"]: f["content"] for f in build_files} if build_files else None
    return conversation_history, existing_files


@router.get("/{build_id}")
async def get_build(build_id: str, current_user: User = Depends(get_current_user)):
    db = await get_db()
    build = await db.builds.find_one({"id": build_id}, {"_id": 0})
    if not build or not await has_build_access(db, current_user.id, build):
        raise HTTPException(status_code=404, detail="Build not found")
    return build


@router.get("/{build_id}/files")
async def get_build_files(
    build_id: str, current_user: User = Depends(get_current_user)
):
    db = await get_db()
    build = await db.builds.find_one(
        {"id": build_id}, {"_id": 0, "user_id": 1, "project_id": 1}
    )
    if not build or not await has_build_access(db, current_user.id, build):
        raise HTTPException(status_code=404, detail="Build not found")
    files = await db.build_files.find({"build_id": build_id}, {"_id": 0, "path": 1, "content": 1}).to_list(None)
    return {f["path"]: f["content"] for f in files}


class GateResponseRequest(BaseModel):
    gate_id: str = Field(..., max_length=64)
    action: str = Field(..., pattern="^(approve|cancel|answers)$")
    answers: Optional[list[str]] = None

    @property
    def normalized_answers(self) -> list[str]:
        return [a[:2000] for a in (self.answers or []) if isinstance(a, str)][:8]


@router.post("/{build_id}/gate")
async def respond_to_gate(
    build_id: str,
    req: GateResponseRequest,
    current_user: User = Depends(get_current_user),
):
    """Resolve an interactive build's pending gate (approve / cancel /
    clarifying-question answers). The Celery worker running the pipeline
    polls pending_gate.response — see Orchestrator._wait_for_gate."""
    db = await get_db()
    build = await db.builds.find_one(
        {"id": build_id}, {"_id": 0, "user_id": 1, "project_id": 1, "pending_gate": 1}
    )
    if not build or not await has_build_access(db, current_user.id, build):
        raise HTTPException(status_code=404, detail="Build not found")

    pending = build.get("pending_gate") or {}
    if pending.get("gate_id") != req.gate_id:
        raise HTTPException(status_code=409, detail="No matching pending gate")
    if pending.get("response"):
        raise HTTPException(status_code=409, detail="Gate already resolved")

    await db.builds.update_one(
        {"id": build_id, "pending_gate.gate_id": req.gate_id},
        {
            "$set": {
                "pending_gate.response": {
                    "action": req.action,
                    "answers": req.normalized_answers,
                    "responded_at": datetime.utcnow().isoformat(),
                }
            }
        },
    )
    return {"status": "ok"}


@router.post("/{build_id}/rollback/{version}")
async def rollback_build(
    build_id: str, version: int, current_user: User = Depends(get_current_user)
):
    """Roll back to a previous build version by creating a new build record
    that restores that version's files as the current state."""
    db = await get_db()
    build = await db.builds.find_one({"id": build_id}, {"_id": 0})
    if not build or not await has_build_access(db, current_user.id, build):
        raise HTTPException(status_code=404, detail="Build not found")

    project_id = build.get("project_id")
    if not project_id:
        raise HTTPException(status_code=400, detail="Build has no project_id")

    builds = (
        await db.builds.find({"project_id": project_id}, {"_id": 0})
        .sort("created_at", 1)
        .to_list(None)
    )

    if version < 0 or version >= len(builds):
        raise HTTPException(status_code=400, detail="Version not found")

    target = builds[version]
    target_files = await db.build_files.find({"build_id": target["id"]}, {"_id": 0, "path": 1, "content": 1}).to_list(None)
    files_dict = {f["path"]: f["content"] for f in target_files} if target_files else {}

    rollback_build_record = Build(
        project_id=project_id,
        user_id=current_user.id,
        prompt=f"Rollback to build {target['id']} (version {version})",
        status=BuildStatus.SUCCESS,
        completed_at=datetime.utcnow(),
    )
    await db.builds.insert_one(rollback_build_record.model_dump())

    if files_dict:
        await db.build_files.insert_many([
            BuildFile(build_id=rollback_build_record.id, path=path, content=content).model_dump()
            for path, content in files_dict.items()
        ])

    return {
        "build_id": rollback_build_record.id,
        "files": files_dict,
        "version": version,
    }


@router.websocket("/ws/{build_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    build_id: str,
):
    # Auth happens via a first-message {"type": "auth", "token": ...} handshake
    # rather than a query-string token, which leaks into proxy/access logs.
    user = await authenticate_websocket(websocket, build_id=build_id)
    if not user:
        return

    await manager.connect(websocket, build_id)

    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Keep-alive ping so proxies don't drop the idle socket,
                # matching the pattern already used by orchestrator/api.py.
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket, build_id)


class DeadLetterResponse(BaseModel):
    build_id: str
    reason: str
    error: str
    retry_count: int
    credits_used: int
    created_at: datetime
    dead_lettered_at: datetime


@router.get("/dead-letter", response_model=List[DeadLetterResponse])
async def list_my_dead_letters(
    current_user: User = Depends(get_current_user),
    params: PaginationParams = Depends(),
):
    db = await get_db()
    result = await paginated_query(
        db.build_dead_letters,
        {"user_id": current_user.id},
        page=params.page,
        per_page=params.per_page,
        sort=[("dead_lettered_at", -1)],
    )
    return [DeadLetterResponse(**doc) for doc in result.items]

