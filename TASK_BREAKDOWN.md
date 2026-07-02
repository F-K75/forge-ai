# Forge AI — Task Breakdown

**Date:** 2026-01-07  
**Purpose:** Break every backlog item into atomic, independently executable implementation tasks suitable for AI coding agents.

---

## Epic: Security — Task Breakdown

### SEC-001: CSRF Token Validation (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 1.1 | Add `validate_csrf_token()` call in CSRF middleware | 4 | None | Yes |
| 1.2 | Implement session-scoped CSRF token generation | 4 | None | Yes |
| 1.3 | Add CSRF token to login/register responses | 2 | 1.2 | Yes |
| 1.4 | Add CSRF token validation to all POST/PUT/DELETE routes | 4 | 1.1 | Yes |
| 1.5 | Write unit tests for CSRF middleware | 2 | 1.4 | Yes |

### SEC-002: Separate Encryption Key (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 2.1 | Add `FIELD_ENCRYPTION_KEY` to settings/config | 2 | None | Yes |
| 2.2 | Update `encryption.py` to use dedicated key | 4 | 2.1 | Yes |
| 2.3 | Create data migration script for existing encrypted fields | 6 | 2.2 | Yes |
| 2.4 | Add key rotation documentation | 2 | 2.3 | No (human) |
| 2.5 | Write unit tests for encryption module | 2 | 2.2 | Yes |

### SEC-003: WebSocket Authentication (24h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 3.1 | Remove token from query string WebSocket URL | 2 | None | Yes |
| 3.2 | Implement WS token generation endpoint (5 min TTL) | 6 | None | Yes |
| 3.3 | Implement token-in-first-message authentication | 8 | 3.2 | Yes |
| 3.4 | Update `ConnectionManager` to track authenticated connections | 4 | 3.3 | Yes |
| 3.5 | Enforce WSS in production configuration | 2 | None | Yes |
| 3.6 | Write integration tests for WS auth | 2 | 3.3 | Yes |

### SEC-004: Fail-Closed Rate Limiting (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 4.1 | Implement in-memory fallback rate limiter | 4 | None | Yes |
| 4.2 | Modify `rate_limit_middleware` to return 429 on Redis failure | 2 | 4.1 | Yes |
| 4.3 | Add config for fallback rate limits | 1 | 4.2 | Yes |
| 4.4 | Write tests for rate limiting fallback | 1 | 4.2 | Yes |

### SEC-005: JTI Token Blacklisting (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 5.1 | Add `jti` claim to `create_access_token()` | 2 | None | Yes |
| 5.2 | Update token blacklist to use JTI instead of full token | 2 | 5.1 | Yes |
| 5.3 | Add TTL index on JTI field | 1 | 5.2 | Yes |
| 5.4 | Add cleanup job for expired blacklist entries | 2 | 5.3 | Yes |
| 5.5 | Write tests for JTI blacklisting | 1 | 5.2 | Yes |

### SEC-006: Password Reset Token Hashing (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 6.1 | Replace SHA256 with pbkdf2_hmac in `_hash_token()` | 3 | None | Yes |
| 6.2 | Verify existing tokens remain valid until expiration | 2 | 6.1 | Yes |
| 6.3 | Add migration for existing stored tokens | 2 | 6.2 | Yes |
| 6.4 | Write tests for token hashing | 1 | 6.1 | Yes |

### SEC-007: MFA/2FA (80h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 7.1 | Add `pyotp` dependency and TOTP utility functions | 4 | None | Yes |
| 7.2 | Implement MFA enrollment endpoint (generate secret, QR code) | 8 | 7.1 | Yes |
| 7.3 | Implement MFA verification endpoint | 4 | 7.2 | Yes |
| 7.4 | Add MFA status to user profile API | 2 | 7.3 | Yes |
| 7.5 | Generate and store recovery codes | 4 | 7.4 | Yes |
| 7.6 | Implement MFA-required middleware for admin routes | 4 | 7.5 | Yes |
| 7.7 | Add "remember device" cookie (30 day) | 4 | 7.6 | Yes |
| 7.8 | Create MFA enrollment UI (QR code display, code input) | 16 | 7.2 | Yes |
| 7.9 | Create MFA settings page in frontend | 8 | 7.8 | Yes |
| 7.10 | Add MFA login flow (prompt for code after password) | 8 | 7.3 | Yes |
| 7.11 | Add WebAuthn support for enterprise users | 12 | 7.6 | Yes |
| 7.12 | Write comprehensive MFA tests | 6 | 7.10 | Yes |

### SEC-008: Email Verification (24h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 8.1 | Add `is_verified` field to user model | 1 | None | Yes |
| 8.2 | Implement verification token generation | 2 | SEC-006 | Yes |
| 8.3 | Add send verification email on registration | 4 | 8.2 | Yes |
| 8.4 | Implement email verification endpoint | 3 | 8.3 | Yes |
| 8.5 | Add resend verification email endpoint | 2 | 8.4 | Yes |
| 8.6 | Block unverified users from creating builds | 2 | 8.1 | Yes |
| 8.7 | Add verification status badge in UI | 4 | 8.4 | Yes |
| 8.8 | Write tests for email verification flow | 4 | 8.6 | Yes |
| 8.9 | Add email template for verification | 2 | None | Yes |

### SEC-009: NoSQL Injection Prevention (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 9.1 | Add `re.escape()` to admin search input | 2 | SEC-010 | Yes |
| 9.2 | Replace `$regex` with text indexes | 3 | None | Yes |
| 9.3 | Limit search to specific indexed fields | 2 | 9.2 | Yes |
| 9.4 | Write injection penetration tests | 1 | 9.1 | Yes |

### SEC-010: Implement sanitize_string (2h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 10.1 | Add `sanitize_string()` function to `core/security.py` | 1 | None | Yes |
| 10.2 | Fix import in `admin.py` | 0.5 | 10.1 | Yes |
| 10.3 | Write unit test for sanitize_string | 0.5 | 10.1 | Yes |

### SEC-011: Auth Endpoint Rate Limiting (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 11.1 | Add rate limit decorator for password reset endpoint | 2 | None | Yes |
| 11.2 | Add rate limit decorator for registration endpoint | 2 | None | Yes |
| 11.3 | Implement per-email rate limiting for password reset | 2 | 11.1 | Yes |
| 11.4 | Add rate limit response headers | 1 | 11.2 | Yes |
| 11.5 | Write tests for auth rate limiting | 1 | 11.4 | Yes |

### SEC-012: Webhook URL Validation (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 12.1 | Write URL validation function (block private IPs) | 3 | None | Yes |
| 12.2 | Add HTTPS requirement in production | 1 | 12.1 | Yes |
| 12.3 | Add validation to webhook creation endpoint | 2 | 12.2 | Yes |
| 12.4 | Write tests for URL validation | 2 | 12.3 | Yes |

### SEC-013: CORS Production Configuration (2h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 13.1 | Add `CORS_ORIGINS` environment variable | 1 | None | Yes |
| 13.2 | Update CORS middleware to use env var | 0.5 | 13.1 | Yes |
| 13.3 | Write test for CORS configuration | 0.5 | 13.2 | Yes |

---

## Epic: Backend — Task Breakdown

### BE-001: Celery Migration (80h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 1.1 | Configure Celery with Redis broker in `celery_app.py` | 4 | None | Yes |
| 1.2 | Convert build processing to Celery task | 16 | 1.1 | Yes |
| 1.3 | Implement task persistence and retry logic | 8 | 1.2 | Yes |
| 1.4 | Implement dead-letter queue for failed builds | 6 | 1.3 | Yes |
| 1.5 | Add Celery status reporting to build API | 8 | 1.2 | Yes |
| 1.6 | Update WebSocket manager for Celery task results | 8 | 1.5 | Yes |
| 1.7 | Add Celery monitoring (Flower) | 4 | 1.1 | Yes |
| 1.8 | Configure Celery worker scaling | 4 | 1.7 | Yes |
| 1.9 | Write Celery integration tests | 8 | 1.6 | Yes |
| 1.10 | Update Docker Compose with Celery worker service | 4 | 1.1 | Yes |
| 1.11 | Remove BackgroundTasks from build pipeline | 4 | 1.9 | Yes |
| 1.12 | Documentation update for build pipeline | 2 | 1.11 | No (human) |
| 1.13 | Update K8s manifests for Celery workers | 4 | 1.8 | Yes |

### BE-002: Global Exception Handler (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 2.1 | Create custom exception classes | 4 | None | Yes |
| 2.2 | Register global `@app.exception_handler(Exception)` | 4 | None | Yes |
| 2.3 | Implement sanitized error response formatting | 4 | 2.2 | Yes |
| 2.4 | Add structured error logging to handler | 2 | OBS-001 | Yes |
| 2.5 | Write tests for exception handler | 2 | 2.3 | Yes |

### BE-003: Pagination (24h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 3.1 | Create pagination utility class/function | 4 | None | Yes |
| 3.2 | Add pagination to `GET /projects/` | 3 | 3.1 | Yes |
| 3.3 | Add pagination to `GET /webhooks/` | 3 | 3.1 | Yes |
| 3.4 | Add pagination to `GET /api-keys/` | 3 | 3.1 | Yes |
| 3.5 | Add pagination to `GET /organizations/{id}/members` | 3 | 3.1 | Yes |
| 3.6 | Add pagination response metadata | 4 | 3.1 | Yes |
| 3.7 | Write pagination tests | 4 | 3.6 | Yes |

### BE-004: API Versioning (24h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 4.1 | Add router prefix `/v1/` to all API routers | 4 | None | Yes |
| 4.2 | Add redirect middleware for unversioned endpoints | 4 | 4.1 | Yes |
| 4.3 | Add deprecation header to old endpoints | 2 | 4.2 | Yes |
| 4.4 | Update frontend API calls to use `/v1/` prefix | 8 | 4.1 | Yes |
| 4.5 | Update API documentation | 4 | 4.4 | Yes |
| 4.6 | Write versioning tests | 2 | 4.3 | Yes |

### BE-005: Graceful Shutdown (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 5.1 | Register SIGTERM/SIGINT signal handlers | 2 | None | Yes |
| 5.2 | Implement connection drain (wait for active requests) | 4 | 5.1 | Yes |
| 5.3 | Notify Celery workers to stop accepting tasks | 4 | BE-001 | Yes |
| 5.4 | Gracefully close WebSocket connections | 3 | 5.2 | Yes |
| 5.5 | Update health check during drain | 2 | 5.4 | Yes |
| 5.6 | Write graceful shutdown tests | 1 | 5.5 | Yes |

### BE-006: Build Timeout Cleanup (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 6.1 | Add try/finally block to build execution | 4 | None | Yes |
| 6.2 | Add Anthropic client cancellation on timeout | 4 | 6.1 | Yes |
| 6.3 | Add timeout event logging | 2 | 6.2 | Yes |
| 6.4 | Add configurable max build duration | 2 | 6.3 | Yes |
| 6.5 | Write timeout cleanup tests | 4 | 6.4 | Yes |

### BE-007: Redis Caching (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 7.1 | Create `@cache()` decorator with TTL support | 6 | None | Yes |
| 7.2 | Add cache for plans endpoint | 4 | 7.1 | Yes |
| 7.3 | Add cache for feature flags endpoint | 4 | 7.1 | Yes |
| 7.4 | Add cache for user profiles | 6 | 7.1 | Yes |
| 7.5 | Implement cache invalidation on data changes | 6 | 7.2 | Yes |
| 7.6 | Add cache hit/miss Prometheus metrics | 4 | 7.1 | Yes |
| 7.7 | Write cache integration tests | 6 | 7.5 | Yes |
| 7.8 | Add cache configuration documentation | 2 | 7.7 | No (human) |

### BE-008: Request ID Middleware (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 8.1 | Create request ID middleware | 2 | OBS-001 | Yes |
| 8.2 | Add request ID to all log entries | 2 | 8.1 | Yes |
| 8.3 | Propagate request ID to Celery tasks | 2 | 8.2 | Yes |
| 8.4 | Return X-Request-ID in response headers | 1 | 8.1 | Yes |
| 8.5 | Write request ID tests | 1 | 8.4 | Yes |

### BE-009: Audit Logging (24h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 9.1 | Create AuditLog model/schema | 3 | None | Yes |
| 9.2 | Add audit log on project deletion | 3 | 9.1 | Yes |
| 9.3 | Add audit log on API key create/delete | 3 | 9.1 | Yes |
| 9.4 | Add audit log on webhook create/delete | 3 | 9.1 | Yes |
| 9.5 | Add audit log on user deletion | 2 | 9.1 | Yes |
| 9.6 | Add admin audit log viewer API | 4 | 9.5 | Yes |
| 9.7 | Implement audit log append-only protection | 3 | 9.6 | Yes |
| 9.8 | Write audit log tests | 3 | 9.7 | Yes |

### BE-010: Session Management (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 10.1 | Create session record on login | 4 | None | Yes |
| 10.2 | Add session listing endpoint | 4 | 10.1 | Yes |
| 10.3 | Add force logout other sessions endpoint | 4 | 10.2 | Yes |
| 10.4 | Implement concurrent session limit | 6 | 10.3 | Yes |
| 10.5 | Add session expiry and cleanup | 4 | 10.4 | Yes |
| 10.6 | Create session management UI | 12 | 10.5 | Yes |
| 10.7 | Write session management tests | 6 | 10.6 | Yes |

### BE-011: Health Checks (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 11.1 | Add MongoDB ping to health endpoint | 2 | None | Yes |
| 11.2 | Add Redis ping to health endpoint | 2 | None | Yes |
| 11.3 | Implement `/health/detailed` with per-dependency status | 2 | 11.2 | Yes |
| 11.4 | Return 503 when dependencies are down | 1 | 11.3 | Yes |
| 11.5 | Write health check tests | 1 | 11.4 | Yes |

### BE-012: Webhook Signing (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 12.1 | Implement HMAC-SHA256 webhook payload signing | 4 | None | Yes |
| 12.2 | Add `X-Forge-Signature` header to outgoing webhooks | 2 | 12.1 | Yes |
| 12.3 | Add timestamp to payload for replay protection | 3 | 12.2 | Yes |
| 12.4 | Update webhook delivery service | 4 | 12.3 | Yes |
| 12.5 | Document webhook signature verification for consumers | 2 | 12.4 | No (human) |
| 12.6 | Write webhook signing tests | 1 | 12.4 | Yes |

---

## Epic: Frontend — Task Breakdown

### FE-001: Accessibility (120h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 1.1 | Add ARIA labels to all interactive elements | 20 | None | Yes |
| 1.2 | Implement keyboard navigation | 16 | 1.1 | Yes |
| 1.3 | Add focus management (focus trap for modals, focus order) | 12 | 1.2 | Yes |
| 1.4 | Add skip-to-content link | 4 | None | Yes |
| 1.5 | Fix color contrast to WCAG AA | 16 | None | Yes |
| 1.6 | Add screen reader announcements for dynamic content | 12 | 1.3 | Yes |
| 1.7 | Add form error announcements | 8 | 1.6 | Yes |
| 1.8 | Test with axe DevTools (fix all violations) | 8 | 1.7 | Yes |
| 1.9 | Test with VoiceOver/NVDA screen reader | 8 | 1.8 | No (human) |
| 1.10 | Create accessibility documentation | 4 | 1.9 | No (human) |

### FE-002: Responsive Design (60h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 2.1 | Audit all pages at 320px, 768px, 1440px | 8 | None | Yes |
| 2.2 | Fix landing page responsiveness | 8 | 2.1 | Yes |
| 2.3 | Fix auth pages responsiveness | 4 | 2.1 | Yes |
| 2.4 | Fix admin panel responsiveness | 8 | 2.1 | Yes |
| 2.5 | Fix billing page responsiveness | 4 | 2.1 | Yes |
| 2.6 | Fix marketplace page responsiveness | 4 | 2.1 | Yes |
| 2.7 | Implement hamburger navigation for mobile | 6 | 2.2 | Yes |
| 2.8 | Ensure touch targets ≥44px on mobile | 4 | 2.7 | Yes |
| 2.9 | Fix table/viewport overflow on mobile | 6 | 2.4 | Yes |
| 2.10 | Write responsive design test checklist | 4 | 2.9 | Yes |

### FE-003: Error Boundary (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 3.1 | Create root-level ErrorBoundary component | 3 | None | Yes |
| 3.2 | Implement fallback UI with retry button | 2 | 3.1 | Yes |
| 3.3 | Add error reporting to monitoring service | 2 | 3.2 | Yes |
| 3.4 | Wrap BrowserRouter with ErrorBoundary | 0.5 | 3.1 | Yes |
| 3.5 | Test error boundary functionality | 0.5 | 3.4 | Yes |

### FE-004: TypeScript Strict Mode (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 4.1 | Enable `strict: true` in tsconfig.json | 0.5 | None | Yes |
| 4.2 | Fix strict null check errors | 12 | 4.1 | Yes |
| 4.3 | Fix no-implicit-any errors | 8 | 4.2 | Yes |
| 4.4 | Fix strict function types | 6 | 4.3 | Yes |
| 4.5 | Add proper type definitions for all components | 8 | 4.4 | Yes |
| 4.6 | Add ESLint TypeScript rules | 3 | 4.5 | Yes |
| 4.7 | Fix remaining lint errors | 2 | 4.6 | Yes |
| 4.8 | Verify zero compilation errors | 0.5 | 4.7 | Yes |

### FE-005: Onboarding Flow (60h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 5.1 | Design onboarding flow (steps, copy, screens) | 8 | None | No (human) |
| 5.2 | Create multi-step onboarding wizard component | 12 | 5.1 | Yes |
| 5.3 | Implement step 1: welcome & product intro | 6 | 5.2 | Yes |
| 5.4 | Implement step 2: sample project creation | 10 | 5.3 | Yes |
| 5.5 | Implement step 3: feature tour with tooltips | 8 | 5.4 | Yes |
| 5.6 | Add progress indicator | 4 | 5.2 | Yes |
| 5.7 | Add skip button and resume later | 4 | 5.6 | Yes |
| 5.8 | Track onboarding completion in analytics | 4 | FE-006 | Yes |
| 5.9 | Write onboarding flow tests | 4 | 5.8 | Yes |

### FE-006: Product Analytics (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 6.1 | Integrate PostHog/Mixpanel SDK | 4 | None | Yes |
| 6.2 | Add page view tracking | 2 | 6.1 | Yes |
| 6.3 | Track signup event | 2 | 6.2 | Yes |
| 6.4 | Track login event | 1 | 6.2 | Yes |
| 6.5 | Track first build event | 2 | 6.3 | Yes |
| 6.6 | Track subscription event | 2 | 6.4 | Yes |
| 6.7 | Track project creation event | 1 | 6.5 | Yes |
| 6.8 | Link user identity in analytics | 4 | 6.1 | Yes |
| 6.9 | Create conversion funnel dashboard | 8 | 6.8 | Yes |
| 6.10 | Write analytics integration tests | 2 | 6.9 | Yes |

### FE-007: SEO Meta Tags (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 7.1 | Add meta description tag to index.html | 1 | None | Yes |
| 7.2 | Add Open Graph tags | 2 | 7.1 | Yes |
| 7.3 | Add Twitter Card tags | 1 | 7.2 | Yes |
| 7.4 | Add JSON-LD structured data | 4 | None | Yes |
| 7.5 | Generate sitemap.xml | 3 | None | Yes |
| 7.6 | Create robots.txt | 1 | None | Yes |
| 7.7 | Add canonical URLs to all pages | 2 | None | Yes |
| 7.8 | Verify with Google Search Console | 2 | 7.7 | No (human) |

---

## Epic: AI Pipeline — Task Breakdown

### AI-001: LLM Cost Tracking (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 1.1 | Create `ai_usage` collection schema | 3 | None | Yes |
| 1.2 | Implement token counting wrapper for Anthropic API | 6 | None | Yes |
| 1.3 | Store usage data per build and per user | 6 | 1.2 | Yes |
| 1.4 | Implement daily/weekly/monthly budget enforcement | 6 | 1.3 | Yes |
| 1.5 | Add spending alerts at 50%, 80%, 100% | 4 | 1.4 | Yes |
| 1.6 | Create spending dashboard API endpoint | 4 | 1.5 | Yes |
| 1.7 | Create admin budget management endpoint | 3 | 1.6 | Yes |
| 1.8 | Create spending dashboard UI | 6 | 1.6 | Yes |
| 1.9 | Write cost tracking tests | 2 | 1.8 | Yes |

### AI-002: Prompt Injection Protection (60h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 2.1 | Implement secondary LLM call for injection detection | 12 | None | Yes |
| 2.2 | Add system prompt reinforcement middleware | 8 | 2.1 | Yes |
| 2.3 | Implement input sanitization guardrails | 6 | 2.2 | Yes |
| 2.4 | Implement output validation guardrails | 6 | 2.3 | Yes |
| 2.5 | Add rate limiting on LLM calls per user | 6 | AI-003 | Yes |
| 2.6 | Log and alert on prompt injection attempts | 4 | 2.5 | Yes |
| 2.7 | Create blocklist for known injection patterns | 6 | 2.1 | Yes |
| 2.8 | Write prompt injection test suite | 8 | 2.7 | Yes |
| 2.9 | Document prompt injection prevention | 4 | 2.8 | No (human) |

### AI-003: LLM Rate Limiting (24h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 3.1 | Implement per-user token bucket | 6 | AI-001 | Yes |
| 3.2 | Add concurrent request limiting per user | 6 | 3.1 | Yes |
| 3.3 | Implement LLM request queue | 4 | 3.2 | Yes |
| 3.4 | Add user-facing budget exceeded message | 2 | 3.3 | Yes |
| 3.5 | Add daily budget reset cron job | 2 | 3.1 | Yes |
| 3.6 | Write LLM rate limit tests | 4 | 3.5 | Yes |

### AI-004: LLM Fallback Chain (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 4.1 | Add OpenAI API integration | 8 | None | Yes |
| 4.2 | Implement fallback chain logic (Anthropic → OpenAI → local) | 10 | 4.1 | Yes |
| 4.3 | Add circuit breaker states for each model | 6 | 4.2 | Yes |
| 4.4 | Implement automatic failover on API error/timeout | 6 | 4.3 | Yes |
| 4.5 | Add degraded mode user notification | 4 | 4.4 | Yes |
| 4.6 | Track fallback usage in analytics | 2 | 4.5 | Yes |
| 4.7 | Write fallback chain tests | 4 | 4.6 | Yes |

### AI-005: Content Moderation (60h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 5.1 | Implement secret/key scanning for generated code | 8 | None | Yes |
| 5.2 | Implement malware pattern detection | 10 | None | Yes |
| 5.3 | Implement GPL/copyright violation detection | 8 | None | Yes |
| 5.4 | Create code review queue in admin panel | 10 | 5.3 | Yes |
| 5.5 | Add manual review workflow | 8 | 5.4 | Yes |
| 5.6 | Implement automatic rejection for critical violations | 6 | 5.2 | Yes |
| 5.7 | Add false positive reporting | 4 | 5.6 | Yes |
| 5.8 | Write content moderation tests | 6 | 5.7 | Yes |

### AI-006: Circuit Breaker Graceful Degradation (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 6.1 | Replace RuntimeError with custom exception | 2 | AI-004 | Yes |
| 6.2 | Return 503 with Retry-After header | 2 | 6.1 | Yes |
| 6.3 | Add queue for delayed processing | 3 | 6.2 | Yes |
| 6.4 | Write degraded state tests | 1 | 6.3 | Yes |

### AI-007: CSP for Generated Apps (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 7.1 | Add CSP meta tag to generated HTML template | 4 | None | Yes |
| 7.2 | Restrict script-src to same-origin | 3 | 7.1 | Yes |
| 7.3 | Use sandboxed iframes for previews | 5 | 7.2 | Yes |
| 7.4 | Test XSS prevention with generated apps | 3 | 7.3 | Yes |
| 7.5 | Write CSP validation tests | 1 | 7.4 | Yes |

---

## Epic: Infrastructure — Task Breakdown

### INF-001: K8s Manifests (120h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 1.1 | Create backend Deployment manifest | 8 | None | Yes |
| 1.2 | Create frontend Deployment manifest | 6 | None | Yes |
| 1.3 | Create Celery worker Deployment manifest | 6 | None | Yes |
| 1.4 | Create Redis Deployment manifest | 4 | None | Yes |
| 1.5 | Create MongoDB statefulset with replica set | 12 | None | Yes |
| 1.6 | Create Service manifests for all deployments | 8 | 1.1-1.5 | Yes |
| 1.7 | Create Ingress manifest with TLS config | 8 | 1.6 | Yes |
| 1.8 | Create ConfigMaps for configuration | 4 | 1.7 | Yes |
| 1.9 | Create Secret manifests (with placeholder values) | 4 | 1.8 | Yes |
| 1.10 | Create HPA manifests for backend/frontend | 6 | 1.1 | Yes |
| 1.11 | Create PVC manifests for persistent storage | 6 | 1.5 | Yes |
| 1.12 | Create Namespace manifests (prod, staging, dev) | 2 | None | Yes |
| 1.13 | Create Terraform cloud infrastructure scripts | 16 | None | Yes |
| 1.14 | Create Helm chart structure | 12 | 1.12 | Yes |
| 1.15 | Validate manifests with kubectl dry-run | 4 | 1.14 | Yes |
| 1.16 | Create deployment documentation | 8 | 1.15 | No (human) |

### INF-002: Monitoring & Alerting (80h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 2.1 | Add Prometheus metrics endpoint to FastAPI | 6 | None | Yes |
| 2.2 | Add custom business metrics (builds, users, credits) | 6 | 2.1 | Yes |
| 2.3 | Deploy Prometheus stack (via Helm) | 8 | None | Yes |
| 2.4 | Deploy Grafana (via Helm) | 6 | 2.3 | Yes |
| 2.5 | Create Grafana dashboard: API performance | 8 | 2.4 | Yes |
| 2.6 | Create Grafana dashboard: System resources | 6 | 2.5 | Yes |
| 2.7 | Create Grafana dashboard: Build pipeline | 6 | 2.6 | Yes |
| 2.8 | Create Grafana dashboard: Business metrics | 6 | 2.7 | Yes |
| 2.9 | Configure alerting rules (error rate, latency, resources) | 8 | 2.2 | Yes |
| 2.10 | Integrate PagerDuty/OpsGenie for alerts | 4 | 2.9 | Yes |
| 2.11 | Set up synthetic uptime monitoring | 4 | 2.10 | Yes |
| 2.12 | Set up certificate expiry monitoring | 2 | 2.11 | Yes |
| 2.13 | Write monitoring test | 2 | 2.12 | Yes |

### INF-003: Secrets Management (60h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 3.1 | Choose and set up secrets manager (AWS Secrets Manager) | 8 | None | Yes |
| 3.2 | Migrate all secrets from .env to secrets manager | 8 | 3.1 | Yes |
| 3.3 | Update app to retrieve secrets from vault at startup | 12 | 3.2 | Yes |
| 3.4 | Configure CI/CD to retrieve secrets from vault | 8 | 3.3 | Yes |
| 3.5 | Implement secret rotation (30/90 day schedule) | 8 | 3.4 | Yes |
| 3.6 | Add secret access audit logging | 6 | 3.5 | Yes |
| 3.7 | Update .env.example without real secrets | 2 | 3.2 | Yes |
| 3.8 | Write secrets management documentation | 4 | 3.7 | No (human) |

### INF-004: Docker Tagging (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 4.1 | Add semantic version tagging in CI script | 2 | None | Yes |
| 4.2 | Add git SHA tagging in CI script | 1 | 4.1 | Yes |
| 4.3 | Update CI to tag images automatically | 2 | 4.2 | Yes |
| 4.4 | Add version manifest endpoint to API | 2 | None | Yes |
| 4.5 | Write image tagging documentation | 1 | 4.4 | No (human) |

### INF-005: Database Backup Strategy (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 5.1 | Schedule automated daily backup via cron | 4 | None | Yes |
| 5.2 | Implement point-in-time recovery (oplog) | 8 | DB-001 | Yes |
| 5.3 | Create backup verification script (restore to test) | 6 | 5.2 | Yes |
| 5.4 | Configure cross-region backup storage | 4 | 5.3 | Yes |
| 5.5 | Implement backup retention (30 daily, 12 monthly) | 4 | 5.4 | Yes |
| 5.6 | Add backup failure alerting | 2 | 5.5 | Yes |
| 5.7 | Document restore procedure | 4 | 5.6 | No (human) |
| 5.8 | Test full restore process | 6 | 5.7 | No (human) |

### INF-006: Graceful Degradation Strategy (24h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 6.1 | Document degradation modes for each dependency | 6 | None | No (human) |
| 6.2 | Implement circuit breakers for all external dependencies | 8 | INF-002 | Yes |
| 6.3 | Add fallback data for read operations | 4 | 6.2 | Yes |
| 6.4 | Create user-facing degraded state indicators | 4 | 6.3 | Yes |
| 6.5 | Write degradation tests | 2 | 6.4 | Yes |

### INF-007: Per-User Rate Limiting (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 7.1 | Add user_id to rate limit key | 4 | None | Yes |
| 7.2 | Implement plan-tier differentiated limits | 4 | 7.1 | Yes |
| 7.3 | Add rate limit response headers | 2 | 7.2 | Yes |
| 7.4 | Update rate limit error response | 2 | 7.3 | Yes |
| 7.5 | Write per-user rate limit tests | 4 | 7.4 | Yes |

### INF-008: Connection Pool Monitoring (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 8.1 | Expose pool metrics via Prometheus | 4 | INF-002 | Yes |
| 8.2 | Set up pool utilization alerts (80%, 95%) | 3 | 8.1 | Yes |
| 8.3 | Add pool dashboard to Grafana | 3 | 8.2 | Yes |
| 8.4 | Implement configurable pool sizing | 3 | None | Yes |
| 8.5 | Write pool monitoring tests | 2 | 8.4 | Yes |

---

## Epic: Database — Task Breakdown

### DB-001: MongoDB Replica Set (80h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 1.1 | Create K8s statefulset for 3-node MongoDB | 16 | INF-001 | Yes |
| 1.2 | Configure replica set initiation script | 8 | 1.1 | Yes |
| 1.3 | Update connection string for replica set | 4 | 1.2 | Yes |
| 1.4 | Set write concern to majority | 2 | 1.3 | Yes |
| 1.5 | Configure read from secondaries where acceptable | 4 | 1.4 | Yes |
| 1.6 | Test automatic failover | 8 | 1.5 | Yes |
| 1.7 | Implement data migration (single → replica set) | 12 | 1.6 | Yes |
| 1.8 | Update backup to run from secondary | 4 | 1.7 | Yes |
| 1.9 | Document replica set operations | 4 | 1.8 | No (human) |

### DB-002: Database Migration System (60h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 2.1 | Set up migration tool (Alembic for MongoDB) | 8 | None | Yes |
| 2.2 | Create initial migration (all existing indexes) | 12 | 2.1 | Yes |
| 2.3 | Remove `_ensure_indexes()` from application startup | 4 | 2.2 | Yes |
| 2.4 | Implement migration-on-deployment pipeline | 8 | 2.3 | Yes |
| 2.5 | Create migration rollback procedure | 6 | 2.4 | Yes |
| 2.6 | Add migration status endpoint | 4 | 2.5 | Yes |
| 2.7 | Write migration tests | 6 | 2.6 | Yes |
| 2.8 | Document migration workflow | 4 | 2.7 | No (human) |

### DB-003: Data Retention (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 3.1 | Document data retention policy for all collections | 6 | None | No (human) |
| 3.2 | Add TTL indexes for time-series data | 8 | DB-002 | Yes |
| 3.3 | Implement archival process to cold storage | 12 | 3.2 | Yes |
| 3.4 | Add data purge confirmation workflow | 6 | 3.3 | Yes |
| 3.5 | Configure retention periods per data type | 4 | 3.1 | Yes |
| 3.6 | Write data retention tests | 4 | 3.5 | Yes |

### DB-004: GDPR Cascade Deletion (24h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 4.1 | Audit all collections with user data | 4 | None | Yes |
| 4.2 | Add cascade delete for subscriptions | 2 | 4.1 | Yes |
| 4.3 | Add cascade delete for invitations | 2 | 4.1 | Yes |
| 4.4 | Add cascade delete for credit purchases | 2 | 4.1 | Yes |
| 4.5 | Add cascade delete for analytics events | 2 | 4.1 | Yes |
| 4.6 | Add cascade delete for notifications | 2 | 4.1 | Yes |
| 4.7 | Implement audit log anonymization (not deletion) | 3 | 4.2 | Yes |
| 4.8 | Add deletion confirmation email | 2 | 4.7 | Yes |
| 4.9 | Add data export before deletion | 3 | 4.8 | Yes |
| 4.10 | Write GDPR compliance tests | 2 | 4.9 | Yes |

---

## Epic: DevOps — Task Breakdown

### DEVOPS-001: CI Pipeline Fix (8h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 1.1 | Remove `continue-on-error: true` from frontend build | 0.5 | None | Yes |
| 1.2 | Fix existing TypeScript errors | 4 | FE-004 | Yes |
| 1.3 | Add linting step to CI pipeline | 2 | 1.2 | Yes |
| 1.4 | Add PR merge check for CI status | 1 | 1.3 | Yes |
| 1.5 | Write CI validation test | 0.5 | 1.4 | Yes |

### DEVOPS-002: K8s Ingress/TLS (24h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 2.1 | Deploy nginx-ingress controller | 4 | INF-001 | Yes |
| 2.2 | Configure Ingress rules for backend and frontend | 6 | 2.1 | Yes |
| 2.3 | Set up cert-manager for Let's Encrypt | 6 | 2.2 | Yes |
| 2.4 | Configure WebSocket support in ingress | 3 | 2.3 | Yes |
| 2.5 | Add HTTP → HTTPS redirect | 2 | 2.4 | Yes |
| 2.6 | Add HSTS headers | 1 | 2.5 | Yes |
| 2.7 | Write ingress validation tests | 2 | 2.6 | Yes |

### DEVOPS-003: HPA (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 3.1 | Create HPA manifest for backend service | 3 | INF-001 | Yes |
| 3.2 | Create HPA manifest for frontend service | 3 | INF-001 | Yes |
| 3.3 | Create HPA manifest for Celery workers | 3 | INF-001 | Yes |
| 3.4 | Add queue-depth custom metric for Celery | 4 | 3.3 | Yes |
| 3.5 | Configure scale-down delay | 1 | 3.4 | Yes |
| 3.6 | Add HPA dashboard to Grafana | 1 | 3.5 | Yes |
| 3.7 | Write HPA tests | 1 | 3.6 | Yes |

### DEVOPS-004: Zero-Downtime Deployments (16h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 4.1 | Configure rolling update strategy (maxSurge: 25%, maxUnavailable: 0) | 2 | INF-001 | Yes |
| 4.2 | Add readiness probes to all deployments | 4 | 4.1 | Yes |
| 4.3 | Add liveness probes to all deployments | 4 | 4.2 | Yes |
| 4.4 | Create PodDisruptionBudget (minAvailable: 2) | 2 | 4.3 | Yes |
| 4.5 | Create rollback script | 2 | 4.4 | Yes |
| 4.6 | Write zero-downtime deployment test | 2 | 4.5 | Yes |

### DEVOPS-005: Docker Compose Parity (24h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 5.1 | Add Celery worker to Docker Compose | 4 | None | Yes |
| 5.2 | Add MongoDB replica set (3 nodes) to Docker Compose | 6 | None | Yes |
| 5.3 | Add Prometheus + Grafana to Docker Compose | 4 | None | Yes |
| 5.4 | Configure hot-reload for frontend and backend | 4 | 5.1 | Yes |
| 5.5 | Add development seeds and fixtures | 4 | 5.2 | Yes |
| 5.6 | Update setup documentation | 2 | 5.5 | No (human) |

---

## Epic: Testing — Task Breakdown

### TEST-001: Comprehensive Test Suite (200h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 1.1 | Set up pytest configuration with coverage reporting | 4 | None | Yes |
| 1.2 | Write tests for auth endpoints (login, register, refresh, logout) | 20 | None | Yes |
| 1.3 | Write tests for project CRUD endpoints | 16 | None | Yes |
| 1.4 | Write tests for build endpoints | 16 | None | Yes |
| 1.5 | Write tests for webhook endpoints | 12 | None | Yes |
| 1.6 | Write tests for billing endpoints | 12 | None | Yes |
| 1.7 | Write tests for admin endpoints | 12 | None | Yes |
| 1.8 | Write tests for analytics endpoints | 8 | None | Yes |
| 1.9 | Write tests for GDPR endpoints | 8 | None | Yes |
| 1.10 | Write tests for core security module | 12 | None | Yes |
| 1.11 | Write tests for encryption module | 6 | None | Yes |
| 1.12 | Write tests for configuration module | 4 | None | Yes |
| 1.13 | Write integration tests with test containers for MongoDB | 16 | 1.2 | Yes |
| 1.14 | Write integration tests with test Redis | 8 | 1.13 | Yes |
| 1.15 | Write E2E tests with Playwright (registration flow) | 12 | None | Yes |
| 1.16 | Write E2E tests with Playwright (build creation flow) | 12 | None | Yes |
| 1.17 | Write E2E tests with Playwright (admin panel) | 8 | None | Yes |
| 1.18 | Set up parallel test execution in CI | 6 | 1.1 | Yes |
| 1.19 | Add coverage gates to CI pipeline | 4 | 1.18 | Yes |
| 1.20 | Set up test reporting dashboard | 4 | 1.19 | Yes |

### TEST-002: Performance & Chaos Tests (80h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 2.1 | Set up k6 load testing framework | 4 | TEST-001 | Yes |
| 2.2 | Write k6 test for auth endpoints | 6 | 2.1 | Yes |
| 2.3 | Write k6 test for build creation | 8 | 2.1 | Yes |
| 2.4 | Write k6 test for project CRUD | 6 | 2.1 | Yes |
| 2.5 | Write database stress test | 8 | 2.2 | Yes |
| 2.6 | Write Redis rate limiting stress test | 4 | 2.5 | Yes |
| 2.7 | Set up chaos mesh/experiments | 10 | None | Yes |
| 2.8 | Write pod failure chaos test | 6 | 2.7 | Yes |
| 2.9 | Write network latency chaos test | 6 | 2.8 | Yes |
| 2.10 | Write database failover chaos test | 6 | 2.9 | Yes |
| 2.11 | Document performance baseline | 8 | 2.10 | No (human) |
| 2.12 | Set up scheduled load test in CI | 4 | 2.11 | Yes |
| 2.13 | Set up performance regression detection | 4 | 2.12 | Yes |

---

## Epic: Observability — Task Breakdown

### OBS-001: Structured Logging (80h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 1.1 | Add `structlog` dependency and configuration | 6 | None | Yes |
| 1.2 | Configure JSON log format for all loggers | 8 | 1.1 | Yes |
| 1.3 | Add log level configuration per environment | 4 | 1.2 | Yes |
| 1.4 | Update all `print()` / `logging` calls to structured logging | 12 | 1.3 | Yes |
| 1.5 | Add OpenTelemetry FastAPI instrumentation | 8 | None | Yes |
| 1.6 | Configure trace propagation to Celery tasks | 6 | 1.5 | Yes |
| 1.7 | Set up Grafana Loki for log aggregation | 8 | 1.4 | Yes |
| 1.8 | Create log viewer/explorer dashboard | 6 | 1.7 | Yes |
| 1.9 | Configure log retention policy | 4 | 1.8 | Yes |
| 1.10 | Write structured logging unit tests | 4 | 1.9 | Yes |

### OBS-004: APM Implementation (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 4.1 | Set up OpenTelemetry Collector | 6 | OBS-001 | Yes |
| 4.2 | Configure APM dashboard (latency breakdown) | 8 | 4.1 | Yes |
| 4.3 | Add database query tracing | 6 | 4.2 | Yes |
| 4.4 | Add external API call tracing (LLM, Stripe) | 4 | 4.3 | Yes |
| 4.5 | Set up error tracking and exception monitoring | 6 | 4.4 | Yes |
| 4.6 | Configure performance alerts for slow endpoints | 4 | 4.5 | Yes |
| 4.7 | Write APM integration tests | 2 | 4.6 | Yes |

---

## Epic: Business — Task Breakdown

### BUS-001: ToS & Privacy Policy (80h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 1.1 | Draft Terms of Service | 20 | None | No (legal) |
| 1.2 | Draft Privacy Policy | 16 | None | No (legal) |
| 1.3 | Legal review of documents | 16 | 1.2 | No (legal) |
| 1.4 | Add consent checkbox to registration form | 6 | 1.3 | Yes |
| 1.5 | Store consent records (user_id, version, timestamp) | 6 | 1.4 | Yes |
| 1.6 | Display ToS/Privacy in footer | 4 | 1.5 | Yes |
| 1.7 | Add version tracking for legal documents | 4 | 1.6 | Yes |
| 1.8 | Implement policy change notification | 4 | 1.7 | Yes |

### BUS-002: Stripe Configuration (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 2.1 | Create Stripe products in dashboard | 4 | None | No (human) |
| 2.2 | Create Stripe prices (monthly, annual) | 4 | 2.1 | No (human) |
| 2.3 | Update PLAN_PRICES map with real IDs | 4 | 2.2 | Yes |
| 2.4 | Move price IDs to environment variables | 2 | 2.3 | Yes |
| 2.5 | Create price sync script | 8 | 2.4 | Yes |
| 2.6 | Add graceful error handling for invalid prices | 4 | 2.5 | Yes |
| 2.7 | Add test mode prices for development | 4 | 2.6 | Yes |
| 2.8 | Write Stripe integration tests | 6 | 2.7 | Yes |

### BUS-003: SLA (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 3.1 | Define SLA tiers (99.9% Pro, 99.95% Enterprise) | 4 | None | No (human) |
| 3.2 | Draft SLA document | 12 | 3.1 | No (legal) |
| 3.3 | Legal review of SLA | 8 | 3.2 | No (legal) |
| 3.4 | Implement SLA uptime tracking | 8 | INF-002 | Yes |
| 3.5 | Create SLA compliance report generation | 4 | 3.4 | Yes |
| 3.6 | Publish SLA on website | 4 | 3.5 | Yes |

### BUS-004: Support System (60h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 4.1 | Set up Intercom/Zendesk account | 4 | None | No (human) |
| 4.2 | Integrate support widget in frontend | 8 | 4.1 | Yes |
| 4.3 | Create status page (status.forge.ai) | 12 | None | Yes |
| 4.4 | Build knowledge base with FAQ | 16 | None | No (human) |
| 4.5 | Set up ticket tracking and routing | 8 | 4.2 | Yes |
| 4.6 | Document escalation procedures | 6 | 4.5 | No (human) |

### BUS-005: Landing Page (60h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 5.1 | Design hero section with value proposition | 8 | None | No (design) |
| 5.2 | Build hero section component | 6 | 5.1 | Yes |
| 5.3 | Build feature comparison table | 8 | None | Yes |
| 5.4 | Build pricing section | 6 | BUS-002 | Yes |
| 5.5 | Add testimonials/social proof section | 6 | None | Yes |
| 5.6 | Add clear CTA buttons | 4 | 5.4 | Yes |
| 5.7 | Optimize for Lighthouse score >90 | 8 | 5.6 | Yes |
| 5.8 | Implement A/B testing framework | 8 | 5.7 | Yes |
| 5.9 | Write landing page tests | 4 | 5.8 | Yes |

### BUS-006: API Documentation (40h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 6.1 | Write API overview and getting started guide | 6 | BE-004 | No (human) |
| 6.2 | Document authentication (JWT, API keys, WebSocket) | 6 | None | No (human) |
| 6.3 | Document all API endpoints with examples | 12 | None | Yes |
| 6.4 | Document webhook events | 4 | None | Yes |
| 6.5 | Document rate limits and error codes | 4 | None | Yes |
| 6.6 | Add SDK code examples (Python, JS, cURL) | 6 | None | Yes |
| 6.7 | Create API changelog | 2 | None | Yes |

### BUS-007: Credit Race Condition (24h)

| # | Task | Est. Hours | Dependencies | AI-Ready |
|---|------|------------|--------------|----------|
| 7.1 | Wrap credit operations in MongoDB transactions | 8 | DB-001 | Yes |
| 7.2 | Implement idempotency key for builds | 6 | 7.1 | Yes |
| 7.3 | Return existing build on duplicate request | 4 | 7.2 | Yes |
| 7.4 | Make refund logic atomic | 4 | 7.3 | Yes |
| 7.5 | Write race condition tests | 2 | 7.4 | Yes |

---

## Summary

| Epic | Total Tasks | Total Hours | AI-Ready Tasks | Human Tasks |
|------|-------------|-------------|----------------|-------------|
| Security | 74 | 264 | 72 | 2 |
| Backend | 57 | 276 | 55 | 2 |
| Frontend | 55 | 344 | 53 | 2 |
| AI Pipeline | 43 | 248 | 42 | 1 |
| Infrastructure | 42 | 364 | 39 | 3 |
| Database | 27 | 204 | 25 | 2 |
| DevOps | 24 | 88 | 23 | 1 |
| Testing | 33 | 280 | 32 | 1 |
| Observability | 17 | 120 | 17 | 0 |
| Business | 33 | 344 | 22 | 11 |
| **Total** | **405** | **2,532** | **380** | **25** |

> **Note:** Human tasks primarily involve legal review, design decisions, documentation writing, and testing with screen readers / accessibility tools.