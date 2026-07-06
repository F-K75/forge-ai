# TODO

## LLM Multi-Routing Engine (Feature: Multi-LLM Routing Engine for Forge AI)

### Step 0 — Repo understanding (done/ongoing)
- [x] Read `backend/core/models.py` to confirm LLM calls are currently embedded in `BaseAgent` (direct Anthropic/OpenAI-compatible calls).
- [x] Read `backend/core/ai_usage.py` to reuse cost/budget/ledger logic.
- [x] Identify refactor points in agent runtime.

### Step 1 — Plan confirmation (done)
- [x] Confirm we will implement `backend/core/llm/router.py` + provider adapters, then refactor agent runtime to call the Router only.
- [x] Use existing `backend/core/ai_usage.py` as initial ledger (instead of creating `llm_usage` immediately).

### Step 2 — Implement core routing layer

- [x] Create folder structure under `backend/core/llm/`.
- [x] Implement provider interface + adapter contracts.
- [x] Implement registry (`register_provider`, `register_model`, lookup/list APIs).
- [x] Implement router (`generate`, `stream`) with:
  - provider selection
  - credential loading (wired from `Settings` — was previously constructing adapters with no api_key, so every real provider silently returned empty text)
  - config validation
  - retry/fallback (per-provider retry with backoff added; previously only a single attempt before falling back)
  - streaming
  - token usage + cost
  - logging/metrics hooks
  - caching hooks

### Step 3 — Provider adapters
- [x] Add adapter modules under `backend/providers/`:
  - openrouter, openai, anthropic, gemini, groq, together, ollama, mistral
- [x] Implement each adapter using the provider SDK/REST API (mockable for tests). gemini/groq/together/mistral/ollama were stub adapters that only returned canned "stub" text — replaced with real HTTP calls (httpx) against each provider's chat completion API.
- [x] Ensure no provider-specific code exists outside adapter classes (confirmed no agent references anthropic/openai SDKs directly).

### Step 4 — Refactor agent runtime
- [x] Modify `BaseAgent` to remove direct Anthropic/OpenAI client usage.
- [x] Replace with `Router.generate/stream(agent_name, messages, ...)`.
- [x] Preserve prompt sanitization, prompt-injection detection, and budget checks — moved the normalized (whitespace/hyphen-collapsing) injection detector into `core/llm/router.py` (`_detect_prompt_injection`/`_any_message_has_prompt_injection`), matching the hardened version previously only in `agents/base.py`.

### Step 5 — Config + reload
- [x] Implement `backend/core/llm/config.py` (YAML + env var overrides).
- [x] Implement in-memory per-agent overrides (`LLMConfigLoader.set_agent_override`) + `/api/llm/reload` to reload YAML/env without restart.
- [x] DB-backed overrides — **DONE**: `set_agent_override` upserts into the `llm_agent_overrides` collection; `refresh_db_overrides()` reads them into the in-memory cache; `main.py` lifespan pre-warms via `refresh_db_overrides()` at startup so overrides survive a deploy/restart (no longer in-memory-only). `POST /api/llm/reload` re-reads them for other replicas. Cross-replica propagation is eventually consistent (same tradeoff as the feature-flags cache), not instant. Covered by `tests/test_llm_config_db_overrides.py` including `test_override_survives_process_restart`.

### Step 6 — DB wiring (incremental)
- [x] Keep existing `ai_usage` ledger for v1 — `/api/llm/usage` now reads real aggregated spend from it instead of returning `[]`.
- [ ] `llm_metrics`/`provider_health` history tables — not added; `/api/llm/health` now does live `health_check()` calls per request instead of persisting history.

### Step 7 — Router API endpoints
- [x] Implement:
  - `GET /api/llm/models`
  - `GET /api/llm/providers`
  - `GET /api/llm/usage` (now backed by real ai_usage aggregation)
  - `GET /api/llm/health` (now calls each provider's real `health_check()` instead of hardcoding `healthy: True`)
  - `POST /api/llm/test`
  - `PUT /api/llm/agent/{agent}` (now actually persists the override in the router's config loader instead of no-op echoing the payload)
  - `POST /api/llm/reload`

### Step 8 — Admin dashboard page
- [x] LLM Management UI: provider health, models, cost/usage table, per-agent model assignment editor, and a "test connection" action per provider.
- [x] Model assignment changes apply immediately (in-memory config, no restart).

### Step 9 — Security hardening
- [x] Router never logs secrets (only provider name/model/error message logged on failure).
- [x] Encrypt BYOK keys at rest — already true (`User.llm_api_key` is Fernet-encrypted via `encrypt_field`/`decrypt_field`, same as `github_token`; see `PUT /auth/me`). What was actually missing: the router refactor (commit `ec667843`) deleted the pre-router `_resolve_client`/`ResolvedLLM` BYOK logic from `agents/base.py` without replacing it, so every call silently ran on Forge's own server-side provider key while `core/orchestrator.py` kept skipping credit deduction for BYOK users — Forge was eating the API cost of "free" BYOK builds. Fixed by reintroducing BYOK resolution (`agents/base.py::_resolve_byok`) and adding a `byok` param to `LLMRouter.generate`/`stream` (`core/llm/router.py::_generate_byok`/`_build_byok_provider`) that calls the user's own key directly with no fallback chain and no shared-cache write/read (the cache key isn't identity-scoped, so mixing BYOK responses into it could leak one user's output to another). Also fixed `OpenAIAdapter` to actually honor `self.base_url` (previously ignored, silently breaking `openai_compatible` BYOK). Covered by `tests/test_llm_byok.py`.
- [x] **Critical bug found and fixed, not on the original list**: every `/api/llm/*` endpoint (`GET providers/models/usage/health`, `POST test`, `PUT agent/{agent}`, `POST reload`) had zero auth — anyone unauthenticated could trigger real provider-billed completions via `POST /api/llm/test`, rewrite per-agent model assignments platform-wide via `PUT /api/llm/agent/{agent}`, or read aggregate spend via `GET /api/llm/usage`. The frontend `/llm-management` route was also reachable by any logged-in user (not wrapped in `AdminRoute`, unlike `/admin-console`). Fixed by adding `admin_required` (matching `api/admin.py`'s pattern) to every endpoint in `backend/api/llm.py`, wrapping the frontend route in `AdminRoute`, and switching `LLMManagementPage.tsx` off raw unauthenticated `fetch()` onto the shared `api` client (`lib/api.ts`'s new `llmApi`) so cookies/CSRF actually work now that auth is required. Covered by `tests/test_llm_api.py::test_llm_endpoints_reject_unauthenticated_requests`.
- [ ] Per-user/per-project rate limiting — **blocked**: budget/token limits exist via `check_budget`, but no separate request-rate limiter for the LLM endpoints; would need a rate-limit backend (Redis-based) decision consistent with the rest of the app's rate limiting. Lower priority now that the endpoints require admin auth (the unauthenticated-abuse vector above is closed).

### Step 10 — Testing
- [x] Unit tests for provider adapters (groq, gemini, ollama health check) via monkeypatched `httpx.AsyncClient` — no new test dependency added since `respx`/`pytest-httpx` aren't installed.
- [x] Integration tests for router: fallback chain, retry-then-fallback, usage/model normalization.
- [x] Fixed 3 pre-existing broken tests left over from the router migration (`test_ai_cost_tracking_wired.py` referenced a pre-router fake Anthropic client; `test_prompt_injection_detection.py` imported detectors from `agents.base` which no longer defines them).
- [ ] Load tests — not implemented (out of scope for unit/integration CI run).
- [x] BYOK regression coverage (`tests/test_llm_byok.py`): router bypasses fallback/cache for `byok`, skips budget check, `_resolve_byok` gating by plan/provider.
- [x] BYOK end-to-end verification beyond unit tests: since this sandbox has no real Anthropic/OpenAI/Groq credentials, drove the real `anthropic`/`openai` SDK clients (not monkeypatched) against a local stub HTTP server to prove actual wire-level request/response handling, plus a real `encrypt_field`/`decrypt_field` Fernet round trip -- confirmed via an independent adversarial re-run of the same script. That pass correctly flagged a real coverage gap: it only exercised `_resolve_byok` and `LLMRouter.generate` separately, never the `BaseAgent._call_llm`/`stream` glue that production agents actually call. Closed by adding `tests/test_llm_byok.py::test_call_llm_end_to_end_uses_byok_and_skips_budget_check`, `::test_stream_end_to_end_uses_byok`, and a `::test_call_llm_without_byok_still_checks_budget` control case, all driving the real `BaseAgent` subclass method, not a reimplementation of it. Residual gaps that only a real provider account could catch: real 401/429 handling, real model-name validation, and `stream_completion` SSE wire behavior (only `chat_completion` was exercised at the wire level).
- [x] Auth regression coverage (`tests/test_llm_api.py`): all `/api/llm/*` endpoints reject unauthenticated requests with 401.
- Full backend suite: 193 passed, 0 failed (was 179; +14 from the fixes above).

