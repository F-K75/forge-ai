"""Data models for prompt engineering: version history, few-shot examples,
optimization results, and composition plans."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class PromptChangeType(str, Enum):
    """Types of changes made to a prompt template between versions."""
    SECTION_ADDED = "section_added"
    SECTION_REMOVED = "section_removed"
    SECTION_MODIFIED = "section_modified"
    CONSTRAINT_ADDED = "constraint_added"
    CONSTRAINT_REMOVED = "constraint_removed"
    OUTPUT_FORMAT_CHANGED = "output_format_changed"
    IDENTITY_CHANGED = "identity_changed"
    RESPONSIBILITY_CHANGED = "responsibility_changed"
    GOAL_CHANGED = "goal_changed"
    QUALITY_RULE_CHANGED = "quality_rule_changed"
    REQUIRED_INPUT_CHANGED = "required_input_changed"


@dataclass
class PromptVersion:
    """Represents a single recorded version of a prompt template."""
    role: str
    version: str              # e.g. "v1", "v2", "clarify-v2"
    template_json: str        # Serialized PromptTemplate fields
    change_type: PromptChangeType
    change_reason: str = ""
    author: str = "system"
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    parent_version: Optional[str] = None
    metrics_snapshot: Dict[str, float] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)


@dataclass
class PromptHistory:
    """Full version lineage for one (role, version) key."""
    role: str
    version: str
    versions: List[PromptVersion] = field(default_factory=list)
    active_index: int = 0      # Index into versions representing current active version

    @property
    def current(self) -> Optional[PromptVersion]:
        if not self.versions:
            return None
        return self.versions[self.active_index]

    def add_version(self, v: PromptVersion) -> None:
        self.versions.append(v)
        self.active_index = len(self.versions) - 1

    def rollback(self, target_index: int) -> Optional[PromptVersion]:
        if target_index < 0 or target_index >= len(self.versions):
            return None
        self.active_index = target_index
        return self.versions[target_index]


@dataclass
class FewShotExample:
    """A single few-shot example for a prompt role."""
    example_id: str
    role: str
    input: str                # The input/task portion
    expected_output: str      # The ideal model response
    rationale: str = ""       # Why this example is instructive
    tags: List[str] = field(default_factory=list)
    score: float = 0.0        # Relevance score for dynamic selection
    token_count: int = 0
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


@dataclass
class FewShotSet:
    """A curated collection of few-shot examples for a role."""
    set_id: str
    role: str
    name: str
    examples: List[FewShotExample] = field(default_factory=list)
    max_examples: int = 5
    selection_strategy: str = "fixed"   # "fixed" | "semantic" | "diversity"
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")


@dataclass
class OptimizationConfig:
    """Configuration for prompt optimization runs."""
    max_iterations: int = 3
    target_metric: str = "format_compliance"   # Metric to optimize
    improvement_threshold: float = 0.05        # Min improvement to continue
    eval_sample_size: int = 10                 # Test cases per iteration
    model_for_optimization: str = "gpt-4o-mini"
    preserve_sections: List[str] = field(default_factory=list)  # Sections not to modify


@dataclass
class PromptOptimizationResult:
    """Result of a prompt optimization run."""
    original_template_json: str
    optimized_template_json: str
    iteration_count: int
    metrics_before: Dict[str, float]
    metrics_after: Dict[str, float]
    changes_made: List[str] = field(default_factory=list)
    optimization_log: List[str] = field(default_factory=list)
    success: bool = True


@dataclass
class CompositionPlan:
    """Defines how to compose multiple prompt templates/sources into one."""
    plan_id: str
    roles: List[str]                     # Roles to compose, in order
    composition_strategy: str = "sequential"  # "sequential" | "merge_sections" | "router"
    separator: str = "\n\n---\n\n"
    section_filter: Optional[List[str]] = None  # Only include these sections
    max_tokens: int = 8000