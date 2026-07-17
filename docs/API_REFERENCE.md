# Forge — Backend API Reference

Base URL: `http://localhost:8000` in development. Interactive OpenAPI docs at
`/docs`.

**Versioning:** every route below is canonically served under the `/v1/`
prefix (e.g. `/v1/builds`). The legacy root-level paths (e.g. `/builds`) still
work during the deprecation window but respond with `Deprecation: true` and a
`Link: <…>; rel="successor-version"` header. New clients should use `/v1/`.
Health endpoints, `/metrics`, `/api/llm/*`, `/razorpay/*`, `/billing/webhook`,
and `/auth/csrf-token` are exempt from the version prefix.

**Auth:** JWT bearer tokens (`Authorization: Bearer …`). State-changing
requests require an `X-CSRF-Token` header (obtain from `GET /auth/csrf-token`).
WebSockets authenticate with a short-lived token from `POST /auth/ws-token`.

## Auth — `/auth`

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Create account, returns tokens |
| POST | `/auth/login` | Login (returns tokens, or MFA challenge) |
| POST | `/auth/mfa/verify` | Complete MFA login |
| POST | `/auth/refresh` | Rotate access token |
| POST | `/auth/logout` | Revoke session |
| POST | `/auth/mfa/setup` / `/auth/mfa/verify-setup` / `/auth/mfa/disable` | TOTP MFA lifecycle |
| GET/DELETE | `/auth/sessions`, `/auth/sessions/{id}` | List / revoke sessions |
| GET | `/auth/csrf-token` | Issue CSRF token |
| POST | `/auth/ws-token` | Short-lived WebSocket auth token |
| GET/PUT | `/auth/me` | Profile read/update |
| POST | `/auth/me/password` | Change password |
| POST | `/auth/forgot-password` / `/auth/reset-password` | Password reset flow |
| GET | `/auth/verify-email` · POST `/auth/resend-verification` | Email verification |
| POST/GET | `/auth/organizations` … | Organizations: create, list, invite, accept invitation, members, roles |
| GET | `/auth/google` | Initiate Google OAuth flow (500 if unconfigured) |
| GET | `/auth/google/callback` | Google OAuth callback, issues tokens and redirects to frontend |

## Builds — `/builds`

| Method | Path | Purpose |
|---|---|---|
| POST | `/builds/` | Start a build (reserves credits, enqueues Celery task) |
| GET | `/builds/{build_id}` | Build status + metadata |
| GET | `/builds/{build_id}/files` | Generated files |
| POST | `/builds/{build_id}/rollback/{version}` | Roll back to a prior version |
| WS | `/builds/ws/{build_id}` | Live build events (see below) |

WebSocket events: `agent_start`, `agent_complete`, `stream_token`,
`file_update`, `debug_start`, `build_complete`, `build_failed` (typed in
`frontend/src/lib/wsContract.ts`).

## Projects — `/projects`

CRUD (`POST /`, `GET /`, `GET/PUT/DELETE /{project_id}`) plus
`GET /{project_id}/builds` (paginated build history).

## Agile PM layer

| Router | Endpoints |
|---|---|
| `/initiatives` | Create (kicks off the BA → PRD → epics → stories → tasks → sprint-plan pipeline), list, get, update, `POST /{id}/regenerate`, `GET/PUT /{id}/prd`, `GET /{id}/graph`, WS `/initiatives/ws/{id}` |
| `/epics` | CRUD |
| `/stories` | CRUD |
| `/tasks` | CRUD, `PATCH /{id}/status`, `POST /{id}/execute` (agent execution), `POST /{id}/github-link`, `POST /github/webhook` |
| `/sprints` | List/get/update, `POST /{id}/standup` · `/review` · `/retro` · `/risk-report` · `/tech-debt`, `GET /{id}/standups`, `GET /{id}/reports` |
| `/releases` | `POST /generate`, list, get, update |
| `/agent-executions` | List and inspect agent execution records |

## Billing — `/billing` (Stripe) and `/razorpay`

| Method | Path | Purpose |
|---|---|---|
| POST | `/billing/checkout` | Create checkout session |
| POST | `/billing/portal` | Stripe customer portal |
| GET | `/billing/subscription` / `/billing/invoices` / `/billing/plans` / `/billing/usage` | Read billing state |
| POST | `/billing/credits/purchase` | Buy credit packs |
| POST | `/billing/cancel` / `/reactivate` / `/downgrade` | Subscription lifecycle |
| POST | `/billing/webhook` | Stripe webhook (signature-verified) |
| GET | `/billing/razorpay/plans` | Razorpay plan catalog |
| POST | `/razorpay/order` / `/subscription` / `/verify` / `/webhook` | Razorpay flow |

## Platform & growth

| Router | Endpoints |
|---|---|
| `/marketplace` | Publish, browse (paginated), get, download, rate items |
| `/growth` | Referrals, in-app notifications (+ mark read), onboarding tracking |
| `/analytics` | Event ingestion + funnel, retention, build success-rate, conversion, churn, AI cost, revenue, onboarding, `GET /analytics/me` |
| `/api-keys` | Create, list, delete API keys |
| `/webhooks` | Register, list, delete outbound webhooks (SSRF-protected) |
| `/deployments` | Create deployment, list/get, redeploy, delete, env vars, logs, custom domain, public URL, `POST /github/push` |
| `/gdpr` | `GET /export` (full data export), `DELETE /delete` (cascade deletion) |
| `/support` | Create/list/get support tickets |

## Admin — `/admin` (allowlisted via `ADMIN_EMAILS`)

Users (list/export/get/update, grant admin), builds (list, get, dead-letter
list + retry), analytics (overview, revenue, AI usage), fraud events, feature
flags, audit logs, system health, billing adjustments, support tickets,
spending.

## LLM management — `/api/llm`

`GET /providers`, `GET /models`, `GET /usage`, `GET /health`, `POST /test`,
`PUT /agent/{agent}` (per-agent model override, persisted in DB),
`POST /reload` (refresh override cache).

## Prompt Builder — `/prompts`

`POST /prompts/build|preview|validate|estimate-tokens`, `GET /prompts/templates`,
`GET/POST/PUT/DELETE /prompts/templates/{role}/{version}` (write ops admin-gated).
Assembles every agent's system prompt dynamically from versioned role templates.

## Prompt / Context / Harness / Loop engineering — `/engineering`

Unified surface for the AI Gateway runtime (`api/engineering.py`):

| Group | Endpoints |
|---|---|
| Versions | `GET /engineering/versions/{role}/{version}`, `POST /engineering/versions/rollback`, `POST /engineering/versions/diff` |
| Prompt Engineer | `POST /engineering/optimize`, `GET/POST /engineering/few-shot[/{role}]`, `POST /engineering/few-shot/select`, `POST /engineering/compose` |
| Context Engineer | `POST /engineering/context/assemble`, `GET /engineering/context/sources` |
| Harness | `POST /engineering/evaluate`, `POST /engineering/ab-test`, `POST /engineering/regression`, `POST /engineering/metrics`, `POST /engineering/benchmark` |
| Loop Engineer | `POST /engineering/loop/improve`, `GET /engineering/loop/config` |
| Metrics | `GET /engineering/metrics/prompt-quality`, `GET /engineering/metrics/loop-summary`, `GET /engineering/metrics/agent-stats` |

## Optimizer & Retrieval — `/optimizer`, `/retrieval`

`/optimizer/*` (prompt/response caching, cost & token estimation, context
optimization) and `/retrieval/*` (embeddings + vector index for semantic
context search) back the AI Gateway runtime above.

## Operational endpoints (unversioned)

| Path | Purpose |
|---|---|
| `GET /health` | Liveness (503 while draining) |
| `GET /health/detailed` | DB + Redis + Celery checks; 503 when degraded (used by readiness probes) |
| `GET /health/mongo-ping` | Mongo-only check |
| `GET /health/pools` | Live Mongo/Redis connection-pool utilization |
| `GET /metrics` | Prometheus exposition |
| `GET /integrations/playbooks` | Available integration playbooks |

## Review Board orchestrator (separate service, port 8100)

| Method | Path | Purpose |
|---|---|---|
| POST | `/reviews` | Start a review — `{"repo_path", "mode": "full"|"diff", "diff"?}` |
| GET | `/reviews/{run_id}` | Per-agent scores, consolidated findings, cost, `GO`/`NO_GO`/`GO_WITH_FIXES` |
| GET | `/reviews/{run_id}/backlog?sort_by=severity|impact` | Prioritized backlog |
| WS | `/reviews/{run_id}/stream` | `run_started`, `agent_started`, `agent_done`, `consolidating`, `complete` |

See `orchestrator/README.md` for agent JSON schema and sample curls.
