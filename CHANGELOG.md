# Changelog

## 2026-07-07 — CSP Headers for Generated Applications (AI-007, P1)

### Features Added

- New deterministic injector `backend/sandbox/csp.py` (`apply_csp`,
  `inject_html_csp`, `inject_fastapi_csp`, `CspReport`) that adds a secure
  default CSP to generated apps at build time so the protection travels with
  the code when deployed/previewed standalone.
- HTML entry points get a CSP `<meta>` in `<head>`.
- Simple module-level FastAPI apps (`app = FastAPI(...)`) get a CSP
  response-header middleware appended.
- `DEFAULT_CSP`: `default-src 'self'; script-src 'self'; style-src 'self'
  'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self';
  object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action
  'self'`.

### Bugs Fixed

- Generated applications had no Content-Security-Policy of their own (only the
  Forge platform's responses did), leaving XSS in generated frontend code
  uncontained.

### Files Changed

- `backend/sandbox/csp.py` — new injector.
- `backend/core/orchestrator.py` — `apply_csp(files)` after integration;
  `validation["csp"]` attached on `BUILD_COMPLETE`.
- `backend/tests/test_csp_injection.py` — 13 new tests.

### Testing Coverage

- 13 new backend tests (HTML inject/idempotent/non-override; FastAPI
  supported/skip/duplicate-import; `apply_csp` dict behavior). Full backend
  suite **349 passed**; ruff clean.

### Risks

- `script-src 'self'` may block inline scripts in some generated apps at
  preview (CSP working as intended). Backend CSP only for the simple
  module-level FastAPI shape; other layouts skipped (not broken).

### Breaking Changes

- None (report rides the existing `validation` dict).

### Migration Notes

- None.

## 2026-07-07 — Content Moderation for Generated Code (AI-005, P0/P1)

### Features Added

- New deterministic scanner `backend/sandbox/moderation.py` (`scan_code`,
  `ModerationReport`, `Finding`) that checks every generated file for leaked
  secrets and unsafe operations before deploy.
- Blocking detections (folded into the build's sandbox errors so the PM debug
  loop remediates them): AWS Access Key ID / secret, PEM private keys, Stripe
  live/restricted keys, Google API keys, Slack tokens, GitHub PATs; and
  destructive ops — `rm -rf /` (or `/*`, `~`), `shutil.rmtree("/")`,
  `os.remove("/")`, bash fork bomb, `dd of=/dev/(sd|hd|nvme|vda)`,
  `os.system("shutdown"|"halt"|"reboot"|"poweroff")`.
- Warning detections (non-blocking, surfaced in the build report):
  piped-to-shell downloads (`curl … | sh`), `eval(`/`exec(`, and high-entropy
  assignments to secret-named variables (placeholder-filtered).
- Integrated into `core/orchestrator.run_build`: blocking findings enter
  `sandbox_errors` (debug loop remediates); the final report is attached to
  `validation["moderation"]` (emitted/persisted on `BUILD_COMPLETE`).

### Bugs Fixed

- Generated apps could previously deploy with hardcoded cloud credentials or
  destructive commands and no static safeguard beyond syntax checks.

### Files Changed

- `backend/sandbox/moderation.py` — new scanner.
- `backend/core/orchestrator.py` — import `scan_code`; fold blocking lines into
  `sandbox_errors`; attach final report to `validation["moderation"]`.
- `backend/tests/test_content_moderation.py` — 23 new tests.

### Testing Coverage

- 23 new backend tests (all secret/destructive rules, both warning categories,
  placeholder/false-positive discipline, report helpers). Full backend suite
  **336 passed**; ruff clean.

### Risks

- Pattern-based detection is incomplete against obfuscation (backstop, not a
  complete guarantee). Warning rules may appear in legitimate code but are
  non-blocking. Per-file scan capped at 200 KB.

### Breaking Changes

- None (report rides the existing `validation` dict).

### Migration Notes

- None.

## 2026-07-07 — Harden Prompt-Injection Detection (AI-002, P0)

### Features Added

- Rewrote `core/llm/router._detect_prompt_injection` into a deterministic,
  obfuscation-resistant blocklist. A new `_strip_obfuscation` helper NFKC-
  normalizes the input, strips invisible/format characters, maps common
  Unicode homoglyphs to ASCII, and lower-cases before producing a `spaced` and
  a `despaced` form. Each injection phrase is matched against both forms
  (the de-spaced form catches word/letter spacing like `i g n o r e`).
- Added `_INVISIBLE_RE` (zero-width spaces, soft hyphen, BOM, etc.),
  `_HOMOGLYPH_MAP` (Cyrillic/Greek look-alikes), and a de-spaced phrase set.
- Expanded the phrase list from 5 to 14 high-precision phrases (added
  `disregard`/`forget previous instructions`, `ignore the above/previous
  prompt`, `reveal/print/show your instructions`, etc.).

### Bugs Fixed

- Zero-width-character bypass (`ignore\u200b previous instructions`) — now detected.
- Unicode homoglyph bypass (`іgnore prevіous іnstructіons`) — now detected.
- Full-width Unicode bypass (`ＩＧＮＯＲＥ ＰＲＥＶＩＯＵＳ …`) — now detected.
- Word/letter-spacing bypass (`i g n o r e previous instructions`) — now detected.
- Missing phrase variants (`disregard`/`forget`/`reveal your instructions`) — now detected.

### Files Changed

- `backend/core/llm/router.py` — `_INJECTION_PHRASES`, `_INJECTION_PHRASES_DESPACED`,
  `_INVISIBLE_RE`, `_HOMOGLYPH_MAP`, `_strip_obfuscation`, `_detect_prompt_injection`.
- `backend/tests/test_prompt_injection_detection.py` — 9 new regression tests.

### Testing Coverage

- 9 new backend tests (zero-width, soft hyphen, homoglyph, full-width, word
  splitting, expanded phrases, two benign-prompts-must-pass guards). Total in
  file: 17 passed. Full backend suite **305 passed**; ruff clean.

### Risks

- Pattern-based detection remains incomplete against free paraphrasing; it is a
  deterministic backstop, not a complete defense. Homoglyph map kept small to
  avoid false positives.

### Breaking Changes

- None.

### Migration Notes

- None.

## 2026-07-07 — Data Retention Policy (DB-003, P0)

### Features Added

- Centralized the data-retention policy into a single config-driven source of
  truth: `RETENTION_TTL_SECONDS` in `core/config.py`, applied at startup by the
  new `apply_retention_ttl_indexes()` helper in `core/database.py` as
  `created_at` TTL indexes. Previously the TTLs were scattered as inline
  `expireAfterSeconds` calls (and `sessions` / `notifications` had none).
- Ephemeral / high-volume collections now auto-expire via MongoDB native TTL
  (atomic, no app downtime): `build_files` (90d), `analytics_events` (90d),
  `audit_logs` (1y), `security_events` (90d), `token_blacklist` (24h),
  `ai_usage` (90d), **`sessions` (30d — matches refresh-token lifetime)**, and
  **`notifications` (90d)**. Core business records (users, projects, builds,
  subscriptions, deployments, support_tickets, marketplace_items) are retained
  indefinitely by design. `rate_limits` keeps its existing `reset_at` 5-min TTL.

### Bugs Fixed

- None (additive; refactor of existing inline TTLs into the centralized policy).

### Files Changed

- `backend/core/config.py` — `RETENTION_TTL_SECONDS` policy dict.
- `backend/core/database.py` — `apply_retention_ttl_indexes()`; `_ensure_indexes`
  invokes it; removed the 6 duplicated inline `created_at` TTL index calls.
- `backend/tests/test_retention_policy.py` — 5 new tests.

### Testing Coverage

- 5 new backend tests (policy contents, per-collection TTL index creation,
  missing-collection skip, create-failure non-raise). Full backend suite
  **305 passed**.

### Risks

- Automated **archival to cold storage (S3 Glacier)** is deferred — it requires
  bucket/export infrastructure that isn't wired. TTL deletion is the enforcement
  mechanism for now, which satisfies the purge/retention requirement; archival
  is a future enhancement.

### Breaking Changes

- None (index shapes unchanged for the 6 previously-TTL'd collections; two new
  TTL indexes added for `sessions`/`notifications`).

## 2026-07-07 — Redis Caching for Read-Heavy Endpoints (BE-007, P0)

### Features Added

- Added a reusable cache-aside helper (`backend/core/cache.py`) so read-heavy
  endpoints get consistent TTLs, fail-open behaviour, and a single invalidation
  entry point without re-implementing boilerplate (`cached_read` +
  `invalidate_cache`).
- Cached `GET /billing/plans` (1h TTL) — the plan table is config-driven and
  effectively static per deploy, so every pricing-page load no longer rebuilds
  it.
- Cached `GET /auth/me` (60s TTL) and invalidate the entry on `PUT /auth/me`
  and password change, so profile reads are shielded but writes reflect
  immediately.
- Feature flags were already cached with write-invalidation in `admin.py`;
  this unifies the pattern and closes the plans/user-profile gap.

### Bugs Fixed

- None (additive caching + helper module).

### Files Changed

- `backend/core/cache.py` — new cache-aside helper + TTL constants.
- `backend/api/billing.py` — `list_plans` now serves through `cached_read`.
- `backend/api/auth.py` — `get_me` cached; `update_profile` + `change_password`
  invalidate the profile cache.
- `backend/tests/test_cache_helper.py`, `backend/tests/test_cache_plans.py` —
  9 new tests (cache-aside miss/hit, fail-open, invalidation, plans cycle).

### Testing Coverage

- 9 new backend tests; full backend suite **300 passed** (was 291).
- `ruff` clean on changed files.

### Risks

- Profile cache window is 60s; a write outside `update_profile`/`change_password`
  (e.g. admin credit grant) could show a stale profile for up to 60s. Acceptable
  for this endpoint; the invalidation points cover the common user-driven
  mutations.
- Cache hit/miss metrics not yet exported (deferred — scrape source already
  exists via Prometheus HTTP metrics + `/health/pools`).

### Breaking Changes

- None (response shapes unchanged; caching is transparent).

## 2026-07-07 — Frontend Test Infrastructure (TEST-001, P1 → Production Gate)

### Features Added

- Established the first automated frontend test suite and made it a **blocking
  CI gate**. The frontend had zero `*.test.*` files and CI ran no frontend tests
  (the single reddest launch-readiness item: "Frontend Tests: 0 files").
- Fixed the Vitest setup so the suite actually executes: `src/test/setup.ts`
  now imports `@testing-library/jest-dom/vitest` instead of the bare
  `@testing-library/jest-dom`, which called `expect.extend()` before Vitest's
  `expect` existed and crashed all 4 test files with
  `ReferenceError: expect is not defined`.
- Wired `npm test` (vitest run) into `.github/workflows/ci.yml` as a mandatory
  step in the `frontend` job, between lint and the tsc/vite build, so client
  regressions fail the pipeline instead of shipping silently.
- Added coverage for the highest-risk client logic:
  - **`api` client**: instance config (baseURL, `withCredentials`, JSON
    content-type), CSRF `X-CSRF-Token` attach on mutating requests, CSRF
    exemption for login/register/forgot/reset/billing-webhook, no CSRF on GET,
    and error propagation.
  - **`buildStore`**: full build state machine — `startBuild`, `agent_start`/
    `agent_complete`, `stream_token` accumulation, `file_update` merge/delete,
    `build_complete` (QA score / credits / files), `build_failed`, `debug_start`
    (debugging state + iteration), and `reset`.
  - **`authStore`**: demo-mode `login`/`register`/`logout` session lifecycle.
  - **`SummaryChip`** component render.

### Bugs Fixed

- **P1 — broken test harness**: `expect is not defined` on every test file due
  to the wrong jest-dom import path. Resolved by using the Vitest-specific
  entry so matchers bind to Vitest's `expect`.

### Files Changed

- `frontend/src/test/setup.ts` — corrected jest-dom import for Vitest.
- `frontend/src/lib/api.test.ts` — added CSRF + error-propagation cases.
- `frontend/src/store/buildStore.test.ts` — added state-machine cases.
- `frontend/src/store/authStore.test.ts` — added register case.
- `.github/workflows/ci.yml` — added `npm test` gate to the `frontend` job.

### Testing Coverage

- **20 frontend tests passing** across 4 files (`vitest run`, jsdom).
- `npm run lint` clean; `npm run build` (tsc + vite) green — test files
  type-check under the strict tsconfig.

### Risks

- Test suite is green in jsdom but does not yet cover routing/components that
  need a full browser or the live backend; that follows as component/E2E tests
  (FE-006 analytics, remaining critical-route component tests).

### Breaking Changes

- None (test infrastructure + CI config only).

## 2026-07-07 — Fix Secret Scanning Pipeline (P0)

### Features Added

- Restored real secret-scanning enforcement. The `secret-scanning.yml` job now
  passes on every run and actually detects credential URLs.
- Added `mongodb://` / `redis://` credential-URL detection to the grep fallback
  in both `secret-scanning.yml` and `scripts/git-hooks/pre-commit` (git-secrets'
  `-w` scan could never match URL patterns).

### Bugs Fixed

- **P0 — secret-scan job red on every run**: committed dummy/test values
  (`sk_live_test123456789`, `sk_live_1234567890abcdef`, `secret=secret` in
  `auth.py`, the pre-commit hook's own regex literals) failed the `git secrets
  --scan` step. Expanded `.gitallowed` with narrow, anchored exemptions.
- **P0 — credential URLs silently missed**: git-secrets scans with `grep -w`, so
  `mongodb://user:pass@host` / `redis://:pass@host` never matched (verified with
  a real `mongodb://admin:s3cr3tP@ssw0rd@host` URL). The grep fallback now covers
  them with portable POSIX patterns.
- **Pre-commit hook dead fallback**: its `SECRET_PATTERNS` had inline `# comments`
  that broke the combined `grep -E` regex; cleaned and extended with URL patterns.
- Made git-secrets install robust on `ubuntu-latest` (install `make` before the
  clone+`make install` fallback, since `git-secrets` is not in apt).

### Files Changed

- `.gitallowed` — expanded false-positive exemptions.
- `.github/workflows/secret-scanning.yml` — robust install; rewritten grep
  fallback with URL patterns + file/line allowlists.
- `scripts/git-hooks/pre-commit` — cleaned `SECRET_PATTERNS` (no inline comments),
  added URL patterns + `ALLOW_LINE`.

### Testing Coverage

- `git secrets --scan` (whole repo) → exit 0 (was 1).
- Negative test: real `sk_live_<random>` still flagged (no over-exemption).
- Grep-fallback simulation: real mongo/redis URLs flagged; dummy keys and
  `.env.example` (`CHANGE_ME`) correctly exempted.
- `bash -n` on the hook and YAML validation on the workflow both pass.

### Risks

- credential-URL detection covers changed files only (git-secrets' `-w`
  limitation); a pre-existing committed credential URL would need a one-time
  history cleanup (out of scope).

### Breaking Changes

- None (CI/hook config only).

## 2026-07-07 — Frontend CI Pipeline Verified Green

### Features Added

- Verified the frontend CI job end-to-end by reproducing its exact commands
  (`npm ci`, `eslint .`, `npm audit --omit=dev --audit-level=high`,
  `tsc && vite build` with the `export_ws_events.py` prebuild). All pass.

### Bugs Fixed

- None — the frontend pipeline was already green (no source/config change
  required).

### Files Changed

- None (verification milestone only).

### Testing Coverage

- Frontend CI command chain reproduced locally: `npm ci` (lockfile in sync),
  `npm run lint` (clean), `npm audit --omit=dev` (0 vulnerabilities),
  `npm run build` (tsc + vite build succeeded; prebuild generator ran clean).

### Risks / Gaps Logged

- **No frontend test automation**: no vitest/jest, zero `*.test.*` files, and CI
  runs no frontend tests. P1 testing gap — **RESOLVED 2026-07-07** (see
  "Frontend Test Infrastructure" entry above): 20 vitest tests now run as a
  blocking CI gate.
- **`secret-scanning.yml` likely broken** (installs `git-secrets` via brew/apt
  on ubuntu) — P0 security-pipeline gap; separate workflow, out of scope here.
- Dev-only npm advisories (vite/esbuild) remain; excluded by CI's
  `--omit=dev` scope; need a dedicated vite bump regression pass.

### Breaking Changes

- None.

## 2026-07-07 — Restore Green CI Quality Gate (P0)

### Features Added

- Repaired the broken CI `quality-gate` so the backend test suite actually runs
  and the production-config contract is enforced end-to-end.
- Fixed the CI lint gate (`ruff --select F,E9`) which was red on committed code.

### Bugs Fixed

- **Backend tests never ran in CI** (P0): the `Run backend tests` step omitted
  `CI_TEST_MODE`/`TESTING`, so `Settings()` validation aborted collection for
  every test. Added `CI_TEST_MODE: "true"` + `TESTING: "true"` to the step.
- **Production config smoke test failed** (P0): `APP_ENV=production` was set
  with a MongoDB URL missing `replicaSet=rs0`, violating the app's own strict
  validator. Added `replicaSet=rs0` to the URL.
- **prod-artifacts image import failed** (P0): same missing `replicaSet=rs0`
  URL. Fixed.
- **Migration script correctness bug**: `scripts/migrate_field_encryption_key.py`
  used a duplicated `"$ne"` key (`{"$ne": None, "$ne": ""}`), where the second
  silently overwrote the first, dropping the null-check. Replaced with
  `{"$nin": [None, ""]}`.
- Removed unused imports and an unused unpacked variable flagged by ruff.

### Files Changed

- `.github/workflows/ci.yml` — test step env + `replicaSet=rs0` in two URLs.
- `backend/scripts/migrate_field_encryption_key.py` — dead imports removed;
  `$nin` query fix.
- `backend/tests/test_ai_cost_tracking_wired.py` — dropped unused `kwargs`.

### Testing Coverage

- Backend suite: **291 passed** under the corrected CI command.
- `ruff check . --select F,E9` — all checks passed.
- Production-config and prod-image import reproduced locally and verified.

### Risks

- `CI_TEST_MODE=true` in the test step relaxes config validation; scoped to that
  step only. `conftest.py` left untouched so strict-validation tests still hold.

### Breaking Changes

- None (CI configuration + one-off script only).

## 2026-07-07 — Backlog Verification & Hygiene Pass (tracker reconciled)

### Features Added

**Reconciled the stale backlog/audit tracker against the current codebase.**
The security P0/P1 audit appendix and `ENGINEERING_BACKLOG.md` listed many open
items that are in fact already resolved in code; the docs had not been updated
as the app was hardened. This pass re-verified the open items against the source
and marked the confirmed-resolved ones, each with a code reference
(file:line) so the claim is auditable.

- All 9 open **SEC-xxx** security items marked RESOLVED in
  `ENGINEERING_BACKLOG.md`: SEC-003 (WebSocket short-lived token auth),
  SEC-005 (JTI blacklist), SEC-006 (pbkdf2 reset tokens), SEC-008 (email
  verification), SEC-009 (sanitized + fixed-structure admin search), SEC-010
  (`sanitize_string` defined), SEC-011 (per-email auth rate limits), SEC-012
  (webhook URL SSRF guard + Stripe signature verification), SEC-013
  (config-driven CORS allowlist).
- Confirmed resolved earlier this engagement / in the working tree: P0-HIGH-004
  (container-kill ownership), P0-HIGH-005 (path traversal), P0-HIGH-009 (XFF
  trusted-proxy), P0-HIGH-010 (CSRF wired), INF-007 (per-user rate limiting),
  DB-002 (migration runner), plus BE-002/003/005/008/010/011/012 and INF-005
  (MongoDB backup/restore manifests).

### Files Changed

- `ENGINEERING_BACKLOG.md` — 9 SEC-xxx sections updated to RESOLVED with code
  references.

### Testing Coverage

- No code change. Backend suite remains **288 passed** (verified green;
  untouched this pass).

### Risks

- Items not individually re-verified this pass (BE-001, BE-004, BE-007,
  FE-001..007, AI-002..007, INF-008, DB-003, DEVOPS-002..006) are left
  OPEN by default and should be verified before being closed. TEST-001 is now
  RESOLVED (frontend test suite + CI gate added 2026-07-07). This pass does
  not over-claim.

### Breaking Changes

- None (documentation only).

### Migration Notes

- None.

---

## 2026-07-07 — DB-002: Versioned Database Migration Runner

### Features Added

**Closed DB-002 — Forge had no versioned, tracked database migration
mechanism.** Schema/index changes were implicit via
`core.database._ensure_indexes` at startup, with no record of what had been
applied and no orderly way to run versioned data backfills. Added a lightweight,
idempotent migration runner (`backend/core/migrations.py`) purpose-built for
MongoDB (Alembic is SQL-oriented and a poor fit here):

- `@migration(version, name, description)` registers a coroutine.
- `run_migrations(db)` runs only not-yet-applied migrations in ascending version
  order; each is recorded in the `__forge_migrations` collection (version, name,
  status, finished_at) for auditability.
- Execution is best-effort and non-fatal: a failing migration is logged and
  recorded as `failed` and skipped, so it never blocks app startup. `run_migrations`
  itself never raises (fully guarded, safe even against a degenerate DB).
- Wired into `main.py`'s `lifespan` so migrations run automatically on every
  deploy/restart.
- Ships two safe, idempotent data-backfill migrations: default `plan="free"` and
  `banned=false` where those fields are missing, preventing entitlement/flags
  gaps for users created before those fields existed.

### Files Changed

- `backend/core/migrations.py` — new runner + two backfill migrations.
- `backend/main.py` — `lifespan` calls `run_migrations(db)` (best-effort).
- `backend/tests/test_migrations.py` — new suite (4 tests).

### Testing Coverage

- `tests/test_migrations.py` (4 tests): migrations apply exactly once and are
  skipped on re-run (idempotent); missing `plan`/`banned` are backfilled while
  existing values are untouched; a failing migration is recorded `failed` and the
  runner continues; `run_migrations` never raises even against a broken DB.
- Full backend suite: **288 passed** (was 284; +4 new), no regressions.

### Risks

- Migrations are forward-only (no automatic rollback); a "rollback" is a
  compensating migration. The recorded `failed` status plus idempotent re-run
  covers the common recovery path. `core.database._ensure_indexes` is retained
  for index provisioning; the runner is the forward path for new changes.

### Breaking Changes

- None. The runner is additive; existing index provisioning is unchanged.

### Migration Notes

- No migration needed to adopt this: the `__forge_migrations` collection is
  created on first run. New schema/data changes should be added as new
  `@migration` entries rather than ad-hoc startup code.

---

## 2026-07-07 — INF-007: Per-User Rate Limiting (closed IP-rotation bypass)

### Features Added

**Closed INF-007 — authenticated requests are now rate-limited per account, not
just per source IP.** `rate_limit_middleware` previously keyed every limit by
`rl:{zone}:{client_ip}`, so a logged-in user could evade the limit by rotating
client IPs and exhaust shared resources (builds, API calls) per-account without
tripping it. The middleware now decodes the `access_token` cookie's `sub` claim
and keys authenticated requests as `rl:{zone}:user:{sub}`; unauthenticated
requests stay IP-keyed. The decode is lazy (no DB) and any missing/invalid token
falls back to IP-keying, so the behavior is safe-by-default. The change applies
to both the Redis-backed path and the in-memory fail-closed fallback, and the
existing `X-RateLimit-Limit` / `X-RateLimit-Remaining` headers and 429 body are
unchanged.

- `backend/core/security.py` `rate_limit_middleware` — compute `identity`
  (`user:{sub}` when a valid access token is present, else `client_ip`) and key
  the limit on it; the rate-limit `security_event` metadata now records
  `identity`.
- `backend/tests/test_per_user_rate_limit.py` — new suite (3 tests).

### Testing Coverage

- `tests/test_per_user_rate_limit.py` (3 tests): the same account from two
  different IPs shares one counter and hits 429 together (proving the limit is
  per-account, not per-IP); distinct accounts have independent counters;
  unauthenticated requests remain IP-keyed; a present-but-invalid token falls
  back to IP-keying without crashing.
- Full backend suite: **284 passed** (was 281; +3 new), no regressions.

### Risks

- Plan-tier differentiated limits and per-user concurrent-request limits
  (sub-criteria in the backlog entry) are **not** part of this fix; the
  per-account keying closes the actual security gap (IP-rotation bypass). Plan
  differentiation is a separate, larger change requiring per-plan limit lookup
  on each request.

### Breaking Changes

- None. Key format only changes for authenticated requests; anonymous traffic
  is unaffected.

### Migration Notes

- No migration. The limiter keys are runtime Redis/in-memory state.

---

## 2026-07-07 — BE-009: Audit Logging on Critical Operations

### Features Added

**Closed BE-009 — attributable, append-only audit trail for user-facing
critical operations.** Admin actions (user update, credit adjust, user export)
were already audited, but project deletion, API key create/delete, webhook
create/delete, and account deletion wrote nothing. Added a shared, DRY helper
and wired it into all of them; the helper also captures the client IP and
user-agent (the prior admin writes omitted these — audit appendix P2-LOW-002),
so every entry is fully attributable for forensics and compliance.

- `backend/core/audit.py` — new `record_audit_log(db, request, actor, action,
  resource_type, resource_id, changes)` building an `AuditLog` from request
  context (`actor` id/email, client IP via `get_client_ip`, `user-agent`).
- `backend/api/projects.py` `delete_project` → `delete_project`.
- `backend/api/api_keys.py` `create_api_key` → `create_api_key` and
  `delete_api_key` → `delete_api_key` (raw key never logged, only metadata).
- `backend/api/webhooks.py` `create_webhook` → `create_webhook` and
  `delete_webhook` → `delete_webhook`.
- `backend/api/gdpr.py` `delete_user_data` → `delete_account` (cascade counts
  recorded in `changes`).
- Retention/retrieval already existed: `audit_logs` indexes (actor+created_at,
  1-year TTL) in `core/database._ensure_indexes` and the admin
  `GET /admin/audit-logs` viewer.

### Bugs Fixed

- `api/api_keys.create_api_key` omitted `expires_at` from the stored doc when
  `expires_in_days` was `None`, so the `ApiKeyResponse` contract failed and the
  endpoint 500'd whenever a key was created without an expiry. Added a `None`
  default.

### Files Changed

- `backend/core/audit.py` — new shared helper.
- `backend/api/projects.py`, `backend/api/api_keys.py`,
  `backend/api/webhooks.py`, `backend/api/gdpr.py` — wired audit calls.
- `backend/tests/test_audit_logging.py` — new suite (5 tests).
- `ENGINEERING_BACKLOG.md` — BE-009 marked resolved.

### Testing Coverage

- `tests/test_audit_logging.py` (5 tests): helper captures actor/IP/UA and
  tolerates a missing request; each critical op (project delete, API key
  create+delete, webhook create+delete) writes exactly one `AuditLog` with the
  expected `action`/`resource_id`/`changes`.
- Full backend suite: **281 passed** (was 276; +5 new), no regressions.

### Risks

- Audit writes are best-effort inserts; a failure surfaces as a 500 on the
  mutating request (trivial insert). Retention bounded by the existing 1-year
  TTL.

### Breaking Changes

- None. Audit entries are additive; no API/schema change.

### Migration Notes

- No migration. `audit_logs` indexes are already provisioned at startup.

---

## 2026-07-07 — INF: MongoDB HA Connection Contract + Restore/DR (R-001 / R-025)

### Features Added

**Closed the real gap behind the (stale) R-001 / R-025 risks.** On inspection
the 3-node MongoDB replica set and daily backup CronJob already exist in
`k8s/`, but the application/backup **connection-string contract did not require
`replicaSet=rs0`**. A production `MONGODB_URL` without `replicaSet` makes the
Motor driver treat the seed as a standalone and silently lose failover — the
HA deployment defeated by a missing query parameter.

- `backend/core/config.py` `check_mongodb_url` now **requires `replicaSet=`**
  (expecting `rs0`) in non-development `APP_ENV`, failing fast at startup with
  a clear message. Development remains standalone-friendly.
- `k8s/mongodb.yaml`: replica-init Job is now **idempotent** (checks
  `rs.status().ok`, initiates only if unconfigured) and auto-cleans via
  `ttlSecondsAfterFinished`. Added a `PodDisruptionBudget` (minAvailable: 2) so
  node drains/upgrades never drop quorum.
- `k8s/mongodb-restore-job.yaml` (new): parameterized `mongorestore --drop
  --gzip` Job reusing the `mongodb-url` secret, with S3-pull support and an
  embedded runbook, so DR is finally **testable** (closes R-025).
- `k8s/mongodb-backup-cronjob.yaml`: added `ttlSecondsAfterFinished` for pod
  cleanup.

### Files Changed

- `backend/core/config.py` — `replicaSet=` requirement in `check_mongodb_url`.
- `backend/tests/test_config_validation.py` — 3 new/updated URL tests.
- `k8s/mongodb.yaml` — idempotent init Job, PDB, TTL.
- `k8s/mongodb-restore-job.yaml` — new restore Job.
- `k8s/mongodb-backup-cronjob.yaml` — backup pod TTL.
- `RISK_REGISTER.md` — R-001 and R-025 marked mitigated/closed.

### Testing Coverage

- `tests/test_config_validation.py` (10 tests): production requires
  `replicaSet=rs0`; production accepts a correct rs0 URL; dev stays standalone;
  localhost rejected (updated to carry `replicaSet`); existing Stripe/encryption
  gates unchanged.
- Full backend suite: **276 passed** (was 273; +3 new), no regressions.
- k8s manifests validated for YAML parseability (multi-doc).

### Risks

- Operators must add `?replicaSet=rs0` to `MONGODB_URL` and the backup
  `mongodb-url` secret; the validation now fails fast if forgotten.
- MongoDB wire **TLS** (audit P1-MED-001) remains out of scope this session.
- A live-cluster restore drill was not executed here (no cluster); a staging DR
  drill is recommended as an operational habit.

### Breaking Changes

- Production `MONGODB_URL` must now include `replicaSet=rs0`. Plain standalone
  URLs are rejected at startup in production (correct, since the deployed
  cluster is `rs0`).

### Migration Notes

- No data migration. Update the `MONGODB_URL` / `mongodb-url` secret to append
  `?replicaSet=rs0` before the next prod deploy; the new validation enforces it.

---

## 2026-07-07 — SEC: Deployment/Sandbox File Path Traversal Fix (P0-HIGH-005)

### Bugs Fixed

**Closed a file-path-traversal / arbitrary-file-write vulnerability in the
build deployment and sandbox-validation file-materialization paths.** Build
"files" are keyed by a path taken from untrusted LLM/agent output. The
deployment and sandbox code wrote each file with a bare
`os.path.join(temp_dir, path)`, so a malicious path such as
`../../etc/cron.d/evil`, `../.ssh/authorized_keys`, or an absolute
`/etc/passwd` escaped the temp directory and let the worker process overwrite
arbitrary host files with attacker-controlled content. This was a documented
deployment-blocking P0-HIGH item (original security-audit appendix
P0-HIGH-005).

- Added `is_safe_relpath(path)` and `safe_join_path(base_dir, path)` to
  `backend/core/security.py`. `safe_join_path` rejects empty, absolute, and
  `..`-escaping paths, then re-resolves with `os.path.abspath` and verifies the
  final path is `base_dir` or strictly beneath it, returning `None` on any
  violation.
- `backend/api/deployments.py` (`_run_deployment_background` docker build and
  `_github_push_background`) and `backend/sandbox/runner.py`
  (`SandboxRunner.run`) now go through `safe_join_path` and **skip** any unsafe
  entry (with a warning log) instead of writing outside the sandbox.

### Files Changed

- `backend/core/security.py` — added `is_safe_relpath`, `safe_join_path`.
- `backend/api/deployments.py` — both file-write loops use `safe_join_path`;
  added `logging` import.
- `backend/sandbox/runner.py` — `run()` write loop uses `safe_join_path`.
- `backend/tests/test_path_traversal_deploy.py` — new suite (12 tests).

### Testing Coverage

- `tests/test_path_traversal_deploy.py` (12 tests): relpath acceptance,
  rejection of `..` / absolute / empty / `.`; `safe_join_path` containment for
  normpath tricks; end-to-end materialization skips a `../../outside.txt` entry
  and leaves the sibling host file unwritten, while a safe `src/app.py` is
  written inside the sandbox.
- Full backend suite: **273 passed** (was 261; +12 new traversal tests), no
  regressions.

### Risks

- A path that normalizes back inside the base (e.g. `a/../b` → `b`) is accepted
  — correct, since it cannot escape. The hard guarantee is the `abspath`
  containment check, not the textual `..` scan.
- Only the deployment target (Linux/Docker/k8s) is in scope; on Linux a
  Windows-style path is an ordinary contained filename.

### Breaking Changes

- None for valid inputs. A build containing a path that escapes the sandbox
  directory will now have that file skipped (previously it would have been
  written to wherever the path resolved — a security hole).

### Migration Notes

- No migration required. The change is additive (`safe_join_path` returns
  `str | None`).

---

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
