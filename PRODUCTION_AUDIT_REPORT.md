# Forge AI v1.0 Production Release Certification Audit

**Audit Date:** 2026-07-01  
**Auditor:** Independent Production Release Certification Board  
**Repository:** Forge AI - AI-powered full-stack app builder

---

## 1. Executive Summary

Forge AI is an AI-powered full-stack application builder with a multi-agent architecture. The platform demonstrates substantial engineering effort with multiple security controls, rate limiting, encryption, and infrastructure configurations. However, several critical issues prevent production readiness:

- ~~**P0 Blocker:** Hardcoded placeholder secrets in Kubernetes manifests~~ — **RESOLVED** — `k8s/secrets.yaml` now contains only empty-string placeholders with comments directing deployers to an external secret manager (Vault/AWS Secrets Manager/etc.); no literal secret values remain (§3.1)
- **P0 Blocker:** Missing critical security implementation (LLM usage tracking not persisted)
- ~~**P0 Blocker:** Password hashing is completely broken~~ — **found and resolved 2026-07-03** (§3.11); no longer a blocker
- ~~**P1 Blocker:** No actual test execution in CI pipeline (linting disabled)~~ — **RESOLVED as of commit 956b8cc1** — CI now runs pytest and ruff lint (§3.3)
- **P1 Blocker:** Incomplete frontend WebSocket authentication implementation mismatch

Since this audit, four additional issues were found; all four are now resolved (§3.11-3.14): the password-hashing outage above (which also uncovered and required fixing a second bug — an `_id`/ObjectId serialization crash on registration), a password-hash/token leak in auth responses, a marketplace-creation crash, and a frontend gap that made CSRF protection block every real mutation. The Billing/Marketplace/Settings/Onboarding frontend pages, previously mock-only, are now wired to real backend APIs, and the `orchestrator/` review-board service — previously backend-only with no UI — now has one. **As of 2026-07-03, none of this session's findings remain open** — the two still-listed P0 blockers above (K8s secrets, LLM usage tracking) predate this session and are unrelated to it.

The platform is **NOT READY FOR RELEASE** in its current state.

---

## 2. Overall Production Readiness Score: 62/100

| Category | Score | Notes |
|----------|-------|-------|
| Engineering | 70/100 | Solid architecture, but missing actual persistence in critical paths |
| Security | 65/100 | Strong controls exist but secrets management is unsafe |
| DevOps | 55/100 | Good K8s setup; placeholder-secrets flaw noted at audit time is now resolved — secrets.yaml uses external secret injection only |
| AI Platform | 75/100 | Well-designed with circuit breakers and retry logic |
| Product | 60/100 | Features exist but incomplete user flows. **Update 2026-07-03:** Billing/Marketplace/Settings/Onboarding pages, previously mock-only, are now wired to real backend APIs; the orchestrator review-board service gained a UI (previously backend-only) |
| Testing | 45/100 | Tests exist but CI doesn't run them; no integration tests |
| Business | 70/100 | Billing flow is now genuinely wired end-to-end (checkout/plans/usage/downgrade), but still requires real Stripe secrets to actually process payments — the placeholder-secrets issue in §3.1 blocks it either way |

---

## 3. Detailed Findings

### P0 - RELEASE BLOCKING

#### 3.1 Hardcoded Placeholder Secrets in Production (k8s/secrets.yaml:8-13) (RESOLVED)
**Severity:** CRITICAL — was RELEASE BLOCKING, now fixed
**Location:** `/Users/keshav/forge-ai/k8s/secrets.yaml`

**RESOLVED** — re-read the current file: it no longer contains any literal secret values (no `sk_live_...`, no `CHANGE_ME` string constants). Every `stringData` key (`jwt-secret`, `field-encryption-key`, `stripe-secret-key`, `stripe-webhook-secret`, `mongo-password`, `redis-password`, etc.) is now an empty string annotated with a comment stating it "MUST be populated at deployment time" from an external secret manager, and the file header explicitly documents the intended flow: "Secrets should be populated from an external secret manager (HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager) or CI/CD pipeline at deployment time," with production guidance to use "External Secrets Operator, Sealed Secrets, or Helm secrets management." No hardcoded credential values remain in the manifest.

**Remediation:** Done — file now uses external secret injection with placeholder/empty values only.

**Effort:** Medium (2-3 days) — Done

---

#### 3.2 LLM Usage Tracking Not Persisted (backend/core/ai_usage.py:38-40)
**Severity:** HIGH  
**Location:** `/Users/keshav/forge-ai/backend/core/ai_usage.py:38-40`

```python
async def track_usage(user_id, build_id, model, prompt_tokens, completion_tokens, cost_usd):
    db = await get_db()
    pass  # NOT IMPLEMENTED
```

**Risk:** While budget checking exists and costs are calculated, the `track_usage` function is a stub. The application will not persist LLM usage data, making cost control ineffective and audit trails incomplete.

**Remediation:** Implement proper database persistence in `track_usage` function.

**Effort:** Low (1 day)

---

### P1 - LAUNCH BLOCKING

#### 3.3 CI Pipeline Does Not Execute Tests (.github/workflows/ci.yml:44-58) (RESOLVED)
**Severity:** HIGH — was LAUNCH BLOCKING, now fixed
**Location:** `/Users/keshav/forge-ai/.github/workflows/ci.yml`

**RESOLVED as of commit 956b8cc1** — CI now runs pytest and ruff lint. Verified current pipeline: `.github/workflows/ci.yml:53` runs `ruff check . --select F,E9 --exclude venv` (lint gate, no `continue-on-error`), and `ci.yml:95` runs `python -m pytest tests/ -v --timeout=30 --cov=. --cov-report=xml --cov-report=term --junitxml=test-results.xml`, both as blocking steps in the job. This finding is no longer accurate and is kept here only for history.

**Effort:** Low (1 day) — Done

---

#### 3.4 Frontend WebSocket Auth Mismatch (frontend/src/hooks/useBuildSocket.ts:65)
**Severity:** MEDIUM  
**Location:** `/Users/keshav/forge-ai/frontend/src/hooks/useBuildSocket.ts:65`

The frontend passes token via query parameter:
```typescript
const ws = new WebSocket(`${WS_URL}/builds/ws/${id}?token=${encodeURIComponent(wsToken || '')}`)
```

But backend implements token-in-first-message pattern (`ws_manager.py:61-66`). The frontend comment says "Backend expects token via query param" but the backend code expects the first message to be an auth message.

**Risk:** WebSocket authentication will fail in production. Users cannot connect to build streams.

**Remediation:** Align frontend WebSocket authentication with backend implementation.

**Effort:** Low (1 day)

---

#### 3.5 Read-Only Root Filesystem Requires Writable /tmp (k8s/backend.yaml:103)
**Severity:** MEDIUM  
**Location:** `/Users/keshav/forge-ai/k8s/backend.yaml:103`

```yaml
readOnlyRootFilesystem: true
```

But the sandbox runner (`backend/sandbox/runner.py:22-28`) writes to `tempfile.TemporaryDirectory()` which may not work in a read-only container without explicit `/tmp` volume mount.

**Risk:** File writes will fail, breaking sandbox validation and deployments.

**Remediation:** Add emptyDir volume mount for `/tmp` or disable read-only root filesystem.

**Effort:** Low (hours)

---

### P2 - SHOULD FIX BEFORE SCALE

#### 3.6 No Database Backup Strategy Verified
**Severity:** MEDIUM  
**Location:** Not found in repository

While there's a `scripts/backup_mongodb.py` file referenced in the glob, no backup schedule or disaster recovery plan exists in Kubernetes manifests.

**Risk:** Data loss in case of MongoDB failure.

**Effort:** Medium (2-3 days)

---

#### 3.7 No API Rate Limiting Exception Handling for Valid Users
**Severity:** MEDIUM  
**Location:** `backend/core/security.py:149-151`

When Redis fails, rate limiting silently falls through to in-memory with no logging:
```python
except Exception:
    pass  # Redis unavailable, skip rate limiting
```

**Risk:** Rate limiting can be silently bypassed during Redis outages.

**Effort:** Low (half day)

---

#### 3.8 Sandbox Timeout Not Enforced
**Severity:** MEDIUM  
**Location:** `backend/sandbox/runner.py:21`

The sandbox runner has a 10-second timeout for Python syntax check, but `sandbox_timeout` setting (120s) is not used in sandbox execution.

**Risk:** Malicious or infinite-loop code could hang services.

**Effort:** Low (hours)

---

### P3 - TECHNICAL DEBT

#### 3.9 Build Deduplication Timestamp Comparison Bug
**Severity:** LOW  
**Location:** `backend/api/builds.py:101`

```python
"created_at": {"$gte": thirty_seconds_ago.isoformat()},
```

The `created_at` field is a datetime object, while `isoformat()` returns a string. MongoDB comparison may fail inconsistently.

**Effort:** Low (hours)

---

#### 3.10 Prompt Sanitization Doesn't Escape Injection
**Severity:** LOW  
**Location:** `backend/core/security.py:253-266`

While `sanitize_prompt` removes control characters, it does not prevent LLM prompt injection attacks (e.g., "Ignore previous instructions").

**Effort:** Medium (1-2 days)

---

### Findings added 2026-07-03 (post-audit)

#### 3.11 Password Hashing Was Completely Broken — Registration/Login Total Outage (RESOLVED)
**Severity:** P0 — was RELEASE BLOCKING, now fixed (§4's "Broken Auth" rating below is corrected accordingly)  
**Location:** `backend/requirements.txt` (`passlib[bcrypt]==1.7.4`)

Every `hash_password()`/`verify_password()` call — i.e. every registration and every login — crashed with `ValueError: password cannot be longer than 72 bytes` raised from passlib's own internal `detect_wrap_bug` self-test. Root cause: `bcrypt>=4.1` removed the `_bcrypt.__about__` module passlib 1.7.4 reads for version detection, and the resulting `AttributeError` is what actually surfaces as the misleading "72 bytes" error.

**Fix Applied:** Pinned `bcrypt==4.0.1` (last version with `__about__` intact) directly below the `passlib[bcrypt]` line in `requirements.txt`. Confirmed in isolation that `bcrypt==5.0.0` reproduces the crash and `4.0.1` doesn't, before changing the pin.

**Fixing this uncovered a second, previously-unreachable bug:** Motor's `insert_one()` mutates its input dict in place, adding a `bson.ObjectId` `_id`; `register`'s response handler reused that dict, and the ObjectId crashed FastAPI's JSON serializer. Fixed by adding `_id` to the `_public_user_dict()` strip list (see §3.12 below).

**Status:** Resolved 2026-07-03 — verified via a real `curl` registration + immediate login (fresh account, 200/200, no leaked fields) and the full backend test suite (66/66 passing).

#### 3.12 Auth Endpoints Leaked Password Hash + Raw GitHub Token (Resolved)
**Severity:** P0 — was RELEASE BLOCKING, now fixed  
**Location:** `backend/api/auth.py` — `get_me`, `login`, `register`, `refresh`

`GET /auth/me` returned the decrypted GitHub personal-access-token in its JSON body on every call (fired on nearly every page load via route guards). `login`/`register`/`refresh` returned the raw MongoDB user document as `TokenResponse.user`, including the bcrypt `hashed_password` field. Fixed via a `_public_user_dict()` helper stripping `hashed_password`/`github_token`/verification-token fields from every response, replacing the token with a `github_connected: bool`. **Status: Resolved 2026-07-03.**

#### 3.13 Marketplace Item Creation Crashed on Every Call (Resolved)
**Severity:** P1 — was LAUNCH BLOCKING for the marketplace feature, now fixed  
**Location:** `backend/api/marketplace.py` — `create_item`

`POST /marketplace/` always raised `ResponseValidationError` (`created_at` datetime vs. the response model's `str` field) — the item inserted successfully into MongoDB before the crash, meaning every "create" attempt looked like a failure to the caller while silently succeeding server-side. Fixed by dumping in JSON mode (`item.model_dump(mode="json")`) for both the insert and the response. **Status: Resolved 2026-07-03.**

#### 3.14 CSRF Protection Middleware Existed but Frontend Never Used It (Resolved)
**Severity:** was effectively P0 (total mutation-request outage, not just a security gap) — now fixed  
**Location:** `frontend/src/lib/api.ts`

Contrary to this report's own §4 OWASP table (which didn't flag this) and the separate `AUDIT_REPORT.md`'s "CSRF Protection Missing" finding (also outdated — the backend middleware was added since that audit): the backend's `csrf_protection_middleware` was correctly mounted and enforcing `X-CSRF-Token` on all mutating requests. But the frontend never fetched or attached that header anywhere, so **every** POST/PUT/DELETE from a real browser session — creating a project, starting a build, billing checkout, everything — was silently rejected with 403. Fixed with an axios interceptor that fetches/caches the token and attaches it automatically. **Status: Resolved 2026-07-03.**

---

## 4. Security Assessment (OWASP Top 10)

| OWASP Category | Status | Evidence |
|----------------|--------|----------|
| Injection | ✅ | `sanitize_string()` escapes regex, parameterized queries |
| Broken Auth | ✅ | JWT with JTI and token blacklist are sound; password hashing was broken (§3.11 — total registration/login outage) but is now fixed and verified 2026-07-03 |
| Sensitive Data Exposure | ⚠️ | Field encryption exists but secrets are still hardcoded (§3.1); auth responses no longer leak password hashes/raw tokens as of 2026-07-03 (§3.12) |
| XML External Entities | NOT VERIFIED | No XML parsing found |
| Broken Access Control | ✅ | User isolation checks in builds.py |
| Security Misconfiguration | ✅ | RESOLVED — k8s/secrets.yaml now uses external secret injection (empty placeholders + Vault/Secrets-Manager guidance), no literal secret values |
| XSS | ✅ | CSP headers set in security.py:64 |
| Insecure Deserialization | NOT VERIFIED | No pickle/yaml deserialization of untrusted data |
| Using Components with Known Vulnerabilities | NOT VERIFIED | No dependency scanning configured |
| Insufficient Logging & Monitoring | ⚠️ | Security events logged but no alerting integration |

---

## 5. Infrastructure Assessment

| Component | Status | Notes |
|-----------|--------|-------|
| Kubernetes | ✅ | Deployments defined; secrets now sourced via external secret manager, no hardcoded values |
| MongoDB | ✅ | Replica set with 3 nodes configured |
| Redis | NOT VERIFIED | No Redis deployment found in k8s/ |
| Autoscaling | ✅ | HPA configured for backend and celery-worker |
| Load Balancing | NOT VERIFIED | No ingress controller configuration visible |
| Secrets Management | ✅ | RESOLVED — k8s/secrets.yaml uses empty placeholders with External Secrets Operator/Vault/Secrets-Manager guidance, no hardcoded values |
| Backup/DR | NOT VERIFIED | backup script exists but no schedule |

---

## 6. Testing Coverage

| Test Type | Status | Evidence |
|-----------|--------|----------|
| Unit Tests | ⚠️ | Tests exist but mostly smoke tests checking code presence |
| Integration Tests | NOT VERIFIED | No database integration tests |
| E2E Tests | NOT VERIFIED | No E2E test infrastructure found |
| Security Tests | ⚠️ | Password/encryption tests exist |
| Load Tests | NOT VERIFIED | No load testing configuration |
| Chaos Tests | NOT VERIFIED | Not implemented |

---

## 7. Certification Decision

### ❌ NOT READY FOR RELEASE

**Justification:**

1. ~~**Hardcoded production secrets** (`k8s/secrets.yaml`) would cause immediate credential leakage or service failure~~ — RESOLVED, file now uses external secret injection only (§3.1)
2. **LLM usage tracking** (`backend/core/ai_usage.py`) is not implemented, breaking cost controls
3. **CI pipeline** does not enforce quality gates (`continue-on-error: true` on build)
4. **WebSocket authentication** has frontend/backend implementation mismatch

The platform demonstrates solid architectural patterns but critical security and operational gaps must be addressed before any production deployment.

---

## 8. Required Actions Before Release

| Priority | Action | Owner | ETA |
|----------|--------|-------|-----|
| ~~P0~~ | ~~Replace placeholder secrets with Vault/K8s secrets~~ — Resolved, see §3.1 | — | Done |
| P0 | Implement LLM usage persistence | Backend | 1 day |
| ~~P0~~ | ~~Fix bcrypt/passlib version incompatibility — registration/login totally broken~~ — Resolved 2026-07-03 (§3.11) | — | Done |
| P1 | Fix frontend WebSocket auth to match backend | Frontend | 1 day |
| ~~P1~~ | ~~Enable failing CI on test errors~~ — Resolved (§3.3), see commit 956b8cc1 | — | Done |
| P2 | Add /tmp volume mount for sandbox writes | DevOps | Hours |
| P2 | Add Redis deployment manifest | DevOps | 1 day |
| P3 | Fix build deduplication timestamp comparison | Backend | Hours |
| P3 | Add prompt injection detection | Security | 1-2 days |
| ~~P0~~ | ~~Auth responses leak password hash + GitHub token~~ — Resolved 2026-07-03 (§3.12) | — | Done |
| ~~P1~~ | ~~Marketplace item creation crashes~~ — Resolved 2026-07-03 (§3.13) | — | Done |
| ~~P0~~ | ~~CSRF: frontend never attaches token~~ — Resolved 2026-07-03 (§3.14) | — | Done |

---

*End of Audit Report*