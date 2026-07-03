# Forge AI — Execution Tracking

**Consolidated from:** CEO_ACTION_PLAN.md, EXECUTIVE_DASHBOARD.md, SPRINT_PLAN.md, TASK_BREAKDOWN.md, IMPLEMENTATION_SEQUENCE.md, IMPLEMENTATION_SUMMARY.md, P0_ACTION_ITEMS.md (all now removed — content merged here)
**Status ground truth:** [MASTER_EXECUTION_PLAN.md](MASTER_EXECUTION_PLAN.md) (refreshed 2026-07-03, reconciled against live code audit). Where the source documents below disagree with each other on completion status or scores, this file defers to MASTER_EXECUTION_PLAN.md's numbers — that document is the one that was re-verified line-by-line against the actual codebase.
**Important dating note:** SPRINT_PLAN.md, TASK_BREAKDOWN.md, IMPLEMENTATION_SEQUENCE.md, and P0_ACTION_ITEMS.md were originally written 2026-01-07/2026-03-07 against a much earlier codebase state (score ~18-25/100) and describe a forward-looking plan; CEO_ACTION_PLAN.md and EXECUTIVE_DASHBOARD.md are dated 2026-07-03 and describe a materially more advanced state (~68/100). MASTER_EXECUTION_PLAN.md's 2026-07-03 refresh is the most current and accurate reconciliation (~60/100, see its REFRESH LOG for why its number differs slightly from the Exec Dashboard's 68/100 — the refresh found both better-than-documented items, like working CI/CD and backups, and worse-than-documented items, like the SSRF gap and zero AI-cost data before the fix). Task/sprint IDs (SEC-xxx, BE-xxx, INF-xxx, etc.) are preserved as-is from the original planning docs for traceability, even though many are now resolved.

---

## 1. Executive Dashboard

### Overall Health (as of 2026-07-03, CEO_ACTION_PLAN/EXECUTIVE_DASHBOARD figures)

```
Overall Score:  68/100   Security: 68/100   Product: 75/100   Backend: 70/100
Frontend: 72/100   AI Pipeline: 80/100   Infrastructure: 65/100   Business: 70/100
Investment: 60/100   Launch Ready: 55/100   Enterprise: 40/100
```

> **Reconciliation note:** MASTER_EXECUTION_PLAN.md's independent refresh (same day) put overall readiness at ~60/100 (up from a 3.8/10 baseline) using a stricter, code-verified methodology. Treat the 68/100 figure above as the pre-refresh executive snapshot; MASTER_EXECUTION_PLAN.md is the reconciled number.

### What's Working (per CEO_ACTION_PLAN, corroborated by MASTER_EXECUTION_PLAN)
- Core build pipeline operational (~89% success rate)
- Authentication system functional (bcrypt/passlib incompatibility that had totally broken registration/login was found and fixed 2026-07-03 — see SEC-014 below)
- Celery build pipeline operational (was 100% broken end-to-end due to 3 wiring bugs, fixed same day — see BE-015)
- WebSocket real-time streaming functional (Redis pub/sub had no subscriber; fixed same day — see WS-003)
- Credit system race-condition fixes (reservation half verified race-free; refund-per-retry bug found and fixed — see PROD-008)
- CI/CD pipeline, secret scanning, Prometheus metrics, and MongoDB backup automation — all real and working (this was previously undersold as "missing" in earlier drafts)

### Critical Gap Found in the 2026-07-03 Refresh (not in the CEO Action Plan's original list)
- **Webhook delivery had no SSRF protection at all** — arbitrary user-supplied URLs, zero validation. This was the single most urgent open item at refresh time; **resolved same day** (SEC-012, see below).
- AI cost tracking was silently persisting `cost_usd=0.0` for every LLM call — budget enforcement code existed but was never invoked from the live path. **Resolved same day** (AI-001/AI-003).

### What's Blocking Launch (reconciled — status column reflects MASTER_EXECUTION_PLAN.md as of 2026-07-03)
| Item | CEO Action Plan (initial) | Current status |
|---|---|---|
| Placeholder secrets in k8s/secrets.yaml | CRITICAL | RESOLVED — deliberate external-injection design (see PRODUCTION_AUDIT_REPORT.md §3.1); still not integrated with a real secrets manager (INF-003, 24h remaining) |
| No automated database backups | CRITICAL | RESOLVED — real k8s CronJob (`mongodb-backup-cronjob.yaml`), daily, S3 sync, 7-day retention |
| Redis deployment missing from Kubernetes | CRITICAL | RESOLVED — Redis deployment with auth exists in k8s manifests |
| LLM usage tracking not persisted | CRITICAL | RESOLVED 2026-07-03 (AI-001/AI-003) |
| Real Stripe secrets not configured | CRITICAL | STILL OPEN — ops task, real Stripe keys not present in this deployment |
| CI doesn't enforce test failures | HIGH | RESOLVED — see PRODUCTION_AUDIT_REPORT.md §3.3, ci.yml runs pytest + ruff as blocking gates |
| No integration test coverage | HIGH | STILL OPEN — backend has 10 real test files covering recent fixes; no dedicated integration-test layer |
| Monitoring/alerting not configured | HIGH | PARTIALLY RESOLVED — Prometheus + Grafana manifests real and wired; PagerDuty/OpsGenie integration and several custom metrics (celery_queue_depth, llm_cost_usd_total, etc.) still missing |
| No load testing performed | HIGH | STILL OPEN |
| No penetration testing completed | HIGH | STILL OPEN |

### Financial Position (CEO_ACTION_PLAN, 2026-07-03)
- Current Burn: $13K/month (infrastructure only)
- Engineering Cost: $96K/month (3 engineers @ $150/hr)
- Total Monthly Burn: $109K
- Runway: 6 months at current burn (assuming $650K available)
- Breakeven: Month 4 (~1,400 users, $70K MRR)

### Feature/Endpoint/DB Health Snapshot (EXECUTIVE_DASHBOARD, 2026-07-03 — see MASTER_EXECUTION_PLAN §1 for the reconciled per-item status)
| Category | Total | Complete | Partial | Missing | % Complete |
|----------|-------|----------|---------|---------|------------|
| Core Build Pipeline | 8 | 7 | 1 | 0 | 94% |
| Project Management | 6 | 5 | 1 | 0 | 92% |
| Authentication | 10 | 8 | 2 | 0 | 90% |
| Billing & Payments | 8 | 4 | 4 | 0 | 75% |
| Team & Collaboration | 5 | 3 | 2 | 0 | 80% |
| Marketplace | 4 | 3 | 1 | 0 | 88% |
| Admin & Analytics | 6 | 4 | 2 | 0 | 83% |
| Deployment | 4 | 2 | 2 | 0 | 75% |
| Growth Features | 4 | 2 | 2 | 0 | 75% |
| **TOTAL** | **55** | **38** | **17** | **0** | **85%** |

For the authoritative, code-verified per-feature/endpoint/collection status table, see MASTER_EXECUTION_PLAN.md §§1.1-1.11 — it supersedes the snapshot above with 2026-07-03 corrections (e.g., password hashing, auth response leaks, marketplace crash, WebSocket delivery, credit-refund bug — all found and fixed the same day these dashboards were last edited).

### Team & Capacity (CEO_ACTION_PLAN)
- Current team: 4 engineers, 88% utilization (near capacity)
- No dedicated security engineer, QA engineer, or DevOps engineer
- Recommended: add 2 engineers (Security + QA) — $288K/month, 8-week timeline to production, Low risk

---

## 2. CEO Action Plan — Priority Order

**Recommendation:** Proceed with Phase 1 (Production Readiness) immediately. Invest $720K-$864K over 8-12 weeks with 5-6 engineers to reach production-ready state. (Original ask was $765K-$1.2M; figures reconciled to the plan's own later revision in §11.)

### Week 1: Immediate Actions
| Day | Focus | Owner | Key actions |
|---|---|---|---|
| 1-2 | Security & Secrets | DevOps Lead | Replace placeholder secrets *(superseded — see reconciliation table above; secrets.yaml already uses external-injection design)*, set up AWS Secrets Manager/Vault, rotate secrets, configure real Stripe secrets, enable CI/CD secret injection |
| 3-4 | Infrastructure | DevOps Lead | Add Redis to K8s *(superseded — already present)*, automated backups *(superseded — already present via CronJob)*, monitoring stack, alerting rules, log aggregation |
| 5 | Testing & Validation | QA Lead | Enable failing CI on test errors *(superseded — already enforced)*, run full test suite, LLM usage tracking persistence *(superseded — resolved 2026-07-03)*, baseline load test, security/dependency/container scans |

### Week 2: Production Deployment
- Days 1-2: Staging deployment, integration tests, load test (1K users), monitoring verification, backup/restore test, penetration test, performance audit
- Days 3-4: Final security/performance review, DR drill, incident response runbook, go-live checklist, team training, stakeholder sign-off
- Day 5: Production launch (blue-green), 24h monitoring, launch announcement, begin onboarding/support/marketing

### Weeks 3-4: Post-Launch Stabilization
- Week 3: Monitor production metrics, fix critical bugs, gather feedback, scale infra, optimize performance
- Week 4: MFA for admins, marketplace moderation, proper cloud deployment, structured logging, Phase 2 planning

### Months 2-3: Strategic Priorities
| Priority | Owner | Investment | Key deliverables |
|---|---|---|---|
| Reliability (wk 5-8) | VP Engineering | $384K | Integration tests (70%), E2E tests (50%), load testing (10K users), global exception handler |
| Growth (wk 5-8) | VP Growth | $96K | SEO, product analytics, referral program, usage dashboard, community |
| Enterprise (wk 9-12) | VP Sales | $384K | SSO/SAML, RBAC, audit logging, SOC 2 Type I prep, enterprise pricing |

### Go/No-Go Criteria
**Go requires ALL:** all P0 security resolved, no placeholder secrets, security/pen test passed, automated+tested backups, monitoring/alerting configured+tested, Redis operational, DR tested, test coverage >50%, load test passes 1K users, real Stripe secrets, LLM usage tracking implemented, incident response + on-call ready.

**No-Go triggers (any one):** placeholder secrets remain, critical vulns, no security audit, no backups, no monitoring, Redis not deployed, test coverage <30%, load test fails at 500 users, unresolved critical bugs, placeholder Stripe secrets, no incident response/on-call.

### Risk Mitigation Summary
- **LLM API cost overrun** (High probability/impact): budget controls, per-user limits, cost alerts at 80%, prompt optimization, caching — mitigated by AI-001/AI-003 fix.
- **Security breach** (Low probability/Critical impact): quarterly audits, monthly pen tests, bug bounty ($10K), security training, incident response, cyber insurance.
- **Cash flow negative** (High probability/Critical impact): Series A fundraising, extend runway, reduce burn, accelerate enterprise revenue.

---

## 3. Sprint Plan (Original 6-Sprint / 14-Week Plan, Jan 2026)

> Team size assumed: 5 engineers. This plan predates the 2026-07-03 reconciliation; many items below are now resolved out of sequence (found and fixed same-day during adjacent work rather than in their originally planned sprint). Status annotations reflect current reality.

### Sprint 0: Foundation & Security (Weeks 1-2) — Goal: fix all P0 security vulns, establish infra foundation
Key tasks: SEC-010, SEC-001 *(resolved, was mis-scoped — root cause was a missing frontend interceptor, not backend)*, SEC-002, SEC-003, SEC-004, SEC-005, SEC-006, SEC-009, SEC-011, SEC-012, SEC-013, BE-001 (Celery migration), INF-001 (K8s manifests), INF-003 (secrets mgmt), DEVOPS-002 (Ingress/TLS), FE-003 (error boundary), FE-004 (TS strict mode), BUS-001 (ToS/Privacy), TEST-001 (test infra start), DB-002 (migration system).
Total: 20 tasks / 640 hours vs. 400h capacity (160% over — intentional, priority-ordered).

**New item found 2026-07-03, not in original Sprint 0 scope:** SEC-014 (bcrypt/passlib incompatibility — total registration/login outage). **Resolved same day** (pinned `bcrypt==4.0.1`; also surfaced and fixed SEC-016, an ObjectId serialization crash).

### Sprint 1: Infrastructure & Reliability (Weeks 3-4) — Goal: complete K8s/secrets/monitoring, DB resilience, enable staging deploy
Key tasks: SEC-007 (MFA), SEC-008 (email verification — later found already implemented, see PROD-005), AI-002 (prompt injection), INF-001 (complete), INF-002 (monitoring), INF-005 (backup strategy), DB-001 (replica set), BE-002 (exception handler), BE-005 (graceful shutdown), BE-006 (timeout cleanup), BE-011 (health checks), OBS-001 (structured logging), FE-001 (accessibility start), TEST-001/002, DEVOPS-001 (CI fix).
Total: 16 tasks / 708 hours vs. 400h capacity.

### Sprint 2: AI Pipeline & Business (Weeks 5-6) — Goal: harden AI cost controls/injection protection/fallback, legal & pricing foundations
Key tasks: BE-009 (audit logging), DEVOPS-003/004 (HPA, zero-downtime), INF-007 (per-user rate limiting), AI-001 (cost tracking — **resolved 2026-07-03**, ahead of schedule), AI-003 (per-user budgets — resolved alongside AI-001), AI-004 (fallback chain), BE-003 (pagination), BE-012 (webhook signing), FE-001/002 (accessibility/responsive), BUS-002/003/004 (Stripe config, SLA, support system).
Total: 15 tasks / 516 hours vs. 400h capacity.

### Sprint 3: Compliance & Frontend Polish (Weeks 7-8) — Goal: GDPR compliance, data lifecycle, UX polish, remaining P1 security
Key tasks: AI-005 (content moderation), AI-007 (CSP for generated apps), INF-006/008 (degradation strategy, pool monitoring), OBS-004 (APM), DB-003/004 (retention, GDPR cascade delete), BE-010 (session mgmt), BE-004 (API versioning), FE-005 (onboarding — partially done 2026-07-03, goal→prompt handoff shipped), FE-006/007 (analytics, SEO), TEST-001 finalize (≥80% coverage target), SEC-007 (MFA if not done), DEVOPS-005 (compose parity).
Total: 15 tasks / 504 hours vs. 400h capacity.

### Sprint 4: Performance & CI/CD (Weeks 9-10) — Goal: optimize perf, complete CI/CD, blue/green + canary, finish frontend
Key tasks: AI-006 (circuit breaker degradation), INF-004 (image tagging), BE-007 (Redis caching), BE-008 (request ID middleware), BUS-005/006 (landing page, API docs), PERF-001 (query/response optimization), blue/green + canary deployment config, runbooks.
Total: 11 tasks / 316 hours vs. 400h capacity (under, buffer for spillover).

### Sprint 5: Security Audit & Launch Prep (Weeks 11-14, 4-week sprint)
Key tasks: AUDIT-001/002/003 (third-party audit, pen test, remediation), LAUNCH-001 through LAUNCH-010 (DR drill, load test at production volume, final regression, beta coordination, incident response plan, runbooks, production deployment, smoke tests, monitoring verification, rollback drill).
Total: 13 tasks / 320 hours vs. 800h capacity (4-week sprint, buffer for audit remediation).

### Sprint Summary Table
| Sprint | Focus | Tasks | Hours | Capacity | Utilization |
|--------|-------|-------|-------|----------|-------------|
| 0 | Foundation & Security | 20 | 640 | 400 | 160% |
| 1 | Infrastructure & Reliability | 16 | 708 | 400 | 177% |
| 2 | AI Pipeline & Business | 15 | 516 | 400 | 129% |
| 3 | Compliance & Frontend | 15 | 504 | 400 | 126% |
| 4 | Performance & CI/CD | 11 | 316 | 400 | 79% |
| 5 | Security Audit & Launch | 13 | 320 | 800 | 40% |
| **Total** | | **90** | **3,004** | **2,800** | **107%** |

### 2026-07-03 Update: Items Landing Outside Formal Sprint Execution
Seven items landed while doing adjacent work rather than in their planned sprint slot — **all seven resolved same day found**:
SEC-014 (bcrypt/passlib outage), SEC-016 (ObjectId serialization crash), SEC-001 (CSRF — frontend interceptor gap), SEC-015 (auth response credential leak), BE-013 (marketplace crash), BE-014 (preferences storage), FE-008/FE-009 (Billing/Marketplace/Settings wiring; Review Board UI).

---

## 4. Task Breakdown / P0 Action Items (Atomic Task Detail)

> Full atomic task tables (sub-hour granularity, dependencies, AI-readiness) for every backlog epic are preserved below at summary level; see MASTER_EXECUTION_PLAN.md §2 for the authoritative current status of each parent item (SEC-xxx, BE-xxx, etc.)

### Epic Summary (405 total atomic tasks, 2,532 hours, from TASK_BREAKDOWN.md)
| Epic | Tasks | Hours | AI-Ready | Human Tasks |
|------|-------|-------|----------|-------------|
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

Human-only tasks are concentrated in legal review, design decisions, documentation, and accessibility testing with screen readers.

### P0 Dependency Resolution Sprint (March 2026, "Active Sprint" tracking)
Original scope: 24 items across Security(9)/Database(3)/Architecture(3)/Product(5)/AI(2)/Infrastructure(2) — **all 24 marked done** by the sprint's own tracking.

**2026-07-03 correction:** eight additional P0s were found *after* this sprint closed, each because a "done" item's underlying claim didn't hold up end-to-end when re-verified against running code:
- **SEC-014**: bcrypt/passlib version incompatibility crashing every registration/login. Resolved (pin bcrypt==4.0.1).
- **SEC-016**: ObjectId serialization crash on registration (only reachable after SEC-014 fix). Resolved.
- **SEC-015**: Auth responses leaked password hash + raw GitHub token. Resolved (`_public_user_dict()`).
- **BE-015**: Despite BE-001 (Celery migration) being marked done, the pipeline 500'd on every real build request — 3 independent wiring bugs (wrong Celery app binding, broken autodiscover, event-loop closure after first task). Resolved.
- **WS-003**: Despite WS-001 (Redis pub/sub) being marked done, no subscriber existed — build-progress events were never delivered to any client. Resolved (added `start_pubsub_listener()`).
- **PROD-008**: Credit refund fired once per Celery retry instead of once per build — a real exploitable free-credits path. Resolved.
- **AI-008**: Prompt injection blocklist had 2 concrete bypasses (whitespace reformatting; only checked last message). Resolved.

**Current status: zero newly-discovered open P0s from the 2026-07-03 session** — all 8 additional findings resolved same day.

### Notable Atomic-Task Detail Worth Preserving
- **SEC-001 (CSRF, 16h est. → ~1h actual):** Root cause was mis-diagnosed in the original breakdown — backend `validate_csrf_token()`, session-scoped generation, and route coverage were already correct (tasks 1.1/1.2/1.4). The actual gap (task 1.6, newly added) was that `frontend/src/lib/api.ts` never fetched or attached the `X-CSRF-Token` header at all. Fixed with an axios interceptor.
- **SEC-010 (sanitize_string, 2h):** Fully implemented — `core/security.py` function + import fix + unit test.
- **BE-001 (Celery migration, 80h):** All 13 sub-tasks conceptually complete per the original breakdown, but see BE-015 above — completeness of the individual claims didn't mean the pipeline worked end-to-end.
- **AI-001 (LLM cost tracking, 40h):** All sub-tasks (schema, token counting, per-build/user storage, budget enforcement, alerts, dashboards) resolved 2026-07-03 in ~1 actual hour once wired into the two real call sites (`agents/base.py`'s `stream()`/`_call_llm()`).

---

## 5. Implementation Sequence & Strategy

### Ordering Principle
Work is organized into 6 phases (Phase 0 immediate actions through Phase 6 security audit & launch), sequenced by dependency: security fixes are independent and parallelizable; INF-001 (K8s manifests) is the single biggest bottleneck (blocks DB replication, monitoring, secrets, ingress, HPA, zero-downtime); BE-001 (Celery) blocks graceful shutdown; OBS-001 (structured logging) gates the global exception handler and request-ID middleware; TEST-001 (200h) must start early and run throughout; BUS-001 (legal) must start immediately because legal review takes calendar time regardless of engineering effort.

### Tasks Suitable for AI Coding Agents (from IMPLEMENTATION_SEQUENCE.md §§3-4)
- **Tier 1 (AI-first, minimal review):** SEC-010, SEC-004/005/006/011/012/013, BE-003/006/008/011/012, FE-003/007, AI-007, INF-004, DEVOPS-001/005, TEST-001/002 (bulk generation), BUS-006.
- **Tier 2 (AI-assisted, human review):** SEC-001/002/003, BE-001/002/005/007/009/010, DB-002, INF-001/002/003, AI-001/003/004, FE-001/002/005/006.
- **Tier 3 (human-led):** SEC-007/008, AI-002/005, BUS-001/002/003/004, FE-005 (UX decisions), DB-004 (GDPR compliance-critical).

### Revised Release Score Projection (IMPLEMENTATION_SEQUENCE.md's own modeling, pre-dates the 2026-07-03 reconciliation)
| Dimension | Then-Current | After Sprint 0 | After Sprint 2 | After Sprint 4 | After Sprint 5 (Launch) |
|-----------|---------|----------------|----------------|----------------|-------------------------|
| Overall | 18/100 | 38/100 | 60/100 | 76/100 | **85/100 (target)** |

> Note: as of the 2026-07-03 reconciliation in MASTER_EXECUTION_PLAN.md, actual overall readiness is ~60/100 — roughly matching this projection's "after Sprint 2" milestone, achieved faster than modeled thanks to same-day fixes outside the formal sprint sequence.

### Timeline & Cost Scenarios
| Scenario | Timeline | Cost | Release Score | Risk |
|----------|----------|------|----------------|------|
| 1 engineer | 34 wks (~8 mo) | $120K | 70/100 | High |
| 3 engineers | 22 wks (~5.5 mo) | $250K | 80/100 | Medium |
| **5 engineers (recommended)** | **14 wks (~3.5 mo)** | **$350K** | **85/100** | **Low** |
| 5 engineers + AI agents | 10 wks (~2.5 mo) | $350K + AI costs | 85/100 | Low-Medium |
| 10+ AI agents | 6 wks (~1.5 mo) | $200K + heavy AI costs | 80/100 | Medium (quality risk from reduced human review) |

**Recommendation (original):** 5 engineers + AI-assisted development, 10 weeks, 85/100 target score.

---

## 6. Implementation Summary (Epics Completed To Date)

The following epics were reported complete as of the last full implementation pass (pre-2026-07-03 refresh; see MASTER_EXECUTION_PLAN.md for verified current status of each):

1. **Authentication & User Management** — org/team/invitation endpoints, Onboarding page, User model extensions (trial_ends_at, downgraded_to)
2. **Billing Platform** — annual plans, trial system, downgrade endpoint, Billing page, credit enforcement in builds.py, Stripe checkout (monthly/annual)
3. **Deployment Platform** — Docker deployment, GitHub push, env vars, PreviewPanel deploy/export/share/push actions
4. **Admin Console** — admin endpoints (users/builds/security events/feature flags), Admin dashboard frontend
5. **Analytics Platform** — funnel/retention/conversion/AI-cost endpoints, analytics API methods, onboarding-step tracking
6. **Customer Onboarding** — trial activation endpoint, onboarding analytics events, interactive wizard with progress tracking
7. **Product Differentiation** — BusinessModelAgent integrated into build pipeline
8. **Collaboration** — team membership/invitation system, Organization & Team models
9. **Marketplace** — CRUD/rating/download endpoints (`api/marketplace.py`), Marketplace browsing page
10. **Post-Build Experience** — export/share/push-to-GitHub actions, one-click deploy from preview panel
11. **Growth Engine** — referrals/notifications/trial tracking (`api/growth.py`), Resend email integration
12. **Security & Abuse Prevention** — rate limiting middleware, anomaly detection, audit logging in admin endpoints

**Key files added/modified:** `api/auth.py`, `api/billing.py`, `api/growth.py` (new), `api/marketplace.py` (new), `api/builds.py`, `core/security.py` (new), `core/models.py`, `main.py`; frontend `pages/Onboarding.tsx`, `pages/Billing.tsx`, `pages/Admin.tsx`, `pages/Marketplace.tsx`, `components/preview/PreviewPanel.tsx`, `lib/api.ts`, `App.tsx`.

**Remaining work flagged at the time:** WebSocket reliability improvements (since resolved — see WS-003 above), resizable panel enhancements, performance optimizations, integration testing (still open).

---

## 7. Current Master Backlog Pointer

For the single authoritative, currently-open backlog (P0/P1/P2/P3, with hours and dependencies reconciled against live code as of 2026-07-03), see **MASTER_EXECUTION_PLAN.md §2: SECTION 2 — MASTER BACKLOG**. Do not use the sprint/task-breakdown hour estimates above as current-state indicators — they are the original planning estimates and most of the P0 items they describe are now resolved, often in a fraction of the originally estimated time once the actual root cause was identified.

---

## 8. Implementation Backlog (from IMPLEMENTATION_BACKLOG.json, folded in — file removed)

> **Important ID-collision note:** this backlog's task IDs (SEC-001 = "remove Docker socket", SEC-002 = "remove plaintext secrets from git", etc.) are from a *different, independently-numbered* audit pass than the SEC-xxx IDs used elsewhere in this file and in MASTER_EXECUTION_PLAN.md (where SEC-001 = CSRF, SEC-002 = encryption-key separation, etc.). Do not cross-reference SEC-IDs between this section and the rest of the document — they are from unrelated numbering schemes that happen to share a prefix. Per MASTER_EXECUTION_PLAN.md's 2026-07-03 refresh, many of the findings below (Docker socket removal, secrets rotation/CI injection, `to_list(None)` pagination, CSRF frontend wiring, encryption-key separation, WebSocket token auth) are already resolved in the current codebase — see MASTER_EXECUTION_PLAN.md §2 for current per-item status. This section preserves the original backlog's own task detail (severity, root cause, acceptance criteria) for traceability; it is not itself a live status tracker.

**Summary:** 26 tasks, 16 marked as deployment blockers, 139 estimated hours, across 4 sprints.

### Sprint 1 — Critical Deployment Blockers (all `production_blocker: true`)

| ID | Title | Severity | Hours | Affected files |
|----|-------|----------|-------|-----------------|
| SEC-001 | Remove Docker-in-Docker and unmount Docker socket from production | Critical | 24 | `backend/Dockerfile`, `backend/api/deployments.py`, `docker-compose.yml` |
| SEC-002 | Remove plaintext secrets from version control and rotate all credentials | Critical | 4 | `.env`, `.gitignore` |
| SEC-003 | Containerize sandbox runner with read-only filesystem and seccomp profiles | Critical | 16 | `backend/sandbox/runner.py`, `backend/api/builds.py` |
| SEC-004 | Fix credit refund race condition with atomic guard and idempotency key | Critical | 4 | `backend/api/builds.py` |
| SEC-005 | Replace email-based admin detection with database-stored admin role | Critical | 6 | `backend/api/admin.py`, `backend/core/models.py`, `frontend/src/App.tsx` |
| SEC-006 | Replace unbounded MongoDB `to_list(None)` queries with paginated limits | High | 4 | `backend/api/auth.py`, `backend/api/marketplace.py`, `backend/api/billing.py` |
| SEC-007 | Implement trial enforcement middleware with `trial_ends_at` checks | High | 6 | `backend/core/models.py`, `backend/api/builds.py`, `backend/core/orchestrator.py` |
| SEC-008 | Fix password reset flow: email sending + frontend reset route | High | 8 | `backend/api/auth.py`, `backend/core/config.py`, `frontend/src/App.tsx` |
| SEC-009 | Add authorization ownership checks to container kill/remove operations | High | 4 | `backend/api/deployments.py` |
| SEC-010 | Sanitize file paths from build output to prevent path traversal | High | 4 | `backend/api/deployments.py`, `backend/sandbox/runner.py` |
| SEC-011 | Implement marketplace content moderation pipeline with admin approval | High | 8 | `backend/api/marketplace.py` |
| SEC-012 | Create `UserResponse` Pydantic model to prevent sensitive data exposure | High | 3 | `backend/api/auth.py` |
| SEC-013 | Protect GitHub token from logging and exposure in request/response | High | 4 | `backend/api/deployments.py` |
| SEC-014 | Harden rate limiter IP detection with proper proxy trust configuration | High | 3 | `backend/core/security.py` |
| SEC-015 | Enforce MongoDB TLS/SSL for all database connections in production | Medium | 2 | `backend/core/database.py`, `backend/core/config.py`, `.env.example` |
| SEC-016 | Remove production volume mounts and switch to immutable container images | Medium | 2 | `docker-compose.yml`, `backend/Dockerfile` |

Each task above carries (in the original JSON, not reproduced per-row here for brevity) a business-impact statement, technical root cause, acceptance criteria, validation steps, and rollback plan — see git history for `IMPLEMENTATION_BACKLOG.json` if the full text is needed.

### Sprint 2 — High Severity, Not a Deployment Blocker
| ID | Title | Severity | Hours |
|----|-------|----------|-------|
| SEC-017 | Implement persistent CSRF protection (stateless Double Submit Cookie pattern); tokens were in-memory only and verifier was never wired to any endpoint | High | 4 |

### Sprint 3 — Medium Severity
| ID | Title | Severity | Hours |
|----|-------|----------|-------|
| SEC-018 | Fix Stripe webhook signature verification — bare `except Exception` masked genuine errors as "Invalid webhook" | Medium | 3 |
| SEC-019 | Make CORS origins configurable via environment variable for production | Medium | 1 |
| SEC-020 | Restrict `TrustedHostMiddleware` to exact production domain names (remove `*.forge.ai`/`*.local` wildcards) | Medium | 1 |
| SEC-021 | Implement prompt injection detection/sanitization for AI agent inputs | Medium | 8 |
| SEC-022 | Migrate JWT from HS256 to RS256 with key rotation and token revocation | Medium | 8 |

### Sprint 4 — Low Severity (Defense-in-Depth)
| ID | Title | Severity | Hours |
|----|-------|----------|-------|
| SEC-023 | Implement rate limiting on WebSocket connections | Low | 3 |
| SEC-024 | Populate IP address and user agent in all audit log entries | Low | 4 |
| SEC-025 | Fix decryption failure handler to return a sanitized error instead of raw ciphertext | Low | 1 |
| SEC-026 | Use a separate, independent encryption key instead of deriving from the JWT secret | Low | 4 |

---

## 9. Execution Plan — Multi-Agent Remediation Strategy (from EXECUTION_PLAN.json, folded in — file removed)

> As with §8, treat this as historical planning input, not current status — see MASTER_EXECUTION_PLAN.md for what's actually resolved as of 2026-07-03 (notably: Celery/BackgroundTasks migration, Redis pub/sub for WebSocket, CI/CD, CSRF, encryption-key separation, and several "P0" items below are already done).

**Original assessment (pre-dates the 2026-07-03 reconciliation):** maturity score 3.8/10, based on a 70+-file code audit. Overall risk rated **CRITICAL** — 17 P0 security vulnerabilities (including Docker-socket container escape), zero automated test coverage, and fundamental architecture blockers (in-process `BackgroundTasks` orchestrator, no build timeout/cancellation, ephemeral in-memory WebSocket state, 16MB MongoDB BSON document limit reachable). Estimated 212 person-hours to reach a production-ready baseline across 8 specialized agents in 5 ordered phases.

**Stack summary:** React 18 + TypeScript 5.4 + Vite 5.2 + Zustand/react-query frontend; FastAPI 0.111 + Motor (async MongoDB) + Redis + Celery 5.4 ("installed but unused" at time of audit) backend; Anthropic Claude (primary) + OpenAI (fallback) for AI; Stripe billing, Resend email, Docker SDK for deployment.

**Key architectural issues flagged (pre-2026-07-03):** orchestrator ran in FastAPI `BackgroundTasks` (blocked all workers during builds); Celery installed but never wired; WebSocket registry in-memory only (no horizontal scaling, zero availability across restarts); no circuit breaker/backoff for Anthropic calls; no build timeout or cancellation; full file dict retransmitted on every WebSocket event instead of deltas; single MongoDB document per build risked the 16MB BSON limit.

### Remediation Agents & Phases

| Phase | Agents | Focus | Hours | Priority |
|-------|--------|-------|-------|----------|
| 1 | agent-01-security, agent-06-devops | Security & infra lockdown (Docker socket removal, CSRF, WS auth, JWT secret enforcement, Redis rate limiting, Dockerfile/CI hardening) | 48 | Immediate, gating |
| 2 | agent-02-backend-architecture, agent-03-database | Celery migration, circuit breaker, connection pooling, Redis pub/sub for WS, `build_files` collection split, missing indexes/TTLs | 60 | Blocking |
| 3 | agent-04-frontend, agent-07-product-fixes | Error boundaries, WS token fix, password reset, template wiring, admin export, GitHub OAuth, trial enforcement, credit alerts | 48 | High |
| 4 | agent-05-testing | Test suite from near-zero coverage to ≥70% line coverage (unit + integration + WS + credit-race + auth + Stripe webhook tests) | 40 | High |
| 5 | agent-08-performance | Delta-based WS updates, Redis caching (`get_current_user`, billing plans, marketplace), `$facet` admin pagination, WS compression | 16 | Medium, post-stabilization |

**Recommended agent roles and estimated hours:** Security Engineer (32h), Principal Backend Engineer (40h), Database Architect (20h), Staff Frontend Engineer (24h), QA/Test Engineer (40h), DevOps/Platform Engineer (16h), Product Engineer (24h), Performance Engineer (16h) — total 212h.
