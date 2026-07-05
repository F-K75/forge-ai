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
- [ ] DB-backed overrides — **blocked**: no `llm_config` collection/model exists yet. Runtime overrides via `PUT /api/llm/agent/{agent}` are in-memory only and reset on process restart. Documented here rather than adding a new DB schema without product sign-off on persistence semantics (per-process vs. shared).

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
- [ ] Encrypt BYOK keys at rest — **blocked**: current adapters are configured from server-side env vars (`Settings`), not per-user BYOK keys. `core/encryption.py` exists but there's no BYOK key storage model yet to encrypt; needs a product decision on where per-user/org provider keys are stored before wiring `decrypt_field`.
- [ ] Per-user/per-project rate limiting — **blocked**: budget/token limits exist via `check_budget`, but no separate request-rate limiter for the LLM endpoints; would need a rate-limit backend (Redis-based) decision consistent with the rest of the app's rate limiting.

### Step 10 — Testing
- [x] Unit tests for provider adapters (groq, gemini, ollama health check) via monkeypatched `httpx.AsyncClient` — no new test dependency added since `respx`/`pytest-httpx` aren't installed.
- [x] Integration tests for router: fallback chain, retry-then-fallback, usage/model normalization.
- [x] Fixed 3 pre-existing broken tests left over from the router migration (`test_ai_cost_tracking_wired.py` referenced a pre-router fake Anthropic client; `test_prompt_injection_detection.py` imported detectors from `agents.base` which no longer defines them).
- [ ] Load tests — not implemented (out of scope for unit/integration CI run).
- Full backend suite: 179 passed, 0 failed.

