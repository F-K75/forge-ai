"""Standalone ASGI app for the Review Board orchestrator.

Run with:  uvicorn orchestrator.main:app --reload --port 8100
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router as reviews_router
from .config import get_settings
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    max_age=600,
)

app.include_router(reviews_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
