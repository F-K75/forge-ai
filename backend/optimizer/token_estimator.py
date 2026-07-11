from __future__ import annotations

from typing import Any, Dict, List

from core.ai_usage import estimate_tokens
from optimizer.models import TokenEstimate

# Fallback ratio when no explicit max_tokens/output hint is given: agent
# builds typically ask for code/JSON output roughly the size of the input
# spec, so half the input length is a conservative floor.
_DEFAULT_OUTPUT_RATIO = 0.5


def estimate_request_tokens(
    messages: List[Dict[str, Any]],
    *,
    provider: str,
    model: str,
    max_output_tokens: int | None = None,
) -> TokenEstimate:
    """Estimate input/output/total tokens for a chat-completion request
    before it is sent to a provider. Provider-agnostic: uses the same
    character-based heuristic as the rest of the pipeline (core.ai_usage) so
    estimates stay consistent with budget enforcement."""
    text = "\n".join(str(m.get("content", "")) for m in messages)
    input_tokens = estimate_tokens(text)

    if max_output_tokens is not None:
        expected_output = max_output_tokens
    else:
        expected_output = max(16, int(input_tokens * _DEFAULT_OUTPUT_RATIO))

    return TokenEstimate(
        input_tokens=input_tokens,
        expected_output_tokens=expected_output,
        total_tokens=input_tokens + expected_output,
        provider=provider,
        model=model,
    )
