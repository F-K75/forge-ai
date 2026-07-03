# Forge AI — Test Plan

**Version:** 1.0  
**Date:** 2026-01-07  
**Author:** QA Director  
**Target:** Production Release (millions of users)

---

## Testing Strategy Overview

### Test Pyramid

```
         ╱╲
        ╱  ╲
       ╱ E2E╲  ← 5% (Playwright)
      ╱──────╲
     ╱Integra-╲ ← 15% (pytest + testcontainers)
    ╱  tion    ╲
   ╱────────────╲
  ╱   Unit Tests  ╲ ← 80% (pytest, Jest)
 ╱────────────────╲
```

### Test Environments

| Environment | Purpose | Configuration | Access |
|-------------|---------|---------------|--------|
| Local | Developer testing | Docker Compose | Developer machine |
| CI | PR validation | GitHub Actions | Automated |
| Staging | Pre-release validation | K8s (staging namespace) | Internal team |
| Beta | Limited user testing | K8s (beta namespace) | Beta users |
| Production | Live traffic | K8s (prod namespace) | All users |

### Test Data Strategy

- **Unit tests:** Use mocks/stubs for external dependencies
- **Integration tests:** Testcontainers for MongoDB and Redis
- **E2E tests:** Dedicated test database with seed data
- **Load tests:** Synthetic data generation (10K+ users, 100K+ builds)
- **Security tests:** Known attack patterns and payloads

---

## 1. Unit Tests

### Backend Unit Tests (pytest)

| Module | Test File | Coverage Target | Tests | Priority |
|--------|-----------|-----------------|-------|----------|
| Auth API | `tests/test_auth.py` | 90%+ | 60+ | P0 |
| Projects API | `tests/test_projects.py` | 85%+ | 30+ | P0 |
| Builds API | `tests/test_builds.py` | 85%+ | 40+ | P0 |
| Webhooks API | `tests/test_webhooks.py` | 85%+ | 25+ | P1 |
| Billing API | `tests/test_billing.py` | 85%+ | 30+ | P0 |
| Admin API | `tests/test_admin.py` | 85%+ | 20+ | P1 |
| Analytics API | `tests/test_analytics.py` | 80%+ | 15+ | P2 |
| GDPR API | `tests/test_gdpr.py` | 90%+ | 15+ | P0 |
| Security module | `tests/test_security.py` | 95%+ | 40+ | P0 |
| Encryption module | `tests/test_encryption.py` | 95%+ | 15+ | P0 |
| Config module | `tests/test_config.py` | 90%+ | 10+ | P1 |
| Models | `tests/test_models.py` | 90%+ | 20+ | P1 |
| Rate limiting | `tests/test_rate_limit.py` | 95%+ | 20+ | P0 |
| Celery tasks | `tests/test_celery.py` | 85%+ | 15+ | P0 |
| WebSocket manager | `tests/test_ws_manager.py` | 85%+ | 10+ | P1 |
| Audit logging | `tests/test_audit.py` | 90%+ | 15+ | P1 |
| Health checks | `tests/test_health.py` | 90%+ | 10+ | P1 |

### Frontend Unit Tests (Vitest/Jest)

| Component | Test File | Coverage Target | Tests | Priority |
|-----------|-----------|-----------------|-------|----------|
| AuthPage | `AuthPage.test.tsx` | 80%+ | 10+ | P1 |
| Admin | `Admin.test.tsx` | 75%+ | 8+ | P2 |
| BillingPage | `BillingPage.test.tsx` | 80%+ | 8+ | P2 |
| LandingPage | `LandingPage.test.tsx` | 80%+ | 6+ | P2 |
| AgentPipeline | `AgentPipeline.test.tsx` | 80%+ | 10+ | P1 |
| ErrorBoundary | `ErrorBoundary.test.tsx` | 90%+ | 6+ | P1 |
| StatusPill | `StatusPill.test.tsx` | 90%+ | 4+ | P2 |
| Toggle | `Toggle.test.tsx` | 90%+ | 4+ | P2 |
| AppShell | `AppShell.test.tsx` | 80%+ | 6+ | P1 |
| Hooks | `hooks.test.ts` | 85%+ | 8+ | P1 |
| API client | `api.test.ts` | 85%+ | 10+ | P1 |
| WebSocket client | `useBuildSocket.test.ts` | 85%+ | 8+ | P1 |

### Orchestration Unit Tests

| Module | Test File | Coverage Target | Tests | Priority |
|--------|-----------|-----------------|-------|----------|
| Agent runtime | `test_agent_runtime.py` | 80%+ | 10+ | P1 |
| Dependency resolver | `test_dependency_resolver.py` | 85%+ | 8+ | P2 |
| State machine | `test_state_machine.py` | 85%+ | 12+ | P1 |
| Workflow engine | `test_workflow_engine.py` | 80%+ | 10+ | P1 |
| Storage | `test_storage.py` | 85%+ | 8+ | P2 |

---

## 2. Integration Tests

### Database Integration

| Test | Description | Tool | Priority |
|------|-------------|------|----------|
| MongoDB CRUD operations | Test all DB operations with test container | pytest + testcontainers | P0 |
| Index creation and query performance | Verify indexes work correctly | pytest | P1 |
| Transaction support (replica set) | Test MongoDB transactions | pytest + replica set | P0 |
| Connection pool behavior | Test pool exhaustion and recovery | pytest | P1 |
| Migration apply and rollback | Test migration system | pytest + Alembic | P1 |

### Redis Integration

| Test | Description | Tool | Priority |
|------|-------------|------|----------|
| Rate limiting with Redis | Test rate limit middleware | pytest + testcontainers | P0 |
| Cache hit/miss behavior | Test caching decorator | pytest | P2 |
| Pub/Sub for WebSocket | Test Redis Pub/Sub | pytest | P1 |
| Session storage | Test session management with Redis | pytest | P2 |

### Celery Integration

| Test | Description | Tool | Priority |
|------|-------------|------|----------|
| Task creation and execution | Test Celery task flow | pytest + Celery worker | P0 |
| Task persistence after restart | Test task survives broker restart | pytest | P0 |
| Task retry mechanism | Test retry on failure | pytest | P0 |
| Dead-letter queue | Test DLQ behavior | pytest | P0 |
| Result backend | Test task result storage | pytest | P1 |

### External Service Integration

| Test | Description | Tool | Priority |
|------|-------------|------|----------|
| Stripe webhook handling | Test Stripe event processing | pytest + wiremock | P0 |
| Anthropic API (mocked) | Test LLM call wrapper | pytest + mock | P0 |
| OpenAI API (mocked) | Test fallback chain | pytest + mock | P1 |
| Email sending (SMTP mock) | Test email verification flow | pytest + smtpd | P1 |

---

## 3. API Tests

### Contract Tests

| Endpoint Group | Tests | Tool | Priority |
|----------------|-------|------|----------|
| Auth (`/v1/auth/*`) | 25+ | pytest + httpx | P0 |
| Projects (`/v1/projects/*`) | 15+ | pytest + httpx | P0 |
| Builds (`/v1/builds/*`) | 20+ | pytest + httpx | P0 |
| Webhooks (`/v1/webhooks/*`) | 15+ | pytest + httpx | P1 |
| Billing (`/v1/billing/*`) | 15+ | pytest + httpx | P0 |
| Admin (`/v1/admin/*`) | 12+ | pytest + httpx | P1 |
| GDPR (`/v1/gdpr/*`) | 10+ | pytest + httpx | P0 |
| API Keys (`/v1/api-keys/*`) | 10+ | pytest + httpx | P1 |
| Analytics (`/v1/analytics/*`) | 8+ | pytest + httpx | P2 |
| Health (`/health`, `/v1/health`) | 6+ | pytest + httpx | P1 |

### Schema Validation

| Test | Description | Tool | Priority |
|------|-------------|------|----------|
| Request body validation | All endpoints validate request bodies | Pydantic + pytest | P0 |
| Response schema compliance | All responses match OpenAPI spec | openapi-core + pytest | P1 |
| Error response format | Consistent error format | pytest | P1 |
| Pagination response format | Pagination metadata in responses | pytest | P1 |

### API Versioning Tests

| Test | Description | Tool | Priority |
|------|-------------|------|----------|
| `/v1/` prefix routes | All endpoints accessible under `/v1/` | pytest | P2 |
| Legacy endpoint redirect | Old endpoints return 301 | pytest | P2 |
| Deprecation header | Deprecation notice on old endpoints | pytest | P2 |

---

## 4. UI Tests

### Component Tests

| Component | Tests | Tool | Priority |
|-----------|-------|------|----------|
| Login form | Validation, submission, error states | Vitest + RTL | P0 |
| Registration form | Validation, consent checkbox | Vitest + RTL | P0 |
| Project list | Rendering, pagination | Vitest + RTL | P1 |
| Build status | Real-time updates | Vitest + RTL | P1 |
| Billing page | Plan display, upgrade flow | Vitest + RTL | P1 |
| Admin panel | User management, search | Vitest + RTL | P2 |
| Onboarding wizard | Step navigation, completion | Vitest + RTL | P2 |
| Error boundary | Fallback UI, retry button | Vitest + RTL | P1 |

### Accessibility Tests

| Test | Tool | Threshold | Priority |
|------|------|-----------|----------|
| Automated a11y audit | axe DevTools | 0 violations | P1 |
| Keyboard navigation | Manual + Cypress | All features accessible | P1 |
| Screen reader test | VoiceOver/NVDA | All content announced | P1 |
| Color contrast | axe + manual check | WCAG AA pass | P1 |
| Focus management | Cypress | Logical tab order | P1 |

### Visual Regression Tests

| Test | Description | Tool | Priority |
|------|-------------|------|----------|
| Landing page | Compare screenshots | Storybook + chromatic | P2 |
| Auth pages | Login, register, forgot password | Storybook + chromatic | P2 |
| Build pipeline | Agent pipeline visualization | Storybook + chromatic | P2 |
| Admin panel | All admin views | Storybook + chromatic | P2 |

---

## 5. End-to-End Tests

### Critical User Flows (Playwright)

| Flow | Steps | Tests | Priority |
|------|-------|-------|----------|
| Registration → Login → Create Project → Create Build → View Result | 5 | 10+ | P0 |
| Registration → Verify Email → Create Build | 4 | 8+ | P0 |
| Login → Forgot Password → Reset → Login | 4 | 6+ | P0 |
| Login → MFA Challenge → Access Dashboard | 3 | 6+ | P1 |
| Login → Create API Key → Use API Key → Delete API Key | 4 | 6+ | P1 |
| Login → Subscribe to Plan → Check Billing → Cancel | 5 | 8+ | P1 |
| Login → Create Webhook → Test Webhook → Delete | 4 | 6+ | P1 |
| Admin → Search Users → View User → Delete User | 4 | 6+ | P1 |
| User → Request GDPR Data Export → Delete Account | 4 | 6+ | P0 |
| Mobile: Registration → Build Creation | 5 | 6+ | P2 |

### E2E Test Infrastructure

| Component | Configuration |
|-----------|---------------|
| Test runner | Playwright |
| Browsers | Chromium, Firefox, WebKit |
| Test environment | Dedicated K8s namespace |
| Test data | Seed script for user/project/build data |
| CI integration | GitHub Actions matrix for browsers |
| Screenshot on failure | Enabled for all tests |
| Video recording | Enabled for flaky test debugging |
| Test retries | 2 retries for flaky tests |

---

## 6. Security Tests

### Automated Security Scanning

| Test | Tool | Frequency | Priority |
|------|------|-----------|----------|
| Static Application Security Testing (SAST) | Semgrep / Bandit | Every PR | P0 |
| Dependency vulnerability scanning | Snyk / Dependabot | Daily | P0 |
| Secret scanning | GitLeaks / truffleHog | Every commit | P0 |
| Container image scanning | Trivy / Clair | Every build | P0 |
| Infrastructure as Code scanning | Checkov / tfsec | Every K8s change | P0 |
| API security testing | OWASP ZAP | Weekly + Pre-release | P0 |

### Manual Security Testing

| Test | Description | Frequency | Priority |
|------|-------------|-----------|----------|
| Third-party penetration test | Full-scope pentest | Pre-release | P0 |
| Authentication review | JWT, OAuth, session management | Pre-release | P0 |
| Authorization review | RBAC, API permissions | Pre-release | P1 |
| Input validation review | All user inputs | Pre-release | P0 |
| Cryptography review | Encryption, hashing | Pre-release | P0 |
| AI pipeline review | Prompt injection, guardrails | Pre-release | P0 |

### Security Test Cases

| ID | Attack Vector | Test Description | Expected Result |
|----|---------------|------------------|-----------------|
| SEC-T-01 | CSRF bypass | POST without CSRF token | 403 Forbidden — **verified passing 2026-07-03** (also verified: valid token from `GET /auth/csrf-token` → 200; frontend now attaches it automatically on every mutating request, closing the actual gap — see ENGINEERING_BACKLOG.md SEC-001) |
| SEC-T-13 *(new)* | Password hashing functional | Register, then log in with the same credentials | 200 with a token — **verified passing 2026-07-03** (was failing with `ValueError: password cannot be longer than 72 bytes` due to a bcrypt/passlib version incompatibility; fixed by pinning `bcrypt==4.0.1`, see SEC-014). This should be the first security test run, not the last — nothing else in this table is reachable without a working auth flow. Fixing this also surfaced and required fixing an ObjectId-serialization crash on registration (SEC-016). |
| SEC-T-14 *(new)* | Credential exposure in responses | `GET /auth/me`, and login/register/refresh responses | No `hashed_password` or raw `github_token` field present — **verified passing 2026-07-03** (see SEC-015) |
| SEC-T-02 | Rate limit bypass | Flood requests when Redis down | 429 Too Many Requests |
| SEC-T-03 | JWT tampering | Modify JWT payload | 401 Unauthorized |
| SEC-T-04 | Token blacklist | Use blacklisted token | 401 Unauthorized |
| SEC-T-05 | NoSQL injection | `$where` in search field | Error or no results |
| SEC-T-06 | SSRF via webhook | Webhook URL to internal IP | 400 Bad Request |
| SEC-T-07 | Prompt injection | Known injection patterns | Blocked + logged |
| SEC-T-08 | Race condition | Concurrent build requests | Single build created |
| SEC-T-09 | MFA bypass | Skip MFA verification | 401 Unauthorized |
| SEC-T-10 | WS hijack | Connect without auth | Connection rejected |
| SEC-T-11 | IDOR | Access another user's project | 403 Forbidden |
| SEC-T-12 | Mass assignment | Extra fields in request | Ignored or rejected |

---

## 7. Performance Tests

### Load Tests (k6)

| Test Scenario | VUs | Duration | Thresholds | Priority |
|---------------|-----|----------|------------|----------|
| Auth: Login flow | 100 → 500 | 5 min | p95 < 500ms, error < 1% | P1 |
| Auth: Registration | 50 → 200 | 5 min | p95 < 1s, error < 1% | P1 |
| Builds: Create build | 10 → 50 | 10 min | p95 < 2s, error < 1% | P0 |
| Builds: List builds | 100 → 1000 | 5 min | p95 < 300ms, error < 1% | P1 |
| Projects: CRUD | 50 → 200 | 5 min | p95 < 500ms, error < 1% | P1 |
| Webhooks: Trigger | 100 → 500 | 5 min | p95 < 1s, error < 1% | P2 |
| Mixed workload | 200 → 1000 | 15 min | All above thresholds | P1 |

### Stress Tests

| Test Scenario | Description | Success Criteria | Priority |
|---------------|-------------|------------------|----------|
| Database pool saturation | Open 200+ concurrent connections | Graceful degradation, no crash | P1 |
| Redis connection flood | 500+ concurrent Redis operations | Rate limiting slows, no crash | P1 |
| LLM API throttling | 100+ concurrent build requests | Queue builds, reject excess | P1 |
| Memory pressure | Large build payloads (100MB+) | OOM prevention, request rejection | P2 |

### Endurance Tests

| Test | Duration | Load | Success Criteria | Priority |
|------|----------|------|------------------|----------|
| 24-hour soak test | 24h | 50% of peak load | No memory leak, no degradation | P2 |
| 7-day endurance | 7 days | 25% of peak load | No crash, stable performance | P2 |

---

## 8. Load Tests

### Load Test Scripts (k6)

```javascript
// Example k6 test structure
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },  // ramp up
    { duration: '5m', target: 100 },  // stay
    { duration: '2m', target: 500 },  // ramp up
    { duration: '5m', target: 500 },  // stay
    { duration: '2m', target: 0 },    // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};
```

### Load Test Inventory

| Script Name | Endpoints | File |
|-------------|-----------|------|
| `k6-auth.js` | POST /v1/auth/login, POST /v1/auth/register | `tests/load/k6-auth.js` |
| `k6-builds.js` | POST /v1/builds, GET /v1/builds | `tests/load/k6-builds.js` |
| `k6-projects.js` | CRUD /v1/projects | `tests/load/k6-projects.js` |
| `k6-mixed.js` | All critical endpoints | `tests/load/k6-mixed.js` |
| `k6-stress-db.js` | Database-intensive queries | `tests/load/k6-stress-db.js` |
| `k6-stress-redis.js` | Rate limit endpoints | `tests/load/k6-stress-redis.js` |

---

## 9. Stress Tests

| Test | Scenario | Method | Expected Behavior |
|------|----------|--------|-------------------|
| Connection pool exhaustion | Open 500 DB connections simultaneously | Parallel requests | Pool maxes at configured limit, requests queue |
| CPU saturation | Generate CPU-intensive builds | Complex AI prompts | HPA scales up pods, requests slow but don't fail |
| Memory exhaustion | Large payloads in requests | 50MB+ payloads | Request rejected with 413 Payload Too Large |
| Disk full simulation | Fill disk with logs/backups | Fill test partition | Alert fires, cleanup triggered |
| Network latency | 500ms added to all outbound calls | Traffic control (tc) | Timeouts handled, fallbacks activated |

---

## 10. Chaos Tests

### Chaos Experiments (Chaos Mesh / Litmus)

| Experiment | Target | Duration | Expected Behavior | Priority |
|------------|--------|----------|-------------------|----------|
| Pod failure (backend) | 1 backend pod killed | 5 min | Remaining pods serve traffic | P0 |
| Pod failure (Celery) | 1 Celery worker killed | 5 min | Tasks picked up by other workers | P0 |
| MongoDB primary failure | Primary node killed | 10 min | Automatic failover, no data loss | P0 |
| Redis failure | Redis pod killed | 5 min | App degrades gracefully (rate limiting bypass) | P0 |
| Network partition | 50% packet loss to API | 5 min | Client retries, circuit breaker opens | P1 |
| DNS failure | DNS resolution fails | 5 min | Cached DNS, graceful error | P1 |
| CPU spike | 200% CPU on backend | 5 min | HPA scales, slow but not crashing | P1 |
| Memory leak simulation | 90% memory on pod | 5 min | OOMKilled, pod restarts | P1 |
| Certificate expiry | TLS cert expires | - | Alert fires, automated renewal attempted | P1 |
| Cloud region failure | Simulate AZ outage | 15 min | Multi-AZ deployment continues serving | P2 |

### Chaos Testing Schedule

| Phase | Timing | Scope |
|-------|--------|-------|
| Weekly chaos | Every Friday | 2-3 low-risk experiments |
| Pre-release chaos | Before each release | Full battery of experiments |
| Game day | Monthly | Coordinated failure simulation |

---

## 11. Accessibility Tests

### Automated Accessibility Testing

| Tool | Integration | Frequency | Threshold |
|------|-------------|-----------|-----------|
| axe DevTools | Playwright + axe-core | Every E2E test run | 0 violations |
| Lighthouse CI | CI pipeline | Every PR | Score ≥ 90 |
| Pa11y | CI pipeline | Daily | 0 violations |

### Manual Accessibility Testing

| Test | Tool | Frequency | Tester |
|------|------|-----------|--------|
| Screen reader navigation | VoiceOver (Mac) | Pre-release | Accessibility specialist |
| Screen reader navigation | NVDA (Windows) | Pre-release | Accessibility specialist |
| Keyboard navigation | Native browser | Every feature | Developer |
| Zoom to 200% | Browser zoom | Pre-release | Developer |
| Color blindness simulation | Chrome DevTools | Pre-release | Developer |
| Focus order verification | Tab key navigation | Every feature | Developer |

### WCAG 2.1 AA Compliance Checklist

| Criteria | Description | Verification Method |
|----------|-------------|-------------------|
| 1.1.1 | Non-text content | Automated + manual check |
| 1.3.1 | Info and relationships | Automated + manual check |
| 1.4.3 | Contrast (minimum) | Automated color contrast check |
| 2.1.1 | Keyboard | Manual keyboard navigation |
| 2.4.3 | Focus order | Manual tab through pages |
| 2.4.4 | Link purpose (in context) | Screen reader test |
| 3.3.1 | Error identification | Form validation messages |
| 3.3.2 | Labels or instructions | ARIA labels on all inputs |
| 4.1.2 | Name, role, value | Automated aXe audit |

---

## 12. Regression Tests

### Regression Test Strategy

| Level | Scope | Trigger | Owner |
|-------|-------|---------|-------|
| Unit | Changed modules | Every PR | Developer |
| Integration | API contracts | Every PR | Developer |
| E2E | Critical user flows | Every merge to main | QA |
| Full regression | All tests | Pre-release | QA |
| Smoke | Critical paths | Post-deployment | DevOps |

### Regression Test Selection

| Change Type | Required Tests |
|-------------|----------------|
| Security fix | All security tests, auth tests, affected API tests |
| Backend API change | API contract tests, integration tests, affected E2E |
| Database change | Migration tests, integration tests, data integrity tests |
| Frontend change | Component tests, E2E flows, a11y tests |
| Infrastructure change | Deployment tests, chaos tests, monitoring tests |
| AI pipeline change | AI unit tests, integration tests, prompt injection tests |

### Smoke Test Suite

| Test | Description | Expected | Duration |
|------|-------------|----------|----------|
| Health check | GET /health | 200 OK | 1s |
| Authentication | Login with valid credentials | JWT token | 2s |
| Build creation | Create a build | Build ID returned | 10s |
| Build status | Poll build status | Complete | 60s |
| Database connectivity | Verify DB queries | Results returned | 1s |
| Redis connectivity | Verify rate limiting | Headers present | 1s |
| Celery worker | Verify task processing | Task completed | 30s |
| Frontend load | Open main page | Page loads | 3s |

---

## 13. Acceptance Tests

### Feature Acceptance Criteria

Each feature must meet these criteria before acceptance:

1. **Functional:** All acceptance criteria in the backlog item are met
2. **Tested:** Automated tests cover the feature with ≥80% coverage
3. **Secure:** Security review passed (no new vulnerabilities)
4. **Performant:** Response times within thresholds
5. **Accessible:** WCAG AA compliance maintained
6. **Documented:** API documentation updated if applicable
7. **Reviewed:** Code review completed and approved

### Release Acceptance Gates

| Gate | Criteria | Approver |
|------|----------|----------|
| Sprint Review | All sprint goals met, tests passing | CTO, PM |
| Security Gate | All P0/P1 security issues closed | Security Lead |
| Quality Gate | Test coverage ≥80%, E2E passing | QA Director |
| Performance Gate | Load tests within thresholds | Staff Engineer |
| Business Gate | Legal documents published, pricing set | PM |
| Deployment Gate | Infrastructure ready, DR tested | DevOps Lead |
| Launch Gate | All gates passed, incident response ready | Release Board |

---

## Test Automation Infrastructure

### CI Pipeline Integration

| Stage | Tests | Parallelism | Timeout |
|-------|-------|-------------|---------|
| Lint | ESLint, Bandit, Semgrep | Full parallel | 5 min |
| Unit | pytest (unit), Vitest | 4x parallel | 10 min |
| Integration | pytest (integration with testcontainers) | 2x parallel | 15 min |
| Build | TypeScript compile, Docker build | Full parallel | 10 min |
| E2E | Playwright (3 browsers) | 3x parallel | 20 min |
| Security | Trivy, GitLeaks, OWASP ZAP | Full parallel | 15 min |
| Load | k6 (smoke load test) | Sequential | 10 min |
| Coverage | pytest-cov, merge reports | Sequential | 5 min |

### Test Reporting

| Report | Tool | Audience | Frequency |
|--------|------|----------|-----------|
| Test results | pytest-html, jest-junit | Developers | Every run |
| Coverage report | pytest-cov, c8 | QA, CTO | Every PR |
| Performance report | k6 JSON output | Staff Engineer | Every load test |
| Security report | Semgrep JSON, Trivy JSON | Security Lead | Every run |
| Accessibility report | axe-core JSON | Frontend Lead | Daily |
| E2E report | Playwright report | QA | Every merge |

### Test Environment Requirements

| Resource | CI | Staging | Load Test |
|----------|----|---------|-----------|
| CPU | 8 cores | 16 cores | 32 cores |
| Memory | 16 GB | 32 GB | 64 GB |
| MongoDB | testcontainers | 3-node replica set | 3-node replica set |
| Redis | testcontainers | 2-node cluster | 2-node cluster |
| Celery | In-process | 2 workers | 4 workers |
| Duration limit | 30 min | - | 60 min |

---

## Test Execution Matrix

| Test Type | Sprint 0 | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 | Sprint 5 |
|-----------|----------|----------|----------|----------|----------|----------|
| Unit (backend) | Start auth, security | Core modules | All APIs | All modules | Complete | Regression |
| Unit (frontend) | Error boundary | TypeScript | Components | All pages | Advanced | Regression |
| Integration | DB setup | Celery, Redis | Stripe, Email | All services | Complete | Regression |
| API | Auth, Health | Projects, Builds | Webhooks, Admin | Billing, GDPR | All endpoints | Regression |
| E2E | Setup | Registration | Build flow | All flows | Complete | Regression |
| Security | SAST setup | SAST scans | Dependency scan | Container scan | API security | Pentest |
| Load | - | Setup k6 | Auth, Builds | Projects | All scenarios | Final run |
| Chaos | - | - | Setup | Pod failure | DB failover | Full battery |
| Accessibility | - | Setup | Automation | Fix violations | Verify | Full audit |
| Acceptance | - | - | - | Sprint review | Sprint review | Launch gate |

---

## Test Deliverables

| Artifact | Format | Location |
|----------|--------|----------|
| Test plan (this document) | Markdown | `tests/TEST_PLAN.md` |
| Test cases (automated) | Python/TypeScript | `backend/tests/`, `frontend/src/__tests__/` |
| Test data scripts | Python | `scripts/seed_test_data.py` |
| Load test scripts | JavaScript (k6) | `tests/load/` |
| Chaos experiments | YAML | `tests/chaos/` |
| E2E test scripts | TypeScript (Playwright) | `tests/e2e/` |
| Test coverage report | HTML | Generated in CI |
| Performance baseline | JSON | `tests/performance_baseline.json` |
| Security scan reports | JSON/HTML | Generated in CI |
| Accessibility report | HTML | Generated in CI |