from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import asyncio

from core.models import Build, BuildStatus, Project
from core.orchestrator import Orchestrator
from core.database import get_db
from sandbox.runner import SandboxRunner
from services.ws_manager import manager

router = APIRouter(prefix="/builds", tags=["builds"])
orchestrator = Orchestrator()
sandbox = SandboxRunner()


class CreateBuildRequest(BaseModel):
    project_id: str
    prompt: str
    user_id: str = "dev"  # TODO: replace with real auth


@router.post("/")
async def create_build(req: CreateBuildRequest, background_tasks: BackgroundTasks):
    db = await get_db()

    build = Build(
        project_id=req.project_id,
        user_id=req.user_id,
        prompt=req.prompt,
        status=BuildStatus.PENDING,
    )

    await db.builds.insert_one(build.model_dump())

    # Run the orchestrator in background
    background_tasks.add_task(
        _run_build_background,
        build,
        req.project_id,
    )

    return {"build_id": build.id, "status": build.status}


async def _run_build_background(build: Build, project_id: str):
    db = await get_db()

    async def emit(event):
        await manager.emit(event)
        # Also persist agent steps to DB
        await db.builds.update_one(
            {"id": build.id},
            {"$set": {
                "status": build.status,
                "agents": [a.model_dump() for a in build.agents],
                "files": build.files,
                "credits_used": build.credits_used,
            }}
        )

    try:
        await orchestrator.run_build(build, emit=emit, sandbox_runner=sandbox)
        await db.builds.update_one(
            {"id": build.id},
            {"$set": build.model_dump()}
        )
    except Exception as e:
        await db.builds.update_one(
            {"id": build.id},
            {"$set": {"status": BuildStatus.FAILED, "error": str(e)}}
        )


@router.get("/{build_id}")
async def get_build(build_id: str):
    db = await get_db()
    build = await db.builds.find_one({"id": build_id}, {"_id": 0})
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    return build


@router.get("/{build_id}/files")
async def get_build_files(build_id: str):
    db = await get_db()
    build = await db.builds.find_one({"id": build_id}, {"_id": 0, "files": 1})
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    return build.get("files", {})


@router.post("/{build_id}/rollback/{version}")
async def rollback_build(build_id: str, version: int):
    """Roll back to a previous build version."""
    db = await get_db()
    builds = await db.builds.find(
        {"project_id": {"$exists": True}},
        {"_id": 0}
    ).sort("created_at", 1).to_list(None)

    if version >= len(builds):
        raise HTTPException(status_code=400, detail="Version not found")

    target = builds[version]
    return {"files": target.get("files", {}), "version": version}


@router.websocket("/ws/{build_id}")
async def websocket_endpoint(websocket: WebSocket, build_id: str):
    await manager.connect(websocket, build_id)
    try:
        while True:
            # Keep connection alive; server pushes events
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, build_id)
