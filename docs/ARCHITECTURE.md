# Forge — System Architecture

Forge is an AI-powered full-stack app builder: a user describes an app in
natural language and a coordinated team of LLM agents produces the blueprint,
design system, code, integrations, and QA validation, streamed live to the
browser.

This document describes the platform as it exists in the code (verified
2026-07-09).

## Services

| Service | Path | Port | Purpose |
|---------|------|------|---------|
| Backend API | `backend/` | 8000 | FastAPI app: auth, builds, billing, PM layer, admin, analytics |
| Celery worker | `backend/` (same image) | — | Async execution of build and PM-plan pipelines |
| Frontend | `frontend/` | 3000 | React 18 + Vite + TypeScript SPA |
| Review Board orchestrator | `orchestrator/` | 8100 | Standalone multi-agent code-review service (read-only) |
| Orchestration tooling | `orchestration/` | — | Meta-orchestration/workflow-engine artifacts (not a runtime service of the product) |
| MongoDB | — | 27017 | Primary datastore (Motor, async) |
| Redis | — | 6379 | Rate limiting, cache, Celery broker/result backend |

## Build pipeline (the core product flow)

1. `POST /builds` validates the request, reserves credits, and enqueues a
   Celery task (`backend/tasks/build_tasks.py::run_build`).
2. The worker runs the multi-agent pipeline coordinated by
   `backend/core/orchestrator.py`:
   - **Architect** → blueprint JSON
   - **Designer** → design system JSON
   - **Developer** → all code files (token-streamed)
   - **Integration** → API connectors from playbooks (`backend/agents/integration.py`)
   - **PM** → QA validation
   - **Business Model** → pricing/monetization
   - **Debug loop** → up to 3 iterations against sandbox errors
3. Generated code is checked in a sandbox (`backend/sandbox/runner.py` —
   syntax/import checks), content-moderated, and CSP-injected.
4. Progress and files stream to the browser over
   `ws://…/builds/ws/{build_id}` via `services/ws_manager.py`.
5. Failed builds land in a dead-letter queue that admins can retry
   (`/admin/builds/dead-letter`).

Generated apps use: React 18 + Vite + TypeScript + Tailwind, FastAPI + Motor,
MongoDB, JWT auth, Docker deploy.

## Agile PM layer

A second agent pipeline (`backend/core/pm_orchestrator.py`) turns an idea into
a full delivery plan: **Business Analyst → PRD Writer → Epic Generator →
Story Generator → Task Generator → Sprint Planner**. It is exposed through the
`/initiatives`, `/epics`, `/stories`, `/tasks`, `/sprints`, and `/releases`
routes, runs via Celery (`tasks/pm_tasks.py`), and streams progress on
`ws://…/initiatives/ws/{initiative_id}` via `services/pm_ws_manager.py`.
Sprints support standups, reviews, retros, risk reports, and tech-debt
reports. Tasks can be linked to GitHub and executed by a task-executor agent.

## LLM provider layer

`backend/providers/` implements adapters for Anthropic, OpenAI, OpenRouter,
Gemini, Groq, Together, Mistral, and Ollama. `core/llm/router.py` routes each
agent to a model using YAML/env config plus DB-backed per-agent overrides
(managed at runtime through `/api/llm/agent/{agent}` and `/api/llm/reload`).
BYOK (bring-your-own-key) is supported for Pro+ users. AI usage and cost are
tracked (`core/ai_usage.py`) with daily budget enforcement.

## Backend cross-cutting concerns (`backend/main.py`, `backend/core/`)

- **API versioning**: canonical routes live under `/v1/`; the legacy
  root-level routes still work but return `Deprecation` + `Link` headers
  pointing at their `/v1/` successors.
- **Security middleware** (`core/security.py`): per-IP/per-user rate limiting
  (Redis-backed, fail-closed in-memory fallback), request-size limits, CSRF
  protection (JTI-based, `X-CSRF-Token`), TrustedHost, CORS.
- **Auth** (`api/auth.py`, `auth.py`): JWT access+refresh with JTI blacklist,
  MFA (TOTP), session management, email verification, password reset, GitHub
  OAuth, and organizations with member roles/invitations.
- **Field-level encryption** (`core/encryption.py`): sensitive tokens are
  encrypted with an independent `FIELD_ENCRYPTION_KEY` (rotation runbook:
  `docs/FIELD_ENCRYPTION_KEY_ROTATION.md`).
- **Observability**: Prometheus metrics at `/metrics` (HTTP counters +
  latency histograms, plus build metrics in `core/metrics.py`), Sentry via
  `SENTRY_DSN`, request-correlation IDs on every log line, health endpoints
  (`/health`, `/health/detailed`, `/health/mongo-ping`, `/health/pools`).
- **Lifecycle**: startup fails fast if MongoDB is unreachable, pre-warms LLM
  overrides, runs versioned best-effort migrations (`core/migrations.py`);
  shutdown drains in-flight requests (`core/shutdown.py`).

## Billing

Dual-provider billing: **Stripe** (`api/billing.py`) and **Razorpay**
(`api/razorpay.py`, for the India market), selected by `BILLING_PROVIDER`.
Credit-based usage — each agent action costs credits (Architect 3, Designer 2,
Developer 5, Integration 2, PM 1, Business Model 2, Debug 2; ~15–17 per
build). Tiers: Free (10 credits), Standard (100/mo), Pro (750/mo + 1M context
+ BYOK). Webhooks are idempotent; production config is validated at startup
(see `docs/CONFIGURATION.md`).

## Review Board orchestrator (`orchestrator/`)

A separate, standalone FastAPI service that loads agent definitions from
`agents/*.json`, fans them out in parallel across a repo snapshot (full audit)
or a git diff (scoped review), consolidates findings with a "CTO" model into a
GO / NO_GO / GO_WITH_FIXES decision, and persists a prioritized backlog in
MongoDB. It is read-only: it never edits files, opens PRs, or deploys. See
`orchestrator/README.md` for the full API and agent JSON schema.

## Frontend (`frontend/src/`)

- **Pages**: Landing, Auth (login/signup/forgot/reset/verify), Onboarding,
  Workspace (3-panel: chat + Monaco editor + live preview), Projects,
  Project History, Marketplace, Billing, Settings, Admin Console,
  LLM Management, plus `pm/` (initiative/sprint views) and `reviews/`
  (Review Board UI).
- **State**: Zustand stores (`buildStore`, `authStore`); WebSocket events flow
  through `hooks/useBuildSocket.ts` using the typed contract in
  `lib/wsContract.ts`.
- **Testing**: Vitest (`npm test`), TypeScript + ESLint + Prettier.

## Data flow summary

```
Browser ──HTTP──▶ FastAPI (/v1/…) ──enqueue──▶ Celery worker
   ▲                   │                            │
   └──WebSocket────────┴── ws_manager ◀── events ───┘
                       │
                 MongoDB + Redis
```
