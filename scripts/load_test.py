#!/usr/bin/env python3
"""Load test for the Forge AI API (roadmap 8.1).

Validates that the API can sustain a target number of concurrent users while
keeping p95 latency below a threshold (default <500ms). Pure stdlib + httpx —
no k6/locust installation required.

The login/auth endpoints are intentionally excluded: they apply email rate
limits and login lockout, so hammering them produces 429s/lockouts rather than
a meaningful latency measurement. We instead load read-only endpoints that
exercise the same request pipeline (auth-optional health routes + Redis/Mongo
pool probes).

Usage:
    python scripts/load_test.py \
        --base-url http://127.0.0.1:8000 \
        --concurrency 1000 \
        --duration 30 \
        --threshold-ms 500

Exit code 0 = p95 latency under threshold; 1 = target not met. Metrics are
printed at the end (total, p50/p95/p99, throughput, error rate).
"""
import argparse
import asyncio
import time

import httpx

# Endpoints that exercise the request pipeline without mutating state or
# tripping auth rate limits. The weight roughly mirrors real read traffic.
ENDPOINTS = [
    ("/health", 0.5),
    ("/health/detailed", 0.3),
    ("/health/pools", 0.2),
]

P95_BUCKET_DIVISOR = 1000.0


def _pick_endpoint() -> str:
    import random
    r = random.random()
    cumulative = 0.0
    for path, weight in ENDPOINTS:
        cumulative += weight
        if r <= cumulative:
            return path
    return ENDPOINTS[-1][0]


async def _worker(worker_id: int, base_url: str, results: list, stop: asyncio.Event,
                  timeout: float, errors: list) -> None:
    """Continuously issue requests until the stop event fires, recording per
    request latency (ms) and any transport-level errors."""
    async with httpx.AsyncClient(base_url=base_url, timeout=timeout) as client:
        while not stop.is_set():
            path = _pick_endpoint()
            started = time.perf_counter()
            try:
                resp = await client.get(path)
                latency_ms = (time.perf_counter() - started) * P95_BUCKET_DIVISOR
                results.append(latency_ms)
                if resp.status_code >= 500:
                    errors.append((path, resp.status_code))
            except httpx.HTTPError as exc:
                errors.append((path, type(exc).__name__))


def _percentile(sorted_latencies: list, pct: float) -> float:
    if not sorted_latencies:
        return 0.0
    idx = min(len(sorted_latencies) - 1, int(pct / 100.0 * len(sorted_latencies)))
    return sorted_latencies[idx]


async def _run(base_url: str, concurrency: int, duration: float, timeout: float,
               threshold_ms: float) -> dict:
    results: list = []
    errors: list = []
    stop = asyncio.Event()
    workers = [
        asyncio.create_task(
            _worker(i, base_url, results, stop, timeout, errors)
        )
        for i in range(concurrency)
    ]
    started = time.perf_counter()
    try:
        await asyncio.sleep(duration)
    finally:
        stop.set()
    await asyncio.gather(*workers, return_exceptions=True)
    elapsed = time.perf_counter() - started

    sorted_latencies = sorted(results)
    total = len(sorted_latencies)
    p50 = _percentile(sorted_latencies, 50)
    p95 = _percentile(sorted_latencies, 95)
    p99 = _percentile(sorted_latencies, 99)
    throughput = total / elapsed if elapsed else 0.0
    error_rate = (len(errors) / total * 100.0) if total else 0.0
    return {
        "total_requests": total,
        "elapsed_s": elapsed,
        "throughput_rps": throughput,
        "p50_ms": p50,
        "p95_ms": p95,
        "p99_ms": p99,
        "error_count": len(errors),
        "error_rate_pct": error_rate,
        "threshold_ms": threshold_ms,
        "passed": p95 < threshold_ms and error_rate < 1.0,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Forge AI load test (8.1)")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--concurrency", type=int, default=1000,
                        help="number of concurrent simulated users")
    parser.add_argument("--duration", type=float, default=30.0,
                        help="test duration in seconds")
    parser.add_argument("--timeout", type=float, default=15.0,
                        help="per-request timeout in seconds")
    parser.add_argument("--threshold-ms", type=float, default=500.0,
                        help="p95 latency threshold in milliseconds")
    args = parser.parse_args()

    report = asyncio.run(_run(
        args.base_url, args.concurrency, args.duration, args.timeout,
        args.threshold_ms,
    ))

    print("\n===== Forge AI load test report =====")
    print(f"base url        : {args.base_url}")
    print(f"concurrency     : {args.concurrency}")
    print(f"duration        : {args.duration}s")
    print(f"total requests  : {report['total_requests']}")
    print(f"elapsed         : {report['elapsed_s']:.1f}s")
    print(f"throughput      : {report['throughput_rps']:.0f} req/s")
    print(f"latency p50     : {report['p50_ms']:.1f} ms")
    print(f"latency p95     : {report['p95_ms']:.1f} ms")
    print(f"latency p99     : {report['p99_ms']:.1f} ms")
    print(f"error rate      : {report['error_rate_pct']:.2f}% "
          f"({report['error_count']} errors)")
    print(f"target (p95)    : <{report['threshold_ms']:.0f} ms")
    verdict = "PASS" if report["passed"] else "FAIL"
    print(f"verdict         : {verdict}")
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()