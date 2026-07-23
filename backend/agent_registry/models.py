"""Data models for the persistent Agent Registry.

An ``EngineeringOrg`` is the per-project org chart (leadership + departments).
An ``AgentProfile`` is a persistent "employee": a named role that survives
across tasks and restarts, accumulating stats, owned files, and a decision
history instead of being recreated per-request like the stateless classes in
``agents/*.py``.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class AgentLevel(str, Enum):
    JUNIOR = "junior"
    MID = "mid"
    SENIOR = "senior"
    LEAD = "lead"
    PRINCIPAL = "principal"


# Order defines promotion progression; index+1 is the next level.
LEVEL_ORDER: List[AgentLevel] = [
    AgentLevel.JUNIOR,
    AgentLevel.MID,
    AgentLevel.SENIOR,
    AgentLevel.LEAD,
    AgentLevel.PRINCIPAL,
]


class AgentStatus(str, Enum):
    ACTIVE = "active"
    IDLE = "idle"
    RETIRED = "retired"


class PerformanceStats(BaseModel):
    tasks_completed: int = 0
    tasks_failed: int = 0
    success_rate: float = 0.0
    tokens_used: int = 0
    cost_incurred: float = 0.0
    review_scores: List[float] = Field(default_factory=list)
    avg_review_score: Optional[float] = None
    last_active_at: Optional[str] = None


class AgentProfile(BaseModel):
    id: str = Field(default_factory=lambda: _new_id("agent"))
    project_id: str
    role: str
    department: str
    display_name: str
    level: AgentLevel = AgentLevel.JUNIOR
    status: AgentStatus = AgentStatus.ACTIVE
    owned_paths: List[str] = Field(default_factory=list)
    preferred_tools: List[str] = Field(default_factory=list)
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    stats: PerformanceStats = Field(default_factory=PerformanceStats)
    # Append-only log of promotions/retirements/creation for this agent.
    decision_log: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: str = Field(default_factory=_now)
    retired_at: Optional[str] = None
    retired_reason: Optional[str] = None


class Department(BaseModel):
    key: str
    name: str
    agent_ids: List[str] = Field(default_factory=list)


class Leadership(BaseModel):
    cto_agent_id: Optional[str] = None
    pm_agent_id: Optional[str] = None
    tech_lead_agent_id: Optional[str] = None
    architect_agent_id: Optional[str] = None


class EngineeringOrg(BaseModel):
    id: str = Field(default_factory=lambda: _new_id("org"))
    project_id: str
    leadership: Leadership = Field(default_factory=Leadership)
    departments: List[Department] = Field(default_factory=list)
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)
