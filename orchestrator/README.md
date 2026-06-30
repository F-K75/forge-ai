# Review Board — Multi-Agent Code Review Orchestrator

A read-only runtime that loads agent definitions from `agents/*.json`, fans them
out across a codebase snapshot in parallel, consolidates their findings with a
high-tier "CTO" model, and persists a prioritized improvement **backlog**.

> **This system never edits files, opens PRs, or deploys.** It only reads a repo
> snapshot and emits findings. A human acts on the backlog.

```
agents/*.json ─▶ loader ─▶ trigger scoping ─▶ runner (parallel) ─▶ consolidator ─▶ MongoDB
                                │                    │                  │
                          context builder      retries + cost      GO / NO_GO /
                          (token guard)         tracking          GO_WITH_FIXES
```

## Module layout

| File | Responsibility |
|------|----------------|
| `config.py` | Env-driven settings (`pydantic-settings`). |
| `models.py` | Pydantic v2 models: `AgentConfig`, `AgentReport`, `ReviewRun`, `BacklogItem`, … |
| `loader.py` | Load + validate `agents/*.json`; fail loudly on schema violations. |
| `context.py` | File-tree + content bundling, glob **trigger scoping**, and token-budget guard. |
| `providers.py` | `llm_complete(model, system, messages) -> str` provider abstraction. |
| `runner.py` | Parallel fan-out (`asyncio.Semaphore`), retries, defensive JSON parsing, cost tracking. |
| `consolidator.py` | Single "CTO" call merging all agent reports into one decision. |
| `store.py` | Motor (async MongoDB) persistence for runs + backlog. |
| `events.py` | In-memory pub/sub backing the progress WebSocket. |
| `service.py` | Top-level coordinator wiring the pipeline together. |
| `api.py` / `main.py` | FastAPI routes + WebSocket; standalone ASGI app. |

## Install

```bash
python -m venv venv && source venv/bin/activate
pip install -r orchestrator/requirements.txt
```

## Environment variables

No secrets live in code — everything is read from the environment (a `.env`
file is also picked up). Only the Anthropic key is required for the default
config.

| Var | Default | Purpose |
|-----|---------|---------|
| `ANTHROPIC_API_KEY` | — | **Required.** Auth for `claude-*` models. |
| `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` | — | Only if you implement those provider branches. |
| `MONGODB_URL` | `mongodb://localhost:27017/forge` | Motor connection string. |
| `MONGODB_DB` | `forge_review` | Database name. |
| `AGENTS_DIR` | `agents` | Where agent JSONs live (relative to repo root). |
| `MAX_CONCURRENCY` | `5` | Parallel agent calls. |
| `MAX_RETRIES` | `3` | Per-call retries on transient/rate-limit errors. |
| `MAX_INPUT_TOKENS` | `100000` | Hard ceiling on context tokens per agent call. |
| `CONSOLIDATOR_MODEL` | `claude-sonnet-4-6` | The "CTO" model. |

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export MONGODB_URL="mongodb://localhost:27017/forge"
```

## Run the API

```bash
uvicorn orchestrator.main:app --reload --port 8100
```

## Adding agents (zero code changes)

Drop a JSON file into `agents/`. It is picked up on the next run automatically
(acceptance criterion #1). Schema (validated by `AgentConfig`):

```json
{
  "id": "security_engineer",
  "stage": 4,
  "model": "claude-haiku-4-5-20251001",
  "system_prompt": "You are a security engineer reviewing...",
  "triggers": ["*.py", "**/auth/**", "**/api/**"],
  "output_schema": {
    "score": "int (0-10)",
    "issues": [
      { "severity": "critical|high|medium|low", "title": "str", "description": "str", "fix": "str", "files": ["str"] }
    ]
  }
}
```

- **`triggers`** are gitignore-style globs (`**` spans directories; a bare
  `*.py` matches at any depth). An agent runs only when at least one trigger
  matches the candidate file set. An **empty `triggers` list means the agent
  always runs**.
- `output_schema` is shown to the model to steer its JSON; it is *not* enforced
  structurally — output is parsed defensively (markdown fences stripped, first
  balanced `{…}` extracted).

`agents/security_engineer.json` ships as a runnable example.

## Full audit vs. diff review

- **Full audit** (`mode: "full"`): agents are scoped against the *entire* repo
  snapshot. Any agent with a matching trigger runs.
- **Diff review** (`mode: "diff"`): supply a unified `git diff`. Only the
  changed files form the candidate set, so only agents whose triggers match the
  changed files run (acceptance criterion #2 — the cost-control mechanism).

Generate a diff to review:

```bash
git diff main...HEAD > /tmp/change.diff
```

## API + sample curls

### Start a full audit

```bash
curl -s -X POST http://localhost:8100/reviews \
  -H 'Content-Type: application/json' \
  -d '{"repo_path": "/path/to/repo/snapshot", "mode": "full"}'
# -> {"run_id":"<id>","status":"pending"}
```

### Start a diff review

```bash
DIFF=$(git -C /path/to/repo diff main...HEAD | python -c 'import json,sys;print(json.dumps(sys.stdin.read()))')
curl -s -X POST http://localhost:8100/reviews \
  -H 'Content-Type: application/json' \
  -d "{\"repo_path\": \"/path/to/repo\", \"mode\": \"diff\", \"diff\": $DIFF}"
```

### Poll status + results

```bash
curl -s http://localhost:8100/reviews/<run_id> | jq
# per-agent scores, consolidated top_10_critical / top_25_improvements,
# total_cost_usd, total_tokens, and recommendation: GO | NO_GO | GO_WITH_FIXES
```

### Get the backlog (sortable)

```bash
curl -s "http://localhost:8100/reviews/<run_id>/backlog?sort_by=severity" | jq
curl -s "http://localhost:8100/reviews/<run_id>/backlog?sort_by=impact"   | jq
```

### Stream progress over WebSocket

```bash
# emits: run_started, agent_started, agent_done (per agent),
#        consolidating, complete  (or error)
websocat ws://localhost:8100/reviews/<run_id>/stream
```

## Provider abstraction

`providers.llm_complete(model, system, messages) -> str` branches on the model
name prefix:

- `claude-*` / `anthropic*` → **fully implemented** (Anthropic Messages API).
- `gpt-*` / `o1*` / `o3*` → `NotImplementedError` (stub — add the branch + key).
- `deepseek-*` → `NotImplementedError` (stub).

Because the model name comes from each agent's config, swapping providers is a
config change, not an orchestrator change. `llm_complete_with_usage` is the
richer variant the runner uses to capture token usage and estimated cost.

## Graceful degradation

- A single agent that raises is recorded as `status: "failed"` with the error;
  the run still completes and consolidates the successful agents (acceptance
  criterion #3).
- If the consolidator call itself fails (or there are zero successful reports),
  a deterministic fallback consolidation is produced so a result is always
  persisted.

## Tests

```bash
pytest orchestrator/tests -q
```

The suite is fully offline — the LLM provider is monkeypatched and no MongoDB
is required. It covers loader validation, trigger scoping (full + diff), diff
parsing, the token-budget guard, defensive JSON parsing, cost estimation,
failure isolation, and the consolidator fallback.

## Assumptions made

- **`repo_path` is a local directory** (a "repo snapshot") already present on
  the machine running the orchestrator. The service does not clone or fetch.
- **Empty `triggers` ⇒ always run.** Treated as an explicitly unscoped agent.
- **Token estimation is heuristic** (~4 chars/token) — adequate for budgeting,
  not exact billing. Real usage/cost come from the provider's reported token
  counts.
- **Cost figures are estimates** from a per-tier price table in `providers.py`;
  adjust the table to match current pricing.
- **Single-process event bus.** WebSocket progress uses an in-memory pub/sub.
  For multi-worker deployments, back `events.bus` with Redis pub/sub (same
  interface).
- **Backlog `effort`/`impact` defaults** are derived heuristically from each
  issue's severity; refine in `store.build_backlog_items` if the CTO model
  starts emitting them directly.
