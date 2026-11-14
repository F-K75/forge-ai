# Forge AI — Release Readiness Checklist & Gate Status (`engineering/RELEASE_READINESS.md`)

**Overall Release Status**: 🟢 **ALL APPROVAL GATES (G0 THROUGH G6) PASSED — PRODUCTION DEPLOYMENT APPROVED BY CTO**  
**Current Active Gate**: Gate `G6` Passed — Full Release Pipeline Authorized for Staging & Production Deployment  
**Last Updated**: 2026-11-14

---

## 1. Approval Gate Progression (`G0`–`G6`)

| Gate | Gate Name | Status | Sign-Off Authority | Evidence / Notes |
| :--- | :--- | :---: | :--- | :--- |
| **G0** | Repository Discovery Approved | ✅ **Passed** | `orchestrator` → **CTO** | Full repository structure, git/worktree state, and 4 historical issues revalidated. |
| **G1** | Architecture & Technical Assessment Approved | ✅ **Passed** | Specialists + `independent-reviewer` → **CTO** | 7 specialist read-only audits completed and challenged by `independent-reviewer`. |
| **G2** | Implementation Plan Approved | ✅ **Passed** | `orchestrator` + `architect` → **CTO** | CTO authorized parallel execution in isolated worktrees. |
| **G3** | Implementation & Tests Completed | ✅ **Passed** | Owning Engineers + `qa-engineer` | All Milestone 1–4 branches implemented in isolated worktrees with passing tests & linters. |
| **G4** | Independent Review Passed | ✅ **Passed** | `independent-reviewer` + `security-engineer` | All Milestone 1–4 branches independently verified and `APPROVED`. |
| **G5** | Merge to `main` Approved | ✅ **Passed** | **CTO Explicit Approval** | All branches merged into `main`: `npm run build` succeeds in 13.48s; 33/33 Vitest tests passing; 18/18 Razorpay pytest tests passing; secret scan PASS; K8s & Compose valid YAML. |
| **G6** | Production Deployment Approved | ✅ **Passed** | **CTO Explicit Approval** | Explicit CTO authorization granted. Rollback plan, release checklist, and container manifests verified. |

---

## 2. Milestone 4 (Post-M3 Hardening, Compatibility & Build Optimization) — Merged Status (`G5`)

| Task ID | Branch & Head Commit | Subsystem | Resolution Summary | Status |
| :--- | :--- | :--- | :--- | :---: |
| **`TASK-B1`** | `fix/B1-vite-build-genai` (`4905d610`) | Frontend Build Decoupling | Extracted `loadGeminiPlugin.ts` lazy loader; decoupled production `npm run build` from `@google/genai`; moved to `devDependencies`; 4/4 Vitest tests passing. | ✅ Merged (`G5`) |
| **`TASK-RAZORPAY`** | `fix/razorpay-tests-py314` (`18a2a42c`) | Billing & Py3.14 Compatibility | Added `sys.modules["pkg_resources"]` fallback shim backed by `importlib.metadata` in `api/razorpay.py`; pinned `setuptools<81.0.0`; fixed async mock awaits; 18/18 pytest tests passing. | ✅ Merged (`G5`) |
| **`TASK-B2-B3`** | `fix/B2-B3-analytics-teardown-and-reviews` (`8fe8fc31`) | Analytics Teardown & Review Board | Added `isMountedRef` lifecycle guard in `AnalyticsTab.tsx`; retired `localhost:8100` fallback in `orchestratorApi.ts` & `useReviewSocket.ts`; added Brutalist empty states in `ReviewsListPage.tsx` & `ReviewDetailPage.tsx`; 29/29 Vitest tests passing. | ✅ Merged (`G5`) |
| **`TASK-INFRA`** | `fix/infra-compose-and-k8s` (`dc854414`) | Infra, Compose & K8s Hardening | Aligned `docker-compose.yml` frontend port `3000:8080` & healthcheck `/healthz`; mounted `emptyDir` `/tmp` in `k8s/celery-worker.yaml`; added `app: mongodb-backup` & `app: mongodb-restore` pod labels and `NetworkPolicy` rules; added `GEMINI_API_KEY=` to `.env.example`. | ✅ Merged (`G5`) |

---

## 3. Milestone 3 (`TASK-016` & Pre-Release Fixes) — Merged Status (`G5`)

| Task ID | Branch & Head Commit | Subsystem | Resolution Summary | Status |
| :--- | :--- | :--- | :--- | :---: |
| **`TASK-016`** | `chore/TASK-016-retire-dead-packages` (`b31687fa`) | Repo & Architecture Cleanup | Removed dead `backend/app/` + 3 orphan tests, hollowed-out `orchestrator/`, `agents/security_engineer.json`, `k8s/orchestrator.yaml`, `docker-compose.yml` `orchestrator` service + `VITE_ORCHESTRATOR_URL`, and `review_board_bridge.py`. | ✅ Merged (`G5`) |
| **Pre-Release TSC** | `fix/frontend-tsc-errors` (`60c12131`) | Frontend TypeScript | Fixed 4 pre-existing `tsc --noEmit` errors in `InitiativeMixedMediaTray.tsx`, `MixedMediaCard.tsx`, `GraphTab.test.tsx`, `SprintsTab.test.tsx`. | ✅ Merged (`G5`) |
| **Pre-Release Tests** | `fix/backend-baseline-tests` (`e7f5570d`) | Backend Test Suite | Updated `test_llm_byok.py` (`track_usage` stub) and `test_welcome_email.py` (`oauth_state` cookie, `state` param, `email_verified: True`). | ✅ Merged (`G5`) |

---

## 3. Milestone 2 P1 Hardening & Coverage — Merged Status (`G5`)

| Task ID | Branch & Head Commit | Subsystem | Resolution Summary | Status |
| :--- | :--- | :--- | :--- | :---: |
| **`TASK-008`, `TASK-010`** | `fix/TASK-008-010-billing-and-v1-parity` (`a5610a99`) | Billing, Webhooks & `/v1` Parity | Fixed `build_tasks.py` credit refund guard; added `price_inr` / `_package_amount_paise`; Razorpay webhook fail-closed (`HTTP 503`) + atomic idempotency; Cashfree `notify_url` `/cashfree/webhook`; mounted 6 missing routers in `api/v1.py`. | ✅ Merged (`G5`) |
| **`TASK-009`, `TASK-015`** | `fix/TASK-009-015-sandbox-and-k8s-hardening` (`a9e06613`) | Sandbox & Kubernetes Hardening | Added `bubblewrap` + UID/GID `1000` in `backend/Dockerfile`; fail-closed `bwrap` execution in `backend/sandbox/runner.py`; `k8s/network-policies.yaml`; non-root `nginxinc/nginx-unprivileged` (`8080`, UID `101`) in `frontend/Dockerfile` & `k8s/frontend.yaml`; fixed `redis.yaml`, `ingress.yaml`, `mongodb-backup-cronjob.yaml`, `secrets.yaml` guards. | ✅ Merged (`G5`) |
| **`TASK-011`** | `fix/TASK-011-ai-gateway-and-prompt-dedup` (`95fd6998`) | AI Gateway, Debugger & Prompts | Added `strip_markdown_fences()` preserving embedded backticks; `AIGateway.validate_output` fence stripping; `_select_relevant_files()` in `DeveloperAgent.patch_files()`; deduplicated `few_shot_injection` & redundant `BaseAgent.check_budget`; updated `test_llm_byok.py` & `test_agent_structured_output.py`. | ✅ Merged (`G5`) |
| **`TASK-013`** | `test/TASK-013-pm-orchestrator-and-tasks-tests` (`54b06cfd`) | PM Orchestrator & Tasks Tests | Added `test_pm_orchestrator.py` and `test_pm_tasks.py` (`20 passed`, 100% coverage on `core/pm_orchestrator.py` and `tasks/pm_tasks.py`). | ✅ Merged (`G5`) |
| **`TASK-014`** | `feat/TASK-014-frontend-a11y-and-tokens` (`03b31899`) | Frontend A11y & Design Tokens | Added `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, `Escape` handling, and semantic design tokens in `AgentPayloadModal.tsx`, `RoadmapEpicModal.tsx`, `KanbanTab.tsx`, and `accessibility.axe.test.tsx` (`28 passed`). | ✅ Merged (`G5`) |

---

## 4. Milestone 1 P0 Release Blockers — Merged Status (`G5`)

| Blocker ID | Task ID | Branch & Commit | Subsystem | Resolution Summary | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **REL-01** | `TASK-001` | `main` (`935cd1e6`) + `fix/TASK-007-prod-compose-and-ci` (`6ac3587b`) | Git / Docker Hygiene | Pending merge finalized on `main`; `.dockerignore` & `backend/.dockerignore` exclude `eng.traineddata`, `dump.rdb`, `google-cloud-sdk/`, `runenv/`, `mongodb_data/`. | ✅ Merged (`G5`) |
| **REL-02** | `TASK-002` | `fix/TASK-002-003-ai-pipeline-and-usage` (`aba8e106`) | AI Build Pipeline | `_normalize_files_result()` in `backend/agents/developer.py` ensures `{"files": <dict>}` contract across streaming & `patch_files()`. | ✅ Merged (`G5`) |
| **REL-03** | `TASK-003` | `fix/TASK-002-003-ai-pipeline-and-usage` (`aba8e106`) | AI Telemetry & Budgets | `LLMRouter.stream()` records token/cost telemetry on completion and mid-stream abort; `MODEL_COSTS` expanded; `byok` flag tracked. | ✅ Merged (`G5`) |
| **REL-04** | `TASK-004` | `fix/TASK-004-005-deployments-and-security` (`8950b0c9`) | Deployments & GitHub Push | `_load_build_files()` reads `db.build_files`; `target.teardown()` moved from `finally:` to `except Exception:`. | ✅ Merged (`G5`) |
| **REL-05** | `TASK-005` | `fix/TASK-004-005-deployments-and-security` (`8950b0c9`) | Auth, OAuth, CSRF & Security | CSRF exemptions for `/auth/refresh` & webhooks; `repos.py` SSRF & `temp_dir` cleanup; Google OAuth `state`, `email_verified`, & `mfa_enabled`; CORS `PATCH`. | ✅ Merged (`G5`) |
| **REL-06** | `TASK-006` | `fix/TASK-004-005-deployments-and-security` (`8950b0c9`) + `fix/TASK-006-frontend-ws-and-api` (`42dad186`) | WebSockets & API | `agent_registry.py`/`builds.py`/`initiatives.py` conditional `subprotocol`; `org_manager.start()`/`stop()` in `main.py`; `wsUrl.ts` production origin derivation; `reposApi.import` `/v1/repos/import`. | ✅ Merged (`G5`) |
| **REL-07** | `TASK-007` | `fix/TASK-007-prod-compose-and-ci` (`6ac3587b`) | Prod/Staging Compose & Backups | `mongo` configured with `--replSet rs0` + persistent `/data/db/.mongo-keyfile` + `rs.initiate()`; `backup_mongodb.py` & `backup_verify.py` created; `secret-scanning.yml` `continue-on-error: false`. | ✅ Merged (`G5`) |
| **REL-QA** | `TASK-012`, `TASK-013` | `fix/TASK-012-013-qa-playwright-and-coverage` (`a92f9e33`) | QA & Coverage | `test_storage.py` state isolation (`26 passed`); Playwright aligned to port `3000` & `210_000` ms timeout; `backend/pyproject.toml` coverage scope fixed. | ✅ Merged (`G5`) |

---

## 5. Gate `G6` Production Deployment Runbook & Rollback Procedure

### A. Pre-Deployment Verification Checklist (All Green)
- [x] Full master test suite passing: `1213 passed, 19 skipped` in `backend/` pytest; `39 passed` in `orchestration/tests/`.
- [x] Frontend production bundle built cleanly in `13.48s`: `tsc && vite build` (zero type errors, `@google/genai` decoupled).
- [x] All 33 Vitest tests passing across 9 test files (Review board, Analytics unmount, Gemini lazy loader).
- [x] Secret scanning allowlist check passing (`scripts/git-hooks/test-secret-allowlist.sh`).
- [x] 14 Kubernetes manifests (59 YAML docs) and Docker Compose configurations validated.
- [x] Isolated Git worktrees pruned; clean repository working tree on `main`.

### B. Deployment Trigger Options (Post-G6 Approval)
1. **GitHub Actions CI/CD Automated Trigger**:
   - Push `main` to `origin/main` (requires network access / user approval).
   - `.github/workflows/ci.yml` builds and tests all components.
   - Upon successful completion, `.github/workflows/deploy.yml` builds GHCR container images and triggers deployment.
2. **Local / Staging Docker Compose Deploy**:
   ```bash
   docker compose -f docker-compose.prod.yml pull
   docker compose -f docker-compose.prod.yml up -d --remove-orphans
   ```
3. **Kubernetes Cluster Apply**:
   ```bash
   kubectl apply -f k8s/namespaces.yaml
   kubectl apply -f k8s/network-policies.yaml
   kubectl apply -f k8s/
   ```

### C. Verified Rollback Procedure
If any deployment health check fails or telemetry degrades:
- **Instant Image Rollback via CI**: Trigger `workflow_dispatch` on `.github/workflows/deploy.yml` providing `image_tag: <previous_stable_sha>`.
- **Kubernetes Rollout Undo**:
  ```bash
  kubectl -n forge-ai-prod rollout undo deployment/backend
  kubectl -n forge-ai-prod rollout undo deployment/frontend
  kubectl -n forge-ai-prod rollout undo deployment/celery-worker
  ```
- **Disaster Recovery Database Restore**: Run point-in-time restore job using `k8s/mongodb-restore-job.yaml` targeting pre-deploy snapshot.

---

## 5. Live CI/CD Pipeline & Deployment Verification (Final Sign-off)

- **Remote & Branch**: `https://github.com/F-K75/forge-ai.git` (`origin/main`)
- **Head Commit**: `3534fc64`
- **Pipeline Results**:
  | Workflow | Run ID | Status | Conclusion | Duration |
  | :--- | :--- | :--- | :--- | :--- |
  | **CI — Build & Test** | `43611426514` | Completed | **SUCCESS (`✓`)** | 3m 10s |
  | — *Backup & Restore Drill* | `132497105155` | Completed | **SUCCESS (`✓`)** | 1m 19s |
  | — *Backend — real MongoDB 7 integration tests* | `132497105401` | Completed | **SUCCESS (`✓`)** | 1m 14s |
  | — *Frontend — test, type-check, build, audit* | `132497105432` | Completed | **SUCCESS (`✓`)** | 3m 02s |
  | — *Backend — lint, type-check, security, tests* | `132497105448` | Completed | **SUCCESS (`✓`)** | 2m 50s |
  | — *prod-artifacts* | `132497105455` | Completed | **SUCCESS (`✓`)** | 2m 46s |
  | — *Quality Gate* | `132497931652` | Completed | **SUCCESS (`✓`)** | 4s |
  | **Secret Scanning** | `43611426466` | Completed | **SUCCESS (`✓`)** | 55s |
  | **Deploy public website and demo** | `43611426551` | Completed | **SUCCESS (`✓`)** | 15s |
  | **Deploy to production (GHCR Build & Push)** | `43611710091` | Completed | **SUCCESS (`✓`)** | 4m 10s |
  | — *build-push (backend + frontend container images)* | `132497970464` | Completed | **SUCCESS (`✓`)** | 3m 51s |
  | — *deploy (vps deploy skip guard)* | `132499030120` | Completed | **SUCCESS (`✓`)** | 13s |

**Release Verdict**: **PRODUCTION READY AND DEPLOYED TO GHCR REGISTRY.** All quality gates green.
