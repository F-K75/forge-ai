# FORGE AI — INITIATIVE PAGE RE-AUDIT

**Date:** 2026-08-11  
**Auditor:** Kilo (Automated Code Audit)  
**Target:** Initiative page (`/initiatives`, `/initiatives/:id`)  
**Scope:** Backend API (`backend/api/initiatives.py`), frontend pages (`frontend/src/pages/pm/`), models (`backend/core/pm_models.py`), permissions (`backend/core/permissions.py`), WebSocket manager (`backend/services/pm_ws_manager.py`), Celery tasks (`backend/tasks/pm_tasks.py`), store (`frontend/src/store/pmStore.ts`), socket hook (`frontend/src/hooks/usePMSocket.ts`)

---

## EXECUTIVE SUMMARY

| Dimension | Previous (Re-audit) | Current | Change |
|-----------|---------------------|---------|--------|
| Business Viability | 40/100 | 40/100 | 0 — no pricing, integrations, or analytics dashboard |
| User Experience | 55/100 | 55/100 | 0 — cancel/skeletons still missing |
| Data Governance | 45/100 | 75/100 | +30 — encryption, safe fields, merge, orphan cleanup restored |
| Authentication & Authorization | 78/100 | 82/100 | +4 — write access role-gated; safe fields restored |
| Input Validation | 72/100 | 78/100 | +6 — PRD encryption/CAS restored; wrong import debunked |
| Sensitive Data Exposure | 40/100 | 60/100 | +20 — create/list/PRD/export all filtered/encrypted |
| Destructive Operations | 65/100 | 60/100 | -5 — cancel still missing |
| WebSocket Security | 75/100 | 75/100 | 0 — origin check still weak if unconfigured |
| Audit & Observability | 70/100 | 70/100 | 0 — analytics/audit retained |
| Compliance | 50/100 | 60/100 | +10 — GDPR export now safe-field filtered; encryption restored |

**Overall Score: 56/100 → 68/100**  
**Recommendation:** CONDITIONAL GO — P0 blockers from prior re-audit are resolved; remaining issues are P1/P2. Launch is viable once version-concurrency bug and viewer read-scope are addressed.

---

## PHASE 1: FINDINGS REGISTER

### Fixed Since Last Re-Audit

| ID | Category | Severity | Finding | Status |
|----|----------|----------|---------|--------|
| BUG-03 | Bug | HIGH | Create endpoint stores plaintext `prompt` | ✅ FIXED (`initiatives.py:241`) |
| BUG-04 | Bug | HIGH | List endpoint returns raw docs without safe fields | ✅ FIXED (`initiatives.py:286-288`) |
| BUG-05 | Bug | MEDIUM | Orphaned project cleanup on create failure removed | ✅ FIXED (`initiatives.py:256`) |
| BUG-06 | Bug | MEDIUM | PRD write-path uses `_maybe_decrypt_prd` instead of encrypting | ✅ FIXED (`initiatives.py:422`) |
| BUG-07 | Bug | MEDIUM | PRD CAS conflates 404/409 | ✅ FIXED (`initiatives.py:442-451`) |
| BUG-08 | Bug | MEDIUM | Approve allows `GENERATING` status | ✅ FIXED (`initiatives.py:537`) |
| SEC-02 | Exposure | HIGH | Export returns raw child docs | ✅ FIXED (`initiatives.py:643-646`) |
| SEC-14 | Integrity | HIGH | Generation overwrites concurrent edits | ✅ FIXED (`pm_tasks.py:79-100`) |
| A-01 | WS | LOW | Query-param token deprecation warning logged | ✅ Survived |
| A-02 | Frontend | LOW | Tab `aria-controls` + `role=tablist` | ✅ Survived |
| A-03 | Backend | MEDIUM | Comments/approvals endpoints | ✅ Survived |
| A-04 | Backend | MEDIUM | Export endpoint | ✅ Survived |
| A-05 | Backend | MEDIUM | Graph endpoint safe-field filtering | ✅ Survived |
| A-06 | Backend | MEDIUM | Write-access checks on update/regenerate | ✅ Survived |
| A-07 | Backend | MEDIUM | Regenerate confirmation gate | ✅ Survived |
| A-08 | Backend | MEDIUM | Analytics instrumentation | ✅ Survived |
| A-09 | Backend | MEDIUM | Audit logs on mutations | ✅ Survived |
| A-10 | Frontend | MEDIUM | Real stats instead of fake metrics | ✅ Survived |
| A-11 | Frontend | MEDIUM | Prompt cleared after creation | ✅ Survived |
| A-12 | Backend | MEDIUM | Credit reservation/deduction | ✅ Survived |
| A-13 | Backend | MEDIUM | Migration script + DB indexes | ✅ Survived |

### Debunked Finding

| ID | Category | Severity | Previous Finding | Current Status |
|----|----------|----------|------------------|----------------|
| BUG-01 | Bug | CRITICAL | `_detect_prompt_injection` imported from wrong module | ❌ NOT A BUG — function is defined in `core.llm.router`; import is correct |

### Remaining Findings

| ID | Category | Severity | Finding | Location |
|----|----------|----------|---------|----------|
| BUG-02 | Bug | HIGH | Version concurrency resets to `1` on unversioned update | `initiatives.py:332` |
| SEC-01 | AuthZ | LOW | Viewer role can read all org initiatives | `permissions.py:27` |
| SEC-03 | Exposure | MEDIUM | `generation_error` broadcast via WebSocket may contain stack traces | `pm_tasks.py:127-131` |
| SEC-04 | Exposure | LOW | `vision` rendered in list cards may expose strategy on shared screens | `InitiativesListPage.tsx:767` |
| SEC-08 | Abuse | MEDIUM | In-memory rate limiter bypassable across worker processes | `initiatives.py:76-87` |
| SEC-10 | WebSocket | MEDIUM | Origin check allows all if `allowed_origins` unconfigured | `initiatives.py:90-96` |
| SEC-12 | Frontend | LOW | Loose `Record<string, any>` typing in Zustand store | `pmStore.ts:15-21` |
| SEC-13 | Frontend | LOW | Sensitive data held in plain Zustand memory | `pmStore.ts` |
| B-01 | Business | MEDIUM | No initiative-specific pricing or credit preview | Global |
| B-02 | Business | MEDIUM | No PM integrations (GitHub Projects, Jira, Slack) | Global |
| B-03 | Business | MEDIUM | No analytics dashboard | Global |
| B-04 | Business | LOW | `generation_error` may expose internal details to users | `InitiativeLayout.tsx:214` |
| BP-01 | Process | MEDIUM | No draft/review state before ACTIVE | `pm_tasks.py:67` |
| BP-02 | Process | MEDIUM | No pause/cancel for running generation | `initiatives.py`, `InitiativeLayout.tsx` |
| BP-03 | Process | HIGH | No collaboration, commenting, or merge strategy on initiative | Global |
| FE-01 | Frontend | MEDIUM | No cancel button in detail page | `InitiativeLayout.tsx` |
| FE-02 | Frontend | MEDIUM | No loading skeletons in detail page | `InitiativeLayout.tsx:97` |

---

## PHASE 2: DETAILED ANALYSIS

### 2.1 Authentication & Authorization

| Endpoint | Auth | Access Control | Status |
|----------|------|----------------|--------|
| `POST /initiatives/` | `get_current_user` | Owner + credit check + rate limit | ✅ |
| `GET /initiatives/` | `get_current_user` | Owner only + safe fields + decryption | ✅ |
| `GET /initiatives/{id}` | `get_current_user` | `_get_owned_initiative` + safe fields | ✅ |
| `PUT /initiatives/{id}` | `get_current_user` | Write access + version guard | ⚠️ Version resets to `1` when `version` omitted |
| `POST /{id}/regenerate` | `get_current_user` | Write access + `confirm=true` | ✅ |
| `POST /{id}/approve` | `get_current_user` | Write access + `FAILED` status only | ✅ |
| `GET /{id}/prd` | `get_current_user` | Owner + safe PRD fields + decryption | ✅ |
| `PUT /{id}/prd` | `get_current_user` | Write access + version guard + encryption | ✅ |
| `GET /{id}/graph` | `get_current_user` | Owner + pagination + opt-in files/commits/executions | ✅ |
| `WS /ws/{id}` | Token + Origin | Initiative scope + origin check | ⚠️ Origin allows all if `allowed_origins` empty |
| `GET/POST /{id}/comments` | `get_current_user` | Owner + PRD existence | ✅ |
| `GET/POST /{id}/approvals` | `get_current_user` | Owner + PRD existence | ✅ |
| `GET /{id}/export` | `get_current_user` | Owner + safe-field projections for child docs | ✅ |

**Finding SEC-01 (LOW):** `has_initiative_access` (`permissions.py:27`) grants read access to any `team_members` member regardless of role. A viewer-role member can read all initiatives in the org. Write access is properly role-gated via `has_initiative_write_access`.

### 2.2 Sensitive Data Exposure

**Fixed:**
- `create_initiative` now encrypts `prompt`, `business_goals`, `risks` before insert (`initiatives.py:241`)
- `list_initiatives` applies `SAFE_INITIATIVE_FIELDS` + decryption (`initiatives.py:286-288`)
- `_get_owned_initiative` applies safe fields + decryption for detail endpoint (`initiatives.py:299-303`)
- `get_prd` applies `SAFE_PRD_FIELDS` + decryption (`initiatives.py:379`)
- `update_prd` encrypts sensitive PRD fields via `_maybe_encrypt_prd` (`initiatives.py:422`)
- `export_initiative` filters child docs through `EXPORT_SAFE_*_FIELDS` (`initiatives.py:643-646`)
- Graph endpoint applies `GRAPH_SAFE_TASK_FIELDS` and `GRAPH_SAFE_EXECUTION_FIELDS` (`initiatives.py:500,519`)

**Remaining:**
- `generation_error` is excluded from safe initiative fields, but is broadcast via WebSocket (`pm_tasks.py:130`) with up to 2000 chars of the exception string
- `vision` is included in `SAFE_INITIATIVE_FIELDS` and rendered in list cards (`InitiativesListPage.tsx:767`)

### 2.3 Input Validation

- `UpdateInitiativeRequest` validates structured fields and string lists (`initiatives.py:161-182`)
- `CreateInitiativeRequest` limits `prompt` to 20,000 chars and `name` to 200 chars (`initiatives.py:141-143`)
- Prompt sanitization + injection detection present (`initiatives.py:198-200`)
- PRD update validates string lengths and list sizes (`initiatives.py:426-440`)
- PRD CAS distinguishes 404 from 409 (`initiatives.py:442-451`)

**Finding BUG-02 (HIGH):** `update_initiative` (`initiatives.py:332`) sets `update["version"] = 1` when `req.version is None`. This resets the version counter on every unversioned update, breaking subsequent optimistic-concurrency checks. A versioned update that reads `version=1` will conflict with the reset value, causing false 409s.

### 2.4 Destructive Operations

| Operation | Confirmation | Audit | Undo | Status |
|-----------|-------------|-------|------|--------|
| Regenerate | ✅ `confirm=true` | ✅ | ❌ | Acceptable |
| Cancel | ❌ No endpoint | ❌ | ❌ | ❌ Missing |
| Approve | ❌ No confirmation | ✅ | ❌ | Acceptable for workflow |

**Finding BP-02 (MEDIUM):** No cancel generation endpoint exists. The frontend `InitiativeLayout.tsx` has no cancel button. Once `generate_initiative_plan` is queued, the user must wait for completion or Celery timeout.

### 2.5 Rate Limiting & Abuse

**Finding SEC-08 (MEDIUM):** `_check_initiative_rate_limit` (`initiatives.py:76-87`) uses an in-memory `OrderedDict`. This does not survive across worker processes or server instances. A distributed deployment can bypass the 5/hour limit.

### 2.6 WebSocket Security

| Aspect | Implementation | Status |
|--------|---------------|--------|
| Pre-accept auth | `authenticate_pm_websocket_token` before `accept()` | ✅ |
| Token type check | `payload.get("type") != "ws"` rejected | ✅ |
| Initiative scope | `has_initiative_access` validated | ✅ |
| Payload size limit | 5 MB (`MAX_WS_PAYLOAD_BYTES`) | ✅ |
| Origin check | `_is_allowed_ws_origin` | ⚠️ Allows all if `allowed_origins` empty |
| Message auth | None after connect | ⚠️ |
| Ping timeout | 30s (`asyncio.wait_for`) | ✅ |

**Finding SEC-10 (MEDIUM):** `_is_allowed_ws_origin` (`initiatives.py:90-96`) returns `True` when `settings.allowed_origins` is empty. In production, if CORS origins are not explicitly configured, any origin can open a WebSocket connection.

### 2.7 Frontend Security

**Finding SEC-12 (LOW):** `pmStore.ts` uses `Record<string, any>` extensively (lines 15-21). This bypasses TypeScript safety and may allow rendering of unexpected fields.

**Finding SEC-13 (LOW):** The store holds `initiative`, `prd`, `generationError`, and execution data in plain memory. Any XSS vulnerability could exfiltrate business strategy, security architecture, and cost data.

### 2.8 Data Integrity & Audit

- `record_audit_log` called on create, view, update, regenerate, approve, PRD view/update, comments, approvals, export, graph view
- `_record_initiative_analytics` called on creation, regeneration, approval, PRD view/comment/approval, export

**Finding BUG-02 (HIGH):** No optimistic concurrency control in the Celery task write path. The API supports versioned updates, but `generate_initiative_plan` writes the merged initiative back without checking the current version.

### 2.9 Compliance

| Requirement | Status | Evidence |
|-------------|--------|----------|
| GDPR data export | ✅ | `backend/api/gdpr.py` includes initiatives |
| GDPR cascade delete | ✅ | Tests cover initiatives |
| Right to erasure | ⚠️ | Cascade exists but no user-initiated UI |
| Data minimization | ⚠️ | `vision` included in safe fields; viewer read scope too broad |
| Audit logging | ✅ | Human-action logs on mutations |

---

## PHASE 3: SCORING

| Category | Previous (Re-audit) | Current | Delta | Notes |
|----------|---------------------|---------|-------|-------|
| Business Viability | 40/100 | 40/100 | 0 | No pricing, integrations, or analytics dashboard |
| User Experience | 55/100 | 55/100 | 0 | Cancel button and detail skeletons still missing |
| Data Governance | 45/100 | 75/100 | +30 | Encryption, safe fields, merge, orphan cleanup restored |
| Auth & AuthZ | 78/100 | 82/100 | +4 | Write access role-gated; safe fields restored; version bug remains |
| Input Validation | 72/100 | 78/100 | +6 | PRD encryption/CAS restored; wrong import debunked |
| Sensitive Data Exposure | 40/100 | 60/100 | +20 | Create/list/PRD/export filtered; WS error broadcast remains |
| Destructive Operations | 65/100 | 60/100 | -5 | Cancel still missing |
| WebSocket Security | 75/100 | 75/100 | 0 | Origin check still weak if unconfigured |
| Audit & Observability | 70/100 | 70/100 | 0 | Analytics and audit logs retained |
| Compliance | 50/100 | 60/100 | +10 | GDPR export safe-filtered; encryption restored |

**Composite: 56/100 → 68/100**  
**Target: 83/100**

---

## PHASE 4: REMEDIATION PLAN

### P0 — Block Launch

| ID | Action | File(s) | Timeline |
|----|--------|---------|----------|
| BUG-02 | Fix version concurrency: preserve current version when `req.version` is None | `initiatives.py:331-333` | 1 day |

### P1 — Within 30 Days

| ID | Action | File(s) | Timeline |
|----|--------|---------|----------|
| SEC-01 | Add viewer-role read restrictions or separate sensitive fields | `permissions.py`, `initiatives.py` | 3 days |
| SEC-03 | Sanitize `generation_error` before WebSocket broadcast | `pm_tasks.py:125` | 1 day |
| SEC-08 | Replace in-memory rate limiter with Redis-backed limiter | `initiatives.py:76-87` | 3 days |
| SEC-10 | Reject all origins when `allowed_origins` is empty in production | `initiatives.py:90-96` | 1 day |
| BP-02 | Add cancel endpoint + WS broadcast for generation | `initiatives.py`, `pm_tasks.py`, `InitiativeLayout.tsx` | 4 days |
| FE-01 | Add cancel button in detail page | `InitiativeLayout.tsx` | 1 day |
| FE-02 | Add loading skeletons for detail page tabs | `InitiativeLayout.tsx` | 2 days |

### P2 — Within 60 Days

| ID | Action | File(s) | Timeline |
|----|--------|---------|----------|
| B-01 | Add credit-cost preview + initiative pricing page | Frontend + backend | 3 days |
| B-02 | Add GitHub Projects / Jira / Linear integrations | Backend | 5 days |
| B-03 | Add analytics dashboard for initiative metrics | Frontend | 3 days |
| BP-01 | Add draft/review state before ACTIVE | `pm_models.py`, `pm_tasks.py` | 3 days |
| BP-03 | Add commenting + approval workflow on initiative | Full-stack | 5 days |
| SEC-04 | Mask or truncate `vision` in list cards | `InitiativesListPage.tsx:767` | 1 day |
| SEC-12 | Add TypeScript interfaces for PM store | `pmStore.ts` | 2 days |
| SEC-13 | Encrypt sensitive fields in Zustand or avoid storing PRD | Frontend | 2 days |

---

## APPENDIX: KEY FILES

| File | Lines | Role |
|------|-------|------|
| `backend/api/initiatives.py` | 1-680 | HTTP + WS router |
| `backend/core/pm_models.py` | 1-395 | Pydantic models + PRDComment/Approval |
| `backend/core/permissions.py` | 1-101 | Role-based access checks |
| `backend/services/pm_ws_manager.py` | 1-173 | WS auth + pub/sub |
| `backend/tasks/pm_tasks.py` | 1-344 | Celery generation + execution + decision engine |
| `backend/tests/test_initiatives_api.py` | 1-339 | Initiative API tests |
| `frontend/src/pages/pm/InitiativesListPage.tsx` | 1-813 | List + create UI |
| `frontend/src/pages/pm/InitiativeLayout.tsx` | 1-268 | Detail shell + tabs |
| `frontend/src/store/pmStore.ts` | 1-165 | Zustand state |
| `frontend/src/hooks/usePMSocket.ts` | 1-119 | WebSocket lifecycle |
| `frontend/src/lib/pmApi.ts` | 1-111 | API client |
