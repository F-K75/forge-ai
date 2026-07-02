# P0 Dependency Resolution — Active Sprint

**Started:** March 7, 2026
**Last Updated:** March 7, 2026
**Target:** Resolve all P0 items within 2 weeks
**Team:** 3 engineers

## Progress Summary

| Track | Total | Done | Remaining | Hours Est. |
|-------|-------|------|-----------|------------|
| 1. Security | 6 | 6 | 0 | 0h |
| 2. Database | 3 | 3 | 0 | 0h |
| 3. Architecture | 3 | 3 | 0 | 0h |
| 4. Product | 5 | 5 | 0 | 0h |
| 5. AI Pipeline | 2 | 2 | 0 | 0h |
| 6. Infrastructure | 2 | 2 | 0 | 0h |
| **Total** | **21** | **21** | **0** | **0h** |

## ✅ Completed Items

### Track 1: Security
- [x] **SEC-001**: CSRF token validation wired into middleware — `csrf_protection_middleware` active in `main.py`, `GET /auth/csrf-token` endpoint exists in `api/auth.py`, Redis-backed storage via `store_csrf_token()`/`validate_csrf_token()`
- [x] **SEC-002**: Encryption key separated from JWT secret — `encryption.py` now uses dedicated `FIELD_ENCRYPTION_KEY` instead of deriving from `jwt_secret`
- [x] **SEC-005**: JTI claim added to all JWT tokens — `create_access_token()` and `create_refresh_token()` now include `"jti": str(uuid.uuid4())`
- [x] **SEC-006**: Password reset tokens now use PBKDF2-SHA256 (600K iterations) instead of raw SHA256
- [x] **SEC-004**: Fail-closed rate limiting — in-memory fallback with timestamp-based tracking when Redis is down
- [x] **SEC-011**: Per-email rate limiting on auth endpoints — `check_email_rate_limit()` in `security.py`, 3 attempts/hour for password reset, 5/hour for registration

### Track 2: Database
- [x] **DB-001**: Separate build files from Build document (16MB limit) — `BuildFile` model and `build_files` collection with indexes; `build_tasks.py` emit writes to `build_files`; `get_build_files` and `rollback_build` read from `build_files`
- [x] **DB-002**: Unique email enforcement — register endpoint catches MongoDB `DuplicateKeyError` (code 11000) to prevent race conditions
- [x] **DB-003**: Invitation token double-storage fixed — `Invitation` model no longer has `token` field; token generated in endpoint, hashed, only `hashed_token` stored

### Track 3: Architecture
- [x] **BE-001**: Complete Celery migration for build processing — removed `_run_build_background`; `builds.py` uses `run_build.delay()`; `celery-worker` service added to `docker-compose.yml`
- [x] **WS-001**: Migrate WebSocket to Redis pub/sub — `ConnectionManager.emit()` and `broadcast()` publish to Redis channel `build:{build_id}`; local fallback for same-instance connections
- [x] **WS-002**: Send file deltas instead of full file dict — `orchestrator.py` emits `{"delta": {"changed": {...}, "deleted": []}}` on FILE_UPDATE events

### Track 4: Product
- [x] **PROD-001**: Fix password reset full flow — `ResetPassword.tsx` page created; `/reset-password` route in `App.tsx`; `forgot_password` endpoint sends reset email via Resend
- [x] **PROD-002**: Fix template selection — `template: Optional[str]` added to `CreateProjectRequest` and `UpdateProjectRequest`; stored in `Project` document
- [x] **PROD-005**: Add email verification flow — `email_verified: bool` added to `User` model; verification email sent on registration; `/auth/verify-email` endpoint; builds blocked for unverified users
- [x] **PROD-006**: Credit race condition — atomic `find_one_and_update` with `$gte` guard in refund path
- [x] **PROD-007**: Trial enforcement — `trial_ends_at` checked before build creation; expired trial users on Free plan blocked

### Track 5: AI Pipeline
- [x] **AI-001**: Implement LLM token usage tracking — `track_usage()` integrated into `BaseAgent.stream()` and `BaseAgent.run()`; token counts and cost persisted to `ai_usage` collection
- [x] **AI-002**: Implement prompt injection detection — `_detect_prompt_injection()` checks user messages against known patterns before every LLM call; `sanitize_prompt()` strips control characters

### Track 6: Infrastructure
- [x] **INF-004**: CI/CD pipeline already set up — `.github/workflows/ci.yml` covers backend lint/type-check/security/tests, frontend type-check/build/audit, prod artifact build, and quality gate
- [x] **INF-006**: Configure Sentry error tracking — `sentry-sdk==2.15.0` added to `requirements.txt`; initialized in `main.py` when `SENTRY_DSN` is set; `sentry_dsn` and `app_env` added to `core/config.py`

### Additional Fixes
- [x] **Token blacklist uses JTI**: `get_current_user()` and `logout()` now query by `{"jti": jti}` instead of full token string
- [x] **JTI index**: `token_blacklist` collection has unique index on `jti` + TTL index (24h expiry)
- [x] **Logout blacklists token**: Logout endpoint stores JTI in `token_blacklist` for immediate revocation

## Files Modified This Session

| File | Changes |
|------|---------|
| `backend/core/encryption.py` | Use dedicated FIELD_ENCRYPTION_KEY instead of deriving from JWT_SECRET |
| `backend/auth.py` | Added JTI (uuid4) to all JWT tokens |
| `backend/api/auth.py` | PBKDF2-SHA256 for tokens, JTI blacklisting, unique email enforcement, fixed invitation flow, per-email rate limiting, email verification, password reset email via Resend |
| `backend/core/models.py` | Removed `token` field from Invitation (only hashed_token stored); added `email_verified` to User; added `BuildFile` model |
| `backend/core/security.py` | In-memory fallback rate limiter when Redis is down; per-email rate limiting for auth endpoints; prompt injection detection |
| `backend/core/database.py` | Added JTI index + TTL on token_blacklist; added `build_files` indexes |
| `backend/api/builds.py` | Trial enforcement before build creation; email verification check; separate build files via `build_files` collection; removed `_run_build_background` |
| `backend/core/orchestrator.py` | Pass user context to agents for token tracking; emit file deltas instead of full file dicts |
| `backend/tasks/build_tasks.py` | Write build files to `build_files` collection instead of embedding in Build document |
| `backend/services/ws_manager.py` | Redis pub/sub for multi-instance WebSocket broadcasting |
| `backend/api/projects.py` | `template` field on `CreateProjectRequest` and `UpdateProjectRequest` |
| `backend/core/config.py` | Added `sentry_dsn`, `app_env`, `celery_broker_url`, `celery_result_backend` |
| `backend/main.py` | Sentry initialization |
| `backend/celery_app.py` | Use `CELERY_BROKER_URL`/`CELERY_RESULT_BACKEND` env vars |
| `docker-compose.yml` | Added `celery-worker` service |
| `backend/requirements.txt` | Added `sentry-sdk==2.15.0` |
| `backend/agents/base.py` | LLM token tracking via `track_usage()`; prompt injection detection via `_detect_prompt_injection()`; user context forwarding to all agent calls |
| `backend/agents/architect.py` | Forward user context to `run()` |
| `backend/agents/designer.py` | Forward user context to `run()` |
| `backend/agents/developer.py` | Forward user context to `stream()` and `run()` |
| `backend/agents/integration.py` | Forward user context to `run()` |
| `backend/agents/pm.py` | Forward user context to `run()` |
| `backend/agents/business_model.py` | Forward user context to `run()` |
| `frontend/src/App.tsx` | Added `/reset-password` route |
| `frontend/src/pages/ResetPassword.tsx` | Created new password reset page component |
