"""Exceptions raised by the guardrail tiers (docs/architecture/agent-
collaboration-plan.md §4.3, §4.5). Neither is transient in the sense of the
retry classes (§8.4): retrying the same content cannot change a block, and a
required screen that cannot run must be resolved (budget, consent, provider)
before the operation is attempted again."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


class GuardrailBlocked(Exception):
    """A guardrail blocked an artifact after part of it was already streamed
    as a preview. The operation fails (``blocked_by_guardrail``), the version
    is withheld and must not be published (GR-6)."""

    retryable = False
    error_class = "blocked_by_guardrail"

    def __init__(self, categories: Optional[List[str]] = None, outcome: Optional[Dict[str, Any]] = None):
        self.categories = list(categories or [])
        self.outcome = outcome or {}
        super().__init__(
            "Artifact withheld by content safety guardrails"
            + (f" ({', '.join(self.categories)})" if self.categories else "")
        )


class GuardrailUnavailable(Exception):
    """A *required* LLM screen could not complete (not permitted, budget
    exhausted, provider error, timeout, unparseable verdict). Fail closed:
    the content is never treated as having passed (F29)."""

    retryable = False
    error_class = "guardrail_unverified"

    def __init__(self, tier: str, reason: str):
        self.tier = tier
        self.reason = reason
        super().__init__(f"Required {tier} guardrail screen could not complete: {reason}")
