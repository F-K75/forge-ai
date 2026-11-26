---
name: performance-profiling
version: 1.0.0
domain: software_engineering
description: Measure-first performance work - profiling CPU, memory, and I/O hot paths, removing N+1 calls, and adding caches safely.
keywords: [performance, profil, latency, slow, bottleneck, cpu, memory leak, n+1, hot path, caching, speed up]
dependencies: []
permissions: [read_repo, run_tests]
departments: [engineering, quality]
---
Measure before changing anything, fix the largest bottleneck first, and prove the improvement with the same measurement.

## Checklist
- [ ] Define the metric and target (p95 latency, throughput, peak memory) and the workload.
- [ ] Reproduce with realistic data volume; capture a baseline.
- [ ] Profile (py-spy, cProfile, Chrome DevTools, `EXPLAIN`) instead of guessing.
- [ ] Look first for N+1 queries, repeated serialization, sync I/O in async code, and unbounded loops.
- [ ] Batch or parallelize independent I/O; move CPU-heavy work off the event loop.
- [ ] Add caches only with an explicit key, TTL, size bound, and invalidation rule.
- [ ] Re-run the same benchmark and report before/after numbers in the PR.
- [ ] Add a regression guard (benchmark test or budget alert) for the fixed path.

## Pitfalls
- Micro-optimizing code that is 1% of the profile.
- Caches that serve stale or cross-tenant data.
- Benchmarking against an empty database.
