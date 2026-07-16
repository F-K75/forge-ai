"""Prompt Engineering: versioning, optimization, few-shot management, and composition.

Extends the core prompt_builder with capabilities for managing prompt evolution,
auto-optimization, dynamic few-shot example selection, and multi-template composition.
"""

from prompt_engineer.models import (
    PromptVersion,
    PromptHistory,
    PromptChangeType,
    FewShotExample,
    FewShotSet,
    PromptOptimizationResult,
    OptimizationConfig,
    CompositionPlan,
)
from prompt_engineer.versioning import VersionManager
from prompt_engineer.optimizer import PromptOptimizer
from prompt_engineer.few_shot import FewShotManager
from prompt_engineer.composer import PromptComposer

__all__ = [
    "PromptVersion",
    "PromptHistory",
    "PromptChangeType",
    "FewShotExample",
    "FewShotSet",
    "PromptOptimizationResult",
    "OptimizationConfig",
    "CompositionPlan",
    "VersionManager",
    "PromptOptimizer",
    "FewShotManager",
    "PromptComposer",
]