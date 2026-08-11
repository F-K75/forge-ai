# FORGE AI — INITIATIVE PAGE RE-AUDIT

**Date:** 2026-08-11  
**Auditor:** Kilo (Automated Code Audit)  
**Target:** Initiative page (`/initiatives`, `/initiatives/:id`)  
**Scope:** Backend API (`backend/api/initiatives.py`), frontend pages (`frontend/src/pages/pm/`), models (`backend/core/pm_models.py`), permissions (`backend/core/permissions.py`), WebSocket manager (`backend/services/pm_ws_manager.py`), store (`frontend/src/store/pmStore.ts`), socket hook (`frontend/src/hooks/usePMSocket.ts`)

---

## EXECUTIVE SUMMARY

| Dimension | Previous | Current | Change |
|-----------|----------|---------|--------|
| Business Viability | 40/100 | 40/100 | 0 — no change |
| User Experience | 70/100 | 55/100 | -15 — regression: cancel/approve/sanitization lost in frontend |
| Data Governance | 81/100 | 45/100 | -36 — major regression: encryption, safe fields, and orphan cleanup lost |
| Authentication & Authorization | 84/100 | 78/100 | -6 — approve allows GENERATING again; version concurrency broken |
| Input Validation | 84/100 | 72/100 | -12 — PRD CAS conflates 404/409; PRD write-path no longer validates/encrypts |
| Sensitive Data Exposure | 82/100 | 40/100 | -42 — create/list responses leak plaintext prompt; PRD stored unencrypted |
| Destructive Operations | 80/100 | 65/100 | -15 — cancel endpoint removed; regenerate confirmation remains but other gaps widened |
| WebSocket Security | 78/100 | 75/100 | -3 — origin check weakened again; query-param warning remains |
| Audit & Observability | 75/100 | 70/100 | -5 — analytics/audit partially retained but coverage reduced |
| Compliance | 72/100 | 50/100 | -22 — encryption consistency lost; migration/rotation still pending |

**Overall Score: 73/100 → 56/100**  
**Recommendation:** HOLD — significant regression detected. Multiple previously fixed P0/P1 issues have reappeared in `backend/api/initiatives.py`. Do not launch until these are re-fixed.

---

## PHASE 1: FINDINGS REGISTER

### Regressions Since Last Audit

| ID | Category | Severity | Finding | Location | Status |
|----|----------|----------|---------|----------|--------|
| BUG-01 | Bug | CRITICAL | `_detect_prompt_injection` imported from `core.security` again | `initiatives.py:17` | ❌ REGRESSED |
| BUG-02 | Bug | HIGH | Version concurrency resets to `1` again | `initiatives.py:297` | ❌ REGRESSED |
| BUG-03 | Bug | HIGH | Create endpoint stores plaintext `prompt` again | `initiatives.py:227` | ❌ REGRESSED |
| BUG-04 | Bug | HIGH | List endpoint returns raw docs without safe fields again | `initiatives.py:266` | ❌ REGRESSED |
| BUG-05 | Bug | MEDIUM | Orphaned project cleanup on create failure removed | `initiatives.py:225-248` | ❌ REGRESSED |
| BUG-06 | Bug | MEDIUM | PRD write-path uses `_maybe_decrypt_prd` instead of encrypting | `initiatives.py:395` | ❌ REGRESSED |
| BUG-07 | Bug | MEDIUM | PRD CAS conflates 404/409 again | `initiatives.py:400-401` | ❌ REGRESSED |
| BUG-08 | Bug | MEDIUM | Approve allows `GENERATING` status again | `initiatives.py:485` | ❌ REGRESSED |
| SEC-01 | Exposure | HIGH | `generationError` rendered unsanitized in frontend again | `InitiativeLayout.tsx:214` | ❌ REGRESSED |
| SEC-02 | Abuse | LOW | In-memory rate limiter back; Redis abstraction lost | `initiatives.py:33` | ❌ REGRESSED |
| SEC-03 | WS | LOW | Origin check defaults to allowing all in non-dev again | `initiatives.py:86` | ❌ REGRESSED |
| FE-01 | Frontend | LOW | No cancel button in frontend | `InitiativeLayout.tsx` | ❌ REGRESSED |
| FE-02 | Frontend | LOW | No loading skeletons | `InitiativeLayout.tsx` | ❌ REGRESSED |
| FE-03 | Frontend | LOW | `prompt` field may be back in TS interface | `InitiativesListPage.tsx` | ❌ REGRESSED |

### Surviving Fixes

| ID | Category | Finding | Status |
|----|----------|---------|--------|
| A-01 | WS | Query-param token deprecation warning logged | ✅ Survived (`initiatives.py:612-613`) |
| A-02 | Frontend | Tab `aria-controls` + `role=tablist` | ✅ Survived (`InitiativeLayout.tsx:226,240`) |
| A-03 | Backend | Comments/approvals endpoints | ✅ Survived (`initiatives.py:512-575`) |
| A-04 | Backend | Export endpoint | ✅ Survived (`initiatives.py:578-599`) |
| A-05 | Backend | Graph endpoint safe-field filtering | ✅ Survived (`initiatives.py:447-468`) |
| A-06 | Backend | Write-access checks on update/regenerate | ✅ Survived (`initiatives.py:293,321`) |
| A-07 | Backend | Regenerate confirmation gate | ✅ Survived (`initiatives.py:326-327`) |
| A-08 | Backend | Analytics instrumentation | ✅ Survived (`initiatives.py:90-104,233,334,354-355,498,541,574,598`) |
| A-09 | Backend | Audit logs on mutations | ✅ Survived |
| A-10 | Frontend | Real stats instead of fake metrics | ✅ Survived |
| A-11 | Frontend | Prompt cleared after creation | ✅ Survived |
| A-12 | Backend | Credit reservation/deduction | ✅ Survived |
| A-13 | Backend | Migration script + DB indexes | ✅ Survived |

---

## PHASE 2: DETAILED ANALYSIS

### 2.1 Authentication & Authorization

| Endpoint | Auth | Access Control | Status |
|----------|------|----------------|--------|
| `POST /initiatives/` | `get_current_user` | Owner only + credit check + rate limit | ✅ |
| `GET /initiatives/` | `get_current_user` | Owner only | ❌ **No safe-field filtering** |
| `GET /initiatives/{id}` | `get_current_user` | `_get_owned_initiative` + safe fields | ✅ |
| `PUT /initiatives/{id}` | `get_current_user` | Write access + version guard | ⚠️ Version resets to `1` |
| `POST /{id}/regenerate` | `get_current_user` | Write access + confirm flag | ✅ |
| `POST /{id}/approve` | `get_current_user` | Write access | ❌ Allows `GENERATING` |
| `GET /{id}/prd` | `get_current_user` | Owner + safe PRD fields | ✅ |
| `PUT /{id}/prd` | `get_current_user` | Write access | ⚠️ No encryption; CAS broken |
| `GET /{id}/graph` | `get_current_user` | Owner + pagination + opt-in | ✅ |
| `WS /ws/{id}` | Token + Origin | Initiative scope + origin check | ⚠️ Origin check weakened |
| `GET/POST /{id}/comments` | `get_current_user` | Owner + PRD existence | ✅ |
| `GET/POST /{id}/approvals` | `get_current_user` | Owner + PRD existence | ✅ |
| `GET /{id}/export` | `get_current_user` | Owner | ❌ No safe-field projections for child docs |

### 2.2 Sensitive Data Exposure

**Critical regressions:**
- `create_initiative` returns raw Pydantic `Initiative` model with plaintext `prompt` in JSON response
- `create_initiative` inserts `initiative.model_dump()` directly without encrypting `prompt`, `business_goals`, `risks`
- `list_initiatives` returns raw MongoDB docs from `paginated_query` without `SAFE_INITIATIVE_FIELDS` filtering or decryption
- `update_prd` applies `_maybe_decrypt_prd` to incoming values, which means PRD fields like `security`, `api_overview`, `database_overview` are stored unencrypted
- `export_initiative` returns raw child docs (epics, stories, tasks, sprints) without `EXPORT_SAFE_*_FIELDS` projections

**Surviving protections:**
- `_get_owned_initiative` still applies safe fields + decryption for detail endpoint
- `get_prd` still applies safe PRD fields + decryption for reads
- Graph endpoint still paginates and requires opt-in for files/commits/executions

### 2.3 Input Validation

- `UpdateInitiativeRequest` still validates structured fields and string lists
- PRD update has no length/type validation anymore (was removed in regression)
- Prompt sanitization + injection detection still present but imported from wrong module
- PRD CAS no longer distinguishes 404 from 409

### 2.4 Destructive Operations

- `regenerate` still requires `confirm=true` + audit log
- **Cancel endpoint removed** — no way to stop generation mid-flight
- No orphan cleanup on create failure

### 2.5 WebSocket Security

- Origin validated but defaults to allowing all in non-development
- Token accepted via header or query param with deprecation warning logged
- Query-param fallback still present

### 2.6 Audit & Observability

- Analytics events partially retained
- Audit logs on most mutations retained
- **Missing:** read audit for list endpoint

### 2.7 Compliance

- Export endpoint exists but over-exposes child docs
- No encryption on create/PRD write
- Migration script exists but rotation not executed

---

## PHASE 3: SCORING

| Category | Previous | Current | Delta | Notes |
|----------|----------|---------|-------|-------|
| Business Viability | 40/100 | 40/100 | 0 | No change |
| User Experience | 70/100 | 55/100 | -15 | Cancel/approve/sanitization regressed |
| Data Governance | 81/100 | 45/100 | -36 | Encryption and safe fields lost |
| Auth & AuthZ | 84/100 | 78/100 | -6 | Approve gate weakened; version broken |
| Input Validation | 84/100 | 72/100 | -12 | PRD validation/CAS regressed |
| Sensitive Data Exposure | 82/100 | 40/100 | -42 | Create/list/PRD/export all regressed |
| Destructive Ops | 80/100 | 65/100 | -15 | Cancel removed; orphan cleanup lost |
| WebSocket Security | 78/100 | 75/100 | -3 | Origin check weakened |
| Audit & Observability | 75/100 | 70/100 | -5 | Partial retention |
| Compliance | 72/100 | 50/100 | -22 | Encryption consistency lost |

**Composite: 56/100 → Target: 83/100**

---

## PHASE 4: REMEDIATION PLAN

### Immediate (Re-fix regressions)

| ID | Action | File(s) | Priority |
|----|--------|---------|----------|
| BUG-01 | Fix `_detect_prompt_injection` import | `initiatives.py:17` | P0 |
| BUG-02 | Fix version concurrency: `req.version + 1` | `initiatives.py:297` | P0 |
| BUG-03 | Encrypt initiative fields on create before insert | `initiatives.py:225-227` | P0 |
| BUG-04 | Apply safe-field filtering + decryption to list endpoint | `initiatives.py:265-271` | P0 |
| BUG-05 | Restore orphan project cleanup on create failure | `initiatives.py:239-248` | P0 |
| BUG-06 | Add `_maybe_encrypt_prd` and apply in `update_prd` | `initiatives.py:395` | P0 |
| BUG-07 | Fix PRD CAS: distinguish 404 vs 409 | `initiatives.py:400-401` | P1 |
| BUG-08 | Restrict approve to `FAILED` only | `initiatives.py:485` | P1 |
| SEC-01 | Sanitize `generationError` in frontend | `InitiativeLayout.tsx:214` | P0 |
| SEC-02 | Restore Redis-backed rate limiter | `initiatives.py` | P1 |
| SEC-03 | Restore production origin rejection | `initiatives.py:86` | P1 |
| FE-01 | Restore cancel button + backend endpoint | `InitiativeLayout.tsx`, `initiatives.py` | P1 |
| FE-02 | Restore loading skeletons | `InitiativeLayout.tsx` | P2 |
| FE-03 | Verify `prompt` removed from TS interface | `InitiativesListPage.tsx` | P2 |

### Operational

| ID | Action | Priority |
|----|--------|----------|
| OPS-01 | Execute backend tests in CI | HIGH |
| OPS-02 | Run frontend lint/typecheck | HIGH |
| OPS-03 | Execute encryption rotation for existing plaintext | MEDIUM |
| OPS-04 | Add export safe-field projections for child docs | MEDIUM |

---

## APPENDIX: KEY FILES

| File | Lines | Role |
|------|-------|------|
| `backend/api/initiatives.py` | 1-628 | HTTP + WS router — **REGRESSED** |
| `backend/core/pm_models.py` | 1-395 | Pydantic models + PRDComment/Approval |
| `backend/core/permissions.py` | 1-101 | Role-based access checks |
| `backend/services/pm_ws_manager.py` | 1-173 | WS auth + pub/sub |
| `backend/services/pm_notifications.py` | 1-61 | In-app + Slack notifications |
| `backend/core/database.py` | 101-222 | Indexes including new PM collections |
| `backend/scripts/migrate_initiative_fields.py` | 1-78 | Migration/backfill script |
| `backend/scripts/rotate_initiative_encryption.py` | 1-92 | Encryption rotation utility |
| `backend/tests/test_initiatives_api.py` | 1-339 | Initiative API tests |
| `frontend/src/pages/pm/InitiativesListPage.tsx` | 1-814 | List + create UI |
| `frontend/src/pages/pm/InitiativeLayout.tsx` | 1-268 | Detail shell + tabs — **PARTIALLY REGRESSED** |
| `frontend/src/pages/pm/OverviewTab.tsx` | 1-440 | Strategy, PRD, comments, approvals |
| `frontend/src/lib/pmApi.ts` | 1-112 | API client |
| `frontend/src/store/pmStore.ts` | 1-165 | Zustand state |
| `frontend/src/hooks/usePMSocket.ts` | 1-119 | WebSocket lifecycle |
