"""Pydantic v2 models for the Review Board orchestrator.

These types form the contract between the loader, runner, consolidator,
and persistence layers. They are deliberately permissive where agent/LLM
output is involved (parsed defensively) and strict where we control the
data (config + run metadata).
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_id() -> str:
    return uuid4().hex


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #
class Severity(str, Enum):
    critical = "critical"
    high = "high"
    medium = "medium"
    low = "low"


class Effort(str, Enum):
    S = "S"
    M = "M"
    L = "L"


class RunStatus(str, Enum):
    pending = "pending"
    running = "running"
    consolidating = "consolidating"
    complete = "complete"
    failed = "failed"


class AgentStatus(str, Enum):
    success = "success"
    failed = "failed"
    skipped = "skipped"


class Recommendation(str, Enum):
    GO = "GO"
    NO_GO = "NO_GO"
    GO_WITH_FIXES = "GO_WITH_FIXES"


class ReviewMode(str, Enum):
    full = "full"
    diff = "diff"


# Severity ordering for sorting (higher == more severe).
SEVERITY_RANK: dict[str, int] = {
    Severity.critical.value: 4,
    Severity.high.value: 3,
    Severity.medium.value: 2,
    Severity.low.value: 1,
}


# --------------------------------------------------------------------------- #
# Agent configuration (loaded from agents/*.json)
# --------------------------------------------------------------------------- #
class AgentConfig(BaseModel):
    """A single agent definition, validated from JSON.

    Schema violations raise loudly at load time (see loader.py).
    """

    id: str = Field(..., min_length=1)
    stage: int = Field(..., ge=0)
    model: str = Field(..., min_length=1)
    system_prompt: str = Field(..., min_length=1)
    # Glob patterns (gitignore-style). Empty list == always runs.
    triggers: list[str] = Field(default_factory=list)
    # Free-form schema description shown to the model; not enforced structurally.
    output_schema: dict[str, Any] = Field(default_factory=dict)

    @field_validator("triggers")
    @classmethod
    def _strip_triggers(cls, v: list[str]) -> list[str]:
        return [t.strip() for t in v if t and t.strip()]


# --------------------------------------------------------------------------- #
# Findings
# --------------------------------------------------------------------------- #
class Issue(BaseModel):
    severity: Severity = Severity.medium
    title: str = ""
    description: str = ""
    fix: str = ""
    files: list[str] = Field(default_factory=list)

    @field_validator("severity", mode="before")
    @classmethod
    def _coerce_severity(cls, v: Any) -> Any:
        if isinstance(v, str):
            v = v.strip().lower()
            if v not in SEVERITY_RANK:
                return Severity.medium.value
        return v

    @field_validator("files", mode="before")
    @classmethod
    def _coerce_files(cls, v: Any) -> Any:
        if v is None:
            return []
        if isinstance(v, str):
            return [v]
        return v


class TokenUsage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0

    @property
    def total(self) -> int:
        return self.input_tokens + self.output_tokens

    def __add__(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(
            input_tokens=self.input_tokens + other.input_tokens,
            output_tokens=self.output_tokens + other.output_tokens,
        )


class AgentReport(BaseModel):
    agent_id: str
    stage: int
    model: str
    status: AgentStatus = AgentStatus.success
    score: Optional[int] = None
    issues: list[Issue] = Field(default_factory=list)
    raw_output: Optional[str] = None
    error: Optional[str] = None
    usage: TokenUsage = Field(default_factory=TokenUsage)
    cost_usd: float = 0.0
    duration_s: float = 0.0
    matched_files: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Consolidated ("CTO") output
# --------------------------------------------------------------------------- #
class ConsolidatedReport(BaseModel):
    overall_score: int = 0
    recommendation: Recommendation = Recommendation.NO_GO
    summary: str = ""
    deduplicated_issues: list[Issue] = Field(default_factory=list)
    top_10_critical: list[Issue] = Field(default_factory=list)
    top_25_improvements: list[Issue] = Field(default_factory=list)

    @field_validator("recommendation", mode="before")
    @classmethod
    def _coerce_rec(cls, v: Any) -> Any:
        if isinstance(v, str):
            v = v.strip().upper().replace("-", "_").replace(" ", "_")
            if v not in {r.value for r in Recommendation}:
                return Recommendation.NO_GO.value
        return v


# --------------------------------------------------------------------------- #
# Persistence documents
# --------------------------------------------------------------------------- #
class BacklogItem(BaseModel):
    id: str = Field(default_factory=_new_id)
    run_id: str
    title: str = ""
    description: str = ""
    fix: str = ""
    severity: Severity = Severity.medium
    effort: Effort = Effort.M
    impact: int = Field(default=0, ge=0, le=10)
    source_agent: str = ""
    files: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utcnow)


class ReviewRun(BaseModel):
    run_id: str = Field(default_factory=_new_id)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    repo_path: str
    repo_ref: Optional[str] = None
    mode: ReviewMode = ReviewMode.full
    status: RunStatus = RunStatus.pending
    agent_reports: list[AgentReport] = Field(default_factory=list)
    consolidated: Optional[ConsolidatedReport] = None
    total_cost_usd: float = 0.0
    total_tokens: int = 0
    triggered_agents: list[str] = Field(default_factory=list)
    error: Optional[str] = None


# --------------------------------------------------------------------------- #
# API request/response shapes
# --------------------------------------------------------------------------- #
class CreateReviewRequest(BaseModel):
    repo_path: str = Field(..., min_length=1)
    diff: Optional[str] = None
    mode: ReviewMode = ReviewMode.full
    repo_ref: Optional[str] = None


class CreateReviewResponse(BaseModel):
    run_id: str
    status: RunStatus
