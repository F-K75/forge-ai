from __future__ import annotations

from core.ai_usage import MODEL_COSTS, calculate_cost
from optimizer.models import CostEstimate, TokenEstimate

# Assumed monthly request volume used to project a monthly cost from a single
# request's estimate. Callers who have real volume data should scale
# estimated_request_cost_usd themselves; this is a rough planning default.
_DEFAULT_MONTHLY_REQUEST_VOLUME = 10_000


def estimate_request_cost(
    token_estimate: TokenEstimate, *, monthly_request_volume: int = _DEFAULT_MONTHLY_REQUEST_VOLUME
) -> CostEstimate:
    """Estimate cost for one request plus a naive monthly projection, using
    the same provider pricing table (core.ai_usage.MODEL_COSTS) that bills
    actual usage after the call completes -- so pre-call estimates and
    post-call bills never disagree on pricing."""
    request_cost = calculate_cost(
        token_estimate.model,
        token_estimate.input_tokens,
        token_estimate.expected_output_tokens,
    )
    return CostEstimate(
        provider=token_estimate.provider,
        model=token_estimate.model,
        estimated_request_cost_usd=round(request_cost, 6),
        estimated_monthly_cost_usd=round(request_cost * monthly_request_volume, 2),
        input_tokens=token_estimate.input_tokens,
        expected_output_tokens=token_estimate.expected_output_tokens,
    )


def cost_by_provider_and_model() -> dict:
    """Static pricing table exposed for dashboards -- cost per 1K input/output
    tokens by model, grouped by provider."""
    by_provider: dict = {}
    for model, pricing in MODEL_COSTS.items():
        provider = pricing["provider"]
        by_provider.setdefault(provider, {})[model] = {
            "input_per_1k": pricing["input"],
            "output_per_1k": pricing["output"],
        }
    return by_provider
