from __future__ import annotations

from enum import Enum
from typing import List

from core.ai_usage import DEFAULT_MODEL, MODEL_COSTS
from core.metrics import llm_routing_decisions_total


class TaskComplexity(str, Enum):
    """Coarse task-difficulty buckets a caller can hint at request time.
    Examples from the spec this mirrors: simple formatting -> SIMPLE,
    bug fixing -> MODERATE, architecture -> COMPLEX, final validation ->
    CRITICAL."""

    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"
    CRITICAL = "critical"


# Fraction into a cost-sorted candidate list each complexity tier should
# reach for. SIMPLE picks the cheapest candidate, CRITICAL the most capable
# (== most expensive, on the assumption that price roughly tracks
# capability in `MODEL_COSTS`); MODERATE/COMPLEX interpolate.
_TIER_FRACTION = {
    TaskComplexity.SIMPLE: 0.0,
    TaskComplexity.MODERATE: 1 / 3,
    TaskComplexity.COMPLEX: 2 / 3,
    TaskComplexity.CRITICAL: 1.0,
}


def _cost_key(model: str) -> float:
    costs = MODEL_COSTS.get(model, MODEL_COSTS[DEFAULT_MODEL])
    return costs["input"] + costs["output"]


class ModelRouter:
    """Picks the model tier appropriate for a task's complexity from an
    already-approved/configured set of candidates (a caller's model fallback
    chain). Does not introduce new models -- it only reorders/selects among
    ones the org/agent config already permits, so it composes cleanly with
    `PolicyEngine.enforce` (approved_models) and `BudgetManager.enforce`
    (soft-limit downgrade), which run after this in `LLMRouter.generate`.

    Ranking is derived from `core.ai_usage.MODEL_COSTS` (the same pricing
    table used for cost estimation/tracking) rather than a separate
    hardcoded tier map, so the two can never drift apart.
    """

    def select(self, complexity: TaskComplexity, candidates: List[str]) -> str:
        if not candidates:
            return DEFAULT_MODEL
        ranked = sorted(candidates, key=_cost_key)
        fraction = _TIER_FRACTION[complexity]
        index = round(fraction * (len(ranked) - 1))
        return ranked[index]

    def reorder(self, model_chain: List[str], complexity: TaskComplexity) -> List[str]:
        """Move the tier-appropriate model to the front of `model_chain`,
        preserving the rest as the fallback order if it's unavailable."""
        if len(model_chain) <= 1:
            return model_chain
        chosen = self.select(complexity, model_chain)
        llm_routing_decisions_total.labels(complexity=complexity.value, model=chosen).inc()
        return [chosen, *[m for m in model_chain if m != chosen]]


_model_router: "ModelRouter | None" = None


def get_model_router() -> ModelRouter:
    global _model_router
    if _model_router is None:
        _model_router = ModelRouter()
    return _model_router
