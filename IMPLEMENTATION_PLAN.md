# Fix: Fast-fail index provisioning in get_db() (INF-008, P1)

## Problem

`get_db()` calls `_ensure_indexes()` which runs ~35 sequential `create_index` operations. Each operation inherits the client's `serverSelectionTimeoutMS=5000` (5 seconds). When MongoDB is unreachable, every index call waits the full 5 seconds before failing, for a total startup failure time of ~175 seconds.

This causes:
- Slow Kubernetes pod startup failures (readiness probe timeout)
- Slow test failures when MongoDB is down
- Poor operational experience during MongoDB outages

## Root Cause

`_ensure_indexes()` uses sequential `await db.collection.create_index(...)` calls. There is no parallelism and no early-exit when the first index fails. The caller (`get_db()`) only learns about the failure after all ~35 operations have individually timed out.

## Solution

Run all `create_index` calls concurrently via `asyncio.gather(..., return_exceptions=True)`. When MongoDB is unreachable, all calls fail after the same ~5 second window simultaneously, reducing the total slow-fail time from ~175s to ~5s.

The change:
1. Collect all `create_index` coroutines into a list
2. Run them concurrently with `asyncio.gather(return_exceptions=True)`
3. Iterate results, log individual failures, and re-raise if any failed
4. Preserve the existing `apply_retention_ttl_indexes` fail-soft behavior (it already handles per-collection failures gracefully)

## Architecture Changes

None. This is an internal refactor of `_ensure_indexes()` in `core/database.py`.

## Database Changes

None. Index definitions are unchanged.

## API Changes

None. `get_db()` signature and behavior are unchanged.

## UI Changes

None.

## Testing Strategy

- Unit: verify `_ensure_indexes` raises quickly when `create_index` calls fail
- Integration: verify all indexes are created correctly when MongoDB is available
- Regression: run full backend test suite

## Risks

- **Very low**: `asyncio.gather` with `return_exceptions=True` preserves the existing behavior of logging individual failures and re-raising. The only change is that failures happen concurrently instead of sequentially.
- **Very low**: Motor's `create_index` is idempotent, so running them concurrently against a live MongoDB is safe (MongoDB handles concurrent index builds).

## Rollback Plan

Revert `_ensure_indexes()` to the sequential `await` pattern. The function will work correctly, just slower when MongoDB is unreachable.
