"""Shared Prometheus metrics for Forge AI.

All metrics are registered on a single custom ``CollectorRegistry`` so the
``/metrics`` endpoint can serve them from one place. If ``prometheus_client``
is not installed the module degrades gracefully and every metric object is a
no-op stub.
"""

try:
    from prometheus_client import Counter, Histogram, Gauge, CollectorRegistry

    registry = CollectorRegistry()

    build_outcomes_total = Counter(
        "build_outcomes_total",
        "Total builds completed, by outcome",
        ["status"],
        registry=registry,
    )

    build_duration_seconds = Histogram(
        "build_duration_seconds",
        "Build pipeline duration in seconds",
        buckets=[10, 30, 60, 120, 300, 600],
        registry=registry,
    )

    build_credits_used = Histogram(
        "build_credits_used",
        "Credits consumed per completed build",
        buckets=[0, 5, 10, 20, 50, 100],
        registry=registry,
    )

    # AI Gateway metrics -- recorded in gateway/service.py's AIGateway.generate(),
    # the single choke point every LLM request passes through.
    llm_requests_total = Counter(
        "llm_requests_total",
        "Total LLM requests through the AI Gateway, by outcome",
        ["provider", "model", "agent", "status"],  # status: success/error/guardrail_blocked
        registry=registry,
    )

    llm_request_duration_seconds = Histogram(
        "llm_request_duration_seconds",
        "AI Gateway request latency in seconds",
        ["provider", "model"],
        buckets=[0.1, 0.5, 1, 2, 5, 10, 30],
        registry=registry,
    )

    llm_retry_attempts_total = Counter(
        "llm_retry_attempts_total",
        "Total provider call attempts (including retries) per agent",
        ["agent"],
        registry=registry,
    )

    llm_failovers_total = Counter(
        "llm_failovers_total",
        "Total provider/model failovers per agent",
        ["agent"],
        registry=registry,
    )

    llm_guardrail_blocked_total = Counter(
        "llm_guardrail_blocked_total",
        "Total responses blocked by content-safety guardrails, by category",
        ["category"],
        registry=registry,
    )

    # Gauges refreshed at scrape time from AIOptimizer's already-collected
    # analytics (optimizer/analytics.py) -- see update_optimizer_gauges().
    llm_cache_hit_ratio = Gauge(
        "llm_cache_hit_ratio", "AI Optimizer response-cache hit ratio", registry=registry,
    )
    llm_optimization_ratio = Gauge(
        "llm_optimization_ratio", "AI Optimizer average context compression ratio", registry=registry,
    )
    llm_tokens_saved_total = Gauge(
        "llm_tokens_saved_total", "Total tokens saved by the AI Optimizer", registry=registry,
    )
    llm_cost_by_provider_usd = Gauge(
        "llm_cost_by_provider_usd", "Total LLM cost in USD, by provider", ["provider"], registry=registry,
    )
    llm_semantic_cache_hit_ratio = Gauge(
        "llm_semantic_cache_hit_ratio",
        "Share of response-cache hits served by semantic (near-duplicate) matching rather than exact match",
        registry=registry,
    )

    # Budget Manager metrics -- recorded in core/llm/budget_manager.py's
    # BudgetManager.enforce(), called from LLMRouter.generate()/stream().
    llm_budget_downgrades_total = Counter(
        "llm_budget_downgrades_total",
        "Total requests downgraded to a cheaper model after crossing a soft spend limit",
        ["scope"],
        registry=registry,
    )
    llm_budget_rejections_total = Counter(
        "llm_budget_rejections_total",
        "Total requests rejected for exceeding a hard spend limit",
        ["scope"],
        registry=registry,
    )

    # Smart Model Router metrics -- recorded in core/llm/router.py wherever
    # ModelRouter.reorder() is applied.
    llm_routing_decisions_total = Counter(
        "llm_routing_decisions_total",
        "Total complexity-based model routing decisions, by requested complexity and selected model",
        ["complexity", "model"],
        registry=registry,
    )
except ImportError:
    registry = None

    class _NoOpMetric:
        def labels(self, *args, **kwargs):
            return self
        def inc(self, *args, **kwargs):
            pass
        def observe(self, *args, **kwargs):
            pass
        def set(self, *args, **kwargs):
            pass

    build_outcomes_total = _NoOpMetric()  # type: ignore[assignment]
    build_duration_seconds = _NoOpMetric()  # type: ignore[assignment]
    build_credits_used = _NoOpMetric()  # type: ignore[assignment]
    llm_requests_total = _NoOpMetric()  # type: ignore[assignment]
    llm_request_duration_seconds = _NoOpMetric()  # type: ignore[assignment]
    llm_retry_attempts_total = _NoOpMetric()  # type: ignore[assignment]
    llm_failovers_total = _NoOpMetric()  # type: ignore[assignment]
    llm_guardrail_blocked_total = _NoOpMetric()  # type: ignore[assignment]
    llm_cache_hit_ratio = _NoOpMetric()  # type: ignore[assignment]
    llm_optimization_ratio = _NoOpMetric()  # type: ignore[assignment]
    llm_tokens_saved_total = _NoOpMetric()  # type: ignore[assignment]
    llm_cost_by_provider_usd = _NoOpMetric()  # type: ignore[assignment]
    llm_semantic_cache_hit_ratio = _NoOpMetric()  # type: ignore[assignment]
    llm_budget_downgrades_total = _NoOpMetric()  # type: ignore[assignment]
    llm_budget_rejections_total = _NoOpMetric()  # type: ignore[assignment]
    llm_routing_decisions_total = _NoOpMetric()  # type: ignore[assignment]


def update_optimizer_gauges() -> None:
    """Refresh the AI Optimizer-derived gauges from its already-collected
    analytics. Called on every /metrics scrape (main.py) so these reflect
    current totals rather than whatever they were last set to."""
    if registry is None:
        return
    from optimizer.service import get_optimizer

    optimizer = get_optimizer()
    metrics_snapshot = optimizer.get_optimization_metrics()
    cache_stats = optimizer.get_cache_statistics()

    llm_cache_hit_ratio.set(cache_stats.response_cache_hit_ratio)
    if cache_stats.response_cache_hits:
        llm_semantic_cache_hit_ratio.set(cache_stats.semantic_response_cache_hits / cache_stats.response_cache_hits)
    llm_optimization_ratio.set(metrics_snapshot.average_compression_ratio)
    llm_tokens_saved_total.set(metrics_snapshot.total_tokens_saved)
    for provider, cost in metrics_snapshot.cost_by_provider.items():
        llm_cost_by_provider_usd.labels(provider=provider).set(cost)
