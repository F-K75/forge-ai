> **Historical baseline audit (2026-06-29, score 3.8/10). Superseded by later audits — see MASTER_EXECUTION_PLAN.md and PRODUCTION_AUDIT_REPORT.md for current state. Kept for historical reference only.**

# FORGE-AI: COMPREHENSIVE ELITE AUDIT REPORT

**Date:** 2026-06-29  
**Auditor:** Elite 20-Role Review Panel (CEO, CTO, VP Eng, PM, UX, Staff FE, Principal BE, DB Arch, DevOps, Cloud Arch, Security, OWASP, QA, Perf Eng, a11y, SEO, Analytics, FinOps, Legal, Enterprise SaaS)  
**Scope:** Full codebase — 70+ files, all APIs, all screens, all DB models, all user flows, all business processes  
**Assumption:** Software will serve 10 million users  

---

## EXECUTIVE SUMMARY

Forge-AI is an ambitious AI-powered full-stack app builder with a coordinated multi-agent pipeline (Architect → Business Model Improver → Designer → Developer → Integration → PM) and a modern tech stack (FastAPI + MongoDB + React 18 + Zustand + WebSockets). The vision is compelling and the UX design is polished, but the codebase has been built at hackathon speed and contains:

- **17 Critical (P0) security vulnerabilities** including container escape, credential leakage, and authentication bypass
- **12 Critical (P0) functional bugs** that break core user flows
- **Zero unit tests** covering business logic
- **3 architecture-level blockers** that prevent scaling beyond a single worker
- **Unbounded MongoDB queries** that will cause OOM at modest usage
- **Race conditions** in credit deduction, WebSocket connections, and database initialization

**Overall Score: 3.8/10** — Fundamental issues must be resolved before any production deployment.

---

## SCORECARD

| Category | Score | Severity Trend |
|---|---|---|
| **Overall** | **3.8/10** | ⛔ Critical |
| Business | 3.5/10 | ⛔ Critical |
| Product | 3/10 | ⛔ Critical |
| UX | 6/10 | ⚠️ Warning |
| UI | 6.5/10 | ⚠️ Warning |
| Frontend | 3.5/10 | ⛔ Critical |
| Backend | 3/10 | ⛔ Critical |
| API | 3.5/10 | ⛔ Critical |
| Database | 2.5/10 | ⛔ Critical |
| Architecture | 2.5/10 | ⛔ Critical |
| Performance | 2/10 | ⛔ Critical |
| Security | 1.5/10 | ⛔ Critical |
| Accessibility | 5.5/10 | ⚠️ Warning |
| SEO | 1/10 | ⛔ Critical |
| Analytics | 3.5/10 | ⚠️ Warning |
| DevOps | 2.5/10 | ⛔ Critical |
| Cloud | 1.5/10 | ⛔ Critical |
| Maintainability | 4/10 | ⚠️ Warning |
| Scalability | 1.5/10 | ⛔ Critical |
| Enterprise Readiness | 1.5/10 | ⛔ Critical |

---

# DETAILED FINDINGS BY CATEGORY

---

## 1. BUSINESS SCORE — 3.5/10

### Strengths
- Multi-tier subscription model (Free, Standard, Pro, Enterprise) with credit-based consumption
- Credit packages as add-on revenue stream
- Team/organization workspace model with seat-based licensing
- Referral program with bonus credits
- Marketplace for user-generated templates creates network effects

### Weaknesses
- **No free trial enforcement** — `trial_ends_at` field exists in User model (`backend/core/models.py:70`) but is NEVER checked in any endpoint
- **No dunning** — past-due subscriptions are flagged but no automated retry or downgrade logic
- **Credit system is loss-generating** — Pro tier at $99/mo gives 500 credits. At peak, a single build uses ~15 credits. 500/15 ≈ 33 builds/mo = $3/build. AI API costs exceed this significantly at scale
- **No usage alerts** — users discover they're out of credits only when a build fails mid-way
- **No refund/dispute workflow** — Stripe handles payments but the app has no credit refund UI or logic
- **Marketplace has zero moderation** — `backend/api/marketplace.py:44-58` accepts any content from any user with no review, spam filter, or content policy

### Critical Bugs

#### [P0] Credit Deduction Race Condition
**File:** `backend/api/builds.py:88-93`  
**Function:** `create_build`  
```python
reserved = await db.users.find_one_and_update(
    {"id": current_user.id, "credits": {"$gte": max_credits}},
    {"$inc": {"credits": -max_credits}},
    return_document=True,
)
```
**Issue:** While the `find_one_and_update` with `$gte` is correct for reservation, the `_run_build_background` function at line 148 does a credit refund that could race with another build. If two concurrent builds both error and both try to refund, credit inflation occurs.
**Impact:** Arbitrary credit creation, revenue leakage
**Fix:** Use `find_one_and_update` with `$inc` guard condition in refund path too. Add idempotency key.

#### [P0] No Trial Enforcement
**File:** `backend/core/models.py:70`  
```python
trial_ends_at: Optional[datetime] = None
```
**File:** `backend/core/orchestrator.py:258-266` — credit deduction occurs in `_start_agent` but no trial eligibility check anywhere.  
**Impact:** Free users with expired trials can continue building indefinitely if they have credits remaining from initial allocation.  
**Fix:** Add middleware or decorator that checks `trial_ends_at` before allowing builds.

### Missing Features
- Automated dunning workflow (3 email sequence before downgrade)
- Credit usage alerts (email at 80%, 50%, 20% remaining)
- Billing history UI showing past invoices
- Annual billing with invoice PDF generation
- Promotional/discount code system
- Enterprise quote generation

### Code Smells
- `backend/api/billing.py:17-28` — Stripe price IDs are hardcoded as strings (e.g., `"price_free"`, `"price_standard_monthly"`). These are placeholder values that don't correspond to real Stripe price IDs
- `backend/api/billing.py:346-352` — `_map_price_to_plan` iterates all price maps. O(n) on every webhook call
- `backend/core/config.py:19-23` — Credit costs are hardcoded in config but not synchronized with Stripe metadata

### Priority: P0 — Immediate (12-16 hours)

---

## 2. PRODUCT SCORE — 3/10

### Strengths
- Compelling core value proposition: describe an app → AI builds it
- Multi-agent pipeline creates realistic expectation management
- Real-time streaming of build output provides transparency
- Marketplace creates community value

### Weaknesses
- **Preview URLs are localhost-only** — `backend/api/deployments.py:355-358` generates `http://localhost:{port}` URLs that are unreachable from any other machine
- **Onboarding template selection is pure placebo** — `frontend/src/pages/Onboarding.tsx:66` sends `template` param but `backend/api/projects.py:26-30` `CreateProjectRequest` has no `template` field
- **Admin user export endpoint doesn't exist** but the UI calls it at `frontend/src/pages/Admin.tsx:61`
- **Support ticket system is referenced but has no creation endpoint** — `backend/api/admin.py:652` queries `db.support_tickets` but no route creates tickets
- **GitHub OAuth buttons are dead stubs** — all implementations are `console.log` only
- **Password reset flow is broken** — forgot password page submits to `/auth/forgot-password` which exists on backend, but there's no frontend page for resetting with the token
- **No email verification** — users can create accounts with any email including typos

### Critical Bugs

#### [P0] Password Reset is Dead-End
**File:** `frontend/src/App.tsx:214`  
Route exists for `/forgot-password` but there's no route for `/reset-password/:token`. The backend returns `{"ok": true}` but the user never receives an email because `backend/api/growth.py:48-60` only sends emails if `RESEND_API_KEY` is configured, which defaults to empty.  
**Impact:** Users who forget passwords are permanently locked out.  
**Fix:** Implement full password reset flow with dedicated page.

#### [P0] Template Selection is Placebo
**File:** `frontend/src/pages/Onboarding.tsx:66`  
```typescript
await api.post('/projects/', { name: projectName, description: 'My first project', template: selectedTemplate })
```
**File:** `backend/api/projects.py:11-14`  
```python
class CreateProjectRequest(BaseModel):
    name: str
    description: str = ""
```
No `template` field. Silently ignored.  
**Impact:** Users select a template that has zero effect.  
**Fix:** Accept `template` in request, store in project metadata, pass to orchestrator as context.

#### [P0] Admin Export 404s
**File:** `frontend/src/pages/Admin.tsx:61`  
```typescript
api.get('/admin/users/export').then(r => { ... })
```
No such endpoint exists on the backend.  
**Fix:** Implement `/admin/users/export` or remove the button.

### Missing Features (From README Roadmap)
- [ ] GitHub OAuth + repo sync
- [ ] One-click deploy to cloud (GCP Cloud Run)
- [ ] Custom domain mapping
- [ ] Voice mode (Web Speech API)
- [ ] Context window forking
- [ ] Version history UI
- [ ] Bring-your-own API key (BYOK)
- [ ] Team workspaces + RBAC
- [ ] MCP server support for custom integrations

### Priority: P0 — Immediate (20-24 hours)

---

## 3. UX SCORE — 6/10

### Strengths
- Clean dark SaaS aesthetic with consistent design system
- Good use of ARIA labels, roles, and landmark regions
- Skip-to-content link present (`frontend/src/components/layout/workspace/WorkspaceLayout.tsx:97`)
- Keyboard-accessible focus rings throughout
- Loading skeletons and states present

### Weaknesses
- **No demo mode user disclosure** — if backend is down, the auth store silently falls into a degraded state. User sees "logged in" but no data loads
- **Connection status is displayed but build inputs aren't disabled** — user can type a prompt when WebSocket is offline with no feedback
- **No offline indicator for builds** — if WebSocket drops mid-build, there's no UX feedback until the user notices missing updates
- **No empty state for settings page** — if user data is null, Settings crashes with `user?.name?.charAt(0)` at line 60
- **Time zone confusion** — all timestamps shown in UTC with no conversion
- **No confirmation on destructive actions** — project deletion (`frontend/src/pages/Admin.tsx`) has no confirm dialog

### Critical Bugs

#### [P1] Silent Demo Mode
**File:** `frontend/src/store/authStore.ts:47-49`  
When `fetchMe()` fails (e.g., backend down), the catch block silently sets `{ isAuthenticated: true, user: null }` but then `App.tsx:48-51` catches the same failure and sets `isAuthenticated: false`. This creates a race where the UI briefly shows "logged in" then flips to login screen.  
**Impact:** Confusing flash of content, inconsistent auth state.  
**Fix:** Remove the silent fallback. Only set auth state based on actual API response.

#### [P1] Build Deduplication Not Handled
**File:** `frontend/src/hooks/useBuildSocket.ts:35`  
Rapid build starts create multiple WebSocket connections. The `generationRef` mechanism prevents most races but the store's `startBuild` dispatching at `WorkspaceLayout.tsx:94` sets `status: 'pending'` which allows another build to start.  
**Fix:** Add a guard in `startBuild` to reject if `status` is `pending | running | debugging`.

### Priority: P1 — High (8-10 hours)

---

## 4. UI SCORE — 6.5/10

### Strengths
- Consistent dark theme with CSS custom properties in `frontend/src/index.css:72-92`
- Responsive layout with mobile/tablet/desktop breakpoints
- Resizable panels with keyboard support (`frontend/src/components/layout/ResizablePanel.tsx:29-42`)
- Framer Motion animations for micro-interactions
- Good use of Tailwind utility classes

### Weaknesses
- **Hardcoded colors in Settings page** — `frontend/src/pages/Settings.tsx:57,89,127` uses inline hex `#111118`, `#1e1e2e`, `#0a0a0f` instead of CSS variables
- **`bb-btn` component classes used in `PreviewPanel.tsx`** (lines 129-143) but these are defined as `@layer components` utilities, not components. No TypeScript checking
- **No dark/light mode toggle** — SaaS customers expect theme switching
- **ActivityFeed.tsx has duplicate component definitions** — line 27 exports `export const ActivityFeed` and line 87 re-exports `export function ActivityFeed`. Both render the same data but with different styles. Only one is used
- **Inconsistent border radius** — some places use `rounded-xl`, others `rounded-2xl`, `rounded-[20px]`, `rounded-[24px]` without clear rationale
- **Animation library bundle cost** — framer-motion adds ~30KB gzip for animations that could be CSS-only

### Code Smells

#### [P2] Hardcoded Color Values
**File:** `frontend/src/pages/Settings.tsx:57,89,127`
```tsx
<form onSubmit={handleProfileSave} className="bg-[#111118] border border-[#1e1e2e] rounded-2xl p-6 space-y-4">
```
These don't use the `bg-forge-surface` / `border-forge-border` Tailwind variables defined in `tailwind.config.js` and `index.css`.  
**Fix:** Replace with Tailwind theme variables.

#### [P2] Duplicate ActivityFeed Component
**File:** `frontend/src/components/layout/ActivityFeed.tsx:27,87`  
Two different `ActivityFeed` exports exist in the same file. One has `rounded-xl` + `bg-forge-surface`, the other has `rounded-[24px]` + `bg-forge-surface/70`.  
**Fix:** Remove the duplicate and consolidate styles.

### Priority: P2 — Medium (6-8 hours)

---

## 5. FRONTEND SCORE — 3.5/10

### Strengths
- Modern stack: React 18 + TypeScript + Vite + Zustand + React Query + Tailwind
- WebSocket hook with exponential backoff reconnection (`useBuildSocket.ts:109-114`)
- Defensive WebSocket event parsing that never throws (`wsContract.ts:70-117`)
- Lazy-loaded routes with Suspense (`App.tsx:9-16`)
- Separated selectors for Zustand stores (`useAuthSelectors.ts`, `useBuildSelectors.ts`)

### Critical Bugs

#### [P0] No Error Boundaries
**File:** `frontend/src/App.tsx`  
Zero `<ErrorBoundary>` wrappers around any route. The Monaco Editor CDN load could fail, an API response could be malformed, a render could throw. The entire app unmounts with a white screen.  
**Impact:** Any runtime error = complete app crash. Zero graceful degradation.  
**Fix:** Wrap each route with `<ErrorBoundary fallback={<ErrorFallback />}>`.

#### [P0] XSS via Remember-Me
**File:** `frontend/src/pages/Login.tsx:69-72`  
```typescript
localStorage.setItem('forge_remember_email', email)
```
Stores raw user-controlled string in localStorage. If an XSS payload is rendered elsewhere on the page, the attacker can read all remembered emails. Also, no input sanitization on the email field before storage.  
**Fix:** Base64-encode or encrypt before storing. Sanitize on read.

#### [P0] fetchMe Error in Register
**File:** `frontend/src/store/authStore.ts:40`  
```typescript
await get().fetchMe()
```
`register` already sets `user: res.data.user` from the API response, then immediately calls `fetchMe()` which makes ANOTHER API call to `/auth/me`. If this second call fails, the user is left in a state where `isAuthenticated: true` but `user: null`.  
**Fix:** Remove the redundant `fetchMe()` call. The register response contains the user data.

#### [P0] WebSocket Token Extraction from Cookie
**File:** `frontend/src/hooks/useBuildSocket.ts:54-58`  
```typescript
const token = (document.cookie || "")
  .split(';')
  .map(c => c.trim())
  .find(c => c.startsWith('access_token='))
  ?.split('=')[1]
```
Token is sent as URL query parameter: `ws://localhost:8000/builds/ws/${id}?token=${token}`. URL parameters are:  
- Logged in server access logs  
- Passed in `Referer` header to other sites  
- Visible in browser history  
- Visible in `window.location`  
**Security risk:** CRITICAL — JWT token leakage.  
**Fix:** Authenticate WebSocket via a short-lived one-time token or via the `Sec-WebSocket-Protocol` header.

#### [P0] Admin Auth Client-Side Only
**File:** `frontend/src/App.tsx:85-98`  
The `AdminRoute` component checks nothing about admin status. It only checks `isAuthenticated`. The actual admin check in `backend/api/admin.py:16-18` relies on an email-based whitelist from env vars. But the frontend admin page has NO admin status check — any authenticated user can access `/admin`.  
**Fix:** Add admin status check to the `Admin` page using the `/auth/me` endpoint response, which should include an `is_admin` field.

#### [P1] Unbounded Imports in ChatPanel
**File:** `frontend/src/components/chat/ChatPanel.tsx:74`  
```typescript
const { buildsApi, projectsApi } = await import('../../lib/api')
```
Dynamic import inside a callback that could be called multiple times. No caching.  
**Fix:** Import statically at module level.

### Code Smells
- Heavy use of `any` types — `frontend/src/lib/api.ts:42`, `ChatPanel.tsx:19-31`, `Marketplace.tsx:103`
- `frontend/src/hooks/useBuildSocket.ts:60` — `ws.send('ping')` is not the standard WebSocket ping mechanism. Should use native heartbeat or a dedicated ping/pong protocol
- Store actions mutate state directly via `useBuildStore.setState(...)` which bypasses the action interface. At least 4 files do this: `App.tsx:49,70`, `WorkspaceLayout.tsx:93`, `PromptBox.tsx` stale closure reference
- `frontend/src/pages/Settings.tsx` lacks loading states for password change

### Priority: P0 — Immediate (16-20 hours)

---

## 6. BACKEND SCORE — 3/10

### Strengths
- FastAPI with proper async/await throughout
- Pydantic v2 models with `model_dump()` and `Field(default_factory=...)`
- Well-separated modules (core, api, agents, services, sandbox)
- WebSocket connection manager with build-level isolation
- Rate limiting middleware exists (though flawed)
- Background task handling for long-running builds
- Stripe webhook signature verification

### Critical Bugs

#### [P0] Global Mutable Singleton — Thread-Safe Only by Luck
**File:** `backend/core/database.py:7-15`  
```python
_mongo_client: AsyncIOMotorClient = None
_redis_client: Redis = None

async def get_db():
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = AsyncIOMotorClient(settings.mongodb_url)
```
Two coroutines awaiting `get_db()` simultaneously before the first `_mongo_client = AsyncIOMotorClient(...)` completes will BOTH see `_mongo_client is None` and BOTH create clients. This is a classic TOCTOU bug.  
**Impact:** Leaked connections, eventual connection pool exhaustion, random database errors at high concurrency.  
**Fix:** Use `asyncio.Lock` or initialize at module level (preferred):  
```python
_mongo_client = None
_lock = asyncio.Lock()
async def get_db():
    global _mongo_client
    if _mongo_client is None:
        async with _lock:
            if _mongo_client is None:
                _mongo_client = AsyncIOMotorClient(...)
```

#### [P0] get_current_user Hits MongoDB Every Request
**File:** `backend/api/auth.py:79-124`  
The `get_current_user` dependency decodes the JWT then does `await db.users.find_one({"id": user_id})` on EVERY protected request. At 10M users with 50 req/s, this is 50 MongoDB queries/second for auth alone.  
**Performance Impact:** MongoDB primary bottleneck. Added latency: ~5-10ms per request.  
**Fix:** Cache user data in Redis with the decoded JWT payload. Use Redis `GET` with 5-minute TTL.

#### [P0] No MongoDB Connection Pooling Config
**File:** `backend/core/database.py:13`  
`AsyncIOMotorClient(settings.mongodb_url)` runs with DEFAULT connection pool (100 connections). No `maxPoolSize`, `minPoolSize`, `serverSelectionTimeoutMS`, `connectTimeoutMS`. Under load, connections will pile up and timeout.  
**Fix:**  
```python
_mongo_client = AsyncIOMotorClient(
    settings.mongodb_url,
    maxPoolSize=50,
    minPoolSize=10,
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=10000,
)
```

#### [P0] Redis Connection Not Resilient
**File:** `backend/core/database.py:36-42`  
```python
async def get_redis():
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client
```
Redis connection is created once and never tested for liveness. If Redis restarts, `_redis_client` holds a stale connection and all Redis operations fail silently.  
**Fix:** Add periodic health check or `await _redis_client.ping()` before each operation with reconnection on failure.

#### [P0] WebSocket Build Ownership Bypass
**File:** `backend/api/builds.py:243-250`  
```python
build = await db.builds.find_one(
    {"id": build_id, "user_id": user.id}, {"_id": 0}
)
if not build:
    await websocket.close(code=4003, reason="Foreign build")
    return
```
This check happens AFTER `get_ws_user(token, build_id=build_id)` which already does the same check in `ws_manager.py:77-81`. But the WS endpoint's local `get_ws_user` passes `build_id`, while the `auth.py:get_current_user` does NOT. If a user provides another user's JWT, they can access the build.  
**Fix:** Remove the duplicate check from the WS handler and rely entirely on `get_ws_user(token, build_id=...)`.

#### [P0] Build State Persisted Per-Agent-Step (Performance)
**File:** `backend/api/builds.py:126-138`  
```python
async def emit(event):
    await manager.emit(event)
    await db.builds.update_one(
        {"id": build.id},
        {
            "$set": {
                "status": build.status,
                "agents": [a.model_dump() for a in build.agents],
                "files": build.files,
                "credits_used": build.credits_used,
            }
        },
    )
```
The `emit` function is called after every agent step (6 agents × debug up to 3 iterations = up to 18 DB writes per build). Each write stores the FULL files dict. At 50 files × 500 lines = 25KB per build step × 18 steps = 450KB per build written to MongoDB.  
**Impact:** Massive write amplification on MongoDB primary. At 100 concurrent builds, this is 45MB/s of write traffic.  
**Fix:** Only update status and credits. Store files as a separate collection with diffs.

### Code Smells
- `backend/core/orchestrator.py:259-265` — credit_map doesn't include `BUSINESS_IMPROVER` or `DEBUGGER` agent types, so credit tracking is incomplete
- `backend/core/orchestrator.py:56,257` — `emit(WSEvent(...))` is called inconsistently: sometimes in orchestrator, sometimes in `_start_agent`. Redundant agent_start events can be emitted
- `backend/api/builds.py:80-82` — estimated_credits formula `len(project.get("tech_stack", {})) + 1` is arbitrary and unrelated to actual AI costs
- `backend/services/ws_manager.py:9` — `MAX_WS_PAYLOAD_BYTES = 5 * 1024 * 1024` is 5MB. Most cloud WebSocket proxies (Cloudflare, AWS ALB) enforce ~128KB. Event will be silently dropped by infrastructure

### Priority: P0 — Immediate (24-32 hours)

---

## 7. API SCORE — 3.5/10

### Strengths
- RESTful organization by domain
- Pydantic v2 request/response models
- Stripe webhook with signature verification (`billing.py:232-234`)
- WebSocket streaming for real-time updates
- Background task pattern for long operations

### Critical Bugs

#### [P0] No API Versioning
**File:** `backend/main.py:44-51`  
All routes are mounted at root level (`/auth`, `/builds`, `/projects`, etc.) with no version prefix. Breaking changes require coordination.  
**Fix:** Mount at `/v1/auth`, `/v1/builds`, etc. Maintain backward compatibility.

#### [P0] CORS Misconfiguration Risk
**File:** `backend/main.py:33-38`  
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(",") if settings.allowed_origins else ["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
`allow_credentials=True` + `allow_methods=["*"]` + `allow_headers=["*"]` is extremely permissive. If `allowed_origins` env var is empty string, `"".split(",")` returns `[""]` which is NOT empty, so it defaults to `["http://localhost:3000"]`. But if the env var is unset, it defaults.  
**Worse:** `allowed_origins` is a single string, not a list. It gets `.split(",")` which means ORIGIN HEADER can contain `,` and bypass checks.  
**Fix:**  
```python
allow_origins=settings.allowed_origins
```  
Make `allowed_origins` a `list[str]` in Settings.

#### [P0] Unbounded to_list(None)
**File:** `backend/api/admin.py:206`  
```python
cursor = db.users.find(query, {"_id": 0, "hashed_password": 0}).skip(skip).limit(per_page).sort("created_at", -1)
users = []
async for doc in cursor:
    users.append(UserResponse(**doc))
```
**File:** `backend/api/builds.py:216-222`  
```python
builds = (
    await db.builds.find(...)
    .sort("created_at", 1)
    .to_list(None)  # <--- LOADS ALL
)
```
`find()` without limit + `to_list(None)` loads EVERY matching document into memory. At 10M users, this is 10M documents × ~500 bytes = 5GB per request.  
**Fix:** Always use pagination with `.limit(per_page)` and cursor-based pagination for large collections.

#### [P0] No Request Validation on Object IDs
**File:** `backend/api/projects.py:46-50`  
```python
async def get_project(project_id: str, user: ...):
    project = await db.projects.find_one({"id": project_id, "user_id": user.id}, {"_id": 0})
```
No validation that `project_id` is a valid UUID. MongoDB will happily search for `{"id": "not-a-uuid"}` — wasted index scan.  
**Fix:** Add a Pydantic Path parameter validator or FastAPI `Path(pattern="...")`.

#### [P0] Rate Limiting Uses MongoDB (Slow)
**File:** `backend/core/security.py:48-118`  
Every HTTP request triggers a MongoDB operation — either `find_one`, `update_one`, or `insert_one`. This adds 2-5ms per request for rate limiting alone. At 1000 req/s, that's 2-5 seconds of pure MongoDB time.  
**Fix:** Move rate limiting to Redis with `INCR` + `EXPIRE` which is O(1) and sub-millisecond.

### Missing Features
- API versioning (v1)
- OpenAPI docs disabled in production
- Rate limit headers in responses (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)
- Request ID tracing for debugging
- Idempotency keys for POST endpoints

### Priority: P0 — Immediate (12-16 hours)

---

## 8. DATABASE SCORE — 2.5/10

### Strengths
- Motor (async MongoDB driver) for non-blocking operations
- Index creation in `_ensure_indexes` (`database.py:19-33`)
- Pydantic validation before DB insertion
- Separate collections for different entities

### Critical Bugs

#### [P0] No Indexes on Hot Query Paths
**File:** `backend/core/database.py:19-33`  
Only 4 indexes are created: `users.email`, `organizations.slug`, `subscriptions.stripe_subscription_id`, `invitations.hashed_token`, `credit_purchases.stripe_payment_intent_id`.  
**Missing indexes:**  
- `projects.(user_id, updated_at)` — `list_projects` query: `find({"user_id": user.id}).sort("updated_at", -1)` — COLLSCAN
- `builds.(project_id, user_id, created_at)` — `get_project_builds` query — COLLSCAN
- `team_members.(org_id, user_id)` — `list_members` query — COLLSCAN
- `analytics_events.(user_id, event_name, created_at)` — all analytics queries — COLLSCAN
- `marketplace_items.(type, is_public, downloads)` — marketplace listing — COLLSCAN
- `deployments.(user_id, project_id, created_at)` — deployment listing — COLLSCAN
- `rate_limits.key` with TTL — rate limit lookups — COLLSCAN + unbounded growth

#### [P0] 16MB Document Limit — Build Files
**File:** `backend/core/models.py:147`  
```python
files: Dict[str, str] = {}  # path -> content
```
Stored inside the Build document. Average generated app = 30-50 files × 500 lines × 80 bytes = 1.2-2MB. Complex apps with generated services, tests, Dockerfiles = 10-15MB. Hits 16MB limit after ~200 files.  
**Impact:** Cannot build any moderately complex app. Opaque MongoDB error on save.  
**Fix:** Store files in a separate `build_files` collection where each file is a separate document:  
```python
{"build_id": "uuid", "path": "frontend/src/App.tsx", "content": "...", "version": int}
```

#### [P0] No Unique Constraint on User Email  
**File:** `backend/core/models.py:62`  
```python
email: str
```
While an index is created in `database.py:21`, the application code never checks for duplicate on update. If two concurrent registers happen, both pass the `find_one` check, both insert.  
**Impact:** Duplicate accounts, login ambiguity.  
**Fix:** Use `find_one_and_update` with `upsert` or add unique constraint and catch `DuplicateKeyError`.

#### [P0] Analytics Events Unbounded Growth
**File:** `backend/core/models.py:232-238`  
`AnalyticsEvent` collection has NO TTL index. At 10M users × 100 events/day = 1B documents/year. No archival strategy.  
**Impact:** MongoDB performance degradation, storage costs, slow queries.  
**Fix:** Add TTL index on `created_at`:  
```python
await db.analytics_events.create_index("created_at", expireAfterSeconds=7776000)  # 90 days
```

#### [P0] Invitation Token Stored in Plaintext
**File:** `backend/core/models.py:105`  
```python
token: str = Field(default_factory=lambda: str(uuid.uuid4()))
```
**File:** `backend/api/auth.py:496`  
```python
invite_dict["hashed_token"] = _hash_token(invite_dict.pop("token"))
```
Wait — the code DOES hash the token before storage! But the `hashed_token` field in `Invitation` is `Optional[str]` and the code at line 496 does `invite_dict.pop("token")` then `_hash_token(invite_dict.pop("token"))` — but `invite_dict` is a copy of the model dump. The `token` field is NOT removed from the model before insertion at line 497.  
**Impact:** Token is stored TWICE — once as plaintext `token`, once as `hashed_token`.  
**Fix:** Remove `token` from the dict before `insert_one`.

#### [P0] Rate Limiter Collection Unbounded Growth
**File:** `backend/core/security.py:108-118`  
Rate limit documents are created with `key`, `limit`, `window`, `remaining`, `reset_at` but NO TTL INDEX. Every unique IP + endpoint combination creates a document that lives forever. At 10M users × 10 endpoints = 100M rate limit documents.  
**Fix:** Add TTL index on `reset_at` with `expireAfterSeconds: window + 60`.

### Priority: P0 — Immediate (20-24 hours)

---

## 9. ARCHITECTURE SCORE — 2.5/10

### Strengths
- Clean separation of concerns: core, api, agents, services
- Agent pipeline pattern with clear input/output contracts
- WebSocket pub/sub for real-time updates
- Background task pattern for long-running operations

### Critical Bugs

#### [P0] Orchestrator Blocks All Workers
**File:** `backend/core/orchestrator.py:42-253`  
The entire build pipeline runs sequentially in a single async function. While each step `await`s the AI call, the coroutine is suspended — but the thread pool worker holds the task. FastAPI's `BackgroundTasks` runs in the same process. With 4 workers and 4 concurrent builds all waiting on Anthropic API responses (avg 15s each), all workers are blocked.  
**Impact:** Complete application unavailability during build times. Zero concurrent builds possible.  
**Fix:** Offload builds to Celery/Redis queue with dedicated worker processes.

#### [P0] No Build Timeout or Cancellation
**File:** `backend/api/builds.py:105-106`  
```python
background_tasks.add_task(_run_build_background, build, req.project_id, current_user.id, max_credits)
```
If Anthropic API hangs (network issue, rate limit), the background task runs indefinitely. No `asyncio.wait_for` wrapper. No cancellation mechanism.  
**Impact:** Stuck builds consume system resources forever. No way to recover credits.  
**Fix:** Wrap `orchestrator.run_build` in `asyncio.wait_for(build_task, timeout=settings.build_timeout)`.

#### [P0] WebSocket State In-Memory Only
**File:** `backend/services/ws_manager.py:14`  
```python
self.active: Dict[str, List[WebSocket]] = {}
```
All WebSocket connections are tracked in a Python dict. If the server restarts (deploy, crash, scale), ALL connections are lost. Cannot run >1 worker process.  
**Impact:** Zero availability during deploys. Cannot scale beyond single process.  
**Fix:** Use Redis pub/sub for WebSocket message broadcasting across workers.

#### [P0] No Circuit Breaker for AI API
**File:** `backend/agents/base.py:16-19`  
```python
self.client = anthropic.AsyncAnthropic(
    api_key=settings.anthropic_api_key,
    timeout=settings.anthropic_timeout,
)
```
If Anthropic API returns 429 (rate limit) or 5xx errors repeatedly, every agent call fails in sequence. No backoff, no circuit breaker. Each failed call takes the full timeout duration (120s by default).  
**Impact:** A 30s Anthropic outage causes 6+ minutes of build failures.  
**Fix:** Implement circuit breaker with exponential backoff + jitter.

### Code Smells
- Celery (`celery==5.4.0`) is in `requirements.txt:16` but never used anywhere
- `backend/core/orchestrator.py:254-294` — `_start_agent` and `_complete_agent` are tightly coupled to both DB state AND WebSocket emission. Separation of concerns violated
- Build state is mutated directly (`build.status = BuildStatus.SUCCESS`) instead of using a state machine pattern. Makes it impossible to add validation at state transitions
- No event sourcing — if a build fails mid-way, the partial state is lost

### Priority: P0 — Immediate (16-20 hours)

---

## 10. PERFORMANCE SCORE — 2/10

### Strengths
- Async I/O for database operations
- Token streaming reduces perceived latency
- React lazy loading for route splitting

### Critical Bugs

#### [P0] MongoDB Write Per Request for Rate Limiting
**File:** `backend/core/security.py:52-118`  
Every HTTP request does at minimum `db.rate_limits.find_one(...)` and frequently does `db.rate_limits.update_one(...)` or `db.rate_limits.insert_one(...)`. At 1000 req/s, that's ~2000 MongoDB operations/second just for rate limiting.  
**Fix:** Implement rate limiting entirely in Redis using:  
```python
remaining = await redis.incr(key)
if remaining == 1:
    await redis.expire(key, window)
```

#### [P0] Full File Dict Transmitted Per Agent Step
**File:** `backend/core/orchestrator.py:143`  
```python
await emit(WSEvent(type=WSEventType.FILE_UPDATE, data={"files": build.files}))
```
The ENTIRE `build.files` dict is sent over WebSocket after EVERY agent that modifies files. Developer (step 3) generates all files. Integration (step 4) may add files. Debug loop may patch files. Each time, ALL files are re-transmitted.  
**At scale:** 50 files × 500 lines × 80 bytes = 2MB per FILE_UPDATE event. With 5 agents + 3 debug iterations = 8 events = 16MB per build over WebSocket.  
**Fix:** Send only delta files (changed/added files since last update).

#### [P0] No Response Caching
Zero HTTP caching headers. No CDN. No Redis cache for API responses. Every request hits the database.  
**Hot endpoints with caching opportunity:**  
- `/billing/plans` — static data, OK to cache 1 hour
- `/marketplace` — changes rarely, OK to cache 5 minutes
- `/admin/analytics/overview` — expensive aggregation, OK to cache 1 minute

#### [P0] N+1 Admin Query Pattern
**File:** `backend/api/admin.py:204-207`  
```python
total = await db.users.count_documents(query)
cursor = db.users.find(query, ...).skip(skip).limit(per_page).sort(...)
```
Two MongoDB queries where one would suffice (with `$facet` for paginated results). The `count_documents` on large collections is expensive (O(n) scan).  
**Fix:** Use a single aggregation with `$facet`:
```python
results = await db.users.aggregate([
    {"$match": query},
    {"$facet": {"metadata": [{"$count": "total"}], "data": [{"$skip": skip}, {"$limit": per_page}]}}
]).to_list(1)
```

#### [P2] No Compression for WebSocket Events
All events are sent as uncompressed JSON strings. For large payloads (build files), gzip compression could reduce size by 5-10x.  
**Fix:** Implement `permessage-deflate` WebSocket extension.

### Priority: P1 — High (16-20 hours)

---

## 11. SECURITY SCORE — 1.5/10

### Strengths
- ~~bcrypt password hashing~~ **CORRECTED 2026-07-03:** this is false. `backend/requirements.txt`'s `passlib[bcrypt]==1.7.4` is incompatible with the installed `bcrypt` version — every hash/verify call crashes on passlib's own internal self-test (`ValueError: password cannot be longer than 72 bytes`) before touching a real password. Registration and login are both **completely broken** in this environment. See the new P0 finding below.
- JWT with configurable algorithm
- HTTP-only cookies for tokens
- Stripe webhook signature verification
- Rate limiting exists (though flawed)
- `secure: is_production` on cookies

### Critical Vulnerabilities

#### [P0-CRITICAL] Docker Socket Mounted — Full Container Escape
**File:** `docker-compose.yml:18`  
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```
The backend container has full access to the host Docker socket. This means:
- Any code execution in the container = full root on the host
- Attacker can launch new containers, mount host filesystems
- Complete infrastructure compromise  
**Fix:** Remove Docker socket mount. Use Docker-in-Docker or a remote Docker daemon via TLS. Never mount the Docker socket in a web-facing container.

#### [P0-CRITICAL] GitHub Token in URL
**File:** `backend/api/deployments.py:593-594`  
```python
repo_url = req.repo_url.replace(
    "https://", f"https://oauth2:{github_token}@"
)
```
The token is embedded in a URL that gets:
1. Passed to `git clone` — visible in `ps aux`
2. Stored in `.git/config` (plaintext) on disk
3. Logged by git in some configurations
4. Transmitted in the clear if not using HTTPS
**Impact:** Permanent credential leakage. Any compromise of the Docker container reveals ALL pushed GitHub tokens.  
**Fix:** Use `gitremotehelper` with credential store or pass token via `GIT_ASKPASS` script:
```bash
echo "$GITHUB_TOKEN" | git clone https://token@github.com/...
```

#### [P0-CRITICAL] CSRF Protection Missing
**File:** `backend/main.py` — No CSRF middleware.  
All POST/PUT/DELETE endpoints accept requests from any origin (CORS at line 35 is permissive). Since cookies are used for auth, any cross-origin form POST or `fetch` with `credentials: 'include'` can execute authenticated actions.  
**Fix:**  
1. Add `Cookie` + `X-CSRF-Token` header validation  
2. Or set `SameSite: strict` on all cookies (currently `lax`)  
3. Or implement CSRF token endpoint  

**UPDATE 2026-07-03:** `csrf_protection_middleware` was added to `backend/main.py` and correctly rejects mutating requests without a valid `X-CSRF-Token` (verified: `GET /auth/csrf-token` issues a token, `PUT /auth/me` 403s without it, 200s with it). However, `frontend/src/lib/api.ts` never fetched or attached that header anywhere — meaning every real user's mutating request (create project, create build, rollback, billing checkout, everything) was silently 403-ing. This is arguably worse than "missing protection": the app was both secure *and* completely non-functional. Fixed today with an axios request interceptor that fetches/caches the token and attaches it automatically; response interceptor clears the cache on 401/403 to force a refetch. See `ENGINEERING_BACKLOG.md` SEC-001 for the corrected root cause and resolution.

#### [P0-CRITICAL, RESOLVED] Password Hashing Was Completely Broken (bcrypt/passlib Version Mismatch)
**File:** `backend/requirements.txt` — `passlib[bcrypt]==1.7.4` + the (then-unpinned) `bcrypt` package.  
**Found:** 2026-07-03, while testing unrelated frontend work. Any call to `hash_password()` or `verify_password()` (i.e. every registration and every login) crashed:
```
File ".../passlib/handlers/bcrypt.py", line 380, in detect_wrap_bug
    if verify(secret, bug_hash):
ValueError: password cannot be longer than 72 bytes, truncate manually if necessary
```
This is passlib's own internal compatibility self-test failing, not a real password being too long — it fired unconditionally on first use. **Registration and login were 100% broken** in this environment; no user could create an account or sign in with a password. Root cause pinned down precisely: `bcrypt>=4.1` removed the `_bcrypt.__about__` module passlib 1.7.4 reads for version detection; the resulting `AttributeError` is what actually triggers the misleading "72 bytes" error inside passlib's fallback self-test.  
**Impact:** Total product outage for the core auth flow. Higher severity than most other findings in this report since it blocks the entire product, not one feature.  
**Fix Applied:** Pinned `bcrypt==4.0.1` (the last version with `__about__` intact) directly below `passlib[bcrypt]==1.7.4` in `requirements.txt`, with a comment warning against bumping it without re-verifying against passlib. Confirmed `bcrypt==5.0.0` reproduces the crash and `bcrypt==4.0.1` doesn't, in isolation, before changing the pin.  
**Fixing this uncovered a second bug**, previously unreachable because registration always crashed at this step before reaching it: Motor's `insert_one()` mutates its input dict in place, injecting a `bson.ObjectId` `_id` field; `register`'s response handler reused that same dict, and FastAPI's serializer crashed on the non-JSON-serializable ObjectId (`PydanticSerializationError`). Fixed by adding `_id` to `_public_user_dict`'s strip list (the same helper added earlier for the credential-leak fix above).  
**Status:** Resolved 2026-07-03 — verified with a real `curl` registration + immediate login round-trip (fresh account, 200 responses, no leaked fields), and the full backend test suite (66/66 passing).

#### [P0-CRITICAL] Auth Endpoints Leaked Password Hash + Raw GitHub Token in Every Response
**File:** `backend/api/auth.py` — `get_me`, `login`, `register`, `refresh` (pre-fix).  
**Found & fixed:** 2026-07-03. `GET /auth/me` decrypted and returned the user's raw GitHub personal-access-token in the JSON body on every call — including from the `ProtectedRoute`/`PublicRoute` guard checks that fire on nearly every page load. Separately, `POST /auth/login`, `POST /auth/register`, and `POST /auth/refresh` all returned the **raw, unfiltered MongoDB user document** as `TokenResponse.user`, which includes the bcrypt `hashed_password` field (plus the encrypted-but-present `github_token` ciphertext, and any verification-token fields present at the time).  
**Impact:** Every authenticated client, and anyone able to observe the response (logging, browser extensions, proxies, a XSS payload), had access to the user's password hash and, via `/auth/me`, their live GitHub token in plaintext.  
**Fix:** Added `_public_user_dict()` in `backend/api/auth.py` — strips `hashed_password`, `github_token`, `verification_token`, `verification_expires` from any user object before it leaves the server, replacing the raw token with a `github_connected: bool`. Applied to all four endpoints.  
**Status:** Resolved.

#### [P1-HIGH] Marketplace Item Creation Crashed on Every Call
**File:** `backend/api/marketplace.py` — `create_item`.  
**Found & fixed:** 2026-07-03. `POST /marketplace/` always raised `fastapi.exceptions.ResponseValidationError` (`created_at` — a Python `datetime` — didn't match the `MarketplaceItemResponse.created_at: str` field). The item was actually inserted into MongoDB before the crash, so failed creates silently left orphaned documents with `datetime`-typed `created_at` that would also break `GET /marketplace/`/`GET /marketplace/{id}` once encountered.  
**Fix:** `create_item` now inserts and returns `item.model_dump(mode="json")` instead of the raw Pydantic model / python-mode dump, matching the pattern already used elsewhere in the codebase (e.g. `orchestrator/store.py`).  
**Status:** Resolved.

#### [P0-CRITICAL] Rate Limit IP Spoofing
**File:** `backend/core/security.py:32-38`  
```python
async def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        client_ip = request.client.host if request.client else "unknown"
        if _is_trusted_proxy(client_ip):
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
```
`_is_trusted_proxy` checks if `request.client.host` (the direct connection IP) is in the trusted list. But `request.client.host` spoofing is trivial from within a Docker network. An attacker can set `X-Forwarded-For: 1.2.3.4` and bypass rate limits entirely.  
**Fix:** Remove `X-Forwarded-For` usage entirely or use a proxy verification middleware.

#### [P0-CRITICAL] JWT Secret Default is Weak
**File:** `backend/core/config.py:11`  
```python
jwt_secret: str = ""
```
If `.env` is not configured (dev environment), `jwt_secret` defaults to empty string. All JWT tokens can be forged with empty secret.  
**Fix:** Enforce minimum length in Settings validator:
```python
@field_validator("jwt_secret")
@classmethod
def check_jwt_secret(cls, v):
    if len(v) < 32:
        raise ValueError("jwt_secret must be at least 32 characters")
    return v
```

#### [P0-CRITICAL] Cookie CSRF via SameSite=lax
**File:** `backend/api/auth.py:147,186`  
```python
response.set_cookie("access_token", ..., samesite="lax")
```
`SameSite=lax` allows cookies to be sent on top-level GET navigations. This provides limited CSRF protection but is insufficient.  
**Fix:** Use `samesite="strict"` for all authentication cookies.

#### [P0-CRITICAL] MongoDB Without Authentication
**File:** `docker-compose.yml:38-40`  
```yaml
mongo:
  image: mongo:7
  ports:
    - "27017:27017"
```
MongoDB is exposed on port 27017 with NO authentication configured. Anyone who can reach this port has full database access.  
**Fix:** Enable MongoDB authentication with a strong password:
```yaml
environment:
  MONGO_INITDB_ROOT_USERNAME: admin
  MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
```

#### [P0-CRITICAL] Redis Without Authentication
**File:** `docker-compose.yml:44`  
```yaml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
```
Redis is exposed without password. Anyone can connect and read/write data.  
**Fix:** Add `--requirepass ${REDIS_PASSWORD}` and configure.

#### [P0-HIGH] OpenAI API Key Leaked via Agent
**File:** `backend/agents/developer.py:33`  
The Developer agent system prompt instructs the AI to generate JWT-based auth code. The generated code could inadvertently include API keys or secrets from the training data. Generated code is not scanned for secrets.  
**Fix:** Add a secret scanning step in the sandbox runner.

#### [P0-HIGH] Rate Limit on Login Missing
**File:** `backend/core/security.py:57-58`  
Login rate limit is set to 10 requests/60 seconds per IP. This is insufficient against distributed brute force (botnet with 1000 IPs = 10,000 requests/minute).  
**Fix:** Add exponential captcha requirement after failed attempts, AND rate limit per-email regardless of IP.

#### [P1-MEDIUM] `secure=False` on Cookies in Production
**File:** `backend/api/auth.py:151,159`  
```python
response.set_cookie("access_token", access_token, httponly=True, secure=False, samesite="lax", max_age=...)
```
In production, `secure=False` means cookies are transmitted over HTTP. If SSL termination happens at load balancer and traffic goes HTTP to the app, cookies are sent in clear text.  
**Fix:** Always set `secure=True` in production.

#### [P1-MEDIUM] No Prompt Injection Defense
**File:** `backend/agents/architect.py:52-57`  
```python
messages.append({"role": "user", "content": f"App idea: {prompt}"})
```
User input is directly injected into the AI prompt with no sanitization. An attacker can craft prompts that:
- Hijack the agent system prompt
- Execute prompt injection attacks
- Extract sensitive information from the agent's context
**Fix:** Implement prompt boundary tokens, input filtering for prompt injection patterns, and output validation before execution.

#### [P1-MEDIUM] No Input Length Limits
**File:** `backend/api/builds.py:50-52`  
```python
class CreateBuildRequest(BaseModel):
    project_id: str
    prompt: str
```
No `max_length` on `prompt` field. An attacker could send a 1GB prompt string, causing OOM.  
**Fix:** Add Pydantic field validators with reasonable max lengths.

### Full Security Issues Table

| # | Issue | File | Severity | OWASP Category |
|---|---|---|---|---|
| 1 | Docker socket mounted | `docker-compose.yml:18` | CRITICAL | A6:2021 |
| 2 | GitHub token in URL+git config | `deployments.py:593` | CRITICAL | A5:2021 |
| 3 | No CSRF protection | All POST endpoints | CRITICAL | A1:2021 |
| 4 | Rate limit IP spoofable | `security.py:32-38` | CRITICAL | A4:2021 |
| 5 | JWT secret default empty | `config.py:11` | CRITICAL | A2:2021 |
| 6 | MongoDB no auth | `docker-compose.yml:39` | CRITICAL | A5:2021 |
| 7 | Redis no auth | `docker-compose.yml:46` | CRITICAL | A5:2021 |
| 8 | WebSocket token in URL | `useBuildSocket.ts:61` | HIGH | A3:2021 |
| 9 | CORS wildcard methods+headers | `main.py:37-38` | HIGH | A1:2021 |
| 10 | SameSite=lax insufficient | `auth.py:147,186` | HIGH | A1:2021 |
| 11 | No login rate limit per-email | `security.py:57-58` | HIGH | A4:2021 |
| 12 | No prompt injection defense | All agents | MEDIUM | - |
| 13 | No input length limits | `builds.py:51` | MEDIUM | A3:2021 |
| 14 | `secure=False` in prod | `auth.py:151` | MEDIUM | A5:2021 |
| 15 | Admin by email list only | `admin.py:16-18` | MEDIUM | A1:2021 |
| 16 | Demo mode auth bypass | `authStore.ts` | HIGH | A7:2021 |
| 17 | Secrets in Docker image | `Dockerfile:12` | HIGH | A5:2021 |
| 18 | No email verification | `auth.py` | MEDIUM | A7:2021 |

### Priority: P0 — Immediate (32-40 hours)

---

## 12. ACCESSIBILITY SCORE — 5.5/10

### Strengths
- Skip-to-content link (`WorkspaceLayout.tsx:97-103`)
- ARIA labels on all interactive elements
- `aria-invalid` and `aria-describedby` on form fields
- Focus rings present on all interactive elements
- `role="progressbar"` on loading indicators
- `role="alert"` on error messages
- `role="tablist/tab/tabpanel"` on tab interfaces
- `role="list/listitem"` on lists

### Weaknesses
- **No `lang="en"` on HTML** — screen readers assume default language
- **No `prefers-reduced-motion`** — `index.css:116-133` has a `@media` block for reduced motion but it only disables animations — it doesn't actually work with framer-motion components. Framer Motion's `motion.div` creates inline styles that this CSS can't override
- **Color-only indicators** — status badges use color exclusively (green=success, red=failed). No icon or text alternative for colorblind users
- **Mobile sidebar is a `<div>` with role, not a `<dialog>`** — screen readers don't get dialogue semantics. No `aria-modal="true"`
- **User menu has no `aria-modal`** — the dropdown at `WorkspaceHeader.tsx:58-73` is a positioned `<div>` with no dialog semantics. Focus is not trapped inside
- **Toast notifications from `react-hot-toast`** — not announced by screen readers. Need `role="status"` and `aria-live="polite"`

### Priority: P2 — Medium (8-12 hours)

---

## 13. SEO SCORE — 1/10

### Complete Failure. No SEO implementation whatsoever.

### Issues
- **No server-side rendering (SSR) or static generation (SSG)** — Vite dev server and production build are pure SPA. All content is JavaScript-rendered. Google crawlers cannot index any page content
- **No `<title>` in HTML** — `index.html` has no custom title. All pages share "Vite + React + TS"
- **No meta tags** — no `<meta name="description">`, `<meta name="og:title">`, `<meta name="twitter:card">` on any page
- **No sitemap.xml** — Google cannot discover pages
- **No robots.txt** — crawlers get no instructions
- **No structured data (JSON-LD)** — no schema.org markup
- **No canonical URLs** — duplicate content possible
- **No hreflang tags** — multilingual impossible
- **All routes use `#`-less routing but content is client-rendered** — React Router works but pre-rendering isn't configured
- **No SSR framework** — React 18's `renderToPipeableStream` is available but unused

### Priority: P3 — Low (unless SEO is a requirement) (16-20 hours for SSR implementation)

---

## 14. ANALYTICS SCORE — 3.5/10

### Strengths
- Funnel metrics endpoints
- Retention calculation (though expensive)
- Build success rate tracking
- Personal analytics per user
- AI cost estimation

### Weaknesses
- **No anonymous analytics** — all tracking requires authentication
- **No TTL indexes on events** — unbounded collection growth
- **Retention `$lookup` is O(n²) at scale** — `analytics.py:217-234` does a join from users → analytics_events with no indexes
- **Hardcoded `tokens_per_usd = 1000`** (`analytics.py:414`) — this is NOT real AI pricing. Actual costs vary by model
- **No event deduplication** — same event can be tracked multiple times, skewing metrics
- **Admin analytics param mismatch** — `Admin.tsx:37` sends `range` param; backend ignores it

### Critical Bugs

#### [P1] Retention Query Runtime O(n²)
**File:** `backend/api/analytics.py:217-252`  
The `_calculate_retention` function uses `$lookup` from users → analytics_events. At 1M users with 100M events, this query will time out or OOM. No index on `analytics_events.(user_id, event_name, created_at)`.  
**Fix:** Pre-compute retention data in a background job and store aggregated results. Or use a materialized view.

#### [P2] No Event Deduplication
**File:** `backend/api/analytics.py:105-124`  
The `track_event` endpoint has no idempotency check. If the client sends the same event twice (due to retry logic), both are recorded.  
**Fix:** Accept an optional `event_id` from client and use `upsert` with `{"event_id": event_id}`.

### Priority: P2 — Medium (8-12 hours)

---

## 15. DEVOPS SCORE — 2.5/10

### Strengths
- Docker Compose setup
- Dockerfiles for both frontend and backend
- `.env.example` for configuration

### Critical Bugs

#### [P0] `--reload` in Production Dockerfile
**File:** `backend/Dockerfile:14`  
```dockerfile
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```
`--reload` watches files for changes and restarts. In production this causes: memory leaks (file watchers), CPU overhead, and source code exposure on error pages.  
**Fix:** Remove `--reload` and use `--workers 4` for production.

#### [P0] Secrets Copied into Docker Image
**File:** `backend/Dockerfile:12`  
```dockerfile
COPY . .
```
This copies ALL files including `.env`, `.git`, and any secrets into the Docker image. Anyone with image pull access gets all secrets.  
**Fix:** Use `.dockerignore` to exclude `.env`, `.git`, `__pycache__`, `.venv`. Pass secrets via environment variables at runtime.

#### [P0] No Health Checks
**File:** `docker-compose.yml` — No `healthcheck` block on any service. Docker Compose won't know when services are actually ready. Backend may start accepting requests before MongoDB is initialized.  
**Fix:** Add health checks to all services.

#### [P1] No Resource Limits
**File:** `docker-compose.yml` — No `deploy.resources.limits` for any service. A runaway container can consume all host memory/CPU.  
**Fix:** Add `mem_limit`, `cpus` constraints.

### Missing Features
- CI/CD pipeline (GitHub Actions / GitLab CI)
- Pre-commit hooks
- Ruff/flake8 + ESLint/Prettier configs
- Linting in CI
- MongoDB backup cron
- Log aggregation (ELK or Loki)
- Monitoring (Prometheus + Grafana)
- Sentry/Rollbar for error tracking

### Priority: P0 — Immediate (8-12 hours)

---

## 16. CLOUD SCORE — 1.5/10

### Weaknesses
- **No Infrastructure as Code** — not even a single Terraform file or CloudFormation template
- **Preview URLs resolve to `localhost`** — unreachable from any other machine. Requires a public load balancer with domain
- **No CDN** — all static assets served directly from the origin server
- **No WAF** — no protection against OWASP Top 10
- **No secrets management** — secrets in `.env` file, no Vault, no AWS Secrets Manager, no Kubernetes Secrets
- **No auto-scaling** — Docker Compose is single-host only. No orchestrator (Kubernetes, Nomad, ECS)
- **No disaster recovery** — no backup of MongoDB data
- **No multi-region** — single-region deployment limits
- **No DDoS protection** — rate limiting is weak and bypassable

### The Path to Cloud Readiness
1. Add Terraform modules for: VPC, ECS/GKE, RDS/Atlas, ElastiCache, ALB, CloudFront, WAF
2. Implement blue-green deployment
3. Add CloudFront CDN for frontend assets
4. Configure AWS Secrets Manager or similar
5. Set up CloudWatch/Prometheus monitoring
6. Implement auto-scaling policies

### Priority: P3 — Low (32-40 hours for full IaC)

---

## 17. MAINTAINABILITY SCORE — 4/10

### Strengths
- Consistent module structure
- Type hints throughout
- Pydantic v2 models
- Reasonable variable naming
- Some separation of concerns

### Weaknesses
- **No unit or integration tests** — `backend/tests/test_p0_fixes.py` contains 44 lines of text-parsing "tests" that check for string presence in files, not actual test execution. They don't test any logic
- **No lint configuration** — no `.eslintrc`, `.pyproject.toml` for ruff, no `.prettierrc`
- **30+ untracked TODOs** — `grep -r "TODO" .` shows scattered incomplete work
- **No commit conventions** — no commitlint, conventional commits
- **No pre-commit hooks**
- **No documentation beyond README** — no ADRs, no API docs beyond auto-generated Swagger

### Critical Bugs

#### [P2] Fake Tests
**File:** `backend/tests/test_p0_fixes.py:10-43`  
```python
def test_credit_reservation_code_present():
    s = p.read_text(encoding="utf-8")
    assert "find_one_and_update" in s
    assert "\"credits\": {\"$gte\"" in s
```
These "tests" just check if certain strings appear in source files. They don't actually execute any code. They don't test logic, edge cases, race conditions, or error handling.  
**Impact:** Zero test coverage. False sense of security.  
**Fix:** Write actual pytest tests with mocked MongoDB and HTTP test client.

### Priority: P1 — High (16-20 hours for initial test suite)

---

## 18. SCALABILITY SCORE — 1.5/10

### Critical Blockers

#### [P0] In-Memory WebSocket State Prevents Multi-Worker
**File:** `backend/services/ws_manager.py:14`  
Worker A has WS client 1 connected, Worker B has WS client 2. When orchestrator on Worker A emits an event for build X, only WS client 1 receives it because the event is broadcast to the in-memory dict on Worker A only.  
**Impact:** Cannot run >1 server process. Zero HA.  
**Fix:** Use Redis pub/sub. Events are published to Redis channel, each worker subscribes and broadcasts to its local connections.

#### [P0] MongoDB 16MB Document Limit
**File:** `backend/core/models.py:147` — Already documented. Blocks building any app with more than ~200 files.

#### [P0] No Database Read Replicas
All queries hit the single MongoDB primary. Analytics queries (aggregations) and user queries compete for the same resources. No read preference configuration.

#### [P1] No Connection Pool Sizing
The default MongoDB connection pool (100) may be exhausted under load. No `maxPoolSize` configuration.

### Priority: P0 — Immediate (24-32 hours)

---

## 19. ENTERPRISE READINESS — 1.5/10

### Gaps
- **No RBAC** — admin check is email-based (`admin.py:16-18`). No role hierarchy, no permission model
- **No SOC2 controls** — no audit trail enforcement, no access reviews, no encryption at rest verification
- **No data residency** — all data stored in a single MongoDB. No multi-region support
- **No SLA metrics** — no uptime tracking, no latency SLAs
- **No SSO/SAML** — listed in Pro plan features (`billing.py:62`) but not implemented
- **No backup/restore API** — no way to schedule or initiate backups programmatically
- **No incident response tools** — no error budget tracking, no on-call integration
- **No tenant isolation** — all users share the same database. One user's malicious query can impact all others
- **No API key management** — no way to create service accounts or API keys for programmatic access
- **No rate limit headers** — clients don't receive `X-RateLimit-*` headers and can't implement client-side backoff

### Priority: P2 — Medium (24-40 hours for foundational enterprise features)

---

# TOP 100 IMPROVEMENTS RANKED BY ROI

ROI = Impact × Urgency / Effort. Scale 1-10 for each factor.

| Rank | Category | Improvement | Impact | Urgency | Effort (hrs) | ROI Score | Files |
|---|---|---|---|---|---|---|---|
| 1 | Security | Remove Docker socket mount | 10 | 10 | 0.5 | 200 | `docker-compose.yml:18` |
| 2 | Security | Fix GitHub token leakage (use GIT_ASKPASS) | 10 | 10 | 1 | 100 | `deployments.py:593` |
| 3 | Security | Add MongoDB authentication | 10 | 10 | 1 | 100 | `docker-compose.yml:39` |
| 4 | Security | Add Redis password | 10 | 10 | 0.5 | 200 | `docker-compose.yml:46` |
| 5 | Security | Remove `--reload` from Dockerfile | 9 | 10 | 0.5 | 180 | `backend/Dockerfile:14` |
| 6 | Security | Add `.dockerignore` | 10 | 10 | 0.5 | 200 | `backend/Dockerfile:12` |
| 7 | Security | Enforce JWT secret min length | 10 | 9 | 0.5 | 180 | `config.py:11` |
| 8 | Security | Fix CSRF — use `SameSite=strict` | 9 | 10 | 0.5 | 180 | `auth.py:147,186` |
| 9 | Security | Remove `X-Forwarded-For` rate limit bypass | 9 | 9 | 1 | 81 | `security.py:32-38` |
| 10 | Security | WebSocket auth via short-lived token (not URL) | 9 | 9 | 2 | 40.5 | `useBuildSocket.ts:61` |
| 11 | Security | Rate limiting via Redis (not MongoDB) | 8 | 9 | 3 | 24 | `security.py:48-118` |
| 12 | Database | Add all missing indexes | 9 | 10 | 2 | 45 | `database.py:19-33` |
| 13 | Database | TTL index on analytics_events | 9 | 9 | 0.5 | 162 | `analytics.py` |
| 14 | Database | TTL index on rate_limits | 9 | 9 | 0.5 | 162 | `security.py:108-118` |
| 15 | Database | Separate build_files collection | 9 | 10 | 4 | 22.5 | `models.py:147, builds.py` |
| 16 | Database | Fix invitation token double-storage | 9 | 9 | 0.5 | 162 | `auth.py:496` |
| 17 | Database | Configurable MongoDB connection pool | 8 | 8 | 0.5 | 128 | `database.py:13` |
| 18 | Database | Asyncio lock for singleton init | 8 | 8 | 1 | 64 | `database.py:7-15` |
| 19 | Architecture | Move builds to Celery/Redis queue | 9 | 9 | 8 | 10.1 | `builds.py, orchestrator.py` |
| 20 | Architecture | Add build timeout via `asyncio.wait_for` | 9 | 9 | 1 | 81 | `builds.py:105` |
| 21 | Architecture | WebSocket over Redis pub/sub | 8 | 9 | 6 | 12 | `ws_manager.py:14` |
| 22 | Architecture | Add circuit breaker for Anthropic API | 8 | 8 | 3 | 21.3 | `base.py:16-19` |
| 23 | Architecture | Send file deltas over WebSocket (not full set) | 7 | 8 | 3 | 18.7 | `orchestrator.py:143` |
| 24 | Frontend | Add Error Boundaries to all routes | 9 | 9 | 2 | 40.5 | `App.tsx` |
| 25 | Frontend | Fix auth store race condition | 9 | 9 | 1 | 81 | `authStore.ts:40` |
| 26 | Frontend | Fix remember-me XSS | 8 | 9 | 1 | 72 | `Login.tsx:69-72` |
| 27 | Frontend | Fix admin auth client-side bypass | 9 | 9 | 1 | 81 | `App.tsx:85-98` |
| 28 | Frontend | Add build deduplication guard | 8 | 8 | 1 | 64 | `buildStore.ts:63` |
| 29 | Frontend | Remove duplicate ActivityFeed | 3 | 3 | 0.5 | 18 | `ActivityFeed.tsx:27,87` |
| 30 | Frontend | Replace hardcoded colors with CSS vars | 4 | 4 | 1 | 16 | `Settings.tsx:57,89,127` |
| 31 | Frontend | Static import in ChatPanel | 4 | 5 | 0.5 | 40 | `ChatPanel.tsx:74` |
| 32 | Frontend | Fix WebSocket ping (use native heartbeat) | 5 | 6 | 1 | 30 | `useBuildSocket.ts:60` |
| 33 | Backend | Fix get_current_user MongoDB hot path — add Redis cache | 8 | 9 | 3 | 24 | `auth.py:79-124` |
| 34 | Backend | Fix build credit refund race condition | 9 | 9 | 2 | 40.5 | `builds.py:148-150` |
| 35 | Backend | Remove duplicate build_id check in WS endpoint | 6 | 7 | 0.5 | 84 | `builds.py:243-250` |
| 36 | Backend | Add trial enforcement | 7 | 8 | 1 | 56 | `orchestrator.py:258-266` |
| 37 | Backend | Fix agent credit tracking (missing agents) | 6 | 7 | 1 | 42 | `orchestrator.py:259-265` |
| 38 | API | Add API versioning prefix | 6 | 7 | 2 | 21 | `main.py:44-51` |
| 39 | API | Fix CORS origin list type | 8 | 8 | 1 | 64 | `main.py:33-38` |
| 40 | API | Fix unbounded to_list(None) everywhere | 9 | 9 | 3 | 27 | `admin.py:206, builds.py:222` |
| 41 | API | Add input length validation | 7 | 8 | 1 | 56 | `builds.py:50-52` |
| 42 | API | Add request ID tracing | 5 | 6 | 3 | 10 | All endpoints |
| 43 | API | Add rate limit response headers | 6 | 6 | 1 | 36 | `security.py` |
| 44 | API | Add pagination cursors | 7 | 7 | 4 | 12.25 | All list endpoints |
| 45 | API | Disable Swagger in production | 8 | 7 | 0.5 | 112 | `main.py` |
| 46 | Product | Fix password reset full flow | 9 | 10 | 4 | 22.5 | `App.tsx:214, growth.py` |
| 47 | Product | Implement template selection | 6 | 7 | 2 | 21 | `Onboarding.tsx:66, projects.py:11` |
| 48 | Product | Fix admin export endpoint | 5 | 5 | 1 | 25 | `Admin.tsx:61` |
| 49 | Product | Fix preview URL (use real domain) | 8 | 9 | 2 | 36 | `deployments.py:355-358` |
| 50 | Product | Dunning workflow (3 emails before downgrade) | 7 | 6 | 4 | 10.5 | `growth.py` |
| 51 | Product | Add credit usage alerts | 6 | 6 | 2 | 18 | `growth.py` |
| 52 | Product | Add email verification | 7 | 7 | 3 | 16.3 | `auth.py` |
| 53 | Product | Add build timeout to backend config | 7 | 7 | 0.5 | 98 | `config.py` |
| 54 | DevOps | Add health checks to docker-compose | 8 | 8 | 1 | 64 | `docker-compose.yml` |
| 55 | DevOps | Add resource limits | 8 | 8 | 0.5 | 128 | `docker-compose.yml` |
| 56 | DevOps | Add CI/CD pipeline config | 8 | 7 | 4 | 14 | `.github/workflows` |
| 57 | DevOps | Add pre-commit hooks | 6 | 6 | 1 | 36 | `.pre-commit-config.yaml` |
| 58 | DevOps | Add lint config files | 5 | 5 | 1 | 25 | `.ruff.toml, .eslintrc` |
| 59 | DevOps | Set up logging (ELK/Loki) | 7 | 6 | 6 | 7 | New service |
| 60 | DevOps | Set up monitoring (Prometheus/Grafana) | 7 | 6 | 8 | 5.25 | New service |
| 61 | DevOps | Set up error tracking (Sentry) | 7 | 6 | 2 | 21 | `main.py` |
| 62 | Performance | Add Redis caching for hot endpoints | 8 | 7 | 4 | 14 | Various |
| 63 | Performance | Optimize N+1 admin queries with $facet | 7 | 6 | 2 | 21 | `admin.py:204-207` |
| 64 | Performance | Add response compression middleware | 6 | 5 | 1 | 30 | `main.py` |
| 65 | Performance | Add CDN for static assets | 6 | 5 | 2 | 15 | `frontend/vite.config.ts` |
| 66 | Performance | PerMessage-Deflate for WebSocket | 5 | 4 | 2 | 10 | `ws_manager.py` |
| 67 | Testing | Add actual unit tests for auth endpoints | 8 | 8 | 4 | 16 | New `tests/` |
| 68 | Testing | Add integration tests for build pipeline | 8 | 8 | 6 | 10.7 | New `tests/` |
| 69 | Testing | Add regression tests for credit deduction | 9 | 8 | 2 | 36 | New `tests/` |
| 70 | Testing | Add WebSocket ownership tests | 8 | 7 | 2 | 28 | New `tests/` |
| 71 | Testing | Remove fake text-parsing tests | 6 | 5 | 0.5 | 60 | `test_p0_fixes.py` |
| 72 | UX | Add offline/error state to build inputs | 7 | 7 | 1 | 49 | `WorkspaceLayout.tsx` |
| 73 | UX | Add confirmation dialogs for destructive actions | 6 | 5 | 2 | 15 | `Admin.tsx, projects.py` |
| 74 | UX | Add time zone conversion | 4 | 3 | 2 | 6 | Various |
| 75 | UX | Add empty state for Settings | 4 | 4 | 0.5 | 32 | `Settings.tsx` |
| 76 | UX | Fix demo mode silent fallback | 8 | 8 | 1 | 64 | `authStore.ts:47-49` |
| 77 | Accessibility | Add `lang="en"` to HTML | 5 | 4 | 0.5 | 40 | `index.html` |
| 78 | Accessibility | Fix framer-motion reduce-motion override | 5 | 4 | 1 | 20 | `index.css:116-133` |
| 79 | Accessibility | Add text alternatives to color-only indicators | 5 | 4 | 1 | 20 | Various |
| 80 | Accessibility | Add `aria-modal` to dialogs | 4 | 3 | 1 | 12 | `WorkspaceSidebar.tsx` |
| 81 | Accessibility | Fix toast notifications for screen readers | 4 | 3 | 1 | 12 | `App.tsx:223-233` |
| 82 | Analytics | Pre-compute retention data | 6 | 5 | 4 | 7.5 | `analytics.py:217-252` |
| 83 | Analytics | Add event deduplication | 5 | 4 | 1 | 20 | `analytics.py:105-124` |
| 84 | Analytics | Add anonymous analytics endpoint | 4 | 3 | 2 | 6 | `analytics.py` |
| 85 | Analytics | Fix admin analytics param | 3 | 3 | 0.5 | 18 | `Admin.tsx:37` |
| 86 | Business | Hardcode real Stripe price IDs | 6 | 6 | 0.5 | 72 | `billing.py:17-28` |
| 87 | Business | Add usage alerting (email at thresholds) | 6 | 5 | 3 | 10 | `growth.py` |
| 88 | Business | Add refund/dispute workflow | 4 | 3 | 3 | 4 | `billing.py` |
| 89 | Business | Add marketplace moderation | 5 | 4 | 2 | 10 | `marketplace.py` |
| 90 | Business | Fix `_map_price_to_plan` O(n) | 3 | 3 | 0.5 | 18 | `billing.py:346-352` |
| 91 | Enterprise | Add RBAC model and enforcement | 7 | 5 | 8 | 4.4 | `models.py, auth.py` |
| 92 | Enterprise | Add audit trail for all admin actions | 6 | 5 | 4 | 7.5 | `admin.py` |
| 93 | Enterprise | Add API key management | 5 | 4 | 6 | 3.3 | New module |
| 94 | Enterprise | Add backup/restore API | 5 | 4 | 4 | 5 | `admin.py` |
| 95 | Enterprise | Add SSO/SAML support | 6 | 4 | 8 | 3 | New service |
| 96 | Enterprise | Add tenant data isolation | 6 | 5 | 6 | 5 | Database layer |
| 97 | Enterprise | Add rate limit response headers | 4 | 3 | 1 | 12 | `security.py` |
| 98 | Cloud | Add Terraform modules for single-region | 6 | 4 | 12 | 2 | New `terraform/` |
| 99 | Cloud | Add CloudFront CDN | 5 | 3 | 4 | 3.75 | Cloud |
| 100 | Cloud | Configure WAF for OWASP protection | 6 | 4 | 4 | 6 | Cloud |

---

# IMPLEMENTATION PLAN SUMMARY

## Phase 1 — Critical Security (32-40 engineering hours)
1. Remove Docker socket mount
2. Fix GitHub token handling (use GIT_ASKPASS)
3. Add MongoDB + Redis authentication
4. Fix `--reload` in Dockerfile
5. Add `.dockerignore`
6. Enforce JWT secret length
7. CSRF: `SameSite=strict` on cookies
8. Fix IP spoofing in rate limiter
9. Rate limiting via Redis (not MongoDB)
10. WebSocket auth via short-lived token

## Phase 2 — Database Critical (24-28 hours)
1. Add all missing indexes
2. TTL indexes on analytics_events and rate_limits
3. Separate build_files collection
4. Fix invitation token storage
5. Asyncio lock for singleton init
6. Fix get_current_user with Redis caching

## Phase 3 — Architecture (32-40 hours)
1. Move builds to Celery/Redis queue
2. Add build timeout
3. WebSocket over Redis pub/sub
4. Circuit breaker for AI API calls
5. Send file deltas over WebSocket
6. Fix unbounded `to_list(None)` everywhere
7. Add API versioning

## Phase 4 — Frontend Critical (16-20 hours)
1. Add Error Boundaries
2. Fix auth store race conditions
3. Fix XSS via remember-me
4. Fix admin auth bypass
5. Add build deduplication
6. Fix demo mode fallback

## Phase 5 — Product Critical (20-24 hours)
1. Implement full password reset flow
2. Implement template selection
3. Fix preview URL
4. Add admin export endpoint
5. Fix credit refund race condition
6. Add trial enforcement

## Phase 6 — Testing & Quality (24-32 hours)
1. Write unit tests for auth, billing, builds
2. Integration tests for pipeline
3. Write regression tests
4. Add lint config and pre-commit
5. Add CI/CD pipeline

## Phase 7 — Performance & Scale (16-20 hours)
1. Redis caching for hot endpoints
2. N+1 query fixes
3. Compression middleware
4. Connection pool tuning

## Phase 8 — Accessibility, UX, Analytics (16-20 hours)

---

# ESTIMATED ENGINEERING HOURS

| Phase | Hours | Team Size | Calendar Time |
|---|---|---|---|
| Phase 1 — Security Critical | 36 | 3 engineers | 1.5 weeks |
| Phase 2 — Database Critical | 28 | 2 engineers | 2 weeks |
| Phase 3 — Architecture | 36 | 3 engineers | 2 weeks |
| Phase 4 — Frontend Critical | 18 | 2 engineers | 1 week |
| Phase 5 — Product Critical | 22 | 2 engineers | 1.5 weeks |
| Phase 6 — Testing & Quality | 28 | 2 engineers | 2 weeks |
| Phase 7 — Performance | 18 | 2 engineers | 1.5 weeks |
| Phase 8 — Polish | 18 | 2 engineers | 1.5 weeks |
| **Total** | **204** | **3 engineers avg** | **~6-8 weeks** |

---

# EXPECTED IMPROVEMENT AFTER FIXES

| Metric | Before | After |
|---|---|---|
| Overall Score | 3.8/10 | 7.5/10 |
| Security Score | 1.5/10 | 7/10 |
| Database Score | 2.5/10 | 7/10 |
| Architecture Score | 2.5/10 | 6.5/10 |
| Performance Score | 2/10 | 6/10 |
| Frontend Score | 3.5/10 | 7/10 |
| Backend Score | 3/10 | 7/10 |
| API Score | 3.5/10 | 7/10 |
| DevOps Score | 2.5/10 | 7/10 |
| Scalability Score | 1.5/10 | 6/10 |
| Enterprise Readiness | 1.5/10 | 5/10 |
| Max concurrent users | ~50 (single process) | ~10,000 (multi-worker) |
| Authentication safety | Critical vulnerabilities | OWASP-compliant |
| Build reliability | Zero error handling | Timeouts, retries, circuit breakers |
| Data safety | Zero encryption | Encrypted at rest |

---

*Audit conducted across 70+ source files, 18 API route groups, 10 pages/UI components, 12 database collections, 6 AI agent implementations, and 5 business workflows.*

*End of Report*