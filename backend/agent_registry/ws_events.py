"""Real-time push event model for the engineering-org dashboard.

Scoped by project_id (see services/org_ws_manager.py's OrgConnectionManager),
distinct from core.models.WSEvent (build_id-scoped) and core.pm_models.PMWSEvent
(initiative_id-scoped). Agents post a chat message, a change request advances/
gets reviewed/merges, a monitoring finding gets recorded/resolved, or a plan
gets created/decided -- any connected client watching the project sees it
immediately instead of needing to refetch.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict

from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class OrgEventType(str, Enum):
    MESSAGE_POSTED = "message_posted"
    CHANGE_REQUEST_UPDATED = "change_request_updated"
    FINDING_RECORDED = "finding_recorded"
    FINDING_RESOLVED = "finding_resolved"
    PLAN_CREATED = "plan_created"
    PLAN_DECIDED = "plan_decided"
    KERNEL_RUN_STARTED = "kernel_run_started"
    KERNEL_WAVE_STARTED = "kernel_wave_started"
    KERNEL_TASK_UPDATED = "kernel_task_updated"
    KERNEL_DELEGATION = "kernel_delegation"
    KERNEL_SKILL_ACTIVATED = "kernel_skill_activated"
    KERNEL_ARTIFACT_PUBLISHED = "kernel_artifact_published"
    KERNEL_CONFLICT_DETECTED = "kernel_conflict_detected"
    KERNEL_REPAIR_CYCLE = "kernel_repair_cycle"
    KERNEL_APPROVAL_REQUIRED = "kernel_approval_required"
    KERNEL_APPROVAL_RESOLVED = "kernel_approval_resolved"
    KERNEL_RUN_COMPLETED = "kernel_run_completed"


class OrgEvent(BaseModel):
    type: OrgEventType
    project_id: str
    data: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=_now)
