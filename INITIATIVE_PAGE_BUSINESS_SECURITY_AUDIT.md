# FORGE AI — INITIATIVE PAGE BUSINESS-TO-SECURITY AUDIT

**Date:** 2026-08-11  
**Auditor:** Kilo (Automated Code Audit)  
**Target:** Initiative page (`/initiatives`, `/initiatives/:id`)  
**Scope:** Backend API (`backend/api/initiatives.py`), frontend pages (`frontend/src/pages/pm/`), models (`backend/core/pm_models.py`), permissions (`backend/core/permissions.py`), WebSocket manager (`backend/services/pm_ws_manager.py`), Celery tasks (`backend/tasks/pm_tasks.py`), store (`frontend/src/store/pmStore.ts`), socket hook (`frontend/src/hooks/usePMSocket.ts`)  

---

## EXECUTIVE SUMMARY

| Dimension | Score | Status |
|-----------|-------|--------|
| Business Viability | 22/100 | ❌ Not viable — fake metrics, no pricing, no GTM |
| User Experience | 45/100 | ⚠️ Polished shell but shallow functionality |
| Data Governance | 35/100 | ❌ Exposes sensitive internal artifacts without scoping |
| Authentication & Authorization | 75/100 | ✅ Server-enforced ownership + org membership |
| Input Validation | 60/100 | ⚠️ Length limits only; rich-text fields unvalidated |
| Sensitive Data Exposure | 30/100 | ❌ PRD, graph, and initiative docs over-expose internals |
| Destructive Operations | 40/100 | ❌ Regeneration deletes children without confirmation or audit |
| WebSocket Security | 70/100 | ✅ Token auth pre-accept; payload size capped |
| Audit & Observability | 25/100 | ❌ No initiative-scoped audit log, no versioning |
| Compliance | 40/100 | ⚠️ GDPR export exists but initiative-scoped controls unverified |

**Overall Score: 42/100**  
**Recommendation:** CONDITIONAL GO — Block public launch until P0 security findings are remediated and business metrics are grounded in real data.

---

## PHASE 1: BUSINESS AUDIT

### 1.1 Value Proposition

| Element | Current State | Verdict |
|---------|---------------|---------|
| Positioning | "Turn Ideas into Production" — multi-agent AI product planning | ⚠️ Generic, identical to 8+ competitors |
| Differentiation | Agile PM layer (vision → PRD → epics → stories → sprints) | ✅ Technically unique but unvalidated |
| ROI claim | "18 seconds planning speed", "98% success rate", "A+ quality" | ❌ Fabricated — hardcoded in `InitiativesListPage.tsx` |
| Target customer | Undefined | ❌ README targets "developers" generically |

**Finding B-01 (HIGH):** The initiative page displays fabricated metrics (`HERO_STATS`, `QUICK_INSIGHTS`, `METRICS` in `InitiativesListPage.tsx:184-196`). These are static arrays with no backend binding. Presenting false success rates and planning speeds to users is deceptive and creates legal/reputational risk.

### 1.2 Revenue Model

| Element | Current State | Verdict |
|---------|---------------|---------|
| Pricing | Not defined for initiatives | ❌ No credit cost per generation |
| Free tier | 10 credits = full build for free | ❌ Abuse vector |
| Enterprise | No initiative-specific tiers | ❌ Missing |

**Finding B-02 (HIGH):** No credit reservation or consumption tracking occurs during initiative generation. The Celery task `generate_initiative_plan` (`pm_tasks.py:59`) runs without checking or deducting credits. This enables unlimited free generation.

### 1.3 Product-Market Fit

| Signal | Evidence | Status |
|--------|----------|--------|
| Active users | 0 proven | ❌ No analytics |
| Retention | N/A | ❌ No cohort tracking |
| NPS | N/A | ❌ No surveys |
| Organic growth | N/A | ❌ No referral tracking |

**Finding B-03 (MEDIUM):** No instrumentation tracks whether users complete generation, view PRDs, or return to initiatives. The WebSocket events emit stage transitions but no analytics events fire.

### 1.4 Competitive Positioning

| Competitor | Equivalent Feature | Forge Advantage | Gap |
|------------|-------------------|-----------------|-----|
| Linear | Epics/stories/sprints | AI-generated | No real-time collab |
| Jira | Full PM layer | Multi-agent | No integrations |
| Notion | Documents | PRD auto-gen | No block editing |
| Replit | Agent build | PM layer above build | No mobile |

**Finding B-04 (MEDIUM):** The initiative page competes with Linear/Jira but lacks integrations (GitHub Projects, Slack, Confluence). No export to common PM formats.

### 1.5 Trust & Transparency

| Element | Current State | Verdict |
|---------|---------------|---------|
| Model attribution | None | ❌ Users don't know which LLM generates the plan |
| Cost estimate | None | ❌ No preview of token cost or generation time |
| Failure transparency | `generation_error` stored but not surfaced in list | ⚠️ Only visible on detail page |
| Data ownership | Implied user-owned | ⚠️ Not stated in UI |

**Finding B-05 (MEDIUM):** When generation fails, the error is stored in `initiative.generation_error` and emitted via WebSocket, but the list page (`InitiativesListPage.tsx`) does not display failure reasons. Users see a generic "Failed" pill with no recovery guidance.

---

## PHASE 2: SECURITY AUDIT

### 2.1 Authentication & Authorization

| Endpoint | Auth Mechanism | Access Control | Status |
|----------|---------------|----------------|--------|
| `POST /initiatives/` | `get_current_user` | Owner only (`user_id`) | ✅ |
| `GET /initiatives/` | `get_current_user` | Owner only (`user_id` filter) | ✅ |
| `GET /initiatives/{id}` | `get_current_user` | `_get_owned_initiative` + `has_initiative_access` | ✅ |
| `PUT /initiatives/{id}` | `get_current_user` | `_get_owned_initiative` | ✅ |
| `POST /{id}/regenerate` | `get_current_user` | `_get_owned_initiative` | ✅ |
| `GET /{id}/prd` | `get_current_user` | `_get_owned_initiative` | ✅ |
| `PUT /{id}/prd` | `get_current_user` | `_get_owned_initiative` | ✅ |
| `GET /{id}/graph` | `get_current_user` | `_get_owned_initiative` | ✅ |
| `WS /ws/{id}` | `authenticate_pm_websocket_token` | `has_initiative_access` | ✅ |

**Authorization logic** (`permissions.py:27-37`):
```python
async def has_initiative_access(db, user_id: str, initiative: dict) -> bool:
    if initiative.get("user_id") == user_id:
        return True
    org_id = initiative.get("org_id")
    if not org_id:
        return False
    membership = await db.team_members.find_one({"org_id": org_id, "user_id": user_id}, {"_id": 0})
    return membership is not None
```

**Finding SEC-01 (LOW):** `has_initiative_access` grants access to any `team_members` member regardless of role. A viewer-role member can read/write/regenerate initiatives. No role-based distinction (owner/admin/member/viewer).

### 2.2 Sensitive Data Exposure

**Finding SEC-02 (HIGH):** `GET /initiatives/{id}` returns the full initiative document minus `_id` (`initiatives.py:106,115`). Exposed fields include:
- `prompt` — may contain proprietary business ideas, competitive strategy
- `generation_error` — may contain stack traces, internal service names, LLM provider details
- `project_ids` — reveals linked app-build projects
- `vision`, `business_goals`, `risks` — strategic planning data

**Finding SEC-03 (HIGH):** `GET /{id}/prd` returns the complete PRD document (`initiatives.py:150-155`), including:
- `security` — planned security architecture, auth flows, threat model
- `database_overview` — schema design, data model, relationships
- `api_overview` — endpoint contracts, authentication strategy
- `performance`, `scalability` — internal performance targets and bottlenecks

This is intellectual property that should not be exposed to casual API consumers.

**Finding SEC-04 (HIGH):** `GET /{id}/graph` returns full nested documents for epics, stories, tasks, and agent executions (`initiatives.py:203-243`), including:
- `task.generated_files` — file paths from AI-generated code (may leak server-side context)
- `task.github.commit_shas` — git commit hashes (can be used to inspect public repos)
- `execution.logs` — agent internal monologue, may contain secrets or sensitive reasoning
- `execution.cost_usd`, `tokens_used` — internal cost metrics

The graph endpoint has no field filter and no pagination. A single request returns all nested artifacts.

**Finding SEC-05 (MEDIUM):** The frontend list page (`InitiativesListPage.tsx:1052-1053`) renders `initiative.vision || initiative.prompt` in the card preview. If `vision` is empty, the raw user prompt is displayed in the list — this may contain sensitive product strategy visible on shared screens.

### 2.3 Input Validation

**Finding SEC-06 (MEDIUM):** `UpdateInitiativeRequest` (`initiatives.py:27-39`) accepts `roadmap`, `risks`, and `tech_stack` as `List[Dict[str, Any]]` / `List[str]` with no schema validation. An attacker can inject arbitrary nested objects that may:
- Trigger MongoDB query injection if downstream code interpolates these values
- Cause document size bloat (MongoDB 16MB limit per document)
- Inject XSS payloads if frontend renders these fields without sanitization

**Finding SEC-07 (LOW):** `CreateInitiativeRequest` limits `prompt` to 20,000 chars and `name` to 200 chars. However, no content sanitization is applied. Prompt injection inputs are stored as-is and later fed to LLM agents without re-validation.

### 2.4 Destructive Operations

**Finding SEC-08 (HIGH):** `POST /{id}/regenerate` performs bulk deletion of all child planning artifacts (`initiatives.py:136-140`):
```python
await db.prds.delete_many({"initiative_id": initiative_id})
await db.epics.delete_many({"initiative_id": initiative_id})
await db.stories.delete_many({"initiative_id": initiative_id})
await db.tasks.delete_many({"initiative_id": initiative_id})
await db.sprints.delete_many({"initiative_id": initiative_id})
```

This operation:
- Has no confirmation dialog in the frontend (`InitiativeLayout.tsx:36-43` calls API directly)
- Has no undo mechanism
- Has no audit trail (no `decision_log` entry, no user notification)
- Is idempotent in effect but not in intent — repeated clicks queue multiple Celery tasks
- Does not check for running agent executions that might be writing to these collections concurrently

### 2.5 Rate Limiting & Abuse

**Finding SEC-09 (MEDIUM):** No initiative-specific rate limiting exists. The global rate limiter applies, but an authenticated user can:
- Spam initiative creation (each queues a Celery task consuming LLM tokens)
- Trigger repeated regeneration (each triggers full plan regeneration)
- Flood the WebSocket channel with event emissions

**Finding SEC-10 (LOW):** No CAPTCHA, proof-of-work, or abuse scoring on initiative creation. The `prompt` field accepts any text, including LLM jailbreak prompts that may manipulate downstream agents.

### 2.6 WebSocket Security

| Aspect | Implementation | Status |
|--------|---------------|--------|
| Pre-accept auth | `authenticate_pm_websocket_token` before `accept()` | ✅ |
| Token type check | `payload.get("type") != "ws"` rejected | ✅ |
| Initiative scope | `has_initiative_access` validated | ✅ |
| Payload size limit | 5 MB (`MAX_WS_PAYLOAD_BYTES`) | ✅ |
| Origin check | None | ⚠️ |
| Message auth | None after connect | ⚠️ |
| Ping timeout | 30s (`asyncio.wait_for`) | ✅ |

**Finding SEC-11 (MEDIUM):** WebSocket connections are authenticated at handshake but not per-message. A hijacked connection (e.g., XSS stealing the WS token) can subscribe to any initiative the token grants access to. No origin header validation allows cross-site WebSocket hijacking if the token leaks via `Referer` or `document.cookie`.

**Finding SEC-12 (LOW):** The WebSocket URL includes the token as a query parameter (`/v1/initiatives/ws/${id}?token=${encodeURIComponent(wsToken)}` in `usePMSocket.ts:63`). Query parameters may be logged by proxies, load balancers, or browser history.

### 2.7 Frontend Security

**Finding SEC-13 (MEDIUM):** The Zustand store (`pmStore.ts`) holds the full initiative document and PRD in plain memory. Any injected script (XSS) can exfiltrate:
- Business strategy (`vision`, `business_goals`, `risks`)
- Security architecture (`prd.security`, `prd.database_overview`)
- Cost data (`agent_executions.cost_usd`, `tokens_used`)

**Finding SEC-14 (LOW):** Frontend uses loose typing (`Record<string, any>`, `as any`) extensively. This bypasses TypeScript safety and may allow rendering of unexpected fields.

### 2.8 Data Integrity & Audit

**Finding SEC-15 (HIGH):** No audit trail exists for initiative mutations. The `decision_log` collection records automated decision-engine actions but not human-initiated changes to:
- Initiative fields (`PUT /{id}`)
- PRD edits (`PUT /{id}/prd`)
- Regeneration triggers (`POST /{id}/regenerate`)

Without audit logs, there is no way to trace who modified strategic planning data or when.

**Finding SEC-16 (HIGH):** No optimistic concurrency control or versioning. If two users edit the same initiative simultaneously, the last write wins. The PRD has a `version` field in the model (`pm_models.py:150`) but it is never incremented by the API.

**Finding SEC-17 (MEDIUM):** The `generate_initiative_plan` task (`pm_tasks.py:79`) writes the entire `initiative.model_dump()` back to MongoDB on success. This overwrites any fields set by other concurrent operations (e.g., user updating `name` while generation runs).

### 2.9 Cryptographic & Secrets

**Finding SEC-18 (LOW):** No evidence of field-level encryption for initiative data. The `prompt` field may contain sensitive business ideas. The `REPOSITORY_ANALYSIS.md` notes field-level encryption exists elsewhere but its scope for the PM layer is unverified.

### 2.10 Compliance

| Requirement | Status | Evidence |
|-------------|--------|----------|
| GDPR data export | ✅ | `backend/api/gdpr.py` includes initiatives |
| GDPR cascade delete | ✅ | `test_gdpr_cascade.py` covers initiatives |
| Right to erasure | ⚠️ | Cascade exists but no user-initiated UI |
| Data minimization | ❌ | Over-exposure in API responses (see SEC-02..04) |
| Audit logging | ❌ | No human-action audit trail |

---

## PHASE 3: FRONTEND BUSINESS AUDIT

### 3.1 Navigation & Information Architecture

| Issue | Severity | Evidence |
|-------|----------|----------|
| No breadcrumbs | HIGH | `InitiativeLayout.tsx` has "All initiatives" back link but no breadcrumb trail through tabs |
| Tab bar overflow on mobile | MEDIUM | `overflow-x-auto` on nav (`InitiativeLayout.tsx:113`) — tabs may scroll off-screen |
| No context for "Board", "Graph", "Activity" | MEDIUM | Tab labels are terse; no icon+label for most tabs (`TABS` array uses `icon: () => null`) |

### 3.2 Empty & Loading States

| State | Current Behavior | Verdict |
|-------|-------------------|---------|
| Loading | Skeleton cards only for list (`InitiativesListPage.tsx:985-987`) | ⚠️ Detail page shows "Loading initiative…" text only |
| Empty list | EmptyState with "Describe an idea above" | ✅ Adequate |
| Failed generation | Generic "Failed" pill | ❌ No error details, no retry guidance |
| Offline | "Connect a backend" message | ⚠️ Not actionable |

### 3.3 Error Recovery

**Finding FE-01 (HIGH):** When `initiativesApi.create` fails, the UI shows a toast but does not preserve the user's typed prompt (`InitiativesListPage.tsx:687-702`). The input is cleared only on success, but the error path leaves the user unsure of state.

**Finding FE-02 (HIGH):** Regeneration failure shows "Failed to start regeneration" toast with no link to logs, no suggestion to retry, and no indication of partial state.

### 3.4 Performance Perception

**Finding FE-03 (MEDIUM):** `hydrate` fires 6 parallel requests on every initiative load (`pmStore.ts:59-67`). No staggered loading or skeleton states for the detail tabs. Users see "Loading initiative…" then tab content flickers in.

### 3.5 Accessibility

| Issue | Severity | Evidence |
|-------|----------|----------|
| Tab buttons lack `aria-controls` | MEDIUM | `NavLink` tabs have no `aria-controls` or panel association |
| Dynamic status not announced | MEDIUM | `ForgeSignal` updates status text without `aria-live` |
| Error toast not tied to input | MEDIUM | `toast.error` is global, not associated with prompt input |

---

## PHASE 4: BUSINESS PROCESS AUDIT

### 4.1 Initiative Lifecycle

```
DRAFT → GENERATING → ACTIVE/COMPLETED/FAILED/ARCHIVED
         ↓
    (regenerate) → clears PRD, epics, stories, tasks, sprints
```

**Finding BP-01 (HIGH):** No approval gate between `GENERATING` and `ACTIVE`. The Celery task auto-sets status to the final state (`pm_tasks.py:67`). There is no human review step before the plan is considered actionable.

**Finding BP-02 (MEDIUM):** No mechanism to pause or cancel generation. Once `generate_initiative_plan` is queued, it runs to completion or timeout. The frontend shows "Generating…" but cannot stop the worker.

### 4.2 Collaboration

**Finding BP-03 (HIGH):** Initiatives are single-owner (`user_id`) or org-shared. No commenting, @mentioning, or approval workflow. Multiple org members can edit the same PRD simultaneously with no merge strategy.

### 4.3 Integration

| Integration | Status | Gap |
|-------------|--------|-----|
| GitHub | Partial | `task.github` stores commit_shas but no PR creation from initiative |
| Jira/Linear | None | No export to external PM tools |
| Slack | None | No notifications for generation complete |
| Email | Partial | `notify` fires on failure only |

---

## PHASE 5: FINDINGS REGISTER

| ID | Category | Severity | Finding | Location |
|----|----------|----------|---------|----------|
| B-01 | Business | HIGH | Fabricated metrics hardcoded in UI | `InitiativesListPage.tsx:184-196` |
| B-02 | Business | HIGH | No credit reservation for generation | `pm_tasks.py:59` |
| B-03 | Business | MEDIUM | No product analytics instrumentation | Global |
| B-04 | Business | MEDIUM | No PM integrations (GitHub Projects, Slack) | Global |
| B-05 | Business | MEDIUM | Failure state lacks recovery guidance | `InitiativesListPage.tsx` |
| SEC-01 | AuthZ | LOW | Org member role ignored — any member has full access | `permissions.py:27` |
| SEC-02 | Exposure | HIGH | Full initiative doc returned including prompt, errors | `initiatives.py:106,115` |
| SEC-03 | Exposure | HIGH | Full PRD returned including security/db/API plans | `initiatives.py:150` |
| SEC-04 | Exposure | HIGH | Graph endpoint returns nested artifacts unfiltered | `initiatives.py:203-243` |
| SEC-05 | Exposure | MEDIUM | List page renders raw prompt when vision is empty | `InitiativesListPage.tsx:1053` |
| SEC-06 | Validation | MEDIUM | Rich-text fields accept arbitrary nested objects | `initiatives.py:27-39` |
| SEC-07 | Validation | LOW | No prompt injection sanitization before LLM feed | `pm_tasks.py:74` |
| SEC-08 | Destructive | HIGH | Regeneration deletes children without confirmation or audit | `initiatives.py:136-140` |
| SEC-09 | Abuse | MEDIUM | No initiative-specific rate limiting | `initiatives.py` |
| SEC-10 | Abuse | LOW | No CAPTCHA or abuse scoring on creation | `initiatives.py:50` |
| SEC-11 | WebSocket | MEDIUM | No origin validation; per-message auth missing | `pm_ws_manager.py` |
| SEC-12 | WebSocket | LOW | WS token passed in query string | `usePMSocket.ts:63` |
| SEC-13 | Frontend | MEDIUM | Sensitive data held in plain Zustand store | `pmStore.ts` |
| SEC-14 | Frontend | LOW | Loose typing bypasses TS safety | `pmStore.ts` |
| SEC-15 | Audit | HIGH | No human-action audit trail for mutations | Global |
| SEC-16 | Integrity | HIGH | No versioning or concurrency control | `pm_models.py:150` |
| SEC-17 | Integrity | MEDIUM | Generation overwrites concurrent field changes | `pm_tasks.py:79` |
| SEC-18 | Crypto | LOW | Field-level encryption scope unverified for PM layer | `database.py` |
| FE-01 | Frontend | HIGH | Prompt lost on creation failure | `InitiativesListPage.tsx:687` |
| FE-02 | Frontend | HIGH | Regeneration failure lacks actionable guidance | `InitiativeLayout.tsx:36` |
| FE-03 | Frontend | MEDIUM | No staggered loading for detail page hydrate | `pmStore.ts:59` |
| FE-04 | Accessibility | MEDIUM | Tabs lack aria-controls association | `InitiativeLayout.tsx:124` |
| FE-05 | Accessibility | MEDIUM | Dynamic status not aria-live announced | `InitiativesListPage.tsx:349` |
| BP-01 | Process | HIGH | No human approval gate before plan activation | `pm_tasks.py:67` |
| BP-02 | Process | MEDIUM | No pause/cancel for running generation | `pm_tasks.py:53` |
| BP-03 | Process | HIGH | No collaboration, commenting, or merge strategy | Global |

---

## PHASE 6: REMEDIATION PLAN

### P0 — Block Launch

| ID | Action | Owner | Timeline |
|----|--------|-------|----------|
| B-01 | Replace hardcoded metrics with real backend data or remove section | Frontend | 3 days |
| B-02 | Implement credit reservation + deduction before Celery queue | Backend | 5 days |
| SEC-02 | Reduce `GET /{id}` response to safe field allow-list | Backend | 2 days |
| SEC-03 | Restrict `GET /{id}/prd` to user-editable fields only | Backend | 2 days |
| SEC-04 | Add pagination + field filter to `GET /{id}/graph` | Backend | 3 days |
| SEC-08 | Add confirmation modal + audit log entry for regenerate | Full-stack | 3 days |
| SEC-15 | Emit audit events for initiative/PRD mutations | Backend | 4 days |
| SEC-16 | Implement optimistic concurrency via `version` field | Backend | 3 days |
| FE-01 | Preserve prompt on creation failure | Frontend | 1 day |
| FE-02 | Show error details + retry CTA on regeneration failure | Frontend | 2 days |

### P1 — Within 30 Days

| ID | Action | Owner | Timeline |
|----|--------|-------|----------|
| SEC-01 | Add role-based initiative permissions (viewer/editor/admin) | Backend | 5 days |
| SEC-05 | Mask prompt in list cards; show only name + status | Frontend | 1 day |
| SEC-06 | Add Pydantic schema for `roadmap`, `risks`, `tech_stack` | Backend | 2 days |
| SEC-09 | Add per-user initiative creation rate limit (e.g., 5/hr) | Backend | 2 days |
| SEC-11 | Validate `Origin` header on WS handshake | Backend | 1 day |
| SEC-13 | Encrypt sensitive fields in Zustand or avoid storing PRD | Frontend | 2 days |
| SEC-17 | Merge concurrent updates during generation completion | Backend | 3 days |
| FE-03 | Add tab-level skeletons during hydrate | Frontend | 2 days |
| FE-04 | Add `aria-controls` + `role=tablist` to tab nav | Frontend | 1 day |
| BP-01 | Add "Approve plan" gate before ACTIVE status | Full-stack | 5 days |
| BP-02 | Add cancel endpoint + WS broadcast for generation | Backend + Frontend | 4 days |

### P2 — Within 60 Days

| ID | Action | Owner | Timeline |
|----|--------|-------|----------|
| B-03 | Add analytics events for creation, generation complete, PRD view | Full-stack | 3 days |
| B-04 | Add export to Markdown/JSON; Slack notification integration | Backend | 5 days |
| SEC-07 | Add prompt injection scanner before storing prompt | Backend | 3 days |
| SEC-12 | Use WS token in `Sec-WebSocket-Protocol` or cookie instead of query | Full-stack | 2 days |
| SEC-18 | Verify field-level encryption covers PM collections | Backend | 2 days |
| BP-03 | Add commenting + approval workflow on PRD | Full-stack | 10 days |

---

## PHASE 7: SCORING

| Category | Current | Target | Gap |
|----------|---------|--------|-----|
| Business Viability | 22/100 | 80/100 | Real metrics, pricing, GTM |
| User Experience | 45/100 | 85/100 | Error recovery, loading states, accessibility |
| Data Governance | 35/100 | 80/100 | Field allow-lists, audit logs, versioning |
| Auth & AuthZ | 75/100 | 90/100 | Role-based access, WS origin checks |
| Input Validation | 60/100 | 85/100 | Schema validation, injection prevention |
| Sensitive Data Exposure | 30/100 | 80/100 | Response filtering, field encryption |
| Destructive Ops | 40/100 | 85/100 | Confirmations, undo, audit trails |
| WebSocket Security | 70/100 | 90/100 | Origin validation, per-message auth |
| Audit & Observability | 25/100 | 80/100 | Human-action logs, correlation IDs |
| Compliance | 40/100 | 75/100 | Data minimization, user-initiated deletion UI |

**Composite: 42/100 → Target: 83/100**

---

## APPENDIX: KEY FILES

| File | Lines | Role |
|------|-------|------|
| `backend/api/initiatives.py` | 1-262 | HTTP + WS router |
| `backend/core/pm_models.py` | 1-373 | Pydantic models |
| `backend/core/permissions.py` | 1-79 | Ownership checks |
| `backend/services/pm_ws_manager.py` | 1-172 | WS auth + pub/sub |
| `backend/tasks/pm_tasks.py` | 1-320 | Celery generation + execution |
| `frontend/src/pages/pm/InitiativesListPage.tsx` | 1-1099 | List + create UI |
| `frontend/src/pages/pm/InitiativeLayout.tsx` | 1-153 | Detail shell + tabs |
| `frontend/src/store/pmStore.ts` | 1-162 | Zustand state |
| `frontend/src/hooks/usePMSocket.ts` | 1-119 | WebSocket lifecycle |
