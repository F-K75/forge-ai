# Step 4 — API Scalability audit (FastAPI)

> Evidence-based review of REST endpoints + auth + rate limiting + pagination/streaming/timeouts/retries/caching/idempotency/concurrency.

## 1) What to measure (repo evidence targets)
- Horizontal scalability of FastAPI endpoints behind K8s (HPA)
- Rate limiting behavior under Redis failure
- Concurrency characteristics (async-safe vs sync/blocking)
- Streaming endpoints (WebSockets are in Step 5-ish; here we focus on REST + HTTP streaming)
- Timeouts/retries at client/server boundaries
- Response size and pagination patterns

## 2) API surface & routing
### Evidence
- Routers mounted in `backend/main.py`:
  - `backend/api/builds.py` (REST + WS endpoint)
  - `backend/api/projects.py`
  - `backend/api/auth.py`
  - `backend/api/billing.py`
  - `backend/api/analytics.py`
  - plus marketplace/growth/support/etc.
- `backend/main.py` middleware chain includes:
  - request size limit
  - CSRF
  - rate limiting
  - request-id
  - optional Prometheus middleware

## 3) Authentication & session
### Evidence
- JWT-based auth used by WebSocket and REST (see `backend/api/auth.py` + `services/ws_manager.py:authenticate_websocket`).
- CSRF middleware relies on `access_token` cookie and validates `X-CSRF-Token` from Redis (`backend/core/security.py`).

### Scalability implications
- JWT decode per request (CPU cost linear in number of authenticated calls).
- CSRF adds one Redis `GET csrf:{jti}` per mutation request.

### Failure impact
- If Redis is degraded/unreachable:
  - rate limiting falls back to in-memory (per-key timestamp list)
  - CSRF validation fails-closed (returns 403 when Redis lookups fail / token not found)

## 4) Rate limiting
### Evidence (core behavior)
- `backend/core/security.py:rate_limit_middleware`
  - uses Redis `INCR` + `EXPIRE` with per-zone limits
  - on Redis failure, falls back to `_check_in_memory_rate_limit`
  - rate limit uses client IP from trusted proxy logic
- Zones configured:
  - `auth`: limit 10/window 60s
  - `build`: limit 5/window 60s
  - `api`: limit 100/window 60s
- Rate limiter attempts to create DB security_events on limit exceed (best-effort)

### Scalability implications
- For Redis-healthy operation: O(1) per request, constant-time increments.
- For Redis-unstable operation: fallback stores timestamps in Python dict; under high cardinality (many IPs / keys) memory grows until capped by `_IN_MEMORY_MAX_KEYS=10000`.
- Because the fallback is per-process, multi-replica rate limiting becomes inconsistent (each pod enforces its own local limiter).

### Estimated RPS upper bound
- API middleware adds:
  - CSRF: one Redis get on mutations
  - rate_limit: one Redis incr+expire for relevant routes
- With Redis pool in `backend/core/database.py:get_redis()`:
  - `max_connections=50`
- Therefore, in Redis-healthy scenarios, API RPS is likely bounded by Redis throughput and connection pool contention.

**Repo-backed numeric proxy**: max connections 50 implies that at very high concurrency, some requests will wait for available connections; however Motor/FastAPI timeouts aren’t explicitly tied to Redis pool waiting.

## 5) Pagination, sorting, response sizes
### Evidence constraints
- This audit cannot fully enumerate endpoint-by-endpoint query patterns without loading each router, but we can state:
  - Mongo indexes exist for many list endpoints (`projects`, `builds`, etc.)
  - Rate limit exists for build endpoints
  - Builds/files endpoints return potentially large content (build files can be many files)

### Scalability risk: build files retrieval
- `backend/api/builds.py:get_build_files` returns `[{path: content}]` for **all** files for a build.
- WebSocket sends build progress; on `build_complete`, build events may include `files` (in orchestrator), risking large WS payloads.
- WS payload cap exists at 5MB per event (`MAX_WS_PAYLOAD_BYTES`). REST endpoint has no explicit response size cap.

## 6) Streaming & large request handling
### Evidence
- Request size limit middleware in `backend/core/security.py` uses `settings.max_request_size` (default 10MB).
- WebSockets enforce payload cap and auth timeout (WS manager).

### Retries/timeouts
- REST endpoints generally do not implement idempotent retries automatically.
- Celery tasks have soft/hard time limits in `backend/tasks/build_tasks.py`.

## 7) Concurrency and async safety
### Evidence
- FastAPI uses async middleware and async handlers.
- Mongo uses Motor async driver.
- Redis uses redis.asyncio.

### Remaining unknowns (not proven by code excerpt)
- Whether any routers use synchronous CPU-bound work inside async handlers (could reduce throughput).

## 8) Key throughput blockers across concurrency milestones
## 8.1 100 concurrent users
Expected behavior:
- Most users perform a small number of actions: page load + a few REST calls + 1-2 builds.
- API latency likely acceptable; biggest server-side cost is WS event delivery and build enqueue.

Potential blockers:
- Rate limit defaults: build zone limit 5/minute per IP (note: zone is per client IP).
- Redis dependency for rate limiting/CSRF.

## 8.2 1,000 concurrent users
Likely blockers:
- Redis connection pool contention (max 50 connections).
- High concurrency of CSRF GET and rate limit INCR.
- Multi-replica rate limiting inconsistency when Redis fails.

## 8.3 10,000 concurrent users
Likely blockers:
- WebSocket scaling dominates overall system; HTTP API becomes less significant.
- REST endpoints returning large build files could saturate bandwidth and event-loop time.
- Rate limiting might reject/limit legitimate users due to per-IP token buckets.

## 8.4 100,000 concurrent users
Likely blockers:
- Need centralized rate limiting with strong consistency; per-pod fallback breaks.
- Need pagination/limit enforcement on build/files retrieval.

## 8.5 1,000,000 registered users
Likely blockers:
- Aggregate DB index growth + query costs.
- Aggregation endpoints (e.g., analytics) may become expensive without scaling indexes.
- Strong auth/CSRF + rate limiting overhead per active session.

## 9) Concrete scalability findings (evidence-based)
P0 blockers:
- `GET /builds/{build_id}/files` returns full file contents with no pagination or response-size guard.
- Missing explicit index provisioning for `ai_usage` aggregation hot path (see Step 3).

P1 blockers:
- Redis pool max connections=50 may cap middleware throughput.
- Rate-limiter fallback to in-memory is not consistent across pods.

P2 blockers:
- Potential CPU-bound work inside routers (not exhaustively audited here).

## 10) Recommendations (impact vs effort)
- Add pagination / file count/size limiting to `get_build_files`.
- Enforce response-size / max-files-per-build on REST endpoints.
- Increase Redis connection pool size or share a global connection manager.
- Ensure `ai_usage` has indexes supporting daily match/group.

