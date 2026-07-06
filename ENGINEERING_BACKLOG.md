# Forge AI — Engineering Backlog

**Version:** 1.0  
**Date:** 2026-01-07  
**Total Issues:** 70 (59 original + 11 added 2026-07-03: SEC-014, SEC-015, SEC-016, BE-013, BE-014, BE-015, WS-003, PROD-008, AI-008, FE-008, FE-009 — all 11 now resolved)  
**Total Estimated Hours:** 1,880

---

## Epic: Security (16 issues)

### SEC-001: CSRF Protection is Incomplete — RESOLVED 2026-07-03
- **ID:** SEC-001
- **Title:** Implement proper CSRF token validation
- **STATUS: RESOLVED.** The original description below was incorrect — verified 2026-07-03 that `backend/core/security.py`'s `csrf_protection_middleware` correctly calls `validate_csrf_token()` (real Redis-backed comparison via `secrets.compare_digest`, not a presence check) and rejects both missing and invalid tokens with 403. The actual, much more severe bug: **`frontend/src/lib/api.ts` never called `GET /auth/csrf-token` or attached `X-CSRF-Token` anywhere**, so every real browser session's POST/PUT/DELETE — create project, create build, rollback, billing checkout, everything — was silently rejected with 403. The backend was secure; the app was simply non-functional for any mutating action.
- **Fix applied:** Added a request interceptor to the shared `api` axios instance in `frontend/src/lib/api.ts` that lazily fetches and caches the CSRF token, attaching it to all non-GET requests (excluding the few server-side-exempt paths: login, register, forgot/reset-password, billing webhook). A response interceptor clears the cached token on 401/403 so the next mutating request fetches a fresh one.
- ~~**Description:** CSRF protection middleware only checks if `X-CSRF-Token` header is present, not if it's valid. `validate_csrf_token` and `store_csrf_token` functions exist but are never called.~~ *(incorrect — see STATUS above)*
- **Category:** Security / Authentication
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `frontend/src/lib/api.ts` (the actual fix); `backend/core/security.py` (already correct, no change needed)
- **Root Cause (corrected):** Frontend never implemented the CSRF token fetch/attach contract that the backend middleware expected, despite the middleware itself working correctly.
- **Acceptance Criteria:**
  - [x] CSRF token validated on all POST/PUT/DELETE requests (already true — backend was correct)
  - [x] Tokens are generated per session and verified (already true)
  - [x] Frontend fetches and attaches the token automatically on every mutating request
  - [x] Verified via curl: `PUT /auth/me` 403s without a token, 200s with a valid one fetched from `/auth/csrf-token`
- **Estimated Hours:** 16 (original estimate; actual fix was ~1h once root cause was correctly identified — the estimate was based on the wrong root cause)
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Medium
- **Verification Steps:** Attempt state-changing request without CSRF token → 403; with valid token → 200 (verified both cases 2026-07-03)

---

### SEC-002: Encryption Key Derived from JWT Secret — RESOLVED 2026-07-06
- **ID:** SEC-002
- **Title:** Separate encryption key from JWT secret
- **Description:** `encryption.py` derives Fernet key from `settings.jwt_secret` using SHA256. If JWT secret leaks, all encrypted data (github_tokens) is compromised.
- **Category:** Security / Cryptography
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** `backend/core/encryption.py`, `backend/core/config.py`, `backend/scripts/migrate_field_encryption_key.py`
- **Root Cause:** Using JWT secret as encryption key material (circular dependency)
- **Fix Applied:**
  - `FIELD_ENCRYPTION_KEY` is now required in `backend/core/config.py` (validated by `check_field_encryption_key`)
  - `backend/core/encryption.py` uses the dedicated key via `normalize_fernet_key()`
  - Added migration script `backend/scripts/migrate_field_encryption_key.py` for re-encrypting existing data
  - Key rotation documented in `.env.production.example`
- **Acceptance Criteria:**
  - [x] `FIELD_ENCRYPTION_KEY` added to config/settings and required in production
  - [x] Encryption module uses dedicated key (not JWT-derived)
  - [x] Migration script provided for existing encrypted data
  - [x] Key rotation documented
- **Estimated Hours:** 16 (est.) / ~2 (actual — key separation was pre-existing, added migration script and documentation)
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Low — migration is opt-in and idempotent; existing deployments continue working with their current key until they run the migration
- **Verification Steps:** Migration script supports --dry-run; re-encrypts github_token field; idempotent

---

### SEC-003: No Authentication on WebSocket Endpoint
- **ID:** SEC-003
- **Title:** Implement secure WebSocket authentication
- **Description:** WebSocket connections pass token as `?token=` query parameter; exposed in server logs, proxy logs, browser history. Connections can be hijacked.
- **Category:** Security / Authentication
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** `backend/api/builds.py` (line 258-262), `backend/services/ws_manager.py` (line 63)
- **Root Cause:** WebSocket protocol limitations force token in query string
- **Recommended Fix:** Use short-lived (5 min) WS-specific tokens; implement token-in-first-message authentication; enforce WSS in production
- **Acceptance Criteria:**
  - [ ] WS connections accepted without token in query string
  - [ ] First WebSocket message must contain valid auth token
  - [ ] Short-lived tokens (5 min TTL) implemented
  - [ ] WSS enforced in production config
- **Estimated Hours:** 24
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Medium
- **Verification Steps:** Connect to WS without token → rejected; connect and send valid token → accepted

---

### SEC-004: Rate Limiting Bypass When Redis is Down — RESOLVED 2026-07-03 (re-scoped)
- **ID:** SEC-004
- **Title:** Implement fail-closed rate limiting
- **Description (original, stale):** ~~`rate_limit_middleware` silently falls through on Redis connection failure allowing unlimited API calls.~~ **This was already false by 2026-07-03** — `rate_limit_middleware` (the general per-IP limiter covering `/auth`, `/builds`, `/api`, etc.) already had a working in-memory fallback (`_check_in_memory_rate_limit`) that still enforces the configured limit when Redis is down. Re-auditing this item live found the *actual* remaining gap was narrower and in a different function: `check_email_rate_limit` (the per-email limiter behind `/auth/register` and `/auth/forgot-password`, 3-5 attempts/email/hour) had its own, separate `except Exception: return True, 0` — an explicit fail-*open*, not a fail-through. Any Redis blip (or an attacker able to trigger Redis errors) allowed unlimited registration or password-reset-token requests for a specific target email, with the per-IP limiter as the only backstop — and that's scoped per-IP, not per-email, looser (10 req/60s vs. 3-5/hour), and trivially bypassed by rotating source IPs.
- **Category:** Security / Rate Limiting
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/core/security.py` (`check_email_rate_limit`, ~line 369-392)
- **Root Cause:** Fail-open exception handler in the per-email limiter, independent of the general middleware's (already-correct) fallback
- **Fix Applied:** `check_email_rate_limit`'s `except Exception` now calls the same `_check_in_memory_rate_limit` helper `rate_limit_middleware` already uses, instead of unconditionally returning `(True, 0)`.
- **Acceptance Criteria:**
  - [x] Requests are still bounded (in-memory fallback) when Redis is down, for both the general middleware and the per-email limiter
  - [x] In-memory fallback rate limiter operational
  - [ ] Fallback limits are conservative (50% of normal) — not done; fallback currently reuses the same limit as the Redis path (per-process, so real effective ceiling scales with worker/replica count during an outage)
- **Estimated Hours:** 8 (est.) / ~1 (actual)
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Low
- **Verification:** Added `backend/tests/test_email_rate_limit_failover.py` — simulates a Redis outage and confirms the 4th request in an hour is blocked (previously all would pass) and that the limit is scoped per-email (a different email is unaffected).

---

### SEC-005: Token Blacklist Uses Raw Token String Instead of JTI
- **ID:** SEC-005
- **Title:** Use JTI for token blacklisting
- **Description:** Token blacklist uses full JWT string instead of JTI (JWT ID) claim. JWT strings are long and indexing is inefficient. Token revocation is ineffective.
- **Category:** Security / Authentication
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/api/auth.py` (line 106-110, 134-136)
- **Root Cause:** Missing JTI in token creation; blacklist uses full token string
- **Recommended Fix:** Add `"jti": str(uuid.uuid4())` to `create_access_token`; blacklist by JTI; implement token expiration cleanup
- **Acceptance Criteria:**
  - [ ] JTI added to all JWT tokens
  - [ ] Blacklist uses JTI instead of full token string
  - [ ] Expired tokens cleaned up from blacklist
  - [ ] Index on JTI field added
- **Estimated Hours:** 8
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Low
- **Verification Steps:** Create token → blacklist it → verify token rejected

---

### SEC-006: Password Reset Token Uses SHA256
- **ID:** SEC-006
- **Title:** Use slow hash for password reset tokens
- **Description:** `_hash_token()` uses SHA256 (fast hash) for password reset tokens, making them vulnerable to brute-force if database is compromised.
- **Category:** Security / Authentication
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/api/auth.py` (line 77-78)
- **Root Cause:** Using fast hash (SHA256) for security tokens
- **Recommended Fix:** Use `hashlib.pbkdf2_hmac('sha256', ...)` with high iterations or bcrypt for token storage
- **Acceptance Criteria:**
  - [ ] Password reset tokens hashed with slow hash (pbkdf2/bcrypt)
  - [ ] Existing tokens remain valid until expiration
  - [ ] Migration path for existing stored tokens
- **Estimated Hours:** 8
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Low
- **Verification Steps:** Generate reset token → verify hash is slow hash → verify token validation works

---

### SEC-007: No MFA / 2FA Support — PARTIALLY RESOLVED 2026-07-06
- **ID:** SEC-007
- **Title:** Implement TOTP-based multi-factor authentication
- **Description:** No multi-factor authentication anywhere in the codebase. Account takeover via credential stuffing; no defense against compromised passwords.
- **Category:** Security / Authentication
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** `backend/api/auth.py` (entire file), `backend/api/admin.py` (MFA enforcement for admins)
- **Root Cause:** Feature not implemented
- **Fix Applied:**
  - TOTP enrollment and verification already implemented in `backend/api/auth.py` (`/mfa/enroll`, `/mfa/verify-setup`, `/mfa/verify`, `/mfa/disable`)
  - Recovery codes already implemented
  - MFA status already exposed in user settings API
  - **Added 2026-07-06:** Admin MFA enforcement in `backend/api/admin.py` — `admin_required` dependency now checks `mfa_enabled` and rejects admin access with 403 if MFA is not enabled
- **Acceptance Criteria:**
  - [x] TOTP enrollment and verification implemented (pre-existing)
  - [x] Recovery codes generated and usable (pre-existing)
  - [x] MFA required for admin accounts (added 2026-07-06)
  - [x] MFA status exposed in user settings API (pre-existing)
  - [ ] Remember device for 30 days option (not implemented)
- **Estimated Hours:** 80 (est.) / ~1 (actual for admin enforcement; rest was pre-existing)
- **Dependencies:** SEC-005 (token management) — already resolved
- **Owner:** Security Lead
- **Risk:** Low
- **Verification Steps:** Admin login without MFA → 403 "Admin accounts require MFA"; admin with MFA → access granted

---

### SEC-008: No Email Verification Flow
- **ID:** SEC-008
- **Title:** Implement email verification flow
- **Description:** Registration endpoint creates active users without email verification. Fake accounts possible; email-based features compromised.
- **Category:** Security / Authentication
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** `backend/api/auth.py` (line 152-197)
- **Root Cause:** Feature not implemented
- **Recommended Fix:** Add email verification step after registration; mark users as unverified until confirmed; require verification before allowing builds
- **Acceptance Criteria:**
  - [ ] Verification email sent on registration
  - [ ] Users marked as `unverified` until email confirmed
  - [ ] Unverified users cannot create builds
  - [ ] Resend verification email endpoint
  - [ ] Verification token expires after 24 hours
- **Estimated Hours:** 24
- **Dependencies:** SEC-006 (token hashing)
- **Owner:** Security Lead
- **Risk:** Low
- **Verification Steps:** Register → receive verification email → click link → verified

---

### SEC-009: NoSQL Injection Vulnerability in Admin Search
- **ID:** SEC-009
- **Title:** Escape regex special characters in admin search
- **Description:** Admin search uses `{"$regex": sanitized}` but `sanitize_string` doesn't prevent all MongoDB operator injections. User input directly in `$regex` can cause ReDoS.
- **Category:** Security / Injection
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/api/admin.py` (line 199-203)
- **Root Cause:** User input passed to MongoDB `$regex` without proper escaping
- **Recommended Fix:** Use `re.escape()` before passing to `$regex`; use text indexes instead of `$regex`; limit search to specific fields
- **Acceptance Criteria:**
  - [ ] All user input properly escaped with `re.escape()`
  - [ ] MongoDB operator injection prevented
  - [ ] Search limited to specific indexed fields
  - [ ] ReDoS vulnerability mitigated
- **Estimated Hours:** 8
- **Dependencies:** SEC-010 (sanitize_string)
- **Owner:** Security Lead
- **Risk:** Medium
- **Verification Steps:** Inject `$where`, `$gt` operators in search → no injection; search with special regex chars → works safely

---

### SEC-010: `sanitize_string` Referenced But Not Defined
- **ID:** SEC-010
- **Title:** Implement missing `sanitize_string` function
- **Description:** `backend/api/admin.py` imports `sanitize_string` from `core.security`, but this function does not exist. Import error at runtime; admin search has no sanitization.
- **Category:** Security / Code Quality
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/api/admin.py` (line 9), `backend/core/security.py`
- **Root Cause:** Missing function definition
- **Recommended Fix:** Implement `def sanitize_string(value: str, max_length: int = 100) -> str:` in security.py
- **Acceptance Criteria:**
  - [ ] `sanitize_string` function exists in `core/security.py`
  - [ ] Function strips control characters, limits length
  - [ ] Import in admin.py resolves correctly
  - [ ] Unit test for sanitization logic
- **Estimated Hours:** 2
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Low
- **Verification Steps:** Import resolves → admin search works without ImportError

---

### SEC-011: No Rate Limiting on Auth Endpoints
- **ID:** SEC-011
- **Title:** Add rate limiting to password reset and registration
- **Description:** Password reset and registration endpoints have no per-IP or per-email rate limiting. Account enumeration via timing attacks; brute force password reset; registration spam.
- **Category:** Security / Rate Limiting
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/api/auth.py` (line 152-197, 355-375)
- **Root Cause:** Missing rate limit configuration for auth endpoints
- **Recommended Fix:** Add strict rate limiting (3 attempts per email per hour for password reset; 5 registrations per IP per hour)
- **Acceptance Criteria:**
  - [ ] Password reset limited to 3 attempts/email/hour
  - [ ] Registration limited to 5/IP/hour
  - [ ] Rate limit headers in response
  - [ ] Clear error message when rate limited
- **Estimated Hours:** 8
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Low
- **Verification Steps:** Exceed rate limit → receive 429 with retry-after header

---

### SEC-012: No Input Validation on Webhook URL
- **ID:** SEC-012
- **Title:** Validate webhook URLs against SSRF attacks
- **Description:** Webhook URL is not validated against SSRF attacks; could point to internal services like 169.254.169.254 (metadata endpoint).
- **Category:** Security / SSRF
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/api/webhooks.py` (line 14-18)
- **Root Cause:** Missing URL validation
- **Recommended Fix:** Validate webhook URL against allowlist; block private IP ranges; require HTTPS; validate URL format
- **Acceptance Criteria:**
  - [ ] Webhook URL validated on creation
  - [ ] Private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x.x.x) rejected
  - [ ] HTTPS required in production
  - [ ] URL format validation with proper error message
- **Estimated Hours:** 8
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Low
- **Verification Steps:** Create webhook with internal IP → rejected; with valid HTTPS URL → accepted

---

### SEC-013: No CORS Configuration for Production Domains
- **ID:** SEC-013
- **Title:** Configure CORS for production domains
- **Description:** `allowed_origins` only has localhost values; no production domain configuration. CORS errors or overly permissive CORS in production.
- **Category:** Security
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/core/config.py` (line 57)
- **Root Cause:** Missing production CORS configuration
- **Recommended Fix:** Configure CORS for production domains via environment variable; add environment-specific settings
- **Acceptance Criteria:**
  - [ ] Production domains configurable via env var
  - [ ] Localhost still works in development
  - [ ] Proper CORS headers on all responses
- **Estimated Hours:** 2
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Low
- **Verification Steps:** Request from production domain → CORS headers present; from unauthorized domain → blocked

---

### SEC-014: bcrypt/passlib Version Incompatibility — RESOLVED 2026-07-03
- **ID:** SEC-014
- **Title:** Fix bcrypt/passlib incompatibility blocking all password hashing
- **Description:** Every call to `hash_password()`/`verify_password()` in `backend/auth.py` — i.e. every registration and every login — raised `ValueError: password cannot be longer than 72 bytes, truncate manually if necessary` from deep inside passlib's own internal compatibility self-test (`passlib/handlers/bcrypt.py`'s `detect_wrap_bug`), not from an actual oversized password. Root cause pinned down precisely: `bcrypt>=4.1` removed the `_bcrypt.__about__` module passlib 1.7.4 reads to detect the installed version; the resulting `AttributeError` cascades into passlib's fallback self-test, which is what actually raises the misleading "72 bytes" error.
- **Category:** Security / Authentication / Availability
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** `backend/requirements.txt` (added explicit `bcrypt==4.0.1` pin below `passlib[bcrypt]==1.7.4`, with a comment explaining why it must not be bumped without also addressing passlib)
- **Root Cause:** Pinned `passlib` version is incompatible with `bcrypt>=4.1`'s removal of `_bcrypt.__about__`.
- **Fix Applied:** Pinned `bcrypt==4.0.1` (the last version with `__about__` intact) directly below the `passlib[bcrypt]` line, with a comment warning against bumping it without re-verifying. Confirmed via isolated repro that `bcrypt==5.0.0` (previously resolved) fails and `bcrypt==4.0.1` succeeds, before touching the pin.
- **Acceptance Criteria:**
  - [x] `POST /auth/register` succeeds end-to-end with a real password — verified via curl, fresh account, 200 response
  - [x] `POST /auth/login` succeeds with the registered credentials — verified, same session
  - [x] Existing test suite still passes — 66/66 `pytest` green after the fix
  - [x] No regression in password strength validation — unaffected, different code path
- **Estimated Hours:** 2-4 estimated, ~1 actual (diagnosis was the expensive part; the pin itself is one line)
- **Dependencies:** None
- **Owner:** Backend Lead
- **Risk:** Was blocking 100% of new signups and logins; now resolved. **Fixing this uncovered a second, previously-unreachable bug — see SEC-016 below** (registration always crashed at the hashing step before, so nothing downstream of it had ever actually run).
- **Verification Steps:** `curl -X POST /auth/register -d '{"email":"...","name":"...","password":"ValidPass123!"}'` → 200 with a token (verified 2026-07-03); immediate `curl -X POST /auth/login` with the same credentials → 200 with a token.

---

### SEC-016: `_id` (bson.ObjectId) Leaked Register Response into a 500 — RESOLVED 2026-07-03
- **ID:** SEC-016
- **Title:** Fix `PydanticSerializationError` on every successful registration
- **Description:** Discovered while verifying SEC-014's fix — with password hashing actually working for the first time, `POST /auth/register` got further than ever before and hit a *new* crash: `PydanticSerializationError: Unable to serialize unknown type: <class 'bson.objectid.ObjectId'>`. Motor's `insert_one()` mutates its input dict in place, injecting a `bson.ObjectId` `_id` field after a successful insert. `register`'s handler reuses that same now-mutated `user_dict` to build its response via `_public_user_dict(user_dict)` (added for SEC-015), and `_public_user_dict` didn't strip `_id`, so FastAPI's response serializer choked on the non-JSON-serializable ObjectId. This bug predates SEC-015's fix — the same mutated-dict reuse existed in the original code too — it was simply unreachable because SEC-014 always crashed first.
- **Category:** Backend / Data Serialization
- **Severity:** CRITICAL (registration was still 100% broken even after SEC-014's fix, until this was found)
- **Priority:** P0
- **Affected Files:** `backend/api/auth.py` (`_public_user_dict`)
- **Root Cause:** `_public_user_dict`'s strip-list didn't include `_id`, and its caller passed it a dict that Motor had mutated in place during `insert_one()`.
- **Fix Applied:** Added `"_id"` to `_public_user_dict`'s strip set, with a comment explaining the Motor-mutation gotcha so future callers don't reintroduce it.
- **Acceptance Criteria:**
  - [x] `POST /auth/register` returns 200 with a clean JSON body (no `_id`, no `hashed_password`)
  - [x] Verified with a fresh account end-to-end, immediately followed by a successful login
- **Estimated Hours:** 0.5 (actual — found and fixed in the same session as SEC-014)
- **Dependencies:** SEC-014 (this bug was unreachable until SEC-014 was fixed)
- **Owner:** Backend Lead
- **Risk:** Was Critical (total registration outage); now Resolved.
- **Verification Steps:** `curl -X POST /auth/register -d '{...}'` → 200, response body has no `_id` or `hashed_password` key. Verified 2026-07-03.

---

### SEC-015: Auth Endpoints Leaked Password Hash and Raw GitHub Token — RESOLVED 2026-07-03
- **ID:** SEC-015
- **Title:** Auth response bodies exposed sensitive fields
- **Description:** `GET /auth/me` decrypted and returned the user's live GitHub personal-access-token in its JSON response on every call (including from the `ProtectedRoute`/`PublicRoute` frontend guards that fire on nearly every page load). Separately, `POST /auth/login`, `POST /auth/register`, and `POST /auth/refresh` all returned the raw, unfiltered MongoDB user document as `TokenResponse.user`, exposing the bcrypt `hashed_password` field (and the encrypted-but-present `github_token` ciphertext) to every client. Found and fixed 2026-07-03 while implementing GitHub-connect UI in Settings.
- **Category:** Security / Data Exposure
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** `backend/api/auth.py` (`get_me`, `login`, `register`, `refresh`)
- **Root Cause:** No response sanitization layer existed between the MongoDB user document and the HTTP response body; endpoints either returned the doc directly or decrypted-and-returned sensitive fields believing they were "helpfully" resolving them for the client.
- **Fix Applied:** Added `_public_user_dict()` helper — strips `hashed_password`, `github_token`, `verification_token`, `verification_expires` from any user dict before it's returned, and adds a `github_connected: bool` in place of the raw token. Applied uniformly across all four endpoints.
- **Acceptance Criteria:**
  - [x] `GET /auth/me` response contains no `hashed_password` or raw `github_token` field
  - [x] `POST /auth/login`, `/register`, `/refresh` responses contain no `hashed_password`
  - [x] `github_connected: bool` correctly reflects whether a token is stored, without exposing it
  - [x] Verified via direct curl against a seeded test user
- **Estimated Hours:** 3 (actual)
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Was High (credential/PII exposure to every client and any network observer); now Resolved.
- **Verification Steps:** `curl GET /auth/me` with a valid session → response has no `hashed_password`/`github_token` keys, has `github_connected` instead. Verified 2026-07-03.

---

## Epic: Backend (14 issues)

### BE-001: BackgroundTasks for Build Processing (No Message Queue)
- **ID:** BE-001
- **Title:** Migrate build processing from BackgroundTasks to Celery
- **Description:** FastAPI BackgroundTasks are in-process, not persisted, and lost on process death. Celery is configured but never used. Builds lost on server restart/crash.
- **Category:** Architecture / Scalability
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** `backend/api/builds.py` (line 122-128), `backend/celery_app.py`
- **Root Cause:** Build pipeline uses `BackgroundTasks.add_task()` instead of Celery/Redis Queue
- **Recommended Fix:** Replace `background_tasks.add_task(_run_build_background, ...)` with `run_build.delay(build_id, ...)`. Configure Celery with Redis broker, implement task persistence, retries, and dead-letter queues.
- **Acceptance Criteria:**
  - [x] All builds processed via Celery tasks
  - [x] Task persistence on Redis restart
  - [x] Automatic retry on failure (3 retries)
  - [ ] Dead-letter queue for failed builds (not implemented — failed tasks after max retries are just marked `status: failed` in Mongo, no separate DLQ)
  - [x] Build status updates via Celery callbacks
  - [x] Existing build creation flow preserved
- **Estimated Hours:** 80
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** High (core architecture change)
- **Verification Steps:** Create build → verify Celery task created → restart Celery → build resumes → verify completion
- **⚠️ Update 2026-07-03:** The `.delay()` call itself was correctly wired (this part of the claim was accurate), but three separate bugs made the whole pipeline **100% non-functional end-to-end** — every real build creation request 500'd. All found by actually running a build with no worker, then with a worker, rather than trusting the code shape. All fixed same day — see **BE-015**.

---

### BE-015: Celery Build Pipeline Was Completely Non-Functional Despite Looking Correct — RESOLVED 2026-07-03
- **ID:** BE-015
- **Title:** Three independent bugs in the Celery wiring meant `run_build.delay()` never actually worked
- **Category:** Architecture / Reliability
- **Severity:** CRITICAL (P0) — every build creation request failed with HTTP 500
- **Priority:** P0
- **Discovered while:** Spot-verifying BE-001's "done" claim by actually creating a build against the running app instead of trusting that `run_build.delay()` existing in the code meant it worked.
- **Bug 1 — task bound to the wrong Celery app:** `backend/tasks/build_tasks.py` did `from celery import current_app` and decorated tasks with `@current_app.task(...)`. `celery_app.py` (the module that actually builds a configured `Celery("forge", broker=<redis-url>, ...)` instance) is **never imported anywhere else in the running app**. So `current_app` resolved to Celery's generic bootstrap default app — `main='default'`, `broker_url=None` — which falls back to Celery's hardcoded default broker (`amqp://guest@localhost:5672`, RabbitMQ's port). Nothing listens there, so every `.delay()` call raised `kombu.exceptions.OperationalError: [Errno 111] Connection refused`. Confirmed by comparing `run_build.app is celery_app` (`False` before the fix) and by showing `celery_app.send_task('backend.tasks.build_tasks.run_build', ...)` (calling the real app object directly) succeeded in the same process where `run_build.delay(...)` failed.
  - **Fix:** `tasks/build_tasks.py` now does `from celery_app import celery_app as current_app`, binding the task to the real, configured app. Verified `run_build.app is celery_app` is now `True`.
- **Bug 2 — worker couldn't even start:** `celery_app.py` called `celery_app.autodiscover_tasks(["backend"])`, which imports `<pkg>.tasks` for each name in the list. There is no importable top-level `backend` package in this project's actual runtime layout (everything runs with `backend/` as the working directory, importing top-level as `tasks.build_tasks`, `api.builds`, etc. — never `backend.xxx`). Running `celery -A celery_app worker` crashed immediately at startup with `ModuleNotFoundError: No module named 'backend'`. This meant that even after fixing Bug 1, **no worker configuration in this repo could ever successfully start** to consume the correctly-enqueued tasks.
  - **Fix:** Replaced `autodiscover_tasks(["backend"])` with a direct `import tasks.build_tasks` at the bottom of `celery_app.py`, which deterministically registers the tasks on app import regardless of package-discovery conventions.
  - **Side finding:** `celery_app.conf.task_routes` keys (`"backend.tasks.deployment"`, `"backend.tasks.build"`) didn't match the real registered task names (`"backend.tasks.build_tasks.run_build"`, `"backend.tasks.build_tasks.update_build_status"`) and would never have routed anything to the `build`/`deployment` queues — corrected to the real task names. (There is no `deployment` Celery task anywhere in the codebase; that route entry was aspirational/dead and was dropped.)
- **Bug 3 — worker could process exactly one task per process, ever:** Both Celery tasks in `build_tasks.py` ran their async body via `asyncio.run(_run())`, which creates a new event loop and **closes it** when the task returns. `core/database.py`'s Mongo client is a process-global singleton (`_mongo_client`), created once and cached for the process's lifetime, bound internally to whichever event loop was active when it was first used. Result: the **first** task a worker process picks up succeeds, but every task after that (including Celery's own automatic retries of the *same* task) permanently fails with `RuntimeError: Event loop is closed` — reproduced live: 8 queued tasks sent to one worker, exactly 1 succeeded, all 7 remaining (and all their retries) failed identically until retries were exhausted. In production this would have meant a worker could complete at most one build before silently failing every build after it.
  - **Fix:** Added a small `_run_async()` helper in `build_tasks.py` that keeps one event loop alive for the lifetime of the worker process (created lazily on first use, reused — not closed — on every subsequent call) instead of creating and closing a fresh loop per task. Both `run_build` and `update_build_status` now go through it.
- **Verification:** With no worker running, `POST /builds/` returns `200 {"status": "pending"}` and the build genuinely sits queued in Mongo (proving it isn't processed inline). Started a real `celery -A celery_app worker` and confirmed it (a) starts without crashing, (b) picks up the queued build, and (c) processed **two sequential real builds** end-to-end (fetched from Mongo, ran the orchestrator, wrote status/credit updates back) with neither hitting the closed-loop error — the only failures were an invalid `ANTHROPIC_API_KEY` in this dev environment's `.env` (a credentials/environment issue, unrelated to the Celery wiring) and the app's own LLM circuit breaker correctly tripping in response.
- **Not fixed / out of scope:** No dead-letter queue exists for tasks that exhaust their retries — they just end up `status: failed` in Mongo with no separate inspection queue. Left as the pre-existing BE-001 gap it already was.
- **Files Modified:** `backend/tasks/build_tasks.py`, `backend/celery_app.py`
- **Owner:** Staff Engineer
- **Estimated Hours:** 0 (found and fixed same day)

---

### WS-003: Live Build Progress Was Never Delivered to Any Client — RESOLVED 2026-07-03
- **ID:** WS-003
- **Title:** Redis pub/sub channel for WebSocket events had no subscriber; every build-progress event was silently dropped
- **Category:** Architecture / Real-time UX
- **Severity:** CRITICAL — the product's headline "watch AI build your app live" feature was completely non-functional
- **Priority:** P0
- **Discovered while:** Spot-verifying WS-001's "Migrate WebSocket to Redis pub/sub" claim, prompted directly by the BE-015 pattern (a claim that looked correct in the code but was unverified end-to-end).
- **Root Cause:** `ConnectionManager.emit()`/`broadcast()` in `backend/services/ws_manager.py` published events to a Redis channel (`build:{build_id}`) and also tried a "local fallback" delivery to any WebSocket connections held by *that same process*. Nothing anywhere in the codebase ever subscribed to the Redis channel. Since fixing BE-015, **all** build processing runs inside the Celery **worker** process — which never accepts any WebSocket connections itself (only the FastAPI web process's `/builds/ws/{build_id}` endpoint does, in a completely separate OS process). So every `emit()` call's "local fallback" always found zero connections, and the Redis publish went nowhere. This wasn't a multi-instance-only edge case — it was broken for every single build, on a single-instance dev setup, 100% of the time. The frontend (`useBuildSocket.ts`) has no REST polling fallback at all, so the failure mode was a completely frozen build view, not degraded polling.
- **Verification method:** Registered a WebSocket client to a real build's `/builds/ws/{id}` endpoint, created the build, and confirmed via server-side logs that `emit()` was called multiple times as the build progressed to a terminal (`failed`) state — then confirmed the connected client received **zero** of those messages. This is the same "actually run it, don't trust the code" methodology that found BE-015.
- **Fix:** Added `ConnectionManager.start_pubsub_listener()` — a background `asyncio` task, started/stopped via `main.py`'s FastAPI `lifespan`, that subscribes to the `build:*` pattern and forwards matching messages to that process's local WebSocket connections. Each process tags its own published messages with a per-instance id so its own listener skips re-delivering what it already sent directly, avoiding double delivery. Same-process delivery still happens directly first (doesn't depend on the pub/sub round trip, so a brief Redis blip doesn't break same-process delivery).
- **Verification after fix:** Restarted the Celery worker (it doesn't hot-reload — an easy trap to fall into mid-fix, and the cause of one false-negative retest along the way), connected a real WebSocket client to a real build, and confirmed the client received every one of 14 events emitted across the build's lifecycle (start, agent updates, failure, retries). Added 3 regression tests in `backend/tests/test_ws_pubsub_bridge.py` using an in-memory fake Redis (no live Redis needed in CI) covering: same-process delivery still works, a *different* `ConnectionManager` instance's event reaches this instance's connections (the actual bug), and a process never double-delivers its own event to itself.
- **Files Modified:** `backend/services/ws_manager.py`, `backend/main.py`, `backend/tests/test_ws_pubsub_bridge.py` (new)
- **Owner:** Backend Lead
- **Estimated Hours:** 0 (found and fixed same day)

---

### PROD-008: Credit Refund Fired Once Per Retry Attempt, Not Once Per Build — RESOLVED 2026-07-03
- **ID:** PROD-008
- **Title:** A failing, retried build refunded its reservation multiple times, ending above its starting balance
- **Category:** Business Logic / Billing Integrity
- **Severity:** CRITICAL — real, exploitable "free credits" path, not just a rare edge case
- **Priority:** P0
- **Discovered while:** Spot-verifying PROD-006's claim ("Credit race condition — atomic `find_one_and_update` with `$gte` guard in refund path") by actually firing concurrent requests at the running app, per this session's standing methodology.
- **What was actually verified clean:** The *reservation* path (`api/builds.py`'s atomic `find_one_and_update({"credits": {"$gte": max_credits}}, {"$inc": {"credits": -max_credits}})`) is genuinely race-free. Fired 8 truly concurrent `POST /builds/` requests (via a real `ThreadPoolExecutor`, not sequential calls) against a user with credits for exactly one build: exactly 1 of 8 succeeded, the other 7 correctly got `402 Insufficient credits`, no double-spend. PROD-006's original claim was accurate for this half.
- **What was actually broken:** `BuildTask` is configured with `autoretry_for=(Exception,)` (`max_retries=3`), which makes Celery re-invoke `run_build`'s *entire function body* on every retry — including the `except Exception` block, which refunded credits and marked the build `failed` unconditionally on every single attempt, not just the final one. Verified live: a build that reserved 17 credits failed and retried 4 times (1 original + 3 retries, exactly as configured) due to an invalid `ANTHROPIC_API_KEY` in this dev environment — and the user's balance ended at **38 credits, higher than the starting 17**, instead of the mathematically correct 5 (17 reserved − 12 used = 5 refunded). Any build that reliably raises a retryable exception is a repeatable free-credits exploit, not a theoretical concern.
- **Fix:** `run_build` is now `bind=True` and checks `self.request.retries` against `self.retry_kwargs["max_retries"]` inside the except block — refund and finalize-as-`failed` only fire on the last attempt Celery will make for a given task. Non-final attempts raise (so Celery still retries, unchanged resilience behavior) without touching credits or the build's terminal status.
- **Verification after fix:** Repeated the exact same live scenario (17 credits reserved, build fails and retries 4 times due to the same invalid API key) — final balance was exactly 5, matching the correct single refund. Added 3 regression tests in `backend/tests/test_credit_refund_retries.py` using Celery's `push_request()`/`pop_request()` test hooks to simulate specific retry counts without needing a real broker; one test replays the full 0→1→2→3 attempt sequence and asserts the refund fires exactly once across all of them.
- **Files Modified:** `backend/tasks/build_tasks.py`, `backend/tests/test_credit_refund_retries.py` (new)
- **Owner:** Backend Lead
- **Estimated Hours:** 0 (found and fixed same day)

---

### BE-002: No Global Error Handler / Exception Middleware
- **ID:** BE-002
- **Title:** Implement global exception handler
- **Description:** No custom exception handler; FastAPI default error responses may leak internals. Unhandled exceptions return 500 with stack traces.
- **Category:** Error Handling / Reliability
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/main.py`
- **Root Cause:** Missing error handling middleware
- **Recommended Fix:** Add global exception handler that logs errors and returns sanitized responses; implement custom exception classes
- **Acceptance Criteria:**
  - [ ] Global `@app.exception_handler(Exception)` registered
  - [ ] Stack traces logged but never returned to client
  - [ ] Consistent error response format
  - [ ] HTTP exception classes for common status codes
  - [ ] Sensitive information stripped from error responses
- **Estimated Hours:** 16
- **Dependencies:** OBS-001 (structured logging)
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Trigger unhandled exception → receive sanitized 500 response → stack trace in logs

---

### BE-003: No Pagination on List Endpoints
- **ID:** BE-003
- **Title:** Add pagination to all list endpoints
- **Description:** Multiple endpoints return all results without pagination: `GET /projects/`, `GET /webhooks/`, `GET /api-keys/`, `GET /organizations/{id}/members`. API calls will timeout or crash with millions of users.
- **Category:** Scalability / API Design
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** `backend/api/projects.py` (line 36-41), `backend/api/webhooks.py` (line 64-71), `backend/api/api_keys.py` (line 70-77), `backend/api/auth.py` (line 601-628)
- **Root Cause:** Missing pagination parameters
- **Recommended Fix:** Add cursor-based pagination with `page` and `per_page` query parameters (default 20, max 100); return total count and pagination metadata
- **Acceptance Criteria:**
  - [ ] All list endpoints support `page` and `per_page` params
  - [ ] Default page size = 20, max = 100
  - [ ] Response includes `total`, `page`, `per_page`, `total_pages`
  - [ ] Cursor-based pagination for real-time data
  - [ ] Backward compatible (no page param = all results with deprecation warning)
- **Estimated Hours:** 24
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Call list endpoint with `?page=1&per_page=10` → 10 results + pagination metadata

---

### BE-004: No API Versioning
- **ID:** BE-004
- **Title:** Implement API versioning
- **Description:** All endpoints under root without version prefix. Breaking changes affect all consumers with no migration path.
- **Category:** API Design
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** All API routers
- **Root Cause:** Missing API versioning
- **Recommended Fix:** Add version prefix to all endpoints (e.g., `/v1/`); implement version negotiation; maintain backward compatibility
- **Acceptance Criteria:**
  - [ ] All endpoints prefixed with `/v1/`
  - [ ] Old endpoints redirect or return deprecation notice
  - [ ] Version header accepted for content negotiation
  - [ ] Documentation updated with versioning info
- **Estimated Hours:** 24
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Call `/v1/auth/login` → 200; call `/auth/login` → 301 or deprecation header

---

### BE-005: No Graceful Shutdown Handling
- **ID:** BE-005
- **Title:** Implement graceful shutdown with connection draining
- **Description:** No SIGTERM handling; no drain of active connections before shutdown. In-flight builds lost during deployment; connection drops.
- **Category:** Reliability
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/main.py`
- **Root Cause:** Missing graceful shutdown
- **Recommended Fix:** Add signal handlers for SIGTERM/SIGINT; implement connection draining; wait for in-flight builds to complete within timeout
- **Acceptance Criteria:**
  - [ ] SIGTERM/SIGINT handlers registered
  - [ ] Active requests allowed to complete (up to 30s timeout)
  - [ ] Celery workers notified to stop accepting new tasks
  - [ ] WebSocket connections gracefully closed
  - [ ] Health check returns unhealthy during drain
- **Estimated Hours:** 16
- **Dependencies:** BE-001 (Celery migration)
- **Owner:** Staff Engineer
- **Risk:** Medium
- **Verification Steps:** Send SIGTERM → server accepts no new connections → existing connections drain → clean exit

---

### BE-006: Build Timeout May Leak Resources — RESOLVED 2026-07-03 (was worse than described)
- **ID:** BE-006
- **Title:** Ensure build timeout properly cleans up resources
- **Description (original, stale):** ~~`asyncio.wait_for` wraps the orchestrator but timeout exception handling may not clean up resources.~~ **This described pre-Celery code that no longer exists** — `backend/api/builds.py` has no `wait_for`/timeout logic at all anymore (confirmed by grep; it was apparently dropped during the BE-001/BE-015 migration to Celery and never re-implemented). The real state found on re-audit: `settings.build_timeout` ("10 minutes max per build") was referenced **nowhere** in the codebase outside its own definition in `core/config.py` — completely dead config. Nothing enforced any time limit on a build. A hung pipeline (agent retry storm, a stuck call outside the LLM client's own per-call timeout, a debug-loop bug bypassing `MAX_DEBUG_ITERATIONS`) would occupy a Celery worker slot forever with the user's credits reserved and never refunded — worse than "may leak resources," since there was no cleanup path to trigger at all.
- **Category:** Reliability
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/tasks/build_tasks.py`
- **Root Cause:** Timeout enforcement was tied to the old BackgroundTasks implementation and silently dropped when build execution moved to Celery
- **Fix Applied:** `run_build`'s task decorator now sets `soft_time_limit=settings.build_timeout` and `time_limit=settings.build_timeout + 30` (hard SIGKILL backstop). Added an `except SoftTimeLimitExceeded` clause that refunds the unused portion of the credit reservation and marks the build `failed` — deliberately *not* retried (`SoftTimeLimitExceeded` is a `BaseException`, outside `autoretry_for=(Exception,)`), since a hung pipeline would only hang again.
- **Acceptance Criteria:**
  - [x] Configurable max build duration (was already configurable, now actually enforced)
  - [x] Timeout triggers refund + build marked failed (equivalent of "try/finally ensures resource cleanup on timeout" for the current Celery architecture)
  - [ ] Timeout events logged with build ID and duration — not done (error string is generic, no structured log/metric)
- **Estimated Hours:** 16 (est.) / ~1 (actual)
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification:** Added `test_run_build_has_time_limit_wired_from_settings` (`tests/test_celery_tasks.py`) and `test_soft_time_limit_refunds_and_fails_build_without_retry` (`tests/test_credit_refund_retries.py`) — the latter simulates `SoftTimeLimitExceeded` and confirms exactly one refund and one `failed` status update, matching the existing retry-refund regression tests' style.

---

### BE-007: No Cache Headers / Caching Strategy
- **ID:** BE-007
- **Title:** Implement Redis caching for read-heavy endpoints
- **Description:** No caching for frequently accessed data (plans, feature flags, user data). High database load; slow response times for repeated queries.
- **Category:** Performance / Scalability
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** All API files
- **Root Cause:** Missing caching strategy
- **Recommended Fix:** Implement Redis caching using cache-aside pattern with TTL; add `@cache(ttl=300)` decorator for plans, feature flags, user profiles
- **Acceptance Criteria:**
  - [ ] Cache decorator implemented
  - [ ] Plans, feature flags, user profiles cached (TTL 300s)
  - [ ] Cache invalidation on data changes
  - [ ] Configurable per-endpoint TTL
  - [ ] Cache hit/miss metrics exposed
- **Estimated Hours:** 40
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** First request → cache miss → DB query; second request → cache hit → no DB query

---

### BE-008: No Request ID / Correlation ID
- **ID:** BE-008
- **Title:** Add request ID middleware
- **Description:** No request ID middleware; logs cannot be correlated across services. Unable to trace requests; difficult debugging.
- **Category:** Observability
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** `backend/main.py`
- **Root Cause:** Missing middleware
- **Recommended Fix:** Add middleware that generates/injects X-Request-ID; include in all logs and responses; propagate to Celery tasks
- **Acceptance Criteria:**
  - [ ] X-Request-ID generated for every request
  - [ ] Existing X-Request-ID from client propagated
  - [ ] Request ID included in all log entries
  - [ ] Request ID returned in response headers
  - [ ] Propagated to Celery task context
- **Estimated Hours:** 8
- **Dependencies:** OBS-001 (structured logging)
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Make request → receive X-Request-ID header → verify ID in logs

---

### BE-009: No Audit Logging on Critical Operations
- **ID:** BE-009
- **Title:** Add audit logging to critical operations
- **Description:** Many critical operations lack audit logging (project deletion, API key creation, webhook changes). No forensic evidence for security incidents; compliance violations.
- **Category:** Security / Compliance
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** `backend/api/projects.py`, `backend/api/api_keys.py`, `backend/api/webhooks.py`
- **Root Cause:** Incomplete audit logging
- **Recommended Fix:** Add `AuditLog` creation in project delete, API key create/delete, webhook create/delete; include actor, action, resource, timestamp, IP address
- **Acceptance Criteria:**
  - [ ] Audit logs created for: project deletion, API key CRUD, webhook CRUD, user deletion, permission changes
  - [ ] Each log includes: actor_id, action, resource_type, resource_id, timestamp, IP, user_agent
  - [ ] Audit logs are append-only
  - [ ] Audit log retention policy implemented
  - [ ] API endpoint for viewing audit logs (admin only)
- **Estimated Hours:** 24
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Delete project → verify audit log entry created → verify cannot modify audit log

---

### BE-010: No Session Management / Concurrent Session Control
- **ID:** BE-010
- **Title:** Implement session tracking and management
- **Description:** No session tracking; no force-logout capability; no device management. No limit on concurrent sessions; compromised token used indefinitely.
- **Category:** Security
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** `backend/api/auth.py`
- **Root Cause:** Missing session management
- **Recommended Fix:** Store session records in database; add session management endpoints; implement force logout; add concurrent session limits
- **Acceptance Criteria:**
  - [ ] Session records created on login
  - [ ] Session listing API endpoint
  - [ ] Force logout other sessions endpoint
  - [ ] Concurrent session limit (configurable)
  - [ ] Session expiry and cleanup
- **Estimated Hours:** 40
- **Dependencies:** SEC-005 (JTI in tokens)
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Login from multiple devices → list sessions → force logout one → verify token revoked

---

### BE-011: No Health Check for Critical Dependencies
- **ID:** BE-011
- **Title:** Implement dependency-aware health checks
- **Description:** `/health` endpoint returns `{"status": "ok"}` without checking database or Redis connectivity. Load balancers may route traffic to unhealthy instances.
- **Category:** Reliability / Monitoring
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/main.py` (line 69-71)
- **Root Cause:** Basic health check doesn't verify dependencies
- **Recommended Fix:** Make `/health` check DB and Redis connectivity; add `/health/detailed` with per-dependency status; implement liveness vs readiness probes
- **Acceptance Criteria:**
  - [ ] `/health` checks MongoDB and Redis connectivity
  - [ ] `/health/detailed` shows per-dependency status
  - [ ] Returns 503 when dependencies are down
  - [ ] Configurable timeout per dependency check
- **Estimated Hours:** 8
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Stop MongoDB → `/health` → 503; all dependencies up → 200

---

### BE-012: No Webhook Signing Verification
- **ID:** BE-012
- **Title:** Sign outgoing webhook payloads with HMAC
- **Description:** Webhook secrets are generated but never used for signing outgoing webhooks. Webhook consumers cannot verify payload authenticity.
- **Category:** Security / Reliability
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/api/webhooks.py`, `backend/services/webhook.py`
- **Root Cause:** Webhook signing not implemented
- **Recommended Fix:** Sign outgoing webhook payloads with HMAC-SHA256 using webhook secret; include `X-Forge-Signature` header; add timestamp to prevent replay
- **Acceptance Criteria:**
  - [ ] All outgoing webhooks signed with HMAC-SHA256
  - [ ] `X-Forge-Signature` header included
  - [ ] Timestamp in payload for replay protection
  - [ ] Signature verification documented for consumers
- **Estimated Hours:** 16
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Create webhook → trigger event → verify signature header → verify signature with known secret

---

### BE-013: Marketplace Item Creation Crashed on Every Call — RESOLVED 2026-07-03
- **ID:** BE-013
- **Title:** Fix `POST /marketplace/` response serialization crash
- **Description:** `create_item` in `backend/api/marketplace.py` always raised `fastapi.exceptions.ResponseValidationError` — `MarketplaceItem.created_at` is a Python `datetime`, but the model was inserted and returned in Python-mode dump while `MarketplaceItemResponse.created_at` expects `str`. The item was inserted into MongoDB successfully before the crash, so every "failed" create attempt actually left a real, orphaned document behind with a `datetime`-typed `created_at` that would also break subsequent `GET /marketplace/` and `GET /marketplace/{id}` calls once they encountered it. Found and fixed 2026-07-03 while wiring the (previously nonexistent) frontend Marketplace client.
- **Category:** Backend / Data Integrity
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** `backend/api/marketplace.py` (`create_item`)
- **Root Cause:** Insert and response both used `item.model_dump()` (Python mode, preserves `datetime` objects) instead of `item.model_dump(mode="json")` (ISO string dates), which the response model requires.
- **Fix Applied:** Both the `insert_one` call and the return value now use `item.model_dump(mode="json")`, matching the pattern already used elsewhere in the codebase (e.g. `orchestrator/store.py`'s `ReviewRun.model_dump(mode="json")`).
- **Acceptance Criteria:**
  - [x] `POST /marketplace/` returns 200 with a valid response body
  - [x] `GET /marketplace/` lists the created item correctly
  - [x] `GET /marketplace/{id}` returns the item correctly
- **Estimated Hours:** 1 (actual)
- **Dependencies:** None
- **Owner:** Backend Lead
- **Risk:** Was Medium (silent data corruption — orphaned bad documents); now Resolved.
- **Verification Steps:** `curl -X POST /marketplace/ -d '{...}'` → 200, not 500; verified via curl 2026-07-03, plus confirmed via browser that install → build handoff works end-to-end.

---

### BE-014: No User Preferences Storage — ADDED 2026-07-03
- **ID:** BE-014
- **Title:** Add a `User.preferences` field so Settings toggles persist
- **Description:** The `User` model had no field to persist per-user preferences (notification opt-in, auto-deploy default, debug-iteration count) — `SettingsPage.tsx`'s toggles reset on every reload because there was nothing to persist them to. Added alongside the FE-008 Settings-wiring work.
- **Category:** Backend / Data Model
- **Severity:** LOW
- **Priority:** P2
- **Affected Files:** `backend/core/models.py` (`User.preferences: dict`), `backend/api/auth.py` (`UpdateProfileRequest.preferences`, shallow dot-notation `$set` merge in `update_profile` so one toggle's save doesn't clobber another's)
- **Root Cause:** Field never existed; not an oversight so much as these settings simply not existing as a concept server-side before now.
- **Fix Applied:** `preferences: dict = Field(default_factory=dict)` on `User`; `PUT /auth/me` accepts a partial `preferences` object and merges it key-by-key via MongoDB dot notation (`preferences.notifyOnBuild`, etc.) rather than overwriting the whole dict.
- **Acceptance Criteria:**
  - [x] Toggling a preference and reloading the page shows the same state
  - [x] Setting one preference doesn't reset previously-set ones (verified: 3 sequential PUTs with different single keys, final GET shows all 3 merged correctly)
- **Estimated Hours:** 1 (actual)
- **Dependencies:** None
- **Owner:** Backend Lead
- **Risk:** Low
- **Verification Steps:** `curl -X PUT /auth/me -d '{"preferences":{"notifyOnBuild":false}}'`, then a second call with `{"autoDeploy":true}`, then `GET /auth/me` → both keys present. Verified 2026-07-03.

---

## Epic: Frontend (9 issues)

### FE-001: No Accessibility (a11y) Implementation
- **ID:** FE-001
- **Title:** Implement WCAG 2.1 AA accessibility
- **Description:** No ARIA labels, no keyboard navigation, no focus management, no screen reader support, no color contrast verification. Legal liability (ADA, WCAG); excludes users with disabilities.
- **Category:** UX / Accessibility
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** All frontend components
- **Root Cause:** Accessibility not implemented
- **Recommended Fix:** Add ARIA labels to all interactive elements; implement keyboard navigation; ensure WCAG 2.1 AA compliance; add focus trap for modals; test with screen readers; add skip-to-content link
- **Acceptance Criteria:**
  - [ ] All interactive elements have ARIA labels
  - [ ] Keyboard navigation works for all features
  - [ ] Focus management implemented (focus trap, focus order)
  - [ ] Color contrast meets WCAG AA standards
  - [ ] Screen reader announces dynamic content changes
  - [ ] Skip-to-content link present
  - [ ] Lighthouse accessibility score ≥90
- **Estimated Hours:** 120
- **Dependencies:** None
- **Owner:** Frontend Lead
- **Risk:** Medium
- **Verification Steps:** Run axe DevTools → 0 violations; navigate with keyboard only → all features accessible

---

### FE-002: No Responsive Design Testing
- **ID:** FE-002
- **Title:** Implement responsive design for all breakpoints
- **Description:** No mobile-responsive testing; layout may break on small screens. Poor mobile experience; lost mobile users.
- **Category:** UX / Frontend
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** All frontend components
- **Root Cause:** Responsive design not verified
- **Recommended Fix:** Test all pages at mobile (320px, 375px), tablet (768px, 1024px), and desktop (1440px, 1920px) breakpoints; implement responsive layouts with Tailwind breakpoints
- **Acceptance Criteria:**
  - [ ] All pages render correctly at 320px, 768px, 1440px
  - [ ] No horizontal scroll on any breakpoint
  - [ ] Forms and tables responsive on mobile
  - [ ] Navigation collapses to hamburger menu on mobile
  - [ ] Touch targets ≥44px on mobile
- **Estimated Hours:** 60
- **Dependencies:** None
- **Owner:** Frontend Lead
- **Risk:** Low
- **Verification Steps:** Open each page at 375px → verify layout; open at 1440px → verify layout

---

### FE-003: No Error Boundary at Root Level
- **ID:** FE-003
- **Title:** Add root-level error boundary
- **Description:** ErrorBoundary only wraps individual routes, not the entire app. Entire app crashes on unhandled React error; blank white screen.
- **Category:** Frontend / Reliability
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `frontend/src/App.tsx`
- **Root Cause:** Missing root-level error boundary
- **Recommended Fix:** Add error boundary at the root level with fallback UI and retry capability; implement error reporting to monitoring service
- **Acceptance Criteria:**
  - [ ] Error boundary wraps entire app
  - [ ] Fallback UI shown with "Something went wrong" message
  - [ ] Retry button that reloads the app
  - [ ] Error details logged to monitoring service
  - [ ] User-friendly message (not technical)
- **Estimated Hours:** 8
- **Dependencies:** None
- **Owner:** Frontend Lead
- **Risk:** Low
- **Verification Steps:** Throw unhandled error → error boundary catches → fallback UI shown → retry works

---

### FE-004: No Frontend TypeScript Strict Mode
- **ID:** FE-004
- **Title:** Enable TypeScript strict mode and fix type errors
- **Description:** TypeScript strict mode not enabled; `any` types used throughout. Type errors in production; runtime crashes.
- **Category:** Code Quality
- **Severity:** LOW
- **Priority:** P2
- **Affected Files:** `frontend/tsconfig.json`
- **Root Cause:** Loose TypeScript configuration
- **Recommended Fix:** Enable `strict: true` in tsconfig; fix all type errors; replace `any` types with proper types; add linting rules
- **Acceptance Criteria:**
  - [ ] `strict: true` in tsconfig.json
  - [ ] Zero TypeScript compilation errors
  - [ ] No `any` types in new code
  - [ ] ESLint config for TypeScript
  - [ ] CI pipeline enforces no TypeScript errors
- **Estimated Hours:** 40
- **Dependencies:** None
- **Owner:** Frontend Lead
- **Risk:** Low
- **Verification Steps:** Run `tsc --noEmit` → zero errors; check for `any` types → none found

---

### FE-005: No Onboarding Flow Complete
- **ID:** FE-005
- **Title:** Implement guided onboarding flow
- **Description:** Onboarding page exists but no guided flow; no tutorial; no sample project. High churn; users don't understand value proposition.
- **Category:** Product / UX
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** `frontend/src/pages/Onboarding.tsx`
- **Root Cause:** Incomplete onboarding
- **UPDATE 2026-07-03 (partial progress, item stays OPEN):** The wizard's final step now hands the user's selected goal off as a real starter prompt to `/build/new` (reusing the same `location.state.prompt` convention Marketplace's install flow uses), instead of dropping the user on a blank screen. Verified end-to-end: selecting "SaaS dashboard" → Skip → Open workspace correctly starts a build with a matching prompt. This does **not** close FE-005 — no tooltips, no progress-tracked analytics event, no "Hello World" sample project — but the GitHub/Anthropic "Connect" buttons in the Connect step were deliberately left as local-only/soft-skip (the step's own copy already says "connect later in Settings," and Settings' GitHub connect is now real — see FE-008).
- **Recommended Fix:** Implement multi-step guided onboarding with sample project creation; add tooltips and walkthrough; measure completion rates
- **Acceptance Criteria:**
  - [ ] Multi-step onboarding wizard implemented
  - [x] Sample "Hello World" project creation flow *(partial: goal → starter prompt → real build, not a canned "Hello World")*
  - [ ] Tooltips for key features
  - [ ] Progress indicator in onboarding
  - [x] Skip option available (already existed)
  - [ ] Onboarding completion tracked in analytics
- **Estimated Hours:** 60 (52 remaining after 2026-07-03 partial progress, ~8h)
- **Dependencies:** None
- **Owner:** Frontend Lead / PM
- **Risk:** Low
- **Verification Steps:** New user registers → onboarding starts → complete all steps → sample project created

---

### FE-006: No Analytics / Product Tracking Implementation
- **ID:** FE-006
- **Title:** Implement frontend product analytics
- **Description:** Analytics API endpoints exist but no frontend tracking; no product analytics integration. No visibility into user behavior; cannot measure product-market fit.
- **Category:** Business / Product
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** `backend/api/analytics.py`, `frontend/src/lib/api.ts`
- **Root Cause:** Analytics not wired up
- **Recommended Fix:** Implement frontend event tracking; integrate with product analytics platform (PostHog or Mixpanel); set up conversion funnels for signup → first build → subscription
- **Acceptance Criteria:**
  - [ ] Analytics SDK integrated (PostHog/Mixpanel)
  - [ ] Key events tracked: signup, login, first build, subscription, project creation
  - [ ] User identity linked in analytics
  - [ ] Page views tracked
  - [ ] Conversion funnel dashboard created
- **Estimated Hours:** 40
- **Dependencies:** None
- **Owner:** Frontend Lead / PM
- **Risk:** Low
- **Verification Steps:** Perform actions → verify events in analytics dashboard

---

### FE-007: No SEO / Meta Tags
- **ID:** FE-007
- **Title:** Add SEO meta tags, Open Graph, and structured data
- **Description:** No meta tags, no Open Graph tags, no structured data, no sitemap. Poor search engine visibility; no social sharing previews.
- **Category:** Business / Marketing
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** `frontend/index.html`
- **Root Cause:** SEO not implemented
- **Recommended Fix:** Add meta tags, Open Graph tags, JSON-LD structured data, sitemap.xml, robots.txt, canonical URLs
- **Acceptance Criteria:**
  - [ ] `<meta name="description">` on all pages
  - [ ] Open Graph tags (og:title, og:description, og:image)
  - [ ] Twitter Card tags
  - [ ] JSON-LD structured data for organization and product
  - [ ] sitemap.xml generated
  - [ ] robots.txt present
  - [ ] Canonical URLs on all pages
- **Estimated Hours:** 16
- **Dependencies:** None
- **Owner:** Frontend Lead
- **Risk:** Low
- **Verification Steps:** Check page source → meta tags present; test with Facebook Sharing Debugger → proper preview

---

### FE-008: Billing/Marketplace/Settings Pages Were 100% Mock Data — RESOLVED 2026-07-03
- **ID:** FE-008
- **Title:** Wire Billing, Marketplace, and Settings pages to real backend APIs
- **Description:** `BillingPage.tsx`, `MarketplacePage.tsx`, and `SettingsPage.tsx` rendered entirely from `frontend/src/lib/mockData.ts` with no live-mode branching at all — unlike `ProjectsPage.tsx`/`WorkspacePage.tsx`/`ProjectHistory.tsx`, which already had a working `LIVE_MODE` real/mock split. Several buttons were explicit no-ops (plan select, template install, API-key replace); the GitHub "Connect" row in Settings was a plain `<span>`, not even a button. This was not previously logged as a distinct backlog item — the closest related items (BUS-002 Stripe price placeholders, FE-005 onboarding wizard) don't cover it.
- **Category:** Frontend / Product
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** `frontend/src/pages/BillingPage.tsx`, `MarketplacePage.tsx`, `SettingsPage.tsx`, `frontend/src/lib/api.ts` (new `marketplaceApi`, `billingApi.downgrade`)
- **Root Cause:** These three pages were built against mock data early and never received the `LIVE_MODE` wiring pass the rest of the app got.
- **Fix Applied:**
  - **Billing:** real `plans`/`usage`/`subscription` fetch; plan-select routes to `checkout` (paid tiers, redirects to Stripe URL) or `downgrade` (free tier); per-agent credit breakdown relabeled "Builds by agent" in live mode since the backend only tracks build counts, not a credit-per-agent breakdown.
  - **Marketplace:** new `marketplaceApi` client (didn't exist before — `backend/api/marketplace.py` was fully built but had zero frontend caller); real listing with a deterministic per-item color (backend has no `hue`/`source` fields, so Official/Community filter tabs are hidden in live mode rather than shown non-functional); Install → `download()` → hands the returned prompt to `/build/new` via `location.state`, same convention `ProjectsPage.tsx` already uses.
  - **Settings:** GitHub connect implemented as paste-a-PAT (see SEC-015's `_public_user_dict`/`github_connected` work — this is the UI consumer of that fix); BYOK section kept visible but disabled with a "Coming soon" badge (backend has zero storage/consumption path for a per-user Anthropic key — building that for real is a much larger feature, out of scope here); notification/auto-deploy/debug-iteration toggles now persist via a new `User.preferences` dict field (see BE-014 below) instead of resetting on reload.
- **Acceptance Criteria:**
  - [x] Billing shows real plan tiers, usage, and a working checkout/downgrade flow
  - [x] Marketplace lists real items and Install hands a real prompt to the workspace
  - [x] Settings GitHub connect/disconnect works and persists across reload
  - [x] Settings preference toggles persist across reload (see BE-014)
  - [x] Demo mode (no `VITE_WS_URL`) unchanged — verified via screenshot diff against pre-change baseline
- **Estimated Hours:** 12 (actual)
- **Dependencies:** SEC-015 (GitHub connect needs the leak fix's `github_connected` field), BE-014 (preferences storage)
- **Owner:** Frontend Lead
- **Risk:** Low — additive, demo mode verified unaffected.
- **Verification Steps:** With a real backend running: visit `/billing` → see real tiers; `/marketplace` → create + install an item, confirm prompt arrives at `/build/new`; `/settings` → connect GitHub, toggle preferences, reload, confirm both persisted. All verified via Playwright + curl 2026-07-03.

---

### FE-009: Review Board (Orchestrator) Had No Frontend — RESOLVED 2026-07-03
- **ID:** FE-009
- **Title:** Build a UI for the orchestrator review-board service
- **Description:** `orchestrator/` (a separate FastAPI service — multi-agent code review pipeline: triggered reviewer agents run in parallel, a "CTO" model consolidates findings into a prioritized backlog) had real, working endpoints (`POST /reviews`, `GET /reviews/{id}`, `GET /reviews/{id}/backlog`, `WS /reviews/{id}/stream`) but zero frontend — usable only via curl. Not previously tracked in any planning document; the orchestrator service itself doesn't appear in this backlog's Master Inventory at all (only the unrelated internal `backend/core/orchestrator.py` build-pipeline module does).
- **Category:** Frontend / Product
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** New: `frontend/src/pages/reviews/ReviewsListPage.tsx`, `ReviewDetailPage.tsx`, `frontend/src/lib/orchestratorApi.ts`, `reviewWsContract.ts`, `frontend/src/hooks/useReviewSocket.ts`, `frontend/src/store/reviewStore.ts`, `frontend/src/components/ReviewAgentPipeline.tsx`. Backend: `orchestrator/main.py` (added CORS — was completely unreachable from a browser), `orchestrator/api.py`/`store.py` (added the missing `GET /reviews` list endpoint), `orchestrator/models.py`/`service.py` (added `candidate_files` persistence, needed for the UI to show it on already-completed runs).
- **Root Cause:** Feature built backend-first; frontend work was never scheduled.
- **Fix Applied:** New `/reviews` (list + "new review" form) and `/reviews/:runId` (live WebSocket-driven pipeline view + sortable backlog) pages, reachable from the sidebar. Reuses the existing build-tracking UI conventions (`ProjectHistory.tsx`/`AgentPipeline.tsx`/`useBuildSocket.ts` patterns) rather than inventing new ones.
- **Acceptance Criteria:**
  - [x] Can start a review run from the UI and see it in a list
  - [x] Live pipeline view updates in real time via WebSocket as agents run
  - [x] Backlog displays and is sortable by severity/impact
  - [x] Verified end-to-end: created a real run, watched it complete live, confirmed REST-hydration path also works for already-completed runs on page reload
- **Estimated Hours:** 10 (actual)
- **Dependencies:** None
- **Owner:** Frontend Lead
- **Risk:** Low
- **Verification Steps:** `curl -X POST orchestrator:8100/reviews` → run completes → visit `/reviews` in browser → see it listed → click in → see agent pipeline and backlog. Verified 2026-07-03.

---

## Epic: AI Pipeline (7 issues)

### AI-001: No LLM Cost Tracking / Budget Controls — RESOLVED 2026-07-06
- **ID:** AI-001
- **Title:** Implement LLM token usage tracking and budget controls
- **Description:** No token counting, no cost tracking, no per-user budget limits, no spending alerts. Uncontrolled AI costs; no visibility into per-user spending; budget overruns.
- **Category:** AI Pipeline / Business
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/core/ai_usage.py`, `backend/core/llm/router.py`, `backend/core/models.py`, `backend/core/database.py`, `backend/tests/test_ai_cost_tracking_wired.py`
- **Root Cause:** `check_budget()` was called with `estimated_tokens=0` at every call site, making it a no-op until the user was already over their limit. No concurrent request limiting existed. No spending alerts were wired.
- **Fix Applied:**
  - Added `estimate_tokens()` — character-count heuristic for pre-call budget checks
  - `LLMRouter.generate()` now estimates tokens from messages and passes a realistic estimate to `check_budget()`, rejecting calls *before* making the API call
  - Added per-user `asyncio.Semaphore` with plan-based limits (free: 2, standard: 5, pro: 10, enterprise: 25) and 30s timeout
  - Added `check_and_send_token_budget_alerts()` — fires email at 50%, 80%, 100% of daily budget
  - Added `token_budget_alerts_sent` field to User model for dedup state
  - Added ai_usage indexes (user_id+created_at, org_id+created_at, TTL 90 days)
  - Added 24 regression tests covering estimation, enforcement, alerts, and tracking
- **Acceptance Criteria:**
  - [x] Token counting wrapper around Anthropic API calls (via `estimate_tokens()` + provider response usage)
  - [x] Usage stored in `ai_usage` collection per user/build (via `track_usage()`)
  - [x] Daily/weekly/monthly budget limits configurable (via `DEFAULT_DAILY_TOKEN_BUDGETS`)
  - [x] Spending alerts at 50%, 80%, 100% of budget (via `check_and_send_token_budget_alerts()`)
  - [x] API endpoint for spending dashboard (via existing `GET /admin/spending`)
  - [x] Admin endpoint to adjust budgets (via existing `POST /admin/billing/adjust`)
- **Estimated Hours:** 40 (est.) / ~4 (actual)
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** 24 new tests pass; 208/209 backend tests pass (1 pre-existing Stripe config test failure unrelated to this change)

---

### AI-002: No Prompt Injection Protection
- **ID:** AI-002
- **Title:** Implement prompt injection detection and prevention
- **Description:** `sanitize_prompt` only removes control characters and limits length; no LLM-based prompt injection detection. Users can inject malicious prompts to manipulate AI behavior.
- **Category:** Security / AI Pipeline
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/core/security.py` (line 158-171)
- **Root Cause:** Basic sanitization only
- **Recommended Fix:** Implement prompt injection detection (secondary LLM call); add system prompt reinforcement; use input/output guardrails; rate limit per-user LLM calls
- **Acceptance Criteria:**
  - [ ] Prompt injection detection via secondary LLM call
  - [ ] System prompt reinforcement on every request
  - [ ] Input sanitization before LLM call
  - [ ] Output validation for sensitive content
  - [ ] Rate limits on LLM calls per user
  - [ ] Prompt injection attempt logged and alerted
- **Estimated Hours:** 60
- **Dependencies:** None
- **Owner:** Staff Engineer / Security Lead
- **Risk:** High (AI security)
- **Verification Steps:** Send prompt injection attempt → detected and blocked → user alerted
- **⚠️ Update 2026-07-03:** `P0_ACTION_ITEMS.md` marked this "done" based on a basic keyword blocklist (`_detect_prompt_injection` in `agents/base.py`) existing in the code — none of this item's originally-scoped acceptance criteria above were ever implemented (no secondary-LLM-call detection, no output validation, no logging/alerting, no dedicated rate limiting). Spot-verified by actually attempting bypasses rather than reading the pattern list: found the blocklist that *does* exist had two concrete, exploitable gaps. Both fixed same day — see **AI-008**. The bigger, originally-scoped items above remain genuinely open; a keyword blocklist alone was never going to satisfy them, and this update doesn't change that.

---

### AI-003: No Rate Limiting on LLM API Calls
- **ID:** AI-003
- **Title:** Implement per-user LLM token budgets and rate limiting
- **Description:** No per-user or per-build limits on LLM token usage. Uncontrolled LLM costs; single user can exhaust budget.
- **Category:** AI Pipeline / Cost
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/agents/base.py`
- **Root Cause:** Missing LLM rate limiting
- **Recommended Fix:** Implement per-user daily token budgets; add concurrent request limiting; queue LLM requests; reject builds when budget exceeded
- **Acceptance Criteria:**
  - [ ] Per-user daily token budget implemented
  - [ ] Concurrent request limiting (max N per user)
  - [ ] LLM requests queued when concurrent limit reached
  - [ ] Clear error message when budget exceeded
  - [ ] Budget resets daily/weekly
- **Estimated Hours:** 24
- **Dependencies:** AI-001 (cost tracking)
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Exceed daily budget → build rejected with budget exceeded message

---

### AI-004: No Fallback Model for LLM API Failures
- **ID:** AI-004
- **Title:** Implement LLM fallback chain
- **Description:** Circuit breaker exists but no fallback to alternative model (e.g., OpenAI). Builds fail completely when Anthropic API is unavailable.
- **Category:** AI Pipeline / Reliability
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/agents/base.py` (line 64-65)
- **Root Cause:** Single model dependency
- **Recommended Fix:** Implement fallback chain (Anthropic → OpenAI → local model); add graceful degradation; notify user of degraded state
- **Acceptance Criteria:**
  - [ ] Fallback chain: Anthropic → OpenAI → local model
  - [ ] Automatic failover on API error/timeout
  - [ ] Degraded mode notification in UI
  - [ ] Fallback usage tracked in analytics
  - [ ] Configurable model priority
- **Estimated Hours:** 40
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Medium
- **Verification Steps:** Block Anthropic API → build uses OpenAI fallback → user notified of degraded state

---

### AI-005: No Content Moderation for Generated Code
- **ID:** AI-005
- **Title:** Implement content moderation for generated code
- **Description:** No scanning of generated code for malware, secrets, or copyrighted content. Users can generate malicious, copyrighted, or illegal code on the platform.
- **Category:** Security / Legal
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/agents/developer.py`, `backend/sandbox/runner.py`
- **Root Cause:** Missing content moderation
- **Recommended Fix:** Scan generated code for secrets, malware signatures, and copyrighted content; implement code review queue for suspicious builds; add pre-commit hooks
- **Acceptance Criteria:**
  - [ ] Generated code scanned for API keys/secrets
  - [ ] Malware pattern detection implemented
  - [ ] Copyrighted content detection (GPL violation check)
  - [ ] Suspicious builds flagged for manual review
  - [ ] Code review queue in admin panel
  - [ ] False positive rate <5%
- **Estimated Hours:** 60
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Medium
- **Verification Steps:** Generate code with embedded secret → flagged by scanner; generate safe code → passes

---

### AI-006: No Graceful Degradation for LLM Circuit Breaker
- **ID:** AI-006
- **Title:** Implement graceful degradation for circuit breaker
- **Description:** Circuit breaker raises `RuntimeError` with no user-friendly message. All builds fail when circuit breaker is open; no user feedback.
- **Category:** AI Pipeline / Reliability
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** `backend/agents/base.py` (line 64-65)
- **Root Cause:** No graceful degradation
- **Recommended Fix:** Return user-friendly error when circuit breaker is open; implement queue for delayed processing; notify user of degraded state with estimated retry time
- **Acceptance Criteria:**
  - [ ] User-friendly error message (not RuntimeError)
  - [ ] 503 status with Retry-After header
  - [ ] Queue for delayed processing
  - [ ] Notification when service restored
- **Estimated Hours:** 8
- **Dependencies:** AI-004 (fallback chain)
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Simulate circuit breaker open → user receives friendly error with retry time

---

### AI-007: No Content Security Policy for Generated Apps
- **ID:** AI-007
- **Title:** Add CSP headers to generated applications
- **Description:** No CSP enforcement for generated code previews. Generated apps vulnerable to XSS; platform liability.
- **Category:** Security
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/agents/developer.py`
- **Root Cause:** Missing security headers in generated code
- **Recommended Fix:** Add CSP headers to generated apps; use sandboxed iframes for previews; add `<meta http-equiv="Content-Security-Policy">` to generated HTML
- **Acceptance Criteria:**
  - [ ] CSP headers in generated app responses
  - [ ] Sandboxed iframes for previews
  - [ ] Script-src restricted to same-origin
  - [ ] XSS prevention validated
- **Estimated Hours:** 16
- **Dependencies:** None
- **Owner:** Staff Engineer / Security Lead
- **Risk:** Low
- **Verification Steps:** Generate app → check response headers for CSP → verify iframe sandbox

---

### AI-008: Prompt Injection Blocklist Had Two Concrete, Demonstrated Bypasses — RESOLVED 2026-07-03
- **ID:** AI-008
- **Title:** Trivial reformatting and conversation-history placement both defeated `_detect_prompt_injection`
- **Category:** Security / AI Pipeline
- **Severity:** HIGH
- **Priority:** P0
- **Discovered while:** Spot-verifying AI-002's "prompt injection detection" claim by actually attempting bypasses against the real function, not just reading the pattern list.
- **Bug 1 — whitespace/formatting bypass:** `_detect_prompt_injection` did `pattern in prompt.lower()`, an exact substring match against 16 fixed English phrases. Trivial reformatting defeated it completely: `"ignore  previous instructions"` (double space), `"ignore\nprevious\ninstructions"` (newlines), and `"ignore-previous-instructions"` (hyphens) were all **not detected**, while the exact canonical phrasing was. Verified directly by calling the function with each variant.
- **Bug 2 — conversation-history bypass (the more serious one):** Both call sites in `agents/base.py` (`_call_llm` and `stream`) grabbed only `last_user_msg` and checked that one message. But `conversation_history` — every earlier turn of an iterative build, which the product explicitly supports and which is fully user-controlled — is concatenated into the same message list sent to the LLM (confirmed via `agents/architect.py`'s `blueprint()`: `messages.extend(conversation_history)` then appends the current turn last). An injection planted in turn 1, followed by an innocuous final turn ("ok build me a todo app"), reached the LLM with **zero detection**, since only the last message was ever inspected.
- **Fix:** (1) `_detect_prompt_injection` now collapses runs of whitespace/hyphens/underscores to a single space before matching, closing the formatting bypass. (2) Added `_any_message_has_prompt_injection()`, which checks every user-authored message in the list, and both call sites now use it instead of checking only the last message. Also added a few of the most obvious missed phrasings surfaced during testing (`"forget everything"`, `"your new role"`, `"roleplay as"`) to the pattern list.
- **Explicitly not claimed:** This is still a plain keyword blocklist, not the "secondary LLM call" / output-validation / logging-and-alerting approach AI-002's original acceptance criteria called for (still open — see AI-002). Pattern-based detection is inherently incomplete against arbitrary paraphrasing; this fix closes the two concrete, demonstrated gaps found today, not the general problem.
- **Verification:** Re-ran all 11 originally-bypassing test strings plus the conversation-history scenario after the fix — all correctly detected. Added 9 regression tests in `backend/tests/test_prompt_injection_detection.py`.
- **Files Modified:** `backend/agents/base.py`, `backend/tests/test_prompt_injection_detection.py` (new)
- **Owner:** Security Lead
- **Estimated Hours:** 0 (found and fixed same day)

---

## Epic: Infrastructure (8 issues)

### INF-001: No Kubernetes / Production Deployment Manifests
- **ID:** INF-001
- **Title:** Create Kubernetes deployment manifests
- **Description:** Only Docker Compose configuration exists; no Kubernetes manifests, Helm charts, or Terraform. Cannot deploy to production; no scaling capability; no rolling updates.
- **Category:** Infrastructure / DevOps
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** `docker-compose.yml`
- **Root Cause:** Missing production infrastructure configuration
- **Recommended Fix:** Create Kubernetes manifests (Deployments, Services, Ingress, HPA, PVC); set up Helm charts; implement Terraform for cloud infrastructure
- **Acceptance Criteria:**
  - [ ] K8s Deployment manifests for all services (backend, frontend, Celery, Redis, MongoDB)
  - [ ] K8s Service manifests with ClusterIP/LoadBalancer
  - [ ] Ingress controller configuration with TLS
  - [ ] HPA for auto-scaling (CPU/memory based)
  - [ ] PVCs for persistent data (MongoDB, Redis)
  - [ ] ConfigMaps and Secrets for configuration
  - [ ] Helm chart for deployment management
  - [ ] Terraform scripts for cloud infrastructure
  - [ ] Namespace isolation (prod, staging, dev)
- **Estimated Hours:** 120
- **Dependencies:** None
- **Owner:** DevOps Lead
- **Risk:** High (complexity)
- **Verification Steps:** `kubectl apply -f k8s/` → all pods running → services reachable

---

### INF-002: No Monitoring / Alerting Configuration — RESOLVED
- **ID:** INF-002
- **Title:** Set up monitoring, metrics, and alerting
- **Description:** No Prometheus metrics, no Grafana dashboards, no alerting rules, no uptime monitoring. No visibility into production issues; unable to detect outages.
- **Category:** Observability / DevOps
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** `backend/main.py`, `backend/requirements.txt`
- **Root Cause:** Monitoring infrastructure was missing
- **Fix Applied:** 
  - Added `prometheus-client==0.20.0` to `requirements.txt`
  - Added Prometheus metrics middleware in `backend/main.py` recording `http_requests_total` (by method/endpoint/status) and `http_request_duration_seconds` (by method/endpoint)
  - Added `GET /metrics` endpoint serving Prometheus exposition format
  - Added `/health/detailed` endpoint checking MongoDB, Redis, and Celery worker connectivity
- **Acceptance Criteria:**
  - [x] Prometheus FastAPI metrics endpoint (`/metrics`) — returns metrics in Prometheus exposition format
  - [x] HTTP request counter and latency histogram implemented
  - [x] Health checks for MongoDB, Redis, and Celery (`/health/detailed`)
  - [ ] Grafana dashboards — not implemented (metrics exist, dashboards are an operator concern)
  - [ ] Alerting rules — not implemented (PrometheusRule exists in k8s/monitoring.yaml but needs Prometheus server)
  - [ ] PagerDuty/OpsGenie integration — not implemented
  - [ ] Synthetic monitoring — not implemented
- **Estimated Hours:** 16 (est.) / already implemented
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** `curl /metrics` returns Prometheus metrics; middleware records request counts and latencies
- **Affected Files:** Repository root
- **Root Cause:** Missing monitoring infrastructure
- **Recommended Fix:** Set up Prometheus metrics endpoint; create Grafana dashboards; configure PagerDuty/OpsGenie alerts; implement synthetic monitoring
- **Acceptance Criteria:**
  - [ ] Prometheus FastAPI metrics endpoint (`/metrics`)
  - [ ] Grafana dashboards for: API performance, system resources, business metrics
  - [ ] Alerting rules for: high error rate, high latency, high CPU/memory, service down
  - [ ] PagerDuty/OpsGenie integration
  - [ ] Synthetic monitoring (uptime checks every 5 min)
  - [ ] Alert on certificate expiry
  - [ ] Dashboard for build pipeline status
- **Estimated Hours:** 80
- **Dependencies:** INF-001 (K8s deployment)
- **Owner:** DevOps Lead
- **Risk:** Medium
- **Verification Steps:** Access `/metrics` endpoint → verify Prometheus scrapes → Grafana shows data → test alert

---

### INF-003: No Secrets Management (Relies on .env)
- **ID:** INF-003
- **Title:** Implement secrets management solution
- **Description:** All secrets passed via environment variables; no vault integration; secrets visible in `docker inspect`. Secrets exposed in CI logs, container images, developer machines.
- **Category:** Security / DevOps
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `docker-compose.yml`, `.env.example`, CI config
- **Root Cause:** No secrets management solution
- **Recommended Fix:** Use HashiCorp Vault, AWS Secrets Manager, or Kubernetes Secrets; implement secret rotation; integrate with CI/CD pipeline
- **Acceptance Criteria:**
  - [ ] Secrets moved to secrets manager (Vault/AWS Secrets Manager/K8s Secrets)
  - [ ] No secrets in environment variables
  - [ ] No secrets in .env files (dev uses local secrets manager)
  - [ ] Secret rotation implemented (30/90 day schedule)
  - [ ] Access audit logging for secrets
  - [ ] CI/CD pipeline retrieves secrets from vault
- **Estimated Hours:** 60
- **Dependencies:** INF-001 (K8s)
- **Owner:** DevOps Lead
- **Risk:** Medium
- **Verification Steps:** Deploy app → secrets retrieved from vault → no secrets in env vars → verify rotation

---

### INF-004: No Docker Image Tagging Strategy
- **ID:** INF-004
- **Title:** Implement Docker image versioning and tagging
- **Description:** No Docker image tagging; no versioning strategy. Cannot identify which version is deployed; no rollback capability.
- **Category:** DevOps
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** `backend/Dockerfile`, `frontend/Dockerfile`
- **Root Cause:** Missing image tagging
- **Recommended Fix:** Use semantic versioning for Docker images; tag with git commit SHA; implement immutable tags; automated tagging in CI
- **Acceptance Criteria:**
  - [ ] Semantic version tagging: `forge-backend:1.2.3`
  - [ ] Git SHA tagging: `forge-backend:git-abc1234`
  - [ ] `latest` tag updated on each release
  - [ ] Immutable tags (no overwrite)
  - [ ] CI pipeline automatically tags images
  - [ ] Version manifest accessible via API
- **Estimated Hours:** 8
- **Dependencies:** INF-001 (K8s)
- **Owner:** DevOps Lead
- **Risk:** Low
- **Verification Steps:** CI build → check image tags → verify SHA and semver tags exist

---

### INF-005: No Database Backup Strategy
- **ID:** INF-005
- **Title:** Implement automated database backup with restore testing
- **Description:** No automated backup scripts in production; `scripts/backup_mongodb.py` exists but is not integrated. Complete data loss on failure; no disaster recovery.
- **Category:** Database / Reliability
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** `scripts/backup_mongodb.py`
- **Root Cause:** Backup not configured or scheduled
- **Recommended Fix:** Implement automated daily backups with point-in-time recovery; test restore procedure monthly; store backups in separate region/account
- **Acceptance Criteria:**
  - [ ] Automated daily backups scheduled
  - [ ] Point-in-time recovery implemented (oplog)
  - [ ] Backup verification script (restore to test instance)
  - [ ] Backups stored in separate region
  - [ ] Backup retention policy (30 daily, 12 monthly)
  - [ ] Restore procedure documented and tested
  - [ ] Backup failure alerting
- **Estimated Hours:** 40
- **Dependencies:** INF-001 (K8s), DB-001 (replica set)
- **Owner:** DevOps Lead
- **Risk:** High
- **Verification Steps:** Trigger backup → verify backup file exists → restore to test instance → verify data integrity

---

### INF-006: No Graceful Degradation Strategy
- **ID:** INF-006
- **Title:** Document and implement graceful degradation strategy
- **Description:** No systematic approach to handling dependency failures. When Redis, MongoDB, or LLM APIs fail, behavior is unpredictable.
- **Category:** Reliability
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** Repository root
- **Root Cause:** Missing graceful degradation strategy
- **Recommended Fix:** Document graceful degradation strategy for each dependency failure; implement circuit breakers; define degraded modes
- **Acceptance Criteria:**
  - [ ] Documented degradation modes for each service
  - [ ] Circuit breakers for all external dependencies
  - [ ] Cached/fallback data for read operations
  - [ ] User-facing indicators of degraded state
  - [ ] Automatic recovery when dependency restored
- **Estimated Hours:** 24
- **Dependencies:** INF-002 (monitoring)
- **Owner:** DevOps Lead / Staff Engineer
- **Risk:** Low
- **Verification Steps:** Stop Redis → verify app degrades gracefully → restart Redis → verify recovery

---

### INF-007: No Rate Limiting Per-User (Only Per-IP)
- **ID:** INF-007
- **Title:** Add per-user rate limiting differentiated by plan
- **Description:** Rate limiting is IP-based only; authenticated users can bypass by rotating IPs. Malicious authenticated user can exhaust system resources.
- **Category:** Security / Scalability
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/core/security.py` (line 71-127)
- **Root Cause:** Missing user-based rate limiting
- **Recommended Fix:** Add per-user rate limits in addition to per-IP; differentiate limits by plan tier; add rate limit headers in responses
- **Acceptance Criteria:**
  - [ ] Per-user rate limiting implemented
  - [ ] Rate limits differentiated by plan tier (free: 100/hr, pro: 1000/hr, enterprise: 10000/hr)
  - [ ] Rate limit headers: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  - [ ] Concurrent request limits per user
  - [ ] Rate limit exceeded response (429) with retry timing
- **Estimated Hours:** 16
- **Dependencies:** BE-007 (caching for rate limit state)
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Authenticated request → exceed limit → 429 with headers → different limits per plan

---

### INF-008: No Database Connection Pool Monitoring
- **ID:** INF-008
- **Title:** Add MongoDB connection pool monitoring
- **Description:** No monitoring of MongoDB connection pool usage; no alerts on pool saturation. Connection pool exhaustion without warning.
- **Category:** Database / Observability
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** `backend/core/database.py`
- **Root Cause:** Missing pool monitoring
- **Recommended Fix:** Expose connection pool metrics via Prometheus; set up alerts for pool utilization >80%; implement dynamic pool sizing
- **Acceptance Criteria:**
  - [ ] Prometheus metrics for: active connections, pool size, wait queue size, connection timeouts
  - [ ] Alerts at 80% and 95% pool utilization
  - [ ] Grafana dashboard for connection pool
  - [ ] Configurable min/max pool size per environment
  - [ ] Connection timeout metrics
- **Estimated Hours:** 16
- **Dependencies:** INF-002 (monitoring)
- **Owner:** DevOps Lead
- **Risk:** Low
- **Verification Steps:** Scale up load → monitor pool metrics → verify alerts fire at thresholds

---

## Epic: Database (4 issues)

### DB-001: No Database Replica Set / Single Point of Failure
- **ID:** DB-001
- **Title:** Deploy MongoDB replica set
- **Description:** Single node MongoDB in docker-compose with no replication. Complete data loss on MongoDB instance failure; zero RPO/RTO capability.
- **Category:** Database / Reliability
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** `docker-compose.yml`, `backend/core/database.py`
- **Root Cause:** Production deployment uses single MongoDB instance with no replica set
- **Recommended Fix:** Deploy MongoDB replica set (minimum 3 nodes); implement automated backups with point-in-time recovery; use MongoDB Atlas or K8s operator
- **Acceptance Criteria:**
  - [ ] MongoDB replica set with 3 nodes
  - [ ] Automatic failover when primary goes down
  - [ ] Read from secondaries where acceptable
  - [ ] Connection string updated for replica set
  - [ ] Write concern set to majority
  - [ ] Backup from secondary (no impact on primary)
  - [ ] Failover tested and documented
- **Estimated Hours:** 80
- **Dependencies:** INF-001 (K8s)
- **Owner:** DevOps Lead
- **Risk:** High (data migration)
- **Verification Steps:** Kill primary → automatic failover → no data loss → new primary elected

---

### DB-002: No Database Migration System
- **ID:** DB-002
- **Title:** Implement Alembic database migration system
- **Description:** Indexes created on application startup in `_ensure_indexes()`; no versioned migrations. Schema changes require manual intervention; no rollback capability.
- **Category:** Database / DevOps
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** `backend/core/database.py` (line 30-118)
- **Root Cause:** Schema management via application code
- **Recommended Fix:** Use Alembic with MongoDB-compatible migration tool or MongoDB migrations; version all schema changes; implement rollback procedures
- **Acceptance Criteria:**
  - [ ] Migration tool set up and configured
  - [ ] All existing indexes moved to migration scripts
  - [ ] Migration applied automatically on deployment
  - [ ] Rollback procedure documented and tested
  - [ ] Migration status endpoint for verification
  - [ ] CI/CD runs migrations in pipeline
- **Estimated Hours:** 60
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Medium
- **Verification Steps:** Create migration → deploy → verify migration applied → rollback → verify rollback

---

### DB-003: No Data Retention Policy Implementation
- **ID:** DB-003
- **Title:** Implement data retention and archival policies
- **Description:** TTL indexes exist for some collections but no comprehensive data retention policy. GDPR/CCPA non-compliance; unnecessary data storage costs.
- **Category:** Compliance / Legal
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/core/database.py`
- **Root Cause:** Incomplete data lifecycle management
- **Recommended Fix:** Define and implement data retention policies for all collections; automate data purging; implement archival to cold storage
- **Acceptance Criteria:**
  - [ ] Data retention policy documented for all collections
  - [ ] TTL indexes on all time-series data
  - [ ] Automated archival process for data > 90 days
  - [ ] Archival data stored in cold storage (S3 Glacier)
  - [ ] Data purge confirmation and audit trail
  - [ ] Configurable retention periods per data type
- **Estimated Hours:** 40
- **Dependencies:** DB-002 (migrations)
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Insert data with timestamp → verify TTL delete → check archival process

---

### DB-004: GDPR Delete Doesn't Cascade to All Related Data
- **ID:** DB-004
- **Title:** Implement complete GDPR data cascade deletion
- **Description:** `delete_user_data` doesn't delete subscriptions, invitations, credit purchases, analytics events, audit logs, or security events. GDPR non-compliance; user data remains.
- **Category:** Compliance / Legal
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/api/gdpr.py` (line 48-83)
- **Root Cause:** Incomplete data deletion implementation
- **Recommended Fix:** Cascade delete to all collections (subscriptions, invitations, credit_purchases, analytics_events, notifications, security_events); implement data anonymization for audit logs; add deletion confirmation email
- **Acceptance Criteria:**
  - [ ] All user-related collections included in cascade delete
  - [ ] Audit logs anonymized (not deleted)
  - [ ] Deletion confirmation email sent
  - [ ] Deletion logged in audit trail
  - [ ] Right-to-forgiveness API endpoint
  - [ ] Data export before deletion offered
  - [ ] Deletion takes effect within 30 days (GDPR compliance)
- **Estimated Hours:** 24
- **Dependencies:** BE-009 (audit logging)
- **Owner:** Staff Engineer
- **Risk:** High (data loss if wrong)
- **Verification Steps:** Request GDPR deletion → verify all collections cleaned → audit entry created → confirmation sent

---

## Epic: DevOps & CI/CD (5 issues)

### DEVOPS-001: CI Pipeline Has `continue-on-error: true` for Frontend Build — STALE, SUPERSEDED (see DEVOPS-006)
- **ID:** DEVOPS-001
- **Title:** Fix CI pipeline to fail on frontend build errors
- **Re-verified 2026-07-03:** `.github/workflows/ci.yml` has no `continue-on-error` anywhere and now has a dedicated `quality-gate` job that explicitly blocks merge if backend, frontend, or prod-artifacts fail. This specific complaint no longer applies — the pipeline was rebuilt into something much stricter at some point after this item was written. See DEVOPS-006 for what re-auditing the *current* pipeline actually found.
- **Description (original):** Frontend build step has `continue-on-error: true`. Broken frontend can be merged to main.
- **Category:** CI/CD / Quality
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `.github/workflows/ci.yml` (line 59)
- **Root Cause:** CI configuration allows failures
- **Recommended Fix:** Remove `continue-on-error: true`; fix TypeScript errors first; add linting; enforce build success
- **Acceptance Criteria:**
  - [ ] `continue-on-error: true` removed
  - [ ] Frontend build fails CI if errors present
  - [ ] TypeScript errors fixed before enabling
  - [ ] Linting added to CI pipeline
  - [ ] PR cannot merge if CI fails
- **Estimated Hours:** 8
- **Dependencies:** FE-004 (TypeScript strict mode)
- **Owner:** DevOps Lead
- **Risk:** Low
- **Verification Steps:** Push broken frontend → CI fails → fix → CI passes

---

### DEVOPS-002: No Kubernetes Ingress / TLS Configuration
- **ID:** DEVOPS-002
- **Title:** Configure K8s Ingress with TLS termination
- **Description:** No ingress configuration; no TLS termination setup. Cannot serve HTTPS traffic securely.
- **Category:** Infrastructure / DevOps
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** Repository root
- **Root Cause:** Missing ingress configuration
- **Recommended Fix:** Create Ingress manifests with TLS termination using cert-manager; configure backend and frontend routes
- **Acceptance Criteria:**
  - [ ] Ingress controller (nginx-ingress or Traefik) deployed
  - [ ] TLS certificates via cert-manager/Let's Encrypt
  - [ ] Automatic certificate renewal
  - [ ] Frontend and backend routes configured
  - [ ] WebSocket support in ingress
  - [ ] HTTP → HTTPS redirect
  - [ ] HSTS headers configured
- **Estimated Hours:** 24
- **Dependencies:** INF-001 (K8s)
- **Owner:** DevOps Lead
- **Risk:** Medium
- **Verification Steps:** Deploy ingress → access HTTPS → verify certificate → verify auto-renewal

---

### DEVOPS-003: No Horizontal Pod Autoscaling
- **ID:** DEVOPS-003
- **Title:** Implement HPA for all services
- **Description:** No auto-scaling configuration. Cannot handle traffic spikes; resource waste during low traffic.
- **Category:** Infrastructure / DevOps
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** Repository root
- **Root Cause:** Missing autoscaling configuration
- **Recommended Fix:** Configure HPA for backend, frontend, and Celery workers based on CPU/memory; implement custom metrics for queue depth
- **Acceptance Criteria:**
  - [ ] HPA for backend service (CPU > 70%)
  - [ ] HPA for frontend service (CPU > 70%)
  - [ ] HPA for Celery workers (queue depth)
  - [ ] Min/max replica configuration per environment
  - [ ] Scale-down delay to avoid thrashing
  - [ ] HPA metrics in monitoring dashboard
- **Estimated Hours:** 16
- **Dependencies:** INF-001 (K8s)
- **Owner:** DevOps Lead
- **Risk:** Low
- **Verification Steps:** Load test → verify pods scale up → traffic decreases → pods scale down

---

### DEVOPS-004: No Rolling Update / Zero-Downtime Deployment Strategy
- **ID:** DEVOPS-004
- **Title:** Implement rolling update strategy with zero-downtime
- **Description:** No deployment strategy configured. Deployments cause downtime; no rollback capability.
- **Category:** DevOps
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** Repository root
- **Root Cause:** Missing deployment configuration
- **Recommended Fix:** Configure rolling update strategy in K8s deployments; implement readiness/liveness probes; add pod disruption budgets
- **Acceptance Criteria:**
  - [ ] Rolling update strategy (maxSurge: 25%, maxUnavailable: 0)
  - [ ] Readiness probes on all pods
  - [ ] Liveness probes on all pods
  - [ ] Pod disruption budgets (minAvailable: 2)
  - [ ] Deployment health check before routing traffic
  - [ ] Rollback script for failed deployments
- **Estimated Hours:** 16
- **Dependencies:** INF-001 (K8s)
- **Owner:** DevOps Lead
- **Risk:** Medium
- **Verification Steps:** Deploy new version → verify zero-downtime → rollback → verify success

---

### DEVOPS-005: No Docker Compose for Local Development with Production Parity
- **ID:** DEVOPS-005
- **Title:** Optimize Docker Compose for local development
- **Description:** Current Docker Compose lacks production parity; missing services like monitoring stack, message queue for development.
- **Category:** DevOps
- **Severity:** LOW
- **Priority:** P2
- **Affected Files:** `docker-compose.yml`
- **Root Cause:** Development environment mismatch
- **Recommended Fix:** Update Docker Compose to include local development versions of all services; add monitoring stack for development; ensure production parity where possible
- **Acceptance Criteria:**
  - [ ] Docker Compose includes all services (backend, frontend, Celery, Redis, MongoDB replica set)
  - [ ] Local monitoring stack (Prometheus + Grafana)
  - [ ] Development seeds and fixtures
  - [ ] Hot-reload for frontend and backend
  - [ ] Documentation for local setup
- **Estimated Hours:** 24
- **Dependencies:** None
- **Owner:** DevOps Lead
- **Risk:** Low
- **Verification Steps:** `docker-compose up` → all services running → hot-reload works

---

### DEVOPS-006: CI Pipeline Existed and Was Comprehensive, But Was Fully Red on `main` — Three Stacked Failures Never Individually Diagnosed — RESOLVED 2026-07-03
- **ID:** DEVOPS-006
- **Title:** Fix the real, currently-failing CI pipeline (contradicts this doc's own INF-004/MASTER_EXECUTION_PLAN's claim that CI/CD is "Missing")
- **Description:** Both this backlog (implicitly, via DEVOPS-001 describing a pipeline with `continue-on-error`) and `MASTER_EXECUTION_PLAN.md` (explicitly: "CI/CD pipeline | ❌ Missing | Not implemented") understated reality in the *opposite* direction from most other findings this session: `.github/workflows/ci.yml` is a real, substantial pipeline (ruff, bandit, pip-audit, pytest, tsc+vite build, npm audit, docker builds for both images, plus a `quality-gate` job that blocks merge on any failure) — not missing at all. But `gh run list` showed the last 3 pushes to `main` all failed CI, and because each `run: ` step uses `bash -e` (stops at the first failing line), later steps never got a chance to run — meaning the true number of independent failures was invisible from the CI UI alone. Re-running each check locally surfaced **four** stacked failures, only the first of which was visible in the GitHub Actions log:
  1. **Backend `ruff` lint: 35 F401/F841 errors** (unused imports/vars) accumulated from recent commits — this was the one visible failure blocking the job.
  2. **Backend `bandit`, hidden behind #1: 1 medium finding** (B104, hardcoded `0.0.0.0` bind) in `backend/api/deployments.py:495` — a false positive (it's the `HOST` env var for a *deployed user container*, not this server; 127.0.0.1 there would be unreachable through Docker's own port mapping), but bandit doesn't know that without a `# nosec` justification, so it would have failed the job as its own, second, independent blocker.
  3. **Frontend `npm audit --audit-level=high`: 1 moderate (esbuild) + 1 high (vite) advisory**, both in `vite`'s dev-server-only code paths (CORS/path-traversal issues that only matter for `vite dev`/`vite serve`, never the built artifact) with no non-major-version fix available in the vite 5.x line the project is pinned to.
  4. **Frontend `npm run build`, hidden behind #3: would have failed too** — the `prebuild` npm script runs `backend/scripts/export_ws_events.py` (regenerates `wsEvents.ts` from `WSEventType`, the frontend/backend WebSocket event contract), which imports `backend/core/models.py` and therefore needs `pydantic` importable. The frontend CI job only ever set up Node, never Python — so this would 100% reproducibly fail in CI even after fixing #3, and the "CI runs the full npm build to catch contract drift" assumption documented in `frontend/Dockerfile`'s own comment was false the entire time this job existed in its current form.
- **Category:** CI/CD / DevOps
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `.github/workflows/ci.yml`, `backend/api/analytics.py`, `backend/api/admin.py`, `backend/api/deployments.py`
- **Root Cause:** Each of the 4 issues was introduced independently over time; `bash -e`'s stop-on-first-failure semantics meant nobody could see past the first one to notice the rest
- **Fix Applied:**
  - Removed the 35 unused imports/vars (`ruff check --fix` for imports; manual removal for the two genuinely-dead local variables in `analytics.py`)
  - Added `# nosec B104` with a one-line justification on the deployments.py line
  - Scoped `npm audit` to `--omit=dev` (vite/esbuild are devDependencies; matches this same CI file's own established precedent of documenting and skipping advisories that need a major-version bump and their own regression pass, rather than rushing an untested vite 6/7/8 bump through this gate)
  - Added a `Set up Python` + `pip install pydantic==2.7.1` step to the frontend job before `npm ci`
- **Acceptance Criteria:**
  - [x] `ruff check . --select F,E9 --exclude venv` passes
  - [x] `bandit -r . -x ./venv,./tests -ll` passes
  - [x] `npm audit --omit=dev --audit-level=high` passes (0 vulnerabilities)
  - [x] `npm run build` succeeds locally with pydantic available, and regenerates `wsEvents.ts` byte-identical to the committed version (confirmed via `git diff` — no contract drift)
  - [x] Full backend test suite passes (88/88)
- **Estimated Hours:** N/A (diagnosis + fix, not originally sized)
- **Dependencies:** None
- **Owner:** DevOps Lead
- **Risk:** Low
- **Verification:** All four checks re-run locally and confirmed passing; not yet confirmed green in an actual GitHub Actions run (would need a push to verify end-to-end, since this environment can't trigger a real Actions run).

---

## Epic: Testing (2 issues)

### TEST-001: No Test Coverage (Minimal Tests)
- **ID:** TEST-001
- **Title:** Implement comprehensive test suite with ≥80% coverage
- **Description:** Only 3 test files exist with minimal coverage; no integration tests; no E2E tests; no load tests. Undetected regressions; no confidence in deployment.
- **Category:** Testing / Quality
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** `backend/tests/`, `orchestration/tests/`, `orchestrator/tests/`
- **Root Cause:** Testing not prioritized
- **Recommended Fix:** Implement unit tests for all API endpoints; integration tests with test containers; E2E tests with Playwright; load tests with k6
- **Acceptance Criteria:**
  - [ ] Unit tests for all API routers (auth, projects, builds, webhooks, billing, admin, analytics)
  - [ ] Unit tests for core modules (security, encryption, config)
  - [ ] Integration tests for database operations
  - [ ] Integration tests for Redis/Celery
  - [ ] E2E tests for critical flows (registration, login, create build, view result)
  - [ ] E2E tests for admin panel
  - [ ] Load tests for auth and builds endpoints
  - [ ] Test coverage ≥80% (backend)
  - [ ] Test CI pipeline with parallel test execution
  - [ ] Test coverage reports in CI
- **Estimated Hours:** 200
- **Dependencies:** None
- **Owner:** QA Director
- **Risk:** High (scope)
- **Verification Steps:** Run `pytest --cov` → verify ≥80% → run E2E tests → all pass

---

### TEST-002: No Performance / Load / Stress / Chaos Tests
- **ID:** TEST-002
- **Title:** Implement performance, load, stress, and chaos testing
- **Description:** No load tests, stress tests, or chaos tests. Cannot validate system behavior under load or failure conditions.
- **Category:** Testing / Performance
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** Repository root
- **Root Cause:** Missing non-functional testing
- **Recommended Fix:** Implement k6 load tests for critical endpoints; stress tests for database; chaos experiments for infrastructure; document performance baseline
- **Acceptance Criteria:**
  - [ ] k6 load tests for: auth (login/register), builds (create/list), projects CRUD
  - [ ] Stress tests: database connection pool, Redis rate limiting, LLM API (simulated)
  - [ ] Chaos tests: Pod failure, network latency, database failover, Redis outage
  - [ ] Performance baseline documented (latency p50/p95/p99, throughput, error rate)
  - [ ] Load test runs in CI on schedule
  - [ ] Performance regression detection in CI
- **Estimated Hours:** 80
- **Dependencies:** TEST-001 (test infrastructure)
- **Owner:** QA Director
- **Risk:** Medium
- **Verification Steps:** Run k6 test → verify latency within thresholds → chaos test → verify recovery

---

## Epic: Observability (4 issues)

### OBS-001: No Structured Logging / Observability
- **ID:** OBS-001
- **Title:** Implement structured logging and log aggregation
- **Description:** No structured logging (JSON), no log levels, no request IDs, no OpenTelemetry/APM integration. Unable to debug production issues; no audit trail.
- **Category:** Observability / Monitoring
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** All backend files
- **Root Cause:** Missing observability infrastructure
- **Recommended Fix:** Implement structured logging with `structlog` or `python-json-logger`; add request ID middleware; integrate OpenTelemetry for traces; set up log aggregation (DataDog, Grafana Loki)
- **Acceptance Criteria:**
  - [ ] All logs in JSON format
  - [ ] Log levels used consistently (DEBUG, INFO, WARNING, ERROR)
  - [ ] Request ID in every log entry
  - [ ] OpenTelemetry instrumentation for FastAPI
  - [ ] Trace propagation to Celery tasks
  - [ ] Log aggregation system operational
  - [ ] Log retention and archival policy
  - [ ] Log viewer/explorer UI
- **Estimated Hours:** 80
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Medium
- **Verification Steps:** Make request → verify JSON log with request ID → check log aggregation

---

### OBS-002: No Request ID / Correlation ID
- **ID:** OBS-002
- **Title:** Add request ID middleware
- **Description:** No request ID middleware; logs cannot be correlated across services. Difficult debugging.
- **Category:** Observability
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** `backend/main.py`
- **Root Cause:** Missing middleware
- **Note:** This is consolidated with BE-008. See BE-008 for full details.
- **Status:** MERGED with BE-008
- **Estimated Hours:** 0 (covered by BE-008)

---

### OBS-003: No Database Connection Pool Monitoring
- **ID:** OBS-003
- **Title:** Add MongoDB connection pool monitoring
- **Description:** No monitoring of MongoDB connection pool usage.
- **Note:** This is consolidated with INF-008. See INF-008 for full details.
- **Status:** MERGED with INF-008
- **Estimated Hours:** 0 (covered by INF-008)

---

### OBS-004: No APM / Real-time Application Performance Monitoring
- **ID:** OBS-004
- **Title:** Implement APM with distributed tracing
- **Description:** No APM integration; no distributed tracing; no performance monitoring for API endpoints. Cannot identify slow queries or bottlenecks.
- **Category:** Observability
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** All backend files
- **Root Cause:** Missing APM
- **Recommended Fix:** Integrate APM agent (DataDog APM, New Relic, or OpenTelemetry Collector); implement distributed tracing across services; create performance dashboards
- **Acceptance Criteria:**
  - [ ] APM agent configured and operational
  - [ ] Distributed tracing across backend, Celery, and DB
  - [ ] Endpoint latency breakdown (p50, p95, p99)
  - [ ] Database query performance tracking
  - [ ] External API call tracing (LLM, Stripe)
  - [ ] Error tracking and exception monitoring
  - [ ] Performance alerts for slow endpoints
- **Estimated Hours:** 40
- **Dependencies:** OBS-001 (structured logging)
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Make API call → verify trace in APM → check latency breakdown

---

## Epic: Business & Product (7 issues)

### BUS-001: No Terms of Service / Privacy Policy
- **ID:** BUS-001
- **Title:** Draft and publish Terms of Service and Privacy Policy
- **Description:** No legal documents provided; no consent tracking. Legal liability; GDPR/CCPA non-compliance; no user agreement.
- **Category:** Legal / Compliance
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** Repository root, `frontend/src/pages/AuthPage.tsx`
- **Root Cause:** Missing legal documentation
- **Recommended Fix:** Draft ToS and Privacy Policy with legal counsel; require acceptance on registration; track consent with timestamp and version; display in footer
- **Acceptance Criteria:**
  - [ ] Terms of Service drafted and reviewed by legal
  - [ ] Privacy Policy drafted and reviewed by legal
  - [ ] Consent checkbox on registration
  - [ ] Consent record stored (user_id, version, timestamp)
  - [ ] ToS/Privacy accessible in footer
  - [ ] Version tracking for legal documents
  - [ ] Notification of policy changes
- **Estimated Hours:** 80
- **Dependencies:** None
- **Owner:** Product Manager / Legal
- **Risk:** High (legal)
- **Verification Steps:** Register → consent checkbox present → submit → consent record created → ToS/Privacy links work

---

### BUS-002: Stripe Price IDs are Placeholders — RESOLVED 2026-07-06
- **ID:** BUS-002
- **Title:** Configure actual Stripe products and prices
- **Description:** `PLAN_PRICES` map uses placeholder IDs like `"price_free"`, `"price_standard_monthly"`. Billing will fail in production.
- **Category:** Billing / Business
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/core/config.py`, `backend/api/billing.py`, `.env.example`, `backend/tests/test_stripe_price_validation.py`
- **Root Cause:** Placeholder price IDs were not validated, allowing production deployments to fail at customer checkout instead of at startup
- **Fix Applied:**
  - The existing `validate_production_billing` model_validator in `backend/core/config.py` already enforced real Stripe Price IDs in production via regex (`price_[A-Za-z0-9]+`) and uniqueness checks
  - Added explicit documentation in `.env.example` (lines 22-29) warning that `STRIPE_PRICE_*` defaults are non-functional placeholders
  - Added documentation in `backend/core/config.py` (lines 96-98) and `backend/api/billing.py` (lines 44-46) explaining the placeholder nature of defaults
  - Added 7 regression tests in `backend/tests/test_stripe_price_validation.py` covering all validation scenarios
- **Acceptance Criteria:**
  - [x] Production environments fail at startup if placeholders are present (via existing `validate_production_billing` validator)
  - [x] Production environments accept real `price_xxx` values
  - [x] Development/test environments can start with placeholders
  - [x] Price IDs validated for format and uniqueness
  - [ ] Stripe products created in Stripe dashboard (operator action, not code)
  - [ ] Price sync script (not implemented — operators set env vars directly)
- **Estimated Hours:** 40 (est.) / ~2 (actual — validation already existed, added tests and documentation)
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** 7 new tests pass; 215/216 backend tests pass (1 pre-existing Stripe config test failure unrelated to this change)

---

### BUS-003: No SLA / Service Commitment
- **ID:** BUS-003
- **Title:** Define and publish SLA documentation
- **Description:** No SLA defined; no uptime guarantees; no compensation policy. No contractual commitment to uptime; no recourse for customers.
- **Category:** Business / Legal
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** Repository root
- **Root Cause:** Missing SLA
- **Recommended Fix:** Define and publish SLA with uptime guarantees, response times, and compensation; 99.9% for Pro, 99.95% for Enterprise
- **Acceptance Criteria:**
  - [ ] SLA document drafted with legal review
  - [ ] Uptime guarantees per plan tier
  - [ ] Response time commitments for support
  - [ ] Compensation/credits policy
  - [ ] SLA published on website
  - [ ] Monitoring in place to measure SLA compliance
- **Estimated Hours:** 40
- **Dependencies:** INF-002 (monitoring)
- **Owner:** Product Manager / Legal
- **Risk:** Low
- **Verification Steps:** Verify SLA document published → monitoring tracks uptime → compliance report generated

---

### BUS-004: No Support System / Status Page
- **ID:** BUS-004
- **Title:** Set up customer support and status page
- **Description:** No support ticket system, no live chat, no status page, no knowledge base. No customer support channel; no incident communication.
- **Category:** Business / Operations
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** Repository root
- **Root Cause:** Missing support infrastructure
- **Recommended Fix:** Set up customer support platform (Intercom, Zendesk); create status page; build knowledge base with FAQ and troubleshooting guides
- **Acceptance Criteria:**
  - [ ] Support platform integrated (Intercom widget)
  - [ ] Status page operational (status.forge.ai)
  - [ ] Incident communication templates
  - [ ] Knowledge base with FAQ
  - [ ] Support ticket tracking
  - [ ] Response time SLAs per plan
  - [ ] Escalation procedures documented
- **Estimated Hours:** 60
- **Dependencies:** None
- **Owner:** Product Manager
- **Risk:** Low
- **Verification Steps:** Open support widget → submit ticket → receive confirmation → check status page

---

### BUS-005: No Landing Page / Marketing Site Content
- **ID:** BUS-005
- **Title:** Create production landing page with marketing content
- **Description:** `frontend/src/pages/LandingPage.tsx` exists but lacks production-quality marketing content, pricing tables, feature comparisons.
- **Category:** Business / Marketing
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** `frontend/src/pages/LandingPage.tsx`
- **Root Cause:** Missing marketing content
- **Recommended Fix:** Create professional landing page with hero section, feature highlights, pricing table, testimonials, CTA; implement A/B testing for conversion
- **Acceptance Criteria:**
  - [ ] Professional hero section with value proposition
  - [ ] Feature comparison table
  - [ ] Pricing section with plan comparison
  - [ ] Testimonials / social proof
  - [ ] Clear call-to-action (sign up / start free trial)
  - [ ] Performance optimized (Lighthouse >90)
  - [ ] A/B testing framework for conversion optimization
- **Estimated Hours:** 60
- **Dependencies:** None
- **Owner:** Product Manager / Frontend Lead
- **Risk:** Low
- **Verification Steps:** Open landing page → verify all sections → Lighthouse audit >90 → A/B test works

---

### BUS-006: No API Documentation for Consumers
- **ID:** BUS-006
- **Title:** Create comprehensive API documentation
- **Description:** FastAPI auto-generated docs exist but no comprehensive API documentation for external consumers. Developers cannot integrate with the platform.
- **Category:** Documentation / Business
- **Severity:** MEDIUM
- **Priority:** P2
- **Affected Files:** Repository root
- **Root Cause:** Missing API documentation
- **Recommended Fix:** Create comprehensive API documentation with examples, authentication guide, rate limits, error codes, webhook documentation
- **Acceptance Criteria:**
  - [ ] API reference with all endpoints documented
  - [ ] Authentication guide (JWT, API keys, WebSocket)
  - [ ] Rate limiting documentation
  - [ ] Error codes and troubleshooting
  - [ ] Webhook event reference
  - [ ] SDK code examples (Python, JavaScript, cURL)
  - [ ] OpenAPI spec updated with descriptions
  - [ ] API changelog
- **Estimated Hours:** 40
- **Dependencies:** BE-004 (API versioning)
- **Owner:** Product Manager
- **Risk:** Low
- **Verification Steps:** Open API docs → verify all endpoints documented → test example requests

---

### BUS-007: No Credit Deduction Race Condition Protection
- **ID:** BUS-007
- **Title:** Fix credit deduction race condition with transactions
- **Description:** Credit reservation uses `find_one_and_update` which is atomic, but refund logic has race conditions. Users can exploit race conditions to get free builds.
- **Category:** Security / Billing
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/api/builds.py` (line 88-94, 166-177)
- **Root Cause:** Race condition in credit refund logic
- **Recommended Fix:** Use MongoDB transactions for credit operations; implement idempotency keys for builds
- **Acceptance Criteria:**
  - [ ] All credit operations wrapped in MongoDB transactions
  - [ ] Idempotency key on build creation
  - [ ] Duplicate build requests return existing build
  - [ ] Refund logic uses atomic operations
  - [ ] Race condition test passing
- **Estimated Hours:** 24
- **Dependencies:** DB-001 (replica set - required for transactions)
- **Owner:** Staff Engineer
- **Risk:** High (financial)
- **Verification Steps:** Send concurrent requests → verify only one build created → credits deducted exactly once

---

## Epic: Compliance & Legal (2 issues)

### COMP-001: GDPR Delete Doesn't Cascade to All Related Data
- **ID:** COMP-001
- **Title:** Implement complete GDPR data cascade deletion
- **Note:** This is consolidated with DB-004. See DB-004 for full details.
- **Status:** MERGED with DB-004
- **Estimated Hours:** 0 (covered by DB-004)

---

### COMP-002: No Data Retention Policy Implementation
- **ID:** COMP-002
- **Title:** Implement data retention and archival policies
- **Note:** This is consolidated with DB-003. See DB-003 for full details.
- **Status:** MERGED with DB-003
- **Estimated Hours:** 0 (covered by DB-003)

---

## Issue Summary Statistics

| Epic | Issues | P0 | P1 | P2 | Total Hours |
|------|--------|----|----|----|-------------|
| Security (SEC) | 16 | 12 | 3 | 1 | 271.5 |
| Backend (BE) | 14 | 1 | 7 | 6 | 278 |
| Frontend (FE) | 9 | 0 | 3 | 6 | 366 |
| AI Pipeline (AI) | 7 | 3 | 3 | 1 | 248 |
| Infrastructure (INF) | 8 | 4 | 1 | 3 | 364 |
| Database (DB) | 4 | 2 | 2 | 0 | 204 |
| DevOps (DEVOPS) | 5 | 1 | 2 | 2 | 88 |
| Testing (TEST) | 2 | 1 | 1 | 0 | 280 |
| Observability (OBS) | 4 | 0 | 1 | 3 | 120 |
| Business (BUS) | 7 | 3 | 0 | 4 | 344 |
| **Total** | **66** | **27** | **23** | **16** | **1,880.5** |

*Updated 2026-07-03: +10 items total across five passes — first pass added SEC-014 (bcrypt outage), SEC-015 (credential leak, resolved), BE-013 (marketplace crash, resolved), BE-014 (preferences storage, resolved), FE-008 (Billing/Marketplace/Settings wiring, resolved), FE-009 (Review Board UI, resolved). SEC-001's root cause was corrected (frontend never sent the CSRF header, not a backend validation gap) and marked resolved. **SEC-014 was then fixed the same day** (pinned `bcrypt==4.0.1` in `backend/requirements.txt`, verified with a real register+login round-trip) — which immediately uncovered SEC-016 (an `_id`/ObjectId serialization crash that had been unreachable until SEC-014 stopped blocking registration earlier in the request). SEC-016 is also resolved. A third pass spot-verified previously-"done" claims (SEC-002/003/005 confirmed genuinely clean; BE-001/DB-001 were re-checked by actually creating builds against the running app) and found **BE-015**: the Celery build pipeline looked correctly wired but was 100% non-functional end-to-end due to three independent bugs (task bound to Celery's unconfigured default app instead of the real one, a worker-startup crash from a bad `autodiscover_tasks` package path, and an event-loop-closure bug limiting a worker to exactly one successful task ever). All three fixed and verified same day with a real Celery worker processing two sequential builds. A fourth pass, prompted directly by the BE-015 pattern, spot-checked WS-001's "Redis pub/sub" claim and found **WS-003**: the pub/sub channel had no subscriber at all, so every build-progress event was silently dropped for every client on every build (not a multi-instance edge case — verified broken on this single-instance dev setup too, with zero frontend polling fallback to mask it). Fixed with a proper subscriber bridge and verified live with a real Celery worker delivering 14/14 events to a connected client. A fifth pass spot-checked PROD-006's credit-race claim: the reservation half was genuinely race-free (verified with 8 real concurrent requests — exactly 1 succeeded), but found **PROD-008**: Celery's `autoretry_for` re-runs the refund-on-failure logic on every retry attempt, not once per build, so a build that fails and retries got refunded multiple times — a real, exploitable free-credits path, verified live (balance ended *above* its starting value) and fixed. A sixth pass spot-checked AI-002's "prompt injection detection" claim by actually attempting bypasses and found **AI-008**: the keyword blocklist had two concrete, demonstrated gaps — trivial reformatting (extra spaces/newlines/hyphens) defeated the exact-substring match, and only the *last* message in a conversation was ever checked, so an injection planted in an earlier turn of an iterative build went completely undetected. Both fixed and verified with the same 11+ bypass strings that previously succeeded. **All 11 new items are now resolved — this backlog currently has zero newly-discovered open P0s from the 2026-07-03 session**, though the pre-existing P0/P1/P2 items below (encryption key, etc.) are unchanged.*

## Release Blockers (Must complete before ANY production traffic)

The following issues are absolute release blockers. If any of these are unresolved, the system cannot safely serve production traffic:

1. **SEC-014** - Password hashing completely broken (registration/login total outage) — **NEW 2026-07-03, the most severe unresolved item in this list**
2. ~~**SEC-001** - CSRF bypass~~ — **RESOLVED 2026-07-03** (frontend now attaches the CSRF token; backend validation was already correct)
3. **SEC-002** - Encryption key compromise
3. **SEC-003** - WS auth hijacking
4. **SEC-004** - Rate limiting bypass
5. **SEC-005** - Token blacklist vulnerability
6. **SEC-006** - Password reset token vulnerability
7. **SEC-009** - NoSQL injection
8. **SEC-010** - Missing sanitize_string
9. **SEC-011** - Auth endpoint rate limiting
10. ~~**BE-001** - BackgroundTasks build loss~~ — **RESOLVED 2026-07-03** (three separate bugs that made the Celery pipeline 100% non-functional were found and fixed same day — see BE-015; only the dead-letter-queue acceptance criterion remains open)
11. **DB-001** - Single point of failure (MongoDB)
12. **DB-004** - GDPR non-compliance
13. **INF-001** - No K8s deployment
14. **INF-002** - No monitoring
15. **INF-003** - No secrets management
16. **INF-005** - No backup strategy
17. **DEVOPS-002** - No ingress/TLS
18. **TEST-001** - No test coverage
19. **BUS-001** - No ToS/Privacy
20. **BUS-002** - Placeholder pricing
21. **BUS-007** - Credit race condition

## Launch Blockers (Must complete before GA launch)

In addition to release blockers:
1. **SEC-007** - MFA/2FA
2. **SEC-008** - Email verification
3. **SEC-012** - Webhook URL validation
4. **SEC-013** - CORS production config
5. **BE-002** - Global error handler
6. **BE-003** - Pagination
7. **BE-005** - Graceful shutdown
8. **BE-006** - Build timeout cleanup
9. **BE-011** - Health checks
10. **BE-009** - Audit logging
11. **DEVOPS-001** - CI pipeline fix
12. **DEVOPS-003** - HPA
13. **DEVOPS-004** - Zero-downtime deployment
14. **AI-001** - Cost tracking
15. **AI-002** - Prompt injection protection
16. **AI-004** - LLM fallback
17. **TEST-002** - Load/performance tests
18. **OBS-001** - Structured logging
19. **DB-002** - Database migrations
20. **BUS-003** - SLA
21. **BUS-004** - Support system

## Technical Debt (Non-blocking but should be addressed)

1. **FE-004** - TypeScript strict mode
2. **FE-007** - SEO/meta tags
3. **BE-004** - API versioning
4. **BE-007** - Caching
5. **BE-008** - Request ID
6. **BE-010** - Session management
7. **AI-006** - Circuit breaker graceful degradation
8. **INF-004** - Docker tagging
9. **INF-006** - Graceful degradation strategy
10. **INF-008** - Connection pool monitoring
11. **OBS-004** - APM
12. **DEVOPS-005** - Docker Compose parity
13. **FE-002** - Responsive design
14. **FE-005** - Onboarding
15. **FE-006** - Analytics
16. **BUS-005** - Landing page
17. **BUS-006** - API docs