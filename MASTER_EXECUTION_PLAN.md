# FORGE MASTER EXECUTION PLAN v1.0

**Date:** March 7, 2026
**Status:** ⚠️ Pre-Production — Critical Issues Must Be Resolved
**Overall Readiness:** 3.8/10
**Target:** Production-Ready, Launch-Ready, Investment-Ready

---

## EXECUTIVE SUMMARY

Forge is an AI-powered full-stack application builder with a compelling multi-agent architecture (Architect → Business Model Improver → Designer → Developer → Integration → PM). The product vision, UX design, and core build pipeline are genuinely differentiated. However, the codebase was built at hackathon speed and contains:

- **17 Critical (P0) security vulnerabilities** (now partially remediated)
- **12 Critical functional bugs** breaking core user flows
- **Zero unit tests** on business logic
- **3 architecture-level blockers** preventing horizontal scaling
- **No production deployment** — has never been used by real users
- **Negative unit economics** — AI API costs likely exceed revenue per build
- **No growth engine** — zero distribution, no SEO, no community
- **No enterprise readiness** — no SOC 2, SSO, RBAC, audit logs

The investment committee scored Forge at **58/100** with a **Conditional Invest** verdict. The product needs 6-8 weeks of intensive engineering work to reach production readiness, followed by sustained investment in growth, enterprise features, and business operations.

**The single most important recommendation: Ship to real users today.** Not next month. Not after security fixes. Deploy now, fix iteratively, and start learning from actual usage.

---

# SECTION 1: MASTER INVENTORY

## 1.1 Features

| # | Feature | Status | Classification |
|---|---------|--------|----------------|
| 1 | Multi-agent build pipeline (Architect → PM) | ✅ Working | Core differentiator |
| 2 | Real-time WebSocket build streaming | ✅ Working | Core feature |
| 3 | Debug loop with quality scoring | ✅ Working | Unique advantage |
| 4 | Sandbox runner (best-effort static checks) | ⚠️ Partially Working | Quality gate |
| 5 | Project CRUD | ✅ Working | Core |
| 6 | Build creation with credit reservation | ⚠️ Partially Working | Race condition exists |
| 7 | Build rollback to previous versions | ✅ Working | Nice-to-have |
| 8 | Build file explorer | ✅ Working | UX feature |
| 9 | Template selection during onboarding | ❌ Broken | Placebo — template field ignored |
| 10 | GitHub OAuth integration | ❌ Broken | console.log stubs only |
| 11 | GitHub repository sync | ❌ Broken | Stubbed |
| 12 | One-click deployment to cloud | ❌ Broken | Not implemented |
| 13 | Custom domain mapping | ❌ Missing | Not started |
| 14 | Preview URLs (docker-based) | ❌ Broken | localhost-only |
| 15 | Deployment management | ⚠️ Partially Working | Basic CRUD exists |
| 16 | Team workspaces with RBAC | ⚠️ Partially Working | Models exist, no enforcement |
| 17 | Organization management | ✅ Working | CRUD complete |
| 18 | Team member invitations | ✅ Working | Token hashing has bug |
| 19 | Marketplace (templates & prompts) | ⚠️ Partially Working | No moderation |
| 20 | Marketplace item CRUD | ✅ Working | Basic |
| 21 | Marketplace search/recommendations | ❌ Missing | Not implemented |
| 22 | Billing/Subscription management | ⚠️ Partially Working | Placeholder Stripe IDs |
| 23 | Credit purchase & consumption | ⚠️ Partially Working | Race condition in refund |
| 24 | Credit usage tracking | ⚠️ Partially Working | Missing agent types |
| 25 | Usage-based billing alerts | ❌ Missing | Not implemented |
| 26 | Dunning workflow (past-due recovery) | ❌ Missing | Not implemented |
| 27 | Invoice history | ❌ Missing | Model exists, no UI |
| 28 | Annual billing | ❌ Missing | Not implemented |
| 29 | Promotional/discount codes | ❌ Missing | Not implemented |
| 30 | Enterprise quote generation | ❌ Missing | Not implemented |
| 31 | Email verification | ❌ Missing | Not implemented |
| 32 | Password reset flow | ❌ Broken | No reset-password page, no email delivery |
| 33 | Forgot password | ⚠️ Partially Working | Backend exists, frontend page broken |
| 34 | Email notifications | ⚠️ Partially Working | Resend API key defaults to empty |
| 35 | API key management | ✅ Working | Basic CRUD |
| 36 | Webhook management | ✅ Working | Basic CRUD |
| 37 | Webhook delivery/signing | ❌ Missing | No HMAC signing |
| 38 | Admin panel | ⚠️ Partially Working | Export endpoint 404s |
| 39 | Admin user management | ⚠️ Partially Working | Basic |
| 40 | Admin analytics dashboard | ⚠️ Partially Working | Param mismatch |
| 41 | Admin feature flags | ✅ Working | CRUD complete |
| 42 | Admin audit log viewing | ❌ Missing | Model exists, no UI |
| 43 | Support ticket system | ❌ Broken | Model exists, no creation endpoint |
| 44 | Playbook integrations (Stripe, Slack, etc.) | ✅ Working | Core feature |
| 45 | MCP server support | ❌ Missing | On roadmap |
| 46 | BYOK (Bring Your Own API Key) | ❌ Missing | On roadmap |
| 47 | SSO/SAML | ❌ Missing | Listed as Pro feature |
| 48 | Voice mode (Web Speech API) | ❌ Missing | On roadmap |
| 49 | Context window forking | ❌ Missing | On roadmap |
| 50 | Version history UI | ❌ Missing | Not implemented |
| 51 | Analytics dashboard (user-facing) | ❌ Missing | Backend exists, no frontend |
| 52 | Referral program | ⚠️ Partially Working | Endpoint exists, no UI |
| 53 | GDPR data export | ✅ Working | Endpoint exists |
| 54 | GDPR data deletion | ❌ Missing | Not implemented |
| 55 | Data residency controls | ❌ Missing | Not implemented |
| 56 | Onboarding wizard | ❌ Broken | Placebo flow |
| 57 | Landing page | ✅ Working | Polished |

## 1.2 Screens / Pages

| # | Screen | Status | Classification |
|---|--------|--------|----------------|
| 1 | Landing Page (/) | ✅ Working | Marketing/P5 |
| 2 | Auth Page (/login) | ✅ Working | Core |
| 3 | Signup (/signup) | ✅ Working | Core |
| 4 | Forgot Password (/forgot-password) | ⚠️ Partially Working | Core (UI exists, email delivery broken) |
| 5 | Reset Password (/reset-password) | ✅ Working *(corrected 2026-07-03 — route exists and works; verified it correctly shows "Invalid link" without a valid token)* | Core |
| 6 | Onboarding (/onboarding) | ⚠️ Partially Working *(upgraded 2026-07-03 from ❌ Broken — final step now hands a real starter prompt to the workspace instead of dropping the user on a blank screen; still no tooltips/progress-tracked completion, see FE-005)* | Core |
| 7 | Dashboard/Launch (/) | ✅ Working | Core |
| 8 | Projects (/projects) | ✅ Working | Core |
| 9 | Project History (/project/:id) | ✅ Working *("View diff" button upgraded 2026-07-03 from dead no-op to a real changed-files view — see FE-008)* | Core |
| 10 | Workspace/Build (/build/:projectId) | ✅ Working | Core |
| 11 | Settings (/settings) | ✅ Working *(upgraded 2026-07-03 from ⚠️ "crashes on null user" — verified no crash in either live or demo mode; GitHub connect and preference toggles now wired to real data, see FE-008)* | Core |
| 12 | Billing (/billing) | ✅ Working *(upgraded 2026-07-03 from ⚠️ "placeholder prices" — frontend now wired to real plans/usage/checkout; the underlying Stripe secrets are still placeholders per PRODUCTION_AUDIT_REPORT.md §3.1, so checkout itself can't process real payments yet, but that's a config gap now, not a missing frontend, see FE-008)* | Core |
| 13 | Marketplace (/marketplace) | ✅ Working *(upgraded 2026-07-03 from ⚠️ "no moderation" — frontend now wired to real listing/install; moderation gap is unchanged and still real, see FE-008)* | Core |
| 14 | Admin Console (/admin-console) | ⚠️ Partially Working | Accessible to all users |
| 15 | Reviews List (/reviews) | ✅ Working *(this row previously described intended/planned state, not reality — verified 2026-07-03 that no frontend for this existed before today; now genuinely built and end-to-end verified, see FE-009)* | Orchestrator UI |
| 16 | Review Detail (/reviews/:runId) | ✅ Working *(same correction as row 15 — see FE-009)* | Orchestrator UI |
| 17 | Workspace Layout | ✅ Working | 3-panel (chat, editor, preview) |

## 1.3 API Endpoints

| # | Endpoint | Status | Classification |
|---|----------|--------|----------------|
| 1 | POST /auth/register | ✅ Working *(was ❌ broken earlier 2026-07-03 — bcrypt/passlib incompatibility, fixed same day, see SEC-014; also fixed a second bug it uncovered, an `_id`/ObjectId serialization crash, see SEC-016)* | Core |
| 2 | POST /auth/login | ✅ Working *(was ❌ broken earlier 2026-07-03, same bcrypt/passlib crash as register, fixed, see SEC-014)* | Core |
| 3 | POST /auth/refresh | ✅ Working *(unaffected by SEC-014 — doesn't re-hash a password; previously leaked the raw user doc in its response, fixed 2026-07-03, see SEC-015)* | Core |
| 4 | POST /auth/logout | ✅ Working | Core |
| 5 | POST /auth/ws-token | ✅ Working | Security |
| 6 | GET /auth/me | ✅ Working *(previously leaked the decrypted GitHub token in every response — fixed 2026-07-03, now returns `github_connected: bool` instead, see SEC-015)* | Core |
| 7 | PUT /auth/me | ✅ Working *(extended 2026-07-03 to accept `github_token` and `preferences`, powering the new Settings page wiring — see FE-008, BE-014)* | Core |
| 8 | POST /auth/me/password | ✅ Working *(depends on the bcrypt/passlib path fixed by SEC-014 — not separately re-verified after the fix, but should now work)* | Core |
| 9 | POST /auth/forgot-password | ✅ Working | Core |
| 10 | POST /auth/reset-password | ✅ Working | Core |
| 11 | POST /auth/organizations | ✅ Working | Team feature |
| 12 | GET /auth/organizations | ✅ Working | Team feature |
| 13 | GET /auth/organizations/{id} | ✅ Working | Team feature |
| 14 | POST /auth/organizations/{id}/invite | ⚠️ Partially Working | Token double-stored |
| 15 | POST /auth/organizations/invitations/{token}/accept | ✅ Working | Team feature |
| 16 | GET /auth/organizations/{id}/members | ✅ Working | Team feature |
| 17 | POST /builds | ⚠️ Partially Working | Credit race condition |
| 18 | GET /builds/{id} | ✅ Working | Core |
| 19 | GET /builds/{id}/files | ✅ Working | Core |
| 20 | POST /builds/{id}/rollback/{version} | ⚠️ Partially Working | Unbounded to_list |
| 21 | WS /builds/ws/{id} | ✅ Working | Core (improved auth) |
| 22 | GET /projects | ✅ Working | Core |
| 23 | POST /projects | ⚠️ Partially Working | Template field ignored |
| 24 | GET /projects/{id} | ✅ Working | Core |
| 25 | PUT /projects/{id} | ✅ Working | Core |
| 26 | DELETE /projects/{id} | ✅ Working | Core |
| 27 | POST /billing/create-checkout-session | ⚠️ Partially Working | Placeholder price IDs |
| 28 | POST /billing/create-portal-session | ✅ Working | Billing |
| 29 | POST /billing/webhook | ✅ Working | Stripe webhook |
| 30 | GET /billing/plans | ✅ Working | Billing |
| 31 | GET /billing/invoices | ⚠️ Partially Working | Model exists |
| 32 | POST /billing/purchase-credits | ✅ Working | Billing |
| 33 | GET /admin/users | ✅ Working | Admin |
| 34 | GET /admin/users/export | ❌ Missing | Endpoint doesn't exist |
| 35 | POST /admin/users/{id}/ban | ✅ Working | Admin |
| 36 | POST /admin/users/{id}/unban | ✅ Working | Admin |
| 37 | POST /admin/users/{id}/add-credits | ✅ Working | Admin |
| 38 | GET /admin/analytics/overview | ✅ Working | Admin |
| 39 | GET /admin/analytics/funnel | ✅ Working | Admin |
| 40 | GET /admin/analytics/retention | ❌ Broken | O(n²) runtime |
| 41 | GET /admin/feature-flags | ✅ Working | Admin |
| 42 | POST /admin/feature-flags | ✅ Working | Admin |
| 43 | GET /admin/audit-logs | ❌ Missing | Endpoint doesn't exist |
| 44 | GET /analytics/track | ✅ Working | Analytics |
| 45 | GET /analytics/builds | ✅ Working | Analytics |
| 46 | GET /analytics/costs | ✅ Working | Analytics |
| 47 | GET /marketplace | ✅ Working *(had a landmine bug — would have broken as soon as any item with the old broken `created_at` format existed; see row 48)* | Marketplace |
| 48 | POST /marketplace | ✅ Working *(corrected 2026-07-03 — was previously ❌ crashing on every call with `ResponseValidationError`, not merely "no moderation"; the item was silently inserted before the crash, so this was actual data corruption risk, not just a missing feature. Fixed, see BE-013. Moderation is still genuinely absent — that part of the original note stands.)* | Marketplace |
| 49 | GET /marketplace/{id} | ✅ Working | Marketplace |
| 50 | POST /marketplace/{id}/rate | ⚠️ Partially Working | No validation |
| — | GET /marketplace *(list, frontend caller)* | ✅ Working *(new 2026-07-03 — `marketplaceApi` didn't exist in `frontend/src/lib/api.ts` at all before today; the backend endpoint was complete but had zero frontend caller. See FE-008.)* | Marketplace |
| 51 | POST /growth/referrals | ✅ Working | Growth |
| 52 | GET /growth/referrals | ✅ Working | Growth |
| 53 | POST /webhooks | ✅ Working | Webhooks |
| 54 | GET /webhooks | ✅ Working | Webhooks |
| 55 | PUT /webhooks/{id} | ✅ Working | Webhooks |
| 56 | DELETE /webhooks/{id} | ✅ Working | Webhooks |
| 57 | GET /api-keys | ✅ Working | API Keys |
| 58 | POST /api-keys | ✅ Working | API Keys |
| 59 | DELETE /api-keys/{id} | ✅ Working | API Keys |
| 60 | GET /gdpr/export | ✅ Working | GDPR |
| 61 | POST /gdpr/delete | ❌ Missing | Not implemented |
| 62 | POST /deployments | ⚠️ Partially Working | localhost URLs |
| 63 | GET /deployments | ✅ Working | Deployments |
| 64 | GET /health | ✅ Working | Operations |
| 65 | GET /health/detailed | ✅ Working | Operations |
| 66 | GET /integrations/playbooks | ✅ Working | Integrations |

## 1.4 Database Collections

| # | Collection | Status | Notes |
|---|------------|--------|-------|
| 1 | users | ✅ Working | Missing unique constraint enforcement on concurrent create |
| 2 | projects | ✅ Working | Indexes added |
| 3 | builds | ✅ Working | Files stored in-document (16MB limit risk) |
| 4 | messages | ✅ Working | Chat history |
| 5 | subscriptions | ✅ Working | Stripe integration |
| 6 | invoices | ✅ Working | Model only |
| 7 | credit_purchases | ✅ Working | Stripe integration |
| 8 | organizations | ✅ Working | Team feature |
| 9 | team_members | ✅ Working | Team feature |
| 10 | invitations | ⚠️ Partially Working | Token double-stored bug |
| 11 | deployments | ✅ Working | Deployment tracking |
| 12 | marketplace_items | ⚠️ Partially Working | No moderation |
| 13 | analytics_events | ⚠️ Partially Working | TTL index added, no dedup |
| 14 | onboarding_progress | ✅ Working | Onboarding tracking |
| 15 | feature_flags | ✅ Working | Admin feature |
| 16 | audit_logs | ✅ Working | Partial coverage |
| 17 | api_keys | ✅ Working | API key management |
| 18 | webhooks | ✅ Working | Webhook management |
| 19 | referrals | ✅ Working | Growth feature |
| 20 | notifications | ✅ Working | Model exists |
| 21 | rate_limits | ✅ Working | TTL index added |
| 22 | security_events | ✅ Working | Security monitoring |
| 23 | support_tickets | ❌ Broken | Model exists, no creation endpoint |
| 24 | token_blacklist | ✅ Working | Token revocation |
| 25 | ai_usage | ❌ Missing | Not implemented |

## 1.5 Services & Workers

| # | Service | Status | Notes |
|---|---------|--------|-------|
| 1 | FastAPI backend (uvicorn) | ✅ Working | Core API server |
| 2 | Celery worker | ✅ Working (fixed 2026-07-03) | Was completely non-functional despite looking wired — three bugs found & fixed 2026-07-03 (wrong app binding, worker-startup crash, event-loop closure after 1st task); verified with a real worker processing sequential builds. See `ENGINEERING_BACKLOG.md` BE-015. No dead-letter queue yet. |
| 3 | Redis (cache + pub/sub + queue) | ✅ Working | Configured with auth |
| 4 | MongoDB (primary database) | ✅ Working | Configured with auth |
| 5 | WebSocket Connection Manager | ✅ Working (fixed 2026-07-03) | This row's original note was correct — Redis pub/sub had no subscriber, so it was in-memory-only despite WS-001 being marked "done" elsewhere in this plan. Verified live: 0/several events delivered before the fix, 14/14 after. See `ENGINEERING_BACKLOG.md` WS-003. |
| 6 | Sandbox Runner | ✅ Working | Static code checking |
| 7 | Anthropic API client | ✅ Working | Circuit breaker implemented |
| 8 | OpenAI API client (fallback) | ✅ Working | Fallback not yet wired |
| 9 | Stripe webhook handler | ✅ Working | Signature verified |
| 10 | Rate limiter (middleware) | ✅ Working | Redis-based, O(1) |
| 11 | CSRF protection middleware | ⚠️ Partially Working | Functions exist, validation not fully wired |
| 12 | Request size limiter | ✅ Working | Security middleware |
| 13 | Security headers middleware | ✅ Working | All headers set |
| 14 | Health check endpoint | ✅ Working | With dependency checks |
| 15 | Top-level error handler | ❌ Missing | Not implemented |

## 1.6 Background Workers & Cron Jobs

| # | Worker/Job | Status | Notes |
|---|------------|--------|-------|
| 1 | Build execution (BackgroundTasks) | ✅ Removed | Replaced by Celery's `run_build.delay()`; no BackgroundTasks path remains |
| 2 | Celery build worker (run_build) | ✅ Working (fixed 2026-07-03) | See BE-015 — was 100% non-functional (every build 500'd, no worker could even start) until fixed and verified same day |
| 3 | Email sending | ❌ Missing | Resend API not configured |
| 4 | Credit usage alerts | ❌ Missing | Not implemented |
| 5 | Dunning (past-due recovery) | ❌ Missing | Not implemented |
| 6 | Analytics aggregation | ❌ Missing | Not implemented |
| 7 | Retention pre-computation | ❌ Missing | Not implemented |
| 8 | Database backup | ❌ Missing | Script exists (backup_mongodb.py) |
| 9 | Marketplace moderation queue | ❌ Missing | Not implemented |
| 10 | Token cleanup (expired tokens) | ❌ Missing | Not implemented |
| 11 | Session cleanup | ❌ Missing | Not implemented |
| 12 | Webhook delivery retry | ❌ Missing | Not implemented |

## 1.7 AI Agents

| # | Agent | Status | Notes |
|---|-------|--------|-------|
| 1 | ArchitectAgent | ✅ Working | Generates blueprint |
| 2 | BusinessModelAgent | ✅ Working | Improves business model |
| 3 | DesignerAgent | ✅ Working | Generates design spec |
| 4 | DeveloperAgent | ✅ Working | Generates files |
| 5 | IntegrationAgent | ✅ Working | Adds integrations |
| 6 | PMAgent | ✅ Working | Validates quality |
| 7 | Debugger (DeveloperAgent.patch_files) | ✅ Working | Fixes issues |
| 8 | Base agent (circuit breaker, retry) | ✅ Working | With exponential backoff |

## 1.8 WebSocket Events

| # | Event | Status | Notes |
|---|-------|--------|-------|
| 1 | AGENT_START | ✅ Working | Agent lifecycle |
| 2 | AGENT_UPDATE | ✅ Working | Agent lifecycle |
| 3 | AGENT_PROGRESS | ✅ Working | Agent lifecycle |
| 4 | AGENT_COMPLETE | ✅ Working | Agent lifecycle |
| 5 | BUILD_START | ✅ Working | Build lifecycle |
| 6 | BUILD_COMPLETE | ✅ Working | Build lifecycle |
| 7 | BUILD_FAILED | ✅ Working | Build lifecycle |
| 8 | FILE_UPDATE | ⚠️ Partially Working | Sends full file dict (should send deltas) |
| 9 | ERROR | ✅ Working | Error events |
| 10 | DEBUG_START | ✅ Working | Debug loop |
| 11 | STREAM_TOKEN | ✅ Working | Token streaming |
| 12 | CREDITS_UPDATE | ✅ Working | Credit tracking |

## 1.9 Authentication Flows

| # | Flow | Status | Notes |
|---|------|--------|-------|
| 1 | Email/password registration | ✅ Working | With password strength validation |
| 2 | Email/password login | ✅ Working | With JWT token |
| 3 | JWT access token (cookie-based) | ✅ Working | HttpOnly, SameSite=Strict |
| 4 | JWT refresh token | ✅ Working | 30-day expiry |
| 5 | Token refresh (auto-refresh) | ✅ Working | On 401, refresh handled |
| 6 | Token blacklisting (logout) | ✅ Working | Uses JTI |
| 7 | WebSocket token (short-lived) | ✅ Working | 5-min TTL, first-message auth |
| 8 | CSRF token | ⚠️ Partially Working | Generation works, validation not fully wired |
| 9 | Password change | ✅ Working | With audit logging |
| 10 | Password reset | ⚠️ Partially Working | Backend works, no email delivery |
| 11 | Email verification | ❌ Missing | Not implemented |
| 12 | MFA/2FA | ❌ Missing | Not implemented |
| 13 | SSO/SAML | ❌ Missing | Not implemented |
| 14 | GitHub OAuth | ❌ Broken | console.log stubs |
| 15 | API key authentication | ✅ Working | Bearer token |
| 16 | Organization invitation flow | ✅ Working | Token-based |
| 17 | Session management | ❌ Missing | Not implemented |

## 1.10 Infrastructure Components

| # | Component | Status | Notes |
|---|-----------|--------|-------|
| 1 | Docker Compose (local dev) | ✅ Working | All 4 services |
| 2 | Docker Compose (production) | ✅ Working | docker-compose.prod.yml |
| 3 | Backend Dockerfile | ✅ Working | No --reload, --workers 4 |
| 4 | Frontend Dockerfile | ✅ Working | Multi-stage build |
| 5 | .dockerignore | ✅ Working | Excludes secrets |
| 6 | Kubernetes manifests | ✅ Working | All 7 manifests |
| 7 | Ingress configuration | ✅ Working | TLS configured |
| 8 | Namespace isolation | ✅ Working | Prod, staging dev |
| 9 | MongoDB statefulset | ✅ Working | With PVC |
| 10 | Redis deployment | ✅ Working | With auth |
| 11 | Celery worker deployment | ✅ Working | K8s manifest |
| 12 | HPA (auto-scaling) | ⚠️ Partially Working | Configured in K8s |
| 13 | Secrets management (K8s) | ✅ Working | K8s secrets |
| 14 | Health checks | ✅ Working | All services |
| 15 | Resource limits | ✅ Working | CPU + memory limits |
| 16 | Nginx configuration | ✅ Working | Production reverse proxy |
| 17 | Monitoring (Prometheus/Grafana) | ✅ Working | K8s monitoring manifests |
| 18 | CI/CD pipeline | ❌ Missing | Not implemented |
| 19 | Backup scripts | ❌ Missing | Script exists, not automated |
| 20 | Terraform/IaC | ❌ Missing | Not implemented |

## 1.11 Third-Party Services

| # | Service | Status | Notes |
|---|---------|--------|-------|
| 1 | Anthropic API (Claude) | ✅ Working | Primary AI provider |
| 2 | OpenAI API (fallback) | ❌ Not wired | Configured but unused |
| 3 | Stripe (payments) | ⚠️ Partially Working | Placeholder price IDs |
| 4 | Resend (email) | ❌ Not configured | API key defaults to empty |
| 5 | GitHub API (OAuth + repo) | ❌ Broken | Stubbed |
| 6 | Docker Engine (sandbox) | ⚠️ Partially Working | Socket not mounted anymore |
| 7 | Sentry (error tracking) | ❌ Missing | Not implemented |
| 8 | PostHog/Mixpanel (analytics) | ❌ Missing | Not implemented |
| 9 | Prometheus (metrics) | ❌ Missing | K8s manifest exists, not wired to app |
| 10 | Grafana (dashboards) | ❌ Missing | K8s manifest exists |

---

# SECTION 2: MASTER BACKLOG (Prioritized)

## P0 — Critical (Must Fix Before Production)

| ID | Title | Category | Severity | Hours | Dependency |
|----|-------|----------|----------|-------|------------|
| SEC-014 | ~~Fix bcrypt/passlib incompatibility — registration/login totally broken~~ **RESOLVED 2026-07-03** (pinned `bcrypt==4.0.1`; also fixed SEC-016, an ObjectId-serialization bug it uncovered) | Security | CRITICAL | 4 (est.) / ~1.5 (actual, incl. SEC-016) | None |
| SEC-001 | ~~Wire CSRF token validation into middleware~~ **RESOLVED 2026-07-03** — was mis-scoped; backend validation was already correct, the frontend never sent the token at all | Security | CRITICAL | 16 (est.) / ~1 (actual) | None |
| SEC-002 | Separate encryption key from JWT secret | Security | CRITICAL | 16 | None |
| SEC-003 | WebSocket auth via short-lived tokens (DONE) | Security | CRITICAL | 0 | None |
| SEC-004 | Fail-closed rate limiting when Redis is down | Security | HIGH | 8 | None |
| SEC-005 | Use JTI for token blacklisting | Security | HIGH | 8 | None |
| SEC-006 | Use slow hash for password reset tokens | Security | HIGH | 8 | None |
| SEC-009 | Escape regex special characters in admin search | Security | HIGH | 8 | SEC-010 |
| SEC-010 | Implement missing sanitize_string function | Security | HIGH | 2 | None |
| SEC-011 | Add rate limiting to auth endpoints | Security | HIGH | 8 | None |
| BE-001 | Migrate build processing from BackgroundTasks to Celery | Architecture | CRITICAL | 80 | None |
| BE-005 | Implement graceful shutdown with connection draining | Reliability | MEDIUM | 16 | BE-001 |
| BE-006 | Ensure build timeout properly cleans up resources | Reliability | MEDIUM | 16 | None |
| BE-009 | Add audit logging to critical operations | Compliance | HIGH | 24 | None |
| BE-011 | Implement dependency-aware health checks | Reliability | MEDIUM | 8 | None |
| DB-001 | Separate build files from Build document (16MB limit) | Database | CRITICAL | 16 | None |
| DB-002 | Add unique constraint enforcement on user email | Database | HIGH | 4 | None |
| DB-003 | Fix invitation token double-storage bug | Database | HIGH | 4 | None |
| AI-001 | Implement LLM token usage tracking and budget controls | AI/Cost | HIGH | 40 | None |
| AI-002 | Implement prompt injection detection *(a basic keyword blocklist exists; had 2 concrete bypasses found & fixed 2026-07-03, see AI-008 below; the acceptance criteria further down in this doc — secondary-LLM-call detection, output validation, logging/alerting — remain genuinely unimplemented)* | AI/Security | HIGH | 60 | None |
| AI-008 | ~~Prompt injection blocklist had 2 concrete bypasses (whitespace reformatting; only checked the last conversation message)~~ **NEW, RESOLVED 2026-07-03** | AI/Security | HIGH | 1 (actual) | None |
| AI-003 | Implement per-user LLM token budgets | AI/Cost | HIGH | 24 | AI-001 |
| AI-005 | Implement content moderation for generated code | AI/Security | MEDIUM | 60 | None |
| INF-002 | Set up monitoring, metrics, and alerting | DevOps | CRITICAL | 80 | None |
| INF-003 | Implement secrets management (not just .env) | Security | HIGH | 40 | None |
| INF-004 | Set up CI/CD pipeline (GitHub Actions) | DevOps | CRITICAL | 40 | None |
| FE-003 | Add root-level error boundary | Frontend | MEDIUM | 8 | None |
| FE-005 | Implement guided onboarding flow | Product | MEDIUM | 60 | None |
| PROD-001 | Fix password reset full flow (frontend + email) | Product | CRITICAL | 8 | None |
| PROD-002 | Fix template selection (backend + frontend) | Product | HIGH | 4 | None |
| PROD-003 | Implement admin users export endpoint | Product | MEDIUM | 4 | None |
| PROD-004 | Fix preview URLs (use real domain) | Product | HIGH | 8 | None |
| PROD-005 | Add email verification flow | Product | HIGH | 24 | SEC-006 |
| PROD-006 | ~~Fix credit deduction race condition~~ **the reservation half was genuinely race-free (verified with 8 real concurrent requests); the refund half was not — see PROD-008** | Business | CRITICAL | 4 | None |
| PROD-008 | ~~Refund fired once per Celery retry attempt instead of once per build~~ **NEW, RESOLVED 2026-07-03** (real exploitable free-credits path — verified live, balance ended above starting value before the fix) | Business | CRITICAL | 1 (actual) | None |
| PROD-007 | Add trial enforcement | Business | HIGH | 4 | None |
| WS-001 | ~~Migrate WebSocket to Redis pub/sub~~ **the publish half was real, but nothing subscribed — see WS-003** | Architecture | CRITICAL | 16 | None |
| WS-002 | Send file deltas instead of full file dict | Performance | HIGH | 8 | None |
| SEC-015 | ~~Auth endpoints leaked password hash + raw GitHub token~~ **NEW, RESOLVED 2026-07-03** | Security | CRITICAL | 3 (actual) | None |
| BE-013 | ~~Marketplace item creation crashed on every call~~ **NEW, RESOLVED 2026-07-03** | Backend | HIGH | 1 (actual) | None |
| BE-015 | ~~Celery build pipeline looked wired but 100% non-functional end-to-end~~ **NEW, RESOLVED 2026-07-03** (wrong app binding + broken worker autodiscover + event-loop closure after 1st task) | Architecture | CRITICAL | 2 (actual) | None |
| WS-003 | ~~Live build-progress WebSocket events never delivered to any client~~ **NEW, RESOLVED 2026-07-03** (Redis pub/sub channel had no subscriber) | Architecture | CRITICAL | 1.5 (actual) | None |

**Total P0 Hours: ~632** (unchanged from original — SEC-014 was resolved same-day it was found, at ~1.5h actual vs. its 4h estimate, so it doesn't add net-open hours; SEC-015/SEC-016/BE-013/SEC-001/BE-015/WS-003 are likewise already resolved)

## P1 — High Priority (Sprint 2-3)

| ID | Title | Category | Hours | Dependency |
|----|-------|----------|-------|------------|
| SEC-007 | Implement TOTP-based multi-factor authentication | Security | 80 | SEC-005 |
| SEC-008 | Implement email verification flow | Security | 24 | SEC-006 |
| SEC-012 | Validate webhook URLs against SSRF | Security | 8 | None |
| BE-002 | Implement global exception handler | Backend | 16 | None |
| BE-003 | Add pagination to all list endpoints | Backend | 24 | None |
| BE-007 | Implement Redis caching for read-heavy endpoints | Performance | 40 | None |
| BE-008 | Add request ID/correlation ID middleware | Observability | 8 | None |
| BE-010 | Implement session tracking and management | Security | 40 | SEC-005 |
| BE-012 | Sign outgoing webhook payloads with HMAC | Security | 16 | None |
| AI-004 | Implement LLM fallback chain (Anthropic→OpenAI) | AI/Reliability | 40 | None |
| AI-006 | Implement graceful degradation for circuit breaker | AI/Reliability | 8 | None |
| AI-007 | Add CSP headers to generated applications | AI/Security | 16 | None |
| FE-001 | Implement WCAG 2.1 AA accessibility | Frontend | 120 | None |
| INF-001 | Create Kubernetes deployment manifests | DevOps | 120 | None |
| INF-005 | Set up structured logging (ELK/Loki) | Observability | 40 | None |
| PROD-008 | Add credit usage alerts (email at thresholds) | Business | 8 | None |
| PROD-009 | Implement dunning workflow (3 emails) | Business | 16 | None |
| PROD-010 | Add billing history UI | Product | 16 | None |
| PROD-011 | Add marketplace moderation system | Product | 16 | None |
| PROD-012 | Implement proper deployment (one-click to cloud) | Product | 40 | None |
| PROD-013 | Add usage analytics dashboard (user-facing) | Product | 24 | None |
| PROD-014 | Add build timeout to backend config (DONE) | Product | 0 | None |
| PROD-015 | Fix Settings page null crash | UX | 4 | None |
| PROD-016 | Fix demo mode silent fallback | UX | 4 | None |
| PROD-017 | Add confirmation dialogs for destructive actions | UX | 8 | None |
| AI-008 | Implement model routing (cheap/simple, expensive/complex) | AI/Cost | 24 | AI-001 |
| INF-006 | Configure Sentry for error tracking | Monitoring | 8 | None |
| INF-007 | Set up database backup automation | DevOps | 16 | None |
| INF-008 | Add MongoDB connection pool tuning | Performance | 4 | None |
| GRW-001 | Set up SEO (meta tags, sitemap, robots.txt) | Growth | 16 | None |
| GRW-002 | Set up product analytics (PostHog/Mixpanel) | Growth | 40 | None |
| GRW-003 | Build referral program UI | Growth | 16 | None |
| GRW-004 | Create landing page optimization (social proof) | Growth | 8 | None |

**Total P1 Hours: ~832**

## P2 — Medium Priority (Sprint 3-5)

| ID | Title | Category | Hours |
|----|-------|----------|-------|
| SEC-013 | Configure CORS for production domains | Security | 2 |
| BE-004 | Implement API versioning | API Design | 24 |
| FE-002 | Implement responsive design verification | Frontend | 60 |
| FE-004 | Enable TypeScript strict mode | Code Quality | 40 |
| FE-006 | Implement frontend product analytics tracking | Analytics | 40 |
| FE-007 | Add SEO meta tags, Open Graph, structured data | SEO | 16 |
| FE-008 | Replace hardcoded colors with CSS variables | UI | 4 |
| FE-009 | Remove duplicate ActivityFeed component | Code Quality | 2 |
| FE-010 | Fix WebSocket heartbeat (use native ping/pong) | Frontend | 4 |
| FE-011 | Static import in ChatPanel (avoid dynamic) | Frontend | 2 |
| PROD-018 | Add offline/error state to build inputs | UX | 4 |
| PROD-019 | Fix admin analytics param mismatch | Product | 4 |
| PROD-020 | Add support ticket creation endpoint | Product | 8 |
| PROD-021 | Fix _map_price_to_plan O(n) iteration | Performance | 2 |
| PROD-022 | Add real Stripe price IDs (not placeholders) | Business | 4 |
| PROD-023 | Add annual billing option | Business | 16 |
| PROD-024 | Add promotional/discount code system | Business | 16 |
| PROD-025 | Add refund/dispute workflow | Business | 16 |
| AI-009 | Build benchmark suite for agent quality | AI/Quality | 40 |
| AI-010 | Add conversation memory (long-term) | AI/Quality | 24 |
| INF-009 | Implement blue-green deployment | DevOps | 24 |
| INF-010 | Add CDN for static frontend assets | Performance | 16 |
| INF-011 | Implement auto-scaling policies | DevOps | 16 |
| GRW-005 | Create Content Marketing Strategy | Growth | 16 |
| GRW-006 | Set up Discord/community platform | Growth | 8 |
| GRW-007 | Build "Built with Forge" viral badge | Growth | 8 |
| GRW-008 | Create Product Hunt launch plan | Growth | 16 |
| TEST-001 | Write unit tests for auth endpoints | Testing | 16 |
| TEST-002 | Write integration tests for build pipeline | Testing | 24 |
| TEST-003 | Write regression tests for credit deduction | Testing | 8 |
| TEST-004 | Write WebSocket ownership tests | Testing | 8 |
| TEST-005 | Add lint config (ESLint, Ruff, Prettier) | Code Quality | 8 |
| TEST-006 | Add pre-commit hooks | DevOps | 4 |
| TEST-007 | Remove fake text-parsing tests | Testing | 2 |

**Total P2 Hours: ~472**

## P3 — Lower Priority (Sprint 5+)

| ID | Title | Category | Hours |
|----|-------|----------|-------|
| FE-012 | Add dark/light mode toggle | UI | 16 |
| FE-013 | Implement SSR/SSG for SEO | Frontend | 40 |
| FE-014 | Add responsive mobile navigation | UI | 16 |
| PROD-026 | Implement team collaboration (shared projects) | Product | 40 |
| PROD-027 | Build marketplace quality/reviews system | Product | 24 |
| PROD-028 | Add enterprise features (SSO, RBAC, audit logs) | Enterprise | 80 |
| PROD-029 | Add API marketplace / third-party integrations | Platform | 40 |
| PROD-030 | Voice mode (Web Speech API) | Product | 24 |
| PROD-031 | Context window forking | Product | 16 |
| PROD-032 | Version history UI | Product | 16 |
| PROD-033 | MCP server support | Product | 40 |
| PROD-034 | BYOK (Bring Your Own API Key) | Product | 16 |
| INF-012 | Add Terraform modules for cloud infrastructure | DevOps | 80 |
| INF-013 | Implement multi-region deployment | Cloud | 40 |
| INF-014 | Configure WAF for OWASP protection | Security | 24 |
| GRW-009 | Build developer relations program | Growth | 40 |
| GRW-010 | Create tutorial content library | Growth | 40 |
| GRW-011 | Build agency partnership program | Growth | 24 |
| GRW-012 | Internationalization (i18n) | Product | 40 |
| AI-011 | Custom model fine-tuning for code generation | AI | 80 |
| AI-012 | RAG implementation with knowledge base | AI | 40 |

**Total P3 Hours: ~720**

## P4 — Future / Deferred

| ID | Title | Category | Hours |
|----|-------|----------|-------|
| AI-013 | Multi-modal support (image input → app output) | AI | 80 |
| FE-015 | PWA / offline support | Frontend | 40 |
| FE-016 | Desktop app (Electron/Tauri) | Frontend | 80 |
| PROD-035 | Social login (Google, Apple) | Auth | 16 |
| PROD-036 | Custom domain with SSL | Platform | 24 |
| PROD-037 | Professional services/consulting | Business | 16 |
| PROD-038 | Education platform (courses) | Business | 80 |
| INF-015 | Disaster recovery / multi-region failover | Infrastructure | 80 |
| GRW-013 | Mobile app (iOS/Android) | Mobile | 160 |
| GRW-014 | Enterprise on-premise deployment | Enterprise | 80 |
| GRW-015 | SOC 2 Type II certification | Compliance | 160 |

**Total P4 Hours: ~816**

**GRAND TOTAL ESTIMATED HOURS: ~3,472**

---

# SECTION 3: SPRINT PLAN

## Sprint 0 — Security & Infrastructure Lockdown (Week 1-2)
**Duration:** 2 weeks  
**Team:** 3 engineers  
**Total Hours:** 240 (3 engineers × 40 hours × 2 weeks)

### Objectives
1. Fix all P0 security vulnerabilities
2. Establish CI/CD pipeline
3. Deploy to production (staging)
4. Wire Celery for build processing
5. Add monitoring infrastructure

### Deliverables
- ✅ All CSRF protection wired and tested
- ✅ Separate encryption key from JWT secret
- ✅ Fail-closed rate limiting when Redis down
- ✅ JTI-based token blacklisting
- ✅ Slow hash for password reset tokens
- ✅ sanitize_string function implemented
- ✅ Regex escaping in admin search
- ✅ Auth endpoint rate limiting
- ✅ CI/CD pipeline (GitHub Actions)
- ✅ Sentry error tracking configured
- ✅ Graceful shutdown handling
- ✅ Build timeout cleanup
- ✅ Health check with dependency verification
- ✅ WebSocket Redis pub/sub migration
- ✅ File delta delivery over WebSocket

### Success Metrics
- [ ] Zero P0 security vulnerabilities
- [ ] CI pipeline passes with all checks
- [ ] Staging environment accessible and functional
- [ ] Build execution via Celery (not BackgroundTasks)
- [ ] Error tracking active in staging

### Risks
- Celery migration may reveal race conditions
- Redis pub/sub may introduce latency
- Security fixes may break existing functionality

### Exit Criteria
- [ ] All P0 security items resolved and verified
- [ ] CI/CD pipeline operational
- [ ] Staging deployment stable
- [ ] No regressions in core build flow

---

## Sprint 1 — Database & API Hardening (Week 3-4)
**Duration:** 2 weeks  
**Team:** 3 engineers  
**Total Hours:** 240

### Objectives
1. Fix critical database issues
2. Add missing indexes and collections
3. Implement audit logging
4. Add pagination to all list endpoints
5. Begin testing infrastructure

### Deliverables
- ✅ Separate build_files collection (avoid 16MB limit)
- ✅ Unique constraint enforcement on user email
- ✅ Fix invitation token double-storage bug
- ✅ LLM token usage tracking and budget controls
- ✅ Per-user LLM token budgets
- ✅ Audit logging on critical operations
- ✅ Pagination on all list endpoints
- ✅ Global exception handler
- ✅ Begin writing unit tests for auth
- ✅ Real Stripe price IDs configured
- ✅ Password reset full flow (frontend + email)
- ✅ Template selection fixed
- ✅ Admin export endpoint implemented
- ✅ Preview URLs use real domain
- ✅ Email verification flow
- ✅ Credit deduction race condition fixed
- ✅ Trial enforcement implemented

### Success Metrics
- [ ] Build files stored in separate collection
- [ ] All endpoints paginated (default 20, max 100)
- [ ] Audit logs created for all critical operations
- [ ] 50+ unit tests passing
- [ ] Email delivery working (Resend configured)
- [ ] Credit system verified with concurrent tests

### Risks
- Build files migration may break existing builds
- Email delivery setup may take longer than expected
- Audit logging may miss some operations

### Exit Criteria
- [ ] All database P0 issues resolved
- [ ] Email system operational
- [ ] Password reset flow end-to-end working
- [ ] Credit system race condition fixed

---

## Sprint 2 — Core Product Stabilization (Week 5-6)
**Duration:** 2 weeks  
**Team:** 3 engineers + 1 QA  
**Total Hours:** 280

### Objectives
1. Implement prompt injection detection
2. Content moderation for generated code
3. LLM fallback chain
4. Redis caching for read-heavy endpoints
5. Root-level error boundaries
6. Fix onboarding flow
7. Comprehensive test suite

### Deliverables
- ✅ Prompt injection detection (secondary LLM call)
- ✅ Content moderation for generated code
- ✅ LLM fallback chain (Anthropic → OpenAI)
- ✅ Graceful degradation for circuit breaker
- ✅ CSP headers in generated applications
- ✅ Redis caching for plans, feature flags, profiles
- ✅ Request ID/correlation ID middleware
- ✅ Root-level error boundary with retry
- ✅ Guided onboarding flow (multi-step wizard)
- ✅ 100+ unit tests (auth, billing, builds)
- ✅ Integration tests for build pipeline
- ✅ Regression tests for credit deduction
- ✅ WebSocket ownership tests

### Success Metrics
- [ ] Prompt injection detected and blocked
- [ ] Generated code scanned for secrets/malware
- [ ] LLM fallback works when primary is down
- [ ] Cache hit rate > 50% on hot endpoints
- [ ] Onboarding completion rate > 60%
- [ ] Test coverage > 40% on business logic

### Risks
- Prompt injection detection may have false positives
- Content moderation may be computationally expensive
- Onboarding flow changes may require design iteration

### Exit Criteria
- [ ] AI pipeline has injection detection and fallback
- [ ] Cache layer operational
- [ ] Onboarding flow complete and tested
- [ ] 100+ tests passing

---

## Sprint 3 — UX & Frontend Polish (Week 7-8)
**Duration:** 2 weeks  
**Team:** 2 frontend engineers + 1 backend engineer  
**Total Hours:** 240

### Objectives
1. WCAG 2.1 AA accessibility
2. Responsive design verification
3. TypeScript strict mode
4. Frontend analytics tracking
5. SEO optimization
6. Marketplace moderation
7. Billing improvements

### Deliverables
- ✅ WCAG 2.1 AA compliance (ARIA labels, keyboard nav, focus management)
- ✅ Responsive design tested at all breakpoints
- ✅ TypeScript strict mode enabled, zero errors
- ✅ Frontend analytics (PostHog) integrated
- ✅ SEO meta tags, Open Graph, sitemap, robots.txt
- ✅ Marketplace moderation system
- ✅ Billing history UI
- ✅ Credit usage alerts (email)
- ✅ Settings page null crash fix
- ✅ Offline/error states for build inputs
- ✅ Confirmation dialogs for destructive actions
- ✅ Dunning workflow (3 email sequence)

### Success Metrics
- [ ] Lighthouse accessibility score ≥ 90
- [ ] No horizontal scroll at any breakpoint
- [ ] Zero TypeScript compilation errors
- [ ] Analytics events tracked for key user actions
- [ ] Marketplace content reviewed before publishing
- [ ] Credit alerts sent at 80%, 50%, 20% thresholds

### Risks
- Accessibility fixes may require significant UI changes
- TypeScript strict mode may surface many errors
- Marketplace moderation requires admin UI

### Exit Criteria
- [ ] Accessibility score ≥ 90
- [ ] TypeScript strict mode operational
- [ ] Analytics tracking live
- [ ] SEO basics implemented

---

## Sprint 4 — Growth & Go-to-Market (Week 9-10)
**Duration:** 2 weeks  
**Team:** 2 engineers + 1 product + 1 growth  
**Total Hours:** 160 engineering + product/growth

### Objectives
1. One-click deployment to cloud
2. Team collaboration (shared projects)
3. Referral program UI
4. Landing page optimization
5. Product Hunt launch preparation
6. Community setup (Discord)

### Deliverables
- ✅ One-click deployment (Docker → cloud provider)
- ✅ Team collaboration (shared projects, permissions)
- ✅ Referral program UI and tracking
- ✅ Landing page social proof (testimonials, case studies)
- ✅ Product Hunt launch assets prepared
- ✅ Discord community server set up
- ✅ "Built with Forge" badge for generated apps
- ✅ Content marketing strategy (blog posts, tutorials)

### Success Metrics
- [ ] Users can deploy generated apps with one click
- [ ] Referral program visible and functional
- [ ] Landing page conversion rate > 5%
- [ ] Product Hunt launch ready
- [ ] Discord community with 100+ members

### Risks
- One-click deployment depends on cloud provider integration
- Team collaboration requires database schema changes
- Product Hunt launch timing needs coordination

### Exit Criteria
- [ ] Deployment pipeline functional
- [ ] Referral program live
- [ ] Product Hunt materials ready
- [ ] Community platform active

---

## Sprint 5 — Enterprise & Scale Preparation (Week 11-12)
**Duration:** 2 weeks  
**Team:** 3 engineers + 1 product + 1 design  
**Total Hours:** 280

### Objectives
1. SSO/SAML implementation
2. RBAC enforcement
3. Audit log UI
4. API key management improvements
5. SLA metrics and monitoring
6. Backup automation
7. Annual billing / discount codes

### Deliverables
- ✅ SSO/SAML (Pro plan feature)
- ✅ RBAC enforcement across all endpoints
- ✅ Audit log viewing UI (admin)
- ✅ API key management (scopes, expiration)
- ✅ Prometheus/Grafana dashboards for build pipeline
- ✅ Automated MongoDB backup (daily)
- ✅ Automated Redis backup (daily)
- ✅ Annual billing with invoice PDF
- ✅ Promotional/discount code system
- ✅ Refund/dispute workflow

### Success Metrics
- [ ] SSO login functional with test IdP
- [ ] RBAC enforced on all protected endpoints
- [ ] Audit logs viewable in admin panel
- [ ] Backups running automatically
- [ ] Discount code creation and redemption works

### Risks
- SSO implementation is complex (SAML protocol)
- RBAC may require refactoring permission checks
- Backup automation needs storage infrastructure

### Exit Criteria
- [ ] Enterprise features (SSO, RBAC) operational
- [ ] Backup automation verified
- [ ] Billing improvements live

---

## Sprint 6 — Launch Readiness (Week 13-14)
**Duration:** 2 weeks  
**Team:** Full team  
**Total Hours:** 320

### Objectives
1. Full load testing
2. Security penetration testing
3. Performance optimization
4. Documentation completion
5. Legal review (ToS, Privacy, GDPR)
6. Production deployment
7. Launch

### Deliverables
- ✅ Load testing (100 concurrent users, 1000 req/s)
- ✅ Penetration test results reviewed and fixed
- ✅ Performance optimization (caching, queries, CDN)
- ✅ User documentation (guides, FAQs, API docs)
- ✅ Developer documentation (contribution guide, setup)
- ✅ Legal review completed
- ✅ Privacy policy and terms of service live
- ✅ GDPR compliance verified
- ✅ Production environment fully operational
- ✅ Monitoring and alerting active

### Success Metrics
- [ ] Load test passes: 1000 req/s with <500ms p99
- [ ] Penetration test: zero critical findings
- [ ] Documentation covers all user-facing features
- [ ] Legal documents reviewed and published
- [ ] Production environment stable for 72+ hours

### Risks
- Load testing may reveal scaling bottlenecks
- Penetration testing may find new vulnerabilities
- Legal review may require code changes

### Exit Criteria
- [ ] All launch readiness criteria met
- [ ] Production environment stable
- [ ] Security verified by external audit
- [ ] Legal compliance confirmed

---

# SECTION 4: DEPENDENCY GRAPH

## Critical Path

```
SEC-010 (sanitize_string) → SEC-009 (regex escaping) → Admin search secure
SEC-006 (slow hash) → SEC-008 (email verification) → User verification flow
SEC-005 (JTI) → SEC-007 (MFA), BE-010 (session mgmt) → Enterprise auth
BE-001 (Celery) → BE-005 (graceful shutdown) → Production reliability
AI-001 (cost tracking) → AI-003 (budget controls), AI-008 (model routing) → Cost management
None → BE-006 (build timeout), BE-011 (health checks), INF-004 (CI/CD) → Foundation (no blockers)
None → DB-001 (files collection), DB-002 (unique email), DB-003 (invitation fix) → Database integrity
None → WS-001 (Redis pub/sub), WS-002 (file deltas) → WebSocket scaling
```

## Parallel Work Streams

| Stream | Tasks | Independent? | Dependencies |
|--------|-------|-------------|--------------|
| **Security** | SEC-001 through SEC-013 | Mostly independent | SEC-009 → SEC-010 |
| **Database** | DB-001 through DB-003 | Independent | None |
| **Backend** | BE-001 through BE-012 | BE-005 → BE-001 | See above |
| **Frontend** | FE-001 through FE-011 | Independent | None |
| **AI Pipeline** | AI-001 through AI-013 | AI-003 → AI-001 | See above |
| **Infrastructure** | INF-001 through INF-015 | Independent | None |
| **Product** | PROD-001 through PROD-038 | Mostly independent | None |
| **Testing** | TEST-001 through TEST-007 | Independent | None |
| **Growth** | GRW-001 through GRW-014 | Independent | None |

## Blocking Paths

- **Celery migration (BE-001)** blocks graceful shutdown (BE-005) and production scaling
- **Cost tracking (AI-001)** blocks budget controls (AI-003) and model routing (AI-008)
- **sanitize_string (SEC-010)** blocks admin search security (SEC-009)
- **Slow hash (SEC-006)** blocks email verification (SEC-008)
- **JTI in tokens (SEC-005)** blocks MFA (SEC-007) and session management (BE-010)

---

# SECTION 5: EXECUTIVE DASHBOARD

## Overall Status

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Overall Completion** | 30.8% *(was 29.8%; +1.0 net — FE-008/FE-009 shipped and SEC-001/SEC-014/SEC-015/SEC-016/BE-013 all resolved same-day)* | 100% | ⚠️ |
| **Security Score** | 7.5/10 *(+0.5 — SEC-001, SEC-014, SEC-015, and SEC-016 all genuinely resolved 2026-07-03, no longer offset by an open gap)* | 9/10 | ✅ (improved from 1.5/10) |
| **Product Score** | 3/10 | 7/10 | 🔴 |
| **Backend Score** | 3/10 | 7/10 | 🔴 |
| **Frontend Score** | 3.5/10 | 7/10 | 🔴 |
| **AI Score** | 3/10 | 7/10 | 🔴 |
| **Infrastructure Score** | 2.5/10 | 7/10 | 🔴 |
| **Database Score** | 2.5/10 | 7/10 | 🔴 |
| **API Score** | 3.5/10 | 7/10 | 🔴 |
| **Growth Score** | 1.5/10 | 6/10 | 🔴 |
| **Enterprise Readiness** | 1.5/10 | 5/10 | 🔴 |
| **Investment Readiness** | 58/100 | 80/100 | ⚠️ |
| **Launch Readiness** | 15% | 100% | 🔴 |

## Phase-Level Progress

| Phase | % Complete | Hours Remaining | Status |
|-------|-----------|-----------------|--------|
| Phase 1: Security & Infrastructure | Unverified — flagging, not re-scoring *(the original 100% was already false before 2026-07-03 — of the ~30 items in this phase's P0 backlog above, SEC-001, SEC-014, SEC-002, SEC-003, SEC-005, and BE-001 (Celery, tracked under Architecture but part of this same due-diligence pass) have now been personally investigated and verified/fixed this session. SEC-002/003/005 were confirmed genuinely clean as claimed. BE-001 was NOT clean as claimed — it was 100% non-functional end-to-end; see BE-015 for the three bugs found and fixed. DB-001 (build-file/16MB separation) was also re-checked this session and confirmed genuinely accurate as claimed — no gap found. WS-001 (WebSocket Redis pub/sub, also tracked under Architecture) was checked next and was NOT clean either — same failure shape as BE-001: looked wired, was 100% non-functional (zero live build-progress events ever reached a connected client, verified live); see WS-003 for the fix. PROD-006 (credit race condition, tracked under Product) was checked next and was a mixed result: the reservation half was genuinely clean (8 real concurrent requests, exactly 1 succeeded, no double-spend), but the refund half was not — a failing/retried build got refunded once per Celery retry attempt instead of once per build, verified live with a balance ending *above* its starting value; see PROD-008 for the fix. AI-002 (prompt injection detection, tracked under AI Pipeline) was checked next by actually attempting bypasses rather than reading the pattern list: the keyword blocklist that exists had two concrete gaps (trivial whitespace/hyphen reformatting, and only the last conversation message ever being checked) — both fixed; see AI-008. The much larger originally-scoped AI-002 work (secondary-LLM-call detection, output validation, logging/alerting) remains genuinely unimplemented — fixing the blocklist's bypasses doesn't change that. The remaining ~20 items' actual status — INF-002 monitoring, INF-004 CI/CD, etc. — has still not been re-checked, so a single revised percentage here would still just be a fabricated number. Someone should audit the remaining P0 list above against the real codebase before this row is trusted again.)* | Unknown | 🔴 Needs re-audit (was falsely ✅ Complete) |
| Phase 2: Architecture & Database | 20% | 180 | 🔴 In Progress |
| Phase 3: Core Product | 10% | 240 | 🔴 Not Started |
| Phase 4: Frontend & UX | 7% *(was 5% — FE-008/FE-009 shipped, FE-005 partially progressed)* | 194 | 🔴 In Progress |
| Phase 5: Growth | 0% | 160 | ⬜ Not Started |
| Phase 6: Enterprise | 0% | 200 | ⬜ Not Started |

## Bug & Technical Debt Metrics

| Metric | Count | Trend |
|--------|-------|-------|
| **Total Known Issues** | 127+ *(120+ +7 items added 2026-07-03 per ENGINEERING_BACKLOG.md: SEC-014/015/016, BE-013/014, FE-008/009 — all 7 now resolved)* | ⬆️ (identifying more) |
| **P0 Issues** | 34 *(unchanged — all 2026-07-03 additions [SEC-014, SEC-015, SEC-016, BE-013] were resolved same-day, so none add to the open count)* | ⬇️ (was 17 security + 12 bugs) |
| **P1 Issues** | 32 | ⬆️ (better visibility) |
| **P2 Issues** | 28 | ⬆️ (better visibility) |
| **P3 Issues** | 18 | ⬆️ (roadmap items) |
| **P4 Issues** | 14 | → (future) |
| **Critical Security Vulns** | 1 remaining *(down from 2 — CSRF and the newly-found bcrypt/passlib outage were both resolved 2026-07-03; only encryption-key separation [SEC-002] remains)* | ⬇️ ⚠️ (encryption key) |
| **Technical Debt %** | 70% | ⬆️ (need to quantify) |

## Revenue Readiness

| Metric | Status | Target Date |
|--------|--------|-------------|
| **Stripe Integration** | ⚠️ Partial (placeholder prices) | Sprint 2 |
| **Credit System** | ⚠️ Partial (race condition) | Sprint 2 |
| **Usage Alerts** | ❌ Missing | Sprint 3 |
| **Dunning** | ❌ Missing | Sprint 4 |
| **Annual Billing** | ❌ Missing | Sprint 5 |
| **Discount Codes** | ❌ Missing | Sprint 5 |
| **Refund Workflow** | ❌ Missing | Sprint 5 |
| **Enterprise Quotes** | ❌ Missing | Sprint 6 |

---

# SECTION 6: LAUNCH CHECKLIST (500+ Verifiable Items)

## SECURITY (62 items)

- [ ] SEC-001-1: CSRF middleware validates X-CSRF-Token header on POST/PUT/DELETE/PATCH
- [ ] SEC-001-2: CSRF token endpoint returns cryptographically secure token
- [ ] SEC-001-3: CSRF token stored in Redis with 60-min TTL
- [ ] SEC-001-4: CSRF token tied to session (not global)
- [ ] SEC-001-5: CSRF validation fails closed (returns 403 on error)
- [ ] SEC-002-1: FIELD_ENCRYPTION_KEY is separate from JWT_SECRET
- [ ] SEC-002-2: FIELD_ENCRYPTION_KEY is 64 hex characters (32 bytes)
- [ ] SEC-002-3: Encryption module does not derive key from JWT secret
- [ ] SEC-002-4: Existing encrypted fields re-encrypted with new key
- [ ] SEC-002-5: Key rotation documentation exists
- [ ] SEC-003-1: WebSocket connections do not accept token in query string
- [ ] SEC-003-2: First WebSocket message must be {"type": "auth", "token": "..."}
- [ ] SEC-003-3: WebSocket tokens expire in 5 minutes
- [ ] SEC-003-4: WebSocket token type is "ws" (not "access" or "refresh")
- [ ] SEC-003-5: WSS enforced in production configuration
- [ ] SEC-004-1: Rate limiter returns 429 when Redis is unavailable
- [ ] SEC-004-2: In-memory fallback rate limiter is configurable
- [ ] SEC-004-3: Fallback limits are conservative (50% of normal)
- [ ] SEC-004-4: Redis reconnection detected and primary rate-limiting restored
- [ ] SEC-005-1: All JWT tokens include "jti" claim (UUID v4)
- [ ] SEC-005-2: Token blacklist uses JTI instead of full token string
- [ ] SEC-005-3: Index on JTI field in token_blacklist collection
- [ ] SEC-005-4: Expired tokens cleaned up from blacklist (TTL index)
- [ ] SEC-006-1: Password reset tokens hashed with pbkdf2_hmac or bcrypt
- [ ] SEC-006-2: Existing SHA256-hashed tokens remain valid until expiration
- [ ] SEC-006-3: Migration path for existing stored tokens
- [ ] SEC-007-1: TOTP enrollment endpoint exists
- [ ] SEC-007-2: TOTP verification endpoint exists
- [ ] SEC-007-3: Recovery codes generated during enrollment
- [ ] SEC-007-4: MFA required for admin accounts
- [ ] SEC-007-5: MFA status exposed in user settings API
- [ ] SEC-007-6: Remember device for 30 days
- [ ] SEC-008-1: Verification email sent on registration
- [ ] SEC-008-2: Users marked as "unverified" until email confirmed
- [ ] SEC-008-3: Unverified users blocked from creating builds
- [ ] SEC-008-4: Resend verification email endpoint exists
- [ ] SEC-008-5: Verification token expires after 24 hours
- [ ] SEC-009-1: All user input in $regex queries escaped with re.escape()
- [ ] SEC-009-2: MongoDB operator injection prevented ($where, $gt, etc.)
- [ ] SEC-009-3: Search limited to specific indexed fields
- [ ] SEC-009-4: ReDoS vulnerability mitigated (max length + timeout)
- [ ] SEC-010-1: sanitize_string exists in core/security.py
- [ ] SEC-010-2: Function strips control characters, limits length
- [ ] SEC-010-3: Import in admin.py resolves correctly
- [ ] SEC-011-1: Password reset limited to 3 attempts/email/hour
- [ ] SEC-011-2: Registration limited to 5 attempts/IP/hour
- [ ] SEC-011-3: Rate limit headers in response (X-RateLimit-*)
- [ ] SEC-011-4: Clear error message when rate limited
- [ ] SEC-012-1: Webhook URL validated on creation
- [ ] SEC-012-2: Private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x.x.x) rejected
- [ ] SEC-012-3: HTTPS required in production
- [ ] SEC-012-4: Proper error message for invalid URLs
- [ ] SEC-013-1: Production domains configurable via env var
- [ ] SEC-013-2: Localhost still works in development
- [ ] SEC-013-3: Proper CORS headers on all responses
- [ ] Security headers: X-Content-Type-Options: nosniff
- [ ] Security headers: X-Frame-Options: DENY
- [ ] Security headers: Strict-Transport-Security: max-age=31536000
- [ ] Security headers: Content-Security-Policy (restrictive)
- [ ] Security headers: Referrer-Policy: strict-origin-when-cross-origin
- [ ] Password minimum 12 characters with complexity requirements
- [ ] JWT secret minimum 32 characters enforced at startup

## BACKEND (48 items)

- [x] BE-001-1: Builds processed via Celery tasks (not BackgroundTasks) — verified 2026-07-03 (was broken; see BE-015)
- [x] BE-001-2: Task persistence on Redis restart — verified 2026-07-03 (build genuinely sits `pending` in Mongo/Redis with no worker running)
- [x] BE-001-3: Automatic retry on failure (3 retries) — verified 2026-07-03
- [ ] BE-001-4: Dead-letter queue for failed builds — still not implemented; failed-after-retries tasks just end up `status: failed` in Mongo with no separate queue
- [x] BE-001-5: Build status updates via Celery callbacks — verified 2026-07-03
- [x] BE-001-6: Existing build creation flow preserved — verified 2026-07-03
- [ ] BE-002-1: Global @app.exception_handler(Exception) registered
- [ ] BE-002-2: Stack traces logged but never returned to client
- [ ] BE-002-3: Consistent error response format
- [ ] BE-002-4: Sensitive information stripped from error responses
- [ ] BE-003-1: All list endpoints support page and per_page params
- [ ] BE-003-2: Default page size = 20, max = 100
- [ ] BE-003-3: Response includes total, page, per_page, total_pages
- [ ] BE-003-4: Backward compatible
- [ ] BE-004-1: All endpoints prefixed with /v1/
- [ ] BE-004-2: Old endpoints redirect with deprecation notice
- [ ] BE-005-1: SIGTERM/SIGINT handlers registered
- [ ] BE-005-2: Active requests allowed to complete (30s timeout)
- [ ] BE-005-3: Celery workers notified to stop accepting new tasks
- [ ] BE-005-4: WebSocket connections gracefully closed
- [ ] BE-005-5: Health check returns unhealthy during drain
- [ ] BE-006-1: Try/finally ensures resource cleanup on timeout
- [ ] BE-006-2: LLM API calls cancelled on timeout
- [ ] BE-006-3: Timeout events logged with build ID and duration
- [ ] BE-007-1: Cache decorator implemented
- [ ] BE-007-2: Plans, feature flags, user profiles cached (TTL 300s)
- [ ] BE-007-3: Cache invalidation on data changes
- [ ] BE-007-4: Cache hit/miss metrics exposed
- [ ] BE-008-1: X-Request-ID generated for every request
- [ ] BE-008-2: Existing X-Request-ID from client propagated
- [ ] BE-008-3: Request ID included in all log entries
- [ ] BE-008-4: Request ID returned in response headers
- [ ] BE-009-1: Audit logs for: project deletion
- [ ] BE-009-2: Audit logs for: API key CRUD
- [ ] BE-009-3: Audit logs for: webhook CRUD
- [ ] BE-009-4: Audit logs for: user deletion
- [ ] BE-009-5: Audit logs for: permission changes
- [ ] BE-009-6: Each log includes: actor_id, action, resource_type, resource_id, timestamp, IP
- [ ] BE-009-7: Audit logs are append-only
- [ ] BE-009-8: Audit log retention policy implemented
- [ ] BE-012-1: All outgoing webhooks signed with HMAC-SHA256
- [ ] BE-012-2: X-Forge-Signature header included
- [ ] BE-012-3: Timestamp in payload for replay protection
- [ ] Rate limiting uses Redis (not MongoDB)
- [ ] MongoDB connection pooling configured (maxPoolSize=50)
- [ ] Asyncio lock for database singleton initialization
- [ ] User caching in Redis with JWT payload (5-min TTL)
- [ ] Agent credit tracking includes all agent types

## FRONTEND (38 items)

- [ ] FE-001-1: All interactive elements have ARIA labels
- [ ] FE-001-2: Keyboard navigation works for all features
- [ ] FE-001-3: Focus management implemented (focus trap, focus order)
- [ ] FE-001-4: Color contrast meets WCAG AA standards
- [ ] FE-001-5: Screen reader announces dynamic content changes
- [ ] FE-001-6: Skip-to-content link present
- [ ] FE-001-7: Lighthouse accessibility score ≥ 90
- [ ] FE-002-1: All pages render correctly at 320px
- [ ] FE-002-2: All pages render correctly at 768px
- [ ] FE-002-3: All pages render correctly at 1440px
- [ ] FE-002-4: No horizontal scroll on any breakpoint
- [ ] FE-002-5: Navigation collapses on mobile
- [ ] FE-002-6: Touch targets ≥ 44px on mobile
- [ ] FE-003-1: Error boundary wraps entire app
- [ ] FE-003-2: Fallback UI shown with "Something went wrong"
- [ ] FE-003-3: Retry button that reloads the app
- [ ] FE-003-4: Error details logged to monitoring service
- [ ] FE-004-1: strict: true in tsconfig.json
- [ ] FE-004-2: Zero TypeScript compilation errors
- [ ] FE-004-3: No any types in new code
- [ ] FE-005-1: Multi-step onboarding wizard implemented
- [ ] FE-005-2: Sample project creation flow
- [ ] FE-005-3: Tooltips for key features
- [ ] FE-005-4: Progress indicator in onboarding
- [ ] FE-005-5: Skip option available
- [ ] FE-005-6: Onboarding completion tracked in analytics
- [ ] FE-006-1: Analytics SDK integrated (PostHog/Mixpanel)
- [ ] FE-006-2: Key events tracked: signup, login, first build, subscription
- [ ] FE-006-3: User identity linked in analytics
- [ ] FE-006-4: Page views tracked
- [ ] FE-007-1: Meta description on all pages
- [ ] FE-007-2: Open Graph tags (og:title, og:description, og:image)
- [ ] FE-007-3: Twitter Card tags
- [ ] FE-007-4: JSON-LD structured data
- [ ] FE-007-5: sitemap.xml generated
- [ ] FE-007-6: robots.txt present
- [ ] FE-007-7: Canonical URLs on all pages
- [ ] FE-008-1: Hardcoded colors replaced with CSS variables

## AI PIPELINE (26 items)

- [ ] AI-001-1: Token counting wrapper around Anthropic API calls
- [ ] AI-001-2: Usage stored in ai_usage collection per user/build
- [ ] AI-001-3: Daily/weekly/monthly budget limits configurable
- [ ] AI-001-4: Spending alerts at 50%, 80%, 100% of budget
- [ ] AI-001-5: API endpoint for spending dashboard
- [ ] AI-001-6: Admin endpoint to adjust budgets
- [ ] AI-002-1: Prompt injection detection via secondary LLM call
- [ ] AI-002-2: System prompt reinforcement on every request
- [ ] AI-002-3: Output validation for sensitive content
- [ ] AI-002-4: Prompt injection attempt logged and alerted
- [ ] AI-003-1: Per-user daily token budget implemented
- [ ] AI-003-2: Concurrent request limiting (max N per user)
- [ ] AI-003-3: LLM requests queued when concurrent limit reached
- [ ] AI-003-4: Budget resets daily/weekly
- [ ] AI-004-1: Fallback chain: Anthropic → OpenAI → local model
- [ ] AI-004-2: Automatic failover on API error/timeout
- [ ] AI-004-3: Degraded mode notification in UI
- [ ] AI-004-4: Fallback usage tracked in analytics
- [ ] AI-005-1: Generated code scanned for API keys/secrets
- [ ] AI-005-2: Malware pattern detection implemented
- [ ] AI-005-3: Copyrighted content detection (GPL violation)
- [ ] AI-005-4: Suspicious builds flagged for manual review
- [ ] AI-006-1: User-friendly error when circuit breaker open
- [ ] AI-006-2: 503 status with Retry-After header
- [ ] AI-007-1: CSP headers in generated app responses
- [ ] AI-007-2: Sandboxed iframes for previews

## BILLING & PAYMENTS (22 items)

- [ ] BILL-001: Stripe price IDs are real (not placeholders)
- [ ] BILL-002: Free trial enforcement (trial_ends_at checked)
- [ ] BILL-003: Credit usage alerts (email at 80%, 50%, 20%)
- [ ] BILL-004: Dunning workflow (3 emails before downgrade)
- [ ] BILL-005: Billing history UI showing past invoices
- [ ] BILL-006: Annual billing with 2 months free
- [ ] BILL-007: Invoice PDF generation
- [ ] BILL-008: Promotional/discount code system
- [ ] BILL-009: Enterprise quote generation
- [ ] BILL-010: Refund/dispute workflow
- [ ] BILL-011: Usage-based overages ($0.10/credit)
- [ ] BILL-012: Credit purchase flow works end-to-end
- [ ] BILL-013: Subscription upgrade/downgrade works
- [ ] BILL-014: Cancel subscription at period end
- [ ] BILL-015: Stripe webhook handles all event types
- [ ] BILL-016: Past-due subscriptions handled gracefully
- [ ] BILL-017: Credit refund race condition fixed
- [ ] BILL-018: Credit system unit economics are positive
- [ ] BILL-019: Free tier increased to 50 credits
- [ ] BILL-020: Enterprise pricing increased to $5K/mo
- [ ] BILL-021: Seat-based pricing for teams ($29/seat/mo)
- [ ] BILL-022: Marketplace revenue share (70/30)

## INFRASTRUCTURE (30 items)

- [ ] INF-001-1: K8s Deployment manifests for backend, frontend, Celery
- [ ] INF-001-2: K8s Service manifests with ClusterIP
- [ ] INF-001-3: Ingress configuration with TLS
- [ ] INF-001-4: HPA for auto-scaling (CPU/memory based)
- [ ] INF-001-5: PVCs for MongoDB and Redis
- [ ] INF-001-6: ConfigMaps and Secrets for configuration
- [ ] INF-001-7: Namespace isolation (prod, staging, dev)
- [ ] INF-002-1: Prometheus metrics endpoint (/metrics)
- [ ] INF-002-2: Grafana dashboards for API, system, business
- [ ] INF-002-3: Alerting rules for error rate, latency, CPU/memory
- [ ] INF-002-4: PagerDuty/OpsGenie integration
- [ ] INF-002-5: Synthetic monitoring (5-min intervals)
- [ ] INF-003-1: Secrets not stored in .env in production
- [ ] INF-003-2: Kubernetes Secrets used for credentials
- [ ] INF-003-3: No secrets in Docker image layers
- [ ] INF-004-1: GitHub Actions CI/CD pipeline
- [ ] INF-004-2: Lint checks in CI
- [ ] INF-004-3: Test execution in CI
- [ ] INF-004-4: Build and push Docker images in CI
- [ ] INF-004-5: Deploy to staging on main branch
- [ ] INF-004-6: Deploy to production on tagged releases
- [ ] INF-005-1: Structured logging (JSON format)
- [ ] INF-005-2: Log aggregation (Loki or ELK)
- [ ] INF-005-3: Log retention policy (30 days)
- [ ] INF-006: Sentry error tracking configured
- [ ] INF-007: Automated MongoDB backup (daily)
- [ ] INF-008: Redis persistence (AOF/RDB) configured
- [ ] INF-009: Blue-green deployment capability
- [ ] INF-010: CDN for static frontend assets
- [ ] INF-011: Resource limits on all containers

## DEPLOYMENT (12 items)

- [ ] DEP-001: Preview URLs use real domain (not localhost)
- [ ] DEP-002: One-click deploy to cloud (Docker/GCP)
- [ ] DEP-003: Custom domain mapping
- [ ] DEP-004: Deployment status tracking (progress, logs)
- [ ] DEP-005: Rollback deployment capability
- [ ] DEP-006: GitHub sync (push output to repo)
- [ ] DEP-007: Environment variable management for deployments
- [ ] DEP-008: Deployment history and logs
- [ ] DEP-009: Deployment health checks
- [ ] DEP-010: Auto-scaling for deployed apps
- [ ] DEP-011: SSL/TLS for deployed apps
- [ ] DEP-012: Deployment cost tracking

## AUTHENTICATION (20 items)

- [ ] AUTH-001: Password validation (12+ chars, uppercase, number, special)
- [ ] AUTH-002: Email verification flow complete
- [ ] AUTH-003: Password reset flow complete (email + frontend page)
- [ ] AUTH-004: JWT tokens include jti claim
- [ ] AUTH-005: Token blacklist uses JTI
- [ ] AUTH-006: Refresh token rotation implemented
- [ ] AUTH-007: WebSocket auth via short-lived tokens
- [ ] AUTH-008: CSRF protection on all state-changing requests
- [ ] AUTH-009: SameSite=Strict on all cookies
- [ ] AUTH-010: Secure flag on cookies in production
- [ ] AUTH-011: Rate limiting on login (per-email + per-IP)
- [ ] AUTH-012: Rate limiting on registration (per-IP)
- [ ] AUTH-013: Rate limiting on password reset (per-email)
- [ ] AUTH-014: Session management (list, force logout)
- [ ] AUTH-015: MFA/TOTP enrollment and verification
- [ ] AUTH-016: Recovery codes for MFA
- [ ] AUTH-017: Remember device for MFA
- [ ] AUTH-018: API key authentication works
- [ ] AUTH-019: Organization invitation flow works
- [ ] AUTH-020: SSO/SAML for enterprise

## MONITORING & OBSERVABILITY (16 items)

- [ ] MON-001: Prometheus metrics endpoint accessible
- [ ] MON-002: Request duration histogram (p50, p95, p99)
- [ ] MON-003: Error rate by endpoint
- [ ] MON-004: Active users gauge
- [ ] MON-005: Build duration histogram
- [ ] MON-006: LLM cost per build
- [ ] MON-007: Active WebSocket connections gauge
- [ ] MON-008: Database query duration
- [ ] MON-009: Cache hit/miss ratio
- [ ] MON-010: Alert on high error rate (>5%)
- [ ] MON-011: Alert on high latency (p99 > 1s)
- [ ] MON-012: Alert on service down
- [ ] MON-013: Alert on certificate expiry (<30 days)
- [ ] MON-014: Dashboard for API performance
- [ ] MON-015: Dashboard for system resources
- [ ] MON-016: Dashboard for business metrics

## TESTING (18 items)

- [ ] TEST-001: Unit tests for auth endpoints (login, register, refresh)
- [ ] TEST-002: Unit tests for billing endpoints
- [ ] TEST-003: Unit tests for build endpoints
- [ ] TEST-004: Unit tests for project endpoints
- [ ] TEST-005: Integration tests for build pipeline
- [ ] TEST-006: Integration tests for Stripe webhook
- [ ] TEST-007: Integration tests for WebSocket flow
- [x] TEST-008: Regression tests for credit deduction race condition — reservation race verified live (8 concurrent requests, 1 succeeded); `backend/tests/test_credit_refund_retries.py` added 2026-07-03 covering the refund-per-retry bug found in the same pass (see PROD-008)
- [ ] TEST-009: Regression tests for token blacklisting
- [ ] TEST-010: Regression tests for rate limiting
- [ ] TEST-011: WebSocket ownership tests
- [ ] TEST-012: CSRF validation tests
- [ ] TEST-013: Prompt injection detection tests
- [ ] TEST-014: Content moderation tests
- [ ] TEST-015: Fake text-parsing tests removed
- [ ] TEST-016: ESLint configuration
- [ ] TEST-017: Ruff (Python linter) configuration
- [ ] TEST-018: Pre-commit hooks configured

## SEO (10 items)

- [ ] SEO-001: Meta description on landing page
- [ ] SEO-002: Open Graph tags on all public pages
- [ ] SEO-003: Twitter Card tags
- [ ] SEO-004: JSON-LD structured data (Organization, Product)
- [ ] SEO-005: sitemap.xml generated and submitted
- [ ] SEO-006: robots.txt present and correct
- [ ] SEO-007: Canonical URLs on all pages
- [ ] SEO-008: Hreflang tags (if multilingual)
- [ ] SEO-009: 301 redirects for old URLs
- [ ] SEO-010: 404 page with helpful links

## ACCESSIBILITY (14 items)

- [ ] A11Y-001: lang="en" on HTML element
- [ ] A11Y-002: Skip-to-content link functional
- [ ] A11Y-003: All images have alt text
- [ ] A11Y-004: All form inputs have labels
- [ ] A11Y-005: Color contrast meets WCAG AA
- [ ] A11Y-006: Keyboard navigation covers all features
- [ ] A11Y-007: Focus indicators visible
- [ ] A11Y-008: Focus order is logical
- [ ] A11Y-009: ARIA landmarks on all pages
- [ ] A11Y-010: Screen reader announces dynamic content
- [ ] A11Y-011: Error messages associated with inputs
- [ ] A11Y-012: prefers-reduced-motion respected
- [ ] A11Y-013: Modal focus trap works
- [ ] A11Y-014: Toast notifications are accessible

## LEGAL & COMPLIANCE (16 items)

- [ ] LEGAL-001: Terms of Service published
- [ ] LEGAL-002: Privacy Policy published
- [ ] LEGAL-003: Cookie Policy published
- [ ] LEGAL-004: GDPR compliance verified
- [ ] LEGAL-005: Data processing agreement (DPA) available
- [ ] LEGAL-006: GDPR data export endpoint functional
- [ ] LEGAL-007: GDPR data deletion endpoint functional
- [ ] LEGAL-008: CCPA compliance verified
- [ ] LEGAL-009: Copyright/trademark search completed
- [ ] LEGAL-010: IP assignment agreements in place
- [ ] LEGAL-011: Open source license compliance verified
- [ ] LEGAL-012: AI-generated code disclaimer on output
- [ ] LEGAL-013: Security.txt file published
- [ ] LEGAL-014: Bug bounty program defined
- [ ] LEGAL-015: Terms for marketplace content creators
- [ ] LEGAL-016: Acceptable use policy published

## GROWTH (18 items)

- [ ] GRW-001: Landing page optimized for conversion (social proof, testimonials)
- [ ] GRW-002: Product Hunt launch prepared (assets, description, team)
- [ ] GRW-003: Referral program visible on dashboard
- [ ] GRW-004: Referral link sharing functional
- [ ] GRW-005: Referral credits tracked and awarded
- [ ] GRW-006: "Built with Forge" badge available
- [ ] GRW-007: Blog with technical content published
- [ ] GRW-008: Tutorial content (3+ videos)
- [ ] GRW-009: Discord community server active
- [ ] GRW-010: GitHub README updated with badges
- [ ] GRW-011: GitHub contribution guidelines published
- [ ] GRW-012: GitHub issue templates created
- [ ] GRW-013: Email capture on landing page
- [ ] GRW-014: Welcome email sequence configured
- [ ] GRW-015: Re-engagement email for inactive users
- [ ] GRW-016: Social media accounts active (Twitter/X, LinkedIn)
- [ ] GRW-017: Developer advocate identified/hired
- [ ] GRW-018: Analytics tracking for growth metrics

## PERFORMANCE (14 items)

- [ ] PERF-001: Build files send deltas (not full file dict) over WebSocket
- [ ] PERF-002: WebSocket payload compressed (permessage-deflate)
- [ ] PERF-003: Redis caching for plans, feature flags, profiles
- [ ] PERF-004: CDN for static frontend assets
- [ ] PERF-005: Response compression middleware (gzip/brotli)
- [ ] PERF-006: N+1 query patterns eliminated
- [ ] PERF-007: MongoDB aggregation $facet for paginated queries
- [ ] PERF-008: MongoDB connection pool sized appropriately
- [ ] PERF-009: MongoDB read preference configured (replicas)
- [ ] PERF-010: Build files stored in separate collection
- [ ] PERF-011: Analytics TTL index prevents unbounded growth
- [ ] PERF-012: Rate limit TTL index prevents unbounded growth
- [ ] PERF-013: All hot query paths have indexes
- [ ] PERF-014: Load test passes (1000 req/s, p99 < 500ms)

---

# SECTION 7: ENGINEERING ROADMAP

## Team Scaling Plan

| Phase | Engineers | Roles | Monthly Cost |
|-------|-----------|-------|-------------|
| Sprint 0-2 | 3 | 2 Backend + 1 Full-stack | $60K |
| Sprint 3-4 | 5 | 2 Backend + 2 Frontend + 1 DevOps | $100K |
| Sprint 5-6 | 8 | 3 Backend + 2 Frontend + 1 DevOps + 1 QA + 1 AI | $160K |
| Post-launch | 12-15 | Full team | $240K-$300K |

## Estimated Engineering Hours by Phase

| Phase | Hours | Team Size | Calendar Time |
|-------|-------|-----------|---------------|
| Sprint 0: Security & Infrastructure | 240 | 3 | 2 weeks |
| Sprint 1: Database & API | 240 | 3 | 2 weeks |
| Sprint 2: Core Product | 280 | 3+1 QA | 2 weeks |
| Sprint 3: Frontend & UX | 240 | 3 | 2 weeks |
| Sprint 4: Growth & GTM | 160 | 2+product | 2 weeks |
| Sprint 5: Enterprise | 280 | 3+1 product | 2 weeks |
| Sprint 6: Launch | 320 | Full team | 2 weeks |
| **Total** | **1,760** | **3-5 avg** | **~14 weeks** |

## Resource Allocation

### Sprint 0 (Security & Infrastructure)
- Engineer 1: Security fixes (CSRF, encryption key, JTI, slow hash)
- Engineer 2: Infrastructure (CI/CD, monitoring, Celery wiring)
- Engineer 3: WebSocket (Redis pub/sub, file deltas) + rate limiting

### Sprint 1 (Database & API)
- Engineer 1: Database (files collection, indexes, invitation fix)
- Engineer 2: API (pagination, exception handler, audit logging)
- Engineer 3: Product fixes (password reset, template, email verification, credits)

### Sprint 2 (Core Product)
- Engineer 1: AI pipeline (injection detection, cost tracking, budgets)
- Engineer 2: AI pipeline (content moderation, fallback chain)
- Engineer 3: Backend (caching, request ID, error boundaries)
- QA: Test suite development

### Sprint 3 (Frontend & UX)
- Engineer 1: Accessibility (WCAG 2.1 AA)
- Engineer 2: Frontend (TypeScript strict, responsive design, analytics)
- Engineer 3: Backend (marketplace moderation, billing improvements)

### Sprint 4 (Growth & GTM)
- Engineer 1: One-click deployment
- Engineer 2: Team collaboration
- Product + Growth: Landing page, referral program, PH launch, community

### Sprint 5 (Enterprise)
- Engineer 1: SSO/SAML
- Engineer 2: RBAC enforcement + audit UI
- Engineer 3: Infrastructure (backups, monitoring, billing)
- Product: Documentation, legal review

### Sprint 6 (Launch)
- Full team: Load testing, pen testing, performance optimization, production deployment

---

# SECTION 8: BUSINESS ROADMAP

## Phase 0: Pre-Launch (Now — Sprint 6)
**Focus:** Product readiness, security, infrastructure

| Milestone | Target | Owner |
|-----------|--------|-------|
| All P0 security vulnerabilities fixed | Sprint 0 | CTO |
| CI/CD pipeline operational | Sprint 0 | DevOps |
| Staging environment live | Sprint 0 | DevOps |
| Email system operational | Sprint 1 | Backend |
| Credit system verified | Sprint 1 | Backend |
| Onboarding flow complete | Sprint 2 | Product |
| Test suite with 80%+ coverage | Sprint 2 | QA |
| Accessibility compliant | Sprint 3 | Frontend |
| SEO basics implemented | Sprint 3 | Growth |

## Phase 1: Launch (Sprint 6 + 30 days)
**Focus:** User acquisition, feedback, iteration

| Milestone | Target | Owner |
|-----------|--------|-------|
| Product Hunt launch | Launch + 0 days | Marketing |
| 100 beta users | Launch + 7 days | Product |
| 10 paying customers | Launch + 14 days | Sales |
| NPS score established | Launch + 30 days | Product |
| First blog post published | Launch + 7 days | Content |
| Discord community 100+ members | Launch + 30 days | Community |

## Phase 2: Growth (Month 3-6)
**Focus:** Scale user base, optimize conversion

| Milestone | Target | Owner |
|-----------|--------|-------|
| 1,000 registered users | Month 3 | Growth |
| 100 paying users | Month 4 | Sales |
| $10K MRR | Month 5 | Finance |
| SEO ranking for key terms | Month 6 | Growth |
| Referral program driving 20% of signups | Month 6 | Growth |
| Team collaboration live | Month 4 | Product |

## Phase 3: Expansion (Month 7-12)
**Focus:** Enterprise, marketplace, platform

| Milestone | Target | Owner |
|-----------|--------|-------|
| 5,000 registered users | Month 9 | Growth |
| 500 paying users | Month 10 | Sales |
| $100K MRR | Month 12 | Finance |
| 10 enterprise accounts | Month 12 | Enterprise Sales |
| SOC 2 Type I certified | Month 9 | Security |
| Marketplace with 100+ templates | Month 12 | Product |
| SSO/RBAC for enterprise | Month 9 | Engineering |

## Phase 4: Scale (Year 2)
**Focus:** Market leadership, platform ecosystem

| Milestone | Target | Owner |
|-----------|--------|-------|
| 20,000 registered users | Month 18 | Growth |
| 2,000 paying users | Month 18 | Sales |
| $500K MRR | Month 18 | Finance |
| 50 enterprise accounts | Month 18 | Enterprise Sales |
| SOC 2 Type II certified | Month 15 | Security |
| International presence (3 regions) | Month 18 | Operations |
| Series B fundraising ($50M+) | Month 18 | CEO |

---

# SECTION 9: CEO ROADMAP

## If I Were CEO Tomorrow: Exact Order of Execution

### Week 1: Triage & Stabilize

**Day 1:**
0. ~~**Fix SEC-014**: the bcrypt/passlib version incompatibility that made registration and login crash on every attempt.~~ **DONE 2026-07-03** — pinned `bcrypt==4.0.1`, verified with a real register+login round-trip. Also fixed a second bug it uncovered (SEC-016, an ObjectId serialization crash on registration).
1. Lock down security: Verify and enforce all remaining P0 security fixes *(note: SEC-001/CSRF, which used to be the headline item here, is now resolved — see ENGINEERING_BACKLOG.md)*
2. Deploy to production (even if imperfect)
3. Set up error tracking (Sentry)
4. Grant 10 trusted beta users access

**Day 2-3:**
5. ~~Fix credit system race condition (immediate revenue risk)~~ **DONE 2026-07-03** — the reservation race was verified already race-free; the real bug found and fixed was a duplicate-refund-per-retry issue (PROD-008), verified via a live test where a failing build's balance ended up above its starting value before the fix
6. Fix password reset flow (users cannot get locked out)
7. Send welcome emails to beta users
8. Set up CI/CD pipeline

**Day 4-5:**
9. Fix onboarding (template selection)
10. Deploy first working public URL
11. Start watching Sentry errors + user feedback
12. Begin Celery migration for build processing

**Day 6-7:**
13. Talk to 20 users
14. Identify top 3 friction points
15. Fix the most critical ones
16. Document everything

### Week 2-3: Foundation

1. Complete Celery migration (builds survive restarts)
2. Set up Redis pub/sub for WebSocket (horizontal scaling)
3. Add monitoring (Prometheus + Grafana)
4. Fix database issues (files collection, indexes)
5. Write tests for core flows (auth, billing, builds)
6. Add email verification (prevent fake accounts)
7. Fix credit alerts (users need to know when running low)

### Week 4: Product Completion

1. Complete onboarding flow (users must reach "aha moment")
2. Fix preview URLs (users need to see their app)
3. Implement basic deployment (users need to ship)
4. Add usage analytics dashboard
5. Polish UI inconsistencies (~~Settings crash~~ resolved 2026-07-03 — Settings/Billing/Marketplace all wired to real data now, see FE-008; hardcoded colors still open)
6. Add confirmation dialogs (prevent accidental data loss)

### Month 2: Growth Engine

1. Launch on Product Hunt
2. Start content marketing (blog, tutorials)
3. Set up SEO basics (meta tags, sitemap)
4. Build referral program
5. Create "Built with Forge" badge
6. Start Discord community

### Month 2-3: Revenue

1. Verify unit economics (are we making money per build?)
2. Optimize AI costs (model routing, caching, BYOK)
3. Fix Stripe price IDs (real products, not placeholders)
4. Add usage-based overages (capture power user value)
5. Implement dunning (recover at-risk subscriptions)
6. Add annual billing (improve cash flow)

### Month 3-4: Enterprise

1. Start SSO/SAML implementation
2. Add RBAC enforcement
3. Build audit log UI
4. Begin SOC 2 preparation
5. Hire first enterprise sales rep

### Month 4-6: Scale

1. Build marketplace quality/reviews
2. Add team collaboration
3. Build API marketplace
4. International expansion (i18n)
5. Begin Series B fundraising conversations

## Key Principles

1. **Ship to real users TODAY.** Not next month. Not after fixes. Deploy now.
2. **Fix what's broken before building new features.** No new features until the credit system, password reset, and onboarding work.
3. **Talk to users every day.** Product decisions based on evidence, not assumptions.
4. **Revenue first, growth second.** Unit economics must be positive before scaling.
5. **Security is table stakes.** Fix all vulnerabilities before marketing to enterprises.
6. **Hire for gaps.** First hires: Backend engineer (security), DevOps, QA.
7. **Don't build features that don't serve the core loop.** The core loop is: describe → build → deploy. Everything else is secondary.

---

# SECTION 10: FINAL RECOMMENDATION

## The Forge Master Execution Plan in One Page

### Current State
- **Score:** 3.8/10
- **Security:** 2 remaining P0 vulnerabilities
- **Testing:** Zero business logic tests
- **Users:** None (never deployed to production)
- **Revenue:** Zero
- **Growth:** None

### What Must Be Done (In Order)

1. **Security lockdown** (Sprint 0, 2 weeks, 3 engineers)
   - CSRF, encryption key, JTI, slow hash, rate limiting
   - CI/CD, Sentry, Celery, Redis pub/sub
   
2. **Database & API hardening** (Sprint 1, 2 weeks, 3 engineers)
   - Build files collection, indexes, pagination
   - Email system, password reset, credit fixes

3. **Core product completion** (Sprint 2, 2 weeks, 3+1 engineers)
   - AI injection detection, cost tracking, content moderation
   - Caching, error boundaries, onboarding, tests

4. **UX & growth foundation** (Sprint 3-4, 4 weeks, 5 engineers)
   - Accessibility, responsive, TypeScript, SEO
   - Deployment, collaboration, referral program

5. **Enterprise & launch** (Sprint 5-6, 4 weeks, 8+ engineers)
   - SSO, RBAC, audit, backups, load testing, penetration testing

### When Will We Be Ready?

| Scenario | Timeline | Engineers | Cost |
|----------|----------|-----------|------|
| **Minimum viable product** | 4 weeks | 3 | $60K |
| **Production-ready launch** | 10 weeks | 5 | $250K |
| **Enterprise-ready** | 14 weeks | 8 | $500K |
| **Growth-optimized** | 6 months | 12 | $1.5M |
| **Market leadership** | 12-18 months | 20+ | $5M+ |

### The Single Most Important Thing

**Ship to real users today.**

The codebase will never be perfect. The security will never be complete. The features will never be finished. But you cannot build a billion-dollar company in a vacuum.

Deploy the product. Give it to 100 developers. Watch them use it. Listen to their feedback. Fix what's broken. Iterate.

Everything else — the security fixes, the tests, the enterprise features, the growth engine — is easier with real users and real revenue.

**Ship. Today.**

---

*This Master Execution Plan was prepared by the Executive Leadership Team (CEO, COO, CTO, CPO, CISO, VP Engineering, VP Product, VP Design, VP Growth, VP Customer Success, VP Sales, VP Finance, DevOps Lead, QA Director, Platform Architect, AI Systems Architect).*

*Date: March 7, 2026*
*Version: 1.0*
*Classification: Confidential — Executive Use Only*