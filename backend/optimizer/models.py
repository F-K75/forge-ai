from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ContextOptimizationResult(BaseModel):
    original_tokens: int
    optimized_tokens: int
    tokens_saved: int
    compression_ratio: float  # optimized/original, 1.0 = no change


class TokenEstimate(BaseModel):
    input_tokens: int
    expected_output_tokens: int
    total_tokens: int
    provider: str
    model: str


class CostEstimate(BaseModel):
    provider: str
    model: str
    estimated_request_cost_usd: float
    estimated_monthly_cost_usd: float
    input_tokens: int
    expected_output_tokens: int


class CacheStatistics(BaseModel):
    prompt_cache_hits: int = 0
    prompt_cache_misses: int = 0
    response_cache_hits: int = 0
    response_cache_misses: int = 0
    semantic_response_cache_hits: int = 0
    saved_latency_ms: float = 0.0
    saved_tokens: int = 0

    @property
    def prompt_cache_hit_ratio(self) -> float:
        total = self.prompt_cache_hits + self.prompt_cache_misses
        return self.prompt_cache_hits / total if total else 0.0

    @property
    def response_cache_hit_ratio(self) -> float:
        total = self.response_cache_hits + self.response_cache_misses
        return self.response_cache_hits / total if total else 0.0


class OptimizationMetrics(BaseModel):
    total_requests: int = 0
    total_tokens_used: int = 0
    total_tokens_saved: int = 0
    average_compression_ratio: float = 1.0
    cache_hit_ratio: float = 0.0
    cost_by_provider: Dict[str, float] = Field(default_factory=dict)
    cost_by_model: Dict[str, float] = Field(default_factory=dict)
    average_latency_ms: float = 0.0
    average_optimization_overhead_ms: float = 0.0
    failure_rate: float = 0.0


class OptimizeResult(BaseModel):
    """Output of optimizeRequest(): the optimized messages/prompt plus every
    metric produced along the way, so callers can log or surface them without
    recomputing anything."""

    messages: List[Dict[str, Any]]
    context_optimization: ContextOptimizationResult
    token_estimate: TokenEstimate
    cost_estimate: CostEstimate
    optimization_time_ms: float
    prompt_cache_hit: bool = False
    response_cache_hit: bool = False
    cached_response: Optional[str] = None
