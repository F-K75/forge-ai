import asyncio
import json

from fastapi import (
    APIRouter,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    Depends,
    Query,
    Request,
)
from pydantic import BaseModel, Field
from typing import Optional
from datetime import timedelta

from core.models import (
    Build,
    BuildStatus,
    User,
    PlanTier,
    BuildFile,
    utcnow,
)
from core.orchestrator import Orchestrator, MAX_DEBUG_ITERATIONS
from core.database import get_db
from sandbox.runner import SandboxRunner
from services.ws_manager import manager, authenticate_websocket_token
from tasks.build_tasks import run_build
from api.auth import get_current_user
from core.config import get_settings
from core.security import sanitize_prompt
from core.permissions import has_build_access
from services.credit_alerts import check_and_send_credit_alerts

router = APIRouter(prefix="/builds", tags=["builds"])
orchestrator = Orchestrator()
sandbox = SandboxRunner()
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
    request: Request,
    current_user: User = Depends(get_current_user),
):
    db = await get_db()

    project = await db.projects.find_one({"id": req.project_id, "deleted_at": {"$exists": False}}, {"_id": 0})
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
    if current_user.trial_ends_at and utcnow() > current_user.trial_ends_at:
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

    # The first build on an account runs unmetered. A build reserves at least
    # sum(CREDIT_COSTS) credits -- more once the project has a tech stack --
    # while a new account is granted settings.free_credits, which is smaller.
    # Without this grant a free user is rejected before their first build ever
    # starts, so nobody can reach a finished application before paying.
    #
    # Claimed with a single atomic flag flip rather than by counting existing
    # builds: two concurrent requests would both read a count of zero, but only
    # one can win this update. The abuse ceiling is therefore exactly one
    # unmetered build per account. The flag is consumed on claim, including
    # when the build later fails -- see the caveat in FORGE_AUDIT_LOG.md.
    free_build = await db.users.find_one_and_update(
        {"id": current_user.id, "free_build_used": {"$ne": True}},
        {"$set": {"free_build_used": True}},
        return_document=True,
    )

    if free_build is not None:
        # Reserve nothing. The refund paths in tasks/build_tasks.py compute
        # max(0, reserved_credits - used), so a zero reservation neither debits
        # the account up front nor credits it back on completion.
        max_credits = 0
        reserved = free_build
    else:
        reserved = await db.users.find_one_and_update(
            {"id": current_user.id, "credits": {"$gte": max_credits}},
            {"$inc": {"credits": -max_credits}},
            return_document=True,
        )
        if not reserved:
            raise HTTPException(status_code=402, detail="Insufficient credits")

    await check_and_send_credit_alerts(
        db, current_user.id, reserved.get("plan", "free"), reserved["credits"]
    )

    try:
        # Build deduplication: prevent duplicate builds for the same project within 30 seconds
        thirty_seconds_ago = utcnow() - timedelta(seconds=30)
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

        build = Build(
            project_id=req.project_id,
            user_id=current_user.id,
            prompt=sanitize_prompt(req.prompt),
            idempotency_key=req.idempotency_key,
            status=BuildStatus.PENDING,
            interactive=req.interactive,
        )

        # Omit idempotency_key entirely when unset rather than writing null --
        # the unique index on (user_id, idempotency_key) is only partial over
        # documents where the field `$exists`, so a stored null still "exists"
        # and every no-idempotency-key build for a user collided with the
        # first one (DuplicateKeyError on the 2nd+ build, every time).
        build_dict = build.model_dump()
        if build_dict.get("idempotency_key") is None:
            build_dict.pop("idempotency_key", None)

        await db.builds.insert_one(build_dict)

        conversation_history, existing_files = await _get_prior_build_context(
            db, req.project_id
        )

        run_build.apply_async(
            args=(
                build.id,
                req.project_id,
                current_user.id,
                max_credits,
                conversation_history,
                existing_files,
            ),
            headers={"correlation_id": request.headers.get("X-Request-ID", "-")},
        )
    except Exception:
        # Anything failing between reservation and a successfully dispatched
        # Celery task (duplicate build, DB error, etc.) would otherwise leak
        # the reserved credits forever -- run_build's own refund logic never
        # gets a chance to run because the task was never enqueued.
        await db.users.update_one(
            {"id": current_user.id}, {"$inc": {"credits": max_credits}}
        )
        if free_build is not None:
            # Same leak, one level up: the task never ran, so the account never
            # got the unmetered build it just spent its one-shot grant on.
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
                    "responded_at": utcnow().isoformat(),
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
        completed_at=utcnow(),
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
    token: Optional[str] = Query(None),
):
    # Prefer the Sec-WebSocket-Protocol header so tokens never appear in
    # logs/access lists; query param kept for legacy/backward compatibility.
    header_token = websocket.headers.get("sec-websocket-protocol")
    ws_token = token or header_token
    user = await authenticate_websocket_token(ws_token, build_id=build_id)
    if not user:
        # Reject at the HTTP upgrade stage — closing before accepting makes
        # Starlette respond with HTTP 403 and never upgrade the connection.
        # This is the F-024 fix: no unauthenticated connection is ever opened.
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    await manager.connect(websocket, build_id)

    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        manager.disconnect(websocket, build_id)

