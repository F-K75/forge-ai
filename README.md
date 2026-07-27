# Forge — AI-powered full-stack app builder

Describe your app in natural language and a coordinated team of AI agents builds the full stack — frontend, backend, database, and integrations.

> **Documentation:** the essential docs (architecture, API reference, configuration, deployment & operations) live in [`docs/`](docs/README.md).

## Architecture

```
User prompt
    │
    ▼
┌─────────────────────────────────────────────┐
│            Backend API (FastAPI)             │
│  ┌───────────────────────────────────────┐  │
│  │  AI Gateway runtime                     │  │
│  │  Prompt Builder → prompt/context eng.   │  │
│  │  Optimizer → harness → loop engineer     │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Build pipeline:                            │
│  1. Architect      → blueprint (JSON)       │
│  2. Designer       → design system (JSON)   │
│  3. Developer      → all code files         │
│  4. Integration    → API connectors         │
│  5. PM Agent       → QA validation          │
│  6. Business Model → pricing / monetization │
│         │                                   │
│         └─► Debug loop (max 3×)             │
│                                             │
│  Agile PM pipeline:                        │
│  BA → PRD → Epics → Stories → Tasks →      │
│  Sprint Planner → Scrum Master             │
└─────────────────────────────────────────────┘
    │
    ▼
Celery worker → GitHub sync + containerized deploy
```

**Generated tech stack (for user apps):**
- Frontend: React 18 + Vite + TypeScript + Tailwind
- Backend: FastAPI + Motor (async MongoDB)
- Database: MongoDB
- Auth: JWT-based
- Deploy: Docker containers

**Platform tech stack:**
- Backend: FastAPI + Python + Motor + Redis + Celery
- AI Gateway: Prompt Builder, Prompt/Context Engineer, Optimizer, Harness, Loop Engineer, multi-provider LLM router (Anthropic, OpenAI, OpenRouter, Gemini, Groq, Together, Mistral, Azure, Ollama)
- Frontend: React + Vite + Zustand + Monaco Editor + React Router
- DB: MongoDB (project/build/billing storage)
- Realtime: WebSockets (build event streaming)

## Project structure

```
.
├── backend/
│   ├── agents/                 # Build + Agile PM agents (all use the Prompt Builder)
│   │   ├── base.py             # BaseAgent with LLM streaming + prompt_role
│   │   ├── architect.py        # Prompt → blueprint JSON
│   │   ├── designer.py         # Blueprint → design system
│   │   ├── developer.py        # Blueprint + design → all code files
│   │   ├── integration.py      # API connectors (Stripe, Slack, etc)
│   │   ├── pm.py               # QA validation (product_manager role)
│   │   ├── business_model.py   # Pricing / monetization logic
│   │   ├── business_analyst.py / prd_writer.py
│   │   ├── epic_generator.py / story_generator.py / task_generator.py
│   │   ├── sprint_planner.py / scrum_master.py / task_executor.py
│   │   └── decision_engine.py
│   ├── api/
│   │   ├── builds.py           # POST /builds, GET, WebSocket
│   │   ├── projects.py         # CRUD for projects
│   │   ├── auth.py             # JWT + GitHub + Google OAuth routes
│   │   ├── billing.py / razorpay.py  # Stripe + Razorpay subscriptions
│   │   ├── admin.py            # Admin console routes
│   │   ├── analytics.py        # Usage + revenue analytics
│   │   ├── marketplace.py      # Playbook / template marketplace
│   │   ├── growth.py           # Referrals + onboarding
│   │   ├── api_keys.py         # API key management
│   │   ├── webhooks.py         # Stripe / external webhooks
│   │   ├── gdpr.py             # Data export / deletion
│   │   ├── deployments.py      # GitHub + cloud deploy
│   │   ├── prompts.py          # Prompt Builder REST API
│   │   ├── engineering.py      # Prompt/Context/Harness/Loop engineering API
│   │   ├── optimizer.py / retrieval.py / llm.py
│   │   ├── initiatives.py / epics.py / stories.py / tasks.py / sprints.py / releases.py
│   │   └── agent_executions.py / org_llm_policy.py / budget.py / support.py
│   ├── core/
│   │   ├── config.py           # Settings from env
│   │   ├── database.py         # MongoDB + Redis connections
│   │   ├── models.py           # Pydantic models
│   │   ├── security.py         # Rate limiting, CORS, CSRF
│   │   ├── encryption.py       # Field-level encryption
│   │   ├── orchestrator.py     # Build pipeline coordination
│   │   ├── pm_orchestrator.py  # Agile PM pipeline coordination
│   │   ├── llm/                # LLM router + model registry
│   │   └── ...
│   ├── prompt_builder/         # Provider-agnostic dynamic prompt assembly
│   │   ├── builder.py / registry.py / context_selector.py / validator.py
│   │   ├── token_estimator.py / plugins.py / models.py
│   │   └── templates/          # One PromptTemplate per role, versioned
│   ├── optimizer/              # Prompt + response cache, context/cost optimization
│   ├── providers/              # LLM adapters: anthropic, openai, openrouter, gemini,
│   │                           #   groq, mistral, together, azure_openai, ollama
│   ├── gateway/                # AI Gateway service, audit, guardrails
│   ├── prompt_engineer/        # Composer, few-shot, optimizer, versioning
│   ├── context_engineer/       # Assembler, retriever, scorer, window_manager
│   ├── harness/                # Evaluator, ab_test, regression, benchmark, metrics
│   ├── loop_engineer/          # Controller that improves prompts over iterations
│   ├── retrieval/              # Embeddings + vector index service
│   ├── sandbox/                # Syntax / import check generated code
│   ├── services/               # ws_manager, webhook handlers
│   ├── auth.py                 # JWT auth utilities
│   ├── celery_app.py           # Celery worker (build + deploy + PM tasks)
│   ├── engineering_plugins.py / engineering_repository.py
│   └── main.py                 # FastAPI app
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── chat/           # Prompt input + agent pipeline status
│       │   ├── editor/         # Monaco + file tree
│       │   ├── preview/        # iframe live preview + QA score
│       │   ├── build/ / agentRun/ / ui/
│       │   └── layout/         # Workspace layout
│       ├── pages/              # Landing, Auth, Workspace, Projects, Marketplace,
│       │   │                   #   Billing, Settings, Admin, LLM Mgmt, pm/, reviews/,
│       │   │                   #   GoogleCallback
│       ├── hooks/              # useBuildSocket, etc.
│       ├── lib/                # api client, wsContract, agents, types, generated
│       └── store/              # buildStore, authStore, selectors
├── orchestrator/               # Standalone Review Board service (port 8100)
│   ├── main.py / api.py / service.py / runner.py / consolidator.py
│   ├── loader.py / context.py / providers.py / models.py / store.py / events.py
│   └── tests/
├── orchestration/              # Meta-orchestration workflow engine (internal tooling)
│   ├── engine/                 # workflow_engine, scheduler, state_machine, retry, ...
│   ├── agent_runtime.py / api.py / tool_gateway.py / knowledge_service.py
│   └── README.md + audit/report JSON artifacts
├── docker-compose.yml
├── .env.example
└── README.md
```

## Quick start

### 1. Prerequisites
- Docker + Docker Compose
- Node 20+
- Python 3.12+
- At least one LLM provider key (Anthropic by default; OpenAI, OpenRouter, Gemini, Groq, Together, Mistral, Azure, or Ollama also supported via `backend/providers/`)

### 2. Setup
```bash
git clone <your-repo>
cd forge-ai
cp .env.example .env
# Edit .env and add ANTHROPIC_API_KEY, JWT_SECRET, MONGO_PASSWORD, REDIS_PASSWORD
./scripts/install-git-hooks.sh  # installs the pre-commit secret-scanning hook
```

### 3. Run with Docker
```bash
docker compose up
```

Frontend: http://localhost:3000  
Backend API: http://localhost:8000  
API docs: http://localhost:8000/docs

### 4. Local dev (no Docker)

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Copy `.env.example` to `.env` in the **repo root** first. That one file serves
both local dev and `docker compose`, which interpolates `${VAR}` from it. A
`.env` inside `backend/` also works and takes precedence if you want a
machine-local override.

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Orchestrator (review board):**
```bash
cd orchestrator
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8100
```

## Environment variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Default LLM provider |
| `OPENAI_API_KEY` | Optional fallback provider |
| `OPENROUTER_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` / `TOGETHER_API_KEY` / `MISTRAL_API_KEY` / `AZURE_OPENAI_*` / `OLLAMA_BASE_URL` | Optional provider keys (see `backend/providers/`) |
| `MONGODB_URL` | Mongo connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Auth signing secret |
| `FIELD_ENCRYPTION_KEY` | Independent 32-byte key for encrypted tokens; back up and rotate per `docs/FIELD_ENCRYPTION_KEY_ROTATION.md` |
| `APP_ENV` | Runtime environment (`development` or `production`) |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Google OAuth (new) |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Required live billing credentials in production |
| `STRIPE_PUBLISHABLE_KEY` | Required live publishable key in production |
| `STRIPE_PRICE_*` | Six unique monthly/annual Stripe Price IDs required in production |
| `RAZORPAY_*` | Razorpay credentials for the India market (optional) |
| `RESEND_API_KEY` | Transactional email |
| `APP_URL` / `API_URL` | Public endpoints |
| `ADMIN_EMAILS` | Admin allowlist |
| `MONGO_PASSWORD` / `REDIS_PASSWORD` | Docker secrets |

## WebSocket events

The frontend subscribes to `ws://host/builds/ws/{build_id}` and receives:

| Event | Data |
|---|---|
| `agent_start` | `{agent: "architect"}` |
| `agent_complete` | `{agent, files_changed}` |
| `stream_token` | `{agent: "developer", token: "..."}` |
| `file_update` | `{files: {path: content}}` |
| `debug_start` | `{iteration, errors}` |
| `build_complete` | `{files, validation, credits_used}` |
| `build_failed` | `{error}` |

## Credit system

Each agent action costs credits:
| Agent | Credits |
|---|---|
| Architect | 3 |
| Designer | 2 |
| Developer | 5 |
| Integration | 2 |
| PM | 1 |
| Business Model | 2 |
| Debug iteration | 2 |

**Total per build: ~15–17 credits** (more with integrations/debug)

Plan tiers (configure in `core/config.py`):
- Free: 10 credits
- Standard: 100/month  
- Pro: 750/month + 1M context + BYOK

## Adding integrations (Playbooks)

Add a new playbook in `backend/agents/integration.py`:
```python
PLAYBOOKS["your_service"] = {
    "packages": ["service-sdk"],
    "env_vars": ["SERVICE_API_KEY"],
    "description": "What it does",
}
```

The Integration Agent picks it up automatically when users mention the service.

## Roadmap

- [x] GitHub OAuth + repo sync
- [x] One-click deploy to cloud (GCP Cloud Run)
- [ ] Custom domain mapping
- [ ] Voice mode (Web Speech API)
- [ ] Context window forking (fork build when approaching token limit)
- [ ] Version history UI
- [x] Bring-your-own API key (BYOK)
- [ ] Team workspaces + RBAC
- [ ] MCP server support for custom integrations
