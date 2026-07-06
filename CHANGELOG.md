# Changelog

## 2026-07-06 — LLM-013: Shared Multi-Dimensional LLM Rate Limiting (Session 9)

### Features Added

**Multi-dimensional, shared LLM request-rate limiting.** The previous limiter
keyed only by `user_id`, so a single runaway build loop could consume a user's
entire per-minute allotment and starve that user's other projects (and, in an
org, crowd out siblings). `check_llm_rate_limit` now enforces three independent
Redis-backed dimensions and rejects a request if **any** is over its limit:

- `user`:    `rl:llm:user:{user_id}`      — 60 / 60s
- `project`: `rl:llm:project:{project_id}` — 30 / 60s (bounds one build loop)
- `org`:     `rl:llm:org:{org_id}`         — 300 / 60s (org-wide backstop)

`LLMRouter.generate()` now passes `project_id` and `org_id` (already in scope)
so all three dimensions are enforced. The limiter remains Redis-backed
(survives process restarts in steady state) with the same in-memory
fail-closed fallback as `check_email_rate_limit` — consistent with the rest of
the app's rate limiting, addressing the last open TODO Step 9 item.

### Bugs Fixed

- Closed the abuse vector where one project's agent retry loop could dominate
  Forge's shared provider capacity to the detriment of other projects/users.
- Fixed a latent `TypeError` in the in-memory fallback branch (was comparing a
  tuple to an int) — now correctly unpacks `(allowed, remaining)`.

### Files Changed

- `backend/core/security.py` — replaced `LLM_RATE_LIMITS["generate"]` with
  `LLM_RATE_LIMIT_DIMENSIONS` (user/project/org); rewrote `check_llm_rate_limit`
  to evaluate all applicable dimensions.
- `backend/core/llm/router.py` — pass `project_id`/`org_id` into
  `check_llm_rate_limit`.
- `backend/tests/test_llm_rate_limit.py` — rewritten + extended (9 tests):
  per-user allowance, user scoping, **project** dimension binding, **org**
  dimension binding (isolated), distinct-project quota isolation, in-memory
  fallback, `generate()` raises on limit, and no-limit-without-user.
- `backend/tests/test_llm_byok.py`, `backend/tests/test_ai_cost_tracking_wired.py`
  — updated stale `LLM_RATE_LIMITS` references to `LLM_RATE_LIMIT_DIMENSIONS`.

### Testing Coverage

- Full backend suite: **261 passed** (was 258; +3 new multi-dimensional tests).

### Risks

- A legitimate heavy build could trip the per-project (30/60s) ceiling. 30
  calls/min/project is generous for a multi-agent pipeline (a handful per
  stage) and only throttles pathological runaways; limits are tunable in
  `LLM_RATE_LIMIT_DIMENSIONS`.
- In-memory fallback resets on process restart during a Redis outage (accepted
  degradation, consistent with the rest of the app's limiters).

### Breaking Changes

- `check_llm_rate_limit(user_id)` signature gained optional `project_id` and
  `org_id` keyword arguments (backward compatible for callers passing only
  `user_id`).

### Migration Notes

- No migration required. Redis key namespace changed from `rl:llm:{user_id}`
  to dimensioned `rl:llm:{dimension}:{identity}`; old keys are simply unused
  and expire via their TTL.

---

## 2026-07-06 — LLM-012: DB-Backed Agent Override Persistence Verified (Session 8)

### Features Added

**Closed the stale "DB-backed LLM config overrides" gap.** On inspection, the
feature was already implemented end-to-end but the TODO.md item still marked
it `blocked: in-memory only, reset on restart`. This milestone verifies and
locks the guarantee rather than re-implementing existing code:

- `LLMConfigLoader.set_agent_override()` upserts into the `llm_agent_overrides`
  MongoDB collection (in `core/llm/config.py`), with a `unique` index on
  `agent` created at startup in `core/database._ensure_indexes`.
- `LLMConfigLoader.refresh_db_overrides()` reads the collection into the
  in-memory cache; `main.py` lifespan pre-warms it at startup, so overrides
  survive a deploy/restart instead of being lost.
- `PUT /api/llm/agent/{agent}` (admin) → `router.set_agent_override` → persists
  to Mongo and reflects immediately in-process; `POST /api/llm/reload` re-reads
  for other replicas (eventually consistent, same tradeoff as feature-flags).

### Bugs Fixed

- Added `tests/test_llm_config_db_overrides.py::test_override_survives_process_restart`
  which proves a fresh loader instance (simulating a restart) pre-warmed from
  the DB sees an override written by a previous process — the exact scenario
  the TODO claimed was broken. No code change was required because the
  persistence path already existed and was correct.

### Files Changed

- `backend/tests/test_llm_config_db_overrides.py` — added
  `test_override_survives_process_restart` (6 tests total in file, all pass).
- `TODO.md` — flipped the Step 5 DB-backed-overrides item from `[ ] blocked`
  to `[x] DONE` with a description of the implemented persistence + index +
  startup pre-warm, and noted the cross-replica eventual-consistency tradeoff.
- No backend source changes required (feature already present and indexed).

### Testing Coverage

- `tests/test_llm_config_db_overrides.py` (6 tests): DB read reflects in load,
  set persists + visible same-process, in-memory fallback on DB failure,
  fails-open on refresh failure, DB wins over YAML, and **survives restart**.
- Full LLM suite (`test_llm_config_db_overrides`, `test_llm_api`,
  `test_llm_router`, `test_llm_byok`): 23 passed.

### Risks

- Cross-replica override propagation is eventually consistent (reload/restart
  required on other replicas), not instant. Acceptable and documented; true
  instant propagation would need pub/sub (Redis keyspace notifications / change
  stream) and is out of scope.

### Breaking Changes

- None.

### Migration Notes

- No migration required. The `llm_agent_overrides` collection and its unique
  `agent` index are created automatically at startup via `_ensure_indexes`.

---

## 2026-07-06 — SEC: CSRF Exclusion Audit & Fix (Session 7)

### Bugs Fixed

**CSRF coverage audit of every state-changing route found two defects:**

1. **Over-exclusion (vulnerability).** `_CSRF_EXCLUDED_PATHS` contained the bare
   prefix `/api/llm`, so the admin mutation endpoints `PUT /api/llm/agent/{agent}`,
   `POST /api/llm/reload`, and `POST /api/llm/test` skipped CSRF entirely.
   These are `admin_required` and the frontend already sends `X-CSRF-Token` on
   them, so the exclusion defeated the CSRF protection that was re-enabled in a
   prior session. A logged-in admin visiting a malicious page could be CSRF'd
   into triggering billed provider calls (`POST /api/llm/test`) or changing
   platform-wide model assignments (`PUT /api/llm/agent/{agent}`) via their
   session cookie. Removed `/api/llm` from the exclusion list.

2. **Under-exclusion (broken webhook).** `POST /billing/webhook/payment` is a
   Stripe webhook authenticated only by the `Stripe-Signature` header (no
   session cookie), but it was not in the exempt list alongside its sibling
   `/billing/webhook`. The CSRF middleware therefore required a session cookie
   + `X-CSRF-Token` on it, which Stripe never sends, so legitimate payment
   webhooks were rejected with 403 and credit purchases never completed. Added
   `/billing/webhook/payment` to the exempt list.

### Files Changed

- `backend/core/security.py` — removed `/api/llm` from `_CSRF_EXCLUDED_PATHS`;
  added `/billing/webhook/payment` (with explanatory comments).
- `backend/tests/test_csrf_coverage.py` — new suite (6 tests): safe methods skip
  CSRF; `/auth/login` and `/billing/webhook/payment` remain exempt; `/api/llm/*`
  mutations now require a CSRF token; arbitrary mutating route requires token;
  exclusion-list invariants asserted.
- `backend/tests/test_llm_api.py` — updated to reflect that `/api/llm` mutations
  are now CSRF-protected (mint a real session cookie + CSRF header for the
  happy path; unauth mutating calls are rejected pre-auth).

### Testing Coverage

- `tests/test_csrf_coverage.py` (6 new tests) + updated `tests/test_llm_api.py`.
- Full backend suite: **257 passed**.

### Risks

- Any non-browser client calling `/api/llm/*` mutations without a CSRF token
  will now 403. All in-repo clients (frontend `llmApi`) already send it; this
  is the correct security posture.

### Breaking Changes

- `PUT /api/llm/agent/{agent}`, `POST /api/llm/reload`, `POST /api/llm/test`
  now require `X-CSRF-Token` (already sent by the admin UI).
- `POST /billing/webhook/payment` no longer requires CSRF (was incorrectly
  gating legitimate Stripe calls).

### Migration Notes

- No migration required. External scripted callers of the admin LLM endpoints
  must include the CSRF token (fetch `GET /auth/csrf-token` first).

---

## 2026-07-06 — GDPR-012: Complete & Tested Data Export Endpoint (Session 6)

### Features Added

**Complete GDPR data export (`GET /gdpr/export`):**
- Rewrote `export_user_data` to gather **every** user-owned data category the
  account-deletion cascade erases, so a data-subject access / portability
  request is no longer silently incomplete (previously only `user`, `projects`,
  and `builds` were returned).
- Added `_collect_user_data(db, user)` which mirrors `_user_owned_ids` used by
  the deletion cascade, covering: projects, builds, build_files, messages,
  initiatives, sprints, sprint artifacts (standups/reviews/retros), initiative
  artifacts (prds/epics/stories/tasks/releases/risk_reports/tech_debt_summaries/
  agent_executions/decision_log), all direct-user collections (api_keys,
  ai_usage, subscriptions, invoices, credit_purchases, security_events,
  notifications, onboarding_progress, support_tickets, deployments, webhooks,
  analytics_events), marketplace_items, referrals, team_members, organizations.
- Privacy-safe: password hash and encrypted secrets (`github_token`,
  `llm_api_key`, `totp_secret`, `verification_token`, `mfa_backup_codes`) are
  stripped both via projection and defensively in Python before serialization.
- Returns a **streamed** `application/json` `StreamingResponse` with a
  `Content-Disposition: attachment` header (downloadable file), so large
  accounts don't buffer entirely in memory.

### Bugs Fixed

- Closed a GDPR compliance gap: the export endpoint omitted most of a user's
  stored data (GDPR Art. 15 / 20 right of access & portability).
- No automated test covered the export endpoint; regressions (e.g. omitting a
  newly added collection) would have gone undetected.

### Files Changed

- `backend/api/gdpr.py` — added `_user_owned_ids`, `_collect_user_data`,
  `_collect_many`; rewrote `export_user_data` to stream a complete export.
- `backend/tests/test_gdpr_export.py` — new suite (2 tests): completeness across
  all categories + secret stripping, and isolation from other users' data.
- Removed stale `IMPLEMENTATION_PLAN.md` SSRF draft content (superseded by the
  prior session's plan) and replaced with this milestone's plan.

### Testing Coverage

- `tests/test_gdpr_export.py`: `test_export_includes_all_owned_categories_and_strips_secrets`
  and `test_export_omits_other_users_data`. Existing
  `tests/test_gdpr_cascade.py` (deletion) and auth/P0 suites all pass.

### Risks

- Larger payload for heavy users — mitigated by streaming. Encrypted secrets are
  intentionally excluded (not reversibly readable by the user; exporting
  ciphertext adds leak surface without portability value).

### Breaking Changes

- None for valid inputs. Response shape changed from a flat
  `{user, projects, builds}` object to a comprehensive nested JSON document;
  any client parsing the old shape must adapt. The endpoint was previously
  incomplete, so this is a correctness fix, not a behavioral regression.

### Migration Notes

- No migration required. Frontend may now link to `GET /gdpr/export` to let
  users download their data.

---

## 2026-07-06 — SEC: BYOK `base_url` SSRF Protection (Session 5)

### Features Added

**Server-Side Request Forgery (SSRF) guard for Bring-Your-Own-Key endpoints:**
- Added `validate_byok_base_url(url)` in `backend/core/security.py` — reuses the
  existing private-IP classifier + DNS resolution from `validate_webhook_url`,
  but always requires HTTPS (a BYOK base URL is an API endpoint). It blocks
  loopback, private (10/172.16/192.168), link-local incl. the cloud metadata
  endpoint `169.254.169.254`, unspecified (`0.0.0.0`), reserved, and multicast
  addresses, plus unresolvable hostnames.
- Enforced at **write time** in `PUT /auth/me` (`backend/api/auth.py`): a
  `openai_compatible` provider with an unsafe `llm_base_url` is rejected with
  `400 Invalid llm_base_url: <reason>`.
- Enforced at **read time** in `_resolve_byok` (`backend/agents/base.py`): if a
  stored URL fails validation the BYOK config is dropped (falls back to
  Forge-paid providers) and a warning is logged, so compromised/stale stored
  state can never drive an outbound request to an internal address.

### Bugs Fixed

- Closed an SSRF gap where a Pro+ user could direct Forge's server-side LLM
  client at internal services or the cloud metadata service via a malicious
  `llm_base_url` (OWASP A10). The platform already had `validate_webhook_url`
  for webhooks but never applied equivalent validation to the BYOK base URL.

### Files Changed

- `backend/core/security.py` — added `validate_byok_base_url`
- `backend/api/auth.py` — validate `llm_base_url` in `PUT /auth/me` (import + guard)
- `backend/agents/base.py` — validate `llm_base_url` in `_resolve_byok`
- `backend/tests/test_byok_ssrf.py` — new suite (11 tests)
- Removed a redundant, weaker, non-DNS-resolving `backend/core/security/ssrf_prevention.py`
  prototype that was begun earlier and superseded by this proper fix.

### Testing Coverage

- `backend/tests/test_byok_ssrf.py`: valid https (monkeypatched DNS), rejects
  http scheme, missing hostname, loopback / private / metadata / unspecified /
  multicast IPs, unresolvable host. `test_ssrf_protection.py` (webhook) and the
  auth/byok/llm suites (`test_auth_endpoints.py`, `test_llm_byok.py`,
  `test_llm_api.py`, `test_p0_fixes.py`) all pass.

### Risks

- Legitimate corporate OpenAI-compatible gateways on private-range addresses are
  now rejected by design (BYOK endpoints must be publicly routable HTTPS). This
  is intended behavior, not a regression.

### Breaking Changes

- None for valid inputs. `PUT /auth/me` now returns `400` for an unsafe
  `llm_base_url` where it previously accepted it.

### Migration Notes

- No migration required. Existing users with a stored private-range `llm_base_url`
  will silently fall back to Forge-paid providers until they update the value;
  they should be notified to set a publicly routable HTTPS endpoint.

---

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
