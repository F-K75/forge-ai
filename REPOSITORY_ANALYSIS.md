# Forge AI — Repository Analysis

## 1. Architecture Summary

**Stack:** Python 3.12 / FastAPI backend, React 18 / Vite 5 / TypeScript frontend, MongoDB (Motor), Redis, Celery, Prometheus + Grafana monitoring.

### Core Services
| Service | Path | Port | Purpose |
|---------|------|------|---------|
| Backend API | `backend/` | 8000 | FastAPI app: auth, builds, billing, PM, admin |
| Celery Worker | `backend/` | — | Async build pipeline execution |
| Frontend | `frontend/` | 3000 | React SPA (Vite dev) |
| Orchestrator | `orchestrator/` | 8100 | Review Board / agent orchestration service |
| Orchestration | `orchestration/` | — | Meta-orchestration tooling (runtime artifacts) |

### Data Flow
1. User creates build via API → FastAPI route handler
2. Route validates, reserves credits, enqueues Celery task
3. Celery worker runs multi-agent pipeline (Architect → Designer → Developer → Integration → PM)
4. Results streamed back via WebSocket
5. Build artifacts validated (sandbox, moderation, CSP injection)
6. Optional deployment to preview/staging

### Key Features
- Multi-agent AI build pipeline (5 agents + debug loop)
- Dual billing (Stripe + Razorpay) for India market
- Credit-based usage system with Free/Standard/Pro tiers
- LLM cost tracking with daily budget enforcement
- BYOK (Bring Your Own Key) support for Pro+ users
- Agile PM layer (initiatives, epics, stories, sprints, releases)
- GDPR compliance (data export, cascade deletion)
- Marketplace for sharing templates/components
- Webhook system with SSRF protection

## 2. Feature Inventory

- [x] **Authentication**: JWT-based, email/password + OAuth (GitHub), MFA (TOTP), refresh tokens, JTI blacklist, per-email rate limits
- [x] **Build Pipeline**: Multi-agent LLM orchestration, Celery async execution, WebSocket streaming, sandbox validation, content moderation, CSP injection
- [x] **Billing**: Stripe + Razorpay, subscription tiers, credit purchases, webhook idempotency
- [x] **Admin**: User management, credit adjustments, audit log viewer, dead letter queue
- [x] **GDPR**: Complete data export, cascade deletion, confirmation email
- [x] **API Versioning**: `/v1/` prefix with deprecation middleware
- [x] **Rate Limiting**: Per-IP, per-user, multi-dimensional LLM rate limits, per-email auth limits, Redis-backed with in-memory fail-closed fallback
- [x] **Security**: CSRF (JTI-based), CSP headers, prompt injection detection (pattern + LLM), path traversal prevention, SSRF protection (webhooks + BYOK), secret scanning CI
- [x] **Observability**: Prometheus metrics (HTTP + build), Sentry error tracking, detailed health endpoints, request correlation IDs, connection pool monitoring
- [x] **Infrastructure**: Docker Compose (dev + prod), K8s manifests (backend/frontend/mongo/redis/orchestrator/monitoring/ingress), CI/CD pipelines, MongoDB backup with integrity verification, DR runbook
- [x] **Testing**: 450 backend tests (8 skipped), 20 frontend tests, secret scanning, pip-audit, lint

## 3. Current Test Suite Health

| Suite | Count | Status |
|-------|-------|--------|
| Backend tests | 450 passed, 8 skipped | ✅ Green |
| Frontend tests | 20 tests (Vitest) | ✅ Green |
| Frontend build | tsc + Vite | ✅ Green |
| pytest coverage | Not configured | ⚠️ Missing |
| E2E tests | 0 | ❌ Missing |
| Load tests | 0 | ❌ Missing |

## 4. Gaps & Technical Debt

### P0-Critical
- **SEC-014: Live production credentials committed to git history** — `.env` file contains real, active credentials (Anthropic API key, OpenAI API key, MongoDB Atlas credentials with password, Resend API key, GitHub OAuth secret, JWT secret, field encryption key). The `.env` file was committed in 4 historical commits (`initial`, `audit`, `SEC-002`, etc.). While `.env` is now in `.gitignore`, the secrets exist in git history forever. **These keys must be rotated immediately.** This is the single highest-priority issue.

### P1-High
- **No structured logging aggregation** — No Loki/ELK/Datadog configuration for centralized log search
- **No OpenTelemetry tracing** — Request correlation IDs exist but don't propagate to Celery tasks; no distributed tracing
- **No end-to-end (E2E) tests** — Zero Playwright/Cypress tests, zero integration tests against real MongoDB/Redis
- **Test coverage reporting not enforced** — No `pytest-cov` threshold, no frontend coverage thresholds
- **Frontend test coverage is too thin** — 20 tests for a large SPA with 50+ components, 20+ stores
- **Orchestrator test coverage is minimal** — Only 1 test file with basic tests

### P2-Medium
- **No performance benchmarks** — No k6/artillery/locust load testing configuration
- **No staged deployment** — No staging/integration environment documented
- **Cookie/`hashed_password` leak risk** — Need to verify all user-returning endpoints sanitize password hashes
- **No rate-limit tier differentiation** — All plans share same rate limits (documented gap)
- **WebSocket auth uses short-lived JWT but no per-message auth** (SEC-003 residual)
- **`orchestrator/` and `orchestration/` directories** — Redundant naming suggests stale refactoring

## 5. Security Posture

| Control | Status | Details |
|---------|--------|---------|
| Authentication | ✅ | JWT, refresh tokens, MFA, JTI blacklist |
| CSRF | ✅ | JWT-jti-based, audited exclusion list |
| Rate Limiting | ✅ | Multi-dimensional, Redis + in-memory fallback |
| Prompt Injection | ✅ | Pattern + LLM classifier (defense in depth) |
| Path Traversal | ✅ | `safe_join_path` in deployment + sandbox |
| SSRF | ✅ | Webhook + BYOK URL validation with DNS resolution |
| CSP | ✅ | Platform + generated app injection |
| Secrets Scanning | ✅ | git-secrets CI + pre-commit hook |
| Dependencies | ✅ | pip-audit (2 remaining advisories, none exploitable) |
| K8s Security | ✅ | readOnlyRootFilesystem, runAsNonRoot, probes |
| **Credential Rotation** | **❌** | **Live secrets in git history — CRITICAL** |
| **Secret Detection in CI** | ⚠️ | git-secrets only scans changed files, not history |