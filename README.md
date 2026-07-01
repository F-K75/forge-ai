# Forge — AI-powered full-stack app builder

A clone of Emergent.sh built from scratch. Describe your app in natural language and a coordinated team of AI agents builds the full stack — frontend, backend, database, and integrations.

## Architecture

```
User prompt
    │
    ▼
┌─────────────────────────────────────────────┐
│              Orchestrator                   │
│                                             │
│  1. Architect      → blueprint (JSON)       │
│  2. Designer       → design system (JSON)   │
│  3. Developer      → all code files         │
│  4. Integration    → API connectors         │
│  5. PM Agent       → QA validation          │
│  6. Business Model → pricing / monetization │
│         │                                   │
│         └─► Debug loop (max 3×)             │
└─────────────────────────────────────────────┘
    │
    ▼
GitHub sync + containerized deploy
```

**Generated tech stack (for user apps):**
- Frontend: React 18 + Vite + TypeScript + Tailwind
- Backend: FastAPI + Motor (async MongoDB)
- Database: MongoDB
- Auth: JWT-based
- Deploy: Docker containers

**Platform tech stack:**
- Backend: FastAPI + Python + Motor + Redis + Celery
- Frontend: React + Vite + Zustand + Monaco Editor + React Router
- DB: MongoDB (project/build/billing storage)
- Realtime: WebSockets (build event streaming)

## Project structure

```
.
├── backend/
│   ├── agents/
│   │   ├── base.py              # BaseAgent with LLM streaming
│   │   ├── architect.py         # Prompt → blueprint JSON
│   │   ├── designer.py          # Blueprint → design system
│   │   ├── developer.py         # Blueprint + design → all code files
│   │   ├── integration.py       # API connectors (Stripe, Slack, etc)
│   │   ├── pm.py                # QA validation
│   │   └── business_model.py    # Pricing / monetization logic
│   ├── api/
│   │   ├── builds.py            # POST /builds, GET, WebSocket
│   │   ├── projects.py          # CRUD for projects
│   │   ├── auth.py              # JWT + OAuth routes
│   │   ├── billing.py           # Stripe subscriptions + invoices
│   │   ├── admin.py             # Admin console routes
│   │   ├── analytics.py         # Usage + revenue analytics
│   │   ├── marketplace.py       # Playbook / template marketplace
│   │   ├── growth.py            # Referrals + onboarding
│   │   ├── api_keys.py          # API key management
│   │   ├── webhooks.py          # Stripe / external webhooks
│   │   ├── gdpr.py              # Data export / deletion
│   │   └── deployments.py       # GitHub + cloud deploy
│   ├── core/
│   │   ├── config.py            # Settings from env
│   │   ├── database.py          # MongoDB + Redis connections
│   │   ├── models.py            # Pydantic models
│   │   ├── security.py          # Rate limiting, CORS, CSRF
│   │   ├── encryption.py        # Field-level encryption
│   │   └── orchestrator.py      # Build pipeline coordination
│   ├── sandbox/
│   │   └── runner.py            # Syntax / import check generated code
│   ├── services/
│   │   ├── ws_manager.py        # WebSocket connection manager
│   │   └── webhook.py           # Incoming webhook handlers
│   ├── auth.py                  # JWT auth utilities
│   ├── celery_app.py            # Celery worker (build + deploy tasks)
│   └── main.py                  # FastAPI app
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── chat/
│       │   │   ├── ChatPanel.tsx      # Prompt input + message thread
│       │   │   └── AgentPipeline.tsx  # Real-time agent status
│       │   ├── editor/
│       │   │   └── FileEditor.tsx     # Monaco + file tree
│       │   ├── preview/
│       │   │   └── PreviewPanel.tsx   # iframe live preview + QA score
│       │   └── layout/
│       │       └── WorkspaceLayout.tsx # 3-panel layout
│       ├── pages/
│       │   ├── LandingPage.tsx
│       │   ├── AuthPage.tsx / Login.tsx / Signup.tsx
│       │   ├── WorkspacePage.tsx
│       │   ├── ProjectHistory.tsx
│       │   ├── MarketplacePage.tsx
│       │   ├── BillingPage.tsx / SettingsPage.tsx
│       │   └── AdminConsole.tsx
│       ├── hooks/
│       │   └── useBuildSocket.ts      # WebSocket → Zustand events
│       ├── lib/
│       │   ├── api.ts                 # Axios API client
│       │   ├── wsContract.ts          # WebSocket event types
│       │   ├── agents.ts              # Agent metadata/icons
│       │   └── constants.ts
│       └── store/
│           ├── buildStore.ts         # Zustand build state
│           ├── authStore.ts          # Auth state
│           └── useBuildSelectors.ts  # Build selectors
├── orchestrator/
│   ├── main.py                # FastAPI ASGI app (review board)
│   ├── api.py                 # Review + backlog routes
│   ├── service.py             # Pipeline coordinator
│   ├── runner.py              # Parallel fan-out runner
│   ├── consolidator.py        # CTO model aggregation
│   ├── loader.py              # Load + validate agent JSONs
│   ├── context.py             # File-tree + trigger scoping
│   ├── providers.py           # LLM provider abstraction
│   ├── models.py              # Pydantic v2 models
│   ├── store.py               # Motor persistence
│   ├── events.py              # In-memory pub/sub + WebSocket
│   ├── config.py              # Env-driven settings
│   └── tests/
│       └── test_orchestrator.py
├── orchestration/
│   ├── tool_gateway.py        # MCP / tool routing
│   ├── engine/
│   │   ├── workflow_engine.py
│   │   ├── scheduler.py
│   │   ├── state_machine.py
│   │   ├── retry_engine.py
│   │   ├── dependency_resolver.py
│   │   └── event_bus.py
│   ├── PROJECT_MANIFEST.json
│   ├── CURRENT_TASK.json
│   └── TASK_REGISTRY.json.lock
├── docker-compose.yml
├── .env.example
├── SECURITY_SCANNING.md
├── TODO.md
└── README.md
```

## Quick start

### 1. Prerequisites
- Docker + Docker Compose
- Node 20+
- Python 3.12+
- An Anthropic API key

### 2. Setup
```bash
git clone <your-repo>
cd forge-ai
cp .env.example .env
# Edit .env and add ANTHROPIC_API_KEY, JWT_SECRET, MONGO_PASSWORD, REDIS_PASSWORD
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
| `ANTHROPIC_API_KEY` | LLM provider |
| `OPENAI_API_KEY` | Optional fallback provider |
| `MONGODB_URL` | Mongo connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Auth signing secret |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Billing webhooks |
| `STRIPE_PUBLISHABLE_KEY` | Frontend billing |
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
