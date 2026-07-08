"""Shared Prometheus metrics for Forge AI.

All metrics are registered on a single custom ``CollectorRegistry`` so the
``/metrics`` endpoint can serve them from one place. If ``prometheus_client``
is not installed the module degrades gracefully and every metric object is a
no-op stub.
"""

try:
    from prometheus_client import Counter, Histogram, CollectorRegistry

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
except ImportError:
    registry = None

    class _NoOpMetric:
        def labels(self, *args, **kwargs):
            return self
        def inc(self, *args, **kwargs):
            pass
        def observe(self, *args, **kwargs):
            pass

    build_outcomes_total = _NoOpMetric()  # type: ignore[assignment]
    build_duration_seconds = _NoOpMetric()  # type: ignore[assignment]
    build_credits_used = _NoOpMetric()  # type: ignore[assignment]
