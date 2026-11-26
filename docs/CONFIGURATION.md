# Forge — Configuration Reference

All backend settings load from environment variables (or `.env`) via
`backend/core/config.py` (`pydantic-settings`). Copy `.env.example` (dev) or
`.env.production.example` (prod) as a starting point. Several settings are
**validated at process startup** so misconfiguration fails the deploy, not a
customer request.

## Required

| Variable | Notes |
|---|---|
| `MONGODB_URL` | Required outside CI. Outside `APP_ENV=development` it must **not** point at localhost and **must** include `replicaSet=rs0` (production Mongo is a 3-node replica set — omitting it silently disables failover). |
| `JWT_SECRET` | ≥ 32 chars; placeholder values (`dev-fallback`, `your_…`, etc.) are rejected. |
| `FIELD_ENCRYPTION_KEY` | Independent 32-byte key for field-level encryption of stored tokens. Back up before rotating; runbook: `docs/FIELD_ENCRYPTION_KEY_ROTATION.md`. |
| `ANTHROPIC_API_KEY` | Default LLM provider. |

## LLM providers

`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
`TOGETHER_API_KEY`, `MISTRAL_API_KEY`, `OLLAMA_BASE_URL`
(default `http://localhost:11434`), `DEFAULT_MODEL` (default
`claude-sonnet-4-6`), `ANTHROPIC_TIMEOUT` (default 120s). Per-agent model
overrides are managed at runtime via `/api/llm/agent/{agent}` and stored in
MongoDB.

### Self-hosted models (vLLM, LiteLLM proxy)

Both expose the OpenAI chat-completions API and are served by
`backend/providers/openai_compatible.py` as providers `vllm` and `litellm`.
Each is **registered only when its base URL is set** (no base URL = provider
absent, never tried, never counted by the circuit breaker).

| Variable | Default | Notes |
|---|---|---|
| `VLLM_BASE_URL` | — | e.g. `http://gpu-host:8000` (`/v1` optional). |
| `VLLM_API_KEY` | — | Optional; matches `vllm serve --api-key`. |
| `VLLM_MODELS` | — | Comma-separated served model names; first is the default. Empty = discover from `GET /v1/models`. A request for a model the server doesn't serve (e.g. an Ollama tag from a local-first chain) is mapped to the default. |
| `VLLM_INPUT_COST_PER_1K` / `VLLM_OUTPUT_COST_PER_1K` | `0` | USD per 1K tokens, used for usage/budget accounting instead of `MODEL_COSTS`. Set to charge back GPU cost. |
| `VLLM_TIMEOUT_SECONDS` | `120` | |
| `LITELLM_BASE_URL` | — | e.g. `http://litellm:4000`. |
| `LITELLM_API_KEY` | — | The proxy's master/virtual key (optional if the proxy has no auth). |
| `LITELLM_MODELS` | — | Comma-separated model aliases from the proxy config; first is the default. |
| `LITELLM_INPUT_COST_PER_1K` / `LITELLM_OUTPUT_COST_PER_1K` | `0` | Fallback rates; LiteLLM's `x-litellm-response-cost` header (real upstream cost) wins on non-streaming calls. |
| `LITELLM_TIMEOUT_SECONDS` | `120` | |

`prefer_local_llm` kernel runs (or `FORGE_LOCAL_LLM_ENABLED=1`) route the
balanced/fast tiers local-first: `vllm, ollama` when `VLLM_BASE_URL` is set,
otherwise `ollama, vllm`, followed by the cloud providers as failover. A
failing local server trips its per-provider circuit breaker and traffic falls
through to the cloud tier. To use either provider outside the kernel, add it
to `LLM_FALLBACK_CHAIN` / `fallback_chain` in `backend/config/llm.yaml`.

## Datastores & queue

| Variable | Default |
|---|---|
| `REDIS_URL` | `redis://localhost:6379` |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | falls back to Redis |
| `MONGO_PASSWORD` / `REDIS_PASSWORD` | used by docker-compose |

## Billing

`BILLING_PROVIDER` selects `stripe` (default) or `razorpay`. **In
`APP_ENV=production` startup fails unless the selected provider is fully
configured:**

- **Stripe**: `STRIPE_SECRET_KEY` (`sk_live_…`), `STRIPE_PUBLISHABLE_KEY`
  (`pk_live_…`), `STRIPE_WEBHOOK_SECRET` (`whsec_…`), plus six **unique**,
  real Price IDs: `STRIPE_PRICE_{STANDARD,PRO,ENTERPRISE}_{MONTHLY,ANNUAL}`.
- **Razorpay**: `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`; also
  `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_*_PLAN_ID` (six plan IDs) and
  `RAZORPAY_CREDIT_{100,500,1000,5000}_PRICE_ID` for credit packs.

## App & networking

| Variable | Default | Purpose |
|---|---|---|
| `APP_ENV` | `development` | Gates all production validators |
| `APP_URL` / `API_URL` | `http://localhost:3000` / `:8000` | Public endpoints |
| `ALLOWED_ORIGINS` | `http://localhost:3000`, `http://localhost:3001`, `http://localhost:5173`, `http://127.0.0.1:3000`, `http://127.0.0.1:3001`, `http://127.0.0.1:5173` | CORS (JSON array or comma-separated). The middleware also allows **all HTTPS origins** via `allow_origin_regex=r"https://.*"` so Vercel/Cloudflare Pages/other HTTPS frontends work without per-domain config. |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1,testserver,*.trycloudflare.com` | TrustedHost middleware |
| `FRONTEND_TUNNEL_URL` | *(empty)* | Additional CORS origin merged into the allowlist (e.g. a Cloudflare tunnel URL) |
| `TRUSTED_PROXIES` | `127.0.0.1,::1` | Real-IP resolution for rate limiting |
| `MAX_REQUEST_SIZE` | 10 MiB | Request-size limit middleware |
| `DEPLOYMENT_HOST` | `localhost` | Public host for deployed-app preview containers |
| `DEPLOYMENTS_ENABLED` | *(unset)* | Set `true` to enable the deployment API (`POST /deployments/`, redeploy, container cancel). Supports `docker` (default) and `kubernetes` targets via `target_type`/`target_config`. Read-only deployment endpoints remain available regardless. |

## Auth & integrations

| Variable | Purpose |
|---|---|
| `JWT_ALGORITHM` / `JWT_EXPIRE_MINUTES` | `HS256` / 10080 (7 days) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_WEBHOOK_SECRET` | GitHub OAuth + repo sync + PM task webhooks |
| `RESEND_API_KEY` / `FROM_EMAIL` | Transactional email |
| `ADMIN_EMAILS` | Comma-separated admin allowlist |

## Builds & credits

`SANDBOX_HOST`, `SANDBOX_TIMEOUT` (120s), `BUILD_TIMEOUT` (600s), `REQUEST_TIMEOUT` (120s), `GATE_TIMEOUT` (180s), `GATE_POLL_INTERVAL` (2.0s), and
per-agent credit costs: `CREDITS_ARCHITECT=3`, `CREDITS_DESIGNER=2`,
`CREDITS_DEVELOPER=5`, `CREDITS_INTEGRATION=2`, `CREDITS_PM=1`,
`CREDITS_BUSINESS_MODEL=2`, `CREDITS_DEBUG=2`.

## Observability

`SENTRY_DSN` (enables Sentry with 10% trace sampling). Prometheus needs no
config — `/metrics` is always exposed when `prometheus_client` is installed.

## Review Board orchestrator (`orchestrator/config.py`)

Separate settings namespace: `ANTHROPIC_API_KEY` (required), `MONGODB_URL`,
`MONGODB_DB` (default `forge_review`), `AGENTS_DIR` (default `agents`),
`MAX_CONCURRENCY` (5), `MAX_RETRIES` (3), `MAX_INPUT_TOKENS` (100000),
`CONSOLIDATOR_MODEL` (`claude-sonnet-4-6`).

## Test/CI escape hatches

`CI_TEST_MODE` + `TESTING` relax the validators (fallback local Mongo, dummy
JWT/encryption keys). Never set these in a real environment.
