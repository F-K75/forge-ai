# Forge AI — Risk Register

**Date:** 2026-01-07  
**Status:** 🔴 Active | 🟡 Mitigated | 🟢 Closed | ⚪ Not Yet Applicable

---

## Risk Scoring

| Score | Likelihood | Impact |
|-------|-----------|--------|
| 5 | Almost Certain | Catastrophic |
| 4 | Likely | Critical |
| 3 | Possible | Major |
| 2 | Unlikely | Minor |
| 1 | Rare | Negligible |

**Risk Level = Likelihood × Impact**
- **Critical (15-25):** Requires immediate mitigation
- **High (10-14):** Requires active management
- **Medium (5-9):** Monitor and plan mitigation
- **Low (1-4):** Accept or monitor

---

## Risk Register

### R-001: Data Loss from Single MongoDB Instance

| Field | Value |
|-------|-------|
| **Description** | Single MongoDB instance in production. If the instance fails, all data is lost. No replication, no failover. |
| **Likelihood** | 4 (Likely - hardware failures are inevitable) |
| **Impact** | 5 (Catastrophic - complete data loss) |
| **Risk Level** | **20 (Critical)** |
| **Mitigation** | Deploy MongoDB replica set (3 nodes) in Sprint 1. Implement automated daily backups with point-in-time recovery. Test restore procedure monthly. |
| **Owner** | DevOps Lead |
| **Status** | 🔴 Active |
| **Trigger** | MongoDB instance failure |
| **Contingency** | Restore from latest backup (RPO: 24h, RTO: 4h) |
| **Residual Risk** | Medium - backup may be up to 24h stale |

---

### R-002: Security Breach via CSRF/Encryption Flaws

| Field | Value |
|-------|-------|
| **Description** | Multiple P0 security vulnerabilities (CSRF bypass, encryption key derived from JWT secret, rate limiting bypass, token blacklist using raw token). Any of these could lead to account takeover or data breach. |
| **Likelihood** | 5 (Almost Certain - vulnerabilities are exploitable) |
| **Impact** | 5 (Catastrophic - user data compromise, legal liability) |
| **Risk Level** | **25 (Critical)** |
| **Mitigation** | Fix all P0 security issues in Sprint 0. Implement automated security tests. Conduct third-party security audit in Sprint 5. |
| **Owner** | Security Lead |
| **Status** | 🔴 Active |
| **Trigger** | Public deployment before fixes are applied |
| **Contingency** | Incident response plan, force password reset for all users |
| **Residual Risk** | Low after all P0 fixes and audit |

---

### R-003: Build Loss from BackgroundTasks

| Field | Value |
|-------|-------|
| **Description** | Build processing uses FastAPI BackgroundTasks which are in-process and not persisted. Server restart/crash loses all in-flight builds. |
| **Likelihood** | 4 (Likely - deployments require restarts) |
| **Impact** | 4 (Critical - user dissatisfaction, lost work) |
| **Risk Level** | **16 (Critical)** |
| **Mitigation** | Migrate to Celery with Redis broker in Sprint 0. Implement task persistence, retries, and dead-letter queues. |
| **Owner** | Staff Engineer |
| **Status** | 🔴 Active |
| **Trigger** | Server restart during build processing |
| **Contingency** | Manual rebuild request to users |
| **Residual Risk** | Low after Celery migration |

---

### R-004: Uncontrolled AI Costs

| Field | Value |
|-------|-------|
| **Description** | No token counting, no cost tracking, no per-user budget limits. Single user could exhaust monthly AI budget in minutes. |
| **Likelihood** | 5 (Almost Certain - no controls in place) |
| **Impact** | 4 (Critical - budget overrun, service disruption) |
| **Risk Level** | **20 (Critical)** |
| **Mitigation** | Implement LLM cost tracking (AI-001) and per-user rate limiting (AI-003) in Sprint 2. Set up spending alerts at 50%/80%/100%. |
| **Owner** | Staff Engineer |
| **Status** | 🔴 Active |
| **Trigger** | Malicious or heavy user exhausts budget |
| **Contingency** | Kill switch to disable LLM calls, manual budget review |
| **Residual Risk** | Medium - budgets may need tuning |

---

### R-005: No Production Infrastructure

| Field | Value |
|-------|-------|
| **Description** | Only Docker Compose exists. No Kubernetes manifests, no Terraform, no CI/CD pipeline. Cannot deploy to production. |
| **Likelihood** | 5 (Almost Certain - no infrastructure exists) |
| **Impact** | 5 (Catastrophic - cannot launch) |
| **Risk Level** | **25 (Critical)** |
| **Mitigation** | Create K8s manifests (INF-001) in Sprint 0-1. Implement Terraform for cloud infrastructure. Set up CI/CD pipeline. |
| **Owner** | DevOps Lead |
| **Status** | 🔴 Active |
| **Trigger** | Launch date without infrastructure |
| **Contingency** | Deploy on managed platform (Heroku/Railway) as interim |
| **Residual Risk** | Low after K8s deployment |

---

### R-006: Legal Liability (No ToS/Privacy Policy)

| Field | Value |
|-------|-------|
| **Description** | No Terms of Service or Privacy Policy. No consent tracking. Legal liability for GDPR/CCPA violations. |
| **Likelihood** | 4 (Likely - regulatory action) |
| **Impact** | 4 (Critical - fines, lawsuits) |
| **Risk Level** | **16 (Critical)** |
| **Mitigation** | Draft ToS and Privacy Policy with legal counsel (BUS-001). Implement consent tracking on registration. |
| **Owner** | Product Manager / Legal |
| **Status** | 🔴 Active |
| **Trigger** | User data collection without consent |
| **Contingency** | Take down registration until documents are in place |
| **Residual Risk** | Low after legal review and implementation |

---

### R-007: Regressions from Untested Code

| Field | Value |
|-------|-------|
| **Description** | Only 3 test files exist with minimal coverage. No integration tests, no E2E tests. Changes cannot be validated. |
| **Likelihood** | 5 (Almost Certain - no safety net) |
| **Impact** | 4 (Critical - production incidents) |
| **Risk Level** | **20 (Critical)** |
| **Mitigation** | Implement comprehensive test suite (TEST-001) across all sprints. Target ≥80% coverage. Add CI gates. |
| **Owner** | QA Director |
| **Status** | 🔴 Active |
| **Trigger** | Any code change deployed without tests |
| **Contingency** | Manual regression testing before each release |
| **Residual Risk** | Medium - 80% coverage still leaves gaps |

---

### R-008: Inability to Debug Production Issues

| Field | Value |
|-------|-------|
| **Description** | No structured logging, no request IDs, no APM, no monitoring. Production issues cannot be diagnosed. |
| **Likelihood** | 5 (Almost Certain - issues will occur) |
| **Impact** | 4 (Critical - extended downtime) |
| **Risk Level** | **20 (Critical)** |
| **Mitigation** | Implement structured logging (OBS-001) in Sprint 1. Set up monitoring (INF-002) in Sprint 1. Add APM (OBS-004) in Sprint 3. |
| **Owner** | Staff Engineer / DevOps Lead |
| **Status** | 🔴 Active |
| **Trigger** | Production incident without observability |
| **Contingency** | SSH into instances for log inspection |
| **Residual Risk** | Low after observability stack is operational |

---

### R-009: Credit/Billing Race Condition

| Field | Value |
|-------|-------|
| **Description** | Credit refund logic has race conditions. Users can exploit to get free builds. Financial loss. |
| **Likelihood** | 3 (Possible - race condition exists) |
| **Impact** | 4 (Critical - revenue loss) |
| **Risk Level** | **12 (High)** |
| **Mitigation** | Use MongoDB transactions for credit operations (BUS-007). Implement idempotency keys. Requires replica set (DB-001). |
| **Owner** | Staff Engineer |
| **Status** | 🔴 Active |
| **Trigger** | Concurrent build requests |
| **Contingency** | Manual credit reconciliation |
| **Residual Risk** | Low after transaction implementation |

---

### R-010: Prompt Injection Attack

| Field | Value |
|-------|-------|
| **Description** | Users can inject malicious prompts to manipulate AI behavior, extract system prompts, or generate harmful code. |
| **Likelihood** | 4 (Likely - common attack vector) |
| **Impact** | 4 (Critical - AI misuse, reputational damage) |
| **Risk Level** | **16 (Critical)** |
| **Mitigation** | Implement prompt injection detection (AI-002) in Sprint 1. Add input/output guardrails. Rate limit LLM calls. |
| **Owner** | Staff Engineer / Security Lead |
| **Status** | 🔴 Active |
| **Trigger** | User sends prompt injection attempt |
| **Contingency** | Block user, review all recent builds |
| **Residual Risk** | Medium - detection may have false negatives |

---

### R-011: Secrets Exposure

| Field | Value |
|-------|-------|
| **Description** | All secrets passed via environment variables. Visible in `docker inspect`, CI logs, container images. |
| **Likelihood** | 4 (Likely - multiple exposure vectors) |
| **Impact** | 5 (Catastrophic - all credentials compromised) |
| **Risk Level** | **20 (Critical)** |
| **Mitigation** | Implement secrets management (INF-003) in Sprint 1. Use AWS Secrets Manager or Vault. Rotate secrets on schedule. |
| **Owner** | DevOps Lead |
| **Status** | 🔴 Active |
| **Trigger** | Container image pushed with embedded secrets |
| **Contingency** | Rotate all secrets immediately |
| **Residual Risk** | Low after vault integration |

---

### R-012: WebSocket Connection Hijacking

| Field | Value |
|-------|-------|
| **Description** | WebSocket token passed in query string. Exposed in server logs, proxy logs, browser history. |
| **Likelihood** | 3 (Possible - requires access to logs) |
| **Impact** | 4 (Critical - session hijacking) |
| **Risk Level** | **12 (High)** |
| **Mitigation** | Implement token-in-first-message authentication (SEC-003) in Sprint 0. Use short-lived WS tokens. Enforce WSS. |
| **Owner** | Security Lead |
| **Status** | 🔴 Active |
| **Trigger** | Production deployment without WS auth fix |
| **Contingency** | Force re-authentication for all WS connections |
| **Residual Risk** | Low after fix |

---

### R-013: Database Migration Failures

| Field | Value |
|-------|-------|
| **Description** | No versioned migration system. Schema changes via application code. Rollback impossible. |
| **Likelihood** | 3 (Possible - schema changes are frequent) |
| **Impact** | 3 (Major - data inconsistency, downtime) |
| **Risk Level** | **9 (Medium)** |
| **Mitigation** | Implement migration system (DB-002) in Sprint 0. Test rollback procedure. Automate migrations in CI/CD. |
| **Owner** | Staff Engineer |
| **Status** | 🟡 Mitigated |
| **Trigger** | Schema change deployment |
| **Contingency** | Manual schema fix, restore from backup |
| **Residual Risk** | Low after migration system is operational |

---

### R-014: LLM API Outage

| Field | Value |
|-------|-------|
| **Description** | Single dependency on Anthropic API. If Anthropic is down, all builds fail. |
| **Likelihood** | 3 (Possible - API outages happen) |
| **Impact** | 3 (Major - service unavailable) |
| **Risk Level** | **9 (Medium)** |
| **Mitigation** | Implement fallback chain (AI-004) in Sprint 2. Add OpenAI as fallback. Implement graceful degradation. |
| **Owner** | Staff Engineer |
| **Status** | 🟡 Mitigated |
| **Trigger** | Anthropic API returns 5xx or timeout |
| **Contingency** | Fallback to OpenAI, notify users of degraded mode |
| **Residual Risk** | Low after fallback chain implementation |

---

### R-015: Performance Degradation Under Load

| Field | Value |
|-------|-------|
| **Description** | No pagination, no caching, no load testing. System may collapse under production traffic. |
| **Likelihood** | 4 (Likely - millions of users expected) |
| **Impact** | 3 (Major - slow responses, timeouts) |
| **Risk Level** | **12 (High)** |
| **Mitigation** | Add pagination (BE-003), caching (BE-007), load testing (TEST-002). Implement HPA (DEVOPS-003). |
| **Owner** | Staff Engineer / DevOps Lead |
| **Status** | 🟡 Mitigated |
| **Trigger** | Traffic spike during launch |
| **Contingency** | Scale up manually, rate limit aggressively |
| **Residual Risk** | Medium - actual traffic patterns unknown |

---

### R-016: GDPR Non-Compliance

| Field | Value |
|-------|-------|
| **Description** | GDPR delete doesn't cascade to all collections. No data retention policy. No consent tracking. |
| **Likelihood** | 4 (Likely - regulatory scrutiny) |
| **Impact** | 4 (Critical - fines up to 4% of revenue) |
| **Risk Level** | **16 (Critical)** |
| **Mitigation** | Implement cascade deletion (DB-004), data retention (DB-003), consent tracking (BUS-001). |
| **Owner** | Staff Engineer / Product Manager |
| **Status** | 🔴 Active |
| **Trigger** | User data deletion request |
| **Contingency** | Manual data cleanup, legal counsel engagement |
| **Residual Risk** | Low after full implementation |

---

### R-017: CI Pipeline Allows Broken Code

| Field | Value |
|-------|-------|
| **Description** | Frontend build has `continue-on-error: true`. Broken code can be merged to main. |
| **Likelihood** | 4 (Likely - developers will push broken code) |
| **Impact** | 2 (Minor - staging catches it) |
| **Risk Level** | **8 (Medium)** |
| **Mitigation** | Remove `continue-on-error` (DEVOPS-001). Fix TypeScript errors first. Add linting. |
| **Owner** | DevOps Lead |
| **Status** | 🟡 Mitigated |
| **Trigger** | PR with broken frontend |
| **Contingency** | Revert merge, fix in hotfix branch |
| **Residual Risk** | Low after CI fix |

---

### R-018: Insufficient Test Coverage for Launch

| Field | Value |
|-------|-------|
| **Description** | 200 hours of testing needed. May not reach 80% coverage by launch. |
| **Likelihood** | 3 (Possible - testing is time-consuming) |
| **Impact** | 3 (Major - undetected regressions) |
| **Risk Level** | **9 (Medium)** |
| **Mitigation** | Start testing in Sprint 0. Prioritize critical paths. Use AI-assisted test generation. |
| **Owner** | QA Director |
| **Status** | 🟡 Mitigated |
| **Trigger** | Launch with <80% coverage |
| **Contingency** | Accept lower coverage for non-critical paths, increase manual testing |
| **Residual Risk** | Medium - coverage may be lower than target |

---

### R-019: Security Audit Reveals Critical Issues

| Field | Value |
|-------|-------|
| **Description** | Third-party security audit may find new critical vulnerabilities requiring urgent remediation. |
| **Likelihood** | 3 (Possible - complex codebase) |
| **Impact** | 4 (Critical - launch delay) |
| **Risk Level** | **12 (High)** |
| **Mitigation** | Fix all known P0/P1 issues before audit. Allocate buffer time in Sprint 5 for remediation. |
| **Owner** | Security Lead |
| **Status** | 🟡 Mitigated |
| **Trigger** | Security audit findings |
| **Contingency** | Extend Sprint 5, delay launch by 1-2 weeks |
| **Residual Risk** | Medium - unknown findings |

---

### R-020: Team Capacity Overcommitment

| Field | Value |
|-------|-------|
| **Description** | Sprint plans show 107-177% capacity utilization. Team may not complete all planned work. |
| **Likelihood** | 5 (Almost Certain - overcommitted) |
| **Impact** | 3 (Major - timeline slip) |
| **Risk Level** | **15 (Critical)** |
| **Mitigation** | Prioritize within sprints. Defer P2 items. Use AI coding agents for test generation and simple fixes. |
| **Owner** | CTO / Program Manager |
| **Status** | 🟡 Mitigated |
| **Trigger** | Sprint velocity below plan |
| **Contingency** | Reduce scope, extend timeline, add contractors |
| **Residual Risk** | Medium - depends on team productivity |

---

### R-021: Third-Party Service Dependency Failures

| Field | Value |
|-------|-------|
| **Description** | Reliance on Stripe, Anthropic, OpenAI, GitHub, Redis, MongoDB. Any could fail or change terms. |
| **Likelihood** | 2 (Unlikely - but possible) |
| **Impact** | 3 (Major - service disruption) |
| **Risk Level** | **6 (Medium)** |
| **Mitigation** | Implement circuit breakers, fallback chains, graceful degradation. Monitor all dependencies. |
| **Owner** | Staff Engineer |
| **Status** | 🟡 Mitigated |
| **Trigger** | Third-party API change or outage |
| **Contingency** | Fallback to alternative provider |
| **Residual Risk** | Low after fallback implementation |

---

### R-022: Browser Compatibility Issues

| Field | Value |
|-------|-------|
| **Description** | Frontend only tested in modern Chrome. May have issues in Firefox, Safari, Edge. |
| **Likelihood** | 3 (Possible - Safari especially) |
| **Impact** | 2 (Minor - some users affected) |
| **Risk Level** | **6 (Medium)** |
| **Mitigation** | Test in Chrome, Firefox, Safari, Edge during Sprint 4. Use cross-browser testing tools. |
| **Owner** | Frontend Lead |
| **Status** | 🟡 Mitigated |
| **Trigger** | User reports from non-Chrome browsers |
| **Contingency** | Fix per-browser issues as reported |
| **Residual Risk** | Low after cross-browser testing |

---

### R-023: Mobile User Experience Issues

| Field | Value |
|-------|-------|
| **Description** | No responsive design testing. Mobile experience may be broken. |
| **Likelihood** | 4 (Likely - no mobile testing done) |
| **Impact** | 2 (Minor - desktop users unaffected) |
| **Risk Level** | **8 (Medium)** |
| **Mitigation** | Implement responsive design (FE-002) in Sprint 2. Test at 375px, 768px, 1440px. |
| **Owner** | Frontend Lead |
| **Status** | 🟡 Mitigated |
| **Trigger** | Mobile user complaints |
| **Contingency** | Prioritize mobile fixes post-launch |
| **Residual Risk** | Low after responsive implementation |

---

### R-024: Accessibility Legal Action

| Field | Value |
|-------|-------|
| **Description** | No WCAG compliance. Legal liability under ADA and similar laws. |
| **Likelihood** | 2 (Unlikely - but growing regulatory focus) |
| **Impact** | 4 (Critical - lawsuits, fines) |
| **Risk Level** | **8 (Medium)** |
| **Mitigation** | Implement WCAG 2.1 AA compliance (FE-001) in Sprint 1-2. Test with axe DevTools and screen readers. |
| **Owner** | Frontend Lead |
| **Status** | 🟡 Mitigated |
| **Trigger** | Accessibility complaint or lawsuit |
| **Contingency** | Remediation plan, legal defense |
| **Residual Risk** | Low after WCAG AA compliance |

---

### R-025: Disaster Recovery Failure

| Field | Value |
|-------|-------|
| **Description** | No DR plan tested. Backup restore may fail when needed. |
| **Likelihood** | 2 (Unlikely - but catastrophic if it happens) |
| **Impact** | 5 (Catastrophic - extended outage, data loss) |
| **Risk Level** | **10 (High)** |
| **Mitigation** | Implement backup strategy (INF-005) in Sprint 1. Test restore monthly. Conduct DR drill in Sprint 5. |
| **Owner** | DevOps Lead |
| **Status** | 🟡 Mitigated |
| **Trigger** | Major infrastructure failure |
| **Contingency** | Manual recovery from backups |
| **Residual Risk** | Medium - depends on backup integrity |

---

## Risk Summary

| Risk Level | Count | Action Required |
|------------|-------|-----------------|
| Critical (15-25) | 9 | Immediate mitigation required |
| High (10-14) | 5 | Active management required |
| Medium (5-9) | 8 | Monitor and plan mitigation |
| Low (1-4) | 0 | Accept or monitor |
| **Total** | **22** | |

## Top 5 Critical Risks

| Rank | ID | Risk | Score | Mitigation Sprint |
|------|----|------|-------|-------------------|
| 1 | R-002 | Security breach via CSRF/encryption flaws | 25 | Sprint 0 |
| 2 | R-005 | No production infrastructure | 25 | Sprint 0-1 |
| 3 | R-001 | Data loss from single MongoDB | 20 | Sprint 1 |
| 4 | R-004 | Uncontrolled AI costs | 20 | Sprint 2 |
| 5 | R-007 | Regressions from untested code | 20 | Sprint 0-4 |

## Risk Burndown

| Sprint | Critical | High | Medium | Low |
|--------|----------|------|--------|-----|
| Start (Sprint 0) | 9 | 5 | 8 | 0 |
| After Sprint 0 | 6 | 5 | 8 | 0 |
| After Sprint 1 | 3 | 4 | 8 | 0 |
| After Sprint 2 | 2 | 3 | 7 | 0 |
| After Sprint 3 | 1 | 2 | 6 | 0 |
| After Sprint 4 | 1 | 1 | 4 | 0 |
| After Sprint 5 (Launch) | 0 | 0 | 2 | 0 |