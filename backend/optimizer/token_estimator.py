from __future__ import annotations

from typing import Any, Dict, List

from core.ai_usage import estimate_tokens
from optimizer.models import TokenEstimate

# Fallback ratio when no explicit max_tokens/output hint is given: agent
# builds typically ask for code/JSON output roughly the size of the input
# spec, so half the input length is a conservative floor.
_DEFAULT_OUTPUT_RATIO = 0.5

# Per-role output ratio overrides: some roles consistently produce shorter
# or longer outputs relative to their input. These ratios are derived from
# observed usage patterns and can be tuned over time.
_ROLE_OUTPUT_RATIOS: Dict[str, float] = {
    "architect": 0.6,        # Architects produce detailed specs
    "developer": 0.7,        # Developers produce code (output often larger than input)
    "qa": 0.4,               # QA produces concise test plans/results
    "security": 0.35,        # Security produces focused findings
    "product_manager": 0.5,  # PMs produce moderate-length requirements
    "business_analyst": 0.5, # Similar to PM
    "designer": 0.4,         # Designers produce concise specs
    "devops": 0.4,           # DevOps produces focused infra specs
    "task_executor": 0.3,    # Executes specific tasks, minimal output
}

# Token overhead per message (role label, metadata, formatting)
_OVERHEAD_PER_MESSAGE = 4  # ~4 tokens per message for {role: "...", content: "..."} structure
_OVERHEAD_PER_TOOL_CALL = 8  # extra overhead for tool_call_id, tool_calls wrapper


def _count_messages(messages: List[Dict[str, Any]]) -> int:
    """Count the total number of messages in the list."""
    return len(messages)


def _count_tool_calls(messages: List[Dict[str, Any]]) -> int:
    """Count the number of tool call/result messages."""
    return sum(
        1 for m in messages
        if m.get("role") in ("tool", "assistant") and ("tool_call_id" in m or "tool_calls" in m)
    )


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
    estimates stay consistent with budget enforcement.

    Accounts for per-message structural overhead (role labels, formatting)
    and per-role output ratios for more accurate output token estimation."""
    text = "\n".join(str(m.get("content", "")) for m in messages)
    content_tokens = estimate_tokens(text)

    # Add structural overhead for message formatting
    num_messages = _count_messages(messages)
    num_tool_calls = _count_tool_calls(messages)
    overhead_tokens = (
        num_messages * _OVERHEAD_PER_MESSAGE
        + num_tool_calls * _OVERHEAD_PER_TOOL_CALL
    )

    input_tokens = content_tokens + overhead_tokens

    if max_output_tokens is not None:
        expected_output = max_output_tokens
    else:
        # Try to determine the role from the messages to use role-specific ratio
        role = _detect_role(messages)
        ratio = _ROLE_OUTPUT_RATIOS.get(role or "", _DEFAULT_OUTPUT_RATIO)
        expected_output = max(16, int(input_tokens * ratio))

    return TokenEstimate(
        input_tokens=input_tokens,
        expected_output_tokens=expected_output,
        total_tokens=input_tokens + expected_output,
        provider=provider,
        model=model,
    )


def _detect_role(messages: List[Dict[str, Any]]) -> str | None:
    """Try to detect the agent role from system messages. System prompts
    typically mention the role in the identity section, e.g. 'You are an
    architect' or '# Identity\nDeveloper'."""
    for message in messages:
        if message.get("role") == "system":
            content = str(message.get("content", ""))
            # Look for role indicators in system messages
            for role_name in _ROLE_OUTPUT_RATIOS:
                if role_name in content.lower():
                    return role_name
    return None