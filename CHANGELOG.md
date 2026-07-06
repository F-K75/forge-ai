# Changelog

## 2026-07-06 — BUS-002: Stripe Price ID Production Validation (Session 4)

### Features Added

**Production Startup Gate for Stripe Price IDs:**
- The existing `validate_production_billing` model_validator in `backend/core/config.py` already enforced real Stripe Price IDs in production via regex (`price_[A-Za-z0-9]+`) and uniqueness checks
- Added explicit documentation in `.env.example` (lines 22-29) warning that `STRIPE_PRICE_*` defaults are non-functional placeholders
- Added documentation in `backend/core/config.py` (lines 96-98) and `backend/api/billing.py` (lines 44-46) explaining the placeholder nature of defaults

### Testing Coverage
- 7 new tests in `backend/tests/test_stripe_price_validation.py` covering:
  - Development environments allow placeholder price IDs
  - Production environments reject placeholder price IDs
  - Production environments accept real `price_xxx` values
  - Production environments reject invalid price formats
  - Production environments reject duplicate price IDs
  - Production environments reject empty price IDs
  - Test/CI environments allow placeholders

### Files Changed
- `backend/core/config.py` — documented existing `validate_production_billing` validator
- `backend/api/billing.py` — documented existing price ID sourcing from settings
- `.env.example` — added explicit placeholder warnings for STRIPE_PRICE_* vars
- `backend/tests/test_stripe_price_validation.py` — new test file (7 tests)

### Risks
- None — this is a pure validation gate; no runtime behavior changes for development/test environments
- Production deployments will now fail fast with a clear error message if Stripe Price IDs are not configured

### Migration Notes
- No migration required. The validation only activates when `APP_ENV=production`.
- Operators must set `STRIPE_PRICE_*` environment variables to real Stripe Price IDs before deploying to production.

---

## 2026-07-06 — AI-001: LLM Cost Tracking & User Budget Controls (Session 3)

### Features Added

**Token Estimation & Budget Enforcement:**
- Added `estimate_tokens()` to `core/ai_usage.py` — character-count heuristic (~4 chars/token for text, ~1.5 chars/token for code) for pre-call budget checks
- `LLMRouter.generate()` now estimates tokens from concatenated messages and passes a realistic estimate to `check_budget()`, rejecting calls that would exceed the daily limit *before* making the API call
- `BudgetExceeded` exceptions propagate through the agent pipeline as user-friendly build failures

**Concurrent Request Limiting:**
- Added per-user `asyncio.Semaphore` in `LLMRouter` with plan-based limits (free: 2, standard: 5, pro: 10, enterprise: 25)
- 30-second timeout prevents deadlocks; semaphore released on both success and failure paths
- Prevents a single user from saturating LLM provider rate limits

**Spending Alerts:**
- Added `token_budget_alerts_sent: List[str]` field to User model for dedup state
- `check_and_send_token_budget_alerts()` fires email notifications at 50%, 80%, and 100% of daily token budget
- Uses existing Resend email integration; best-effort (never blocks the build pipeline)

**MongoDB Indexes:**
- Added `ai_usage` indexes: `[("user_id", 1), ("created_at", -1)]`, `[("org_id", 1), ("created_at", -1)]`, and TTL index (90 days)

### Testing Coverage
- 24 new tests in `backend/tests/test_ai_cost_tracking_wired.py` covering:
  - Token estimation (empty, English, code, mixed, JSON, long text)
  - Budget enforcement (allows under, rejects over, blocks at limit, exception metadata)
  - Spending alerts (no alert below 50%, fires at 50/80/100%, multiple thresholds, dedup)
  - Daily budget limits (all plan tiers, unknown plan fallback)
  - Usage tracking persistence (record shape, budget remaining in response)

### Files Changed
- `backend/core/ai_usage.py` — added `estimate_tokens()`, `check_and_send_token_budget_alerts()`, wired alerts into `track_usage()`
- `backend/core/llm/router.py` — added concurrent request limiting, budget check with token estimates
- `backend/core/models.py` — added `token_budget_alerts_sent` field to User
- `backend/core/database.py` — added ai_usage indexes
- `backend/tests/test_ai_cost_tracking_wired.py` — new test file (24 tests)
- `IMPLEMENTATION_PLAN.md` — updated with completion status

### Risks
- Token estimation is heuristic-based; over-estimation may cause false rejections, under-estimation allows brief overages. Exact provider counts always override.
- Concurrent request limits may block legitimate parallel agent calls during heavy usage. Limits are per-plan and generous.

### Migration Notes
- No migration required. The `token_budget_alerts_sent` field is additive with a default empty list.
- ai_usage indexes are created automatically on next app startup via `_ensure_indexes()`.

---

## 2026-07-06 — Production runtime configuration (Session 2)

### Completion of Production Runtime Configuration Milestone

All six solution items from the Production Runtime Configuration Milestone have been implemented and validated:

**Documentation Updates:**
- Enhanced `.env.production.example` (now 75 lines vs. 46) with complete documentation:
  - Added `FIELD_ENCRYPTION_KEY` generation instructions
  - Documented `APP_ENV=production` requirement
  - Added complete Stripe Price ID requirements
  - Added guidance for optional LLM providers and email delivery

**Configuration Validation:**
- Confirmed `docker-compose.prod.yml` correctly passes all required environment variables to both backend and worker services
- Verified `backend/core/config.py` MongoDB validator permits authenticated self-hosted MongoDB while rejecting localhost in production
- Verified `backend/core/encryption.py` correctly decodes both 64-char hexadecimal and Fernet base64-encoded encryption keys
- Confirmed `backend/celery_app.py` correctly uses CELERY_BROKER_URL and CELERY_RESULT_BACKEND from settings

**CI Production Smoke Test:**
- Added new CI step "Production configuration smoke test" to `.github/workflows/ci.yml` (after type-check step)
- Validates production environment initialization with all required variables
- Confirms FIELD_ENCRYPTION_KEY, Stripe contract (live keys + valid Price IDs), and MongoDB URL contract work end-to-end
- Fails fast if production environment contract is broken, preventing invalid images from being built

**Testing Coverage:**
- Existing `backend/tests/test_config_validation.py` covers:
  - Production MongoDB validation (rejects localhost, allows authenticated hostnames, permits Atlas)
  - JWT secret validation (required, minimum length, blocked patterns)
- Existing `backend/tests/test_encryption.py` covers:
  - Field encryption key formats (hexadecimal and Fernet)
  - Encryption/decryption round trips
  - Token masking
  - Input sanitization

### Impact on Production Readiness

- **Before:** Production deployment would fail silently if operators forgot `FIELD_ENCRYPTION_KEY`, or fail at customer checkout if Stripe config was incomplete
- **After:** Deployment fails immediately with clear error messages if any production configuration is missing or invalid
- **Enables:** First production deployment and beta customer onboarding

### Files Changed

- `.env.production.example` — enhanced documentation
- `.github/workflows/ci.yml` — added production smoke test
- `IMPLEMENTATION_PLAN.md` — added completion status section

---

## 2026-07-06 — GDPR cascade deletion

- Replaced partial account deletion with an explicit, idempotent ownership-graph cascade.
- Added deletion for credentials, sessions, build files, messages, PM artifacts, billing, analytics, deployments, notifications, support, marketplace, referral, organization, and security data.
- Shared audit records are pseudonymized and feature-flag updater references are cleared.
- Shared organization owners must transfer ownership before deletion.
- Stripe customers are deleted before local data; billing cleanup failure prevents partial database erasure and continuing charges.
- Added relationship, retry, shared-tenant, ordering, and billing-failure regression coverage.

## 2026-07-06 — Remove public database diagnostics

- Removed unauthenticated endpoints that wrote test records and disclosed MongoDB collection names.
- Added regression coverage proving both temporary routes are absent from the production application.
- No database migration or frontend change is required.

## 2026-07-06 — Production runtime configuration gate

### Files changed

- `docker-compose.prod.yml`, `docker-compose.yml`, `.env.example`: synchronized required backend and worker environment settings.
- `backend/core/config.py`, `backend/core/encryption.py`: aligned supported production MongoDB and field-encryption key formats.
- `.github/workflows/ci.yml`: added a production-configured backend container import smoke test.
- Backend configuration, encryption, password, and SSRF tests: added regressions and removed nondeterministic DNS dependence.
- LLM modules and `orchestrator/config.py`: resolved existing lint and Python compatibility failures.
- `frontend/src/components/build/PreviewPanel.tsx`: removed a stale lint suppression.
- `README.md`, `IMPLEMENTATION_PLAN.md`: documented the runtime contract and milestone design.

### Features added

- Production API and worker services now fail fast unless an independent field-encryption key is supplied.
- CI imports both the FastAPI and Celery applications inside the built production image with production settings.
- All configured LLM provider credentials are available consistently to the API and worker.

### Bugs fixed

- Fixed guaranteed backend/worker startup failure caused by the missing `FIELD_ENCRYPTION_KEY` environment variable.
- Fixed production Compose running under development settings.
- Fixed self-hosted production MongoDB being rejected solely because it does not use Atlas SRV addressing.
- Fixed Fernet-format encryption keys passing settings validation and then crashing encryption initialization.
- Fixed existing backend lint failures and a Python 3.9 orchestrator settings import failure.
- Made the public-host SSRF unit test deterministic on network-restricted runners.

### Risks

- Existing deployments must set and preserve `FIELD_ENCRYPTION_KEY` before updating.
- A key change without the documented rotation procedure prevents existing encrypted tokens from being decrypted.
- Docker artifact execution was not available on the local host; the new CI smoke gate performs it.

### Breaking changes

- `FIELD_ENCRYPTION_KEY` is now a required Docker Compose variable for both development and production services.
- Production Compose explicitly sets `APP_ENV=production`, enabling production-only validation.

### Migration notes

1. Generate a dedicated key with `openssl rand -hex 32` if one does not already exist.
2. Store it in the deployment secret store as `FIELD_ENCRYPTION_KEY`; do not reuse `JWT_SECRET`.
3. Preserve and back up the key, then follow `docs/FIELD_ENCRYPTION_KEY_ROTATION.md` for future rotation.
4. Run `docker compose -f docker-compose.prod.yml config -q` before deployment.
