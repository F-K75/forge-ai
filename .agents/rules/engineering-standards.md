---
trigger: always_on
---

# Forge AI Engineering Standards (`.agents/rules/engineering-standards.md`)

These engineering standards apply to all agents (`orchestrator`, `architect`, `backend-engineer`, `frontend-engineer`, `ai-engineer`, `qa-engineer`, `security-engineer`, `devops-engineer`, `independent-reviewer`) working in `/Users/keshav/forge-ai`.

## 1. Core Principles

1. **Preserve Existing Functionality**: Every bug fix, refactor, or feature addition must maintain backward compatibility with existing REST routes (`/api/v1/*`), WebSocket contracts (`/ws/*`), database schemas, and UI workflows unless an explicit breaking change is approved by the CTO at Gate `G2`.
2. **Evidence-Based Engineering**: Never assume prior markdown audit documents (`*AUDIT*.md`, `P0_FIXES_APPLIED.md`, `FORGE_TASKS.md`) reflect current reality. Always verify against live source code and cite exact `file:line` references.
3. **Every Implementation Requires Automated Tests**:
   - Backend (`backend/`): `pytest` unit/integration tests in `backend/tests/` covering success, validation error, auth/permission rejection, and idempotency paths.
   - Orchestration (`orchestration/`): `pytest`/`unittest` tests in `orchestration/tests/`.
   - Frontend (`frontend/`): Vitest + React Testing Library + `jest-axe` tests in `frontend/src/**/*.test.tsx`, plus Playwright E2E specs in `frontend/tests/*.spec.ts` for user-facing flows.
4. **Every Implementation Requires Independent Review**: No task may transition to `VERIFIED` without adversarial verification by `independent-reviewer` (and `security-engineer` for auth/secrets/infrastructure changes).
5. **All Blockers Must Be Documented**: If an agent encounters an unresolved dependency, broken environment, merge conflict, or ambiguous requirement, it must halt mutation immediately and log the blocker under `BLOCKED` in `engineering/TASK_BOARD.md` and `engineering/AGENT_STATUS.md`.

## 2. Backend & AI Engineering Standards (`backend/`, `orchestration/`)

- **Async Hygiene**: Never call blocking I/O (`requests`, synchronous `pymongo`, `time.sleep`) inside `async def` FastAPI endpoints. Use `httpx.AsyncClient`, Motor (`AsyncIOMotorClient`), and `asyncio.sleep`.
- **LLM Usage Telemetry**: Every LLM call across all providers (Anthropic, OpenAI, Gemini, Ollama, BYOK) must record token counts (`prompt_tokens`, `completion_tokens`), cost estimate, latency, model name, and `user_id`/`build_id` via `backend/core/ai_usage.py`.
- **Celery Reliability**: All Celery tasks in `backend/tasks/` must enforce soft/hard time limits, handle retries with exponential backoff, and use idempotency keys so duplicate delivery does not corrupt build or billing state.
- **Strict Linting & Typing**: All Python changes must pass `ruff check` and `mypy` without adding `# type: ignore` or `# noqa` unless justified in code comments.

## 3. Frontend Engineering Standards (`frontend/`)

- **Design Tokens First**: Follow `AGENTS.md` Part II strictly. Reference `/frontend/src/lib/designTokens.ts` and CSS variables in `/frontend/src/index.css`. Never hardcode raw hex colors or pixel spacing inline.
- **Interactive States & Accessibility**: Every interactive component must support `default`, `hover`, `active`, `focus`, `disabled`, `error/invalid`, and `loading` states, meet WCAG AA contrast (4.5:1 text, 3:1 large text/icons), and provide keyboard navigation and screen-reader labels.
- **WebSocket Contract Fidelity**: Client WebSocket connections (`frontend/src/hooks/useWebSocket.ts` and page-level sockets) must authenticate using the exact subprotocol (`["ws-token", token]`) expected by the backend endpoints.

## 4. CI/CD & Quality Gates (`.github/workflows/`)

- **Fail-Closed Pipelines**: CI jobs for linting, typechecking, unit testing, E2E testing, and secret scanning must **never** use `continue-on-error: true` or `|| true` to mask failures.
- **Clean Repository Hygiene**: Never commit build outputs (`dist/`), test failure artifacts (`test-results/`, `playwright-report/`), runtime Redis dumps (`dump.rdb`), OCR blobs (`eng.traineddata`), local SDK directories (`google-cloud-sdk/`), or raw request/response dumps (`req.json`, `gemini_resp.json`).

