"""Standalone ASGI app for the Review Board orchestrator.

Run with:  uvicorn orchestrator.main:app --reload --port 8100
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from .api import router as reviews_router
from .store import close


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await close()


app = FastAPI(
    title="Review Board Orchestrator",
    description="Multi-agent code review system. Audits a codebase and emits a "
    "prioritized improvement backlog. Read-only: never edits, commits, or deploys.",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(reviews_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
