"""LLM provider abstraction.

A single entrypoint ``llm_complete(model, system, messages) -> str`` branches
on the model-name prefix. The Anthropic branch is fully implemented; OpenAI
and DeepSeek are stubbed with a clear ``NotImplementedError`` so a different
provider can be dropped in later purely via agent config (the model name),
with no orchestrator changes.

``llm_complete_with_usage`` is the richer variant the runner uses so it can
track tokens + cost; ``llm_complete`` is the thin string-returning wrapper
mandated by the contract.
"""
from __future__ import annotations

from dataclasses import dataclass

import anthropic

from .config import get_settings
from .models import TokenUsage

# Approximate USD per 1M tokens (input, output). Matched by substring on the
# model name; tweak freely — cost is an estimate, not billing truth.
_PRICING: list[tuple[str, float, float]] = [
    ("haiku", 0.80, 4.00),
    ("sonnet", 3.00, 15.00),
    ("opus", 15.00, 75.00),
]
_DEFAULT_PRICING = (3.00, 15.00)


def estimate_cost(model: str, usage: TokenUsage) -> float:
    m = model.lower()
    in_price, out_price = _DEFAULT_PRICING
    for needle, ip, op in _PRICING:
        if needle in m:
            in_price, out_price = ip, op
            break
    return (
        usage.input_tokens / 1_000_000 * in_price
        + usage.output_tokens / 1_000_000 * out_price
    )


@dataclass
class LLMResult:
    text: str
    usage: TokenUsage
    model: str


# --------------------------------------------------------------------------- #
# Provider routing
# --------------------------------------------------------------------------- #
class ProviderError(Exception):
    """Wraps a non-transient provider failure."""


# Exception types the runner should retry on (transient / rate-limited).
TRANSIENT_ERRORS: tuple[type[Exception], ...] = (
    anthropic.RateLimitError,
    anthropic.APITimeoutError,
    anthropic.APIConnectionError,
    anthropic.InternalServerError,
)


_anthropic_client: anthropic.AsyncAnthropic | None = None


def _get_anthropic() -> anthropic.AsyncAnthropic:
    global _anthropic_client
    if _anthropic_client is None:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise ProviderError("ANTHROPIC_API_KEY is not set")
        _anthropic_client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=settings.request_timeout,
        )
    return _anthropic_client


async def _anthropic_complete(
    model: str, system: str, messages: list[dict], max_tokens: int
) -> LLMResult:
    client = _get_anthropic()
    resp = await client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
    )
    text = "".join(
        block.text for block in resp.content if getattr(block, "type", "") == "text"
    )
    usage = TokenUsage(
        input_tokens=resp.usage.input_tokens,
        output_tokens=resp.usage.output_tokens,
    )
    return LLMResult(text=text, usage=usage, model=model)


async def _openai_complete(*_args, **_kwargs) -> LLMResult:
    raise NotImplementedError(
        "OpenAI provider is not implemented. Add the branch in providers.py "
        "and set OPENAI_API_KEY to enable models prefixed 'gpt'/'o1'/'o3'."
    )


async def _deepseek_complete(*_args, **_kwargs) -> LLMResult:
    raise NotImplementedError(
        "DeepSeek provider is not implemented. Add the branch in providers.py "
        "and set DEEPSEEK_API_KEY to enable 'deepseek-*' models."
    )


def _route(model: str):
    m = model.lower()
    if m.startswith("claude") or m.startswith("anthropic"):
        return _anthropic_complete
    if m.startswith(("gpt", "o1", "o3", "openai")):
        return _openai_complete
    if m.startswith("deepseek"):
        return _deepseek_complete
    raise ProviderError(f"No provider registered for model '{model}'")


async def llm_complete_with_usage(
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int | None = None,
) -> LLMResult:
    settings = get_settings()
    handler = _route(model)
    return await handler(
        model, system, messages, max_tokens or settings.agent_max_output_tokens
    )


async def llm_complete(
    model: str,
    system: str,
    messages: list[dict],
    max_tokens: int | None = None,
) -> str:
    """Contract entrypoint: returns the model's text completion."""
    result = await llm_complete_with_usage(model, system, messages, max_tokens)
    return result.text
