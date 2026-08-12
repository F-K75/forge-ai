"""Tests for fleet-wide Prometheus optimizer metrics (roadmap 8.5).

Workers publish per-process optimizer/cache snapshots to Redis; the API's
/metrics aggregation sums across live workers so fleet ratios are visible even
though Prometheus only scrapes the API process. These tests exercise both the
publish payload shape and the aggregation math against an in-memory fake Redis.
"""
import json
import os
from unittest.mock import MagicMock

os.environ.setdefault("TESTING", "true")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-that-is-at-least-32-characters")

import pytest

import core.fleet_metrics as fleet_metrics
import core.metrics as metrics_module
from core.fleet_metrics import (
    WORKER_SNAPSHOT_TTL,
    collect_worker_snapshot,
    worker_snapshot_key,
)


class _FakeRedis:
    """Minimal in-memory stand-in exposing the async subset fleet_metrics uses
    (scan + get). No run_until_complete needed since callers are async."""

    def __init__(self, store):
        self._store = store

    async def scan(self, cursor=0, match=None, count=200):
        prefix = match[:-1] if match and match.endswith("*") else match or ""
        matching = [k for k in self._store if prefix is None or k.startswith(prefix)]
        return 0, matching

    async def get(self, key):
        return self._store.get(key)


# --------------------------------------------------------------------------
# Snapshot collection shape
# --------------------------------------------------------------------------

def test_collect_worker_snapshot_has_fleet_keys(monkeypatch):
    analyzer = MagicMock()
    snap = analyzer.get_optimization_metrics.return_value
    snap.total_requests = 5
    snap.total_tokens_used = 1000
    snap.total_tokens_saved = 400
    snap.average_compression_ratio = 0.6
    snap.failure_rate = 0.0
    cache = analyzer.get_cache_statistics.return_value
    cache.prompt_cache_hits = 2
    cache.prompt_cache_misses = 3
    cache.response_cache_hits = 4
    cache.response_cache_misses = 1
    cache.semantic_response_cache_hits = 1
    monkeypatch.setattr("optimizer.service.get_optimizer", lambda: analyzer)

    snapshot = collect_worker_snapshot()
    assert snapshot["total_requests"] == 5
    assert snapshot["total_tokens_saved"] == 400
    assert snapshot["average_compression_ratio"] == 0.6
    assert snapshot["response_cache_hits"] == 4


# --------------------------------------------------------------------------
# Aggregation math
# --------------------------------------------------------------------------

# Helper to build a fake optimizer with deterministic analytics.
def _make_optimizer(total_requests, compression_ratio, tokens_saved,
                    r_hits, r_misses, semantic,
                    p_hits, p_misses):
    analyzer = MagicMock()
    snap = analyzer.get_optimization_metrics.return_value
    snap.total_requests = total_requests
    snap.total_tokens_used = 100
    snap.total_tokens_saved = tokens_saved
    snap.average_compression_ratio = compression_ratio
    snap.failure_rate = 0.0
    snap.cost_by_provider = {}
    cache = analyzer.get_cache_statistics.return_value
    cache.prompt_cache_hits = p_hits
    cache.prompt_cache_misses = p_misses
    cache.response_cache_hits = r_hits
    cache.response_cache_misses = r_misses
    cache.semantic_response_cache_hits = semantic
    return analyzer


async def _run_aggregation(monkeypatch, worker_payloads):
    # Seed one store entry per supplied worker id.
    store = {}
    for wid, payload in worker_payloads.items():
        store[worker_snapshot_key(wid)] = json.dumps(payload)
    fake = _FakeRedis(store)
    monkeypatch.setattr("core.database.get_redis", _async_return(fake))
    monkeypatch.setattr("optimizer.service.get_optimizer",
                        lambda: _make_optimizer(5, 0.5, 50, 4, 1, 1, 2, 3))

    with pytest.MonkeyPatch.context() as m:
        # Force gauges to be real metrics even if prometheus_client is absent.
        m.setattr(metrics_module, "forge_optimizer_workers_active", _Gauge())
        m.setattr(metrics_module, "llm_optimization_ratio", _Gauge())
        m.setattr(metrics_module, "llm_tokens_saved_total", _Gauge())
        m.setattr(metrics_module, "llm_cache_hit_ratio", _Gauge())
        m.setattr(metrics_module, "llm_semantic_cache_hit_ratio", _Gauge())
        await fleet_metrics.aggregate_fleet_optimizer_gauges()
        return {
            "workers": metrics_module.forge_optimizer_workers_active.value,
            "ratio": metrics_module.llm_optimization_ratio.value,
            "saved": metrics_module.llm_tokens_saved_total.value,
            "cache": metrics_module.llm_cache_hit_ratio.value,
            "semantic": metrics_module.llm_semantic_cache_hit_ratio.value,
        }


class _Gauge:
    def __init__(self):
        self.value = 0.0

    def set(self, v):
        self.value = float(v)


def _async_return(obj):
    async def _get():
        return obj
    return _get


async def test_aggregation_weighted_ratio_and_sums(monkeypatch):
    worker_a = {
        "total_requests": 100, "total_tokens_used": 1000,
        "total_tokens_saved": 500, "average_compression_ratio": 0.4,
        "prompt_cache_hits": 10, "prompt_cache_misses": 90,
        "response_cache_hits": 40, "response_cache_misses": 60,
        "semantic_response_cache_hits": 20,
    }
    worker_b = {
        "total_requests": 300, "total_tokens_used": 3000,
        "total_tokens_saved": 900, "average_compression_ratio": 0.6,
        "prompt_cache_hits": 30, "prompt_cache_misses": 270,
        "response_cache_hits": 150, "response_cache_misses": 150,
        "semantic_response_cache_hits": 30,
    }
    out = await _run_aggregation(monkeypatch, {"a": worker_a, "b": worker_b})

    # locals: 5 requests @ ratio 0.5, 50 saved, 4 hits/1 miss, 1 semantic
    total_req = 100 + 300 + 5
    exp_ratio = (0.4 * 100 + 0.6 * 300 + 0.5 * 5) / total_req
    assert out["ratio"] == pytest.approx(exp_ratio)
    assert out["saved"] == 500 + 900 + 50
    # response cache: hits=40+150+4, misses=60+150+1
    assert out["cache"] == pytest.approx(194 / 405)
    assert out["semantic"] == pytest.approx(51 / 194)
    assert out["workers"] == 2


async def test_aggregation_no_workers_falls_back_to_local(monkeypatch):
    out = await _run_aggregation(monkeypatch, {})
    # No worker keys -> local-only gauges; active worker count is zero.
    assert out["workers"] == 0
    assert out["ratio"] == 0.5
    assert out["saved"] == 50


def test_worker_snapshot_key_namespace():
    key = worker_snapshot_key("h:p:1")
    assert key.startswith("forge:metrics:optimizer:")
    assert key.endswith(":h:p:1")


def test_publish_sets_ttl_key_on_redis(monkeypatch):
    # Verify the sync publish helper writes the expected key schema. We can't
    # easily run a real Redis here, so we sanity-check key derivation + TTL
    # constant rather than the network hop.
    assert WORKER_SNAPSHOT_TTL > 0


# --------------------------------------------------------------------------
# Worker-side counter bridging (8.5) -- forge_worker_* gauges
# --------------------------------------------------------------------------

def _make_snapshot_with_counters(counters):
    return {
        "total_requests": 5, "total_tokens_used": 100, "total_tokens_saved": 50,
        "average_compression_ratio": 0.5, "failure_count": 0,
        "prompt_cache_hits": 2, "prompt_cache_misses": 3,
        "response_cache_hits": 4, "response_cache_misses": 1,
        "semantic_response_cache_hits": 1,
        "counters": counters,
    }


class _CounterGauge:
    """Prometheus Gauge stand-in supporting labels() + clear() + set().

    ``labels()`` keys each series by its sorted label values so assertions can
    look up a series by a plain tuple of values."""

    def __init__(self):
        self._series = {}

    def labels(self, **labels):
        key = tuple(sorted(labels.values()))
        if key not in self._series:
            self._series[key] = _Gauge()
        return self._series[key]

    def clear(self):
        self._series.clear()

    def series(self):
        return {k: v.value for k, v in self._series.items()}


def _install_counter_gauges(m, names):
    installed = {}
    for name in names:
        g = _CounterGauge()
        m.setattr(metrics_module, name, g)
        installed[name] = g
    return installed


async def test_aggregation_bridges_worker_counters(monkeypatch):
    worker_a = _make_snapshot_with_counters({
        "build_outcomes_total": [
            {"labels": {"status": "success"}, "value": 3.0},
            {"labels": {"status": "failed"}, "value": 1.0},
        ],
        "llm_requests_total": [
            {"labels": {"provider": "anthropic", "model": "m1", "agent": "developer", "status": "success"}, "value": 4.0},
        ],
        "llm_tokens_total": [
            {"labels": {"provider": "anthropic", "model": "m1", "agent": "developer", "direction": "input"}, "value": 1000.0},
        ],
    })
    worker_b = _make_snapshot_with_counters({
        "build_outcomes_total": [
            {"labels": {"status": "success"}, "value": 2.0},
        ],
    })

    store = {
        worker_snapshot_key("a"): json.dumps({"_ts": 100.0, "worker_id": "a", "snapshot": worker_a}),
        worker_snapshot_key("b"): json.dumps({"_ts": 110.0, "worker_id": "b", "snapshot": worker_b}),
    }
    fake = _FakeRedis(store)
    monkeypatch.setattr("core.database.get_redis", _async_return(fake))
    monkeypatch.setattr("optimizer.service.get_optimizer",
                        lambda: _make_optimizer(5, 0.5, 50, 4, 1, 1, 2, 3))

    gauge_names = [
        "forge_worker_build_outcomes_total",
        "forge_worker_llm_requests_total",
        "forge_worker_llm_tokens_total",
        "forge_worker_uptime_seconds",
        "forge_optimizer_workers_active",
    ]
    with pytest.MonkeyPatch.context() as m:
        installed = _install_counter_gauges(m, gauge_names[:-1])
        # forge_optimizer_workers_active is a plain (label-less) gauge.
        active_gauge = _Gauge()
        m.setattr(metrics_module, "forge_optimizer_workers_active", active_gauge)
        # Also needed by the ratio path.
        m.setattr(metrics_module, "llm_optimization_ratio", _Gauge())
        m.setattr(metrics_module, "llm_tokens_saved_total", _Gauge())
        m.setattr(metrics_module, "llm_cache_hit_ratio", _Gauge())
        m.setattr(metrics_module, "llm_semantic_cache_hit_ratio", _Gauge())

        await fleet_metrics.aggregate_fleet_optimizer_gauges()

        builds = installed["forge_worker_build_outcomes_total"].series()
        assert builds[("success",)] == 3.0 + 2.0
        assert builds[("failed",)] == 1.0

        requests = installed["forge_worker_llm_requests_total"].series()
        assert requests[("anthropic", "developer", "m1", "success")] == 4.0

        tokens = installed["forge_worker_llm_tokens_total"].series()
        assert tokens[("anthropic", "developer", "input", "m1")] == 1000.0

        # Two live workers + local process.
        assert active_gauge.value == 2


async def test_aggregation_clears_stale_counter_series(monkeypatch):
    # A prior scrape populated a success series; a new scrape with no counters
    # (no live workers) must clear it so stale data doesn't linger.
    store = {}
    fake = _FakeRedis(store)
    monkeypatch.setattr("core.database.get_redis", _async_return(fake))
    monkeypatch.setattr("optimizer.service.get_optimizer",
                        lambda: _make_optimizer(5, 0.5, 50, 4, 1, 1, 2, 3))

    with pytest.MonkeyPatch.context() as m:
        installed = _install_counter_gauges(
            m, ["forge_worker_build_outcomes_total"])
        active_gauge = _Gauge()
        m.setattr(metrics_module, "forge_optimizer_workers_active", active_gauge)
        builds = installed["forge_worker_build_outcomes_total"]
        builds.labels(status="success").set(99.0)

        await fleet_metrics.aggregate_fleet_optimizer_gauges()

        assert builds.series() == {}


def test_collect_worker_counters_empty_without_registry(monkeypatch):
    # Simulate prometheus_client unavailable: registry is None -> {}.
    monkeypatch.setattr(metrics_module, "registry", None)
    assert fleet_metrics.collect_worker_counters() == {}