"""Fleet-wide Prometheus metrics for Forge AI.

Prometheus scrapes a single process — the API server's ``/metrics`` endpoint
(``main.py``). Celery workers don't expose their own scrape target, so any
counter that lives inside a worker process is invisible to ``/metrics`` unless
the worker explicitly ships it somewhere scrapeable.

The AI Optimizer is a case in point: each worker process holds its own
``AIOptimizer`` singleton (and its own prompt/response caches), and builds run
in worker processes. So the optimizer ratios and token-savings tallies that
appear on ``/metrics`` today only reflect whatever happened in the API
process itself.

This module bridges the gap (roadmap 8.5 — "Expose Celery-worker Prometheus
metrics (fleet-scrapeable)"):

- Workers publish a compact snapshot of their optimizer analytics + cache
  statistics AND the cumulative values of every counter they have incremented
  in-process (build outcomes, LLM requests/tokens/retries/failovers/
  guardrail-blocks/budget) to a per-worker Redis key with a short TTL, right
  after each task completes (``task_postrun``). The publish is best-effort and
  never raises; purely a sink so a laggy/hostile broker can't break build
  processing.
- The API ``/metrics`` scrape aggregates every live (non-expired) worker key
  plus its own optimizer stats into the shared ``llm_*`` / ``forge_worker_*``
  gauges, so the fleet view of e.g. ``llm_tokens_saved_total``,
  ``llm_optimization_ratio``, and ``forge_worker_build_outcomes_total`` is the
  sum/weighted-mean across all workers that ran recently.
"""

import json
import logging
import os
import platform
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# TTL on each worker's snapshot key. Scrape targets should scrape this the API
# more often than the TTL so a currently-active worker is always represented.
WORKER_SNAPSHOT_TTL = 30

_KEY_PREFIX = "forge:metrics:optimizer"


def worker_snapshot_key(worker_id: str) -> str:
    return f"{_KEY_PREFIX}:{worker_id}"


def current_worker_id() -> str:
    """A stable-ish per-process id: hostname + PID + a per-process nonce.

    The nonce makes two short-lived workers that share a hostname+PID (e.g.
    after a respawn within the same shell) not collide on the same key until
    the TTL expires."""
    return f"{platform.node()}:{os.getpid()}:{os.getpid() * 31 % 100000}"


# Counter metric names whose per-label values a worker publishes in its
# snapshot, so the API scrape can re-surface them as forge_worker_* gauges.
# Each entry is (metric_name, label_names). These are the in-process counters
# Prometheus can never scrape directly off a worker.
WORKER_COUNTER_SERIES = [
    ("build_outcomes_total", ["status"]),
    ("llm_requests_total", ["provider", "model", "agent", "status"]),
    ("llm_tokens_total", ["provider", "model", "agent", "direction"]),
    ("llm_retry_attempts_total", ["agent"]),
    ("llm_failovers_total", ["agent"]),
    ("llm_guardrail_blocked_total", ["category"]),
    ("llm_budget_downgrades_total", ["scope"]),
    ("llm_budget_rejections_total", ["scope"]),
]

# Maps a worker-side counter metric name to (forge_worker_* gauge, label_names).
_COUNTER_GAUGE_MAP = {
    "build_outcomes_total": ("forge_worker_build_outcomes_total", ["status"]),
    "llm_requests_total": ("forge_worker_llm_requests_total", ["provider", "model", "agent", "status"]),
    "llm_tokens_total": ("forge_worker_llm_tokens_total", ["provider", "model", "agent", "direction"]),
    "llm_retry_attempts_total": ("forge_worker_llm_retry_attempts_total", ["agent"]),
    "llm_failovers_total": ("forge_worker_llm_failovers_total", ["agent"]),
    "llm_guardrail_blocked_total": ("forge_worker_llm_guardrail_blocked_total", ["category"]),
    "llm_budget_downgrades_total": ("forge_worker_llm_budget_downgrades_total", ["scope"]),
    "llm_budget_rejections_total": ("forge_worker_llm_budget_rejections_total", ["scope"]),
}


def collect_worker_counters() -> Dict[str, Any]:
    """Read the current value of every worker-side counter from the shared
    prometheus registry, indexed by its label values.

    Returns a dict keyed by metric name -> list of {labels: {...}, value: n}.
    Empty if prometheus_client isn't installed or the metric has no samples
    yet (counters only appear once incremented)."""
    from core import metrics as _metrics

    if _metrics.registry is None:
        return {}

    result: Dict[str, Any] = {}
    try:
        for metric in _metrics.registry.collect():
            if metric.name not in [c[0] for c in WORKER_COUNTER_SERIES]:
                continue
            samples = []
            for sample in metric.samples:
                samples.append(
                    {
                        "labels": {k: v for k, v in sample.labels.items()},
                        "value": sample.value,
                    }
                )
            result[metric.name] = samples
    except Exception:
        logger.debug("worker counter collection failed", exc_info=True)
    return result


def collect_worker_snapshot() -> Dict[str, Any]:
    """Serialize this process's optimizer analytics + cache stats + model info.

    Pure data — no async, no Redis. Shared so the worker publish path and the
    API's local contribution to the fleet aggregation use identical shape."""
    from optimizer.service import get_optimizer

    optimizer = get_optimizer()
    metrics_snapshot = optimizer.get_optimization_metrics()
    cache_stats = optimizer.get_cache_statistics()
    return {
        "total_requests": metrics_snapshot.total_requests,
        "total_tokens_used": metrics_snapshot.total_tokens_used,
        "total_tokens_saved": metrics_snapshot.total_tokens_saved,
        "average_compression_ratio": metrics_snapshot.average_compression_ratio,
        "failure_count": int(metrics_snapshot.failure_rate > 0),
        "prompt_cache_hits": cache_stats.prompt_cache_hits,
        "prompt_cache_misses": cache_stats.prompt_cache_misses,
        "response_cache_hits": cache_stats.response_cache_hits,
        "response_cache_misses": cache_stats.response_cache_misses,
        "semantic_response_cache_hits": cache_stats.semantic_response_cache_hits,
        "counters": collect_worker_counters(),
    }


def publish_worker_snapshot_sync(worker_id: Optional[str] = None) -> None:
    """Best-effort, fire-and-forget publish for the Celery ``task_postrun`` hook.

    Celery signal handlers run in the worker's main thread (synchronous), so
    this runs its own short-lived event loop with a dedicated Redis client
    rather than reusing the process-global ``core.database`` client (which is
    tied to a particular loop). Failures are swallowed: optimizer telemetry
    must never break task processing. ``collect_worker_snapshot`` is pure, so
    even with Redis down we don't burn a request on a dead hop."""
    try:
        payload = json.dumps(collect_worker_snapshot())
    except Exception:
        logger.debug("optimizer snapshot serialization failed", exc_info=True)
        return

    def _run():
        import asyncio
        import time
        from redis.asyncio import Redis
        from core.config import get_settings

        resolved_id = worker_id or current_worker_id()

        async def _publish(client: Redis) -> None:
            # Include the write timestamp so the API scrape can derive uptime
            # (seconds since last snapshot) per worker for liveness.
            doc = {"_ts": time.time(), "worker_id": resolved_id, "snapshot": json.loads(payload)}
            await client.setex(
                worker_snapshot_key(resolved_id),
                WORKER_SNAPSHOT_TTL,
                json.dumps(doc),
            )

        asyncio.run(_publish(Redis.from_url(get_settings().redis_url)))

    try:
        _run()
    except Exception:
        logger.debug("optimizer snapshot publish failed", exc_info=True)


async def aggregate_fleet_optimizer_gauges() -> None:
    """Aggregate every live worker snapshot + this process's own optimizer into
    the shared ``llm_*`` and ``forge_worker_*`` gauges. Called from ``/metrics``
    (main.py).

    Reads all ``forge:metrics:optimizer:*`` keys (expired keys drop off via the
    TTL), sums token/cache counters and worker-side build/LLM counters, and
    computes weight-by-request means for the ratio gauges. Falls back to the
    local process's optimizer stats if Redis or any worker key read fails, and
    is always best-effort — a momentary Redis hiccup leaves gauges at their
    last known value."""
    from core.metrics import (
        llm_cache_hit_ratio,
        llm_optimization_ratio,
        llm_tokens_saved_total,
        llm_semantic_cache_hit_ratio,
        forge_optimizer_workers_active,
        forge_worker_uptime_seconds,
    )
    from core.metrics import update_optimizer_gauges

    workers = await _read_worker_snapshots()

    if not workers:
        update_optimizer_gauges()
        forge_optimizer_workers_active.set(0)
        _reset_fleet_counter_gauges([])
        return

    local = collect_worker_snapshot()
    workers.append({"worker_id": current_worker_id(), "snapshot": local})
    forge_optimizer_workers_active.set(max(1, len(workers) - 1))

    # Seed the cost-by-provider gauges from the local process's optimizer
    # (workers upload counters but not cost attribution), then overwrite the
    # ratio/token gauges below with the fleet-wide aggregates.
    update_optimizer_gauges()

    snapshots = [w["snapshot"] for w in workers]
    total_requests = sum(w["total_requests"] for w in snapshots)
    total_tokens_saved = sum(w["total_tokens_saved"] for w in snapshots)

    # Weighted compression ratio: average_compression_ratio is the average over
    # that worker's own requests, so weight by that worker's request share.
    if total_requests:
        weighted_ratio = sum(
            w["average_compression_ratio"] * w["total_requests"] for w in snapshots
        ) / total_requests
        llm_optimization_ratio.set(weighted_ratio)

    llm_tokens_saved_total.set(total_tokens_saved)

    r_hits = sum(w["response_cache_hits"] for w in snapshots)
    r_misses = sum(w["response_cache_misses"] for w in snapshots)
    if r_hits + r_misses:
        llm_cache_hit_ratio.set(r_hits / (r_hits + r_misses))
    semantic = sum(w["semantic_response_cache_hits"] for w in snapshots)
    if r_hits:
        llm_semantic_cache_hit_ratio.set(semantic / r_hits)

    _aggregate_fleet_counter_gauges(workers)

    # Liveness: expose seconds since each live worker's last snapshot.
    import time

    now = time.time()
    for w in workers:
        age = now - float(w.get("_ts", now))
        forge_worker_uptime_seconds.labels(worker_id=w["worker_id"]).set(max(0, age))


def _aggregate_fleet_counter_gauges(workers: List[Dict[str, Any]]) -> None:
    """Sum the worker-side counters across the fleet into forge_worker_* gauges.

    Gauges are cleared first (including label series from workers that have
    since expired) so a stale worker can't leave residue behind."""
    from core import metrics as _metrics
    from core.metrics import registry

    if registry is None:
        return

    _reset_fleet_counter_gauges(workers)

    summed: Dict[Tuple[str, Tuple[str, ...]], float] = {}
    for w in workers:
        counters = (w.get("snapshot") or {}).get("counters") or {}
        for name, series in counters.items():
            for sample in series:
                labels = sample.get("labels") or {}
                value = float(sample.get("value") or 0.0)
                key = (name, tuple(sorted(labels.items())))
                summed[key] = summed.get(key, 0.0) + value

    gauge_map = _COUNTER_GAUGE_MAP

    for (name, label_items), value in summed.items():
        gauge_name = gauge_map.get(name)
        if not gauge_name:
            continue
        gauge = getattr(_metrics, gauge_name[0], None)
        if gauge is None:
            continue
        label_values = dict(label_items)
        gauge.labels(**{k: label_values[k] for k in gauge_name[1] if k in label_values}).set(value)


def _reset_fleet_counter_gauges(workers: List[Dict[str, Any]]) -> None:
    """Clear the forge_worker_* counter gauges so expired workers drop out.

    ``clear()`` zeroes every previously-set label series; workers still live
    are repopulated by the subsequent aggregation."""
    from core import metrics as _metrics
    from core.metrics import registry

    if registry is None:
        return
    for _, (gauge_name, _labels) in _COUNTER_GAUGE_MAP.items():
        gauge = getattr(_metrics, gauge_name, None)
        if gauge is not None:
            try:
                gauge.clear()
            except Exception:
                logger.debug("gauge clear failed for %s", gauge_name, exc_info=True)


async def _read_worker_snapshots() -> List[Dict[str, Any]]:
    """Return the deserialized snapshots of all live (non-expired) worker keys.

    Never raises; returns [] on any Redis failure so the caller still serves
    the local process's statistics."""
    try:
        from core.database import get_redis

        redis = await get_redis()
        keys = []
        cursor = 0
        while True:
            cursor, batch = await redis.scan(
                cursor=cursor, match=f"{_KEY_PREFIX}:*", count=200
            )
            keys.extend(batch)
            if not cursor:
                break
        snapshots: List[Dict[str, Any]] = []
        for key in keys:
            raw = await redis.get(key)
            if raw:
                try:
                    doc = json.loads(raw)
                    # Envelope format written by publish_worker_snapshot_sync:
                    # {_ts, worker_id, snapshot}. Tolerate legacy bare-snapshot
                    # keys written before the envelope was introduced.
                    if "snapshot" in doc:
                        snapshots.append(doc)
                    else:
                        snapshots.append(
                            {"worker_id": key.rsplit(":", 1)[-1], "_ts": 0, "snapshot": doc}
                        )
                except (ValueError, TypeError):
                    continue
        return snapshots
    except Exception:
        logger.debug("worker snapshot read failed", exc_info=True)
        return []