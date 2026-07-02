# Forge AI — Engineering Backlog

**Version:** 1.0  
**Date:** 2026-01-07  
**Total Issues:** 59  
**Total Estimated Hours:** 1,848

---

## Epic: Security (13 issues)

### SEC-001: CSRF Protection is Incomplete
- **ID:** SEC-001
- **Title:** Implement proper CSRF token validation
- **Description:** CSRF protection middleware only checks if `X-CSRF-Token` header is present, not if it's valid. `validate_csrf_token` and `store_csrf_token` functions exist but are never called.
- **Category:** Security / Authentication
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/core/security.py` (line 145-155)
- **Root Cause:** Incomplete implementation - validation functions defined but never wired into middleware
- **Recommended Fix:** Wire `validate_csrf_token()` into middleware; generate and store CSRF tokens per session; validate on every state-changing request
- **Acceptance Criteria:**
  - [ ] CSRF token validated on all POST/PUT/DELETE requests
  - [ ] Tokens are generated per session and verified
  - [ ] Existing test suite passes
  - [ ] No false positives with valid requests
- **Estimated Hours:** 16
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Medium
- **Verification Steps:** Attempt state-changing request without CSRF token → 403; with valid token → 200

---

### SEC-002: Encryption Key Derived from JWT Secret
- **ID:** SEC-002
- **Title:** Separate encryption key from JWT secret
- **Description:** `encryption.py` derives Fernet key from `settings.jwt_secret` using SHA256. If JWT secret leaks, all encrypted data (github_tokens) is compromised.
- **Category:** Security / Cryptography
- **Severity:** CRITICAL
- **Priority:** P0
- **Affected Files:** `backend/core/encryption.py` (line 10-12), `backend/core/config.py`
- **Root Cause:** Using JWT secret as encryption key material (circular dependency)
- **Recommended Fix:** Add `FIELD_ENCRYPTION_KEY` to settings as a separate, dedicated key; generate with `openssl rand -hex 32`; migrate existing encrypted data
- **Acceptance Criteria:**
  - [ ] `FIELD_ENCRYPTION_KEY` added to config/settings
  - [ ] Encryption module uses dedicated key
  - [ ] Existing encrypted data migrated (re-encrypted with new key)
  - [ ] Key rotation documented
- **Estimated Hours:** 16
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** High (requires data migration)
- **Verification Steps:** Encrypt data with old key → decrypt with new key → verify data integrity

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

### SEC-004: Rate Limiting Bypass When Redis is Down
- **ID:** SEC-004
- **Title:** Implement fail-closed rate limiting
- **Description:** `rate_limit_middleware` silently falls through on Redis connection failure allowing unlimited API calls.
- **Category:** Security / Rate Limiting
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/core/security.py` (line 71-77)
- **Root Cause:** Fail-open design for rate limiting
- **Recommended Fix:** Return 429 or 503 when Redis is unavailable; implement in-memory fallback rate limiter
- **Acceptance Criteria:**
  - [ ] Requests return 429/503 when Redis is down
  - [ ] In-memory fallback rate limiter operational
  - [ ] Configurable fallback limits
- **Estimated Hours:** 8
- **Dependencies:** None
- **Owner:** Security Lead
- **Risk:** Low
- **Verification Steps:** Stop Redis → make requests → receive 429/503

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

### SEC-007: No MFA / 2FA Support
- **ID:** SEC-007
- **Title:** Implement TOTP-based multi-factor authentication
- **Description:** No multi-factor authentication anywhere in the codebase. Account takeover via credential stuffing; no defense against compromised passwords.
- **Category:** Security / Authentication
- **Severity:** HIGH
- **Priority:** P1
- **Affected Files:** `backend/api/auth.py` (entire file)
- **Root Cause:** Feature not implemented
- **Recommended Fix:** Implement TOTP-based 2FA using `pyotp`; add recovery codes; support WebAuthn for enterprise; add MFA enrollment flow
- **Acceptance Criteria:**
  - [ ] TOTP enrollment and verification implemented
  - [ ] Recovery codes generated and usable
  - [ ] MFA required for admin accounts
  - [ ] MFA status exposed in user settings API
  - [ ] Remember device for 30 days option
- **Estimated Hours:** 80
- **Dependencies:** SEC-005 (token management)
- **Owner:** Security Lead
- **Risk:** Medium
- **Verification Steps:** Enroll MFA → verify with valid TOTP → verify with invalid TOTP → use recovery code

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

## Epic: Backend (12 issues)

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
  - [ ] All builds processed via Celery tasks
  - [ ] Task persistence on Redis restart
  - [ ] Automatic retry on failure (3 retries)
  - [ ] Dead-letter queue for failed builds
  - [ ] Build status updates via Celery callbacks
  - [ ] Existing build creation flow preserved
- **Estimated Hours:** 80
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** High (core architecture change)
- **Verification Steps:** Create build → verify Celery task created → restart Celery → build resumes → verify completion

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

### BE-006: Build Timeout May Leak Resources
- **ID:** BE-006
- **Title:** Ensure build timeout properly cleans up resources
- **Description:** `asyncio.wait_for` wraps the orchestrator but timeout exception handling may not clean up resources. Builds can run indefinitely; resource exhaustion.
- **Category:** Reliability
- **Severity:** MEDIUM
- **Priority:** P1
- **Affected Files:** `backend/api/builds.py` (line 160-163)
- **Root Cause:** Timeout handling may leak resources
- **Recommended Fix:** Add try/finally block to ensure cleanup; cancel Anthropic client on timeout; log timeout events; enforce maximum build duration
- **Acceptance Criteria:**
  - [ ] Try/finally ensures resource cleanup on timeout
  - [ ] LLM API calls cancelled on timeout
  - [ ] Timeout events logged with build ID and duration
  - [ ] Configurable max build duration
- **Estimated Hours:** 16
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Low
- **Verification Steps:** Trigger build timeout → verify cleanup code runs → no leaked connections

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

## Epic: Frontend (7 issues)

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
- **Recommended Fix:** Implement multi-step guided onboarding with sample project creation; add tooltips and walkthrough; measure completion rates
- **Acceptance Criteria:**
  - [ ] Multi-step onboarding wizard implemented
  - [ ] Sample "Hello World" project creation flow
  - [ ] Tooltips for key features
  - [ ] Progress indicator in onboarding
  - [ ] Skip option available
  - [ ] Onboarding completion tracked in analytics
- **Estimated Hours:** 60
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

## Epic: AI Pipeline (7 issues)

### AI-001: No LLM Cost Tracking / Budget Controls
- **ID:** AI-001
- **Title:** Implement LLM token usage tracking and budget controls
- **Description:** No token counting, no cost tracking, no per-user budget limits, no spending alerts. Uncontrolled AI costs; no visibility into per-user spending; budget overruns.
- **Category:** AI Pipeline / Business
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/agents/base.py`, `backend/core/orchestrator.py`
- **Root Cause:** Missing cost management
- **Recommended Fix:** Track token usage per build/user; implement daily/weekly/monthly budget limits; add spending alerts; cache common LLM responses; add `ai_usage` collection
- **Acceptance Criteria:**
  - [ ] Token counting wrapper around Anthropic API calls
  - [ ] Usage stored in `ai_usage` collection per user/build
  - [ ] Daily/weekly/monthly budget limits configurable
  - [ ] Spending alerts at 50%, 80%, 100% of budget
  - [ ] API endpoint for spending dashboard
  - [ ] Admin endpoint to adjust budgets
- **Estimated Hours:** 40
- **Dependencies:** None
- **Owner:** Staff Engineer
- **Risk:** Medium
- **Verification Steps:** Execute build → verify token usage recorded → check spending dashboard → exceed budget → build rejected

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

### INF-002: No Monitoring / Alerting Configuration
- **ID:** INF-002
- **Title:** Set up monitoring, metrics, and alerting
- **Description:** No Prometheus metrics, no Grafana dashboards, no alerting rules, no uptime monitoring. No visibility into production issues; unable to detect outages.
- **Category:** Observability / DevOps
- **Severity:** CRITICAL
- **Priority:** P0
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

### DEVOPS-001: CI Pipeline Has `continue-on-error: true` for Frontend Build
- **ID:** DEVOPS-001
- **Title:** Fix CI pipeline to fail on frontend build errors
- **Description:** Frontend build step has `continue-on-error: true`. Broken frontend can be merged to main.
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

### BUS-002: Stripe Price IDs are Placeholders
- **ID:** BUS-002
- **Title:** Configure actual Stripe products and prices
- **Description:** `PLAN_PRICES` map uses placeholder IDs like `"price_free"`, `"price_standard_monthly"`. Billing will fail in production.
- **Category:** Billing / Business
- **Severity:** HIGH
- **Priority:** P0
- **Affected Files:** `backend/api/billing.py` (line 17-29)
- **Root Cause:** Stripe products not created; placeholder IDs used
- **Recommended Fix:** Create actual Stripe products and prices; store IDs in environment variables; implement price synchronization
- **Acceptance Criteria:**
  - [ ] Stripe products created (Free, Standard, Pro, Enterprise)
  - [ ] Stripe prices created (monthly, annual)
  - [ ] Price IDs moved to environment variables / secrets
  - [ ] Price sync script for updating from Stripe
  - [ ] Graceful error if price ID is invalid
  - [ ] Test mode prices for development
- **Estimated Hours:** 40
- **Dependencies:** None
- **Owner:** Product Manager
- **Risk:** Medium
- **Verification Steps:** Create subscription → verify Stripe charge succeeds → verify webhook updates subscription status

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
| Security (SEC) | 13 | 9 | 3 | 1 | 264 |
| Backend (BE) | 12 | 1 | 6 | 5 | 276 |
| Frontend (FE) | 7 | 0 | 2 | 5 | 344 |
| AI Pipeline (AI) | 7 | 3 | 3 | 1 | 248 |
| Infrastructure (INF) | 8 | 4 | 1 | 3 | 364 |
| Database (DB) | 4 | 2 | 2 | 0 | 204 |
| DevOps (DEVOPS) | 5 | 1 | 2 | 2 | 88 |
| Testing (TEST) | 2 | 1 | 1 | 0 | 280 |
| Observability (OBS) | 4 | 0 | 1 | 3 | 120 |
| Business (BUS) | 7 | 3 | 0 | 4 | 344 |
| **Total** | **59** | **24** | **21** | **14** | **1,848** |

## Release Blockers (Must complete before ANY production traffic)

The following issues are absolute release blockers. If any of these are unresolved, the system cannot safely serve production traffic:

1. **SEC-001** - CSRF bypass
2. **SEC-002** - Encryption key compromise
3. **SEC-003** - WS auth hijacking
4. **SEC-004** - Rate limiting bypass
5. **SEC-005** - Token blacklist vulnerability
6. **SEC-006** - Password reset token vulnerability
7. **SEC-009** - NoSQL injection
8. **SEC-010** - Missing sanitize_string
9. **SEC-011** - Auth endpoint rate limiting
10. **BE-001** - BackgroundTasks build loss
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