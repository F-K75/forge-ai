# Forge AI — Engineering Organisation & UI Standards (`AGENTS.md`)

This file defines the mandatory operating rules, UI standards, and multi-agent engineering governance for all AI coding agents operating inside `/Users/keshav/forge-ai`.

---

## PART I: MULTI-AGENT ENGINEERING ORGANISATION & MANDATORY GOVERNANCE

### 1. Engineering Roster (`.agents/agents/*.md`)
Forge AI operates a persistent 9-agent engineering organisation:
1. **`orchestrator`**: Lead Engineering Orchestrator — task coordination, gate enforcement (`G0`–`G6`), worktree assignment, and `engineering/TASK_BOARD.md` management.
2. **`architect`**: Principal Systems Architect — read-only architectural discovery, cross-service contract verification, and ADR authorship (`engineering/ARCHITECTURE.md`, `engineering/DECISION_LOG.md`).
3. **`backend-engineer`**: Senior Backend Engineer — FastAPI (`backend/api/`), Motor/MongoDB (`backend/core/database.py`), Redis (`backend/core/cache.py`), Celery workers (`backend/tasks/`), and WebSocket server endpoints.
4. **`frontend-engineer`**: Senior Frontend Engineer — React 19, TypeScript, Vite, design tokens (`frontend/src/lib/designTokens.ts`, `frontend/src/index.css`), UI components, and client WebSocket hooks (`frontend/src/hooks/useWebSocket.ts`).
5. **`ai-engineer`**: Lead AI Orchestration Engineer — multi-agent build/initiative pipelines (`backend/core/orchestrator.py`, `backend/agents/`), LLM usage/cost telemetry (`backend/core/ai_usage.py`), prompt templates (`backend/prompt_builder/`), and standalone orchestration (`orchestration/`, `orchestrator/`).
6. **`qa-engineer`**: Lead QA & Test Automation Engineer — `pytest` suites (`backend/tests/`, `orchestration/tests/`), Vitest unit/accessibility suites (`frontend/src/**/*.test.tsx`), and Playwright E2E suites (`frontend/tests/`, `frontend/playwright.config.ts`).
7. **`security-engineer`**: Principal Security Engineer — strictly read-only security auditing, auth/JWT/CSRF/WebSocket verification, webhook signature checks, and secrets hygiene.
8. **`devops-engineer`**: Lead DevOps & Platform Engineer — Dockerfiles, `docker-compose*.yml`, Kubernetes manifests (`k8s/`), GitHub Actions workflows (`.github/workflows/`), Cloudflare deployment, and Git worktrees.
9. **`independent-reviewer`**: Independent Technical Reviewer — strictly read-only adversarial verification of all audit claims, code diffs, and test evidence prior to Gate `G1` and Gate `G4` sign-off.

### 2. Eleven Non-Negotiable Engineering Rules
All agents MUST obey these rules without exception (detailed in `.agents/rules/*.md`):
1. **No direct commits to `main`**: All implementation work must occur on dedicated feature/fix branches (`feat/<task-id>-*`, `fix/<task-id>-*`).
2. **No merging without explicit CTO approval (`G5`)**: No branch may be merged into `main` without explicit sign-off from the CTO.
3. **No deployment without explicit CTO approval (`G6`)**: No production or staging deployment (`wrangler`, `kubectl`, CI release triggers) may be executed without explicit CTO approval.
4. **No destructive database migrations without approval**: Dropping collections, dropping indexes, truncating tables, or running irreversible data migrations requires explicit CTO approval.
5. **No modifying secrets or production credentials**: Agents must never alter `.env`, `.dev.vars`, `k8s/secrets.yaml` secret values, or cloud secret stores, and must never echo raw secrets in logs or chat.
6. **No concurrent editing of the same files**: Two agents must never modify the same file at the same time. The Orchestrator enforces strict file-ownership partitioning in `engineering/TASK_BOARD.md`.
7. **Use isolated Git worktrees for independent implementation**: Parallel implementation agents must work in isolated Git worktrees (`/Users/keshav/forge-ai.worktrees/<agent>-<task-id>`) rather than sharing a single dirty working tree.
8. **Every implementation requires tests (`G3`)**: No code change is complete without automated unit, integration, or E2E tests proving the change works and preventing regressions.
9. **Every implementation requires independent review (`G4`)**: Every task must be independently verified and challenged by `independent-reviewer` (and `security-engineer` for security-relevant changes) before merge readiness.
10. **All blockers must be documented**: Any technical, environment, or dependency blocker must immediately be recorded with status `BLOCKED` in `engineering/TASK_BOARD.md` and `engineering/AGENT_STATUS.md`.
11. **Preserve existing functionality**: Never delete or break existing working features, routes, or contracts when refactoring or fixing bugs.

### 3. Approval Gates (`G0`–`G6`)
Agents must never bypass these gates (`.agents/rules/approval-gates.md`):
- **G0**: Repository discovery approved.
- **G1**: Architecture and technical assessment approved.
- **G2**: Implementation plan approved.
- **G3**: Implementation and tests completed.
- **G4**: Independent review passed.
- **G5**: CTO approves merge.
- **G6**: CTO approves production deployment.

---

## PART II: UI STANDARDS & GUIDELINES FOR AI CODING AGENTS

UI STANDARDS — apply to all UI output unless overridden

### DESIGN TOKENS
- Define a token set before writing components: colors (primary, secondary, neutral scale, semantic: success/warning/error/info), spacing scale (4/8/12/16/24/32/48/64px), typography scale (H1–H6, body, caption), border-radius scale, shadow/elevation levels.
- Never hardcode raw hex/px values inline — reference tokens.
- Token implementations live in `/frontend/src/lib/designTokens.ts` and CSS variables in `/frontend/src/index.css`.

### LAYOUT
- Use a 12-column grid or flex/grid layout, not absolute positioning.
- Define breakpoints: mobile (<640px), tablet (640–1024px), desktop (>1024px).
- Consistent max-width containers; no fixed pixel widths on responsive pages.

### COMPONENTS
- Every interactive component must define states: default, hover, active, focus, disabled, error/invalid, loading.
- Buttons: max 3 visual weights (primary, secondary, ghost/text).
- Forms: label + input + helper/error text pattern, consistent across all forms.
- Tables/data views: sticky headers, zebra striping or dividers, empty-state and loading-state variants (important for dashboards / backtest results).

### ACCESSIBILITY
- WCAG AA minimum: 4.5:1 contrast for text, 3:1 for large text/icons.
- All interactive elements keyboard-navigable and screen-reader labeled.
- Touch targets ≥ 44x44px on mobile.

### CONTENT & MICROCOPY
- Error messages: state what happened + how to fix it, no blame language.
- Empty states: explain what belongs there + a clear next action.

### MOTION
- Transitions 150–300ms, ease-in-out; avoid motion for its own sake.

### OUTPUT FORMAT
- When generating code, use CSS variables/design tokens, not magic numbers.
- Favor composable components over one-off styled elements.
