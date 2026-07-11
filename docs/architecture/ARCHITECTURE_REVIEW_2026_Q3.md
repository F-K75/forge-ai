# Forge Platform — Architecture Review (2026 Q3)

**Scope:** Full platform, reviewed after the Prompt Builder and AI Optimizer merge.
**Method:** Direct code inspection, file:line cited throughout. Read-only review — no code modified.

---

## 1. Executive Summary

Forge is considerably more mature than a first read of the task brief would suggest. JWT auth with MFA and session revocation, CSRF protection, rate limiting, request-size limits, Prometheus metrics, Sentry, Redis, MongoDB, and Celery workers are already in place, along with a circuit breaker and retry/fallback chain in the LLM router. The newly added `prompt_builder/` and `optimizer/` modules are clean, dependency-light, and slot into `LLMRouter.generate()` as a mandatory pipeline stage.

Four of the six new `/prompts` endpoints carry no authentication at all — the one inconsistency in an otherwise disciplined access-control pattern.

The remaining weight of this review is smaller in number but real in consequence: analytics and one of two response caches are process-local, so their numbers and isolation guarantees quietly stop being true the moment the platform runs more than one worker; and agent JSON output is parsed without schema validation, pushing malformed-response failures deeper into the pipeline than they need to go. Test coverage for the new features is solid at the unit level (six files, ~40 tests) but doesn't yet exercise the HTTP surface with auth, nor the router → optimizer → provider path end to end.

---

## 2. Architecture, as Observed

```
                     React / TS frontend
              frontend/src/pages/*, lib/api.ts
                          │  HTTPS
                          ▼
  FastAPI (backend/main.py)
  request_id → deprecation → Prometheus → drain → rate_limit
  → csrf → request_size → TrustedHost → CORS
  Routers: /v1/* canonical + legacy · auth.py · admin.py
  prompts.py · optimizer.py (admin-only)
          │                              │
          ▼                              ▼
  Orchestrator                   prompt_builder/
  Architect → BizModel →         Context → Template →
  Designer → Developer →         Render → Validate
  Integration → PM → debug loop  (pure in-memory, <20ms)
          │  each agent extends BaseAgent
          ▼
  LLMRouter.generate()
   1. sanitize + prompt-injection regex + LLM classifier
   2. per-user rate limit + concurrency semaphore
   3. BYOK branch — user's own key, no cache, no fallback
   4. AIOptimizer.optimize_request()      ◄── prompt built
   5. response-cache check (Redis)
   6. provider + model fallback chain, retry with backoff
   7. usage tracking, cost calc, cache write
          │            │            │
          ▼            ▼            ▼
     Anthropic     OpenAI /      Groq / Together /
     adapter       OpenRouter /  Ollama / Mistral
                   Gemini        (priority-ordered)

  Data:  MongoDB — users, builds, sessions, migrations
         Redis   — cache, CSRF tokens, rate limits, prompt +
                   response cache
         Celery  — background workers, health-checked
  Observability:  /metrics (Prometheus), Sentry, correlation
                  IDs, /health, /health/detailed, /health/pools
```

---

## 3. Strengths

- Circuit breaker + retry/fallback already implemented, not stubbed — `agents/base.py:67-106`, `router.py:328-413`
- Two-layer prompt-injection defense: regex matcher plus an LLM classifier, both wired ahead of every provider call
- BYOK calls are deliberately isolated from shared cache, budget, and fallback, with an inline SSRF guard on user-supplied base URLs
- Per-user concurrency semaphores by plan tier, plus token-budget enforcement on every call
- Optimizer is composition-friendly by contract — extended, not subclassed, and the codebase follows its own docstring
- Cost estimates and real billing share one pricing table — estimate and invoice can't silently diverge
- Graceful shutdown/drain, migrations at startup, connection-pool visibility endpoint, correlation-ID logging

## 4. Weaknesses

- `/prompts` build/preview/validate/estimate-tokens carry no auth dependency, unlike every sibling route
- `OptimizerAnalytics` is in-process only — metrics endpoints report one worker's counters, not the fleet's
- Response cache keys on content alone — no tenant/user segmentation, unlike the BYOK path which explicitly avoids this
- Two independent LLM response caches (router-level and optimizer-level) with overlapping purpose and double writes
- Agent JSON output parsed with bare `json.loads(strict=False)`, no schema validation
- Template registry CRUD mutates a process-local overlay with no persistence

---

## 5. Technical Debt

- Duplicate LLM-response caching (router-level + optimizer-level) should consolidate into one cache, one TTL policy.
- `main.py` registers every router twice — legacy root paths and canonical `/v1/` — functional during the deprecation window but should carry a tracked removal date.
- `optimizer/config.py` is env-var driven; `prompt_builder` has no runtime config at all. Two features shipped together, two configuration philosophies.
- `context_selector.py`'s per-role allow-list only covers `security`/`devops`/`qa` — architect, developer, and PM (the roles actually exercised) get everything unfiltered, undermining the module's stated purpose.

---

## 6. Security Findings

**Confirmed — unauthenticated endpoints.** `/prompts/build`, `/prompts/preview`, `/prompts/validate`, `/prompts/estimate-tokens` (`backend/api/prompts.py:37-79`) carry no `Depends(get_current_user)` or `admin_required`. Every sibling route — `/prompts/templates*`, all of `/api/optimizer/*` — gates correctly. This reads as an oversight specific to the new feature, not an established pattern.

**Confirmed — prompt/template disclosure.** `/prompts/build` doesn't call an LLM — it renders a full agent system-prompt template and returns it directly to an anonymous caller. Not a completion-injection risk, but a prompt-template disclosure surface.

**Confirmed — response cache has no tenant boundary.** `response_cache.py:10-13` hashes only `(messages, model, provider)`. Two different orgs sending byte-identical prompts share a cached completion. The BYOK path explicitly reasons about and avoids this same risk (`router.py:217-226`) — the reasoning wasn't carried over.

Secrets are env-based via `get_settings()`; user BYOK keys are encrypted at rest and SSRF-validated on both write and read paths. No hardcoded keys found in the files reviewed. `org_id` is threaded through builds and usage tracking, but — as above — not enforced at the response-cache boundary.

---

## 7. Scalability Findings

Redis-backed caches and MongoDB usage tracking are properly shared across processes — that part of the design is correct. The gap is specifically the newer, in-memory state introduced alongside the optimizer:

- `OptimizerAnalytics` — module-global, per-process (`optimizer/analytics.py`)
- `LLMRouter._concurrent_requests` — per-user semaphores held in a process-local dict, unbounded, no eviction for inactive users (`router.py:132-157`)
- `_llm_circuit_breaker` — module-global (`agents/base.py:106`)
- `TemplateRegistry` overlay — process-local (`prompt_builder/registry.py`)

In a multi-worker or multi-pod deployment, a user's plan-tier concurrency limit and a tripped circuit breaker only apply to whichever worker happened to handle the request — both guarantees silently stop holding at exactly the scale this platform is meant to reach.

---

## 8. Performance Findings

- Pipeline overhead is measured, not assumed — `optimize_request()` records `optimization_time_ms`; `PromptBuilder.build()` targets <20ms by design.
- Fully async I/O path throughout — FastAPI, async Mongo/Redis clients, no blocking calls found; the one Celery inspect call is correctly offloaded via `asyncio.to_thread`.
- Token estimation is heuristic (`len(text)//4`) in both modules — cheap and fast, but can materially under/over-count non-English or code-heavy content, affecting both budget checks and cost estimates.
- `optimize_request()` runs unconditionally before the cache-hit check short-circuits — a cache hit still pays the full dedupe/truncate/optimize cost. Minor, but on the hot path for every call.

---

## 9. Missing Enterprise Features

| Capability | Status | Evidence |
|---|---|---|
| Budget enforcement | Present | `check_budget`, called from `router.py:293-304` |
| Retry / failover | Present | `router.py:323-413` |
| Rate limiting | Present | HTTP + LLM-call layer, `core/security.py`, `router.py:211-215` |
| Observability | Substantially present | Prometheus, Sentry, correlation IDs, health endpoints |
| Structured output validation | **Absent** | No schema check in `architect.py`, `developer.py`, `pm.py` |
| Secrets management (vault/KMS) | **Absent** | Env-var + app-level encryption only |
| AI gateway / policy engine | **Absent** | Guardrails hardcoded, not per-tenant configurable |
| Audit logging | Partial | Usage tracked; template mutations have no audit trail |
| Multi-tenancy | Partial | `org_id` exists but isn't enforced in the response cache |

---

## 10. Architectural Risks

- The unauthenticated `/prompts/*` endpoints are the most exploitable single gap — no auth, no per-caller quota beyond the global rate limiter, and they render Forge's own agent instruction sets back to the caller.
- Cross-tenant cache leakage is latent and hard to catch in testing — it looks correct under sequential single-user tests and only surfaces under real multi-tenant load with colliding prompts.
- Three separate reliability guarantees (circuit breaker, concurrency fairness, analytics accuracy) degrade silently under horizontal scaling — the kind of gap that passes every test and staging run, then fails only in production at real replica counts.
- Two response caches with independently evolving TTL/key logic is a correctness incident waiting for one of them to be "fixed" without the other.

---

## 11. Recommended Refactors

1. Add `Depends(get_current_user)` to all four unauthenticated `/prompts` endpoints; decide standard-user vs. admin-only per route to match existing convention.
2. Consolidate the router-level and optimizer-level response caches into a single cache owned by one module.
3. Move `OptimizerAnalytics`, the concurrency semaphore, and the circuit breaker into Redis, reusing the `cache_get_json`/`cache_set_json` helpers already in use elsewhere.
4. Segment `ResponseCache` keys by `org_id`/`user_id`, or explicitly document why a given call path is provably tenant-agnostic.
5. Validate agent JSON output against a Pydantic schema immediately after parse, with a distinct retriable-error type.
6. Persist `TemplateRegistry` overlay writes to MongoDB — the connection and migration framework already exist.

---

## 12. Roadmap & Action Items

### Now — this sprint
- **[P0]** Add auth to `/prompts/build`, `/preview`, `/validate`, `/estimate-tokens`.
- **[P0]** Decide and implement tenant-scoping for `ResponseCache` keys.

### Next — 1–2 sprints
- **[P1]** Move circuit breaker + concurrency semaphore to Redis-backed state.
- **[P1]** Make `OptimizerAnalytics` fleet-aggregated.

### Later — this quarter
- **[P2]** Schema-validate agent JSON output across architect, developer, and PM.
- **[P2]** Consolidate the two LLM response caches.
- **[P2]** Persist the prompt template registry to MongoDB.

---

## 13. Estimated Engineering Effort

| Tier | Scope | Estimate |
|---|---|---|
| P0 | Auth fix + cache tenant-scoping design, implementation, tests | 0.5–1 dev-week |
| P1 | Redis-backing three pieces of in-process state, each needing concurrency/TTL design and tests | 2–3 dev-weeks |
| P2 | Schema validation across 3 agents, cache consolidation, template persistence + migration | 3–4 dev-weeks |
| **Total** | Full punch list, excluding net-new features (policy engine, KMS) | **~6–8 dev-weeks** |

---

## 14. Target Architecture

```
  FastAPI — ALL /prompts/* and /api/optimizer/* routes now
  behind Depends(get_current_user) at minimum, admin-only
  where mutating shared state (templates)
          │                              │
          ▼                              ▼
  Orchestrator / Agents          prompt_builder
  (schema-validated JSON         (template registry now
   parsing added per agent)       Mongo-backed)
          │
          ▼
  LLMRouter.generate()
   - circuit breaker state      → Redis, shared across workers
   - concurrency semaphore      → Redis token bucket
   - AIOptimizer pipeline       → unchanged
   - ONE response cache         → key includes org/user scope
   - OptimizerAnalytics         → Redis counters, fleet-wide
          │
          ▼
  Provider adapters — unchanged
  Data: MongoDB (+ template registry), Redis (cache + circuit
  breaker + concurrency + analytics, now all shared), Celery
```

---

## 15. Single Highest-Priority Improvement

**Before any new feature work: authenticate the four open `/prompts` endpoints.**

`backend/api/prompts.py:37-79` — `/build`, `/preview`, `/validate`, `/estimate-tokens`. This is the one finding in the review that is trivially exploitable today with no special access, inconsistent with every other route in the codebase (including its own sibling, `/prompts/templates`), and fixable with a one-line `Depends(...)` per route. Every other finding here needs real design work; this one doesn't, and it carries outsized exposure relative to its cost — Forge's internal agent-prompt templates and rendering pipeline are reachable by anyone with the URL.
