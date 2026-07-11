from __future__ import annotations

import threading
from typing import Dict

from optimizer.models import OptimizationMetrics


class OptimizerAnalytics:
    """In-process aggregate counters for the AI Optimizer. Thread/async-safe
    via a simple lock (values are cheap ints/floats, not I/O). Not persisted
    across restarts by design -- durable per-request records already live in
    `ai_usage` (see core/ai_usage.py); this module is for the live dashboard
    view of optimizer-specific effectiveness (compression, cache hits,
    overhead), which is inherently a rolling/process-lifetime metric."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.total_requests = 0
        self.failed_requests = 0
        self.total_tokens_used = 0
        self.total_tokens_saved = 0
        self._compression_ratio_sum = 0.0
        self.prompt_cache_hits = 0
        self.prompt_cache_misses = 0
        self.response_cache_hits = 0
        self.response_cache_misses = 0
        self.cost_by_provider: Dict[str, float] = {}
        self.cost_by_model: Dict[str, float] = {}
        self._latency_sum_ms = 0.0
        self._overhead_sum_ms = 0.0

    def record_request(
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
        with self._lock:
            self.total_requests += 1
            if failed:
                self.failed_requests += 1
            self.total_tokens_used += tokens_used
            self.total_tokens_saved += tokens_saved
            self._compression_ratio_sum += compression_ratio
            self.cost_by_provider[provider] = self.cost_by_provider.get(provider, 0.0) + cost_usd
            self.cost_by_model[model] = self.cost_by_model.get(model, 0.0) + cost_usd
            self._latency_sum_ms += latency_ms
            self._overhead_sum_ms += optimization_overhead_ms
            if prompt_cache_hit:
                self.prompt_cache_hits += 1
            else:
                self.prompt_cache_misses += 1
            if response_cache_hit:
                self.response_cache_hits += 1
            else:
                self.response_cache_misses += 1

    def snapshot(self) -> OptimizationMetrics:
        with self._lock:
            n = self.total_requests or 1
            cache_total = self.response_cache_hits + self.response_cache_misses
            return OptimizationMetrics(
                total_requests=self.total_requests,
                total_tokens_used=self.total_tokens_used,
                total_tokens_saved=self.total_tokens_saved,
                average_compression_ratio=round(self._compression_ratio_sum / n, 4),
                cache_hit_ratio=round(self.response_cache_hits / cache_total, 4) if cache_total else 0.0,
                cost_by_provider={k: round(v, 6) for k, v in self.cost_by_provider.items()},
                cost_by_model={k: round(v, 6) for k, v in self.cost_by_model.items()},
                average_latency_ms=round(self._latency_sum_ms / n, 3),
                average_optimization_overhead_ms=round(self._overhead_sum_ms / n, 3),
                failure_rate=round(self.failed_requests / n, 4),
            )


_analytics = OptimizerAnalytics()


def get_analytics() -> OptimizerAnalytics:
    return _analytics
