"""FastAPI surface for the Review Board orchestrator.

Routes:
  POST /reviews                  start a run (returns run_id immediately)
  GET  /reviews/{run_id}         status + results
  GET  /reviews/{run_id}/backlog backlog items (sortable)
  WS   /reviews/{run_id}/stream  live progress events

All handlers are async and non-blocking; the actual review runs in a
FastAPI background task.
"""
from __future__ import annotations

import asyncio
import json

from fastapi import (
    APIRouter,
    BackgroundTasks,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)

from .events import bus
from .models import (
    CreateReviewRequest,
    CreateReviewResponse,
    ReviewMode,
    ReviewRun,
    RunStatus,
)
from .service import execute_review
from .store import get_backlog, get_run, save_run

router = APIRouter(prefix="/reviews", tags=["reviews"])


async def _run_in_background(run: ReviewRun, diff: str | None) -> None:
    await execute_review(run, diff=diff)


@router.post("", response_model=CreateReviewResponse, status_code=202)
@router.post("/", response_model=CreateReviewResponse, status_code=202, include_in_schema=False)
async def create_review(
    req: CreateReviewRequest, background_tasks: BackgroundTasks
) -> CreateReviewResponse:
    if req.mode == ReviewMode.diff and not req.diff:
        raise HTTPException(
            status_code=400, detail="mode 'diff' requires a non-empty 'diff' body"
        )

    run = ReviewRun(
        repo_path=req.repo_path,
        repo_ref=req.repo_ref,
        mode=req.mode,
        status=RunStatus.pending,
    )
    await save_run(run)
    background_tasks.add_task(_run_in_background, run, req.diff)
    return CreateReviewResponse(run_id=run.run_id, status=run.status)


@router.get("/{run_id}")
async def get_review(run_id: str) -> dict:
    run = await get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    return run.model_dump(mode="json")


@router.get("/{run_id}/backlog")
async def get_review_backlog(
    run_id: str,
    sort_by: str = Query("severity", pattern="^(severity|impact)$"),
) -> dict:
    run = await get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    items = await get_backlog(run_id, sort_by=sort_by)
    return {"run_id": run_id, "sort_by": sort_by, "count": len(items), "items": items}


@router.websocket("/{run_id}/stream")
async def stream_review(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    queue, history = bus.subscribe(run_id)
    try:
        # Replay any events emitted before the client connected.
        for event in history:
            await websocket.send_text(json.dumps(event))
        if bus.is_finished(run_id):
            return

        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=30)
            except asyncio.TimeoutError:
                # Keep-alive ping so proxies don't drop idle sockets.
                await websocket.send_text(json.dumps({"type": "ping"}))
                continue
            await websocket.send_text(json.dumps(event))
            if event.get("type") in ("complete", "error"):
                break
    except WebSocketDisconnect:
        pass
    finally:
        bus.unsubscribe(run_id, queue)
