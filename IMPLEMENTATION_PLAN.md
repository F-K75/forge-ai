# IMPLEMENTATION_PLAN.md — LLM-013: Shared Multi-Dimensional LLM Rate Limiting

## Problem

`core/security.check_llm_rate_limit(user_id)` bounds LLM call *frequency* per
user, but has two gaps relative to the abuse model it was built for:

1. **No per-project scoping.** A single build's agent loop (architect →
   designer → developer → … with debug retries) can make dozens of LLM calls.
   Because the limit is keyed only by `user_id`, one runaway project can consume
   the user's *entire* per-minute allotment and starve that user's other
   projects — and in a multi-tenant org, one project can crowd out siblings.
2. **No per-org ceiling.** There is no global org-level backstop, so a single
   org's aggregate LLM traffic is unbounded by this limiter (only per-user).

The TODO item ("would need a rate-limit backend (Redis-based) decision
consistent with the rest of the app's rate limiting") is *partially* stale: the
limiter is already Redis-backed and shares the same INCR+EXPIRE/fail-closed
pattern as `check_email_rate_limit` and `rate_limit_middleware`. The remaining
real work is **dimensionality**, not the backend choice.

## Root Cause

- `LLMRouter.generate()` calls `check_llm_rate_limit(user_id)` with only the
  user id, even though it already has `project_id` and `org_id` in scope.
- The limiter had a single `user` dimension and a single config entry.

## Solution

Generalize `check_llm_rate_limit` into a **shared, multi-dimensional** limiter
keyed by user, project, and org — all Redis-backed (consistent with the rest of
the app) with the same in-memory fail-closed fallback:

- `user`:    `rl:llm:user:{user_id}`      — 60 / 60s
- `project`: `rl:llm:project:{project_id}` — 30 / 60s  (bounds one build loop)
- `org`:     `rl:llm:org:{org_id}`         — 300 / 60s (org-wide backstop)

A request is rejected if **any** dimension is over its limit. `generate()` now
passes `project_id` and `org_id` (when present) so all three dimensions are
enforced. Limits are configurable via `LLM_RATE_LIMIT_DIMENSIONS`.

This is "shared/consistent" because it reuses Redis (survives process restarts
in steady state) exactly like the existing auth/email limiters; the in-memory
fallback only activates during a Redis outage (accepted degradation, same as
the rest of the app).

## Architecture Changes

- `core/security.py`: replace single `LLM_RATE_LIMITS["generate"]` with
  `LLM_RATE_LIMIT_DIMENSIONS` (user/project/org). Rewrite
  `check_llm_rate_limit(user_id, *, project_id=None, org_id=None)` to evaluate
  all applicable dimensions against Redis, rejecting if any is exceeded.

## Database Changes

- None (Redis keyspace only; no new Mongo collection — Redis is the app's
  established rate-limit store).

## API Changes

- None. Internal only.

## UI Changes

- None.

## Testing Strategy

- `tests/test_llm_rate_limit.py`: already covers the per-user path; extend to
  assert project and org dimensions are enforced, that a user under their limit
  but a project over its limit is rejected, and that the Redis-backed key
  prefixes are used. Use a fake Redis (or monkeypatched `get_redis`) matching
  the suite's existing patterns. Keep the in-memory-fallback path covered.

## Risks

- A legitimate heavy build could trip the per-project (30/60s) limit. 30 calls
  per minute per project is generous for a multi-agent pipeline (a handful of
  calls per stage) and only throttles pathological runaway loops. Tunable.
- Redis-outage fallback is in-memory per process (resets on restart) — accepted,
  consistent with the rest of the app's limiters.

## Rollback Plan

- Revert `core/security.py` limiter + the `generate()` call change; delete the
  extended tests. No DB/migration change.
