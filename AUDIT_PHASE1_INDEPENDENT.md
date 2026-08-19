# Forge AI — Phase 1 Independent Audit & Completion Plan

**Audit date:** 2026-08-20 · **HEAD:** `482ddb78` · **Method:** source-code verification only, ~127K LOC examined across backend, frontend, orchestration, orchestration-engine, k8s, CI/CD, scripts, docs. Every claim cites evidence. Anything unverifiable is marked **Unknown**.

---

# 1. Executive Summary

Forge AI is a **real, working multi-agent AI app builder** — not a demo. The build pipeline (architect → designer → developer → integration → PM validation → debug loop) runs in production via Celery, streams to the UI over authenticated WebSockets, persists incrementally to MongoDB, and passes through sandbox validation + moderation. The LLM layer is genuinely sophisticated: 8 provider adapters, model routing with fallbacks, Redis circuit breaker, budget manager, BYOK, prompt-injection guardrails, structured-output repair.

It is also **not production-safe yet**. A plaintext admin password sits in git history (`reg_payload.json`), **MongoDB backups are silently broken in production** (3 compounding bugs → zero working backups), deployments are not gated on CI, live production has no monitoring or alerting, 47 backend tests fail, and the Google OAuth login flow strands users on a blank page.

**Overall health: 66.8/100 — CONDITIONAL BETA.** The core product claim is true and well-engineered; the operational layer (backups, observability, release discipline) and a small set of critical defects block production readiness.

## Top Risks
1. **CRITICAL:** Plaintext admin credential committed to git (`reg_payload.json`).
2. **CRITICAL:** No functioning backups — `docs/disaster_recovery.md` describes a system that does not run.
3. **HIGH:** Red CI still ships to production (deploy workflows don't depend on CI).
4. **HIGH:** Google OAuth login broken in the browser flow.
5. **HIGH:** 47 backend + 6 frontend tests failing.

## Top Priorities
1. Rotate the leaked admin credential, purge `reg_payload.json`, add secret-scanning to the pre-commit gate.
2. Fix the three backup bugs (crontab overwrite, import path, verify path) and prove restore works.
3. Gate deploys on CI (`needs: ci`).
4. Fix the 53 failing tests (deterministic fixes, most are test-vs-implementation ordering/async issues).
5. Fix Google OAuth redirect; make frontend tests hermetic.
6. Stand up live observability (scrape `/metrics`, Sentry DSN, alert on backup failure).

---

# 2. Detailed Scores

| # | Category | Score | Weight | Weighted | Key evidence |
|---|----------|-------|--------|----------|--------------|
| 1 | Product | 72 | 10% | 7.2 | Real pipeline, streaming, PM layer, marketplace; read-only editor, no e2e-validated journey, fake marketing stats |
| 2 | Architecture | 74 | 10% | 7.4 | Clean layering, WS pub/sub, resume, drain; 56-file dead `orchestration/` package, legacy duplicate state, two parallel prod backends |
| 3 | AI System | 80 | 10% | 8.0 | 8 providers, circuit breaker, budget mgr, BYOK, guardrails, prompt versioning; no real RAG, no tool calling, regex evals |
| 4 | Agent System | 68 | 8% | 5.4 | 16 live agents, debug loop, interactive gates; QA/Security/DevOps are templates only, sequential-only in build |
| 5 | Backend | 76 | 10% | 7.6 | Strong auth/CSRF/rate-limit/encryption/migrations; 47 failing tests, missing `await`, payment oracle |
| 6 | Frontend | 65 | 8% | 5.2 | Polished, accessible, generated WS contracts; broken Google OAuth, non-hermetic tests, 1.44MB chunk |
| 7 | Security | 62 | 12% | 7.4 | History scrubbed, guardrails strong; **plaintext admin password in git**, CORS over-permissive, fail-open webhooks |
| 8 | Infrastructure | 55 | 10% | 5.5 | Strict compose secrets, good CI; **broken backups**, no monitoring, no rollback automation, Render frontend build broken |
| 9 | Testing | 58 | 8% | 4.6 | 1,029 backend tests + 60% gate; zero e2e, no frontend coverage gate, no load-test execution, no pentest |
| 10 | Performance | 55 | 5% | 2.8 | Load tooling exists, never run against live; 424KB gzip launch chunk; no live validation |
| 11 | Observability | 50 | 5% | 2.5 | `/metrics`, health, request-IDs, optional Sentry; nothing scraped, no dashboards, backup logs dead-end |
| 12 | Documentation | 78 | 4% | 3.1 | Excellent, unusually honest; stale claims: Cloud Run "done", k8s as live target, no git tags/versioning |
| | **Overall** | | **100%** | **66.8/100** | |

**Readiness: BETA** (not Release Candidate: CRITICAL secrets breach, broken backups, un-gated deploys, 53 failing tests).

---

# 3. Repository Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Vite/React 18)                  │
│  routes lazy-loaded · Zustand (6 stores) + React Query ·         │
│  Monaco (read-only) · iframe preview (sucrase+unpkg) ·           │
│  WS client (4 hooks, generated wsEvents.ts) · Sentry/PostHog     │
└───────────────┬─────────────────────────────────────────────────┘
                │ HTTPS + WSS (axios w/ CSRF token; ws-token auth)
┌───────────────▼─────────────────────────────────────────────────┐
│              Backend (FastAPI, backend/main.py)                   │
│  /v1 API: auth, builds, projects, billing(Stripe/Razorpay/        │
│   Cashfree), admin, initiatives, marketplace, deployments, ...    │
│  Middleware: TrustedHost, CORS, CSRF, rate-limit, request-ID,     │
│   timeout, drain, metrics                                         │
│  MongoDB (core/database.py) + Redis (queues, leases, CB, pubsub)  │
└───┬──────────────┬───────────────────┬───────────────────────────┘
    │ apply_async  │ HTTP (SSE-style)  │ Review Board (orchestrator/)
    ▼              ▼                   ▼
┌────────────┐ ┌──────────────────┐ ┌─────────────────────────────┐
│ Celery     │ │ Orchestrator     │ │ orchestrator/ (live, :8100)  │
│ build queue│ │ core/orchestrator│ │ read-only fan-out review →    │
│ acks_late, │ │ .py (744 lines): │ │ CTO consolidate → Mongo       │
│ resume,    │ │ architect→business│ │ Anthropic-only, haiku-4.5    │
│ dead-letter│ │ →designer→developer│ │ wired at SECURITY_REVIEW     │
│            │ │ (stream)→integration│ │                             │
│            │ │ →PM validate→debug │ │ ┌───────────────────────┐   │
│            │ │ loop (≤3)→done     │ │ │ orchestration/ (dead) │   │
│            │ └──────────────────┘  │ │ │ 56 files, workflow    │   │
│            │  16 agents (agents/)  │ │ │ engine, event bus —   │   │
│            │  LLM router (8 prov.) │ │ │ never instantiated    │   │
└────────────┘                      └─┴─┴───────────────────────┴───┘

Deploy paths: VPS docker-compose (deploy.yml) AND Render (render.yaml)
  AND Cloudflare Pages (deploy-cloudflare.yml) — three frontends to main.
k8s/ = aspirational, explicitly not live (k8s/README.md).
```

---

# 4. Feature Matrix (Phase 1)

| Requirement | Status | Evidence |
|---|---|---|
| AI application generation | ✅ | `backend/core/orchestrator.py` run_build; `POST /builds` → Celery |
| Existing repository understanding | 🟡 35% | `context_engineer/retriever.py` falls back to **simulated chunks**; no vector DB; `retrieval/` wired only to API, not agents |
| Repository editing | ✅ 90% | `persist_files` incremental writes to `build_files`; `DeveloperAgent.patch_files` debug loop |
| Full-stack generation | ✅ | developer_v1 template: React+Vite+Tailwind / FastAPI+Mongo+JWT |
| Multi-agent orchestration | 🟡 60% | 16 agents but **sequential only** in build; QA/Security/DevOps = templates without classes |
| Streaming execution | ✅ | 15 WSEventTypes (`core/models.py:485`), `stream_token`, Redis pub/sub bridge |
| Production-grade architecture | 🟡 60% | Strong internals; broken backups, no monitoring, no rollback automation |
| Background execution | ✅ | Celery `acks_late`, dead-letter, `stop_grace_period 630s`, drain |
| WebSockets | ✅ | ws-token auth pre-accept (4001), reconnection, 5MB cap |
| Secure authentication | 🟡 85% | JWT+CSRF+MFA+lockout+blacklist ✅; **Google OAuth UI broken** |
| Project persistence | ✅ | MongoDB models + versioned migrations (v1–v4) |
| Workspace management | ✅ | Projects, orgs/RBAC, workspace UI |
| File editing | 🟡 55% | Generation/patching work; **editor is read-only** — no user editing |
| Deployment pipeline | 🟡 50% | Docker-only provider, opt-in `DEPLOYMENTS_ENABLED`; no rollback |
| Error recovery | ✅ 90% | Resume-aware steps, dead letter, retries, 30s drain |
| Validation pipeline | ✅ | Sandbox `tsc --noEmit`+python checks, CSP injection, moderation scan |
| Security checks | ✅ 85% | Guardrails, SSRF guard, path-traversal, prompt-injection tests |
| Testing pipeline | 🟡 50% | Backend strong; zero e2e; frontend no gate; load/pentest never run |
| Documentation generation | 🟡 20% | Research agent template exists; **no docs agent in build pipeline** |

**Count: ✅ 11 · 🟡 7 (weighted) · ❌ 0 → Phase 1 ≈ 73% complete** (see §7).

---

# 5. Production Readiness Matrix

| Blocker | Severity | Blocks | Evidence |
|---|---|---|---|
| Plaintext admin password in git (`reg_payload.json`) | **CRITICAL** | Go-live | commit `769c8b5d`; same email is `ADMIN_EMAILS`-allowlisted |
| No working MongoDB backups (3 bugs) | **CRITICAL** | Go-live, DR | `docker-compose.prod.yml:214-217`, `backup_mongodb.py:7`, `:32` |
| Deploys not gated on CI | HIGH | Release discipline | `deploy.yml` has no `needs: ci` |
| 47 backend tests failing | HIGH | Confidence, CI quality | pytest run 2026-08-20 (1029 pass / 47 fail) |
| Google OAuth strands user | HIGH | Signup/login funnel | `GoogleCallback.tsx:10-33` (popup protocol after full-page redirect) |
| No monitoring/alerting in live prod | HIGH | Ops | `/metrics` un-scraped; no Sentry DSN in compose |
| Live Redis open to `0.0.0.0/0` (Render) | HIGH | Security | `render.yaml:5-7` |
| Render frontend service cannot build | MEDIUM | One of three deploy paths broken | `frontend/Dockerfile:20-21` needs build args; Render passes runtime env |
| k8s manifests cannot deploy as written | MEDIUM | Future scaling | literal `${IMAGE_TAG}`, port 3000 vs nginx 80, undefined secrets |

**Verdict: BETA — do not market as production-ready.**

---

# 6. Security Report

## Critical vulnerabilities
| # | Finding | Severity | Evidence |
|---|---|---|---|
| S-01 | Plaintext admin password committed to git | CRITICAL | `reg_payload.json` (@HEAD, commit `769c8b5d`) |
| S-02 | CORS `allow_origin_regex=.*\.pages\.dev` + credentials | P1 | `backend/main.py:216-228` — any Pages site can credentialed-request; CSRF mitigates writes |
| S-03 | `POST /cashfree/verify` — unauthenticated payment oracle | P2 | `api/cashfree.py:247` returns order PAID status to anyone |
| S-04 | Cashfree/Razorpay webhooks **fail-open** when secret unset | P2 | `cashfree.py:261`, `razorpay.py:147` return `skipped` |
| S-05 | `api/initiatives.py:197` — `_check_initiative_rate_limit` **missing `await`** → never enforced | P2 | RuntimeWarning in tests |
| S-06 | `GET /metrics` unauthenticated | P3 | `main.py:476` |
| S-07 | WS token in query string (build socket) | P3 | `useBuildSocket.ts:63` vs subprotocol in `usePMSocket.ts:63` |
| S-08 | `dump.rdb` (Redis dump) + 452MB `google-cloud-sdk/` untracked at repo root | P3 | `git status` |

## What is genuinely good
- Git history scrubbed of real keys (SEC-002 `1372ec3c`); `.gitallowed` narrow (89 lines).
- Compose files use `${VAR:?}` everywhere — zero hardcoded secrets.
- `k8s/secrets.yaml` is placeholder-only.
- SSRF guard on BYOK base URLs + tests (`test_byok_ssrf.py`); path-traversal tests; prompt-injection detection with obfuscation stripping (`router.py:39-113`).
- Live `.env` files on disk are gitignored (`.gitignore:2`), mode-600 where set.

## Recommendations
1. Rotate the admin password now (it's likely the real account — email is allowlisted). 2. Delete + `git-filter-repo` purge `reg_payload.json`. 3. Make webhooks fail-closed or 500 when secret missing. 4. Narrow CORS to the actual frontend origin + `allow_origin_regex` removal. 5. Auth on `/metrics` (or scrape token). 6. Add `await` fix + test. 7. Move WS token to subprotocol. 8. Delete `dump.rdb`/gcloud dir, gitignore them.

---

# 7. Phase 1 Completion

**Overall: 73%** (weighted from §4: 11 full + 7 partials at 0.20–0.90).

Evidence-backed per-requirement estimates:
- **Complete (11/19):** AI generation, repo editing, full-stack generation, streaming, background execution, WebSockets, project persistence, workspace mgmt, error recovery, validation pipeline, security checks.
- **Partially complete (7/19):** existing-repo understanding (35% — simulated retrieval), multi-agent orchestration (60% — sequential, missing QA/Sec/DevOps classes), production-grade architecture (60% — ops layer broken), secure auth (85% — Google OAuth UI), file editing (55% — read-only editor), deployment pipeline (50% — docker-only, no rollback), testing pipeline (50% — no e2e), documentation generation (20% — template only).
- **Missing (0/19):** none entirely — the foundation for all 19 exists, which is why this is 73%, not lower.

**Weighted adjustment for brokenness:** 47 failing tests, broken Google OAuth, broken backups, broken Render frontend path, dead `orchestration/` package (56 files shipping misleading architecture) → −7 points → **73%**.

---

# 8. Gap Analysis (everything remaining)

**Must-fix before any release:**
1. Rotate leaked credential + purge file (S-01).
2. Fix backups: single `crontab -` (prod `:214-217`, staging `:170-173`), remove `core.config` import from `backup_mongodb.py:7`, create `/backups/latest` symlink, honor `BACKUP_RETENTION_DAYS` (:32 hardcodes 7).
3. `needs: ci` on `deploy.yml` + `deploy-staging.yml`.
4. Fix 47 backend failures: `test_project_limits` (422 vs 402 ordering), `test_cashfree` (TypeError/AsyncMock), `test_deployment_health_check` (6), `test_free_first_build` (5), `test_org_ws_manager` (4), `test_review_board_bridge` (3), `test_global_exception_handler` (2), logout blacklist, dead_letter KeyError, pagination, audit_logging, celery_tasks, deployment_service, route_auth_coverage.
5. Google OAuth: navigate to `/projects` (or reopen popup protocol) in `GoogleCallback.tsx`; add e2e proof.
6. Make frontend tests hermetic (vitest must not read `.env.local` — set `env` in `vitest.config.ts`).
7. Fix missing `await` (initiatives.py:197) + test.
8. Monitor: add Prometheus scrape (compose service or external), Sentry DSN, backup-failure alert (existing `docs/integrations/monitoring_webhook.md` + `monitoring_webhook` service).
9. Close CORS to actual origins; make webhooks fail-closed; auth `/metrics`.
10. Truth-check README (remove "GCP Cloud Run ✅", k8s as live path) + remove `FORGE_TASKS.md` stale queue.

**Phase-1 completion items:**
11. Add QA + Security agent classes to the build pipeline (templates exist; Review Board covers only SECURITY_REVIEW, Anthropic-only).
12. Real retrieval: wire `backend/retrieval/` (or vector index) into `context_engineer` — replace simulated chunks.
13. Docs agent in pipeline (research template exists).
14. E2E suite (login → build → deploy) — zero exists.
15. Run `scripts/load_test.py` against staging; record results; tune.
16. Frontend coverage gate (vitest) — currently none.

**Phase-2 prerequisites (see §10).**

---

# 9. Technical Debt Report

| Debt | Evidence |
|---|---|
| `orchestration/` — 56 files, event bus/workflow engine, **never instantiated**, not in compose/images | grep: self-references only; `docker-compose.yml:23` mounts it :ro in dev |
| Two parallel prod backends (VPS compose = "official", Render = real API origin per workflows) | `deploy.yml` vs `deploy-cloudflare.yml:41-42`, `wrangler.toml:7`; no reconciliation doc |
| k8s/ — 15 manifests, unsubstitutable, never applied | `k8s/README.md:3-11`; literal `GHCR_OWNER`, frontend port mismatch, undefined secrets, PVC name mismatch |
| Legacy duplicate state in buildStore (`agents` array + `agentStates` map) | `buildStore.ts:7,76-77` "for backward-compat selectors" |
| Dead frontend code: `remember` checkbox, `VITE_ADMIN_EMAILS` (typed, never read), sidebar constants, `mockData.ts` PROJECTS fallback | `AuthPage.tsx:477-485`, `vite-env.d.ts:6`, `constants.ts:21-51`, `WorkspacePage.tsx:33` |
| Dual animation libs (motion + framer-motion + gsap + animejs + split-type) | 211KB vendor-motion chunk |
| Migration v4 has no downgrade; v3↔v4 duplicate backfills with divergent rollback | `core/migrations.py` (`@downgrade` absent for v4) |
| Two legacy systems coexist: startup index provisioning + versioned migrations | `core/database.py::_ensure_indexes` (documented poisoning bug, `FORGE_AUDIT_LOG.md:108-129`) |
| Fake marketing stats rendered in live mode | `ProjectsPage.tsx:94-99` (48 projects / 99% enterprise-ready), `FlowPage.tsx:14-18` (1,247 builds / 99.9% SLA) |
| Large files | `core/llm/router.py` (1,269 lines), `core/orchestrator.py` (744), `orchestration/benchmark_runner.py` (797) |
| Stale docs: README Cloud Run claim, k8s-as-live, FORGE_TASKS unchecked done-work, PRODUCTION_READINESS "all fixed" vs FORGE_AUDIT_LOG | §5 of docs audit |

---

# 10. Phase 2 Readiness

| Phase-2 capability | Ready? | Blocker |
|---|---|---|
| Enterprise features (SSO/SAML, RBAC orgs) | 🟡 | Orgs/RBAC exist; no SSO; no enterprise auth |
| Marketplace | ✅ | Live (api/marketplace.py + UI) |
| Plugin SDK / tool calling | ❌ | No agent uses tools; adapter support exists only |
| Team collaboration | 🟡 | Team chat + org WS exist; no presence/co-editing; editor read-only |
| Cloud execution (build isolation) | ❌ | Docker provider only; sandbox is static-analysis, not container isolation; `SANDBOX_HOST` service doesn't exist in compose |
| Distributed agents / parallel fan-out | ❌ | Sequential build chain; review board parallelism is review-only |
| Enterprise authentication | ❌ | Email+Google OAuth only; no SAML/SCIM/LDAP |
| Billing | 🟡 | 3 payment providers live; no invoicing/quotas per-seat |
| Scaling | ❌ | Single VPS; k8s unusable; free-tier Render; no autoscaling live |

**Phase-2 hard blockers:** (1) broken backups/DR, (2) no monitoring, (3) un-gated deploys, (4) no e2e, (5) read-only editor + no user-edit model, (6) orchestration/ vs orchestrator/ ambiguity must be resolved (delete or wire).

---

# 11. Prioritized Roadmap

## Milestone 0 — Incident response (0.5 day)
**Goal:** Remove the live credential breach.
- Rotate admin password + all touched credentials; delete `reg_payload.json`; `git-filter-repo` purge; add file to `.gitallowed`-style blocklist & pre-commit hook. Verify history clean.

## Milestone 1 — Data safety (1 day)
**Goal:** Backups actually run and restore.
- Fix `crontab -` overwrite (merge into one invocation), fix import (`backup_mongodb.py:7` → self-contained), add `/backups/latest` symlink + honor `BACKUP_RETENTION_DAYS`, wire backup failure → `monitoring_webhook` alert. Validate with existing CI backup-restore drill + one manual restore on staging.

## Milestone 2 — CI gates & green tests (2 days)
**Goal:** Red CI cannot ship; suites green.
- `needs: ci` on `deploy.yml`/`deploy-staging.yml` (+ concurrency guard). Fix 47 backend failures (list §8.4) + 6 frontend (hermetic vitest env). Add frontend coverage gate (≥60% to start). Re-run: backend 1,029+ pass @ ≥68%, frontend 45 pass.

## Milestone 3 — Core UX fixes (1.5 days)
**Goal:** Login/build journey works for real users.
- Google OAuth redirect fix (`GoogleCallback.tsx`), remove fake stats in live mode, `remember` checkbox wiring or removal, fix `/auth/...` endpoints missing `/v1` (api.ts:93-103), WS token → subprotocol.

## Milestone 4 — Observability live (1 day)
**Goal:** See production.
- Prometheus scrape of `/metrics` (compose or external), Grafana (reuse k8s dashboards), Sentry DSN, alert rules (HighErrorRate, BuildQueueBacklog — port from `monitoring.yaml`), backup alerts.

## Milestone 5 — Security hardening (1 day)
**Goal:** Close the security findings.
- CORS narrowing, fail-closed webhooks, auth `/metrics`, `await` fix, init rate-limit test, `dump.rdb`/gcloud cleanup + gitignore, `.wrangler/` removal commit.

## Milestone 6 — Phase-1 feature completion (5–7 days)
**Goal:** Close the 7 partial requirements.
- QA + Security agents in build chain; wire real retrieval into `context_engineer`; docs agent; e2e suite (Playwright: login → build → gate → deploy); run `load_test.py` on staging and record results; versioning (git tags, backend `__version__`, release notes); README/landing truth pass.

## Milestone 7 — Tech debt & decommission (2 days)
**Goal:** Honest repo.
- Delete or park `orchestration/`; fix or archive `k8s/` (decide Render/VPS/k8s single story; update all docs to match); remove legacy buildStore state + dead frontend code; consolidate animation libs; migration v4 downgrade.

## Milestone 8 — Render reconciliation (1 day)
**Goal:** One deploy story.
- Fix `render.yaml` frontend build (pass build args via Dockerfile change) **or** decommission Render and point Cloudflare Pages at VPS via nginx/Cloudflare proxy; close Redis `0.0.0.0/0`.

---

# 12. Atomic Task Breakdown (top 30, ordered)

| # | Task | Files | Why | Deps | Cx | Hrs | Validation | Rollback |
|---|------|-------|-----|------|----|----|-----------|----------|
| 1 | Rotate admin + affected creds, delete `reg_payload.json` | — (ops) | S-01 breach | none | S | 1 | Cannot login with old password; history scrub verified | N/A (new creds) |
| 2 | Purge `reg_payload.json` from history | git-filter-repo + `scripts/purge-secrets.sh` | S-01 | 1 | M | 1 | `git log --all -S reg_payload` empty; re-clone fresh | re-push from backup |
| 3 | Block file in pre-commit + secret-scanning.yml | `scripts/git-hooks/pre-commit`, `.github/workflows/secret-scanning.yml` | recurrence | 2 | S | 0.5 | commit attempt blocked | revert hook |
| 4 | Fix crontab overwrite (merge both cron lines) | `docker-compose.prod.yml:214-217`, `.staging.yml:170-173` | backup job never runs | none | S | 0.5 | `docker compose config` shows single crontab; log shows 02:00 run | git revert |
| 5 | Fix `backup_mongodb.py` import + retention | `scripts/backup_mongodb.py:7,32` | container lacks `core`; retention mismatch | 4 | S | 1 | run script standalone in alpine container | revert |
| 6 | Add `/backups/latest` symlink + verify fix | `backup_mongodb.py`, `backup_verify.py` | verify job targets nonexistent path | 5 | S | 1 | backup_verify passes | revert |
| 7 | Wire backup failure → monitoring webhook | `docs/integrations/monitoring_webhook.md`, compose env | alert on DR failure | 6 | M | 1 | test webhook fires on forced failure | remove env |
| 8 | Manual restore drill on staging | ops | prove RPO/RTO | 6 | M | 2 | restore to empty DB, checksum match | N/A |
| 9 | `needs: ci` + concurrency on deploy workflows | `.github/workflows/deploy.yml`, `deploy-staging.yml` | red CI ships | none | S | 0.5 | push failing branch → no deploy | revert |
| 10 | Fix `test_project_limits` 422-vs-402 ordering | `backend/api/projects.py`, `tests/test_project_limits.py` | plan-limit check after validation | none | M | 2 | suite green | revert |
| 11 | Fix `test_cashfree` TypeError/AsyncMock | `tests/test_cashfree.py`, `api/cashfree.py` | async mock mismatch | none | M | 2 | green | revert |
| 12 | Fix `test_deployment_health_check` (6) | `tests/test_deployment_health_check.py` + service | flaky/env-coupled | none | M | 2 | green | revert |
| 13 | Fix `test_free_first_build` (5) | `tests/test_free_first_build.py`, `api/builds.py:142-143` | atomic claim race | none | M | 2 | green | revert |
| 14 | Fix `test_org_ws_manager` (4) | `tests/test_org_ws_manager.py`, `api/agent_registry.py:547-565` | missing origin check/test mismatch | none | M | 2 | green | revert |
| 15 | Fix `test_review_board_bridge` (3), dead_letter KeyError, logout blacklist, pagination, exception handler | respective files | correctness | none | M | 2-4 | full suite green | revert |
| 16 | Hermetic frontend tests (vitest env isolation) | `vitest.config.ts`, `useBuildSocket.test.ts`, `authStore.test.ts` | `.env.local` leaks into CI | none | S | 1 | `npm test` green with/without .env.local | revert |
| 17 | Frontend coverage gate | `vitest.config.ts` | no FE gate | 16 | M | 1 | CI blocks <60% | remove config |
| 18 | Fix Google OAuth redirect | `frontend/src/pages/GoogleCallback.tsx` | users stranded | none | M | 1 | manual login e2e | revert |
| 19 | Remove fake stats in live mode | `ProjectsPage.tsx:94-99`, `FlowPage.tsx:14-18` | misleading product data | none | S | 1 | live shows real counts | revert |
| 20 | Fix `/auth/` endpoints missing `/v1` | `frontend/src/lib/api.ts:93-103` | latent 404s | none | S | 0.5 | org/members/sessions calls 200 | revert |
| 21 | WS token → subprotocol | `useBuildSocket.ts:63` | token in logs | none | S | 1 | WS connects; logs clean | revert |
| 22 | Prometheus scrape + Sentry DSN in compose | `docker-compose.prod.yml`, `core/config.py` | blind prod | 21 | M | 2 | `/metrics` scraped; Sentry event received | revert |
| 23 | Port alert rules (HighErrorRate, BuildQueueBacklog) | compose/prometheus rules | alerting | 22 | M | 2 | test alert fires | revert |
| 24 | CORS narrowing + fail-closed webhooks + metrics auth + `await` fix | `main.py:216-228`, `cashfree.py:261`, `razorpay.py:147`, `initiatives.py:197` | S-02/03/04/05/06 | none | M | 3 | tests + preflight checks | revert |
| 25 | QA + Security agents in build chain | `backend/agents/qa.py`, `security.py`, `core/orchestrator.py` | Phase-1 gap | none | L | 8 | pipeline runs QA/security stage; events stream | revert |
| 26 | Real retrieval into `context_engineer` | `backend/context_engineer/retriever.py`, `backend/retrieval/` | simulated chunks | 25 | L | 8 | repo-aware context in developer prompt | revert |
| 27 | E2E suite (login → build → gate → deploy) | `.github/workflows/ci.yml` + `frontend/e2e/` (Playwright) | zero e2e | 18,16 | L | 8 | CI e2e green | remove job |
| 28 | Run load test on staging + record results | `scripts/load_test.py`, `roadmap.md` §8.1 | never validated | 22 | M | 2 | p95 <500ms at target RPS; numbers recorded | N/A |
| 29 | Versioning: git tags, backend `__version__`, release notes | `CHANGELOG.md` process, `backend/__init__.py` | untagged releases | none | S | 1 | tag on every main merge | N/A |
| 30 | Truth pass on README/landing; delete/park `orchestration/`; fix or archive `k8s/`; fix `render.yaml` | README.md, `landing.html`, `orchestration/`, `k8s/`, `render.yaml` | stale claims, dead code | 9 | M | 4 | docs match code; single deploy story | git revert |

**Totals (M0–M8): ~30 atomic tasks, ~50–60 engineer-hours.** All tasks except #1/#8 are revert-safe via git.

---

# 13. Final Verdict

**Is Phase 1 complete? NO.**

**Completion: ~73%.** All 19 Phase-1 requirements have a foundation in code (verified), but 7 are materially incomplete (real retrieval, QA/Security agent classes, docs agent, deployment breadth, user-facing file editing, testing depth, ops layer) and the operational layer is broken in production (backups, monitoring, deploy gating).

**Top 10 remaining tasks (fastest path to production-ready):**
1. Rotate leaked admin credential; purge `reg_payload.json` from history.
2. Fix the 3 backup bugs; prove restore on staging.
3. Gate deploys on CI.
4. Fix 47 backend + 6 frontend failing tests.
5. Fix Google OAuth redirect + hermetic frontend tests.
6. Stand up Prometheus/Sentry + backup alerting.
7. Security hardening: CORS, webhooks fail-closed, metrics auth, `await` fix.
8. Add QA/Security agents to the build pipeline.
9. Build the e2e suite and run the load test.
10. Make docs truthful (README Cloud Run claim, k8s status, single deploy story).

**Fastest path to production-ready Phase 1:** Milestones 0→5 (≈6-8 days, 25 hours) — security incident → backups → CI gates → green tests → UX fixes → observability → hardening. That gets you to **Release Candidate** without writing a single new feature.

**Must finish before Phase 2:** Milestones 0–6. Specifically: backups working & tested, deploy gated on green CI, zero failing tests, e2e coverage of the core journey, live monitoring/alerting, CORS/security findings closed, README truthful, and the orchestration/k8s ambiguity resolved (delete or wire). Phase-2 features (distributed agents, plugin SDK, cloud sandbox execution, enterprise auth) are **blocked** until the single-deploy-story and real build-isolation decisions are made.