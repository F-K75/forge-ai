from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from optimizer.analytics import OptimizerAnalytics, get_analytics
from optimizer.config import OptimizerConfig, get_optimizer_config
from optimizer.context_optimizer import optimize_context
from optimizer.cost_estimator import cost_by_provider_and_model, estimate_request_cost
from optimizer.models import CacheStatistics, OptimizationMetrics, OptimizeResult
from optimizer.prompt_cache import PromptCache
from optimizer.prompt_optimizer import optimize_prompt
from optimizer.response_cache import ResponseCache
from optimizer.token_estimator import estimate_request_tokens

logger = logging.getLogger(__name__)


class AIOptimizer:
    """Mandatory middleware between the Prompt Builder and every LLM
    provider. Optimizes context/prompt, estimates tokens and cost, and
    exposes prompt/response caching -- transparent to callers: it never
    changes agent behavior or reasoning, only the request payload sent to
    the provider and whether a provider call happens at all (cache hit).

    Designed to be composed, not extended by inheritance: future
    capabilities (semantic retrieval, model routing, budget enforcement,
    provider failover, guardrails) should be new modules that call into or
    wrap this service, not subclasses of it.
    """

    def __init__(
        self,
        *,
        config: Optional[OptimizerConfig] = None,
        analytics: Optional[OptimizerAnalytics] = None,
        prompt_cache: Optional[PromptCache] = None,
        response_cache: Optional[ResponseCache] = None,
    ) -> None:
        self.config = config or get_optimizer_config()
        self.analytics = analytics or get_analytics()
        self.prompt_cache = prompt_cache or PromptCache(ttl_seconds=self.config.prompt_cache_ttl_seconds)
        self.response_cache = response_cache or ResponseCache(ttl_seconds=self.config.response_cache_ttl_seconds)

    async def optimize_request(
        self,
        *,
        messages: List[Dict[str, Any]],
        provider: str,
        model: str,
        max_output_tokens: Optional[int] = None,
        streaming: bool = False,
        has_tools: bool = False,
        temperature: float = 0.0,
        cacheable: bool = True,
    ) -> OptimizeResult:
        """Run the full optimization pipeline for one request: dedupe/trim
        context, normalize prompt text, estimate tokens/cost, and check the
        response cache. Does not itself call the provider -- callers use
        `cached_response`/`response_cache_hit` to decide whether to skip the
        provider call, and `cache_response()` afterward to populate it."""
        start = time.perf_counter()

        if not self.config.enabled:
            token_estimate = estimate_request_tokens(
                messages, provider=provider, model=model, max_output_tokens=max_output_tokens
            )
            cost_estimate = estimate_request_cost(token_estimate)
            from optimizer.models import ContextOptimizationResult

            no_op = ContextOptimizationResult(
                original_tokens=token_estimate.input_tokens,
                optimized_tokens=token_estimate.input_tokens,
                tokens_saved=0,
                compression_ratio=1.0,
            )
            return OptimizeResult(
                messages=messages,
                context_optimization=no_op,
                token_estimate=token_estimate,
                cost_estimate=cost_estimate,
                optimization_time_ms=0.0,
            )

        optimized_messages, context_result = optimize_context(messages, max_chars=self.config.max_prompt_chars)

        if self.config.compression_level > 0:
            for message in optimized_messages:
                content = message.get("content")
                if isinstance(content, str):
                    message["content"] = optimize_prompt(content, compression_level=self.config.compression_level)

        response_cache_hit = False
        cached_response = None
        is_cacheable = self.config.response_cache_enabled and ResponseCache.is_cacheable(
            streaming=streaming, has_tools=has_tools, temperature=temperature, cacheable=cacheable
        )
        if is_cacheable:
            cached = await self.response_cache.get(optimized_messages, model, provider)
            if cached is not None:
                response_cache_hit = True
                cached_response = cached.get("text")
        else:
            # Keep miss-side statistics meaningful without touching Redis for
            # requests that could never be served from cache.
            self.response_cache.misses += 1

        token_estimate = estimate_request_tokens(
            optimized_messages, provider=provider, model=model, max_output_tokens=max_output_tokens
        )
        cost_estimate = estimate_request_cost(token_estimate)

        elapsed_ms = (time.perf_counter() - start) * 1000

        logger.info(
            "ai_optimizer: provider=%s model=%s tokens_saved=%d compression=%.3f "
            "response_cache_hit=%s overhead_ms=%.2f",
            provider, model, context_result.tokens_saved, context_result.compression_ratio,
            response_cache_hit, elapsed_ms,
        )

        return OptimizeResult(
            messages=optimized_messages,
            context_optimization=context_result,
            token_estimate=token_estimate,
            cost_estimate=cost_estimate,
            optimization_time_ms=round(elapsed_ms, 3),
            response_cache_hit=response_cache_hit,
            cached_response=cached_response,
        )

    async def cache_response(
        self,
        *,
        messages: List[Dict[str, Any]],
        model: str,
        provider: str,
        response_text: str,
        streaming: bool = False,
        has_tools: bool = False,
        temperature: float = 0.0,
        cacheable: bool = True,
    ) -> bool:
        """Store a completed response for future exact-match reuse. Returns
        False (no-op) for anything the cache policy excludes, so callers can
        call this unconditionally after every completion."""
        if not self.config.response_cache_enabled:
            return False
        if not ResponseCache.is_cacheable(
            streaming=streaming, has_tools=has_tools, temperature=temperature, cacheable=cacheable
        ):
            return False
        await self.response_cache.set(messages, model, provider, {"text": response_text})
        return True

    async def cache_prompt(self, *, messages: List[Dict[str, Any]], model: str, optimized: Dict[str, Any]) -> None:
        await self.prompt_cache.set(messages, model, optimized)

    def estimate_tokens(
        self, messages: List[Dict[str, Any]], *, provider: str, model: str, max_output_tokens: Optional[int] = None
    ):
        return estimate_request_tokens(messages, provider=provider, model=model, max_output_tokens=max_output_tokens)

    def estimate_cost(self, token_estimate) -> Any:
        return estimate_request_cost(token_estimate)

    def record_completion(
        self,
        *,
        tokens_used: int,
        tokens_saved: int,
        compression_ratio: float,
        provider: str,
        model: str,
        cost_usd: float,
        latency_ms: float,
        optimization_overhead_ms: float,
        prompt_cache_hit: bool,
        response_cache_hit: bool,
        failed: bool = False,
    ) -> None:
        self.analytics.record_request(
            tokens_used=tokens_used,
            tokens_saved=tokens_saved,
            compression_ratio=compression_ratio,
            provider=provider,
            model=model,
            cost_usd=cost_usd,
            latency_ms=latency_ms,
            optimization_overhead_ms=optimization_overhead_ms,
            prompt_cache_hit=prompt_cache_hit,
            response_cache_hit=response_cache_hit,
            failed=failed,
        )

    def get_optimization_metrics(self) -> OptimizationMetrics:
        return self.analytics.snapshot()

    def get_cache_statistics(self) -> CacheStatistics:
        prompt_stats = self.prompt_cache.stats()
        response_stats = self.response_cache.stats()
        return CacheStatistics(
            prompt_cache_hits=prompt_stats["hits"],
            prompt_cache_misses=prompt_stats["misses"],
            response_cache_hits=response_stats["hits"],
            response_cache_misses=response_stats["misses"],
        )

    def get_pricing_table(self) -> Dict[str, Any]:
        return cost_by_provider_and_model()


_optimizer: Optional[AIOptimizer] = None


def get_optimizer() -> AIOptimizer:
    global _optimizer
    if _optimizer is None:
        _optimizer = AIOptimizer()
    return _optimizer
