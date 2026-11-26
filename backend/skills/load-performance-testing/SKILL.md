---
name: load-performance-testing
version: 1.0.0
domain: quality_engineering
description: Load, stress, and soak testing with k6 or Locust against explicit latency and throughput targets.
keywords: [load test, load testing, stress test, soak test, k6, locust, throughput, p95, p99, concurrency, capacity, requests per second]
dependencies: [performance-profiling]
permissions: [read_repo, run_tests]
departments: [quality, engineering]
---
Load tests answer a specific capacity question with explicit targets; run them against a production-like environment and report percentiles, not averages.

## Checklist
- [ ] State the question and target (e.g. "p95 < 300 ms at 200 RPS with < 0.1% errors").
- [ ] Model realistic traffic: endpoint mix, think time, payload sizes, authenticated users.
- [ ] Use a production-like environment and dataset size; never load test production unannounced.
- [ ] Warm up before measuring; run long enough to see GC, cache, and pool effects.
- [ ] Ramp gradually to find the knee where latency or errors climb.
- [ ] Run a soak test (hours) to catch leaks and connection exhaustion.
- [ ] Record p50/p95/p99 latency, throughput, error rate, and resource saturation together.
- [ ] Stub or rate-limit paid third-party calls (LLMs, payments) during tests.
- [ ] Compare against the previous baseline and attach results to the PR or release.
- [ ] Make thresholds pass/fail criteria in the script so CI can gate on them.

## Pitfalls
- The load generator becoming the bottleneck; monitor it too.
- Testing only cached GET requests and missing write-path limits.
