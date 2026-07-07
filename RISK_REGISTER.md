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
| **Description** | Was a single MongoDB instance with no replication/failover. **RESOLVED:** `k8s/mongodb.yaml` deploys a 3-node `rs0` StatefulSet (replica set) with a keyfile-authenticated init Job and a `PodDisruptionBudget` (minAvailable: 2). `k8s/mongodb-backup-cronjob.yaml` runs daily `mongodump` to a PVC and (optionally) S3. **Gap closed this session:** the app/backup connection-string contract did not require `replicaSet=rs0`, so a bare URL would silently disable driver failover; `core/config.py` now enforces it in production. A restore Job (`k8s/mongodb-restore-job.yaml`) now exists so DR is testable. |
| **Likelihood** | 2 (Unlikely - replication + daily backups in place) |
| **Impact** | 5 (Catastrophic - complete data loss, if both AZ and backup fail) |
| **Risk Level** | **20 (Critical) → 8 (Medium, mitigated)** |
| **Mitigation** | 3-node replica set (done), daily backups to PVC/S3 (done), restore Job + documented DR drill (done this session). Monthly restore drill still recommended as an operational habit. |
| **Owner** | DevOps Lead |
| **Status** | 🟢 Closed (mitigated) |
| **Trigger** | Simultaneous loss of quorum + all backups (residual) |
| **Contingency** | Restore from latest backup via `k8s/mongodb-restore-job.yaml` (RPO: 24h, RTO: ~1h) |
| **Residual Risk** | Low - backups may be up to 24h stale; no TLS on mongo traffic yet (audit P1-MED-001, out of scope this session) |

---

### R-002: Security Breach via CSRF/Encryption Flaws

| Field | Value |
|-------|-------|
| **Description** | Multiple P0 security vulnerabilities (CSRF bypass, encryption key derived from JWT secret, rate limiting bypass, token blacklist using raw token). Any of these could lead to account takeover or data breach. **Update 2026-07-03:** the CSRF component is resolved — the backend's `validate_csrf_token()` was already correctly wired (this risk's original premise of a validation gap was inaccurate); the actual bug was the frontend never sending the header at all, which was as much an availability bug (100% of mutating requests silently 403ing for real users) as a security one. Fixed with a frontend interceptor. Encryption-key-derivation, rate-limiting-bypass, and raw-token-blacklist components of this risk are unchanged/still open. Two unrelated new findings surfaced during the same session and are also resolved: auth endpoints leaking password hashes + raw GitHub tokens in responses (see SEC-015), and a marketplace-creation crash (see BE-013). One new, more severe risk was found — see R-026 below — and has also since been resolved. |
| **Likelihood** | 5 (Almost Certain - vulnerabilities are exploitable) |
| **Impact** | 5 (Catastrophic - user data compromise, legal liability) |
| **Risk Level** | **25 (Critical) → 18 (High)** after the CSRF-frontend and credential-leak fixes; still Critical overall due to the unresolved encryption-key and rate-limiting components |
| **Mitigation** | Fix all P0 security issues in Sprint 0. Implement automated security tests. Conduct third-party security audit in Sprint 5. |
| **Owner** | Security Lead |
| **Status** | 🟡 Partially Mitigated (was 🔴 Active) |
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
| **Risk Level** | **16 (Critical)** → **Resolved 2026-07-03** |
| **Mitigation** | Migrate to Celery with Redis broker in Sprint 0. Implement task persistence, retries, and dead-letter queues. |
| **Owner** | Staff Engineer |
| **Status** | ✅ Resolved 2026-07-03 (was 🔴 Active) |
| **Trigger** | Server restart during build processing |
| **Contingency** | Manual rebuild request to users |
| **Residual Risk** | Low — Celery migration existed in code but was verified 2026-07-03 to be completely non-functional (three independent wiring bugs meant every build 500'd, and no worker configuration could even start); all three found and fixed same day, verified with a real worker processing two sequential builds end-to-end. See `ENGINEERING_BACKLOG.md` BE-015. Dead-letter queue for exhausted retries still not implemented. |

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
| **Risk Level** | **16 (Critical) → 10 (High), partially mitigated** |
| **Mitigation** | Implement prompt injection detection (AI-002) in Sprint 1. Add input/output guardrails. Rate limit LLM calls. **Update 2026-07-03:** spot-verified the existing keyword-blocklist mitigation by actually attempting bypasses, not just reading the pattern list. Found and fixed two concrete gaps (AI-008): trivial whitespace/hyphen reformatting defeated the exact-substring match, and only the last message of a conversation was ever checked (an injection planted in an earlier turn of an iterative build went undetected). Both closed. **Still not done:** the fuller originally-scoped mitigation here — secondary-LLM-call detection, output validation, logging/alerting, rate limiting specifically tied to injection attempts — was never built; a keyword blocklist alone cannot fully close this risk against arbitrary paraphrasing. |
| **Owner** | Staff Engineer / Security Lead |
| **Status** | 🟡 Partially Mitigated (was 🔴 Active) |
| **Trigger** | User sends prompt injection attempt |
| **Contingency** | Block user, review all recent builds |
| **Residual Risk** | Medium-High — pattern-based detection is inherently incomplete against paraphrasing/novel phrasing not in the blocklist; the two demonstrated bypass classes are closed, but this is not equivalent to the originally-scoped defense-in-depth (secondary LLM check, output validation, logging/alerting) |

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
| **Description** | Was: no tested DR plan; restore could fail when needed. **RESOLVED this session:** `k8s/mongodb-restore-job.yaml` provides a parameterized `mongorestore --drop --gzip` Job against the same `mongodb-url` secret, with documented S3-pull + runbook steps, so a restore is executable and testable rather than ad-hoc. |
| **Likelihood** | 2 (Unlikely - but catastrophic if it happens) |
| **Impact** | 5 (Catastrophic - extended outage, data loss) |
| **Risk Level** | **10 (High) → 5 (Medium, mitigated)** |
| **Mitigation** | Daily `mongodump` (done), restore Job + runbook (done this session). Monthly restore drill recommended as an operational habit. |
| **Owner** | DevOps Lead |
| **Status** | 🟢 Closed (mitigated) |
| **Trigger** | Major infrastructure failure |
| **Contingency** | Run `k8s/mongodb-restore-job.yaml` with the target backup timestamp |
| **Residual Risk** | Low - restore still unverified against a live cluster in this environment; should be drilled in staging |

---

### R-026: Total Registration/Login Outage from bcrypt/passlib Incompatibility — RESOLVED 2026-07-03

| Field | Value |
|-------|-------|
| **Description** | `backend/requirements.txt`'s `passlib[bcrypt]==1.7.4` was incompatible with the resolved `bcrypt` package version (5.0.0) — every password hash/verify call crashed on passlib's own internal self-test before touching a real password. Root cause pinned precisely: `bcrypt>=4.1` removed the `_bcrypt.__about__` module passlib reads for version detection. **Fixed by pinning `bcrypt==4.0.1`** (confirmed via isolated test that 5.0.0 fails and 4.0.1 doesn't, before changing the pin). Fixing this uncovered a second, previously-unreachable bug — an `_id`/ObjectId serialization crash on registration (registration always died at the hashing step before, so this code path had never actually run) — also fixed the same session. See `ENGINEERING_BACKLOG.md` SEC-014/SEC-016. |
| **Likelihood** | 5 (Almost Certain — this wasn't a potential exploit, it was already happening on every attempt) |
| **Impact** | 5 (Catastrophic — total product outage for the core auth flow; nothing else in the product is reachable without it) |
| **Risk Level** | **25 (Critical) → 0 (Resolved)** |
| **Mitigation** | Pinned `bcrypt==4.0.1` in `requirements.txt`; verified with a real registration + login round-trip (not just successful `pip install`) plus the full backend test suite (66/66 passing). |
| **Owner** | Backend Lead |
| **Status** | ✅ Resolved — verified end-to-end 2026-07-03. |
| **Trigger** | N/A — resolved |
| **Contingency** | N/A — resolved |
| **Residual Risk** | Low — the fix is a version pin with a comment explaining why it must not be casually bumped; a future dependency-update pass reintroducing `bcrypt>=4.1` without checking this comment is the main residual concern. |

---

### R-027: Live Build Progress Silently Never Delivered to Any Client — RESOLVED 2026-07-03

| Field | Value |
|-------|-------|
| **Description** | `ConnectionManager.emit()`/`broadcast()` in `backend/services/ws_manager.py` published build-progress events to a Redis channel (`build:{build_id}`), but nothing anywhere in the codebase ever subscribed to it. Build processing (all of it, since the BE-015 Celery fix) runs in the Celery **worker** process, which never holds any real WebSocket connections — only the FastAPI web process does. Every event a worker emitted was published into the void and simultaneously fell through the "local delivery" fallback (always empty in the worker process), so it was **never delivered to any connected client, for any build, regardless of instance count** — not just a multi-instance edge case. The frontend (`useBuildSocket.ts`) has zero REST polling fallback, so this wasn't a degraded experience — the live build view showed nothing at all until the user manually refreshed. Verified live: connected a real WebSocket client to a real build, confirmed via server-side logging that the worker called `emit()` multiple times as the build progressed to a terminal state, and the client received **zero** of them. |
| **Likelihood** | 5 (Certain — reproduced on every single build, not an edge case) |
| **Impact** | 4 (Critical — the core "watch AI build your app live" UX is the product's headline feature; silently broken, not degraded) |
| **Risk Level** | **20 (Critical) → 0 (Resolved)** |
| **Mitigation** | Added a Redis pub/sub subscriber (`ConnectionManager.start_pubsub_listener()`) that runs as a background task for the lifetime of each FastAPI process (started/stopped via `main.py`'s lifespan), subscribing to `build:*` and forwarding matching messages to that process's local WebSocket connections. Published messages are tagged with a per-process instance id so a process never double-delivers its own already-locally-delivered events back to itself. |
| **Owner** | Backend Lead |
| **Status** | ✅ Resolved — verified end-to-end 2026-07-03 with a real Celery worker and a real connected WebSocket client (0 of several events delivered before the fix; all delivered after, across multiple runs). 3 regression tests added in `backend/tests/test_ws_pubsub_bridge.py` using an in-memory fake Redis so the bridge logic is covered in CI without a live Redis dependency. |
| **Trigger** | N/A — resolved |
| **Contingency** | N/A — resolved |
| **Residual Risk** | Low. Same-process delivery still has a direct fallback (doesn't depend on the pub/sub round trip), so a brief Redis outage degrades to same-process-only delivery rather than losing everything. Cross-process delivery is still fully dependent on Redis, which is already a hard dependency for Celery and rate limiting elsewhere in this app. |

---

### R-028: Credit Refund Fired Once Per Retry, Not Once Per Build — RESOLVED 2026-07-03

| Field | Value |
|-------|-------|
| **Description** | `backend/tasks/build_tasks.py`'s `run_build` task refunded unused reserved credits inside its `except Exception` handler on *every* Celery retry attempt, not once per build — because `BuildTask.autoretry_for=(Exception,)` re-invokes the entire task function body (including that except block) on each of its configured 3 retries. Verified live: a build reserved 17 credits, failed and retried 4 times (1 original + 3 retries) due to an invalid `ANTHROPIC_API_KEY` in this dev environment, and the user's final balance was **38 — higher than the starting 17** — instead of the mathematically correct 5. This is a real, repeatable free-credits exploit: any build that reliably raises a retryable exception (not necessarily malicious — a transient LLM rate limit or network blip would do it) earns the user free credits on every retry. Discovered while spot-verifying PROD-006's "credit race condition" claim — the *reservation* half of that claim (atomic `find_one_and_update` with a `$gte` guard) was independently verified to be genuinely race-free via 8 real concurrent build requests (exactly 1 succeeded, 7 correctly got 402, no double-spend); only the refund half had this separate bug. |
| **Likelihood** | 4 (Likely — happens on any build that fails and retries, not a rare edge case; currently happening on every build in this dev environment due to an unrelated invalid API key) |
| **Impact** | 4 (Critical — direct, repeatable revenue leakage; a user could deliberately trigger retryable failures to farm credits) |
| **Risk Level** | **16 (Critical) → 0 (Resolved)** |
| **Mitigation** | `run_build` is now `bind=True` and checks `self.request.retries` against the configured `max_retries` inside the except block — refund and finalize-as-`failed` now only happen on the last attempt Celery will make for a given task. Non-final attempts still raise (so Celery still retries, unchanged resilience behavior) without touching credits or the build's terminal status. |
| **Owner** | Backend Lead |
| **Status** | ✅ Resolved — verified end-to-end 2026-07-03: replayed the identical live scenario (17 credits, 4 attempts, same invalid API key) and the balance ended at exactly 5. 3 regression tests added in `backend/tests/test_credit_refund_retries.py` using Celery's `push_request()`/`pop_request()` test hooks to simulate specific retry counts without needing a real broker. |
| **Trigger** | N/A — resolved |
| **Contingency** | N/A — resolved |
| **Residual Risk** | Low. The fix is scoped to `run_build`'s own retry accounting; if a future task is added with `autoretry_for` and its own refund-on-failure logic, the same class of bug could reappear unless reviewers specifically check for this pattern. |

---

## Risk Summary

| Risk Level | Count | Action Required |
|------------|-------|-----------------|
| Critical (15-25) | 7 (was 9 — R-002 downgraded to 18/High; R-010 downgraded to 10/High 2026-07-03 after partial mitigation (AI-008); R-026, R-027, R-028 each added at Critical then resolved to 0 same day, net -2) | Immediate mitigation required |
| High (10-14) | 7 (+2: R-002 and R-010 moved here from Critical) | Active management required |
| Medium (5-9) | 8 | Monitor and plan mitigation |
| Low (1-4) | 0 | Accept or monitor |
| **Total** | **25** (+3: R-026, R-027, R-028, all added *and resolved* 2026-07-03) | |

## Top 5 Critical Risks

*Updated 2026-07-03: R-026 (bcrypt/passlib outage), R-027 (WebSocket build-progress events never delivered), and R-028 (credit refund duplicated per retry) were all added, then resolved same day — none appear below since none are active risks. R-002 dropped out of the top 5 after its CSRF component resolved.*

| Rank | ID | Risk | Score | Mitigation Sprint |
|------|----|------|-------|-------------------|
| 1 | R-005 | No production infrastructure | 25 | Sprint 0-1 |
| 2 | R-001 | Data loss from single MongoDB | 20 | Sprint 1 |
| 3 | R-004 | Uncontrolled AI costs | 20 | Sprint 2 |
| 4 | R-007 | Regressions from untested code | 20 | Sprint 0-4 |
| — | R-002 | ~~Security breach via CSRF/encryption flaws~~ (CSRF component resolved 2026-07-03; encryption-key component still open) | 18 | Sprint 0 |

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

---

## Appendix A: P0/P1 Security Audit Report (2026-06-30, folded in — P0_P1_SECURITY_AUDIT_REPORT.json removed)

**Methodology:** manual code review, 38 files / 4,850 lines, OWASP Top 10 (2021) classification, CVSS 3.1 scoring. Score before fixes: 15/100; projected score after fixes: 85/100. Total estimated remediation: 138 hours.

> **ID-collision note:** this audit's finding IDs (`P0-CRIT-xxx`, `P0-HIGH-xxx`, `P1-MED-xxx`, `P2-LOW-xxx`, `TASK-xxx`) are from an independent numbering scheme, separate from the R-xxx risk IDs in this register and from the SEC-xxx IDs used in MASTER_EXECUTION_PLAN.md / EXECUTION_TRACKING.md §8. Per MASTER_EXECUTION_PLAN.md's 2026-07-03 refresh, several of the items below are already resolved in the current codebase (e.g., CSRF wiring, encryption-key/JWT-secret separation, JTI-based token blacklisting, WebSocket short-lived token auth, and the credit-refund race condition — see R-028 above for the refund-specific fix, which is a *different* bug in the same area than P0-CRIT-004 below describes). Treat this appendix as the historical audit record, not a live status tracker; confirm current state against MASTER_EXECUTION_PLAN.md §2 before acting on any row.

### Critical (CVSS ≥ 8.0)

| ID | Title | CVSS | OWASP | Hours | Deployment blocker |
|----|-------|------|-------|-------|---------------------|
| P0-CRIT-001 | Docker-in-Docker container escape via mounted Docker socket | 9.9 | A01 Broken Access Control | 24 | Yes |
| P0-CRIT-002 | Plaintext API keys and secrets committed to repository (`.env`, 12 secrets incl. `JWT_SECRET`) | 9.8 | A05 Security Misconfiguration | 4 | Yes |
| P0-CRIT-003 | Sandbox runner arbitrary code execution on host (`py_compile` on untrusted AI output) | 8.8 | A08 Software/Data Integrity | 16 | Yes |
| P0-CRIT-004 | Credit refund race condition — arbitrary credit creation (error path lacked the atomic guard the success path had) | 8.6 | A01 Broken Access Control | 4 | Yes |
| P0-CRIT-005 | Admin privilege escalation via email registration (`admin@forge.ai` string match, no DB-backed role) | 8.2 | A01 Broken Access Control | 6 | Yes |

### High

| ID | Title | CVSS | Hours | Deployment blocker |
|----|-------|------|-------|---------------------|
| P0-HIGH-001 | Unbounded MongoDB `to_list(None)` — DoS via OOM (auth.py, marketplace.py, billing.py) | 7.5 | 4 | Yes |
| P0-HIGH-002 | No trial enforcement — `trial_ends_at` field never checked, free builds indefinitely | 7.5 | 6 | Yes |
| P0-HIGH-003 | Password reset flow non-functional — token generated but email never sent, no frontend route | 7.5 | 8 | Yes |
| P0-HIGH-004 | Container kill via deployment ID — no ownership check before Docker `kill()`/`remove()` | 7.5 | 4 | Yes |
| P0-HIGH-005 | File path traversal via build output files in deployment (`os.path.join` unsanitized) | 7.5 | 4 | Yes |
| P0-HIGH-006 | Marketplace has no content moderation — spam/malware distribution vector | 7.5 | 8 | Yes |
| P0-HIGH-007 | Auth responses return raw MongoDB documents (login/register) | 7.4 | 3 | Yes |
| P0-HIGH-008 | GitHub token exposed in request body and passed to subprocess via env var | 7.4 | 4 | Yes |
| P0-HIGH-009 | Rate limiter IP spoofing via `X-Forwarded-For` (trusted-proxies misconfiguration) | 7.5 | 3 | Yes |
| P0-HIGH-010 | CSRF protection stored in-memory only, never wired to any endpoint | 7.5 | 4 | No |

### Medium

| ID | Title | CVSS | Hours | Deployment blocker |
|----|-------|------|-------|---------------------|
| P1-MED-001 | No MongoDB TLS/SSL enforcement in production | 6.5 | 2 | Yes |
| P1-MED-002 | Stripe webhook signature verification loophole (bare `except Exception`) | 6.5 | 3 | No |
| P1-MED-003 | Volume mount of backend code in production `docker-compose.yml` | 6.5 | 2 | Yes |
| P1-MED-004 | CORS origins hardcoded, not configurable for production | 6.1 | 1 | No |
| P1-MED-005 | Host header injection via `TrustedHostMiddleware` wildcards (`*.forge.ai`, `*.local`) | 6.1 | 1 | No |
| P1-MED-006 | Prompt injection risk — no sanitization before AI agent processing | 6.5 | 8 | No |
| P1-MED-007 | Weak JWT algorithm — HS256, no key rotation, 7-day expiry, no revocation list | 6.0 | 8 | No |

### Low

| ID | Title | CVSS | Hours |
|----|-------|------|-------|
| P2-LOW-001 | No rate limiting on WebSocket connections | 4.3 | 3 |
| P2-LOW-002 | Audit logs do not capture IP address or user agent | 4.8 | 4 |
| P2-LOW-003 | Decryption failure returns raw ciphertext instead of a sanitized error | 4.6 | 1 |
| P2-LOW-004 | Encryption key derived from JWT secret (coupled security domains) | 4.0 | 4 |

**Deployment blockers called out separately in the source report:** Docker-in-Docker escape, API keys in version control, sandbox arbitrary code execution, credit race condition, admin email-based escalation (all Critical); unbounded MongoDB queries (High); no MongoDB TLS, production volume mount (Medium).

---

## Appendix B: SEC-002 — Plaintext Secrets in Version Control (work package + validation, folded in — SEC-002-work-package.json and SEC-002-validation-result.json removed)

**Work package summary:** Critical severity, 4 estimated hours. Scope: remove `.env` from git tracking and `.gitignore` it, create `.env.example` with placeholders only, rotate all existing secrets, wire CI/CD to inject real secrets via environment variables, install a functional pre-commit secret-detection hook, and configure `git-secrets` (or equivalent) scanning in CI/CD. No dependencies on other tasks.

**Validation result: PASS.** All 6 acceptance criteria verified:
- `.env` removed from git tracking and `.gitignore`d (commit `1372ec3c`)
- `.env.example` created with placeholder values only
- Secrets rotated — `JWT_SECRET` changed from `change_this_in_production` to a generated 64-char hex value; `core/config.py` default updated to a 64-char fallback satisfying the ≥32-char validator
- `.github/workflows/ci.yml` injects all secrets via `${{ secrets.* }}`
- Pre-commit hook installed and proven functional (blocked an attempted commit of a staged `.env`)
- `.github/workflows/secret-scanning.yml` configured (git-secrets, AWS patterns, custom API-key patterns, staged/history scanning, `.env`-in-PR detection, grep fallback)

**Remaining risks noted at validation time (all explicitly out of SEC-002's scope, not blocking its PASS):**
- `.env` still present in git history (commit `28f4a676`) with placeholder-only values; full history scrub via `git-filter-repo` was not performed — low risk since no real secrets were ever committed
- Frontend TypeScript build has pre-existing failures (duplicate identifiers, missing module declarations, implicit `any`, undefined `Send`) unrelated to SEC-002
- Backend unit tests failed to collect at the time due to a pre-existing pymongo/motor compatibility issue (`ImportError: cannot import name '_QUERY_OPTIONS'`) — unrelated to SEC-002 (see the CI-fix commit history for later resolution)
- Backend had 41 pre-existing ruff lint errors (38 auto-fixable), unrelated to SEC-002