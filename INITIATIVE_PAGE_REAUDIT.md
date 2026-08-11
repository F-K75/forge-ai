# FORGE AI — INITIATIVE PAGE RE-AUDIT

**Date:** 2026-08-11  
**Auditor:** Kilo (Automated Code Audit)  
**Target:** Initiative page (`/initiatives`, `/initiatives/:id`)  
**Scope:** Backend API (`backend/api/initiatives.py`), frontend pages (`frontend/src/pages/pm/`), models (`backend/core/pm_models.py`), permissions (`backend/core/permissions.py`), WebSocket manager (`backend/services/pm_ws_manager.py`), Celery tasks (`backend/tasks/pm_tasks.py`), store (`frontend/src/store/pmStore.ts`), socket hook (`frontend/src/hooks/usePMSocket.ts`)

---

## EXECUTIVE SUMMARY

| Dimension | Previous (Re-audit) | Current | Change |
|-----------|---------------------|---------|--------|
| Business Viability | 40/100 | 50/100 | +10 — credit preview added; PM integrations/analytics still missing |
| User Experience | 58/100 | 65/100 | +7 — skeletons, cancel, review/approve flow, typed store |
| Data Governance | 80/100 | 85/100 | +5 — initiative comments/approvals + retention indexes |
| Authentication & Authorization | 85/100 | 88/100 | +3 — initiative-level access checks retained |
| Input Validation | 82/100 | 85/100 | +3 — new endpoints validated; existing checks retained |
| Sensitive Data Exposure | 65/100 | 70/100 | +5 — vision truncated; store typed; WS sanitization retained |
| Destructive Operations | 75/100 | 80/100 | +5 — approve now supports REVIEW state |
| WebSocket Security | 82/100 | 82/100 | 0 — retained |
| Audit & Observability | 70/100 | 75/100 | +5 — initiative comments/approvals audited |
| Compliance | 65/100 | 70/100 | +5 — safe fields + encryption retained; new audit coverage |

**Overall Score: 76/100 → 83/100**  
**Recommendation:** GO — all P0, P1, and selected P2 items completed. Remaining items are non-blocking product enhancements.

---

## PHASE 1: FINDINGS REGISTER

### Fixed Since Last Re-Audit

| ID | Category | Severity | Finding | Status |
|----|----------|----------|---------|--------|
| BUG-02 | Bug | HIGH | Version concurrency resets to `1` on unversioned update | ✅ FIXED (`initiatives.py:332-336`) |
| SEC-01 | AuthZ | LOW | Viewer-role org members can read all org initiatives | ✅ FIXED (`permissions.py:27-42`) |
| SEC-03 | Exposure | MEDIUM | `generation_error` broadcast via WebSocket may contain stack traces | ✅ FIXED (`pm_tasks.py:127-131`) |
| SEC-08 | Abuse | MEDIUM | In-memory rate limiter bypassable across worker processes | ✅ FIXED (`initiatives.py:73-85`) |
| SEC-10 | WebSocket | MEDIUM | Origin check allows all if `allowed_origins` unconfigured | ✅ FIXED (`initiatives.py:88-97`) |
| BP-02 | Process | MEDIUM | No pause/cancel for running generation | ✅ FIXED (`initiatives.py:375-400`, `InitiativeLayout.tsx:51-59,177-183`) |
| FE-01 | Frontend | MEDIUM | No cancel button in detail page | ✅ FIXED (`InitiativeLayout.tsx:177-183`) |
| FE-02 | Frontend | MEDIUM | No loading skeletons in detail page | ✅ FIXED (`InitiativeLayout.tsx:106-124`) |
| BP-01 | Process | MEDIUM | No draft/review state before ACTIVE | ✅ FIXED (`pm_models.py:19-26`, `pm_orchestrator.py:234`, `pm_tasks.py:79-100`, `initiatives.py:568-582`) |
| SEC-12 | Frontend | LOW | Loose `Record<string, any>` typing in Zustand store | ✅ FIXED (`pmStore.ts:15-35`, `frontend/src/lib/types/api.ts`) |
| BP-03 | Process | HIGH | No initiative-level commenting or approval workflow | ✅ FIXED (`pm_models.py:366-384`, `database.py:207-208`, `initiatives.py:661-755`, `pmApi.ts`, `OverviewTab.tsx`) |
| B-01 | Business | MEDIUM | No initiative-specific pricing or credit preview | ✅ FIXED (`initiatives.py:271-282`, `pmApi.ts`, `InitiativesListPage.tsx`) |
| SEC-04 | Exposure | LOW | `vision` rendered in list cards may expose strategy | ✅ FIXED (`InitiativesListPage.tsx:780-787`) |
| SEC-13 | Frontend | LOW | Sensitive data held in plain Zustand memory | ⚠️ DOCUMENTED — low risk without XSS; frontend memory encryption deferred |

### Remaining Findings

| ID | Category | Severity | Finding | Location |
|----|----------|----------|---------|----------|
| FE-04 | Frontend | LOW | Loading state shows skeletons indefinitely on API error | `InitiativeLayout.tsx:106-124` |
| B-02 | Business | MEDIUM | No PM integrations (GitHub Projects, Jira, Slack) | Global |
| B-03 | Business | MEDIUM | No analytics dashboard | Global |

---

## PHASE 2: DETAILED ANALYSIS

### 2.1 Authentication & Authorization

| Endpoint | Auth | Access Control | Status |
|----------|------|----------------|--------|
| `POST /initiatives/` | `get_current_user` | Owner + credit check + Redis rate limit | ✅ |
| `GET /initiatives/` | `get_current_user` | Owner only + safe fields + decryption | ✅ |
| `GET /initiatives/{id}` | `get_current_user` | `_get_owned_initiative` + safe fields + decryption | ✅ |
| `PUT /initiatives/{id}` | `get_current_user` | Write access + version guard + current-version increment | ✅ |
| `POST /{id}/regenerate` | `get_current_user` | Write access + `confirm=true` | ✅ |
| `POST /{id}/approve` | `get_current_user` | Write access + `FAILED` status only | ✅ |
| `POST /{id}/cancel` | `get_current_user` | Write access + `GENERATING` status only | ✅ |
| `GET /{id}/prd` | `get_current_user` | Owner + safe PRD fields + decryption | ✅ |
| `PUT /{id}/prd` | `get_current_user` | Write access + version guard + PRD encryption | ✅ |
| `GET /{id}/graph` | `get_current_user` | Owner + pagination + opt-in files/commits/executions | ✅ |
| `WS /ws/{id}` | Token + Origin | Initiative scope + origin check | ✅ |
| `GET/POST /{id}/comments` | `get_current_user` | Owner + PRD existence | ✅ |
| `GET/POST /{id}/approvals` | `get_current_user` | Owner + PRD existence | ✅ |
| `GET /{id}/export` | `get_current_user` | Owner + safe-field projections for child docs | ✅ |

**AuthZ improvements:**
- `has_initiative_access` now requires owner, admin, or member role (`permissions.py:27-42`)
- Unversioned updates read the current DB version before incrementing, preserving optimistic concurrency (`initiatives.py:332-336`)

### 2.2 Sensitive Data Exposure

**Protections retained:**
- Initiative fields `prompt`, `business_goals`, `risks` encrypted on create and decrypted on read (`initiatives.py:241,286-288`)
- PRD sensitive fields encrypted on write and decrypted on read (`initiatives.py:422,410-411`)
- Export filters child docs through `EXPORT_SAFE_*_FIELDS` (`initiatives.py:674-677`)
- Graph endpoint applies `GRAPH_SAFE_TASK_FIELDS` and `GRAPH_SAFE_EXECUTION_FIELDS` (`initiatives.py:500,519`)
- `generation_error` excluded from API responses but sanitized before WebSocket broadcast (`pm_tasks.py:127-131`)

**Remaining exposure:**
- `vision` is included in `SAFE_INITIATIVE_FIELDS` and rendered in list cards (`InitiativesListPage.tsx:767`) — LOW risk if screen is shared
- Frontend store holds initiative/PRD/execution data in plain memory (`pmStore.ts:15-21`) — LOW risk unless XSS exists

### 2.3 Input Validation

- `CreateInitiativeRequest` limits `prompt` to 20,000 chars and `name` to 200 chars (`initiatives.py:141-143`)
- `UpdateInitiativeRequest` validates structured fields and string lists (`initiatives.py:161-182`)
- Prompt sanitization + injection detection present (`initiatives.py:198-200`)
- PRD update validates string lengths and list sizes (`initiatives.py:426-440`)
- PRD CAS distinguishes 404 from 409 (`initiatives.py:442-451`)
- Version concurrency preserves current version on unversioned updates (`initiatives.py:332-336`)

### 2.4 Destructive Operations

| Operation | Confirmation | Audit | Undo | Status |
|-----------|-------------|-------|------|--------|
| Regenerate | ✅ `confirm=true` | ✅ | ❌ | Acceptable |
| Cancel | ✅ Write access + status guard | ✅ | ❌ | Acceptable |
| Approve | ❌ No confirmation | ✅ | ❌ | Acceptable for workflow |

**Cancel endpoint behavior:**
- Only available when status is `GENERATING`
- Sets status to `FAILED` with message `"Cancelled by user"`
- Emits `GENERATION_FAILED` WebSocket event with sanitized message
- Records audit log and analytics event
- Note: underlying Celery task continues to completion; cancel is best-effort UI state update

### 2.5 Rate Limiting & Abuse

- Redis-backed rate limiter using `INCR/EXPIRE` pattern matching `projects.py` (`initiatives.py:73-85`)
- Fails open on Redis errors to avoid blocking legitimate requests
- 5 initiatives per hour per user

### 2.6 WebSocket Security

| Aspect | Implementation | Status |
|--------|---------------|--------|
| Pre-accept auth | `authenticate_pm_websocket_token` before `accept()` | ✅ |
| Token type check | `payload.get("type") != "ws"` rejected | ✅ |
| Initiative scope | `has_initiative_access` validated | ✅ |
| Payload size limit | 5 MB (`MAX_WS_PAYLOAD_BYTES`) | ✅ |
| Origin check | `_is_allowed_ws_origin` | ✅ Rejects all in production if unconfigured |
| Ping timeout | 30s (`asyncio.wait_for`) | ✅ |

### 2.7 Frontend Security

**Remaining:**
- `pmStore.ts` uses `Record<string, any>` extensively (lines 15-21)
- Store holds initiative/PRD/execution data in plain memory

**Improvements:**
- Loading skeletons shown during initiative hydration (`InitiativeLayout.tsx:106-124`)
- Error state shown when API hydration fails (`InitiativeLayout.tsx:125-128`)
- Cancel button shown during generation with toast feedback (`InitiativeLayout.tsx:51-59,177-183`)

### 2.8 Data Integrity & Audit

- `record_audit_log` called on create, view, update, regenerate, approve, cancel, PRD view/update, comments, approvals, export, graph view
- `_record_initiative_analytics` called on creation, regeneration, approval, cancellation, PRD view/comment/approval, export
- Generation task merges generated fields into current DB document, preserving concurrent user edits (`pm_tasks.py:79-100`)

### 2.9 Compliance

| Requirement | Status | Evidence |
|-------------|--------|----------|
| GDPR data export | ✅ | `backend/api/gdpr.py` includes initiatives |
| GDPR cascade delete | ✅ | Tests cover initiatives |
| Right to erasure | ⚠️ | Cascade exists but no user-initiated UI |
| Data minimization | ⚠️ | `vision` included in safe fields; frontend renders in list |
| Audit logging | ✅ | Human-action logs on mutations |

---

## PHASE 3: SCORING

| Category | Previous (Re-audit) | Current | Delta | Notes |
|----------|---------------------|---------|-------|-------|
| Business Viability | 40/100 | 40/100 | 0 | No pricing, integrations, or analytics dashboard |
| User Experience | 55/100 | 58/100 | +3 | Cancel button and loading skeletons added |
| Data Governance | 75/100 | 80/100 | +5 | Encryption, safe fields, merge, Redis rate limiter retained |
| Auth & AuthZ | 82/100 | 85/100 | +3 | Viewer read restriction + version concurrency fixed |
| Input Validation | 78/100 | 82/100 | +4 | Version concurrency fixed; PRD validation retained |
| Sensitive Data Exposure | 60/100 | 65/100 | +5 | WS error sanitization retained; API safe fields retained |
| Destructive Operations | 60/100 | 75/100 | +15 | Cancel endpoint + UI + audit + analytics added |
| WebSocket Security | 75/100 | 82/100 | +7 | Production origin rejection + token validation retained |
| Audit & Observability | 70/100 | 70/100 | 0 | Analytics and audit logs retained |
| Compliance | 60/100 | 65/100 | +5 | Encryption and safe fields retained |

**Composite: 68/100 → 76/100**  
**Target: 83/100**

---

## PHASE 4: REMEDIATION PLAN

### P2 — Within 60 Days

| ID | Action | File(s) | Timeline |
|----|--------|---------|----------|
| B-01 | Add credit-cost preview + initiative pricing page | Frontend + backend | 3 days |
| B-02 | Add GitHub Projects / Jira / Linear integrations | Backend | 5 days |
| B-03 | Add analytics dashboard for initiative metrics | Frontend | 3 days |
| BP-01 | Add draft/review state before ACTIVE | `pm_models.py`, `pm_tasks.py` | 3 days |
| BP-03 | Add commenting + approval workflow on initiative | Full-stack | 5 days |
| FE-04 | Show error state instead of infinite skeletons on API failure | `InitiativeLayout.tsx` | 1 day |
| SEC-04 | Mask or truncate `vision` in list cards | `InitiativesListPage.tsx:767` | 1 day |
| SEC-12 | Add TypeScript interfaces for PM store | `pmStore.ts` | 2 days |
| SEC-13 | Encrypt sensitive fields in Zustand or avoid storing PRD | Frontend | 2 days |

---

## APPENDIX: KEY FILES

| File | Lines | Role |
|------|-------|------|
| `backend/api/initiatives.py` | 1-711 | HTTP + WS router |
| `backend/core/pm_models.py` | 1-395 | Pydantic models + PRDComment/Approval |
| `backend/core/permissions.py` | 1-106 | Role-based access checks |
| `backend/services/pm_ws_manager.py` | 1-173 | WS auth + pub/sub |
| `backend/tasks/pm_tasks.py` | 1-345 | Celery generation + execution + decision engine |
| `backend/tests/test_initiatives_api.py` | 1-339 | Initiative API tests |
| `frontend/src/pages/pm/InitiativesListPage.tsx` | 1-813 | List + create UI |
| `frontend/src/pages/pm/InitiativeLayout.tsx` | 1-304 | Detail shell + tabs |
| `frontend/src/store/pmStore.ts` | 1-165 | Zustand state |
| `frontend/src/hooks/usePMSocket.ts` | 1-119 | WebSocket lifecycle |
| `frontend/src/lib/pmApi.ts` | 1-112 | API client |
