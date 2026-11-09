# AGENTS.md

Guidance for Codex and other AI coding agents working in this repository.

## gstack

This project uses [gstack](https://github.com/garrytan/gstack), a suite of Codex
skills for planning, review, shipping, QA, and browsing.

### Install

gstack is a per-developer install (it lives in `~/.Codex/skills`, not in this repo):

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.Codex/skills/gstack
cd ~/.Codex/skills/gstack && ./setup
```

Update later with `/gstack-upgrade`.

### Web browsing

Use the `/browse` skill from gstack for **all** web browsing.
**Never** use `mcp__claude-in-chrome__*` tools.

### Available skills

- `/office-hours`
- `/plan-ceo-review`
- `/plan-eng-review`
- `/plan-design-review`
- `/design-consultation`
- `/design-shotgun`
- `/design-html`
- `/review`
- `/ship`
- `/land-and-deploy`
- `/canary`
- `/benchmark`
- `/browse`
- `/connect-chrome`
- `/qa`
- `/qa-only`
- `/design-review`
- `/setup-browser-cookies`
- `/setup-deploy`
- `/setup-gbrain`
- `/retro`
- `/investigate`
- `/document-release`
- `/document-generate`
- `/codex`
- `/cso`
- `/autoplan`
- `/plan-devex-review`
- `/devex-review`
- `/careful`
- `/freeze`
- `/guard`
- `/unfreeze`
- `/gstack-upgrade`
- `/learn`

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Cursor Cloud specific instructions

Forge is a full-stack app (FastAPI backend + Vite/React frontend + MongoDB + Redis). Cloud VMs do not have Docker pre-installed; use the local (no-Docker) workflow below. See also `.claude/skills/run-forge-locally/SKILL.md` for the portable MongoDB/Redis approach.

### One-time system packages (not in the update script)

```bash
sudo apt-get install -y python3.12-venv redis-server build-essential
```

MongoDB is not available via apt on Ubuntu 24.04 — download the portable binary once into `/tmp/forge-scratch` (edition `targeted`, target `ubuntu2404`, arch `x86_64` from `https://downloads.mongodb.org/current.json`).

### Environment files

Copy templates and generate secrets (never commit `.env`):

```bash
cp .env.example .env
cp .env backend/.env
cp frontend/.env.example frontend/.env.local
# Set JWT_SECRET, FIELD_ENCRYPTION_KEY (openssl rand -hex 32), MONGODB_URL=mongodb://localhost:27017/forge_dev, REDIS_URL=redis://localhost:6379
# frontend/.env.local: VITE_API_URL=http://localhost:8000 and VITE_WS_URL=ws://localhost:8000
```

Do **not** set `CORS_ORIGINS` in `.env` — it is not a `Settings` field and will crash startup.

### Starting services (each in a tmux session)

1. **Redis:** `redis-server --daemonize yes --port 6379 --bind 127.0.0.1`
2. **MongoDB:** `/tmp/forge-scratch/mongo-install/bin/mongod --dbpath /tmp/forge-scratch/mongo-data --port 27017 --bind_ip 127.0.0.1 --logpath /tmp/forge-scratch/mongod.log`
3. **Backend:** `cd backend && set -a && source .env && set +a && ./venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000`
4. **Frontend:** `cd frontend && npm run dev -- --port 5173`

Health check: `curl http://localhost:8000/health` → `{"status":"ok"}`.

**Vite dev binds IPv6-only** (`localhost:5173`, not `127.0.0.1:5173`). Use `http://localhost:5173` in browsers and Playwright.

Celery worker (`celery -A celery_app worker --queues=build,deployment`) is required for AI builds but not for login/projects CRUD.

### Lint / test / build

| Target | Command |
|--------|---------|
| Backend lint | `cd backend && source venv/bin/activate && ruff check . --select F,E9 --exclude venv` |
| Backend tests | `cd backend && CI_TEST_MODE=true TESTING=true pytest tests/ -v --timeout=30` |
| Frontend lint | `cd frontend && npm run lint` |
| Frontend tests | `cd frontend && npm test` |
| Frontend build | `cd frontend && npm run build` (needs `pydantic` + `fastapi` on PATH for prebuild hook) |

Standard dev commands are also documented in `README.md` and `CONTRIBUTING.md`.

## Forge UI Design Reference & Master Prompt

The authoritative design specification and master prompt for all Forge AI UI surfaces is located in [`FORGE_UI_PROMPT.md`](FORGE_UI_PROMPT.md).

When implementing, modifying, or auditing any user interfaces:
- **Design Tokens**: Dark-first default, pure black base (`--bg: 0 0 0`), Apple off-white text (`#F5F5F7`), teal accent (`#14B8A6`), lime secondary (`#84CC16`).
- **Radii**: Apple x Material 3 hybrid (`rounded-full` for pill controls, buttons, chips, badges, and avatars; `rounded-xl` for cards; `rounded-2xl` for panels and dialogs; `rounded-lg` for inputs).
- **Surfaces & Workspace**: Full-viewport 3-column AI-native operating environment (Explorer + Sessions | Active Build Canvas + 5 Surfaces | Context & Agent Telemetry) with `⌘K` Cinematic Command Terminal.
- Always consult `FORGE_UI_PROMPT.md` for exact CSS classes, motion curves, and component specs.
