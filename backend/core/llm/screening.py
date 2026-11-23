"""One bounded LLM screening call (docs/architecture/agent-collaboration-
plan.md §4.2, §4.6). Shared by the output L-tier (gateway/guardrails.py)
and the input injection classifier (core/llm/router.py) under guardrail v2.

Order of checks, each failing closed into a ``ScreenResult`` the caller maps
to ``unverified`` (required) or ``skipped``/``not_permitted`` (optional):

1. processing boundary (BYOK content needs ``platform_model_processing``);
2. an explicitly priced model (``MODEL_COSTS``), never a guessed price;
3. input capped at ``guardrail_llm_max_input_tokens``;
4. an atomic ``platform_budgets`` reservation (monthly and per build);
5. exactly one provider call, with a timeout -- no retry, no fallback;
6. one ``ai_usage`` row (account ``guardrail``) and budget settlement.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Optional

from core.ai_usage import calculate_cost, estimate_tokens, is_priced_model
from core.llm.accounting import AttemptAccounting
from core.processing_boundary import check_platform_model_allowed

logger = logging.getLogger(__name__)


@dataclass
class ScreenResult:
    completed: bool
    reason: str
    answer: Optional[str] = None
    truncated: bool = False
    model: Optional[str] = None
    provider: Optional[str] = None
    calls: int = 0


def cap_text_to_tokens(text: str, max_tokens: int) -> tuple[str, bool]:
    """Longest prefix of ``text`` whose token estimate fits ``max_tokens``.
    Returns (text, truncated)."""
    if max_tokens <= 0:
        return "", bool(text)
    if estimate_tokens(text) <= max_tokens:
        return text, False
    lo, hi = 0, len(text)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if estimate_tokens(text[:mid]) <= max_tokens:
            lo = mid
        else:
            hi = mid - 1
    return text[:lo], True


async def _budget_db():
    from core.database import get_db

    return await get_db()


async def run_bounded_screen(
    *,
    router: Any,
    accounting: AttemptAccounting,
    provider_name: Optional[str],
    model: Optional[str],
    system_prompt: str,
    text: str,
    max_input_tokens: int,
    max_output_tokens: int,
    timeout_seconds: float,
    build_id: Optional[str] = None,
    budget_db: Optional[Callable[[], Any]] = None,
) -> ScreenResult:
    from core import platform_budgets
    from core.config import get_settings

    settings = get_settings()

    decision = check_platform_model_allowed(accounting.boundary, accounting.purpose)
    if not decision.allowed:
        return ScreenResult(completed=False, reason="not_permitted")
    if not model or not is_priced_model(model):
        return ScreenResult(completed=False, reason="unpriced_model", model=model)
    provider = router.registry.get_provider(provider_name) if provider_name else None
    if provider is None:
        return ScreenResult(completed=False, reason="provider_unavailable", model=model, provider=provider_name)

    overhead = estimate_tokens(system_prompt) + 8
    screened, truncated = cap_text_to_tokens(text, max(0, max_input_tokens - overhead))
    if not screened.strip():
        return ScreenResult(completed=False, reason="empty_input", truncated=truncated)
    est_input = min(max_input_tokens, int(estimate_tokens(screened) * 1.5) + overhead + 64)
    estimate = calculate_cost(model, est_input, max_output_tokens)

    try:
        db = await (budget_db or _budget_db)()
        reservation = await platform_budgets.reserve(
            db,
            account=platform_budgets.ACCOUNT_GUARDRAIL,
            amount_usd=estimate,
            monthly_limit_usd=settings.guardrail_monthly_usd,
            per_build_limit_usd=settings.guardrail_per_build_usd,
            build_id=build_id or accounting.build_id,
        )
    except Exception:
        logger.warning("guardrail budget reservation failed; treating as exhausted", exc_info=True)
        return ScreenResult(completed=False, reason="budget_error", truncated=truncated, model=model)
    if not reservation.ok:
        return ScreenResult(completed=False, reason=reservation.reason, truncated=truncated, model=model)

    messages: List[Dict[str, Any]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": screened},
    ]
    started = time.perf_counter()
    actual_cost = 0.0
    try:
        try:
            response = await asyncio.wait_for(
                provider.chat_completion(model=model, messages=messages, max_tokens=max_output_tokens),
                timeout=timeout_seconds,
            )
        except asyncio.TimeoutError:
            await accounting.record(
                outcome="error", credential="forge", provider=provider_name, model=model,
                error_class="timeout", latency_ms=(time.perf_counter() - started) * 1000,
            )
            return ScreenResult(completed=False, reason="timeout", truncated=truncated, model=model,
                                provider=provider_name, calls=1)
        except Exception as exc:
            await accounting.record(
                outcome="error", credential="forge", provider=provider_name, model=model,
                error_class=exc, latency_ms=(time.perf_counter() - started) * 1000,
            )
            return ScreenResult(completed=False, reason="error", truncated=truncated, model=model,
                                provider=provider_name, calls=1)
        usage = getattr(response, "usage", None) or {}
        prompt_tokens = int(usage.get("prompt_tokens", 0) or 0) or estimate_tokens(screened) + overhead
        completion_tokens = int(usage.get("completion_tokens", 0) or 0)
        actual_cost = calculate_cost(model, prompt_tokens, completion_tokens)
        await accounting.record(
            outcome="success", credential="forge", provider=provider_name, model=model,
            prompt_tokens=prompt_tokens, completion_tokens=completion_tokens,
            latency_ms=(time.perf_counter() - started) * 1000,
        )
        return ScreenResult(
            completed=True, reason="completed", answer=(response.text or "").strip(),
            truncated=truncated, model=model, provider=provider_name, calls=1,
        )
    finally:
        try:
            await platform_budgets.settle(db, reservation, actual_usd=actual_cost)
        except Exception:
            logger.exception("guardrail budget settlement failed")
