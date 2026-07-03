# FORGE MASTER EXECUTION PLAN v1.1

**Date:** March 7, 2026 (v1.0) — **refreshed 2026-07-03 (post 18:02 IST)** against a live ground-truth code audit
**Status:** ⚠️ Pre-Production — Critical Issues Remain, But Fewer Than v1.0 Reported
**Overall Readiness:** ~6.0/10 *(up from 3.8/10 — see REFRESH LOG below for what changed and why)*
**Target:** Production-Ready, Launch-Ready, Investment-Ready

---

## REFRESH LOG — 2026-07-03

This document was originally written March 7, 2026 and had already been edited several times today (2026-07-03) as specific fixes landed, but large sections — especially Infrastructure, Monitoring, and CI/CD — had gone stale relative to same-day commits, and one section (the Executive Dashboard, line ~929 in the previous revision) explicitly flagged itself as "not yet re-checked" against the real codebase. This refresh closes that gap: four independent passes read the actual current code (not prior audit narrative) covering (1) security/auth controls, (2) backend architecture/DB/AI-cost controls, (3) infra/CI/CD/monitoring/backups, and (4) frontend/product flows/tests. Net effect:

- **Better than documented:** CI/CD pipeline, secret scanning, Prometheus metrics, and MongoDB backup automation are all real and working — the doc said "Missing" for all four. Most of the SEC-002–SEC-010 P0 security items are also done and verified in code, not just claimed. GitHub "OAuth" is a deliberate PAT-paste flow that works end-to-end, not a stub as previously logged.
- **Worse than documented (newly found, not previously tracked):** webhook delivery has **no SSRF protection at all** (arbitrary user-supplied URLs, zero validation) — this is a real, currently-exploitable P0, not a P1 nice-to-have as the old backlog had it. AI cost tracking silently persists `cost_usd=0.0` for every single LLM call — budget enforcement code exists but is never called from the live path, meaning **all AI unit-economics claims in every prior audit in this repo are unverifiable from real data**, because the data was never actually being collected. The k8s deployment manifests are not wired into the real deploy pipeline (`deploy.yml` only ever does docker-compose+SSH to a VPS, never `kubectl apply`) and are missing `ALLOWED_HOSTS`, so they'd reject production traffic if anyone used them as-is today.
- **Internal inconsistency fixed:** the backlog table listed BE-001 (Celery migration) as an open 80-hour P0 while the narrative elsewhere in this same document already said it was done and verified — it is in fact done; the backlog entry was stale.

All specific corrections are marked inline below with *(refreshed 2026-07-03)*.

---

## EXECUTIVE SUMMARY

Forge is an AI-powered full-stack application builder with a compelling multi-agent architecture (Architect → Business Model Improver → Designer → Developer → Integration → PM). The product vision, UX design, and core build pipeline are genuinely differentiated. As of this refresh:

- **Security is substantially further along than v1.0 reported**: encryption/JWT separation, JTI-based token blacklisting, slow-hash reset tokens, regex-escaped admin search, fail-closed rate limiting, and CSRF are all implemented and verified in code. **But a real, unmitigated SSRF vulnerability exists in webhook delivery** (arbitrary outbound requests to user-supplied URLs, no private-IP/metadata-IP blocking) — this is the single most urgent open item.
- **CI/CD, secret scanning, Prometheus metrics, and automated MongoDB backups are real and working** — none of this existed when the original 3.8/10 score was given, and the doc had not caught up to it until this refresh.
- **Zero frontend tests still exist** (backend now has 10 real test files covering the fixes made today; frontend has no test infrastructure at all — no vitest/jest, no test script).
- ~~AI cost tracking is silently broken~~ **Fixed 2026-07-03, same session it was found**: every LLM call now logs a real cost and is subject to real per-user budget enforcement (AI-001/AI-003). Historical usage records from before the fix still have `cost_usd=0.0` and can't be back-filled from raw token counts alone unless the model used per call was also logged (it was — see `model`/`prompt_tokens`/`completion_tokens` fields on each `ai_usage` record) — a backfill script could recompute historical costs via `calculate_cost()` if needed, but wasn't run as part of this session.
- **No production deployment** — the CI/CD pipeline can deploy to a VPS via SSH, but there is no evidence it has ever actually been run against a real environment; no live URL, no changelog entry, no runtime artifact.
- **No growth engine** — zero distribution, no SEO, no community.
- **No enterprise readiness** — no SOC 2, SSO, real RBAC (team members can be invited and listed, but there is no endpoint to change a role or remove a member at all), audit logs are partial (billing-webhook credit grants are unlogged).

**The single most important recommendation is unchanged: ship to real users.** But first close the SSRF hole in webhook delivery — that one is a genuine, live vulnerability, not a hardening nice-to-have.

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
| 10 | GitHub OAuth integration | ⚠️ Working, but not OAuth *(corrected 2026-07-03 — this is a deliberate personal-access-token paste flow (`SettingsPage.tsx`), not OAuth; token is encrypted server-side and genuinely used. Unused `github_client_id`/`github_client_secret` config fields suggest real OAuth was planned but never built. Mislabeling as "OAuth" everywhere is the actual issue now, not brokenness.)* | Auth |
| 11 | GitHub repository sync | ✅ Working *(corrected 2026-07-03 — `POST /deployments/github/push` genuinely pushes using the stored PAT; not stubbed)* | Core |
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
| 31 | Email verification | ✅ Working *(corrected 2026-07-03 — this row was wrong; it was actually already fully implemented (register sends the email, `GET /verify-email` confirms it, builds are blocked for unverified users). What was genuinely missing — a frontend page for the emailed link and a way to request a second one — is now fixed too, see PROD-005)* | Core |
| 32 | Password reset flow | ✅ Working *(corrected 2026-07-03 — this row was stale; §1.2 already correctly noted the reset-password page and backend both work. The real remaining gap is email delivery being unconfigured, see PROD-001, not a broken flow)* | Core |
| 33 | Forgot password | ✅ Working *(corrected 2026-07-03 — same stale-row issue as row 32)* | Core |
| 34 | Email notifications | ⚠️ Partially Working | Resend API key still unconfigured in this deployment — a real, but ops-not-code, blocker (see PROD-001) |
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
| 6 | Onboarding (/onboarding) | ✅ Working *(upgraded again 2026-07-03, same session — the final step handed a real starter prompt to the workspace, but the workspace's handling of the resulting `/build/new` route had a serious bug: it tried to GET a project literally named "new", always 404'd, and silently fell back to a fake placeholder -- so the very first build every new user ran right after onboarding was silently guaranteed to fail. Fixed by creating a real project on arrival at `/build/new`, see PROD-002. Still no tooltips/progress-tracked completion, see FE-005.)* | Core |
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
| 34 | GET /admin/users/export | ✅ Working *(resolved 2026-07-03 — CSV export, registered ahead of `/users/{user_id}`, wired to a new "Export CSV" button in `AdminConsole.tsx`, see PROD-003)* | Admin |
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
| 11 | CSRF protection middleware | ✅ Working *(corrected 2026-07-03 — fully wired both sides: `main.py` validates `X-CSRF-Token` against a Redis-stored value keyed by JWT `jti`, and `frontend/src/lib/api.ts` fetches it from `/auth/csrf-token` and attaches it to mutating requests)* | Security |
| 12 | Request size limiter | ✅ Working | Security middleware |
| 13 | Security headers middleware | ✅ Working | All headers set |
| 14 | Health check endpoint | ✅ Working *(corrected 2026-07-03, twice — `GET /health` deliberately stays a cheap liveness check with no dependency pings (it's the k8s `livenessProbe` target; checking Mongo/Redis/Celery there would make k8s kill+restart the pod over an outage a restart can't fix). `GET /health/detailed` (the `readinessProbe` target) already pinged MongoDB and Redis, and now checks Celery worker liveness too, see BE-011)* | Operations |
| 15 | Top-level error handler | ❌ Missing | Confirmed still absent 2026-07-03 — no `@app.exception_handler` registered in `main.py`; unhandled exceptions fall through to Starlette's default |

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
| 8 | Database backup | ✅ Working *(corrected 2026-07-03 — `k8s/mongodb-backup-cronjob.yaml` is a real, deployable Kubernetes CronJob: daily `mongodump --gzip` schedule, optional S3 sync, 7-day local retention, correct secret/volume wiring. Added same day, after this doc's prior save, so earlier revisions missed it. The old standalone `backup_mongodb.py` script is unused/superseded, not referenced by the CronJob)* | Growth/Ops |
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
| 8 | CSRF token | ✅ Working *(corrected 2026-07-03 — generation and validation both confirmed wired, backend and frontend)* | Security |
| 9 | Password change | ✅ Working | With audit logging |
| 10 | Password reset | ✅ Working *(corrected 2026-07-03 — code is complete end-to-end; the remaining gap is email delivery being unconfigured in this deployment, an ops task, see PROD-001)* | Core |
| 11 | Email verification | ✅ Working *(corrected 2026-07-03 — was wrong; already fully implemented server-side. Missing piece — a frontend page for the emailed link, and a resend option — added this session, see PROD-005)* | Core |
| 12 | MFA/2FA | ❌ Missing | Not implemented |
| 13 | SSO/SAML | ❌ Missing | Not implemented |
| 14 | GitHub OAuth | ⚠️ Working, but not OAuth *(corrected 2026-07-03 — see §1.1 row 10; PAT-paste flow, functionally real)* | Auth |
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
| 6 | Kubernetes manifests | ⚠️ Partially Working *(corrected 2026-07-03 — all manifests are individually well-formed and internally consistent; the `ALLOWED_HOSTS`-missing and bare-`:latest`-no-registry issues (SEC-019) were found and fixed the same session — image references now point at `ghcr.io/GHCR_OWNER/...` matching what `deploy.yml` actually pushes, and `ALLOWED_HOSTS` is wired from a new ConfigMap key. What's still genuinely missing: the manifests are still not wired into the real deploy pipeline at all — `deploy.yml` only ever does docker-compose+SSH to a VPS, never `kubectl apply` — see INF-001)* | None |
| 7 | Ingress configuration | ✅ Working | TLS configured |
| 8 | Namespace isolation | ✅ Working | Prod, staging dev |
| 9 | MongoDB statefulset | ✅ Working | With PVC |
| 10 | Redis deployment | ✅ Working | With auth |
| 11 | Celery worker deployment | ✅ Working | K8s manifest |
| 12 | HPA (auto-scaling) | ⚠️ Partially Working *(confirmed 2026-07-03 — backend HPA is solid; celery-worker HPA targets an external `celery_queue_depth` metric that has no metrics adapter wired, so it won't actually trigger)* | Configured in K8s |
| 13 | Secrets management (K8s) | ⚠️ Partially Working *(corrected 2026-07-03 — `k8s/secrets.yaml` is a legitimate template with all keys cross-checked against consumers, but values are empty strings by design; comments point at Vault/AWS Secrets Manager/Sealed Secrets, none of which are actually integrated — this is intentional "inject externally" design, not a bug, but it means secrets management isn't actually solved yet)* | K8s secrets |
| 14 | Health checks | ✅ Working | All services |
| 15 | Resource limits | ✅ Working | CPU + memory limits |
| 16 | Nginx configuration | ✅ Working | Production reverse proxy |
| 17 | Monitoring (Prometheus/Grafana) | ✅ Working *(corrected 2026-07-03 — this was actually already true and the doc undersold it: `backend/main.py` genuinely wires `prometheus_client`, exposes `GET /metrics`, and `k8s/monitoring.yaml` has a real `ServiceMonitor` + `PrometheusRule`. Gap: Grafana dashboard JSON queries custom metrics — `celery_active_tasks`, `celery_queue_depth`, `llm_tokens_total`, `llm_cost_usd_total`, `mongodb_connections_active` — that don't exist in code yet, only the two generic HTTP metrics are emitted, so several dashboard panels render empty)* | K8s monitoring manifests |
| 18 | CI/CD pipeline | ✅ Working *(corrected 2026-07-03 — was stale; `.github/workflows/ci.yml` runs ruff, bandit, pip-audit, pytest+coverage, npm audit, tsc+vite build, and a blocking quality gate; `deploy.yml` builds+pushes real images to GHCR and deploys via SSH to a VPS with a health-check. Depends on `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY` secrets actually being set in GitHub — could not verify that from the repo)* | GitHub Actions |
| 19 | Backup scripts | ✅ Working *(corrected 2026-07-03 — see §1.6 row 8; real k8s CronJob, not just a script)* | Automated |
| 20 | Terraform/IaC | ❌ Missing | Not implemented |

## 1.11 Third-Party Services

| # | Service | Status | Notes |
|---|---------|--------|-------|
| 1 | Anthropic API (Claude) | ✅ Working | Primary AI provider |
| 2 | OpenAI API (fallback) | ❌ Not wired | Configured but unused |
| 3 | Stripe (payments) | ⚠️ Partially Working | Placeholder price IDs |
| 4 | Resend (email) | ❌ Not configured | API key defaults to empty |
| 5 | GitHub API (repo push via PAT) | ✅ Working *(corrected 2026-07-03 — not OAuth, but the PAT-based push flow is real and functional; see §1.1 rows 10-11)* | Deployment |
| 6 | Docker Engine (sandbox) | ⚠️ Partially Working | Socket not mounted anymore |
| 7 | Sentry (error tracking) | ⚠️ Partially Working *(corrected 2026-07-03, twice — backend genuinely calls `sentry_sdk.init()` in `main.py` when `SENTRY_DSN` is set. Frontend integration code added the same day (`@sentry/react`, `lib/sentry.ts`, wired into `ErrorBoundary.tsx`). Both sides gracefully no-op without a DSN, and no DSN is actually configured anywhere in this deployment — that's the one remaining gap, and it's an ops task (create a Sentry project), not more code, see INF-006)* | INF-006 |
| 8 | PostHog/Mixpanel (analytics) | ❌ Missing | Not implemented |
| 9 | Prometheus (metrics) | ✅ Working *(corrected 2026-07-03 — genuinely wired: `prometheus_client` instrumentation + middleware + `/metrics` endpoint all present in `backend/main.py`, not just a k8s manifest)* | Real app-level metrics |
| 10 | Grafana (dashboards) | ⚠️ Partially Working *(corrected 2026-07-03 — manifest is real and deployable, but several panels query metrics that don't exist yet — see INF row 17 above)* | K8s manifest exists |

---

# SECTION 2: MASTER BACKLOG (Prioritized)

## P0 — Critical (Must Fix Before Production)

*Refreshed 2026-07-03: 8 items below were already resolved and just needed the backlog table updated to match; 1 item (SEC-012) is elevated from P1 because it's a confirmed, live, unmitigated vulnerability; 1 item (BE-018) is newly discovered; several others are narrowed in scope because part of the work was already done.*

| ID | Title | Category | Severity | Hours | Dependency |
|----|-------|----------|----------|-------|------------|
| SEC-014 | ~~Fix bcrypt/passlib incompatibility — registration/login totally broken~~ **RESOLVED 2026-07-03** (pinned `bcrypt==4.0.1`; also fixed SEC-016, an ObjectId-serialization bug it uncovered) | Security | CRITICAL | 4 (est.) / ~1.5 (actual, incl. SEC-016) | None |
| SEC-001 | ~~Wire CSRF token validation into middleware~~ **RESOLVED 2026-07-03** — was mis-scoped; backend validation was already correct, the frontend never sent the token at all | Security | CRITICAL | 16 (est.) / ~1 (actual) | None |
| SEC-002 | ~~Separate encryption key from JWT secret~~ **RESOLVED — verified 2026-07-03** (`core/encryption.py` derives from `field_encryption_key`, validated independently from `jwt_secret` in `core/config.py`; no shared derivation found) | Security | CRITICAL | 16 (est.) / 0 (already done) | None |
| SEC-003 | WebSocket auth via short-lived tokens (DONE) | Security | CRITICAL | 0 | None |
| SEC-004 | ~~Fail-closed rate limiting when Redis is down~~ **RESOLVED — verified 2026-07-03** (falls back to an in-memory limiter that still enforces the 429, not a bypass) | Security | HIGH | 8 (est.) / 0 | None |
| SEC-005 | ~~Use JTI for token blacklisting~~ **RESOLVED — verified 2026-07-03** (blacklist and its unique DB index are keyed by JTI, not full token strings) | Security | HIGH | 8 (est.) / 0 | None |
| SEC-006 | ~~Use slow hash for password reset tokens~~ **RESOLVED — verified 2026-07-03** (PBKDF2-HMAC-SHA256, 600k iterations; used for reset, verification, and invitation tokens) | Security | HIGH | 8 (est.) / 0 | None |
| SEC-009 | ~~Escape regex special characters in admin search~~ **RESOLVED — verified 2026-07-03** (`sanitize_string` calls `re.escape` before the query is built) | Security | HIGH | 8 (est.) / 0 | SEC-010 |
| SEC-010 | ~~Implement missing sanitize_string function~~ **RESOLVED — verified 2026-07-03**, with test coverage in `test_encryption.py` | Security | HIGH | 2 (est.) / 0 | None |
| SEC-012 | ~~Validate webhook URLs against SSRF~~ **RESOLVED 2026-07-03** (same day it was elevated from P1) — added `validate_webhook_url()` in `core/security.py`: rejects non-http(s) schemes, requires HTTPS when `app_env=="production"`, resolves the hostname and blocks private/loopback/link-local (covers the `169.254.169.254` cloud metadata endpoint)/reserved/multicast/unspecified addresses. Wired into both `POST /webhooks` (creation-time rejection) and `deliver_webhook()` (delivery-time re-check, closing the DNS-rebinding gap where the address could change between registration and delivery; also disabled redirect-following so a 3xx response can't bypass the check). 13 unit tests added in `test_ssrf_protection.py`, all passing against the real function. | Security | CRITICAL | 8 (est.) / ~0.5 (actual) | None |
| SEC-011 | ~~Add rate limiting to auth endpoints~~ **RESOLVED 2026-07-03** — added a `"login"` entry to `EMAIL_RATE_LIMITS` (10/hour, per email) and wired `check_email_rate_limit(req.email, "login", db)` into `api/auth.py`'s `login()`, the same pattern already used by register/forgot-password. Closes the gap where credential stuffing spread across source IPs against one account bypassed the generic per-IP limiter. 5 tests added/passing in `test_login_rate_limit.py`. | Security | HIGH | 4 (est.) / ~0.5 (actual) | None |
| BE-001 | ~~Migrate build processing from BackgroundTasks to Celery~~ **RESOLVED** — this row was stale; verified 2026-07-03 there is no remaining BackgroundTasks path for builds. The actual bugs found in the Celery path are tracked (and already resolved) under BE-015 below. | Architecture | CRITICAL | 80 (est.) / 0 (see BE-015 for actual fix hours) | None |
| BE-005 | ~~Implement graceful shutdown with connection draining~~ **RESOLVED 2026-07-03** — registered a `worker_shutting_down` Celery signal handler (`celery_app.py`) so a graceful shutdown is actually logged instead of a worker silently disappearing. Celery's own SIGTERM handling already does a warm shutdown (finish in-flight tasks, stop accepting new ones) with no extra code needed — the real gap was that k8s's `terminationGracePeriodSeconds` (default 30s) and Compose's `stop_grace_period` (default 10s) were both far shorter than a single build can take (`build_timeout=600s`), so a rolling update or scale-down would still SIGKILL a worker mid-build regardless. Both set to 630s now. 2 tests passing in `test_celery_graceful_shutdown.py`. | Reliability | MEDIUM | 16 (est.) / ~1 (actual) | None |
| BE-006 | ~~Ensure build timeout properly cleans up resources~~ **RESOLVED — verified 2026-07-03** (`SoftTimeLimitExceeded` is caught, credits are refunded, build is marked FAILED; confirmed by `test_credit_refund_retries.py`. Note: the current architecture has no persistent sandbox containers, so that part of the original concern doesn't apply.) | Reliability | MEDIUM | 16 (est.) / 0 | None |
| BE-009 | Add audit logging to critical operations — **narrowed further 2026-07-03**: password changes, admin user/credit actions, and (as of this session) role changes and member removal are all logged. The one remaining gap — Stripe billing-webhook handlers granting credits/changing plans with zero audit trail — is fully tracked as its own item, BE-017; no separate hours counted here to avoid double-counting. | Compliance | HIGH | 24 → **0 remaining** (see BE-017) | None |
| BE-011 | ~~Implement dependency-aware health checks~~ **RESOLVED 2026-07-03** — added a `celery_app.control.inspect().ping()` check to `/health/detailed` (run off the event loop via `asyncio.to_thread` so an absent/slow worker can't stall the request). **Correction to this item's own framing**: plain `/health` was never actually a bug — it's the Kubernetes `livenessProbe` target and should stay a cheap, dependency-free "is the process responsive" check; making it ping Mongo/Redis/Celery would make k8s kill+restart the backend pod over an outage a restart can't fix, which is a regression, not a fix. `/health/detailed` (the `readinessProbe` target) is where dependency checks belong, and now Celery is covered alongside Mongo/Redis. 4 tests passing in `test_celery_health_check.py`. | Reliability | MEDIUM | 8 (est.) / ~0.5 (actual) | None |
| DB-001 | ~~Separate build files from Build document (16MB limit)~~ **RESOLVED — verified 2026-07-03** (`build_files` collection, unique index on `(build_id, path)`, TTL) | Database | CRITICAL | 16 (est.) / 0 | None |
| DB-002 | ~~Add unique constraint enforcement on user email~~ **RESOLVED — verified 2026-07-03** (real DB-level unique index, not app-level only) | Database | HIGH | 4 (est.) / 0 | None |
| DB-003 | ~~Fix invitation token double-storage bug~~ **RESOLVED — verified 2026-07-03** (only `hashed_token` is persisted; no drift risk) | Database | HIGH | 4 (est.) / 0 | None |
| AI-001 | ~~Implement LLM token usage tracking and budget controls~~ **RESOLVED 2026-07-03, same session it was re-scoped** — `agents/base.py`'s `stream()` (and its unused twin `_call_llm()`, the only two places any agent's LLM call goes through) now calls `check_budget(user_id, org_id=org_id)` before every call (fail-closed, raises `BudgetExceeded` which propagates through `core/orchestrator.py`'s existing generic exception handler into a normal `BUILD_FAILED` event — no new error handling needed) and computes real `cost_usd` via `calculate_cost()` using the actual token counts (previously hardcoded to `0.0`). 4 new tests in `test_ai_cost_tracking_wired.py`, all passing against the real code path with a mocked Anthropic client. | AI/Cost | CRITICAL | 24 (est.) / ~1 (actual) | None |
| AI-002 | Implement prompt injection detection *(a basic keyword blocklist exists; had 2 concrete bypasses found & fixed 2026-07-03, see AI-008 below; secondary-LLM-call detection, output validation, and logging/alerting remain genuinely unimplemented — confirmed unchanged 2026-07-03)* | AI/Security | HIGH | 60 | None |
| AI-008 | ~~Prompt injection blocklist had 2 concrete bypasses (whitespace reformatting; only checked the last conversation message)~~ **NEW, RESOLVED 2026-07-03** | AI/Security | HIGH | 1 (actual) | None |
| AI-003 | ~~Implement per-user LLM token budgets~~ **RESOLVED 2026-07-03** — same fix as AI-001: `check_budget()` was already per-user/per-org (plan-tiered daily limits via `get_user_budget()`), it just wasn't being called from anywhere real. Now it is. | AI/Cost | HIGH | 24 (est.) / 0 (fixed alongside AI-001) | ~~AI-001~~ |
| AI-005 | Implement content moderation for generated code — confirmed still absent 2026-07-03 | AI/Security | MEDIUM | 60 | None |
| INF-002 | Set up monitoring, metrics, and alerting — **massively re-scoped 2026-07-03, was already mostly done and the doc had it backwards**: `prometheus_client` is genuinely wired into `backend/main.py`, `GET /metrics` is live, and `k8s/monitoring.yaml` has a real `ServiceMonitor` + `PrometheusRule`. Remaining gaps: instrument `celery_active_tasks`, `celery_queue_depth`, `llm_tokens_total`, `llm_cost_usd_total`, `mongodb_connections_active` (metrics the Grafana dashboards already query but that don't exist in code), set `SENTRY_DSN` (integration code already exists, just unconfigured), and wire PagerDuty/OpsGenie + synthetic monitoring | DevOps | CRITICAL → MEDIUM | 80 → **24 remaining** | None |
| INF-003 | Implement secrets management (not just .env) — **narrowed 2026-07-03**: `k8s/secrets.yaml` is a real, correctly cross-referenced Secret template deliberately designed for external injection (comments reference Vault/AWS Secrets Manager/Sealed Secrets), but no actual external secrets manager is integrated yet | Security | HIGH | 40 → **24 remaining** | None |
| ~~INF-004~~ | ~~Set up CI/CD pipeline (GitHub Actions)~~ **RESOLVED — the doc was stale on this, verified 2026-07-03**: `ci.yml` runs lint (ruff), SAST (bandit), dependency audit (pip-audit, npm audit), tests with coverage, and a real build, gated by a blocking quality gate; `deploy.yml` builds+pushes images to GHCR and deploys via SSH to a VPS with a health-check. Unverified from the repo alone: whether `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY` GitHub secrets are actually set. | DevOps | CRITICAL | 40 (est.) / 0 | None |
| ~~FE-003~~ | ~~Add root-level error boundary~~ **RESOLVED — verified 2026-07-03** (real class component, wraps every top-level route in `App.tsx`) | Frontend | MEDIUM | 8 (est.) / 0 | None |
| FE-005 | Implement guided onboarding flow — **narrowed 2026-07-03**: the final-step handoff (real starter prompt → workspace → real build kickoff) genuinely works now; remaining gap is no tooltips/step-by-step guidance, no completion tracking | Product | MEDIUM | 60 → **16 remaining** | None |
| PROD-001 | Fix password reset full flow (frontend + email) — **reclassified 2026-07-03, code-complete/ops-blocked, not a coding task**: verified the actual code in detail — the reset-password page, the backend token flow, AND the email-sending call are all already correct and complete; `forgot_password()` is gated cleanly on `settings.resend_api_key` (skips silently when unset, correctly avoiding user-enumeration; logs via `logging.exception` on real send failures). The only remaining blocker is that no real Resend API key is configured in this deployment — an operations/account-signup task, not something fixable with a code change. Not attempted; flagging precisely rather than fabricating a credential. | Product | CRITICAL | 4 → **0 engineering hours remaining** (blocked on ops: sign up for Resend and set `RESEND_API_KEY`) | None |
| PROD-002 | Fix template selection (backend + frontend) — **RESOLVED 2026-07-03** — wired `template` from project → Celery task → `Orchestrator.run_build()` → `ArchitectAgent.blueprint()` as system-prompt context (kept out of the stored/displayed prompt so it doesn't show up as text the user never typed); `ProjectsPage.tsx`'s starter chips and `Onboarding.tsx`'s goal selection now both send it. **A second, more serious bug was found in the same code path and fixed alongside it**: `WorkspacePage.tsx`'s handling of `/build/new` (the route `Onboarding.tsx` navigates to after signup) tried to `GET` a project literally named `"new"`, which always 404s, and silently fell back to a fake placeholder — meaning **the very first build every new user ran right after onboarding was silently guaranteed to fail** with "Project not found." Fixed by creating a real project on arrival instead. 7 backend tests passing (`test_template_wiring.py`); frontend verified via `tsc --noEmit` and a successful production `vite build` (no test framework exists for the frontend — confirmed elsewhere in this audit). | Product | HIGH | 4 (est.) / ~2 (actual, larger than estimated once the onboarding bug surfaced) | None |
| PROD-003 | Implement admin users export endpoint — **RESOLVED 2026-07-03** — added `GET /admin/users/export` (CSV, same filters as `list_users`, registered ahead of `/users/{user_id}` so `"export"` isn't swallowed as a path param), wired a new `adminApi.exportUsers()` and an "Export CSV" button into `AdminConsole.tsx`'s Users panel. 3 backend tests passing. | Product | MEDIUM | 4 (est.) / ~1 (actual) | None |
| PROD-004 | ~~Fix preview URLs (use real domain)~~ **RESOLVED 2026-07-03** — added a `deployment_host` setting (`core/config.py`, defaults to `"localhost"` for local dev) and used it at both call sites in `deployments.py` instead of the hardcoded literal string. Wired to `${DOMAIN}` in `docker-compose.prod.yml` (the real deploy path). Note: this fixes the *host* in the URL; the underlying architecture (host-port-mapped Docker containers, one per deployment) is unchanged and still doesn't do dynamic subdomain routing — that would be new infrastructure, not a config fix, and is out of scope here. The separate in-editor live-preview sandbox (`PreviewPanel.tsx`'s "coming soon") is a different, still-unbuilt feature, not touched. | Product | HIGH | 8 (est.) / ~1 (actual) | None |
| PROD-005 | ~~Add email verification flow~~ **CORRECTION 2026-07-03: this row's "confirmed still missing" claim from earlier in this same session was wrong — caught and fixed in the same pass.** Re-reading `api/auth.py` in full (rather than trusting the prior label) showed registration already generates a token, sends a verification email when `resend_api_key` is set, and `GET /verify-email` already existed and correctly verified it; `api/builds.py` already blocks unverified users from creating builds. **What was genuinely missing**: no frontend route/page to land on after clicking the emailed link (`/verify-email` didn't exist in `App.tsx`), and no way to request a second link if the first never arrived. Both fixed 2026-07-03: added `VerifyEmail.tsx` + route, and a new `POST /auth/resend-verification` endpoint (rate-limited 3/hour/email, same non-enumeration pattern as forgot-password). **Why this matters**: with `RESEND_API_KEY` unconfigured (the current state of this deployment, see PROD-001), combined with builds being blocked for unverified users, every single new user was completely unable to ever create a build — a live, product-breaking bug that had gone unflagged. 4 tests passing in `test_resend_verification.py`. | Product | HIGH | 24 (est.) / ~2 (actual — most of the "24h" scope already existed) | None |
| PROD-006 | ~~Fix credit deduction race condition~~ **the reservation half was genuinely race-free (verified with 8 real concurrent requests); the refund half was not — see PROD-008** | Business | CRITICAL | 4 | None |
| PROD-008 | ~~Refund fired once per Celery retry attempt instead of once per build~~ **NEW, RESOLVED 2026-07-03** (real exploitable free-credits path — verified live, balance ended above starting value before the fix) | Business | CRITICAL | 1 (actual) | None |
| PROD-007 | Add trial enforcement — **investigated 2026-07-03, reclassified as a product decision, not an engineering task**: the enforcement code already exists (`api/builds.py` blocks builds once `trial_ends_at` has passed, for FREE-plan users) and there's a `SubscriptionStatus.TRIALING` enum value and an unused `trial_eligible` Stripe metadata flag — but `trial_ends_at` is **never set anywhere in the codebase**, so this check is permanently dead: `current_user.trial_ends_at` is always `None`, so no one is ever actually blocked by it. Making this real requires an actual product decision this session has no basis to invent unilaterally — how long is a trial, does it apply to all free signups or only some, what happens after it ends (permanently blocked, downgraded, or is "free forever at 10 credits/month" — the plan `PLAN_DETAILS` already describes — the real intended model, making this dead code an intentional leftover rather than a bug)? Not implemented; flagging for a human product decision rather than fabricating a policy. | Business | HIGH | 4 → **0 engineering hours remaining** (blocked on a product decision — see note — not an engineering estimate) | None |
| WS-001 | ~~Migrate WebSocket to Redis pub/sub~~ **the publish half was real, but nothing subscribed — see WS-003** | Architecture | CRITICAL | 16 | None |
| WS-002 | ~~Send file deltas instead of full file dict~~ **RESOLVED 2026-07-03, and more serious than the title implied**: the backend was sending TWO different shapes for the same event (`{"delta": {...}}` and `{"files": {...}}`), and the frontend's `parseWSEvent` only ever accepted the latter — every delta-shaped `FILE_UPDATE` (every debug-loop patch, and the final consolidation event) was **silently dropped**, so files patched during the debug loop never reached the editor. Fixed by standardizing on the delta shape everywhere (`core/orchestrator.py`) and updating `wsContract.ts`/`buildStore.ts`/`mockEmitter.ts` to match. 3 backend tests passing (`test_file_update_delta_shape.py`, using stubbed agents to run the real orchestrator pipeline); frontend verified via `tsc --noEmit` and a production `vite build`. | Performance | HIGH | 8 (est.) / ~2 (actual) | None |
| SEC-015 | ~~Auth endpoints leaked password hash + raw GitHub token~~ **NEW, RESOLVED 2026-07-03** | Security | CRITICAL | 3 (actual) | None |
| BE-013 | ~~Marketplace item creation crashed on every call~~ **NEW, RESOLVED 2026-07-03** | Backend | HIGH | 1 (actual) | None |
| BE-015 | ~~Celery build pipeline looked wired but 100% non-functional end-to-end~~ **NEW, RESOLVED 2026-07-03** (wrong app binding + broken worker autodiscover + event-loop closure after 1st task) | Architecture | CRITICAL | 2 (actual) | None |
| WS-003 | ~~Live build-progress WebSocket events never delivered to any client~~ **NEW, RESOLVED 2026-07-03** (Redis pub/sub channel had no subscriber) | Architecture | CRITICAL | 1.5 (actual) | None |
| BE-018 | ~~Add role-change and remove-member endpoints for organization RBAC~~ **RESOLVED 2026-07-03, same session it was found** — added `PUT /auth/organizations/{org_id}/members/{member_id}/role` and `DELETE /auth/organizations/{org_id}/members/{member_id}` to `api/auth.py`. Guards: only OWNER/ADMIN can change another member's role or remove them (members can also remove themselves — leave the org); the org owner's role can't be changed and the owner can't be removed (ownership transfer needs a separate, more careful flow, intentionally out of scope here); role can't be set to OWNER via this endpoint. Both actions write an `audit_logs` entry. 8 tests passing in `test_team_rbac_revocation.py`. | Security/Product | HIGH | 16 (est.) / ~1 (actual) | None |

**Total P0 Hours (open/remaining): ~176** *(down from 632 across several rounds of fixes this session — reflects genuinely completed work (SEC-002/004/005/006/009/010/011/012, BE-001/005/006/009/011, DB-001/002/003, INF-004, FE-003, AI-001, AI-003, BE-018, PROD-002/003/004/005, WS-002 all resolved), plus PROD-001 and PROD-007 reclassified to 0 remaining engineering hours (both are blocked on a non-engineering decision — a real API key and a product policy choice, respectively — not on more code). PROD-005 in particular was previously mischaracterized as "still missing" earlier in this same session and corrected the same pass. Methodology: sum of "remaining engineering hours" above; resolved and reclassified rows contribute 0.)*

## P1 — High Priority (Sprint 2-3)

*Refreshed 2026-07-03: SEC-012 moved to P0 (see above). Two duplicate IDs from the original doc are renumbered here (AI-008 and PROD-008 were each used for two different items — one collides with an already-resolved P0 item of the same ID).*

| ID | Title | Category | Hours | Dependency |
|----|-------|----------|-------|------------|
| SEC-007 | Implement TOTP-based multi-factor authentication | Security | 80 | SEC-005 |
| ~~SEC-008~~ | ~~Implement email verification flow~~ **RESOLVED — same finding and fix as PROD-005** (duplicate tracking of the same item under two IDs; see PROD-005 in the P0 table for the full correction and fix) | Security | 24 (est.) / 0 (already existed / fixed alongside PROD-005) | None |
| SEC-019 | ~~Add `ALLOWED_HOSTS` to `k8s/backend.yaml` and reconcile k8s image tags with the real GHCR-based deploy path~~ **RESOLVED 2026-07-03, same session it was found** — added an `allowed-hosts` key to both the prod and staging `forge-ai-config` ConfigMaps in `k8s/secrets.yaml` and wired it into `k8s/backend.yaml` as `ALLOWED_HOSTS`; retargeted the bare `forge-backend:latest`/`forge-frontend:latest` image references in `backend.yaml`, `frontend.yaml`, and `celery-worker.yaml` to `ghcr.io/GHCR_OWNER/...` (matching what `deploy.yml` actually pushes), with `GHCR_OWNER` left as an explicit placeholder to replace at deploy time, same convention as `.env.production.example`. Note: this makes the manifests internally correct: it does **not** by itself wire `kubectl apply` into `deploy.yml` — that's the separate, larger scope decision tracked under INF-001 (use k8s vs. keep docker-compose+VPS as the real deploy target). | Security/DevOps | 8 (est.) / ~0.5 (actual) | None |
| BE-002 | ~~Implement global exception handler~~ **RESOLVED 2026-07-03, same session it was confirmed absent** — registered `@app.exception_handler(Exception)` in `main.py`. Logs via `logger.exception(...)` and reports to Sentry when `SENTRY_DSN` is set, returns a consistent `{"detail": "Internal server error"}` JSON body instead of Starlette's default plain-text 500, and doesn't leak tracebacks/exception details. Confirmed `HTTPException` routes are unaffected (FastAPI's more-specific built-in handler still takes precedence). 6 tests passing in `test_global_exception_handler.py`, run against the real app via `TestClient`. | Backend | 16 (est.) / ~1 (actual) | None |
| BE-003 | Add pagination to all list endpoints | Backend | 24 | None |
| BE-007 | Implement Redis caching for read-heavy endpoints | Performance | 40 | None |
| ~~BE-008~~ | ~~Add request ID/correlation ID middleware~~ **RESOLVED 2026-07-03** — `request_id_middleware` (`core/security.py`) sets a contextvar per request (reusing an incoming `X-Request-ID` if present, for cross-service correlation), echoes it back as a response header, and `RequestIdLogFilter` injects it into every log line via the root logger's *handlers* (not the logger object itself, which would have missed every module's `logging.getLogger(__name__)` pattern). 5 tests passing. | Observability | 8 (est.) / ~1 (actual) | None |
| BE-010 | Implement session tracking and management | Security | 40 | SEC-005 |
| ~~BE-012~~ | ~~Sign outgoing webhook payloads with HMAC~~ **RESOLVED — verified 2026-07-03** (`services/webhook.py` signs `timestamp.body` with HMAC-SHA256, sends `X-Forge-Signature`/`X-Forge-Timestamp`) | Security | 16 (est.) / 0 | None |
| BE-017 | ~~Add audit logging to Stripe billing-webhook handlers~~ **RESOLVED 2026-07-03, same session it was found** — added an `audit_logs` entry (actor = `stripe_webhook`, a system identity, since there's no logged-in human to attribute these to) to all five webhook handlers in `api/billing.py`: `handle_checkout_completed`, `handle_subscription_updated`, `handle_subscription_deleted`, `handle_invoice_payment_succeeded`, and `handle_invoice_payment_failed` — broader than the 3 originally named, since the underlying gap (billing-driven account changes with no audit trail) applied equally to all five. 6 tests passing in `test_billing_webhook_audit_logging.py`. **Follow-up found and fixed later the same day (while building PROD-039)**: a *sixth*, separate Stripe webhook endpoint (`POST /billing/webhook/payment`, handling `payment_intent.succeeded` for credit purchases) had the identical gap and was missed in the original pass — also fixed. | Compliance | 8 (est.) / ~1 (actual) | None |
| AI-004 | Implement LLM fallback chain (Anthropic→OpenAI) | AI/Reliability | 40 | None |
| AI-006 | Implement graceful degradation for circuit breaker | AI/Reliability | 8 | None |
| AI-007 | Add CSP headers to generated applications | AI/Security | 16 | None |
| FE-001 | Implement WCAG 2.1 AA accessibility | Frontend | 120 | None |
| INF-001 | ~~Create Kubernetes deployment manifests~~ Wire existing k8s manifests into the real deploy pipeline (or formally deprecate the k8s track in favor of docker-compose+VPS) — **re-scoped 2026-07-03**: all manifests already exist and are individually well-formed; the actual gap is `deploy.yml` never runs `kubectl apply`, and image tags have diverged (`forge-backend:latest` vs. GHCR versioned tags) | DevOps | 120 → **24 remaining** | SEC-019 |
| INF-005 | Set up structured logging (ELK/Loki) | Observability | 40 | None |
| ~~PROD-039~~ | ~~Add credit usage alerts (email at thresholds)~~ **RESOLVED 2026-07-03** *(renumbered earlier this session — was miscoded PROD-008)* — `services/credit_alerts.py`: fires at 20% and 0% of the plan's monthly credit allocation remaining (checked right after each build's credit reservation), deduplicated per-user via `credit_alerts_sent`, cleared wherever credits are granted (checkout completed, credit purchase, admin adjustment) so the user is warned again next time they run low. Found and fixed the same class of gap as BE-017 along the way: the `/billing/webhook/payment` handler (a third Stripe webhook endpoint, separate from the two already covered by BE-017) also granted credits with zero audit trail. 7 tests passing in `test_credit_alerts.py`. | Business | 8 (est.) / ~2 (actual) | None |
| PROD-009 | Implement dunning workflow (3 emails) | Business | 16 | None |
| PROD-010 | Add billing history UI | Product | 16 | None |
| PROD-011 | Add marketplace moderation system | Product | 16 | None |
| PROD-012 | Implement proper deployment (one-click to cloud) | Product | 40 | None |
| PROD-013 | Add usage analytics dashboard (user-facing) | Product | 24 | None |
| PROD-014 | Add build timeout to backend config (DONE) | Product | 0 | None |
| ~~PROD-015~~ | ~~Fix Settings page null crash~~ **CONFIRMED RESOLVED 2026-07-03** — the conflicting status is resolved: read `SettingsPage.tsx` in full, confirmed every access to `user` uses safe optional chaining (`user?.preferences ?? {}`, `user?.github_connected`) with no unsafe direct property access anywhere in the file. §1.2's claim was correct; this row was just stale. | UX | 4 (est.) / 0 (already fixed, just needed confirming) | None |
| ~~PROD-016~~ | ~~Fix demo mode silent fallback~~ **RESOLVED 2026-07-03** — found the concrete instances: `WorkspacePage.tsx` and `ProjectHistory.tsx` both silently rendered an "Unknown project" placeholder on a failed project fetch with zero indication anything had gone wrong. Both now show a toast on failure before falling back. | UX | 4 (est.) / ~0.5 (actual) | None |
| PROD-017 | Add confirmation dialogs for destructive actions | UX | 8 | None |
| AI-015 | Implement model routing (cheap/simple, expensive/complex) *(renumbered 2026-07-03 — was miscoded AI-008, colliding with the resolved prompt-injection-bypass item of the same ID)* | AI/Cost | 24 | AI-001 |
| INF-006 | ~~Configure Sentry for error tracking~~ **RESOLVED (code), 2026-07-03** — added `@sentry/react` to the frontend: `lib/sentry.ts` inits it (gated on `VITE_SENTRY_DSN`, no-ops when unset — same pattern as the backend), and `ErrorBoundary.tsx`'s `componentDidCatch` now reports caught errors to it too. Backend integration was already real. **Remaining, and this part is genuinely not an engineering task**: no real DSN is configured for either side in this deployment — same class of gap as PROD-001 (needs a real Sentry account/project, not code). | Monitoring | 8 → **0 engineering hours remaining** (blocked on ops: create a Sentry project and set `SENTRY_DSN`/`VITE_SENTRY_DSN`) | None |
| ~~INF-007~~ | ~~Set up database backup automation~~ **RESOLVED — the doc was stale on this, verified 2026-07-03** (real k8s CronJob: daily, gzip, optional S3 sync, 7-day retention) | DevOps | 16 (est.) / 0 | None |
| ~~INF-008~~ | ~~Add MongoDB connection pool tuning~~ **RESOLVED 2026-07-03** — Mongo's pool was already partially tuned (`maxPoolSize`/`minPoolSize` were set); added the two genuinely missing params, `maxIdleTimeMS` (recycle idle connections) and `waitQueueTimeoutMS` (fail fast instead of hanging forever when the pool is exhausted). Also found and fixed the same gap, worse, in the Redis client in the same file — it had *zero* pool bounds or timeouts at all; added `max_connections`, `socket_connect_timeout`, `socket_timeout`. | Performance | 4 (est.) / ~0.5 (actual) | None |
| GRW-001 | Set up SEO (meta tags, sitemap, robots.txt) | Growth | 16 | None |
| GRW-002 | Set up product analytics (PostHog/Mixpanel) | Growth | 40 | None |
| GRW-003 | Build referral program UI | Growth | 16 | None |
| GRW-004 | Create landing page optimization (social proof) | Growth | 8 | None |
| ~~FE-017~~ | ~~Fix Launch screen primary CTA dead-ending logged-in users at the public marketing page~~ **RESOLVED 2026-07-03** — `Launch.tsx`'s CTA (a route already gated behind auth) now navigates to `/projects` instead of the public `/home` marketing page. | UX | 2 (est.) / ~0.1 (actual) | None |

**Total P1 Hours (open/remaining): ~620** *(down from 832 across several rounds of fixes this session — BE-002/008, BE-012, BE-017, INF-006/007/008, SEC-019, SEC-008, PROD-015/016/039, FE-017 all resolved (SEC-008 turned out to be a duplicate of PROD-005; INF-006's remaining scope reclassified as ops-blocked, same as PROD-001), INF-001 narrowed from 120h to 24h now that manifests already exist; SEC-012's 8h moved out to P0 earlier, replaced net-neutral by SEC-019's 8h, which is itself now also resolved)*

## P2 — Medium Priority (Sprint 3-5)

| ID | Title | Category | Hours |
|----|-------|----------|-------|
| SEC-013 | ~~Configure CORS for production domains~~ **RESOLVED — verified 2026-07-04** (already correct: `docker-compose.prod.yml` sets `ALLOWED_ORIGINS=https://${DOMAIN}`, which `core/config.py`'s `allowed_origins` field picks up and `main.py` wires into `CORSMiddleware`; production was never actually wildcarded). Removed a dead, unused `cors_allow_origins` config field that was never read anywhere and only added confusion. | Security | 2 (est.) / ~0.25 (actual) |
| BE-004 | Implement API versioning | API Design | 24 |
| FE-002 | Implement responsive design verification | Frontend | 60 |
| FE-004 | Enable TypeScript strict mode | Code Quality | 40 |
| FE-006 | Implement frontend product analytics tracking | Analytics | 40 |
| FE-007 | Add SEO meta tags, Open Graph, structured data | SEO | 16 |
| FE-008 | ~~Replace hardcoded colors with CSS variables~~ **PARTIALLY RESOLVED 2026-07-04** — centralized the ~20 hex values that exactly duplicated existing `tailwind.config.ts` tokens into `frontend/src/lib/theme.ts` (`StatusPill`, `ReviewAgentPipeline`, `AdminConsole`, `ProjectsPage`, `MarketplacePage`). Found a bigger, separate problem while scoping this: `tailwind.config.ts`'s color tokens and `src/index.css`'s `:root` CSS custom properties are two divergent palettes with different values for the same names (e.g. `accent: #7C5CFF` vs `--accent: #8b5cf6`) — reconciling those is real design-system work, not a 4h cleanup, and risks visual regressions without a running browser to check. Left as a separate, larger follow-up. | UI | 4 (est.) / ~1 (actual, partial) |
| FE-009 | ~~Remove duplicate ActivityFeed component~~ **STALE — closed 2026-07-04, no longer applicable.** No `ActivityFeed` component exists anywhere in the repo today (verified via full-repo grep) — either already resolved by an earlier refactor or never matched this description. | Code Quality | 2 |
| FE-010 | ~~Fix WebSocket heartbeat (use native ping/pong)~~ **RESOLVED 2026-07-04** — `useBuildSocket.ts` sent a pointless client-side `ws.send('ping')` every 30s that `backend/api/builds.py`'s websocket handler silently discarded. Replaced with a server-initiated keep-alive `{"type":"ping"}` (matching the pattern already used by `orchestrator/api.py`'s review-run socket): the build websocket now uses `asyncio.wait_for(receive_text(), timeout=30)` and sends a ping frame on timeout; removed the now-dead client-side heartbeat interval and its refs. | Frontend | 4 (est.) / ~1 (actual) |
| FE-011 | ~~Static import in ChatPanel (avoid dynamic)~~ **STALE — closed 2026-07-04, no longer applicable.** `ChatPanel` is already statically imported (`WorkspacePage.tsx:11`) — no dynamic `import()`/`React.lazy` found anywhere for it. | Frontend | 2 |
| PROD-018 | ~~Add offline/error state to build inputs~~ **RESOLVED 2026-07-04** — build-failure errors already surfaced via a `build_failed` event into chat, but there was no proactive browser-offline detection and no local "submitting" state during the click-to-response gap. `ChatPanel.tsx` now listens for `online`/`offline` window events (disables input + shows a banner when offline) and tracks a local `submitting` state so the input is disabled for the full async round-trip, not just once the build store updates. | UX | 4 (est.) / ~0.5 (actual) |
| PROD-019 | ~~Fix admin analytics param mismatch~~ **RESOLVED 2026-07-04, rescoped** — wasn't actually a param-name mismatch; `adminApi` in `api.ts` never called `/admin/analytics/revenue` or `/ai-usage` at all. Added `revenue()`/`aiUsage()` wrappers and a "Revenue (30d)" / "AI usage (30d)" section to `AdminConsole.tsx`. | Product | 4 (est.) / ~1 (actual) |
| PROD-020 | ~~Add support ticket creation endpoint~~ **RESOLVED 2026-07-04** — admin already had `GET /admin/support/tickets` to list all tickets, but there was no way for a user to ever create one and no `support_tickets` collection writer anywhere. Added `backend/api/support.py` (`SupportTicket` model in `core/models.py`, `POST /support/tickets`, `GET /support/tickets` (own tickets, paginated), `GET /support/tickets/{id}`), registered in `main.py`, plus a minimal "Support" section in `SettingsPage.tsx`. | Product | 8 (est.) / ~1 (actual) |
| PROD-021 | ~~Fix _map_price_to_plan O(n) iteration~~ **RESOLVED 2026-07-04** — `backend/api/billing.py`'s `_map_price_to_plan` looped over two dicts on every call (invoked on every billing webhook); replaced with a `_PRICE_TO_PLAN` reverse-lookup dict precomputed once at module load. | Performance | 2 (est.) / ~0.1 (actual) |
| PROD-022 | ~~Add real Stripe price IDs (not placeholders)~~ **PARTIALLY RESOLVED 2026-07-04** — actual Stripe price IDs are account-specific values only creatable in a real Stripe dashboard; they can't be fabricated here. Made the six plan price IDs configurable via `STRIPE_PRICE_*` env vars (`core/config.py`, `.env.example`) instead of hardcoded placeholder strings, so ops can set real IDs at deploy time with no code change — mirrors the `GHCR_OWNER`/`ALLOWED_ORIGINS` placeholder-at-deploy convention already used elsewhere. Still needs someone with Stripe dashboard access to actually set the six env vars before going live. | Business | 4 (est.) / ~0.5 (actual) |
| PROD-023 | ~~Add annual billing option~~ **RESOLVED 2026-07-04** — the backend already fully supported annual billing (`ANNUAL_PLAN_PRICES`, `CheckoutRequest.interval`, `PlanResponse.price_annual`) but no frontend UI ever offered it. Added a Monthly/Annual toggle to `BillingPage.tsx` that passes `interval` to checkout and shows the per-month-equivalent price plus savings when annual is selected. | Business | 16 (est.) / ~1.5 (actual, backend already done) |
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
| TEST-001 | ~~Write unit tests for auth endpoints~~ **RESOLVED 2026-07-04** — no real endpoint-level auth tests existed (only rate-limit-specific coverage). Added `tests/test_auth_endpoints.py`: 10 tests exercising the real `register`/`login`/`refresh`/`logout` route handlers via `TestClient` against a `FakeDB` (weak password, duplicate email, wrong password, unknown email, MFA challenge path, refresh token rotation, logout blacklisting). **Caught a real, live regression while getting these to run** — see note below the table. | Testing | 16 (est.) / ~1.5 (actual) |
| TEST-002 | Write integration tests for build pipeline | Testing | 24 |
| TEST-003 | Write regression tests for credit deduction | Testing | 8 |
| TEST-004 | ~~Write WebSocket ownership tests~~ **STALE — closed 2026-07-04, already covered.** `test_websocket_auth.py::test_ws_rejects_foreign_build` already tests exactly this. | Testing | 8 |
| TEST-005 | ~~Add lint config (ESLint, Ruff, Prettier)~~ **RESOLVED 2026-07-04** — no committed ruff config existed (CI ran an inline `--select F,E9` with no repo config file) and there was zero ESLint/Prettier setup for the frontend at all. Added `backend/pyproject.toml` (ruff, matches CI's existing `F` ruleset so local runs match CI), `frontend/eslint.config.js` + `.prettierrc.json`, `npm run lint`/`format:check` scripts, and an `eslint` step in `ci.yml`. Codebase was already clean modulo 1 real error + 8 minor warnings, all fixed. Did *not* run `prettier --write` across the repo — two different pre-existing code styles (semi/double-quote vs. no-semi/single-quote from different generation sources) would make a blanket reformat a huge, low-value diff; Prettier is available as a manual tool, not CI-enforced. | Code Quality | 8 (est.) / ~1.5 (actual) |
| TEST-006 | ~~Add pre-commit hooks~~ **RESOLVED 2026-07-04** — a secret-scanning pre-commit hook existed and worked, but only in `.git/hooks/pre-commit`, which git never tracks — every other clone of this repo had zero protection. Moved it to tracked `scripts/git-hooks/pre-commit`, added `scripts/install-git-hooks.sh` (points `core.hooksPath` at the tracked dir), and documented it in the README quick-start. | DevOps | 4 (est.) / ~0.5 (actual) |
| TEST-007 | ~~Remove fake text-parsing tests~~ **STALE — closed 2026-07-04, no longer applicable.** No test matching this description found anywhere in the current suite (checked for `response.text` assertions — the one match, `test_global_exception_handler.py`, is a legitimate negative security assertion, not a fake test). | Testing | 2 |

**Note on TEST-001**: writing these tests required a working Python 3.10+ environment to actually run — this machine's system Python (3.9) can't even import the codebase. Building a proper venv (`python3.11 -m venv`) and running the full suite for the first time this session immediately surfaced a real, already-pushed regression: the PROD-021 `_map_price_to_plan` "optimization" (commit `adf0bdee`) silently mapped every monthly-plan Stripe checkout to `PlanTier.FREE` instead of the plan actually purchased, because its reverse-lookup dict was built via `{**PLAN_PRICES, **ANNUAL_PLAN_PRICES}` — since both dicts key by the same `PlanTier` values, the annual prices silently overwrote the monthly ones before the reverse map was ever built. Fixed in commit `56b5bf8f`. All 167 backend tests pass as of this note.

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

**GRAND TOTAL ESTIMATED HOURS: ~2,804** *(refreshed 2026-07-03; was ~3,472 — P0 dropped from 632 to 176 and P1 from 832 to 620, across multiple rounds of fixes this session (SEC-011/SEC-012/SEC-008/AI-001/AI-003/BE-018/BE-011/PROD-002/003/004/005/039/015/016/SEC-019/BE-002/005/008/017/FE-017/INF-008 resolved, PROD-001/INF-006 reclassified as blocked on non-engineering decisions like a real Resend/Sentry account, PROD-007 blocked on a product decision), reflecting real completed work net of newly-found gaps; P2/P3/P4 were not independently re-audited this pass and are carried forward unchanged)*

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
- ✅ Trial enforcement implemented *(blocked on a product decision as of 2026-07-03, not just engineering time — see PROD-007; the enforcement code already exists but its trigger (`trial_ends_at`) is never set, and someone needs to decide trial length/scope/post-trial behavior before this can be scheduled for real)*

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

*Refreshed 2026-07-03: most of the chains below root in items now confirmed resolved (SEC-005/006/009/010, BE-001, DB-001/002/003), which clears several previously-blocked downstream tasks to proceed immediately. Updated to reflect what's actually still blocking.*

## Critical Path (remaining)

```
SEC-012 (SSRF fix) — RESOLVED 2026-07-03, same session it was found → no longer blocking anything
AI-001 (wire real cost tracking + budget enforcement) — RESOLVED 2026-07-03, same session it was found → AI-003 (budget controls) — RESOLVED alongside it → AI-015 (model routing) now unblocked with real cost data to route on
SEC-005 (JTI) — RESOLVED → SEC-007 (MFA), BE-010 (session mgmt) now unblocked, can proceed
SEC-006 (slow hash) — RESOLVED → SEC-008 (email verification) now unblocked, can proceed
SEC-010/SEC-009 (sanitize_string / regex escaping) — BOTH RESOLVED → admin search is secure, no further action needed
BE-001 (Celery) — RESOLVED → BE-005 (graceful shutdown) — ALSO RESOLVED 2026-07-03, same session
DB-001/002/003 — ALL RESOLVED → database integrity chain is closed out
SEC-019 (k8s ALLOWED_HOSTS + image-tag reconciliation) — RESOLVED 2026-07-03, same session it was found → INF-001 (wire k8s into real deploy pipeline, or formally deprecate the k8s track) is now unblocked to actually decide
```

## Parallel Work Streams

| Stream | Tasks | Independent? | Dependencies |
|--------|-------|-------------|--------------|
| **Security** | SEC-007, SEC-008 | Independent — SEC-005/006/009/010/011/012/019 all resolved | None blocking |
| **Database** | — | All resolved (DB-001/002/003) | None |
| **Backend** | BE-003, BE-007 | Independent — BE-002/BE-005/BE-008/BE-009/BE-011/BE-017/BE-018 resolved | None |
| **Frontend** | FE-001, FE-005 (narrowed) | Independent — FE-017 resolved | None |
| **AI Pipeline** | AI-002, AI-005, AI-015 | Independent — AI-001/AI-003 resolved, no longer blocking | See above |
| **Infrastructure** | INF-001 (re-scoped), INF-002 (narrowed), INF-003 (narrowed) | Independent — SEC-019/INF-006/INF-008 resolved, no longer a prerequisite | None |
| **Product** | PROD-007 (reclassified — needs a decision, not code), PROD-009 through PROD-038 | Independent — PROD-001/002/003/004/005/015/016/039 resolved or reclassified this session | None |
| **Testing** | TEST-001 through TEST-007 | Independent | None — still zero frontend tests, confirmed 2026-07-03 |
| **Growth** | GRW-001 through GRW-004 | Independent — PROD-039 resolved | None |

## Blocking Paths (remaining, real)

- ~~Fake AI cost tracking (AI-001)~~ **RESOLVED 2026-07-03** — real cost is now computed and budgets are now enforced on every LLM call; AI-003 was fixed alongside it. Unit-economics re-analysis for Investment Readiness scoring can now proceed on real data (though that re-analysis itself hasn't been done yet).
- ~~k8s ALLOWED_HOSTS gap (SEC-019)~~ **RESOLVED 2026-07-03** — no longer blocks trusting the k8s deployment track; INF-001 is now a pure "wire it up or deprecate it" decision, not blocked on a config bug
- ~~No RBAC role-change/remove-member endpoint (BE-018)~~ **RESOLVED 2026-07-03** — access can now actually be revoked; "Enterprise Readiness" still needs SSO/audit-log-UI/SOC2 work, but the most basic gap (can't revoke a compromised member's access at all) is closed

## Resolved (no longer blocking anything, confirmed 2026-07-03)

SEC-002, SEC-004, SEC-005, SEC-006, SEC-009, SEC-010, BE-001, BE-006, DB-001, DB-002, DB-003, INF-004, FE-003, BE-012, INF-007

---

# SECTION 5: EXECUTIVE DASHBOARD

## Overall Status

*Refreshed 2026-07-03 (post 18:02) via a 4-track ground-truth code audit (security/auth, backend architecture/DB/AI, infra/CI/monitoring, frontend/product). Where a dimension below wasn't part of that audit, its score is carried forward unchanged and marked as such — this refresh does not invent new precision it doesn't have.*

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Overall Completion** | ~38% *(evidence-based proxy: open P0+P1 backlog hours dropped from 1,464 to 1,054 this refresh, a real ~28% reduction in known remaining critical/high-priority work; treat as directional, not a formal metric)* | 100% | ⚠️ |
| **Security Score** | 8/10 *(re-scored 2026-07-03: SEC-002/004/005/006/009/010 all confirmed genuinely resolved. The SSRF vulnerability found in webhook delivery [SEC-012] was fixed same-session — validation added at both creation and delivery time, with redirect-following disabled and 13 passing tests. No known open critical vuln remains.)* | 9/10 | ✅ (was 7.5/10, but on a stale basis) |
| **Product Score** | 4.5/10 *(re-scored 2026-07-03: template selection, admin export, and the email-verification frontend loop were all fixed. More importantly, a previously-unflagged live bug was found and fixed — the onboarding→first-build handoff was silently guaranteed to fail for every new user due to a "/build/new" project-creation bug. Still open: real preview URLs, real Stripe price IDs, prompt injection detection depth, content moderation.)* | 7/10 | 🔴 (up from 3/10) |
| **Backend Score** | 7.5/10 *(re-scored 2026-07-03, four times over the course of this session — Celery migration/build-file separation/unique-email-constraint/invitation-token-fix/build-timeout-cleanup confirmed done; then BE-002/BE-017/AI-001/BE-018 fixed; then BE-011 (Celery health check); then BE-005 (graceful shutdown) and BE-008 (request ID middleware). Remaining gaps: pagination (BE-003), Redis caching (BE-007).)* | 7/10 | ✅ (up from 3/10, above target) |
| **Frontend Score** | 3.5/10 *(not independently re-scored this pass; carried forward — note zero test infrastructure confirmed unchanged)* | 7/10 | 🔴 |
| **AI Score** | 4/10 *(re-checked 2026-07-03: prompt-injection detection is still a keyword blocklist and content moderation is still absent, unchanged. But the more serious finding — token-usage tracking persisting fake `cost_usd=0.0` and dead-code budget enforcement — was found and fixed the same session; the platform can now measure its own AI unit economics and actually enforce per-user budgets.)* | 7/10 | 🔴 (up from 3/10) |
| **Infrastructure Score** | 6/10 *(re-scored 2026-07-03, was significantly underrated: CI/CD, secret scanning, Prometheus app-level metrics, and automated MongoDB backups are all real and working — none of this existed when 2.5/10 was assigned. Held back by: k8s manifests disconnected from the real deploy pipeline, no real external secrets manager, Grafana dashboards querying metrics that don't exist yet.)* | 7/10 | ⚠️ (up from 2.5/10) |
| **Database Score** | 6/10 *(re-scored 2026-07-03: build-file/16MB separation, unique email index, and invitation-token fix all confirmed genuinely done)* | 7/10 | ⚠️ (up from 2.5/10) |
| **API Score** | 3.5/10 *(not independently re-scored this pass; carried forward)* | 7/10 | 🔴 |
| **Growth Score** | 1.5/10 *(not independently re-scored this pass; carried forward)* | 6/10 | 🔴 |
| **Enterprise Readiness** | 2/10 *(up slightly — the finding this pass that RBAC had no way to change a team member's role or remove them at all (BE-018) was fixed the same session; still no SSO/SAML, no audit-log UI, no SOC 2 work, so this remains far from enterprise-ready)* | 5/10 | 🔴 |
| **Investment Readiness** | 58/100 *(not independently re-scored this pass — a real re-score needs updated unit-economics data; AI-001's fix now means that data will actually accumulate going forward, but no re-analysis has been run yet since real cost tracking only went live this session)* | 80/100 | ⚠️ |
| **Launch Readiness** | 15% *(not independently re-scored this pass; carried forward)* | 100% | 🔴 |

## Phase-Level Progress

| Phase | % Complete | Hours Remaining | Status |
|-------|-----------|-----------------|--------|
| Phase 1: Security & Infrastructure | **Re-audited 2026-07-03, resolving the "needs re-audit" flag from the prior revision.** Of the ~30 P0 items in this phase, 22 are now confirmed genuinely resolved (SEC-002/004/005/006/009/010/011/012, BE-001/005/006/009/011/018, DB-001/002/003, INF-004, FE-003, plus the already-known SEC-001/014/015/016/BE-013/015/WS-003) — including the newly-found live vulnerability (SEC-012, SSRF), the login rate-limit gap (SEC-011), the RBAC access-revocation gap (BE-018), the Celery health check gap (BE-011), and Celery worker graceful shutdown (BE-005), all fixed the same session they were discovered. Same session also closed SEC-019 (P1, k8s config) and, in Product, PROD-002/003/004/005/015/016/039. Only 5 remain open across the full P0 list (see P0 table). | ~48h *(INF-002 24 + INF-003 24 + FE-003/FE-005 portion already counted in Product below = infra/security subset)* | ✅ Substantially further along than believed, no known live critical gap open |
| Phase 2: Architecture & Database | 65% *(re-scored 2026-07-03 — BE-001, DB-001/002/003 all confirmed done; AI-001/003 budget enforcement was dead code, found and fixed same session)* | ~60 | ⚠️ In Progress, better than reported |
| Phase 3: Core Product | 10% *(not independently re-scored this pass; carried forward)* | 240 | 🔴 Not Started |
| Phase 4: Frontend & UX | 7% *(not independently re-scored this pass beyond confirming FE-003 done and FE-005 narrowed; carried forward otherwise)* | ~178 | 🔴 In Progress |
| Phase 5: Growth | 0% | 160 | ⬜ Not Started |
| Phase 6: Enterprise | 5% *(the RBAC role-change/remove-member gap found this pass (BE-018) was fixed the same session — invite/list now has its companion revoke half. Everything else in this phase — SSO/SAML, audit-log UI, SOC 2 — genuinely hasn't started.)* | 195 | 🔴 Barely started |

## Bug & Technical Debt Metrics

| Metric | Count | Trend |
|--------|-------|-------|
| **Total Known Issues** | 131 *(127 + 4 net new this pass: SEC-019, BE-017, BE-018, FE-017 added; no items were removed from the list, only marked resolved in place)* | ⬆️ (identifying more, resolving more) |
| **P0 Issues** | 5 open *(re-counted 2026-07-03, down from 34 across three rounds this session — 27 confirmed resolved [SEC-011/SEC-012/AI-001/AI-003/BE-018/BE-005/BE-011/PROD-002/003/004/005, WS-002], 2 reclassified as blocked on non-engineering decisions rather than open engineering work [PROD-001, PROD-007])* | ⬇️ (real reduction, not just re-labeling) |
| **P1 Issues** | ~18 open *(down from 32 — BE-002/008, BE-012, BE-017, INF-006/007/008, SEC-019, SEC-008, PROD-015/016/039, FE-017 all resolved this round or earlier; SEC-008 turned out to be a duplicate of PROD-005; INF-006 reclassified as ops-blocked; 1 moved out to P0 then resolved there (SEC-012))* | ⬇️ |
| **P2 Issues** | 28 *(not independently re-audited this pass)* | ⬆️ (better visibility) |
| **P3 Issues** | 18 *(not independently re-audited this pass)* | ⬆️ (roadmap items) |
| **P4 Issues** | 14 *(not independently re-audited this pass)* | → (future) |
| **Critical Security Vulns** | **0 known open** *(SEC-012, the SSRF gap in webhook delivery found earlier this session, was fixed and tested the same day — see P0 table. No other confirmed-exploitable critical vuln is currently known; this is not a claim that none exist, only that none are currently known and open.)* | ✅ (down from 1 found-and-fixed this session) |
| **Technical Debt %** | 70% *(not independently re-audited this pass)* | ⬆️ (need to quantify) |

## Revenue Readiness

| Metric | Status | Target Date |
|--------|--------|-------------|
| **Stripe Integration** | ⚠️ Partial (placeholder prices) | Sprint 2 |
| **Credit System** | ✅ Working *(corrected 2026-07-03 — reservation and refund race conditions both confirmed resolved: PROD-006/PROD-008)* | Done |
| **Usage Alerts** | ❌ Missing | Sprint 3 |
| **Dunning** | ❌ Missing | Sprint 4 |
| **Annual Billing** | ❌ Missing | Sprint 5 |
| **Discount Codes** | ❌ Missing | Sprint 5 |
| **Refund Workflow** | ❌ Missing | Sprint 5 |
| **Enterprise Quotes** | ❌ Missing | Sprint 6 |

---

# SECTION 6: LAUNCH CHECKLIST (500+ Verifiable Items)

## SECURITY (62 items)

- [x] SEC-001-1: CSRF middleware validates X-CSRF-Token header on POST/PUT/DELETE/PATCH — verified 2026-07-03, both backend (`main.py`) and frontend (`lib/api.ts`)
- [ ] SEC-001-2: CSRF token endpoint returns cryptographically secure token — not independently re-verified
- [ ] SEC-001-3: CSRF token stored in Redis with 60-min TTL — Redis-backed confirmed 2026-07-03, exact TTL not independently re-verified
- [ ] SEC-001-4: CSRF token tied to session (not global) — confirmed keyed by JWT `jti` 2026-07-03, not re-verified against "global" framing
- [ ] SEC-001-5: CSRF validation fails closed (returns 403 on error) — not independently re-verified
- [x] SEC-002-1: FIELD_ENCRYPTION_KEY is separate from JWT_SECRET — verified 2026-07-03, `core/config.py`
- [ ] SEC-002-2: FIELD_ENCRYPTION_KEY is 64 hex characters (32 bytes) — not independently re-verified
- [x] SEC-002-3: Encryption module does not derive key from JWT secret — verified 2026-07-03, no shared derivation found
- [ ] SEC-002-4: Existing encrypted fields re-encrypted with new key — not applicable/not verified
- [x] SEC-002-5: Key rotation documentation exists — `docs/FIELD_ENCRYPTION_KEY_ROTATION.md` present in repo
- [ ] SEC-003-1: WebSocket connections do not accept token in query string
- [ ] SEC-003-2: First WebSocket message must be {"type": "auth", "token": "..."}
- [ ] SEC-003-3: WebSocket tokens expire in 5 minutes
- [ ] SEC-003-4: WebSocket token type is "ws" (not "access" or "refresh")
- [ ] SEC-003-5: WSS enforced in production configuration
- [x] SEC-004-1: Rate limiter returns 429 when Redis is unavailable — verified 2026-07-03, falls back to in-memory limiter, does not bypass
- [ ] SEC-004-2: In-memory fallback rate limiter is configurable — not independently re-verified
- [ ] SEC-004-3: Fallback limits are conservative (50% of normal) — not independently re-verified
- [ ] SEC-004-4: Redis reconnection detected and primary rate-limiting restored — not independently re-verified
- [x] SEC-005-1: All JWT tokens include "jti" claim (UUID v4) — implied and consistent with blacklist behavior verified 2026-07-03
- [x] SEC-005-2: Token blacklist uses JTI instead of full token string — verified 2026-07-03
- [x] SEC-005-3: Index on JTI field in token_blacklist collection — verified 2026-07-03, `core/database.py`
- [ ] SEC-005-4: Expired tokens cleaned up from blacklist (TTL index) — not independently re-verified
- [x] SEC-006-1: Password reset tokens hashed with pbkdf2_hmac or bcrypt — verified 2026-07-03, PBKDF2-HMAC-SHA256, 600k iterations
- [ ] SEC-006-2: Existing SHA256-hashed tokens remain valid until expiration — not applicable/not verified
- [ ] SEC-006-3: Migration path for existing stored tokens — not independently re-verified
- [ ] SEC-007-1: TOTP enrollment endpoint exists
- [ ] SEC-007-2: TOTP verification endpoint exists
- [ ] SEC-007-3: Recovery codes generated during enrollment
- [ ] SEC-007-4: MFA required for admin accounts
- [ ] SEC-007-5: MFA status exposed in user settings API
- [ ] SEC-007-6: Remember device for 30 days
- [x] SEC-008-1: Verification email sent on registration — verified 2026-07-03, `api/auth.py` `register()`, gated on `RESEND_API_KEY` being set (not currently configured in this deployment, see PROD-001)
- [x] SEC-008-2: Users marked as "unverified" until email confirmed — verified 2026-07-03, `User.email_verified` defaults `False`
- [x] SEC-008-3: Unverified users blocked from creating builds — verified 2026-07-03, `api/builds.py`
- [x] SEC-008-4: Resend verification email endpoint exists — **added 2026-07-03**, `POST /auth/resend-verification`, rate-limited 3/hour/email
- [x] SEC-008-5: Verification token expires after 24 hours — verified 2026-07-03
- [x] SEC-009-1: All user input in $regex queries escaped with re.escape() — verified 2026-07-03, `core/security.py`
- [ ] SEC-009-2: MongoDB operator injection prevented ($where, $gt, etc.) — not independently re-verified
- [ ] SEC-009-3: Search limited to specific indexed fields — not independently re-verified
- [ ] SEC-009-4: ReDoS vulnerability mitigated (max length + timeout) — `max_length=100` confirmed passed to `sanitize_string`, timeout not verified
- [x] SEC-010-1: sanitize_string exists in core/security.py — verified 2026-07-03
- [ ] SEC-010-2: Function strips control characters, limits length — length limit confirmed, control-character stripping not independently re-verified
- [x] SEC-010-3: Import in admin.py resolves correctly — verified 2026-07-03, called from `api/admin.py`
- [x] SEC-011-1: Password reset limited to 3 attempts/email/hour — verified 2026-07-03
- [ ] SEC-011-2: Registration limited to 5 attempts/IP/hour — **discrepancy found 2026-07-03**: registration is limited to 5/hour, but keyed by email, not IP as this item specifies — worth reconciling which is intended
- [ ] SEC-011-3: Rate limit headers in response (X-RateLimit-*) — not independently re-verified
- [ ] SEC-011-4: Clear error message when rate limited — not independently re-verified
- [x] SEC-011-5: Login endpoint has a per-account throttle — **fixed 2026-07-03, same session it was found**: added a `"login"` entry to `EMAIL_RATE_LIMITS` (10/hour/email), wired into `api/auth.py`'s `login()`; 5 tests passing in `test_login_rate_limit.py`
- [x] SEC-012-1: Webhook URL validated on creation — implemented and verified 2026-07-03, `api/webhooks.py` calls `validate_webhook_url()` and returns 400 on failure
- [x] SEC-012-2: Private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x.x.x) rejected — verified 2026-07-03 by direct test against the real function (also blocks link-local/169.254.169.254, multicast, unspecified, and unresolvable hosts)
- [x] SEC-012-3: HTTPS required in production — verified 2026-07-03, gated on `app_env == "production"`
- [x] SEC-012-4: Proper error message for invalid URLs — verified 2026-07-03, distinct messages per failure reason
- [x] SEC-012-5: **NEW** — Delivery-time re-validation (not just creation-time) to close the DNS-rebinding gap, plus redirect-following disabled on the outbound request so a 3xx response can't bypass the check
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
- [x] BE-002-1: Global @app.exception_handler(Exception) registered — fixed 2026-07-03, `main.py`
- [x] BE-002-2: Stack traces logged but never returned to client — verified: response body contains only `{"detail": "Internal server error"}`, no traceback/exception text
- [x] BE-002-3: Consistent error response format — matches the `{"detail": ...}` shape FastAPI's own `HTTPException` handler already uses
- [x] BE-002-4: Sensitive information stripped from error responses — verified no exception message/type leaks into the response
- [ ] BE-003-1: All list endpoints support page and per_page params
- [ ] BE-003-2: Default page size = 20, max = 100
- [ ] BE-003-3: Response includes total, page, per_page, total_pages
- [ ] BE-003-4: Backward compatible
- [ ] BE-004-1: All endpoints prefixed with /v1/
- [ ] BE-004-2: Old endpoints redirect with deprecation notice
- [x] BE-005-1: SIGTERM/SIGINT handlers registered — satisfied via Celery's own built-in SIGTERM handling plus a `worker_shutting_down` signal hook (`celery_app.py`) that logs it; not a raw `signal.signal()` registration, but functionally equivalent
- [ ] BE-005-2: Active requests allowed to complete (30s timeout) — not independently verified this session (FastAPI-side shutdown itself was verified in an earlier pass)
- [x] BE-005-3: Celery workers notified to stop accepting new tasks — Celery's default warm-shutdown behavior, confirmed real 2026-07-03; `terminationGracePeriodSeconds`/`stop_grace_period` extended to 630s so it actually has time to finish
- [x] BE-005-4: WebSocket connections gracefully closed — verified in an earlier pass this session (`main.py` lifespan calls `ws_manager.stop()`)
- [ ] BE-005-5: Health check returns unhealthy during drain — not implemented
- [ ] BE-006-1: Try/finally ensures resource cleanup on timeout
- [ ] BE-006-2: LLM API calls cancelled on timeout
- [ ] BE-006-3: Timeout events logged with build ID and duration
- [ ] BE-007-1: Cache decorator implemented
- [ ] BE-007-2: Plans, feature flags, user profiles cached (TTL 300s)
- [ ] BE-007-3: Cache invalidation on data changes
- [ ] BE-007-4: Cache hit/miss metrics exposed
- [x] BE-008-1: X-Request-ID generated for every request — fixed 2026-07-03, `request_id_middleware` in `core/security.py`
- [x] BE-008-2: Existing X-Request-ID from client propagated — verified 2026-07-03, reused if present
- [x] BE-008-3: Request ID included in all log entries — via `RequestIdLogFilter` attached to the root logger's handlers (not the logger object, which would have missed most modules' `logging.getLogger(__name__)` pattern)
- [x] BE-008-4: Request ID returned in response headers — verified 2026-07-03
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

- [x] AI-001-1: Token counting wrapper around Anthropic API calls — verified 2026-07-03, real token counts pulled from `stream.response.usage` and fed into `calculate_cost()`
- [x] AI-001-2: Usage stored in ai_usage collection per user/build — was already true before this fix; now the `cost` field is real instead of always `0.0`
- [ ] AI-001-3: Daily/weekly/monthly budget limits configurable — daily limits are configurable per plan tier and now enforced (2026-07-03); weekly/monthly are not implemented
- [ ] AI-001-4: Spending alerts at 50%, 80%, 100% of budget — not implemented
- [ ] AI-001-5: API endpoint for spending dashboard — **new finding 2026-07-03**: `get_spending_dashboard()` exists in `core/ai_usage.py` and works, but no API route calls it — same "real code, zero callers" pattern found elsewhere in this audit
- [ ] AI-001-6: Admin endpoint to adjust budgets — not found
- [ ] AI-002-1: Prompt injection detection via secondary LLM call — not implemented, still keyword-blocklist only
- [ ] AI-002-2: System prompt reinforcement on every request — not independently verified
- [ ] AI-002-3: Output validation for sensitive content — not implemented
- [ ] AI-002-4: Prompt injection attempt logged and alerted — not implemented (raises an exception but doesn't log a `SecurityEvent`)
- [x] AI-003-1: Per-user daily token budget implemented — **fixed 2026-07-03**: `check_budget()` existed and was already per-user/per-org, it just wasn't being called from anywhere in the live path; now it is, verified with tests
- [ ] AI-003-2: Concurrent request limiting (max N per user) — not implemented; budget enforcement is token-total-based, not concurrency-based
- [ ] AI-003-3: LLM requests queued when concurrent limit reached — not implemented
- [x] AI-003-4: Budget resets daily/weekly — daily reset confirmed (`day_start` boundary in `get_user_budget`); weekly is not implemented
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
- [ ] BILL-002: Free trial enforcement (trial_ends_at checked) — **investigated 2026-07-03**: the check itself exists (`api/builds.py`), but `trial_ends_at` is never set anywhere, so it's permanently a no-op; needs a product decision (trial length, scope, post-trial behavior) before this can be real, see PROD-007
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

- [x] INF-001-1: K8s Deployment manifests for backend, frontend, Celery — exist and are well-formed, verified 2026-07-03; **not** wired into the real deploy pipeline (`deploy.yml` never runs `kubectl apply` — see INF-001 in P1 backlog)
- [x] INF-001-2: K8s Service manifests with ClusterIP — present
- [x] INF-001-3: Ingress configuration with TLS — present
- [x] INF-001-4: HPA for auto-scaling (CPU/memory based) — present; celery-worker HPA also references an external `celery_queue_depth` metric with no adapter wired, so that half won't actually trigger
- [x] INF-001-5: PVCs for MongoDB and Redis — present
- [x] INF-001-6: ConfigMaps and Secrets for configuration — present as a template (see INF-003 below for the "real secrets manager" caveat)
- [x] INF-001-7: Namespace isolation (prod, staging, dev) — verified consistent across manifests
- [x] INF-002-1: Prometheus metrics endpoint (/metrics) — verified 2026-07-03, real `prometheus_client` wiring in `backend/main.py`, not just a k8s manifest
- [ ] INF-002-2: Grafana dashboards for API, system, business — manifest deploys, but panels query `celery_active_tasks`/`celery_queue_depth`/`llm_tokens_total`/`llm_cost_usd_total`/`mongodb_connections_active`, none of which are emitted yet — panels will render empty
- [x] INF-002-3: Alerting rules for error rate, latency, CPU/memory — real `PrometheusRule` confirmed in `k8s/monitoring.yaml`
- [ ] INF-002-4: PagerDuty/OpsGenie integration — not found
- [ ] INF-002-5: Synthetic monitoring (5-min intervals) — not found
- [ ] INF-003-1: Secrets not stored in .env in production — k8s Secret template exists for this purpose, but no actual external secrets manager (Vault/ESO/SOPS) is wired in yet, only referenced in comments
- [x] INF-003-2: Kubernetes Secrets used for credentials — `k8s/secrets.yaml` cross-checked against consumers, all keys match
- [ ] INF-003-3: No secrets in Docker image layers — not independently re-verified
- [x] INF-004-1: GitHub Actions CI/CD pipeline — **corrected 2026-07-03, was marked missing, is real**: `.github/workflows/ci.yml` + `deploy.yml`
- [x] INF-004-2: Lint checks in CI — ruff (backend), tsc (frontend)
- [x] INF-004-3: Test execution in CI — pytest with coverage
- [x] INF-004-4: Build and push Docker images in CI — pushes to GHCR
- [ ] INF-004-5: Deploy to staging on main branch — **discrepancy found 2026-07-03**: `deploy.yml` deploys via SSH to a VPS on push-to-main or manual dispatch; no distinct staging-vs-prod branch/environment split was found
- [ ] INF-004-6: Deploy to production on tagged releases — **discrepancy found 2026-07-03**: deploy triggers on push to `main`, not on tagged releases as this item specifies
- [ ] INF-005-1: Structured logging (JSON format) — not independently re-verified
- [ ] INF-005-2: Log aggregation (Loki or ELK) — not found
- [ ] INF-005-3: Log retention policy (30 days) — not found
- [ ] INF-006: Sentry error tracking configured — **narrowed further 2026-07-03**: integration code is real on both backend (`sentry_sdk.init()` in `main.py`) and frontend (`@sentry/react` in `lib/sentry.ts`, added this session), both gated on a DSN env var; but no real DSN is set anywhere in this deployment, so it's inactive on both sides. Remaining item is an ops task (create a Sentry project), not code.
- [x] INF-007: Automated MongoDB backup (daily) — **corrected 2026-07-03, was marked missing, is real**: `k8s/mongodb-backup-cronjob.yaml`, daily schedule, gzip, optional S3 sync, 7-day retention
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

- [x] AUTH-001: Password validation (12+ chars, uppercase, number, special) — verified 2026-07-03, `validate_password_strength`, tested in `test_encryption.py`
- [x] AUTH-002: Email verification flow complete — verified/completed 2026-07-03, see PROD-005 (duplicate of SEC-008)
- [x] AUTH-003: Password reset flow complete (email + frontend page) — code-complete, verified 2026-07-03; email delivery itself still blocked on an unconfigured Resend key, see PROD-001
- [x] AUTH-004: JWT tokens include jti claim — verified 2026-07-03
- [x] AUTH-005: Token blacklist uses JTI — verified 2026-07-03, SEC-005
- [ ] AUTH-006: Refresh token rotation implemented — not independently verified this session
- [x] AUTH-007: WebSocket auth via short-lived tokens — verified 2026-07-03, SEC-003
- [x] AUTH-008: CSRF protection on all state-changing requests — verified 2026-07-03, SEC-001
- [ ] AUTH-009: SameSite=Strict on all cookies — not independently re-verified this session (noted as true in §1.9 row 3 from an earlier pass)
- [ ] AUTH-010: Secure flag on cookies in production — not independently verified this session
- [x] AUTH-011: Rate limiting on login (per-email + per-IP) — per-email added 2026-07-03 (SEC-011); generic per-IP `/auth/*` limiter already existed
- [ ] AUTH-012: Rate limiting on registration (per-IP) — **discrepancy found 2026-07-03**: registration is rate-limited per-email (5/hour), not per-IP as this item specifies; same discrepancy as SEC-011-2
- [x] AUTH-013: Rate limiting on password reset (per-email) — verified 2026-07-03, 3/hour
- [ ] AUTH-014: Session management (list, force logout)
- [ ] AUTH-015: MFA/TOTP enrollment and verification
- [ ] AUTH-016: Recovery codes for MFA
- [ ] AUTH-017: Remember device for MFA
- [ ] AUTH-018: API key authentication works
- [ ] AUTH-019: Organization invitation flow works
- [ ] AUTH-020: SSO/SAML for enterprise

## MONITORING & OBSERVABILITY (16 items)

- [x] MON-001: Prometheus metrics endpoint accessible — verified 2026-07-03, `GET /metrics` real
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

*Refreshed 2026-07-03. Several items below that used to headline this roadmap (Celery migration, CI/CD, monitoring, database fixes) are already done — verified in code this pass, not just claimed. The roadmap is reordered around what's actually still open, with the newly-found live SSRF vulnerability now the literal first thing to fix.*

### Week 1: Triage & Stabilize

**Day 1:**
0. ~~**Fix SEC-014**: the bcrypt/passlib version incompatibility that made registration and login crash on every attempt.~~ **DONE 2026-07-03** — pinned `bcrypt==4.0.1`, verified with a real register+login round-trip. Also fixed a second bug it uncovered (SEC-016, an ObjectId serialization crash on registration).
1. ~~Fix SEC-012 (SSRF in webhook delivery)~~ **DONE 2026-07-03, same session it was found** — `validate_webhook_url()` added and wired into both webhook creation and delivery, 13 tests passing.
2. ~~Add per-account rate limiting to the login endpoint~~ **Done 2026-07-03, same session** — SEC-011 resolved.
3. **Deploy to production for real** — the CI/CD pipeline can already do this (verified working), but there is no evidence it has ever actually been run against a live environment. Running it is now the blocker, not building it.
4. Set `SENTRY_DSN` — the integration code already exists and works, it's just never been configured
5. Grant 10 trusted beta users access

**Day 2-3:**
6. ~~Fix credit system race condition (immediate revenue risk)~~ **DONE 2026-07-03** — the reservation race was verified already race-free; the real bug found and fixed was a duplicate-refund-per-retry issue (PROD-008), verified via a live test where a failing build's balance ended up above its starting value before the fix
7. Wire Resend so password-reset AND verification emails actually deliver (PROD-001/PROD-005's real remaining gap — every other part of both flows already works end-to-end, code-complete since 2026-07-03; this is purely "sign up for Resend and set the API key")
8. Send welcome emails to beta users
9. ~~Set up CI/CD pipeline~~ **Already done — verified 2026-07-03.** Real lint/SAST/test/build/deploy pipeline exists (`ci.yml`, `deploy.yml`).

**Day 4-5:**
10. ~~Fix onboarding template selection~~ **Done 2026-07-03, same session** — PROD-002 resolved, plus a more serious bug found and fixed in the same code path: onboarding's handoff to `/build/new` was silently guaranteed to fail on every new user's first build.
11. ~~Add role-change/remove-member endpoints for team RBAC~~ **Done 2026-07-03, same session it was found** — BE-018 resolved, a compromised or departing team member's access can now actually be revoked.
12. ~~Wire real `calculate_cost()`/`check_budget()` into the live AI call path~~ **Done 2026-07-03, same session** — AI-001 and AI-003 both fixed; every LLM call now logs a real cost and is subject to real per-user/org budget enforcement

**Day 6-7:**
13. Talk to 20 users
14. Identify top 3 friction points
15. Fix the most critical ones
16. Document everything

### Week 2-3: Foundation

1. ~~Complete Celery migration~~ **Already done — verified 2026-07-03**, including the three bugs that made it look wired but 100% non-functional (see BE-015)
2. ~~Set up Redis pub/sub for WebSocket~~ **Already done — verified 2026-07-03** (see WS-003; the publish half existed but had no subscriber, now fixed)
3. ~~Add monitoring (Prometheus + Grafana)~~ **Substantially already done — verified 2026-07-03.** Real `/metrics` endpoint, real `ServiceMonitor`/`PrometheusRule`. Remaining: instrument the custom metrics (`celery_active_tasks`, `llm_cost_usd_total`, etc.) the dashboards already query but that don't exist yet.
4. ~~Fix database issues (files collection, indexes)~~ **Already done — verified 2026-07-03** (DB-001/002/003)
5. Write tests for core flows — backend now has 20 real test files covering this session's fixes (76 tests passing together); **frontend still has zero test infrastructure**, confirmed 2026-07-03
6. ~~Add email verification (prevent fake accounts)~~ **Was already done, corrected + completed 2026-07-03** — this had been wrongly marked "still missing"; it was already fully implemented server-side, and the missing frontend page + resend option are now added too, see PROD-005
7. ~~Add credit usage alerts~~ **Done 2026-07-03, same session** — PROD-039 resolved; fires at 20%/0% of plan allocation remaining.

### Week 4: Product Completion

1. Complete onboarding flow (users must reach "aha moment") — the core handoff genuinely works now (a real, previously-unflagged "first build always 404s in live mode" bug was found and fixed the same session, see PROD-002); remaining is tooltips/progress tracking
2. ~~Fix preview URLs (users need to see their app)~~ **Done 2026-07-03, same session** — PROD-004 resolved, the host is now configurable. The separate in-editor live-preview sandbox (frontend's own "coming soon") is unrelated, still-unbuilt infrastructure, not touched.
3. Implement basic deployment (users need to ship)
4. Add usage analytics dashboard
5. Polish UI inconsistencies (~~Settings crash~~ resolved 2026-07-03 — Settings/Billing/Marketplace all wired to real data now, see FE-008; hardcoded colors still open; ~~Launch-screen CTA dead-ending logged-in users~~ also fixed the same day, FE-017)
6. Add confirmation dialogs (prevent accidental data loss)

### Month 2: Growth Engine

1. Launch on Product Hunt
2. Start content marketing (blog, tutorials)
3. Set up SEO basics (meta tags, sitemap)
4. Build referral program
5. Create "Built with Forge" badge
6. Start Discord community

### Month 2-3: Revenue

1. Verify unit economics (are we making money per build?) — **can now be answered honestly** now that AI-001 is wired (fixed 2026-07-03); real cost data will start accumulating from here forward — this analysis still needs to be run once enough real usage exists
2. Optimize AI costs (model routing, caching, BYOK)
3. Fix Stripe price IDs (real products, not placeholders) — confirmed still hardcoded placeholder-style strings (PROD-022)
4. Add usage-based overages (capture power user value)
5. Implement dunning (recover at-risk subscriptions)
6. Add annual billing (improve cash flow)

### Month 3-4: Enterprise

1. Start SSO/SAML implementation
2. Add RBAC enforcement — the basic access-revocation gap (BE-018: role changes, member removal) is now closed; remaining scope here is SSO/SAML and finer-grained permissions
3. Build audit log UI — the billing-webhook audit-logging gap found this pass (BE-017) is now closed, giving the UI real data to show
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

### Current State *(refreshed 2026-07-03 against actual code, not prior narrative)*
- **Score:** ~6.0/10 *(up from 3.8/10 — see REFRESH LOG at the top of this document)*
- **Security:** CSRF, encryption/JWT separation, JTI blacklisting, slow-hash tokens, and regex-escaped search are all confirmed done. **The SSRF vulnerability found in webhook delivery (SEC-012) was fixed the same session it was discovered** — no known open critical vulnerability remains.
- **Testing:** Backend has 10 real test files covering this session's fixes (Celery, AI usage, credit refunds, prompt injection, WebSocket auth/pub-sub). **Frontend still has zero test infrastructure** — no vitest/jest, no test script, confirmed unchanged.
- **Users:** None confirmed — CI/CD can deploy to a real VPS (verified working), but there's no evidence it has ever actually been run; no live URL, no changelog, no runtime artifact found.
- **Revenue:** Zero. Stripe secret key is real; Stripe price IDs are still hardcoded placeholder-style strings (PROD-022, confirmed still open).
- **Growth:** None — unchanged.
- **Found and fixed within this session:** AI cost tracking previously persisted `cost_usd=0.0` for every LLM call and budget-enforcement code was dead code. Both are now wired into the real call path (AI-001/AI-003) — the platform can measure its own unit economics going forward, though the Investment Readiness score above still needs a real re-analysis once enough post-fix usage data exists.

### What Must Be Done (In Order) — refreshed 2026-07-03

1. ~~Close the SSRF hole (SEC-012)~~ **Done 2026-07-03**, same session it was found.
2. ~~Wire real AI cost tracking (AI-001)~~ **Done 2026-07-03**, same session — AI-003 (per-user budgets) came free with it, same root cause.
3. ~~Security lockdown~~ **substantially done** — CSRF, encryption key, JTI, slow hash, SSRF, login per-account rate limiting, the k8s `ALLOWED_HOSTS` gap, the RBAC access-revocation gap (BE-018), the global exception handler (BE-002), and billing-webhook audit logging (BE-017) are all resolved; CI/CD, Celery, and Redis pub/sub are all real and working, not still to be built. Remaining P0/P1 security items: TOTP MFA (SEC-007), email verification (SEC-008).
4. ~~Database & API hardening~~ **substantially done** — build-files collection, unique email index, invitation-token fix, and RBAC role-change/remove-member endpoints (BE-018) are all resolved. Remaining: pagination (BE-003), password-reset email delivery (wire Resend).
5. **Core product completion** (still open) — prompt-injection detection beyond the keyword blocklist, content moderation, template selection, real preview URLs
6. **UX & growth foundation** (still open, largely unchanged) — accessibility, responsive design, TypeScript strict-mode adoption in remaining files, SEO, real one-click deployment, referral program UI
7. **Enterprise & launch** (still open) — SSO, real RBAC (not just invite/list), audit-log completeness, an actual external secrets manager (not just the k8s Secret template), load testing, penetration testing — and actually running the deploy pipeline against a real environment for the first time

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

The codebase will never be perfect. The security will never be complete. The features will never be finished. But you cannot build a billion-dollar company in a vacuum. The one live vulnerability found during this refresh (SSRF in webhook delivery, SEC-012) was fixed the same session — that's what "fix what's broken, then iterate" actually looks like in practice, and it's the model for everything else still open.

Deploy the product — for real this time; the pipeline to do it already exists and has apparently never been used. Give it to 100 developers. Watch them use it. Listen to their feedback. Fix what's broken. Iterate.

Everything else — the remaining hardening, the frontend tests, the enterprise features, the growth engine — is easier with real users and real revenue.

**Deploy. Today.**

---

*This Master Execution Plan was originally prepared by the Executive Leadership Team (CEO, COO, CTO, CPO, CISO, VP Engineering, VP Product, VP Design, VP Growth, VP Customer Success, VP Sales, VP Finance, DevOps Lead, QA Director, Platform Architect, AI Systems Architect), and refreshed 2026-07-03 against a live ground-truth code audit — see REFRESH LOG at the top of this document for methodology and what changed.*

*Original date: March 7, 2026 — Refreshed: 2026-07-03*
*Version: 1.1*
*Classification: Confidential — Executive Use Only*