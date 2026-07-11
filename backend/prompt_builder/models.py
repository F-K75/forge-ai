from __future__ import annotations

import hashlib
import time
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ProjectStateSlice(BaseModel):
    """A filtered subset of project/initiative state relevant to one agent
    role. Callers build this from Build/Project/Initiative rather than
    passing the full domain object, so unrelated fields never enter a prompt."""

    project_name: Optional[str] = None
    tech_stack: List[str] = Field(default_factory=list)
    architecture_summary: Optional[str] = None
    current_milestone: Optional[str] = None
    completed_tasks: List[str] = Field(default_factory=list)
    pending_tasks: List[str] = Field(default_factory=list)
    dependencies: List[str] = Field(default_factory=list)
    coding_standards: Optional[str] = None
    extra: Dict[str, Any] = Field(default_factory=dict)


class PromptContext(BaseModel):
    agent_role: str
    task: str
    project_state: ProjectStateSlice = Field(default_factory=ProjectStateSlice)
    relevant_files: List[str] = Field(default_factory=list)
    previous_outputs: Dict[str, str] = Field(default_factory=dict)
    user_request: str = ""
    workspace_config: Dict[str, Any] = Field(default_factory=dict)
    template_version: str = "v1"


class PromptMetadata(BaseModel):
    agent: str
    template_version: str
    estimated_tokens: int
    context_sources: List[str]
    build_time_ms: float
    prompt_hash: str


class PromptResult(BaseModel):
    prompt: str
    metadata: PromptMetadata


class ValidationError(BaseModel):
    code: str
    message: str
    severity: str  # "error" | "warning"


class ValidationResult(BaseModel):
    is_valid: bool
    errors: List[ValidationError] = Field(default_factory=list)


def compute_prompt_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def now_ms() -> float:
    return time.perf_counter() * 1000
