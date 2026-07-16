"""Data models for loop engineering: feedback signals, improvement actions,
loop iterations, and configuration."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


class FeedbackSignal(str, Enum):
    """Types of feedback signals that can trigger improvement actions."""
    FORMAT_FAILURE = "format_failure"           # Output format is invalid
    PATTERN_MISSING = "pattern_missing"         # Required content missing
    CONSTRAINT_VIOLATION = "constraint_violation"  # Agent violated a constraint
    QUALITY_DEGRADED = "quality_degraded"       # Quality metrics dropped
    TOKEN_INEFFICIENCY = "token_inefficiency"   # Too many tokens for quality
    USER_ESCALATION = "user_escalation"         # User reported an issue
    REGRESSION_DETECTED = "regression_detected"  # Regression from baseline


class ImprovementAction(str, Enum):
    """Actions the loop controller can take to improve quality."""
    OPTIMIZE_PROMPT = "optimize_prompt"         # Run prompt optimizer
    ADJUST_CONTEXT = "adjust_context"           # Tweak context sources/budget
    UPDATE_FEW_SHOT = "update_few_shot"         # Add/change few-shot examples
    ROLLBACK_TEMPLATE = "rollback_template"     # Roll back prompt version
    INCREASE_BUDGET = "increase_budget"         # Increase context token budget
    ADD_CONSTRAINT = "add_constraint"           # Add constraint to template
    COMPOSE_ROLES = "compose_roles"             # Compose multiple role prompts


@dataclass
class LoopConfig:
    """Configuration for the loop engineering controller."""
    max_iterations: int = 5                     # Max improvement cycles
    quality_threshold: float = 0.85            # Target quality score (0-1)
    regression_threshold: float = 0.05         # Max allowed regression
    min_improvement: float = 0.02              # Min improvement to continue
    eval_batch_size: int = 5                   # Test cases per iteration
    max_context_budget: int = 16000            # Max context tokens allowed
    early_stop_on_convergence: bool = True     # Stop if no improvement
    track_versions: bool = True                # Record version history


@dataclass
class LoopIteration:
    """A single iteration in the improvement loop."""
    iteration_number: int
    system_prompt: str = ""                    # The prompt used this iteration
    agent_output: str = ""                     # Raw agent output
    eval_result: Optional[Any] = None          # Harness evaluation result
    quality_score: float = 0.0                # Overall quality metric
    signals: List[FeedbackSignal] = field(default_factory=list)
    action_taken: Optional[ImprovementAction] = None
    action_detail: str = ""
    metrics: Dict[str, float] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))


@dataclass
class LoopResult:
    """Final result of a loop engineering run."""
    role: str
    task: str
    iterations: List[LoopIteration] = field(default_factory=list)
    total_iterations: int = 0
    initial_quality: float = 0.0
    final_quality: float = 0.0
    quality_improvement: float = 0.0
    converged: bool = False
    actions_taken: List[ImprovementAction] = field(default_factory=list)
    best_prompt: str = ""
    summary: str = ""
    ran_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))