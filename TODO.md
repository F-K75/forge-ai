# Forge-AI Fix Progress

## Completed Fixes ✅

### Infrastructure & DevOps
- [x] **Add `.dockerignore`** — Prevents secrets (.env, .git) from being baked into Docker images
- [x] **Fix Dockerfile** — Removed `--reload` (causes memory leaks), added `--workers 4`
- [x] **Fix CORS** — `allowed_origins` as `list[str]`, restricted HTTP methods + headers
- [x] **Docker Compose security** — MongoDB + Redis auth enabled, health checks on all services, required env vars validated
- [x] **Update `.env.example`** — Added `MONGO_PASSWORD`, `REDIS_PASSWORD`, updated `JWT_SECRET` example

### Security
- [x] **Enforce JWT secret length** — Pydantic `field_validator` requiring min 32 chars
- [x] **Cookie security** — All endpoints use `_get_cookie_kwargs` with `SameSite=strict`, `secure` in prod
- [x] **Fix invitation token double-storage** — Plaintext `token` now removed from DB before insert
- [x] **Fix GitHub token leakage** — Replaced `https://oauth2:token@` URL embedding with `GIT_ASKPASS` script
- [x] **Add input length limits** — `CreateBuildRequest.prompt` capped at 50k chars (prevent OOM)
- [x] **Add build timeout enforcement** — `asyncio.wait_for` wrapping `orchestrator.run_build()` (10 min default)

### Database
- [x] **Add 25+ missing indexes** — Projects, builds, team_members, analytics, deployments, audits, notifications, referrals, marketplace, feature_flags, onboarding_progress
- [x] **TTL indexes** — analytics_events (90d), rate_limits (5min), audit_logs (1yr), security_events (90d)
- [x] **Connection pool config** — `maxPoolSize=50`, `minPoolSize=10`, `serverSelectionTimeoutMS=5000`, `connectTimeoutMS=10000`
- [x] **Singleton race condition** — Double-checked locking with `asyncio.Lock` on both MongoDB and Redis init

### Frontend
- [x] **Fix auth store race** — Removed redundant `fetchMe()` after `register` (API response already has user data)
- [x] **Add Error Boundaries** — Created `ErrorBoundary` component, wrapped all routes in `App.tsx`
- [x] **Fix admin auth bypass** — `AdminRoute` now checks `user.email` against `VITE_ADMIN_EMAILS` env var

### Backend
- [x] **Build deduplication guard** — Prevents duplicate builds for same project within 30s window

### Performance
- [x] **Rate limiting via Redis** — Replaced MongoDB-based rate limiting (2-5ms per request) with Redis `INCR` + `EXPIRE` (sub-millisecond). Added `X-RateLimit-Limit` and `X-RateLimit-Remaining` response headers. Removed `X-Forwarded-For` IP spoofing vector.

### Security (continued)
- [x] **WebSocket short-lived token** — Added `/auth/ws-token` endpoint (5 min expiry). Frontend now fetches ws-token via HTTP before opening WebSocket, instead of passing long-lived access_token in URL. Added `vite-env.d.ts` for type-safe env vars.

### Backend (continued)
- [x] **Add `template` field to projects** — `Project` model now has `template` (str) and `template_data` (dict) fields for onboarding templates
- [x] **Fix credit refund race condition** — Credit refund now uses `find_one_and_update` with guard condition (`credits >= reserved_credits - used`) to prevent over-refunding in concurrent scenarios

### DevOps (continued)
- [x] **Add resource limits** — All services now have CPU/memory limits and reservations in docker-compose.yml (backend: 2CPU/2G, frontend: 1CPU/1G, mongo: 2CPU/2G, redis: 0.5CPU/512M)

### Security (final)
- [x] **Password strength enforcement** — Added `validate_password_strength()` requiring 8+ chars, uppercase, lowercase, number, special char. Enforced in `/auth/register` endpoint.
