# Forge — AI-powered full-stack app builder

A clone of Emergent.sh built from scratch. Describe your app in natural language and a coordinated team of 5 AI agents builds the full stack — frontend, backend, database, and integrations.

## Architecture

```
User prompt
    │
    ▼
┌─────────────────────────────────────────────┐
│              Orchestrator                   │
│                                             │
│  1. Architect  → blueprint (JSON)           │
│  2. Designer   → design system (JSON)       │
│  3. Developer  → all code files (streaming) │
│  4. Integration→ API connectors             │
│  5. PM Agent   → QA validation              │
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
- Backend: FastAPI + Python + Motor + Redis
- Frontend: React + Vite + Zustand + Monaco Editor
- DB: MongoDB (project/build storage)
- Realtime: WebSockets (build event streaming)

## Project structure

```
forge/
├── backend/
│   ├── agents/
│   │   ├── base.py          # BaseAgent with Anthropic streaming
│   │   ├── architect.py     # Prompt → blueprint JSON
│   │   ├── designer.py      # Blueprint → design system
│   │   ├── developer.py     # Blueprint + design → all code files
│   │   ├── integration.py   # API connectors (Stripe, Slack, etc)
│   │   └── pm.py            # QA validation
│   ├── api/
│   │   ├── builds.py        # POST /builds, GET, WebSocket
│   │   └── projects.py      # CRUD for projects
│   ├── core/
│   │   ├── config.py        # Settings from env
│   │   ├── database.py      # MongoDB + Redis connections
│   │   ├── models.py        # Pydantic models
│   │   └── orchestrator.py  # 5-agent pipeline coordination
│   ├── sandbox/
│   │   └── runner.py        # Syntax check generated code
│   ├── services/
│   │   └── ws_manager.py    # WebSocket connection manager
│   └── main.py              # FastAPI app
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
│       ├── hooks/
│       │   └── useBuildSocket.ts      # WebSocket → Zustand events
│       ├── lib/
│       │   └── api.ts                 # Axios API client
│       └── store/
│           └── buildStore.ts          # Zustand build state
└── docker-compose.yml
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
cd forge
cp .env.example .env
# Edit .env and add ANTHROPIC_API_KEY
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

## Credit system

Each agent action costs credits:
| Agent | Credits |
|---|---|
| Architect | 3 |
| Designer | 2 |
| Developer | 5 |
| Integration | 2 |
| PM | 1 |
| Debug iteration | 2 |

**Total per build: ~13–15 credits** (more with integrations/debug)

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

## Roadmap

- [ ] GitHub OAuth + repo sync
- [ ] One-click deploy to cloud (GCP Cloud Run)
- [ ] Custom domain mapping
- [ ] Voice mode (Web Speech API)
- [ ] Context window forking (fork build when approaching token limit)
- [ ] Version history UI
- [ ] Bring-your-own API key (BYOK)
- [ ] Team workspaces + RBAC
- [ ] MCP server support for custom integrations
