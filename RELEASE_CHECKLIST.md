# Forge AI — Release Checklist

**Date:** 2026-01-07  
**Status:** ❌ Not Started | 🔄 In Progress | ✅ Complete | 🚫 Blocked | ⬜ Not Applicable

---

## Architecture Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| A-01 | No message queue (BackgroundTasks) replaced with Celery | ❌ | P0 | Verify all builds processed via Celery tasks |
| A-02 | API versioning implemented (`/v1/` prefix) | ❌ | P2 | API returns 200 on `/v1/*` endpoints |
| A-03 | API versioning redirect for legacy endpoints | ❌ | P2 | Old endpoints return 301 or deprecation header |
| A-04 | Pagination on all list endpoints | ❌ | P1 | Verify pagination metadata in responses |
| A-05 | Cache layer for read-heavy endpoints | ❌ | P2 | Cache hit/miss metrics confirm caching |
| A-06 | Global error handler with sanitized responses | ❌ | P1 | Unhandled exceptions return safe 500 |
| A-07 | Graceful shutdown with connection draining | ❌ | P1 | SIGTERM drains connections cleanly |
| A-08 | Structured logging throughout the stack | ❌ | P1 | All logs in JSON format with request IDs |
| A-09 | Request ID / correlation ID in all services | ❌ | P2 | X-Request-ID in response and logs |
| A-10 | Graceful degradation strategy documented | ❌ | P2 | Degradation modes defined per service |

---

## Backend Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| B-01 | All P0 security vulnerabilities fixed | ❌ | P0 | Security test suite passes |
| B-02 | Celery task queue operational with persistence | ❌ | P0 | Task survives Celery restart |
| B-03 | Dead-letter queue for failed tasks | ❌ | P0 | Failed tasks appear in DLQ |
| B-04 | Task retry logic (3 retries) | ❌ | P0 | Task retried on failure |
| B-05 | Authentication: JWT with JTI claims | ❌ | P0 | JWT includes `jti` field |
| B-06 | Token blacklist uses JTI | ❌ | P0 | Blacklisted JTI rejects tokens |
| B-07 | CSRF token validation on all state-changing endpoints | ✅ (2026-07-03) | P0 | Requests without token return 403 — backend was already correct; fixed frontend to actually send the token (see ENGINEERING_BACKLOG.md SEC-001) |
| B-08 | Rate limiting: fail-closed on Redis failure | ❌ | P0 | Redis down → 429 response |
| B-09 | Rate limiting on auth endpoints | ❌ | P0 | Exceed limit → 429 |
| B-10 | Password reset tokens use slow hash | ❌ | P0 | Token hash is pbkdf2/bcrypt |
| B-11 | Encryption key independent from JWT secret | ❌ | P0 | Separate FIELD_ENCRYPTION_KEY in config |
| B-12 | NoSQL injection protection in admin search | ❌ | P0 | Operator injection returns no results |
| B-13 | Webhook URL validation (SSRF protection) | ❌ | P1 | Private IPs rejected |
| B-14 | Webhook payload signing with HMAC | ❌ | P1 | X-Forge-Signature header present |
| B-15 | Graceful shutdown implemented | ❌ | P1 | Zero build loss on restart |
| B-16 | Build timeout cleanup (resource leak fix) | ❌ | P1 | Timeout cleans up all resources |
| B-17 | Dependency-aware health checks | ❌ | P1 | DB/Redis down → 503 |
| B-18 | CORS production domain configuration | ❌ | P1 | Production domains allowed |
| B-19 | Audit logging on critical operations | ❌ | P1 | Project delete logged |
| B-20 | Credit operations use MongoDB transactions | ❌ | P0 | Race condition test passes |
| B-21 | Idempotency key on build creation | ❌ | P0 | Duplicate requests return existing build |

---

## Frontend Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| F-01 | Root-level error boundary with fallback UI | ❌ | P1 | Unhandled error shows fallback |
| F-02 | Error reporting to monitoring service | ❌ | P1 | Errors appear in monitoring |
| F-03 | TypeScript strict mode enabled, zero errors | ❌ | P2 | `tsc --noEmit` passes |
| F-04 | WCAG 2.1 AA accessibility compliance | ❌ | P1 | axe DevTools: 0 violations |
| F-05 | ARIA labels on all interactive elements | ❌ | P1 | Automated a11y scan passes |
| F-06 | Keyboard navigation for all features | ❌ | P1 | Tab through all features works |
| F-07 | Focus management (traps, order) | ❌ | P1 | Focus stays in modals, order logical |
| F-08 | Color contrast meets WCAG AA | ❌ | P1 | Contrast checker passes |
| F-09 | Skip-to-content link present | ❌ | P1 | Tab first shows skip link |
| F-10 | Responsive design: mobile (375px) | ❌ | P2 | All pages render at 375px |
| F-11 | Responsive design: tablet (768px) | ❌ | P2 | All pages render at 768px |
| F-12 | Responsive design: desktop (1440px) | ❌ | P2 | All pages render at 1440px |
| F-13 | Hamburger navigation on mobile | ❌ | P2 | Navigation collapses on mobile |
| F-14 | Touch targets ≥44px on mobile | ❌ | P2 | All touch targets meet minimum |
| F-15 | Guided onboarding flow with sample project | ❌ | P2 | New users complete onboarding |
| F-16 | Product analytics tracking key events | ❌ | P2 | Events appear in analytics |
| F-17 | SEO meta tags and Open Graph | ❌ | P2 | Meta tags present in source |
| F-18 | sitemap.xml and robots.txt | ❌ | P2 | Files accessible at /sitemap.xml |
| F-19 | ToS/Privacy Policy consent on registration | ❌ | P0 | Consent checkbox on signup |
| F-20 | Landing page with marketing content | ❌ | P2 | Landing page has hero, features, pricing |

---

## Security Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| S-01 | CSRF token validated (not just presence) | ✅ (2026-07-03) | P0 | State-changing request without token → 403; verified via curl: missing token → 403, valid token from `/auth/csrf-token` → 200 |
| S-02 | Encryption key separate from JWT secret | ❌ | P0 | Verify FIELD_ENCRYPTION_KEY in vault |
| S-23 *(new — the checklist already used S-14/S-15/S-16/S-17 for other items; using the next free ID)* | Password hashing functional (registration/login succeed) | ✅ (2026-07-03) | P0 | `bcrypt`/`passlib` incompatibility fixed (pinned `bcrypt==4.0.1`), verified with a real register+login round-trip — see ENGINEERING_BACKLOG.md SEC-014. Fixing this also surfaced and required fixing SEC-016 there (ObjectId serialization crash on registration; unrelated numbering — that's the backlog's ID scheme, not this checklist's). |
| S-24 *(new, same reason)* | Auth responses don't leak password hash or raw tokens | ✅ (2026-07-03) | P0 | `GET /auth/me`, login/register/refresh responses contain no `hashed_password` or raw `github_token` — see ENGINEERING_BACKLOG.md SEC-015 |
| S-03 | WebSocket authentication (token in first message) | ❌ | P0 | Connect without token → rejected |
| S-04 | Rate limiting fail-closed (Redis down → 429) | ❌ | P0 | Stop Redis → all requests return 429 |
| S-05 | JTI token blacklisting | ❌ | P0 | Blacklisted JTI rejected |
| S-06 | Password reset token slow hashing | ❌ | P0 | Hash is pbkdf2 with high iterations |
| S-07 | NoSQL injection prevention | ❌ | P0 | `$where` injection returns no results |
| S-08 | Auth endpoint rate limiting | ❌ | P0 | 5 registrations/IP/hour enforced |
| S-09 | MFA/2FA with TOTP | ❌ | P1 | MFA enrollment and verification works |
| S-10 | Email verification flow | ❌ | P1 | Unverified users blocked from builds |
| S-11 | Webhook URL SSRF protection | ❌ | P1 | Internal IPs rejected |
| S-12 | CORS production origin configuration | ❌ | P1 | Only production origins allowed |
| S-13 | Prompt injection detection and prevention | ❌ | P0 | Injection attempts blocked |
| S-14 | Content moderation for generated code | ❌ | P1 | Secrets/malware flagged |
| S-15 | CSP headers for generated apps | ❌ | P1 | CSP header in generated responses |
| S-16 | Webhook payload signing (HMAC) | ❌ | P1 | X-Forge-Signature verified |
| S-17 | Session management (concurrent session control) | ❌ | P2 | Force logout other sessions works |
| S-18 | Audit logging on operations | ❌ | P1 | Audit entries created and immutable |
| S-19 | Credit race condition protection | ❌ | P0 | Concurrent builds deduct once |
| S-20 | LLM API rate limiting per-user | ❌ | P0 | Budget exceeded → build rejected |
| S-21 | Third-party security audit passed | ❌ | P0 | No critical/high findings |
| S-22 | Penetration test cleared | ❌ | P0 | No exploitable vulnerabilities |

---

## Infrastructure Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| I-01 | K8s manifests for all services | ❌ | P0 | `kubectl apply` succeeds |
| I-02 | K8s Deployments (backend, frontend, Celery) | ❌ | P0 | All pods running |
| I-03 | K8s Services (ClusterIP/LoadBalancer) | ❌ | P0 | Services reachable |
| I-04 | K8s Ingress with TLS termination | ❌ | P0 | HTTPS works, cert valid |
| I-05 | HPA for backend service | ❌ | P1 | Backend scales on CPU > 70% |
| I-06 | HPA for frontend service | ❌ | P1 | Frontend scales on CPU > 70% |
| I-07 | HPA for Celery workers | ❌ | P1 | Workers scale on queue depth |
| I-08 | PVCs for persistent storage | ❌ | P0 | Data persists across pod restarts |
| I-09 | ConfigMaps and Secrets for configuration | ❌ | P0 | No hardcoded config |
| I-10 | Namespace isolation (prod, staging, dev) | ❌ | P0 | Namespaces created |
| I-11 | Terraform scripts for cloud infrastructure | ❌ | P0 | `terraform apply` creates resources |
| I-12 | Rolling update strategy configured | ❌ | P1 | Zero-downtime deployment |
| I-13 | PodDisruptionBudget (minAvailable: 2) | ❌ | P1 | PDB created and validated |
| I-14 | Readiness/liveness probes on all pods | ❌ | P1 | Probes configured and passing |
| I-15 | Docker image tagging (semver + SHA) | ❌ | P2 | Image tags verified |
| I-16 | Blue/green deployment capability | ❌ | P2 | Traffic switches between versions |
| I-17 | Canary release capability | ❌ | P2 | Gradual traffic shift works |

---

## Database Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| D-01 | MongoDB replica set (3 nodes) | ❌ | P0 | `rs.status()` shows 3 members |
| D-02 | Automatic failover on primary loss | ❌ | P0 | Kill primary → new primary elected |
| D-03 | Read from secondaries where appropriate | ❌ | P0 | Read preference configured |
| D-04 | Write concern set to majority | ❌ | P0 | `w: majority` in connection config |
| D-05 | Connection string uses replica set | ❌ | P0 | Connection string includes all nodes |
| D-06 | Database migration system (Alembic) | ❌ | P1 | Migration create/apply/rollback works |
| D-07 | All indexes managed via migrations | ❌ | P1 | No `_ensure_indexes()` in app code |
| D-08 | Data retention policies enforced (TTL indexes) | ❌ | P1 | TTL indexes on time-series data |
| D-09 | Data archival to cold storage | ❌ | P1 | Archive process tested |
| D-10 | Database connection pool monitoring | ❌ | P2 | Pool metrics in Grafana |

---

## Testing Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| T-01 | Unit tests for all API routers (≥80% coverage) | ❌ | P0 | `pytest --cov` ≥ 80% |
| T-02 | Unit tests for core modules | ❌ | P0 | Security, encryption, config tested |
| T-03 | Integration tests with test MongoDB | ❌ | P0 | Tests use testcontainers |
| T-04 | Integration tests with test Redis | ❌ | P0 | Tests use testcontainers |
| T-05 | E2E tests: registration flow | ❌ | P0 | Playwright test passes |
| T-06 | E2E tests: build creation flow | ❌ | P0 | Playwright test passes |
| T-07 | E2E tests: admin panel | ❌ | P0 | Playwright test passes |
| T-08 | Load tests: auth endpoints | ❌ | P1 | k6 test passes thresholds |
| T-09 | Load tests: build creation | ❌ | P1 | k6 test passes thresholds |
| T-10 | Load tests: project CRUD | ❌ | P1 | k6 test passes thresholds |
| T-11 | Database stress tests | ❌ | P1 | Connection pool limits tested |
| T-12 | Chaos tests: pod failure | ❌ | P1 | Pod killed → recovery verified |
| T-13 | Chaos tests: network latency | ❌ | P1 | Latency injected → degradation works |
| T-14 | Chaos tests: database failover | ❌ | P1 | Primary killed → failover works |
| T-15 | Performance baseline documented | ❌ | P1 | Latency p50/p95/p99 recorded |
| T-16 | Performance regression detection in CI | ❌ | P1 | CI fails on performance regression |
| T-17 | Accessibility tests (axe DevTools) | ❌ | P1 | 0 violations |
| T-18 | Security tests (OWASP ZAP or similar) | ❌ | P0 | No critical findings |

---

## Monitoring Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| M-01 | Prometheus metrics endpoint (`/metrics`) | ❌ | P0 | `/metrics` returns Prometheus data |
| M-02 | Custom business metrics (builds, users, credits) | ❌ | P0 | Metrics for key business KPIs |
| M-03 | Grafana dashboards deployed | ❌ | P0 | Dashboards show real-time data |
| M-04 | Grafana: API performance dashboard | ❌ | P0 | Latency, error rate, throughput visible |
| M-05 | Grafana: System resources dashboard | ❌ | P0 | CPU, memory, disk, network visible |
| M-06 | Grafana: Build pipeline dashboard | ❌ | P0 | Build success rate, duration, queue depth |
| M-07 | Grafana: Business metrics dashboard | ❌ | P0 | Active users, builds, revenue, churn |
| M-08 | Alerting rules configured | ❌ | P0 | High error rate, high latency, service down |
| M-09 | Alert integration with PagerDuty/OpsGenie | ❌ | P0 | Alert triggers notification |
| M-10 | Synthetic uptime monitoring (every 5 min) | ❌ | P0 | Uptime check passes |
| M-11 | Certificate expiry monitoring | ❌ | P0 | Cert expiry alert configured |
| M-12 | Structured log aggregation (Loki/Elastic) | ❌ | P1 | Logs searchable in UI |
| M-13 | Log retention policy configured | ❌ | P1 | Logs retained per policy |
| M-14 | APM with distributed tracing | ❌ | P2 | Traces visible across services |
| M-15 | Database connection pool monitoring | ❌ | P2 | Pool metrics and alerts |

---

## Performance Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| P-01 | API response time p95 < 500ms (under load) | ❌ | P1 | Load test verifies threshold |
| P-02 | API response time p99 < 2s (under load) | ❌ | P1 | Load test verifies threshold |
| P-03 | Page load time < 3s (Lighthouse) | ❌ | P1 | Lighthouse score > 90 |
| P-04 | First Contentful Paint < 1.5s | ❌ | P1 | Lighthouse score > 90 |
| P-05 | Redis caching for read-heavy endpoints | ❌ | P2 | Cache hit rate > 80% |
| P-06 | Database query optimization (N+1 prevention) | ❌ | P1 | Query count per endpoint ≤ 5 |
| P-07 | Frontend bundle size optimization | ❌ | P2 | Bundle size < 500KB gzipped |
| P-08 | Image optimization (lazy loading, responsive) | ❌ | P2 | Lighthouse image audit passes |
| P-09 | CDN for static assets | ❌ | P2 | Assets served from CDN |
| P-10 | Performance regression detection in CI | ❌ | P1 | CI compares against baseline |

---

## AI Pipeline Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| AI-01 | LLM token usage tracked per build/user | ❌ | P0 | ai_usage collection has data |
| AI-02 | Daily/weekly/monthly budget limits enforced | ❌ | P0 | Budget exceeded → build rejected |
| AI-03 | Spending alerts at 50%/80%/100% | ❌ | P0 | Alert fires at thresholds |
| AI-04 | Spending dashboard with per-user breakdown | ❌ | P0 | Dashboard shows spending data |
| AI-05 | Prompt injection detection (secondary LLM) | ❌ | P0 | Injection attempt blocked and logged |
| AI-06 | System prompt reinforcement | ❌ | P0 | System prompt prepended to every request |
| AI-07 | Input/output guardrails implemented | ❌ | P0 | Malicious input blocked, safe output |
| AI-08 | Per-user daily token budget enforced | ❌ | P0 | Exceed budget → build rejected |
| AI-09 | Concurrent LLM request limiting | ❌ | P0 | Max N concurrent requests enforced |
| AI-10 | LLM fallback chain (Anthropic → OpenAI → local) | ❌ | P1 | Fallback activated on timeout |
| AI-11 | Degraded mode user notification | ❌ | P1 | User sees degraded mode message |
| AI-12 | Content moderation: secret scanning | ❌ | P1 | Secrets flagged in generated code |
| AI-13 | Content moderation: malware detection | ❌ | P1 | Malware patterns flagged |
| AI-14 | Content moderation: copyright detection | ❌ | P1 | GPL content flagged |
| AI-15 | Code review queue in admin panel | ❌ | P1 | Suspicious builds in review queue |
| AI-16 | Circuit breaker graceful degradation | ❌ | P2 | User-friendly 503 with Retry-After |
| AI-17 | CSP for generated application previews | ❌ | P1 | CSP headers in preview responses |

---

## Business Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| BC-01 | Terms of Service drafted and published | ❌ | P0 | ToS displayed on website |
| BC-02 | Privacy Policy drafted and published | ❌ | P0 | Privacy Policy displayed on website |
| BC-03 | Consent tracking on registration | ❌ | P0 | Consent record stored in DB |
| BC-04 | ToS/Privacy Policy version tracking | ❌ | P0 | Version field in consent records |
| BC-05 | Stripe products created (Free, Standard, Pro, Enterprise) | ❌ | P0 | Products in Stripe dashboard |
| BC-06 | Stripe prices created (monthly, annual) | ❌ | P0 | Prices in Stripe dashboard |
| BC-07 | Price IDs configured via environment variables | ❌ | P0 | No hardcoded price IDs |
| BC-08 | SLA defined and published | ❌ | P2 | SLA document on website |
| BC-09 | SLA uptime tracking implemented | ❌ | P2 | Uptime meets 99.9% target |
| BC-10 | Customer support platform integrated | ❌ | P2 | Support widget in app |
| BC-11 | Status page operational (status.forge.ai) | ❌ | P2 | Status page shows green |
| BC-12 | Knowledge base with FAQ | ❌ | P2 | FAQ available in help center |
| BC-13 | API documentation for consumers | ❌ | P2 | API docs published |
| BC-14 | Landing page with marketing content | ❌ | P2 | Landing page live |
| BC-15 | GDPR data deletion cascade complete | ❌ | P0 | All user data removed on deletion |
| BC-16 | Data retention policies documented | ❌ | P1 | Policy document published |
| BC-17 | GDPR data export before deletion | ❌ | P0 | Export offered before deletion |

---

## Legal & Compliance Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| L-01 | Terms of Service legally reviewed | ❌ | P0 | Legal sign-off obtained |
| L-02 | Privacy Policy legally reviewed | ❌ | P0 | Legal sign-off obtained |
| L-03 | SLA legally reviewed | ❌ | P2 | Legal sign-off obtained |
| L-04 | GDPR compliance: right to deletion | ❌ | P0 | Delete user → all data removed |
| L-05 | GDPR compliance: right to data portability | ❌ | P0 | Export user data → JSON/CSV |
| L-06 | GDPR compliance: consent tracking | ❌ | P0 | Consent records in DB |
| L-07 | GDPR compliance: data retention policy | ❌ | P1 | Retention policy documented |
| L-08 | CCPA compliance (if targeting California) | ❌ | P1 | CCPA-specific disclosures |
| L-09 | WCAG accessibility legal compliance | ❌ | P1 | WCAG 2.1 AA audit passes |
| L-10 | COPPA compliance (if users under 13) | ❌ | P1 | Age verification on signup |

---

## Deployment Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| DP-01 | CI pipeline passes on all branches | ❌ | P0 | CI green on PR |
| DP-02 | CI does not allow broken frontend (`continue-on-error` removed) | ❌ | P1 | Frontend error → CI red |
| DP-03 | CD pipeline deploys to staging automatically | ❌ | P0 | Staging updated on merge |
| DP-04 | CD pipeline deploys to production on tag | ❌ | P0 | Production updated on version tag |
| DP-05 | Blue/green deployment tested | ❌ | P2 | Traffic switches cleanly |
| DP-06 | Canary release tested | ❌ | P2 | Gradual traffic shift works |
| DP-07 | Rollback procedure tested | ❌ | P1 | Rollback completes in < 5 min |
| DP-08 | Migration runs automatically in CI/CD | ❌ | P1 | Migration applied on deploy |
| DP-09 | Migration rollback tested | ❌ | P1 | Rollback migration works |
| DP-10 | Secrets injected at deploy time, not in image | ❌ | P0 | No secrets in container images |
| DP-11 | Docker images tagged with semver + SHA | ❌ | P2 | Image tags verified |

---

## Operations Checklist

| # | Item | Status | Priority | Verification Method |
|---|------|--------|----------|-------------------|
| O-01 | Incident response plan documented | ❌ | P0 | Document stored in runbook |
| O-02 | On-call schedule configured | ❌ | P0 | PagerDuty schedule active |
| O-03 | Runbooks for common incidents | ❌ | P1 | Runbooks: DB failover, restore, restart |
| O-04 | Disaster recovery drill completed | ❌ | P0 | RPO < 1h, RTO < 4h verified |
| O-05 | Backup restore tested | ❌ | P0 | Restore to test instance works |
| O-06 | Monitoring and alerting verified | ❌ | P0 | Test alert triggers notification |
| O-07 | Log aggregation operational | ❌ | P1 | Logs searchable in Loki/Elastic |
| O-08 | Performance baseline established | ❌ | P1 | Baseline metrics recorded |
| O-09 | Escalation procedures documented | ❌ | P1 | Escalation tree defined |
| O-10 | Post-mortem process established | ❌ | P1 | Template and process documented |

---

## Summary

| Category | Total Items | ❌ Not Started | 🔄 In Progress | ✅ Complete | Completion % |
|----------|-------------|---------------|----------------|------------|--------------|
| Architecture | 10 | 10 | 0 | 0 | 0% |
| Backend | 21 | 20 | 0 | 1 | 5% |
| Frontend | 20 | 20 | 0 | 0 | 0% |
| Security | 24 (+2 added 2026-07-03) | 21 | 0 | 3 | 13% |
| Infrastructure | 17 | 17 | 0 | 0 | 0% |
| Database | 10 | 10 | 0 | 0 | 0% |
| Testing | 18 | 18 | 0 | 0 | 0% |
| Monitoring | 15 | 15 | 0 | 0 | 0% |
| Performance | 10 | 10 | 0 | 0 | 0% |
| AI Pipeline | 17 | 17 | 0 | 0 | 0% |
| Business | 17 | 17 | 0 | 0 | 0% |
| Legal & Compliance | 10 | 10 | 0 | 0 | 0% |
| Deployment | 11 | 11 | 0 | 0 | 0% |
| Operations | 10 | 10 | 0 | 0 | 0% |
| **Total** | **210** | **206** | **0** | **4** | **2%** |

*Updated 2026-07-03: B-07 and S-01 (CSRF) resolved — the frontend now attaches the token. S-23 and S-24 (new items — password hashing and credential-leak, respectively) both resolved same day: S-23 was initially added as broken (blocking all registration/login) but was fixed within the same session — see ENGINEERING_BACKLOG.md SEC-014/SEC-015/SEC-016 for full detail. This checklist item's earlier draft numbering (S-14/S-15) collided with pre-existing unrelated items and was corrected to S-23/S-24.*