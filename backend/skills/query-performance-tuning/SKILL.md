---
name: query-performance-tuning
version: 1.0.0
domain: data_engineering
description: Diagnosing slow SQL and MongoDB queries with explain plans, index tuning, pagination, and aggregation rewrites.
keywords: [slow query, slow queries, query, explain, query plan, index, collection scan, n+1, aggregation, pagination, mongo, postgres, sql, query performance]
dependencies: [database-schema-modeling]
permissions: [read_repo]
departments: [engineering, architecture]
---
Read the query plan before changing anything; most slow queries are fixed by the right index, a narrower projection, or removing an N+1 pattern.

## Checklist
- [ ] Find the worst queries by total time (pg_stat_statements, Mongo profiler, APM), not by anecdote.
- [ ] Run `EXPLAIN (ANALYZE, BUFFERS)` or `.explain("executionStats")` on realistic data.
- [ ] Look for sequential/collection scans, large sorts in memory, and high rows-examined vs returned.
- [ ] Add or reorder composite indexes to match equality, sort, then range fields.
- [ ] Project only needed fields; avoid `SELECT *` and fetching large blobs in lists.
- [ ] Replace offset pagination on large tables with keyset/cursor pagination.
- [ ] Collapse N+1 lookups into a join, `$in` query, or batched loader.
- [ ] Push filters early in aggregation pipelines (`$match` before `$lookup`/`$group`).
- [ ] Re-measure and compare plans before and after; keep the fix in a migration.

## Pitfalls
- Adding an index per query until writes slow down.
- Functions on indexed columns (`lower(email)`) that prevent index use without an expression index.
- Tuning on a tiny dev dataset where every plan looks fast.
