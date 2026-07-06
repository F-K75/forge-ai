# AI-001: LLM Cost Tracking & User Budget Controls

## Problem

The AI pipeline has no effective per-user cost controls. The infrastructure for cost tracking already exists (`core/ai_usage.py` with `track_usage()`, `check_budget()`, `calculate_cost()`, `get_user_budget()`, `get_spending_dashboard()`) but has critical gaps that make it non-functional for production:

1. **`check_budget()` passes `estimated_tokens=0` at every call site** — so it only blocks users who are *already* over their daily limit, not those about to exceed it. The check allows an unbounded number of calls until the exact moment the limit is crossed, then blocks the *next* call — but by then the damage is done.

2. **No token estimation before LLM calls** — the router has no way to predict how many tokens a request will consume, so it cannot make an informed pre-authorization decision.

3. **No concurrent request limiting** — a user can fire 10+ simultaneous LLM calls, bypassing the sequential budget check entirely and saturating the provider rate limits for all users.

4. **No spending alerts** — `credit_alerts.py` sends low-credit warnings via Resend email, but there is no equivalent for daily token budget consumption.

5. **No admin spending dashboard API** — `get_spending_dashboard()` exists in code but no HTTP endpoint calls it, making per-user cost invisible to operators.

6. **No MongoDB index on `ai_usage`** — the aggregation queries powering budget checks and the dashboard scan the entire collection.

7. **No unit tests for budget enforcement** — the budget code path is entirely untested.

## Root Cause

The original `ai_usage.py` was written as a scaffold with the right data model and helper functions, but was never wired into the production execution path with real enforcement. The `estimated_tokens` parameter defaulting to `0` was a placeholder that was never revisited.

## Solution

### Phase 1: Token Estimation & Budget Enforcement

**Token estimation heuristic:**
Add `estimate_tokens(text: str) -> int` to `core/ai_usage.py` that uses a simple character-count-based heuristic (~4 chars per token for English text, ~1.5 chars per token for code). This is a pre-call estimate only; exact token counts from the provider response override it after the call completes.

**Budget enforcement at two layers:**
1. **`LLMRouter.generate()`** — estimate tokens from the concatenated messages, pass to `check_budget()` with a realistic estimate, reject with 429/402 before making any API call
2. **`agents/base.py`** — same check at the agent level before the router is invoked

**Graceful rejection:**
- `BudgetExceeded` caught in `LLMRouter.generate()` → converted to `ProviderError` with a user-friendly message
- Propagated through the agent pipeline → build marked as `failed` with `error="Daily token budget exceeded"`
- Frontend displays the error in the build view

### Phase 2: Concurrent Request Limiting

Add a per-user semaphore in `LLMRouter`:

```python
_concurrent_requests: Dict[str, asyncio.Semaphore] = {}
_CONCURRENT_LIMITS = {"free": 2, "standard": 5, "pro": 10, "enterprise": 25}
```

- Acquire semaphore before calling the provider
- Release after response (success or failure)
- Timeout after 30s to prevent deadlocks

### Phase 3: Spending Alerts

Add alert thresholds to `User` model fields (already has `credit_alerts_sent: List[str]`):

```python
# Track which token-budget alert thresholds have been fired for this user
# Values: "daily_50", "daily_80", "daily_100"
token_budget_alerts_sent: List[str] = Field(default_factory=list)
```

Add `check_and_send_token_budget_alerts()` to `core/ai_usage.py`:
- After every `track_usage()` call, check current usage vs daily limit
- If usage >= 50% and "daily_50" not in alerts_sent → send email → mark sent
- Same for 80% and 100%
- Uses existing Resend integration

### Phase 4: Admin Spending Dashboard API

Add `GET /admin/ai-spending` endpoint that calls `get_spending_dashboard()` and returns per-user cost breakdown.

### Phase 5: MongoDB Index

Add `ai_usage` index to `_ensure_indexes()` in `core/database.py`:
```python
await db.ai_usage.create_index([("user_id", 1), ("created_at", -1)])
await db.ai_usage.create_index([("org_id", 1), ("created_at", -1)])
await db.ai_usage.create_index("created_at", expireAfterSeconds=7776000)  # TTL: 90 days
```

## Architecture changes

No service topology changes. All changes are within the existing backend service:
- `core/ai_usage.py` — token estimation, budget enforcement, spending alerts
- `core/llm/router.py` — concurrent request limiting, budget check before LLM call
- `agents/base.py` — budget check before agent invocation
- `core/models.py` — `token_budget_alerts_sent` field on User
- `core/database.py` — ai_usage indexes
- `api/admin.py` — spending dashboard endpoint

## Database changes

- New field `token_budget_alerts_sent: List[str]` on User documents (default empty list)
- New indexes on `ai_usage` collection

## API changes

- `GET /admin/ai-spending` — returns per-user token/cost breakdown (admin-only)

## UI changes

None. The existing `/analytics/ai-cost` endpoint already serves per-user cost data to the frontend. The admin endpoint is for operator dashboards.

## Testing strategy

- Unit test `estimate_tokens()` with English text, code, mixed content
- Unit test `check_budget()` with realistic estimates (should reject when estimate + used > limit)
- Unit test concurrent request limiting (semaphore acquisition/release)
- Unit test spending alert thresholds (50%, 80%, 100%)
- Unit test admin spending dashboard endpoint
- Run full backend test suite (88+ tests)
- Run lint, typecheck, build

## Risks

- Token estimation is heuristic-based and may over- or under-estimate. Over-estimation causes false rejections (user blocked from building despite having budget). Under-estimation allows brief overages. Mitigation: use conservative estimation (round up), and exact counts from provider response always override.
- Concurrent request limiting may block legitimate parallel agent calls. Mitigation: limits are per-plan and generous (Pro gets 10 concurrent).
- Spending alerts may fail to send if Resend is down. Mitigation: alerts are best-effort; budget enforcement is the real control.

## Rollback plan

Revert all changes to `core/ai_usage.py`, `core/llm/router.py`, `agents/base.py`, `core/models.py`, `core/database.py`, `api/admin.py` and redeploy. The `ai_usage` collection and its indexes are additive and safe to keep. The `token_budget_alerts_sent` field on User documents is additive and safe to keep.

---

# COMPLETION STATUS (2026-07-06)

## AI-001: LLM Cost Tracking & User Budget Controls — COMPLETED

All five phases have been implemented and validated:

### Phase 1: Token Estimation & Budget Enforcement ✅
- `estimate_tokens()` added to `core/ai_usage.py` — character-count heuristic (~4 chars/token for text, ~1.5 for code)
- `check_budget()` now called with realistic estimates from `LLMRouter.generate()` and `agents/base.py`
- `BudgetExceeded` caught and converted to user-friendly error in the build pipeline

### Phase 2: Concurrent Request Limiting ✅
- Per-user `asyncio.Semaphore` in `LLMRouter` with plan-based limits (free: 2, standard: 5, pro: 10, enterprise: 25)
- 30-second timeout to prevent deadlocks
- Semaphore released on both success and failure paths

### Phase 3: Spending Alerts ✅
- `token_budget_alerts_sent: List[str]` field on User model
- `check_and_send_token_budget_alerts()` fires at 50%, 80%, 100% thresholds
- Uses existing Resend email integration

### Phase 4: Admin Spending Dashboard API ✅
- `GET /admin/ai-spending` endpoint returns per-user token/cost breakdown
- Admin-only access via `admin_required` dependency

### Phase 5: MongoDB Index ✅
- `ai_usage` indexes added to `_ensure_indexes()`:
  - `[("user_id", 1), ("created_at", -1)]`
  - `[("org_id", 1), ("created_at", -1)]`
  - `"created_at"` with TTL of 90 days

### Validation ✅
- All 12 new tests pass
- Full backend test suite passes (88+ tests)
- Lint passes (ruff, bandit)
- No TypeScript errors
- Frontend build succeeds

## Files Changed

| File | Change |
|------|--------|
| `backend/core/ai_usage.py` | Added `estimate_tokens()`, `check_and_send_token_budget_alerts()`, fixed `check_budget()` to use estimates |
| `backend/core/llm/router.py` | Added concurrent request limiting, budget check with estimates before LLM call |
| `backend/agents/base.py` | Added budget check with estimate before agent invocation |
| `backend/core/models.py` | Added `token_budget_alerts_sent` field to User |
| `backend/core/database.py` | Added ai_usage indexes |
| `backend/api/admin.py` | Added `GET /admin/ai-spending` endpoint |
| `backend/tests/test_ai_cost_tracking_wired.py` | New test file with 12 test cases |
| `IMPLEMENTATION_PLAN.md` | Updated with completion status |

## Remaining Backlog

After AI-001, the next highest-priority items:
1. **AI-003**: Per-user LLM rate limiting (concurrent request caps — partially addressed by Phase 2, but needs per-user queue depth limits)
2. **INF-002**: Add `prometheus_client` to `requirements.txt` so metrics endpoint actually works
3. **AI-002**: Secondary LLM call for prompt injection detection + output validation
4. **BUS-002**: Real Stripe Price IDs for production billing