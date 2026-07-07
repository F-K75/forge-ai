# FORGE AI — MASTER EXECUTION PLAN v2.0

**Date:** July 4, 2026
**Previous Versions:** v1.0 (Mar 7), v1.1 (Jul 3 refresh)
**Current Readiness:** ~62/100 (up from 18/100 in Jan, 58/100 in Mar)
**Target:** Production Launch Readiness (85/100)
**Team:** 5 engineers recommended
**Timeline to Launch:** 10-14 weeks

---

# EXECUTIVE SUMMARY

Forge is an AI-powered full-stack app builder with a differentiated multi-agent architecture. As of July 4, 2026, the platform has made **substantial engineering progress** but remains **pre-revenue and pre-production**.

## What's Been Achieved (v1.0 → v2.0)

| Category | Jan 2026 | Mar 2026 | Jul 2026 |
|----------|----------|----------|----------|
| Overall Readiness | 18/100 | 38/100 (est.) | **62/100** |
| Security Score | 20/100 | 34/100 | **68/100** |
| Test Coverage | 0 tests | 0 tests | **28 files, 167 tests** |
| P0 Security Vulns | Unknown | 17 critical | **0 known open** |
| CI/CD Pipeline | ❌ Missing | ❌ Missing | ✅ Working |
| Build Pipeline | BackgroundTasks | BackgroundTasks | ✅ Celery (fixed) |
| WebSocket Streaming | In-memory only | In-memory only | ✅ Redis pub/sub |
| Auth System | Basic JWT | Basic JWT | ✅ MFA, CSRF, encryption, sessions |
| Backend Tests | 0 | 0 | 28 files |
| Frontend Tests | 0 | 0 | 4 files / 20 tests (vitest + CI gate added 2026-07-07) |
| Production Deployment | ❌ | ❌ | ❌ (still no live URL) |
| Paying Customers | 0 | 0 | 0 |

## What Must Still Be Done

1. **Fix unit economics** — Pro tier at $60/mo for 750 credits is loss-generating ($1.20 revenue vs $3-15 AI cost per build)
2. **Ship to production** — 100+ beta users, get first 10 paying customers
3. **Build growth engine** — SEO, content, community, Product Hunt launch
4. **Complete remaining engineering** — pagination, caching, API versioning, frontend tests
5. **Launch readiness** — load testing, penetration testing, monitoring alerts, documentation
6. **Raise Series A** — $20-25M based on traction milestones

## Critical Path (Highest Priority First)

```
Week 1-2:  Fix pricing + deploy to production + get first users
Week 3-4:  Build growth engine (SEO, content, community)
Week 5-6:  Complete remaining P1 engineering (pagination, caching)
Week 7-8:  Frontend polish + testing infrastructure
Week 9-10: Growth loops + marketplace
Week 11-14: Load testing, security audit, launch prep
```

---

# SECTION 1: MASTER INVENTORY (Consolidated)

This inventory merges and deduplicates findings from:
- ENGINEERING_BACKLOG.md (66 issues)
- MASTER_EXECUTION_PLAN v1.1 (57 features, 66 API endpoints, 25 DB collections, 15 services)
- FORGE_BUSINESS_DUE_DILIGENCE.md (competitive/product audit)
- EXECUTION_TRACKING.md (sprint progress)

## 1.1 Features (57 total)

| # | Feature | Status | Classification | Notes |
|---|---------|--------|---------------|-------|
| 1 | Multi-agent build pipeline (Architect→PM) | ✅ Working | Core differentiator | Debug loop included |
| 2 | Real-time WebSocket build streaming | ✅ Working | Core feature | Redis pub/sub fixed Jul 3 |
| 3 | Debug loop with quality scoring | ✅ Working | Unique advantage | 3 max iterations |
| 4 | Sandbox runner (static checks) | ✅ Working | Quality gate | Syntax + import checking |
| 5 | Project CRUD | ✅ Working | Core | |
| 6 | Build creation with credit reservation | ✅ Working | Core | Atomic find_one_and_update |
| 7 | Build rollback to previous versions | ✅ Working | Nice-to-have | |
| 8 | Build file explorer | ✅ Working | UX feature | |
| 9 | Template selection during onboarding | ✅ Working | Core | Fixed Jul 3 — was placebo |
| 10 | GitHub PAT integration (not OAuth) | ✅ Working | Auth | Token encrypted server-side |
| 11 | GitHub repository sync | ✅ Working | Core | POST /deployments/github/push |
| 12 | One-click deployment to cloud | ❌ Missing | Core | Not implemented |
| 13 | Custom domain mapping | ❌ Missing | Roadmap | Not started |
| 14 | Preview URLs (docker-based) | ❌ Broken | Core | localhost-only |
| 15 | Deployment management | ⚠️ Partial | Core | Basic CRUD exists |
| 16 | Team workspaces with RBAC | ⚠️ Partial | Enterprise | Role change/remove fixed Jul 3 |
| 17 | Organization management | ✅ Working | Team feature | CRUD complete |
| 18 | Team member invitations | ✅ Working | Team feature | Token hashing fixed |
| 19 | Marketplace (templates & prompts) | ⚠️ Partial | Growth | No moderation |
| 20 | Marketplace item CRUD | ✅ Working | Marketplace | Fixed Jul 3 (serialization crash) |
| 21 | Marketplace search/recommendations | ❌ Missing | Marketplace | Not implemented |
| 22 | Billing/Subscription management | ⚠️ Partial | Core | Placeholder Stripe IDs |
| 23 | Credit purchase & consumption | ✅ Working | Billing | Reservation/refund race fixed |
| 24 | Credit usage tracking | ✅ Working | Billing | |
| 25 | Usage-based billing alerts | ✅ Working | Billing | Fixed Jul 3 (credit_alerts.py) |
| 26 | Dunning workflow (past-due recovery) | ❌ Missing | Billing | Not implemented |
| 27 | Invoice history | ❌ Missing | Billing | Model exists, no UI |
| 28 | Annual billing | ✅ Working | Billing | Frontend toggle added Jul 3 |
| 29 | Promotional/discount codes | ❌ Missing | Billing | Not implemented |
| 30 | Enterprise quote generation | ❌ Missing | Billing | Not implemented |
| 31 | Email verification | ✅ Working | Core | Resend endpoint added Jul 3 |
| 32 | Password reset flow | ✅ Working | Core | End-to-end verified |
| 33 | Forgot password | ✅ Working | Core | |
| 34 | Email notifications | ⚠️ Partial | Core | Resend API key unconfigured |
| 35 | API key management | ✅ Working | Core | Basic CRUD |
| 36 | Webhook management | ✅ Working | Core | SSRF protection added Jul 3 |
| 37 | Webhook delivery/signing | ✅ Working | Core | HMAC-SHA256 signing verified |
| 38 | Admin panel | ⚠️ Partial | Admin | Export endpoint fixed Jul 3 |
| 39 | Admin user management | ✅ Working | Admin | Ban/unban, add credits |
| 40 | Admin analytics dashboard | ⚠️ Partial | Admin | Revenue/AI usage added Jul 3 |
| 41 | Admin feature flags | ✅ Working | Admin | CRUD complete |
| 42 | Admin audit log viewing | ❌ Missing | Admin | Model exists, no UI |
| 43 | Support ticket system | ✅ Working | Core | Added Jul 3 (api/support.py) |
| 44 | Playbook integrations (Stripe, Slack) | ✅ Working | Core | |
| 45 | MCP server support | ❌ Missing | Roadmap | |
| 46 | BYOK (Bring Your Own API Key) | ❌ Missing | Pro feature | |
| 47 | SSO/SAML | ❌ Missing | Enterprise | |
| 48 | Voice mode (Web Speech API) | ❌ Missing | Roadmap | |
| 49 | Context window forking | ❌ Missing | Roadmap | |
| 50 | Version history UI | ❌ Missing | Product | Backend rollback exists |
| 51 | Analytics dashboard (user-facing) | ❌ Missing | Product | |
| 52 | Referral program | ⚠️ Partial | Growth | Endpoint exists, no UI |
| 53 | GDPR data export | ✅ Working | Compliance | |
| 54 | GDPR data deletion | ❌ Missing | Compliance | Partial implementation |
| 55 | Data residency controls | ❌ Missing | Compliance | |
| 56 | Onboarding wizard | ⚠️ Partial | Core | Goal→prompt handoff works |
| 57 | Landing page | ✅ Working | Marketing | Polished redesign |

## 1.2 API Endpoints (66 total)

| # | Endpoint | Status | Notes |
|---|----------|--------|-------|
| Auth (16) | | | |
| 1 | POST /auth/register | ✅ Working | Password strength, rate-limited |
| 2 | POST /auth/login | ✅ Working | MFA challenge path, rate-limited |
| 3 | POST /auth/refresh | ✅ Working | Token rotation |
| 4 | POST /auth/logout | ✅ Working | JTI blacklisting |
| 5 | POST /auth/ws-token | ✅ Working | Short-lived WS tokens |
| 6 | GET /auth/me | ✅ Working | Public user (no secrets) |
| 7 | PUT /auth/me | ✅ Working | Preferences merge |
| 8 | POST /auth/me/password | ✅ Working | Audit logged |
| 9 | POST /auth/forgot-password | ✅ Working | Rate-limited |
| 10 | POST /auth/reset-password | ✅ Working | |
| 11 | GET /auth/csrf-token | ✅ Working | Redis-backed |
| 12 | GET /auth/sessions | ✅ Working | Session management |
| 13 | DELETE /auth/sessions/{id} | ✅ Working | Revoke session |
| 14 | DELETE /auth/sessions | ✅ Working | Revoke all |
| 15 | POST /auth/mfa/setup | ✅ Working | TOTP enrollment |
| 16 | POST /auth/mfa/verify-setup | ✅ Working | |
| 17 | POST /auth/mfa/verify | ✅ Working | TOTP + backup codes |
| 18 | POST /auth/mfa/disable | ✅ Working | |
| 19 | POST /auth/organizations | ✅ Working | |
| 20 | GET /auth/organizations | ✅ Working | |
| 21 | GET /auth/organizations/{id} | ✅ Working | |
| 22 | POST /auth/organizations/{id}/invite | ✅ Working | |
| 23 | POST /auth/organizations/invitations/{token}/accept | ✅ Working | |
| 24 | GET /auth/organizations/{id}/members | ✅ Working | |
| 25 | PUT /auth/organizations/{org_id}/members/{member_id}/role | ✅ Working | Added Jul 3 |
| 26 | DELETE /auth/organizations/{org_id}/members/{member_id} | ✅ Working | Added Jul 3 |
| 27 | GET /auth/verify-email | ✅ Working | |
| 28 | POST /auth/resend-verification | ✅ Working | Added Jul 3 |
| Builds (5) | | | |
| 29 | POST /builds | ✅ Working | Celery-based, atomic credit reservation |
| 30 | GET /builds/{id} | ✅ Working | |
| 31 | GET /builds/{id}/files | ✅ Working | Separate collection |
| 32 | POST /builds/{id}/rollback/{version} | ✅ Working | |
| 33 | WS /builds/ws/{id} | ✅ Working | Redis pub/sub, first-message auth |
| Projects (5) | | | |
| 34 | GET /projects | ✅ Working | |
| 35 | POST /projects | ✅ Working | Template field wired |
| 36 | GET /projects/{id} | ✅ Working | |
| 37 | PUT /projects/{id} | ✅ Working | |
| 38 | DELETE /projects/{id} | ✅ Working | |
| Billing (7) | | | |
| 39 | GET /billing/plans | ✅ Working | |
| 40 | POST /billing/create-checkout-session | ⚠️ Partial | Placeholder Stripe IDs |
| 41 | POST /billing/create-portal-session | ✅ Working | |
| 42 | POST /billing/webhook | ✅ Working | Stripe webhook |
| 43 | GET /billing/invoices | ⚠️ Partial | |
| 44 | POST /billing/purchase-credits | ✅ Working | |
| 45 | GET /billing/usage | ✅ Working | |
| Admin (10) | | | |
| 46 | GET /admin/users | ✅ Working | |
| 47 | GET /admin/users/export | ✅ Working | CSV export, added Jul 3 |
| 48 | POST /admin/users/{id}/ban | ✅ Working | |
| 49 | POST /admin/users/{id}/unban | ✅ Working | |
| 50 | POST /admin/users/{id}/add-credits | ✅ Working | |
| 51 | GET /admin/analytics/overview | ✅ Working | |
| 52 | GET /admin/analytics/funnel | ✅ Working | |
| 53 | GET /admin/analytics/retention | ❌ Broken | O(n²) runtime |
| 54 | GET /admin/feature-flags | ✅ Working | |
| 55 | POST /admin/feature-flags | ✅ Working | |
| Marketplace (4) | | | |
| 56 | GET /marketplace | ✅ Working | |
| 57 | POST /marketplace | ✅ Working | Serialization fixed Jul 3 |
| 58 | GET /marketplace/{id} | ✅ Working | |
| 59 | POST /marketplace/{id}/rate | ⚠️ Partial | No validation |
| Growth (3) | | | |
| 60 | POST /growth/referrals | ✅ Working | |
| 61 | GET /growth/referrals | ✅ Working | |
| 62 | POST /growth/referrals/claim | ✅ Working | |
| Other (10) | | | |
| 63 | POST /webhooks | ✅ Working | SSRF validation |
| 64 | GET /webhooks | ✅ Working | |
| 65 | PUT /webhooks/{id} | ✅ Working | |
| 66 | DELETE /webhooks/{id} | ✅ Working | |
| 67 | GET /api-keys | ✅ Working | |
| 68 | POST /api-keys | ✅ Working | |
| 69 | DELETE /api-keys/{id} | ✅ Working | |
| 70 | GET /gdpr/export | ✅ Working | |
| 71 | POST /gdpr/delete | ❌ Missing | Not implemented |
| 72 | POST /deployments | ⚠️ Partial | localhost URLs |
| 73 | GET /deployments | ✅ Working | |
| 74 | GET /health | ✅ Working | |
| 75 | GET /health/detailed | ✅ Working | DB + Redis + Celery |
| 76 | GET /integrations/playbooks | ✅ Working | |
| 77 | POST /support/tickets | ✅ Working | Added Jul 3 |
| 78 | GET /support/tickets | ✅ Working | Added Jul 3 |
| 79 | GET /support/tickets/{id} | ✅ Working | Added Jul 3 |
| 80 | GET /metrics | ✅ Working | Prometheus |

## 1.3 Database Collections (25 total)

| # | Collection | Status | TTL/Indexes | Notes |
|---|------------|--------|-------------|-------|
| 1 | users | ✅ Working | Unique email index | MFA fields, preferences |
| 2 | builds | ✅ Working | Compound indexes | Files in separate collection |
| 3 | build_files | ✅ Working | (build_id, path) unique | Avoids 16MB limit |
| 4 | projects | ✅ Working | user_id index | Template field, org_id |
| 5 | messages | ✅ Working | project_id index | Chat history |
| 6 | subscriptions | ✅ Working | user_id unique | Stripe sync |
| 7 | invoices | ⚠️ Partial | | Model only |
| 8 | credit_purchases | ✅ Working | | |
| 9 | organizations | ✅ Working | slug unique | |
| 10 | team_members | ✅ Working | org_id + user_id index | |
| 11 | invitations | ✅ Working | | Hashed token only |
| 12 | deployments | ✅ Working | | |
| 13 | marketplace_items | ⚠️ Partial | | No moderation |
| 14 | analytics_events | ⚠️ Partial | TTL index | No retention policy |
| 15 | onboarding_progress | ✅ Working | | |
| 16 | feature_flags | ✅ Working | | |
| 17 | audit_logs | ✅ Working | actor_id index | Password changes + admin + billing |
| 18 | api_keys | ✅ Working | user_id index | |
| 19 | webhooks | ✅ Working | | |
| 20 | referrals | ✅ Working | | |
| 21 | sessions | ✅ Working | user_id + jti index | Session management |
| 22 | security_events | ✅ Working | | Rate limit events |
| 23 | support_tickets | ✅ Working | | Added Jul 3 |
| 24 | token_blacklist | ✅ Working | jti unique | |
| 25 | ai_usage | ✅ Working | | Fixed Jul 3 (real cost tracking) |

## 1.4 Services & Workers (15 total)

| # | Service | Status | Notes |
|---|---------|--------|-------|
| 1 | FastAPI backend | ✅ Working | Prometheus metrics, Sentry |
| 2 | Celery worker | ✅ Working | Fixed Jul 3 (3 wiring bugs) |
| 3 | Redis (cache + pub/sub + queue) | ✅ Working | Auth configured, pool tuned |
| 4 | MongoDB | ✅ Working | Auth configured, indexes added |
| 5 | WebSocket Connection Manager | ✅ Working | Redis pub/sub fixed Jul 3 |
| 6 | Sandbox Runner | ✅ Working | Syntax + import checks |
| 7 | Anthropic API client | ✅ Working | Circuit breaker, cost tracking |
| 8 | OpenAI API client (fallback) | ❌ Not wired | Configured but unused |
| 9 | Stripe webhook handler | ✅ Working | Signature verified, audit logged |
| 10 | Rate limiter (middleware) | ✅ Working | Redis + in-memory fallback |
| 11 | CSRF protection | ✅ Working | Frontend + backend wired |
| 12 | Security headers middleware | ✅ Working | CSP, HSTS, X-Frame-Options |
| 13 | Health check | ✅ Working | /health + /health/detailed |
| 14 | Global exception handler | ✅ Working | Added Jul 3 |
| 15 | Request ID middleware | ✅ Working | Added Jul 3 |

## 1.5 AI Agents (7 total)

| # | Agent | Status | Notes |
|---|-------|--------|-------|
| 1 | ArchitectAgent | ✅ Working | Template context, prior build history |
| 2 | BusinessModelAgent | ✅ Working | Monetization suggestions |
| 3 | DesignerAgent | ✅ Working | Design system generation |
| 4 | DeveloperAgent | ✅ Working | File generation, patching |
| 5 | IntegrationAgent | ✅ Working | Stripe, Slack playbooks |
| 6 | PMAgent | ✅ Working | Quality validation |
| 7 | Debugger (patch_files) | ✅ Working | 3 max iterations |

## 1.6 WebSocket Events (12 total)

| # | Event | Status | Notes |
|---|-------|--------|-------|
| 1 | AGENT_START | ✅ Working | |
| 2 | AGENT_UPDATE | ✅ Working | |
| 3 | AGENT_PROGRESS | ✅ Working | |
| 4 | AGENT_COMPLETE | ✅ Working | |
| 5 | BUILD_START | ✅ Working | |
| 6 | BUILD_COMPLETE | ✅ Working | |
| 7 | BUILD_FAILED | ✅ Working | |
| 8 | FILE_UPDATE | ✅ Working | Delta shape fixed Jul 3 |
| 9 | ERROR | ✅ Working | |
| 10 | DEBUG_START | ✅ Working | |
| 11 | STREAM_TOKEN | ✅ Working | |
| 12 | CREDITS_UPDATE | ✅ Working | |

## 1.7 Infrastructure Components (20 total)

| # | Component | Status | Notes |
|---|-----------|--------|-------|
| 1 | Docker Compose (dev) | ✅ Working | Health checks, resource limits |
| 2 | Docker Compose (prod) | ✅ Working | docker-compose.prod.yml |
| 3 | Backend Dockerfile | ✅ Working | Multi-stage, no --reload |
| 4 | Frontend Dockerfile | ✅ Working | Multi-stage build |
| 5 | .dockerignore | ✅ Working | Excludes secrets |
| 6 | Kubernetes manifests | ✅ Working | All services, internal consistency fixed Jul 3 |
| 7 | Ingress configuration | ✅ Working | TLS configured |
| 8 | Namespace isolation | ✅ Working | Prod, staging, dev |
| 9 | HPA (auto-scaling) | ⚠️ Partial | Backend HPA solid; celery needs metrics adapter |
| 10 | Secrets management (K8s) | ⚠️ Partial | Template exists, no vault integrated |
| 11 | Health checks | ✅ Working | All services |
| 12 | Resource limits | ✅ Working | CPU + memory |
| 13 | Nginx configuration | ✅ Working | Production reverse proxy |
| 14 | Prometheus metrics | ✅ Working | App-level HTTP metrics |
| 15 | Grafana dashboards | ⚠️ Partial | Manifests exist, panels query missing metrics |
| 16 | CI/CD pipeline | ✅ Working | GitHub Actions: lint, audit, test, build, deploy |
| 17 | Backup automation | ✅ Working | k8s CronJob: daily mongodump |
| 18 | Pre-commit hooks | ✅ Working | Secret scanning, installed via script |
| 19 | Terraform/IaC | ❌ Missing | Not implemented |
| 20 | WAF/cloud security | ❌ Missing | Not configured |

## 1.8 Third-Party Services (10 total)

| # | Service | Status | Notes |
|---|---------|--------|-------|
| 1 | Anthropic API (Claude) | ✅ Working | Primary provider |
| 2 | OpenAI API (fallback) | ❌ Not wired | Config unused |
| 3 | Stripe (payments) | ⚠️ Partial | Placeholder price IDs |
| 4 | Resend (email) | ❌ Not configured | API key empty |
| 5 | GitHub API (PAT push) | ✅ Working | Real push flow |
| 6 | Sentry (error tracking) | ⚠️ Partial | Backend + frontend code wired, no DSN |
| 7 | PostHog/Mixpanel (analytics) | ❌ Missing | Not implemented |
| 8 | Prometheus | ✅ Working | App-level metrics |
| 9 | Grafana | ⚠️ Partial | Manifests deployed, dashboards incomplete |
| 10 | Docker Engine | ⚠️ Partial | Socket not mounted |

---

# SECTION 2: MASTER BACKLOG (Prioritized)

## P0 — Critical (Must Fix Before Launch)

| ID | Title | Category | Severity | Hours | Status |
|----|-------|----------|----------|-------|--------|
| PRICE-001 | **Fix unit economics — Pro tier is loss-generating** | Business | CRITICAL | 2 | **OPEN** — $60/mo for 750 credits = $1.20/build vs $3-15 AI cost |
| DEPLOY-001 | **Deploy to production with real users** | Business | CRITICAL | 40 | **OPEN** — No production deployment exists |
| STRIPE-001 | **Configure real Stripe price IDs** | Billing | CRITICAL | 8 | **OPEN** — Placeholder IDs in config |
| RESEND-001 | **Configure Resend API key for email** | Operations | CRITICAL | 2 | **OPEN** — Email delivery non-functional |
| SENTRY-001 | **Configure Sentry DSN for error tracking** | Monitoring | CRITICAL | 1 | **OPEN** — Code wired, no DSN set |
| AUTH-001 | **Implement SSO/SAML for enterprise** | Enterprise | HIGH | 80 | **OPEN** |
| AI-002 | **Implement prompt injection detection** | AI/Security | HIGH | 60 | **PARTIAL** — Keyword blocklist hardened against obfuscation (zero-width/homoglyph/full-width/word-splitting) 2026-07-07; LLM-based secondary classifier still future work |
| AI-005 | **Implement content moderation for generated code** | AI/Security | MEDIUM | 60 | **RESOLVED 2026-07-07** — deterministic secret/destructive scanner (`sandbox/moderation.py`); blocking findings folded into PM debug loop, warnings in build report |
| BE-003 | **Add pagination to all list endpoints** | Backend | HIGH | 24 | **OPEN** |
| BE-007 | **Implement Redis caching for read-heavy endpoints** | Performance | MEDIUM | 40 | **RESOLVED 2026-07-07** — reusable cache-aside helper (`core/cache.py`); plans + user profiles cached; feature flags already cached w/ invalidation |
| DB-004 | **Complete GDPR cascade deletion** | Compliance | HIGH | 24 | **OPEN** |
| DB-003 | **Implement data retention policy** | Compliance | MEDIUM | 40 | **RESOLVED 2026-07-07** — centralized `RETENTION_TTL_SECONDS` policy + `apply_retention_ttl_indexes`; sessions/notifications now auto-expire |
| INF-002 | **Complete monitoring alerting (PagerDuty integration)** | DevOps | MEDIUM | 24 | **OPEN** |
| INF-003 | **Implement secrets management (Vault/AWS Secrets Manager)** | Security | HIGH | 24 | **OPEN** |
| TEST-002 | **Implement load/performance/stress tests** | Testing | HIGH | 80 | **OPEN** |
| FE-006 | **Implement frontend product analytics** | Growth | MEDIUM | 40 | **OPEN** |
| FE-007 | **Add SEO meta tags, Open Graph, structured data** | Marketing | MEDIUM | 16 | **OPEN** |

**Total P0: 17 items, ~525 hours**

## P1 — High Priority (Sprint 2-3)

| ID | Title | Category | Hours |
|----|-------|----------|-------|
| FE-001 | Implement WCAG 2.1 AA accessibility | Frontend | 120 |
| FE-005 | Complete onboarding flow (tooltips, analytics) | Product | 16 |
| SEC-007 | MFA for admin accounts (enforce) | Security | 8 |
| AI-004 | Implement LLM fallback chain (Anthropic→OpenAI) | AI/Reliability | 40 |
| AI-006 | Graceful degradation for circuit breaker | AI/Reliability | 8 |
| AI-007 | Add CSP headers to generated applications | AI/Security | 16 | **RESOLVED 2026-07-07** — `sandbox/csp.py` injects secure default CSP into generated HTML (meta) + FastAPI (middleware) at build time; idempotent, never weakens existing policy |
| AI-015 | Implement model routing (cheap/simple, expensive/complex) | AI/Cost | 24 |
| PROD-009 | Implement dunning workflow (3 emails) | Billing | 16 |
| PROD-010 | Add billing history UI | Product | 16 |
| PROD-011 | Add marketplace moderation system | Product | 16 |
| PROD-012 | Implement one-click deployment to cloud | Product | 40 |
| PROD-013 | Add usage analytics dashboard (user-facing) | Product | 24 |
| PROD-017 | Add confirmation dialogs for destructive actions | UX | 8 |
| PROD-024 | Add promotional/discount code system | Billing | 16 |
| PROD-025 | Add refund/dispute workflow | Billing | 16 |
| GRW-001 | Set up SEO (meta tags, sitemap, robots.txt) | Growth | 16 |
| GRW-002 | Set up product analytics (PostHog) | Growth | 40 |
| GRW-003 | Build referral program UI | Growth | 16 |
| GRW-004 | Create landing page optimization | Growth | 8 |
| INF-001 | Wire k8s into real deploy pipeline (or deprecate) | DevOps | 24 |
| INF-005 | Set up structured logging (Loki/DataDog) | Observability | 40 |
| INF-009 | Implement blue-green deployment | DevOps | 24 |
| INF-010 | Add CDN for static frontend assets | Performance | 16 |

**Total P1: 23 items, ~552 hours**

## P2 — Medium Priority (Sprint 3-5)

| ID | Title | Category | Hours |
|----|-------|----------|-------|
| BE-004 | Implement API versioning | API Design | 24 |
| FE-002 | Implement responsive design verification | Frontend | 60 |
| FE-004 | Enable TypeScript strict mode | Code Quality | 40 |
| AI-009 | Build benchmark suite for agent quality | AI/Quality | 40 |
| AI-010 | Add conversation memory (long-term) | AI/Quality | 24 |
| PROD-026 | Implement team collaboration (shared projects) | Product | 40 |
| PROD-027 | Build marketplace quality/reviews system | Product | 24 |
| PROD-028 | Add enterprise features (SSO, RBAC, audit logs) | Enterprise | 80 |
| PROD-029 | Add API marketplace / third-party integrations | Platform | 40 |
| INF-011 | Implement auto-scaling policies | DevOps | 16 |
| GRW-005 | Create content marketing strategy | Growth | 16 |
| GRW-006 | Set up Discord/community platform | Growth | 8 |
| GRW-007 | Build "Built with Forge" viral badge | Growth | 8 |
| GRW-008 | Create Product Hunt launch plan | Growth | 16 |

**Total P2: 14 items, ~436 hours**

## P3 — Lower Priority (Sprint 5+)

| ID | Title | Category | Hours |
|----|-------|----------|-------|
| FE-012 | Add dark/light mode toggle | UI | 16 |
| FE-013 | Implement SSR/SSG for SEO | Frontend | 40 |
| FE-014 | Add responsive mobile navigation | UI | 16 |
| AI-011 | Custom model fine-tuning for code generation | AI | 80 |
| AI-012 | RAG implementation with knowledge base | AI | 40 |
| PROD-030 | Voice mode (Web Speech API) | Product | 24 |
| PROD-031 | Context window forking | Product | 16 |
| PROD-032 | Version history UI | Product | 16 |
| PROD-033 | MCP server support | Product | 40 |
| PROD-034 | BYOK (Bring Your Own API Key) | Product | 16 |
| PROD-036 | Custom domain with SSL | Platform | 24 |
| PROD-037 | Professional services/consulting | Business | 16 |
| PROD-038 | Education platform (courses) | Business | 80 |
| INF-012 | Add Terraform modules for cloud infrastructure | DevOps | 80 |
| INF-013 | Implement multi-region deployment | Cloud | 40 |
| INF-014 | Configure WAF for OWASP protection | Security | 24 |
| INF-015 | Disaster recovery / multi-region failover | Infrastructure | 80 |
| GRW-009 | Build developer relations program | Growth | 40 |
| GRW-010 | Create tutorial content library | Growth | 40 |
| GRW-011 | Build agency partnership program | Growth | 24 |
| GRW-012 | Internationalization (i18n) | Product | 40 |

**Total P3: 21 items, ~792 hours**

## P4 — Future / Deferred

| ID | Title | Category | Hours |
|----|-------|----------|-------|
| AI-013 | Multi-modal support (image input → app output) | AI | 80 |
| FE-015 | PWA / offline support | Frontend | 40 |
| FE-016 | Desktop app (Electron/Tauri) | Frontend | 80 |
| PROD-035 | Social login (Google, Apple) | Auth | 16 |
| GRW-013 | Mobile app (iOS/Android) | Mobile | 160 |
| GRW-014 | Enterprise on-premise deployment | Enterprise | 80 |
| GRW-015 | SOC 2 Type II certification | Compliance | 160 |

**Total P4: 7 items, ~616 hours**

## Grand Total: ~2,921 hours

---

# SECTION 3: EXECUTION PHASES & SPRINT PLAN

## Phase 1: Launch Readiness (MVP) — Sprint 1-2 (Weeks 1-4)

**Theme:** Ship to real users. Fix pricing. Get first customers.

### Sprint 1: Fix Pricing & Ship (Weeks 1-2)

**Team:** 5 engineers (2 backend, 2 frontend, 1 DevOps)

**Objectives:**
1. Fix unit economics (pricing restructure)
2. Deploy to production
3. Configure real Stripe/Resend/Sentry credentials
4. Get first 100 beta users

**Deliverables:**

| Task | Hours | Owner | Dependencies |
|------|-------|-------|-------------|
| PRICE-001: Restructure pricing ($60→$99 Pro, 750→500 credits, add overages) | 4 | Backend | — |
| DEPLOY-001: Deploy to cloud (VPS/GCP) with real domain | 40 | DevOps | PRICE-001 |
| STRIPE-001: Create real Stripe products/prices, configure env vars | 8 | Backend | DEPLOY-001 |
| RESEND-001: Sign up for Resend, configure API key | 2 | DevOps | DEPLOY-001 |
| SENTRY-001: Create Sentry project, configure DSN | 1 | DevOps | DEPLOY-001 |
| BE-003: Add pagination to list endpoints (projects, builds, webhooks) | 24 | Backend | — |
| GRW-001: Add SEO meta tags, sitemap, robots.txt | 16 | Frontend | — |
| FE-006: Integrate PostHog analytics SDK | 40 | Frontend | — |
| PROD-012: Implement one-click deploy to cloud | 40 | Backend | DEPLOY-001 |
| TEST-001: Add frontend test infrastructure (vitest, first tests) | 16 | Frontend | — |
| STRIPE-001: Wire real Stripe prices into billing flow | 4 | Backend | STRIPE-001 |
| User onboarding: Create first 10 user accounts, gather feedback | 8 | Product | DEPLOY-001 |

**Total Sprint 1: ~203 hours** (5 engineers × 80h = 400h capacity ✅)

**Success Metrics:**
- [ ] Pricing restructured: Pro $99/mo, 500 credits, usage overages
- [ ] Production URL live and accessible
- [ ] Stripe checkout processes real payments
- [ ] Email verification and password reset emails sent successfully
- [ ] Error tracking active (Sentry)
- [ ] 10+ beta users signed up
- [ ] List endpoints paginated (default 20, max 100)

**Risks:**
- Stripe account verification may delay payment processing
- Cloud provider setup may encounter unexpected configuration issues
- Frontend test infrastructure may reveal >100 TypeScript errors

### Sprint 2: First Customers (Weeks 3-4)

**Team:** 5 engineers (2 backend, 1 frontend, 1 DevOps, 1 growth)

**Objectives:**
1. Get first 10 paying customers
2. Build referral program
3. Implement caching for performance
4. Add credit alerts and dunning

**Deliverables:**

| Task | Hours | Owner | Dependencies |
|------|-------|-------|-------------|
| GRW-003: Build referral program UI | 16 | Frontend | — |
| BE-007: Implement Redis caching (plans, feature flags, users) | 40 | Backend | — |
| PROD-009: Implement dunning workflow | 16 | Backend | STRIPE-001 |
| PROD-010: Add billing history UI | 16 | Frontend | — |
| PROD-017: Add confirmation dialogs for destructive actions | 8 | Frontend | — |
| GRW-004: Landing page optimization (social proof section) | 8 | Frontend | — |
| GRW-002: Set up Product Hunt launch assets | 40 | Growth | — |
| FE-005: Complete onboarding (tooltips, progress tracking) | 16 | Frontend | — |
| INF-005: Set up structured logging | 40 | DevOps | DEPLOY-001 |
| DB-004: Complete GDPR cascade deletion | 24 | Backend | — |
| Customer support: Handle first 10 customer interactions | 16 | Product | DEPLOY-001 |

**Total Sprint 2: ~240 hours** (5 engineers × 80h = 400h capacity ✅)

**Success Metrics:**
- [ ] 10+ paying customers (any tier)
- [ ] Referral program functional with tracking
- [ ] Cache hit rate > 50% on hot endpoints
- [ ] Dunning emails sent for past-due accounts
- [ ] Product Hunt launch assets ready
- [ ] Landing page has testimonials/case studies

---

## Phase 2: Growth Engine — Sprint 3-4 (Weeks 5-8)

**Theme:** Build growth loops. Improve quality. Enterprise preparation.

### Sprint 3: Growth & Community (Weeks 5-6)

**Team:** 5 engineers (1 backend, 2 frontend, 1 DevOps, 1 growth)

**Objectives:**
1. Launch growth engine (SEO, content, community)
2. Add annual billing and discount codes
3. Marketplace moderation
4. AI pipeline hardening

**Deliverables:**

| Task | Hours | Owner | Dependencies |
|------|-------|-------|-------------|
| GRW-005: Create content marketing strategy + first 3 blog posts | 16 | Growth | — |
| GRW-006: Set up Discord community | 8 | Growth | — |
| GRW-007: Build "Built with Forge" viral badge | 8 | Frontend | — |
| PROD-011: Add marketplace moderation system | 16 | Backend | — |
| PROD-024: Add promotional/discount code system | 16 | Backend | STRIPE-001 |
| PROD-025: Add refund/dispute workflow | 16 | Backend | STRIPE-001 |
| AI-002: Prompt injection detection (keyword blocklist hardening) | 8 | Backend | — |
| AI-004: Implement LLM fallback chain (Anthropic→OpenAI) | 40 | Backend | — |
| AI-007: Add CSP headers to generated applications | 16 | Backend | — |
| INF-001: Wire k8s manifests into real deploy pipeline | 24 | DevOps | DEPLOY-001 |
| FE-001: Begin WCAG accessibility (navigation, forms, ARIA labels) | 40 | Frontend | — |
| PROD-026: Begin team collaboration (shared projects) | 40 | Backend | — |

**Total Sprint 3: ~248 hours** (5 engineers × 80h = 400h capacity ✅)

**Success Metrics:**
- [ ] SEO meta tags live on all pages
- [ ] Discord server with 50+ members
- [ ] Marketplace has moderation queue
- [ ] Discount codes redeemable at checkout
- [ ] "Built with Forge" badge on generated sites
- [ ] First blog posts published

### Sprint 4: Quality & Enterprise Prep (Weeks 7-8)

**Team:** 5 engineers (2 backend, 2 frontend, 1 QA)

**Objectives:**
1. Complete enterprise features (RBAC enforcement, SSO)
2. Frontend accessibility and responsive design
3. AI cost optimization (model routing)
4. Comprehensive test suite

**Deliverables:**

| Task | Hours | Owner | Dependencies |
|------|-------|-------|-------------|
| PROD-028: SSO/SAML for enterprise | 80 | Backend | — |
| SEC-007: Enforce MFA for admin accounts | 8 | Backend | — |
| AI-015: Implement model routing (cheap/simple, expensive/complex) | 24 | Backend | — |
| AI-006: Graceful degradation for circuit breaker | 8 | Backend | — |
| FE-001: Complete WCAG AA compliance | 80 | Frontend | Sprint 3 partial |
| FE-002: Responsive design verification (all breakpoints) | 60 | Frontend | — |
| FE-004: Enable TypeScript strict mode | 40 | Frontend | — |
| TEST-002: Implement k6 load tests for critical endpoints | 40 | QA | — |
| DB-003: Implement data retention policy (TTL indexes, archival) | 40 | Backend | — |
| PROD-013: Add usage analytics dashboard | 24 | Frontend | — |

**Total Sprint 4: ~404 hours** (5 engineers × 80h = 400h capacity ⚠️ near limit)

**Success Metrics:**
- [ ] SSO functional with test IdP
- [ ] Lighthouse accessibility score ≥ 90
- [ ] No horizontal scroll at any breakpoint
- [ ] Zero TypeScript compilation errors
- [ ] k6 load tests passing (1K concurrent users)
- [ ] Model routing saving ≥30% on AI costs

---

## Phase 3: Launch — Sprint 5 (Weeks 9-10)

**Theme:** Security audit, load testing, final polish.

### Sprint 5: Launch Prep (Weeks 9-10)

**Team:** 5 engineers + external security auditor

**Objectives:**
1. External security audit
2. Load testing at scale (10K users)
3. Performance optimization
4. Documentation completion
5. Legal review (ToS, Privacy, GDPR)

**Deliverables:**

| Task | Hours | Owner | Dependencies |
|------|-------|-------|-------------|
| SEC-AUDIT-001: External penetration test | 40 | External | All P0 fixes |
| SEC-AUDIT-002: Remediation of audit findings | 40 | Team | SEC-AUDIT-001 |
| TEST-002: Load testing at production volume (10K concurrent users) | 40 | QA | — |
| INF-009: Implement blue-green deployment | 24 | DevOps | INF-001 |
| INF-010: Add CDN for static frontend assets | 16 | DevOps | — |
| INF-011: Implement auto-scaling policies | 16 | DevOps | — |
| INF-014: Configure WAF for OWASP protection | 24 | DevOps | — |
| PROD-036: Custom domain with SSL | 24 | DevOps | — |
| BUS-001: Draft and publish ToS + Privacy Policy | 40 | Legal | — |
| BUS-003: Define and publish SLA | 16 | Product | — |
| BUS-004: Set up support system (Intercom/Zendesk) | 16 | Product | — |
| BUS-006: Create comprehensive API documentation | 16 | Product | — |
| INF-012: Add Terraform modules for cloud infrastructure | 40 | DevOps | — |
| GRW-008: Execute Product Hunt launch | 16 | Growth | GRW-002 |

**Total Sprint 5: ~368 hours** (5 engineers × 80h = 400h capacity ✅)

**Success Metrics:**
- [ ] Penetration test: zero critical findings
- [ ] Load test passes: 10K users with <500ms p95
- [ ] Blue-green deployment tested with rollback
- [ ] ToS and Privacy Policy published
- [ ] Support system live (Intercom widget)
- [ ] Product Hunt launch executed
- [ ] CDN serving static assets

---

# SECTION 4: DEPENDENCY GRAPH

## Critical Path (What blocks launch)

```
PRICE-001 (Fix pricing) ──→ STRIPE-001 (Real Stripe IDs) ──→ PROD-009 (Dunning)
                         └──→ PROD-024 (Discount codes)
                         └──→ PROD-025 (Refunds)

DEPLOY-001 (Prod deploy) ──→ STRIPE-001 (Stripe webhooks need live URL)
                          ──→ RESEND-001 (Email needs live domain)
                          ──→ SENTRY-001 (Sentry needs live env)
                          ──→ INF-001 (k8s wiring)
                          ──→ PROD-012 (One-click deploy)

BE-003 (Pagination) ──→ All list endpoints

BE-007 (Redis caching) ──→ Performance optimization

SEC-AUDIT-001 (Pen test) ──→ SEC-AUDIT-002 (Remediation)
```

## Parallel Work Streams

| Stream | Tasks | Independent? |
|--------|-------|-------------|
| **Pricing & Billing** | PRICE-001, STRIPE-001, PROD-009, PROD-024, PROD-025 | Independent of engineering |
| **Deployment** | DEPLOY-001, RESEND-001, SENTRY-001, INF-001 | Sequential |
| **Growth** | GRW-001 through GRW-008 | Independent |
| **AI/ML** | AI-002, AI-004, AI-005, AI-006, AI-007, AI-015 | Mostly independent |
| **Frontend** | FE-001, FE-002, FE-004, FE-005, FE-006, FE-007 | Independent |
| **Backend** | BE-003, BE-007, PROD-011, PROD-026, PROD-028 | Some dependencies |
| **Enterprise** | SEC-007, PROD-028, BUS-001, BUS-003, BUS-004 | Largely independent |
| **Testing** | TEST-001, TEST-002 | Independent |
| **Security** | AI-002, AI-005, AI-007, SEC-AUDIT-001/002 | Some dependencies |

---

# SECTION 5: EXECUTIVE DASHBOARD

## Overall Health

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Overall Readiness** | 62/100 | 85/100 | ⚠️ |
| **Security Score** | 68/100 | 85/100 | ⚠️ |
| **Product Score** | 55/100 | 75/100 | 🔴 |
| **Backend Score** | 75/100 | 85/100 | ⚠️ |
| **Frontend Score** | 35/100 | 75/100 | 🔴 |
| **AI Score** | 40/100 | 75/100 | 🔴 |
| **Infrastructure Score** | 60/100 | 80/100 | ⚠️ |
| **Business Score** | 20/100 | 70/100 | 🔴 |
| **Growth Score** | 15/100 | 60/100 | 🔴 |
| **Enterprise Readiness** | 20/100 | 50/100 | 🔴 |
| **Investment Readiness** | 62/100 | 80/100 | ⚠️ |
| **Launch Readiness** | 15/100 | 100/100 | 🔴 |

## Bug & Technical Debt Metrics

| Metric | Count | Trend |
|--------|-------|-------|
| **Total Known Issues** | 82 (consolidated) | ⬇️ (from 131, deduplicated) |
| **P0 Issues** | 17 open | ⬇️ (was 34, many resolved) |
| **P1 Issues** | 23 open | ⬇️ |
| **P2 Issues** | 14 open | → |
| **P3 Issues** | 21 open | → |
| **P4 Issues** | 7 open | → |
| **Critical Security Vulns** | 0 known open | ✅ |
| **Backend Tests** | 28 files, 167 passing | ✅ |
| **Frontend Tests** | 0 files | 🟢 (4 files / 20 tests; vitest + blocking CI gate, 2026-07-07) |
| **Test Coverage (Backend)** | ~30% (estimated) | ⚠️ |

## Revenue Readiness

| Metric | Status | Target Date |
|--------|--------|-------------|
| **Pricing Fixed** | ❌ Loss-generating | Sprint 1 (Week 1) |
| **Stripe Integration** | ⚠️ Placeholder prices | Sprint 1 (Week 1) |
| **Credit System** | ✅ Working | Done |
| **Usage Alerts** | ✅ Working | Done |
| **Dunning** | ❌ Missing | Sprint 2 (Week 3) |
| **Annual Billing** | ✅ Working | Done |
| **Discount Codes** | ❌ Missing | Sprint 3 (Week 5) |
| **Refund Workflow** | ❌ Missing | Sprint 3 (Week 5) |
| **First Paying Customers** | ❌ 0 | Sprint 2 (Week 4) |
| **Enterprise Quotes** | ❌ Missing | Sprint 5 (Week 10) |

## Phase Progress

| Phase | % Complete | Hours Remaining | Status |
|-------|-----------|-----------------|--------|
| Phase 1: Launch Readiness | 15% | ~203 | 🔴 In Progress |
| Phase 2: Growth Engine | 0% | ~248 | ⬜ Not Started |
| Phase 3: Enterprise Prep | 0% | ~404 | ⬜ Not Started |
| Phase 4: Launch | 0% | ~368 | ⬜ Not Started |
| Phase 5: Future | 0% | ~1,408 | ⬜ Future |

---

# SECTION 6: RESOURCE ESTIMATES

## Team Scenarios

| Scenario | Team Size | Timeline | Cost (Engineering) | Final Score | Risk |
|----------|-----------|----------|-------------------|-------------|------|
| **Solo founder** | 1 engineer | 34 weeks | $120K | 70/100 | 🔴 High |
| **Small team** | 3 engineers | 22 weeks | $250K | 80/100 | 🟡 Medium |
| **Recommended** | 5 engineers | 14 weeks | $350K | 85/100 | 🟢 Low |
| **AI-assisted** | 5 eng + AI agents | 10 weeks | $350K + AI | 85/100 | 🟢 Low-Med |

## Cost Breakdown (14 weeks, 5 engineers)

| Category | Cost |
|----------|------|
| Engineering (5 × 14 weeks × $5K/week) | $350,000 |
| Cloud Infrastructure (GCP/AWS) | $15,000 |
| Third-party services (Stripe, Sentry, PostHog) | $5,000 |
| LLM API Costs (Anthropic) | $10,000 |
| Security Audit (external) | $30,000 |
| Legal Review (ToS, Privacy) | $15,000 |
| **Total** | **~$425,000** |

## After Series A ($25M)

| Metric | Year 1 | Year 2 | Year 3 |
|--------|--------|--------|--------|
| Team Size | 15 | 40 | 80 |
| ARR Target | $374K | $2.5M | $12.7M |
| Burn Rate | $258K/mo | $708K/mo | $1.06M/mo |
| Runway | 97 months | 35 months | 24 months |

---

# SECTION 7: LAUNCH CHECKLIST (500+ Items)

## SECURITY (62 items)

- [x] CSRF middleware validates X-CSRF-Token header on all POST/PUT/DELETE
- [x] CSRF token stored in Redis with 60-min TTL
- [x] CSRF token tied to session (JWT jti)
- [x] FIELD_ENCRYPTION_KEY is separate from JWT_SECRET
- [x] Encryption module does not derive key from JWT secret
- [x] JTI-based token blacklisting on logout
- [x] Password reset tokens hashed with PBKDF2-SHA256 (600K iterations)
- [x] Email verification tokens hashed with PBKDF2-SHA256
- [x] Invitation tokens hashed with PBKDF2-SHA256
- [x] `sanitize_string` function escapes regex special characters
- [x] NoSQL injection prevented in admin search
- [x] Webhook URLs validated against SSRF (private IPs, metadata endpoint blocked)
- [x] DNS rebinding protection on webhook delivery time
- [x] Webhook redirect-following disabled
- [x] Auth endpoint rate limiting (per-email: 10 login/hr, 5 register/hr, 3 forgot-password/hr)
- [x] Per-IP rate limiting on /auth, /builds, /api endpoints
- [x] Fail-closed rate limiting when Redis is down (in-memory fallback)
- [x] Rate limit headers in responses (X-RateLimit-Limit, X-RateLimit-Remaining)
- [x] Password strength validation (12+ chars, uppercase, lowercase, number, special)
- [x] MFA/TOTP enrollment and verification
- [x] MFA backup codes (10 single-use codes)
- [x] MFA required response on login (mfa_pending token)
- [x] TOTP secret encrypted at rest (Fernet)
- [x] Password change requires current password verification
- [x] Password change logged to audit trail
- [x] Email verification on registration
- [x] Builds blocked for unverified users
- [x] Resend verification email endpoint (rate-limited)
- [x] Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection
- [x] Security headers: Referrer-Policy, Permissions-Policy
- [x] TrustedHostMiddleware configured
- [x] CORS configured for production domains
- [x] Request size limited (10MB max)
- [x] Global exception handler registered (no stack trace leaks)
- [x] Sentry error tracking (backend)
- [x] Sentry error tracking (frontend)
- [x] Auth response bodies stripped of secrets (hashed_password, github_token)
- [x] `github_connected: bool` returned instead of raw token
- [x] GitHub token encrypted at rest (Fernet)
- [x] WebSocket tokens are short-lived (5 min TTL)
- [x] WebSocket auth via first message (not query string)
- [x] Build deduplication (no duplicate builds within 30s)
- [x] Credit reservation is atomic (find_one_and_update with $gte)
- [x] Credit refund fires exactly once (not per-retry)
- [x] Build timeout enforced (SoftTimeLimitExceeded)
- [x] Timeout triggers credit refund + build marked failed
- [x] Prompt injection blocklist (formatting-resistant, all messages checked)
- [x] AI cost tracking per build/user (real usd, not 0.0)
- [x] Per-user daily token budget enforced
- [x] Audit logging: password changes, admin actions, billing webhooks, role changes, member removal
- [x] Session management: list, revoke single, revoke all
- [x] Session records created on login (with IP, user agent)
- [x] Pre-commit secret scanning hook
- [ ] External penetration test completed
- [ ] All pen test findings remediated
- [ ] Secrets manager integrated (Vault/AWS Secrets Manager)
- [ ] Real Stripe secrets configured (not placeholders)
- [ ] Real Resend API key configured
- [ ] Real Sentry DSN configured
- [ ] MFA enforced for admin accounts
- [ ] Docker socket not mounted in production

## BACKEND (48 items)

- [x] Celery worker processes builds asynchronously
- [x] Build files stored in separate collection (avoid 16MB limit)
- [x] Prior build context for follow-up prompts
- [x] Template context passed to architect agent
- [x] Global exception handler returns JSON 500
- [x] Request ID middleware (X-Request-ID header)
- [x] Request ID injected into all log lines
- [x] Health check endpoint (/health)
- [x] Detailed health check (/health/detailed with DB, Redis, Celery)
- [x] Prometheus metrics endpoint (/metrics)
- [x] HTTP request count and latency metrics
- [x] Celery worker graceful shutdown (630s grace period)
- [x] Build timeout from settings (10 min default)
- [x] MongoDB connection pooling tuned (maxPoolSize, maxIdleTimeMS, waitQueueTimeoutMS)
- [x] Redis connection pooling tuned (max_connections, socket timeouts)
- [x] Build rollback to previous versions
- [x] Credit alert emails at thresholds (checked after build)
- [x] Credit alerts deduplicated (credit_alerts_sent list)
- [x] Webhook payloads signed with HMAC-SHA256
- [x] AI cost tracking with real model costs
- [x] Per-user daily budget enforcement
- [x] Support ticket CRUD
- [x] Organization RBAC (role change, member removal)
- [x] Stripe webhook audit logging (all 6 endpoints)
- [x] Annual billing (backend + frontend toggle)
- [ ] Pagination on all list endpoints (page, per_page, total, pages)
- [x] Redis caching for plans, feature flags, user profiles (2026-07-07) — `core/cache.py` cache-aside helper; plans (1h TTL) + user profiles (60s TTL, invalidated on update) cached; feature flags already cached
- [ ] API versioning (/v1/ prefix)
- [ ] GDPR cascade deletion (all collections)
- [ ] Data retention policy (TTL indexes, archival)
- [ ] LLM fallback chain (Anthropic → OpenAI)
- [ ] Model routing by task complexity
- [ ] Graceful circuit breaker degradation
- [x] CSP headers in generated apps (2026-07-07) — `sandbox/csp.py`
- [x] Content moderation for generated code (2026-07-07)
- [ ] SSO/SAML implementation
- [ ] RBAC enforcement across all endpoints
- [ ] Audit log viewing UI
- [ ] Blue-green deployment support
- [ ] Dunning workflow (3 email sequence)
- [ ] Promotional/discount code system
- [ ] Refund/dispute workflow
- [ ] Team collaboration (shared projects)
- [ ] One-click deployment to cloud
- [ ] Marketplace moderation system
- [ ] Usage analytics dashboard
- [ ] Custom domain with SSL
- [ ] Terraform modules for infrastructure

## FRONTEND (40 items)

- [x] Landing page with multi-agent terminal visualization
- [x] Pricing tiers ($0/$20/$60 with credit counts)
- [x] Signup flow with password strength indicator
- [x] Login flow with error handling
- [x] Forgot password page
- [x] Reset password page
- [x] Email verification page
- [x] Onboarding wizard (goal selection → starter prompt → build)
- [x] Projects list page
- [x] Project history with build list
- [x] Workspace (3-panel: chat, editor, preview)
- [x] Monaco file editor
- [x] File tree explorer
- [x] Preview panel (iframe)
- [x] Billing page (plans, usage, checkout)
- [x] Marketplace (listing, install)
- [x] Settings page (profile, GitHub connect, preferences)
- [x] MFA setup page
- [x] Session management page
- [x] Admin console (users, feature flags, analytics, revenue)
- [x] Reviews list page
- [x] Review detail page (agent pipeline, backlog)
- [x] Support ticket creation
- [x] Error boundary at root level
- [x] WebSocket connection with auth
- [x] CSRF token fetch and attach on all mutating requests
- [x] Offline/online detection (disable input when offline)
- [x] Submitting state during async operations
- [x] Build progress visualization (agent pipeline)
- [x] File update delta handling
- [ ] WCAG 2.1 AA compliance (ARIA labels, keyboard nav, focus management)
- [ ] Responsive design at all breakpoints (320px, 768px, 1440px)
- [ ] TypeScript strict mode (zero errors)
- [ ] PostHog/Mixpanel analytics integration
- [ ] SEO meta tags, Open Graph, Twitter Cards
- [ ] JSON-LD structured data
- [ ] sitemap.xml and robots.txt
- [ ] Confirmation dialogs for destructive actions
- [ ] "Built with Forge" badge
- [ ] Dark/light mode toggle

## AI PIPELINE (20 items)

- [x] Multi-agent pipeline (Architect → Business → Designer → Developer → Integration → PM)
- [x] Debug loop (3 max iterations)
- [x] Sandbox runner (static code checks)
- [x] Quality scoring (PM agent validation)
- [x] Real-time token streaming
- [x] Template context in architect prompts
- [x] Prior build context for follow-ups
- [x] Prompt injection blocklist (all messages, format-resistant)
- [x] AI cost tracking per call (real usd)
- [x] Per-user daily budget enforcement
- [x] Circuit breaker with exponential backoff
- [ ] LLM-based prompt injection detection
- [ ] LLM fallback chain (Anthropic → OpenAI)
- [ ] Model routing (cheap/simple, expensive/complex)
- [x] Content moderation for generated code (2026-07-07)
- [x] CSP headers in generated applications (2026-07-07)
- [ ] Graceful circuit breaker degradation
- [ ] Benchmark suite for agent quality
- [ ] Long-term conversation memory
- [ ] RAG implementation with knowledge base

## BILLING & PAYMENTS (20 items)

- [x] Stripe checkout session creation
- [x] Stripe webhook handling (checkout, subscription, invoice, payment)
- [x] Credit purchase via Stripe payment intents
- [x] Usage-based billing alerts (email at thresholds)
- [x] Annual billing toggle (frontend + backend)
- [x] Subscription management (portal session)
- [x] Credit system (reserve, refund, alert)
- [x] Atomic credit reservation (race-condition free)
- [x] Single refund per build (not per-retry)
- [x] Billing webhook audit logging
- [ ] Real Stripe price IDs (not placeholders)
- [ ] Dunning workflow (3 email sequence)
- [ ] Billing history UI
- [ ] Promotional/discount code system
- [ ] Refund/dispute workflow
- [ ] Enterprise quote generation
- [ ] Usage analytics dashboard (user-facing)
- [ ] Invoice PDF generation
- [ ] Tax calculation (VAT, GST)
- [ ] Multi-currency support

## AUTHENTICATION (18 items)

- [x] Email/password registration with password strength
- [x] Email/password login with rate limiting
- [x] JWT access token (HttpOnly cookie)
- [x] JWT refresh token (30-day, auto-rotate)
- [x] Token blacklisting on logout (by JTI)
- [x] MFA/TOTP enrollment and verification
- [x] MFA backup codes (10 single-use)
- [x] MFA challenge path (mfa_pending token)
- [x] Password change with current password verification
- [x] Password reset (email link, rate-limited)
- [x] Email verification (block builds until verified)
- [x] Resend verification email
- [x] CSRF token (Redis-backed, session-scoped)
- [x] WebSocket short-lived tokens (5 min)
- [x] Session management (list, revoke)
- [x] API key authentication (bearer token)
- [x] Organization invitation flow (hashed tokens)
- [ ] SSO/SAML for enterprise

## MONITORING & OBSERVABILITY (16 items)

- [x] Prometheus metrics endpoint
- [x] HTTP request count and latency metrics
- [x] Health check (/health)
- [x] Detailed health check (/health/detailed with DB, Redis, Celery)
- [x] Request ID middleware
- [x] Request ID in all log lines
- [x] Sentry error tracking (backend code wired)
- [x] Sentry error tracking (frontend code wired)
- [x] Structured logging with request context
- [ ] Real Sentry DSN configured
- [ ] PagerDuty/OpsGenie alerting integration
- [ ] Grafana dashboards with working metrics
- [ ] Celery queue depth metric
- [ ] LLM token/cost metrics
- [ ] MongoDB connection pool metrics
- [ ] Synthetic uptime monitoring

## TESTING (30 items)

- [x] Auth endpoint tests (register, login, refresh, logout, MFA)
- [x] Email rate limit failover tests
- [x] Credit refund retry tests
- [x] Celery health check tests
- [x] Celery graceful shutdown tests
- [x] Celery task tests (timeout wiring)
- [x] File update delta shape tests
- [x] Global exception handler tests
- [x] SSRF protection tests (13 cases)
- [x] Login rate limit tests
- [x] Billing webhook audit tests
- [x] Prompt injection detection tests
- [x] Team RBAC revocation tests
- [x] Template wiring tests
- [x] Resend verification tests
- [x] WebSocket auth tests
- [x] WebSocket pub/sub bridge tests
- [x] Config validation tests
- [x] Encryption tests
- [x] AI cost tracking tests
- [x] Frontend test infrastructure (vitest) — 20 tests across 4 files, blocking CI gate (2026-07-07)
- [ ] Frontend component tests (critical routes)
- [ ] E2E tests (register → login → build → view result)
- [ ] k6 load tests (auth, builds, projects CRUD)
- [ ] Stress tests (DB connection pool, Redis rate limiting)
- [ ] Chaos tests (pod failure, network latency, DB failover)
- [ ] Performance baseline documented (p50/p95/p99 latency)
- [ ] Regression detection in CI
- [ ] 80%+ backend test coverage
- [ ] Accessibility tests (axe DevTools)

## SEO & MARKETING (14 items)

- [ ] Meta description on all pages
- [ ] Open Graph tags (og:title, og:description, og:image)
- [ ] Twitter Card tags
- [ ] JSON-LD structured data (organization, product)
- [ ] sitemap.xml generated
- [ ] robots.txt present
- [ ] Canonical URLs on all pages
- [ ] Landing page social proof (testimonials)
- [ ] Case studies / customer stories
- [ ] Blog with technical content
- [ ] Product Hunt launch assets
- [ ] "Built with Forge" badge
- [ ] Referral program UI
- [ ] Discord community server

## LEGAL & COMPLIANCE (14 items)

- [ ] Terms of Service drafted and published
- [ ] Privacy Policy drafted and published
- [ ] Consent checkbox on registration
- [ ] Consent record stored (user_id, version, timestamp)
- [ ] GDPR data export endpoint
- [ ] GDPR cascade deletion (all collections)
- [ ] GDPR deletion within 30 days
- [ ] Data retention policy documented
- [ ] TTL indexes on time-series data
- [ ] Data processing agreement (DPA)
- [ ] Security questionnaire for enterprise procurement
- [ ] Cookie consent banner
- [ ] CCPA compliance (opt-out mechanism)
- [ ] SLA published (99.9% Pro, 99.95% Enterprise)

## INFRASTRUCTURE (22 items)

- [x] Docker Compose for local dev (all 4 services)
- [x] Docker Compose for production
- [x] Resource limits on all containers
- [x] Health checks on all containers
- [x] MongoDB with authentication
- [x] Redis with authentication and password
- [x] Kubernetes manifests (all services)
- [x] Ingress with TLS configuration
- [x] Namespace isolation (prod, staging, dev)
- [x] Persistent volumes (MongoDB PVC)
- [x] CronJob for database backups
- [x] Pre-commit hooks for secret scanning
- [ ] Production domain with SSL certificate
- [ ] CDN for static assets
- [ ] Secrets manager integration
- [ ] Blue-green deployment pipeline
- [ ] HPA with working metrics
- [ ] WAF for OWASP protection
- [ ] Multi-region deployment
- [ ] Terraform modules
- [ ] Auto-scaling policies
- [ ] Disaster recovery plan

## CI/CD (10 items)

- [x] CI pipeline: lint (ruff), SAST (bandit), security audit (pip-audit)
- [x] CI pipeline: tests with coverage (pytest)
- [x] CI pipeline: frontend build (TypeScript + Vite)
- [x] CI pipeline: frontend audit (npm audit)
- [x] CI pipeline: Docker build (backend + frontend)
- [x] CI pipeline: blocking quality gate
- [x] CD pipeline: build + push images to GHCR
- [x] CD pipeline: SSH deploy to VPS with health check
- [x] Secret scanning pre-commit hook
- [ ] CI pipeline: ESLint + Prettier checks

## OPERATIONS (10 items)

- [ ] Production deployment live
- [ ] Monitoring dashboard active
- [ ] Alerting configured (PagerDuty/Slack)
- [ ] Incident response runbook documented
- [ ] On-call rotation established
- [ ] Backup restoration tested
- [ ] Disaster recovery drill completed
- [ ] Database migration runbook
- [ ] Scaling runbook
- [ ] Security incident response plan

## FINANCE (8 items)

- [ ] Bank account for business
- [ ] Accounting software (QuickBooks/Xero)
- [ ] Cap table management
- [ ] Monthly financial reporting
- [ ] Burn rate monitoring
- [ ] Unit economics tracking
- [ ] P&L statement
- [ ] Series A fundraising materials

---

# SECTION 8: CEO ACTION PLAN

## Week 1 (Days 1-7): Emergency Triage

### Day 1: Fix pricing
1. Change Pro from $60/mo (750 credits) to $99/mo (500 credits)
2. Add usage-based overages ($0.10/credit after plan limit)
3. Increase Enterprise from $999/mo to $5K/mo
4. Increase Free from 10 credits to 50 credits
5. **Why:** Current pricing is loss-generating. Every Pro customer costs more than they pay.

### Day 2: Deploy to production
1. Set up VPS/GCP Cloud Run
2. Configure production domain
3. Set up real Stripe products and prices
4. Configure Resend API key for email
5. Configure Sentry DSN for error tracking
6. **Why:** The product has never been in the hands of real users. Ship now.

### Day 3: Secure the perimeter
1. Run external security audit / penetration test
2. Fix any findings
3. Enable MFA for all admin accounts
4. **Why:** Trust is the #1 requirement for developer tools.

### Day 4: Get first 100 beta users
1. Create waitlist
2. Post on Hacker News, Reddit (r/devtools, r/SideProject)
3. Reach out to 50 developer friends/contacts
4. Offer free Pro for 3 months to first 100 signups
5. **Why:** Product-market fit starts with conversations, not code.

### Day 5-7: Listen and iterate
1. Watch every user session (hotjar/fullstory)
2. Respond to every support request within 1 hour
3. Fix top 10 bugs
4. Ship daily improvements
5. **Why:** Speed of iteration is the only moat you have.

## Month 1 (Weeks 2-4): First Customers

### Week 2: Sales motion
1. Convert 10 beta users to paid
2. Define Ideal Customer Profile (ICP)
3. Start outbound to 50 potential customers
4. **Why:** Revenue validates the business model.

### Week 3: Growth foundation
1. Set up SEO (meta tags, sitemap)
2. Write first 3 blog posts (technical content)
3. Set up Discord community
4. Prepare Product Hunt launch
5. **Why:** Distribution is the single biggest gap.

### Week 4: Hiring
1. Post job descriptions for:
   - Head of Product (most critical hire)
   - Senior Backend Engineer
   - DevOps Engineer
   - Head of Growth
2. **Why:** A solo founder cannot build a $1B company.

## Month 2 (Weeks 5-8): Scale

### Weeks 5-6: Product quality
1. Complete pagination on all endpoints
2. Implement Redis caching
3. Add frontend test infrastructure
4. Begin accessibility work
5. **Why:** Quality compounds. Every fix makes the next feature easier.

### Weeks 7-8: Growth loops
1. Launch referral program
2. Ship "Built with Forge" badge
3. Execute Product Hunt launch
4. Begin content marketing machine
5. **Why:** Growth needs to be engineered, not hoped for.

## Month 3 (Weeks 9-12): Enterprise + Fundraising

### Weeks 9-10: Enterprise readiness
1. Begin SSO/SAML implementation
2. Complete GDPR compliance
3. Publish ToS and Privacy Policy
4. Set up support system
5. **Why:** Enterprise revenue is the path to $10M+ ARR.

### Weeks 11-12: Fundraising
1. Prepare Series A materials
2. Start investor conversations
3. Build relationships
4. **Why:** With traction and revenue, the Series A story writes itself.

## Key Decisions That Cannot Be Deferred

1. **Pricing** — Must be fixed before any customer sees it. Changing pricing after launch destroys trust.
2. **Production deployment** — The product must be in users' hands. Everything else is secondary.
3. **First customer** — One paying customer validates more than 100 architectural decisions.
4. **Team build-out** — The founder cannot do this alone. Hiring must start immediately after pricing fix.

## What NOT to Do

1. **Do NOT build new features** until the existing product is reliable
2. **Do NOT optimize** what hasn't been measured (no caching until you see slow queries)
3. **Do NOT pursue enterprise deals** without a product that works for individuals
4. **Do NOT raise money** without traction — it's the most expensive capital you'll ever raise
5. **Do NOT lose sight of users** — every line of code should be justified by user need

---

# SECTION 9: FINAL RECOMMENDATION

## 1. What is the single most important thing to do right now?

**Fix the pricing and ship to production.**

The current pricing ($60/mo for 750 credits) is loss-generating. The product has never been in the hands of real users. These two things — pricing and deployment — are the critical path to everything else. Without them, no amount of engineering polish matters.

## 2. How much time and money is needed?

| Effort | Timeline | Cost | Result |
|--------|----------|------|--------|
| Launch MVP | 4 weeks | $100K | Production-ready with real users |
| Growth + Quality | 4 weeks | $100K | 100+ users, referral engine |
| Enterprise + Fundraising | 6 weeks | $225K | Enterprise ready, Series A materials |
| **Total** | **14 weeks** | **~$425K** | **Launch ready (85/100)** |

## 3. What is the biggest risk?

**Execution on go-to-market.** The engineering is good enough. The product works (WebSocket streaming, debug loop, multi-agent pipeline — all real). But zero people are using it. Building a growth engine, sales organization, and customer success function from scratch is the hardest part of building a company, and there is no evidence the founder has done it before.

## 4. What is the most optimistic path to $1B?

1. Multi-agent architecture becomes the standard for AI-powered development
2. Forge executes on quality and reliability, establishing trust
3. Internal tools for enterprises become the wedge ($50B TAM)
4. Marketplace network effects create a flywheel
5. Acquisition by GitHub/Microsoft provides the exit ($500M+)

## 5. What is the most likely outcome?

A $100M-$500M acquisition by a platform player (GitHub, Vercel, Google, Anthropic) within 3-5 years. The technology is real and differentiated. The team has shown they can iterate and fix fundamental issues. But the competitive window is closing, and the go-to-market execution gap is significant.

---

*Plan prepared by the Executive Leadership Team*
*Date: July 4, 2026*
*Classification: Confidential — Executive Use Only*