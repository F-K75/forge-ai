"""External intake for Repository Monitoring findings.

`api/agent_registry.py` exposes `/projects/{project_id}/org/monitoring/findings`
for recording findings, but that route (like every other route in that
router) requires an authenticated Forge user session -- fine for a human or
an internal agent, but real external signal sources (a CI pipeline, a
dependency scanner, a GitHub Actions job) can't hold a Forge session cookie.

This module is that external-facing intake path. It reuses the existing
user-scoped API key mechanism from `api/api_keys.py` (`validate_api_key`)
instead of inventing a new, parallel, unauthenticated webhook scheme: a
caller proves "I am acting on behalf of user X" by presenting one of that
user's API keys, exactly like any other machine-to-Forge integration would.
Once resolved to a user, the same project-ownership check used everywhere
else in this package (`has_project_access`) still applies -- an API key
scoped to a user does not grant access to projects that user doesn't own.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from api.api_keys import validate_api_key
from core.database import get_db
from core.models import User
from core.permissions import has_project_access

from agent_registry.monitoring import (
    FindingCategory,
    FindingSeverity,
    MonitoringFinding,
    get_repository_monitor,
)

router = APIRouter(prefix="/projects/{project_id}/monitoring/webhook", tags=["monitoring-webhook"])

API_KEY_HEADER = "X-API-Key"


async def verify_api_key(request: Request) -> User:
    """Authenticate a machine caller via a Forge API key instead of a
    session cookie/JWT, reusing `api.api_keys.validate_api_key` -- the same
    hashing/lookup/expiry logic backing the user-facing API key system --
    rather than a bespoke parallel scheme."""
    provided_key = request.headers.get(API_KEY_HEADER)
    if not provided_key:
        raise HTTPException(status_code=401, detail="Missing API key")

    user = await validate_api_key(provided_key)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired API key")
    return user


async def _assert_project_access(db, project_id: str, user_id: str) -> None:
    project = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not project or not await has_project_access(db, user_id, project):
        raise HTTPException(status_code=404, detail="Project not found")


class FindingWebhookPayload(BaseModel):
    """Generic CI/monitoring-tool-shaped finding, deliberately mirroring the
    same `FindingCategory`/`FindingSeverity` enums `RepositoryMonitor` already
    defines rather than a new vocabulary an external system would have to
    learn. `source` defaults to "webhook" (vs. `record_finding`'s own
    "manual" default) since that better reflects where these findings
    actually come from."""

    category: FindingCategory
    severity: FindingSeverity
    title: str
    description: str = ""
    source: str = "webhook"
    auto_escalate: bool = True


@router.post("/findings", response_model=MonitoringFinding)
async def record_finding_webhook(
    project_id: str,
    payload: FindingWebhookPayload,
    current_user: User = Depends(verify_api_key),
):
    """Intake a monitoring finding from an external system (CI pipeline,
    dependency scanner, GitHub Actions job, ...) authenticated via API key.
    HIGH/CRITICAL findings are auto-escalated into a routed change request
    unless the caller opts out."""
    db = await get_db()
    await _assert_project_access(db, project_id, current_user.id)

    monitor = get_repository_monitor()
    finding = await monitor.record_finding(
        project_id,
        payload.category,
        payload.severity,
        payload.title,
        description=payload.description,
        source=payload.source,
        auto_escalate=payload.auto_escalate,
    )
    return finding
