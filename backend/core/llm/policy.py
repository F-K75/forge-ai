from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from core.llm.provider import ProviderError


class PolicyViolation(ProviderError):
    """Raised when a request violates an approved-provider/model, token, or
    cost policy. A `ProviderError` subtype so the existing retry/circuit-
    breaker exception handling in `LLMRouter`/`BaseAgent` needs no changes."""


class PolicyEngine:
    """Enforces approved providers/models and per-request token/cost caps
    before a request reaches any provider. Composed into `LLMRouter` the
    same way `AIOptimizer` is -- policy needs the *resolved* provider/model
    chain and a real cost estimate, both of which only exist inside
    `LLMRouter.generate()`/`stream()`, not at the `AIGateway` layer."""

    def enforce(
        self,
        *,
        policy_config: Dict[str, Any],
        providers_to_try: List[str],
        model_chain: List[str],
        max_tokens: int,
        cost_estimate_usd: float,
    ) -> Tuple[List[str], List[str]]:
        approved_providers = policy_config.get("approved_providers")
        if approved_providers:
            filtered = [p for p in providers_to_try if p in approved_providers]
            if not filtered:
                raise PolicyViolation(
                    f"No approved provider available (tried {providers_to_try}, "
                    f"approved: {approved_providers})"
                )
            providers_to_try = filtered

        approved_models = policy_config.get("approved_models")
        if approved_models:
            filtered_models = [m for m in model_chain if m in approved_models]
            if not filtered_models:
                raise PolicyViolation(
                    f"No approved model available (tried {model_chain}, "
                    f"approved: {approved_models})"
                )
            model_chain = filtered_models

        max_tokens_per_request = policy_config.get("max_tokens_per_request")
        if max_tokens_per_request and max_tokens > max_tokens_per_request:
            raise PolicyViolation(
                f"Requested max_tokens {max_tokens} exceeds policy limit {max_tokens_per_request}"
            )

        max_cost_per_request_usd = policy_config.get("max_cost_per_request_usd")
        if max_cost_per_request_usd and cost_estimate_usd > max_cost_per_request_usd:
            raise PolicyViolation(
                f"Estimated cost ${cost_estimate_usd:.4f} exceeds policy limit "
                f"${max_cost_per_request_usd:.4f}"
            )

        return providers_to_try, model_chain


_policy_engine: Optional[PolicyEngine] = None


def get_policy_engine() -> PolicyEngine:
    global _policy_engine
    if _policy_engine is None:
        _policy_engine = PolicyEngine()
    return _policy_engine
