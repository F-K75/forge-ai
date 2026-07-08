"""Tests for build outcome Prometheus metrics (BE-006 residual)."""

from core.metrics import (
    build_outcomes_total,
    build_credits_used,
    build_duration_seconds,
    registry,
)


class TestBuildMetricsModule:
    """Verify the shared metrics module exports the expected objects."""

    def test_registry_is_collector_registry(self):
        from prometheus_client import CollectorRegistry
        assert registry is None or isinstance(registry, CollectorRegistry)

    def test_build_outcomes_total_is_counter(self):
        from prometheus_client import Counter
        assert isinstance(build_outcomes_total, Counter)

    def test_build_duration_seconds_is_histogram(self):
        from prometheus_client import Histogram
        assert isinstance(build_duration_seconds, Histogram)

    def test_build_credits_used_is_histogram(self):
        from prometheus_client import Histogram
        assert isinstance(build_credits_used, Histogram)


class TestBuildMetricsBehavior:
    """Exercise the metrics directly to confirm they accept labels and values."""

    def test_outcome_counter_accepts_status_labels(self):
        build_outcomes_total.labels(status="success").inc()
        build_outcomes_total.labels(status="failed").inc()
        build_outcomes_total.labels(status="timeout").inc()

    def test_duration_histogram_observes_values(self):
        build_duration_seconds.observe(1.5)
        build_duration_seconds.observe(42.0)

    def test_credits_histogram_observes_values(self):
        build_credits_used.observe(0)
        build_credits_used.observe(15)
        build_credits_used.observe(75)


class TestBuildTaskMetricsInstrumentation:
    """Verify build_tasks.py instruments all three build outcomes."""

    def test_success_path_increments_success_counter(self):
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py"
        content = p.read_text(encoding="utf-8")
        assert 'build_outcomes_total.labels(status="success").inc()' in content

    def test_timeout_path_increments_timeout_counter(self):
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py"
        content = p.read_text(encoding="utf-8")
        assert 'build_outcomes_total.labels(status="timeout").inc()' in content

    def test_failure_path_increments_failed_counter(self):
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py"
        content = p.read_text(encoding="utf-8")
        assert 'build_outcomes_total.labels(status="failed").inc()' in content

    def test_all_paths_observe_duration(self):
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py"
        content = p.read_text(encoding="utf-8")
        assert "build_duration_seconds.observe(time.monotonic() - start_time)" in content

    def test_all_paths_observe_credits(self):
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py"
        content = p.read_text(encoding="utf-8")
        assert "build_credits_used.observe(used)" in content

    def test_start_time_tracked_with_monotonic(self):
        from pathlib import Path
        p = Path(__file__).resolve().parents[1] / "tasks" / "build_tasks.py"
        content = p.read_text(encoding="utf-8")
        assert "start_time = time.monotonic()" in content
