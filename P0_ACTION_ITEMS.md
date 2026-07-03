# P0 Dependency Resolution — Active Sprint

**Started:** March 7, 2026
**Last Updated:** March 7, 2026
**Target:** Resolve all P0 items within 2 weeks
**Team:** 3 engineers

> **⚠️ Update 2026-07-03:** This sprint's 21/21 "done" scope was accurate for what it tracked, but eight new P0s were found after this sprint closed — see `ENGINEERING_BACKLOG.md` for full detail. **All eight are now resolved, same day they were found:** **SEC-014** (`bcrypt`/`passlib` version incompatibility that crashed registration and login on every attempt — total product outage, not a security exploit; fixed by pinning `bcrypt==4.0.1`), **SEC-016** (an `_id`/ObjectId serialization crash on registration, only discoverable once SEC-014 stopped blocking the hashing step first), **SEC-015** (credential leak in auth responses), **BE-013** (marketplace-creation crash), **BE-015** (the Celery build pipeline — the item marked "done" directly below as BE-001 — actually 500'd on every single build creation request due to three independent wiring bugs; see `ENGINEERING_BACKLOG.md` BE-015), **WS-003** (the WebSocket Redis pub/sub migration marked "done" below as WS-001 had no subscriber at all, so live build-progress events were silently dropped for every client, on every build — not just a multi-instance edge case; see `ENGINEERING_BACKLOG.md` WS-003), **PROD-008** (the credit-refund path marked "done" below as part of PROD-006 refunded a failed build's reservation once per Celery retry attempt instead of once per build — a real, exploitable free-credits path; the reservation half of PROD-006 was independently verified genuinely race-free via 8 real concurrent requests; see `ENGINEERING_BACKLOG.md` PROD-008), and **AI-008** (the prompt injection blocklist marked "done" below as AI-002 had two concrete, demonstrated bypasses — trivial reformatting, and only checking the last message in a conversation instead of every turn; see `ENGINEERING_BACKLOG.md` AI-008). None of these were part of this sprint's original tracked scope, but none are open either — this backlog currently has zero newly-discovered open P0s from the 2026-07-03 session.

## Progress Summary

| Track | Total | Done | Remaining | Hours Est. |
|-------|-------|------|-----------|------------|
| 1. Security | 9 (+3: SEC-014/015/016, found & resolved 2026-07-03) | 9 | 0 | 0h |
| 2. Database | 3 | 3 | 0 | 0h |
| 3. Architecture | 3 (+2: BE-015, WS-003, found & resolved 2026-07-03) | 3 | 0 | 0h |
| 4. Product | 5 (+1: PROD-008, found & resolved 2026-07-03) | 5 | 0 | 0h |
| 5. AI Pipeline | 2 (+1: AI-008, found & resolved 2026-07-03) | 2 | 0 | 0h |
| 6. Infrastructure | 2 | 2 | 0 | 0h |
| **Total** | **24** (+7: SEC-014/015/016, BE-015, WS-003, PROD-008, AI-008) | **24** | **0** | **0h** |

## ✅ Completed Items

### Track 1: Security
- [x] **SEC-001**: CSRF token validation wired into middleware — `csrf_protection_middleware` active in `main.py`, `GET /auth/csrf-token` endpoint exists in `api/auth.py`, Redis-backed storage via `store_csrf_token()`/`validate_csrf_token()`. **This backend half was accurate and complete.** A separate gap was found and fixed 2026-07-03: `frontend/src/lib/api.ts` never called `/auth/csrf-token` or attached the header, so every real browser mutation was silently 403ing despite this backend work being correct. Now genuinely end-to-end resolved — see `ENGINEERING_BACKLOG.md` SEC-001.
- [x] *(New, found & fixed 2026-07-03)* **SEC-015**: Auth endpoints (`get_me`, `login`, `register`, `refresh`) were returning the raw MongoDB user document — including `hashed_password` and a decrypted GitHub token — in every response. Fixed via `_public_user_dict()`. Not part of the original Track 1 scope; discovered while building the Settings GitHub-connect feature.
- [x] *(New, found & fixed 2026-07-03)* **SEC-014**: `passlib[bcrypt]==1.7.4` incompatible with `bcrypt>=4.1` (which removed the `_bcrypt.__about__` module passlib reads for version detection) — crashed every registration/login attempt. Fixed by pinning `bcrypt==4.0.1` in `requirements.txt`. Verified with a real register+login round-trip and the full test suite (66/66 passing).
- [x] *(New, found & fixed 2026-07-03)* **SEC-016**: Fixing SEC-014 uncovered a second bug, previously unreachable — Motor's `insert_one()` mutates its input dict in place, injecting a `bson.ObjectId` `_id`; `register`'s response handler reused that dict and crashed on serialization. Fixed by adding `_id` to `_public_user_dict()`'s strip list.
- [x] **SEC-002**: Encryption key separated from JWT secret — `encryption.py` now uses dedicated `FIELD_ENCRYPTION_KEY` instead of deriving from `jwt_secret`
- [x] **SEC-005**: JTI claim added to all JWT tokens — `create_access_token()` and `create_refresh_token()` now include `"jti": str(uuid.uuid4())`
- [x] **SEC-006**: Password reset tokens now use PBKDF2-SHA256 (600K iterations) instead of raw SHA256
- [x] **SEC-004**: Fail-closed rate limiting — in-memory fallback with timestamp-based tracking when Redis is down
- [x] **SEC-011**: Per-email rate limiting on auth endpoints — `check_email_rate_limit()` in `security.py`, 3 attempts/hour for password reset, 5/hour for registration

### Track 2: Database
- [x] **DB-001**: Separate build files from Build document (16MB limit) — `BuildFile` model and `build_files` collection with indexes; `build_tasks.py` emit writes to `build_files`; `get_build_files` and `rollback_build` read from `build_files`. **Verified 2026-07-03 end-to-end against the running app** (not just by reading the code, per this session's standing verification policy): confirmed `Build` has no `files`/`content` field at all; inserted files (including one >700KB) into `build_files` for a real build and confirmed the `Build` document's key set was completely unaffected; confirmed `GET /builds/{id}/files` correctly returns them from the separate collection. This claim held up as accurate — no gap found here, unlike BE-001 (see BE-015).
- [x] **DB-002**: Unique email enforcement — register endpoint catches MongoDB `DuplicateKeyError` (code 11000) to prevent race conditions
- [x] **DB-003**: Invitation token double-storage fixed — `Invitation` model no longer has `token` field; token generated in endpoint, hashed, only `hashed_token` stored

### Track 3: Architecture
- [x] **BE-001**: Complete Celery migration for build processing — removed `_run_build_background`; `builds.py` uses `run_build.delay()`; `celery-worker` service added to `docker-compose.yml`. **Correction 2026-07-03:** this checklist item's individual claims were all literally true, but the pipeline as a whole was completely broken end-to-end — see BE-015.
- [x] *(New, found & fixed 2026-07-03)* **BE-015**: Despite BE-001 looking complete, every real build creation request 500'd. Three independent bugs: (1) `tasks/build_tasks.py` bound its tasks to Celery's generic unconfigured default app instead of the real `celery_app.py` "forge" app (which is never imported elsewhere in the running app), so `.delay()` tried to reach RabbitMQ's default port instead of Redis; (2) `celery_app.py`'s `autodiscover_tasks(["backend"])` crashed any real worker on startup (`ModuleNotFoundError: No module named 'backend'` — this project has no such top-level package); (3) both Celery tasks used `asyncio.run()` per call, which closes its event loop on return, while `core/database.py`'s Mongo client is a process-global singleton bound to whichever loop created it — so a worker could complete exactly one task, ever, before every subsequent task (and retry) permanently failed with `RuntimeError: Event loop is closed`. All three fixed; verified with a real `celery -A celery_app worker` processing two sequential builds successfully.
- [x] **WS-001**: Migrate WebSocket to Redis pub/sub — `ConnectionManager.emit()` and `broadcast()` publish to Redis channel `build:{build_id}`; local fallback for same-instance connections. **Correction 2026-07-03:** the publish half was real, but nothing ever subscribed — see WS-003.
- [x] *(New, found & fixed 2026-07-03)* **WS-003**: Despite WS-001 looking complete, live build-progress events never reached any connected client, for any build — verified live (0 of several confirmed-emitted events received by a real connected WebSocket client). Root cause: no Redis subscriber existed anywhere, and since the BE-015 fix, all build processing runs in the Celery worker process, which never holds any real WebSocket connections (only the FastAPI web process does) — so the "local fallback" delivery path was always empty too. Fixed by adding `ConnectionManager.start_pubsub_listener()`, a background task (started via `main.py`'s lifespan) that subscribes to `build:*` and forwards messages to that process's local connections, with per-instance origin-tagging to avoid double delivery. Verified with a real Celery worker delivering 14/14 events to a connected client after the fix.
- [x] **WS-002**: Send file deltas instead of full file dict — `orchestrator.py` emits `{"delta": {"changed": {...}, "deleted": []}}` on FILE_UPDATE events

### Track 4: Product
- [x] **PROD-001**: Fix password reset full flow — `ResetPassword.tsx` page created; `/reset-password` route in `App.tsx`; `forgot_password` endpoint sends reset email via Resend
- [x] **PROD-002**: Fix template selection — `template: Optional[str]` added to `CreateProjectRequest` and `UpdateProjectRequest`; stored in `Project` document
- [x] **PROD-005**: Add email verification flow — `email_verified: bool` added to `User` model; verification email sent on registration; `/auth/verify-email` endpoint; builds blocked for unverified users
- [x] **PROD-006**: Credit race condition — atomic `find_one_and_update` with `$gte` guard in refund path. **Verified 2026-07-03**: the *reservation* half of this claim held up — fired 8 real concurrent build requests at a user with credits for exactly one build; exactly 1 succeeded, 7 correctly got 402, no double-spend. The *refund* half did not hold up — see PROD-008.
- [x] *(New, found & fixed 2026-07-03)* **PROD-008**: `run_build`'s `except Exception` block (which refunds unused credits and marks a build `failed`) ran on every Celery retry attempt, not once per build, because `autoretry_for=(Exception,)` re-invokes the whole function body on each retry. Verified live: a build reserved 17 credits, failed and retried 4 times (1 original + 3 retries), and the balance ended at 38 — *above* the starting 17 — instead of the correct 5. Fixed by checking `self.request.retries` against `max_retries` and only refunding/finalizing on the last attempt. Re-verified live: same scenario now ends at exactly 5.
- [x] **PROD-007**: Trial enforcement — `trial_ends_at` checked before build creation; expired trial users on Free plan blocked

### Track 5: AI Pipeline
- [x] **AI-001**: Implement LLM token usage tracking — `track_usage()` integrated into `BaseAgent.stream()` and `BaseAgent.run()`; token counts and cost persisted to `ai_usage` collection
- [x] **AI-002**: Implement prompt injection detection — `_detect_prompt_injection()` checks user messages against known patterns before every LLM call; `sanitize_prompt()` strips control characters. **Verified 2026-07-03 by actually attempting bypasses** (not just reading the pattern list): found two real gaps — trivial reformatting (`"ignore  previous instructions"` with a double space, newlines, hyphens) defeated the exact-substring match, and only the *last* message was checked, so an injection planted in an earlier conversation-history turn went undetected entirely. Both fixed — see AI-008. This is still a keyword blocklist, not the secondary-LLM-call/output-validation approach originally scoped in `ENGINEERING_BACKLOG.md` AI-002 — that broader scope remains open.
- [x] *(New, found & fixed 2026-07-03)* **AI-008**: See above — whitespace normalization added before pattern matching, and detection now checks every user message in the conversation instead of only the last one. Re-verified with the same bypass strings; all now correctly flagged. 9 regression tests added in `backend/tests/test_prompt_injection_detection.py`.

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
| `backend/tasks/build_tasks.py` | Write build files to `build_files` collection instead of embedding in Build document. **2026-07-03:** bind tasks to the real `celery_app` (was resolving to Celery's unconfigured default app); replaced per-call `asyncio.run()` with a persistent per-process event loop (was permanently breaking every task after the first) |
| `backend/services/ws_manager.py` | Redis pub/sub for multi-instance WebSocket broadcasting |
| `backend/api/projects.py` | `template` field on `CreateProjectRequest` and `UpdateProjectRequest` |
| `backend/core/config.py` | Added `sentry_dsn`, `app_env`, `celery_broker_url`, `celery_result_backend` |
| `backend/main.py` | Sentry initialization |
| `backend/celery_app.py` | Use `CELERY_BROKER_URL`/`CELERY_RESULT_BACKEND` env vars. **2026-07-03:** replaced broken `autodiscover_tasks(["backend"])` (crashed any real worker on startup) with a direct `import tasks.build_tasks`; fixed `task_routes` keys to match the actual registered task names |
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
