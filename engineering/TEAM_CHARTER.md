# Forge AI — Engineering Team Charter (`engineering/TEAM_CHARTER.md`)

**Status**: Active  
**Version**: 1.0.0  
**Owner**: Lead Engineering Orchestrator (`orchestrator`)  
**Approval Gate**: Gate `G0` / `G1` (Installed & Active; Implementation Locked Pending CTO Gate `G2`)

---

## 1. Mission & Operating Philosophy

Forge AI operates a persistent **9-agent engineering organisation** inside [`/Users/keshav/forge-ai`](file:///Users/keshav/forge-ai). Every agent operates under strict role boundaries, evidence-based verification (`file:line` citations against live source code), isolated Git worktree execution, and mandatory multi-stage approval gates (`G0`–`G6`).

No agent is permitted to self-approve its own work, edit files outside its assigned ownership boundary, commit directly to `main`, or bypass independent adversarial review.

---

## 2. Engineering Organisation Roster & Tool Permissions

All nine persistent agent definitions live in [`.agents/agents/`](file:///Users/keshav/forge-ai/.agents/agents) and are packaged into the workspace plugin at [`.agents/plugins/forge-engineering/`](file:///Users/keshav/forge-ai/.agents/plugins/forge-engineering/plugin.json) (registered in [`.agents/plugins.json`](file:///Users/keshav/forge-ai/.agents/plugins.json)).

| # | Agent ID | Role Title | Mode (`subagent` / `mainAgent`) | Permitted Tools | Explicit Ownership Boundary |
| :- | :--- | :--- | :--- | :--- | :--- |
| 1 | [`orchestrator`](file:///Users/keshav/forge-ai/.agents/agents/orchestrator.md) | Lead Engineering Orchestrator | `mainAgent: true`, `subagent: false` | `read_file`, `edit_file`, `write_file`, `run_command`, `manage_task`, `search_web` (+ subagent delegation) | [`AGENTS.md`](file:///Users/keshav/forge-ai/AGENTS.md), [`.agents/rules/*`](file:///Users/keshav/forge-ai/.agents/rules), [`engineering/TASK_BOARD.md`](file:///Users/keshav/forge-ai/engineering/TASK_BOARD.md), [`engineering/TEAM_CHARTER.md`](file:///Users/keshav/forge-ai/engineering/TEAM_CHARTER.md), [`engineering/AGENT_STATUS.md`](file:///Users/keshav/forge-ai/engineering/AGENT_STATUS.md), [`engineering/RELEASE_READINESS.md`](file:///Users/keshav/forge-ai/engineering/RELEASE_READINESS.md) |
| 2 | [`architect`](file:///Users/keshav/forge-ai/.agents/agents/architect.md) | Principal Systems Architect | `subagent: true`, `mainAgent: false` | **Read-Only**: `read_file`, `search_web` | [`engineering/ARCHITECTURE.md`](file:///Users/keshav/forge-ai/engineering/ARCHITECTURE.md), [`engineering/DECISION_LOG.md`](file:///Users/keshav/forge-ai/engineering/DECISION_LOG.md), cross-service REST/WebSocket/DB contract specifications |
| 3 | [`backend-engineer`](file:///Users/keshav/forge-ai/.agents/agents/backend-engineer.md) | Senior Backend Engineer | `subagent: true`, `mainAgent: false` | `read_file`, `edit_file`, `write_file`, `run_command`, `manage_task` | [`backend/main.py`](file:///Users/keshav/forge-ai/backend/main.py), [`backend/api/`](file:///Users/keshav/forge-ai/backend/api), [`backend/core/`](file:///Users/keshav/forge-ai/backend/core) (excluding `orchestrator.py`, `pm_orchestrator.py`, `ai_usage.py`, `llm/`), [`backend/services/`](file:///Users/keshav/forge-ai/backend/services), [`backend/tasks/`](file:///Users/keshav/forge-ai/backend/tasks), [`backend/celery_app.py`](file:///Users/keshav/forge-ai/backend/celery_app.py), [`backend/sandbox/`](file:///Users/keshav/forge-ai/backend/sandbox) |
| 4 | [`frontend-engineer`](file:///Users/keshav/forge-ai/.agents/agents/frontend-engineer.md) | Senior Frontend Engineer | `subagent: true`, `mainAgent: false` | `read_file`, `edit_file`, `write_file`, `run_command`, `manage_task` | [`frontend/src/`](file:///Users/keshav/forge-ai/frontend/src), [`frontend/index.html`](file:///Users/keshav/forge-ai/frontend/index.html), [`frontend/vite.config.ts`](file:///Users/keshav/forge-ai/frontend/vite.config.ts), [`frontend/tailwind.config.ts`](file:///Users/keshav/forge-ai/frontend/tailwind.config.ts), [`frontend/tsconfig.json`](file:///Users/keshav/forge-ai/frontend/tsconfig.json) |
| 5 | [`ai-engineer`](file:///Users/keshav/forge-ai/.agents/agents/ai-engineer.md) | Lead AI Orchestration Engineer | `subagent: true`, `mainAgent: false` | `read_file`, `edit_file`, `write_file`, `run_command`, `manage_task` | [`backend/core/orchestrator.py`](file:///Users/keshav/forge-ai/backend/core/orchestrator.py), [`backend/core/pm_orchestrator.py`](file:///Users/keshav/forge-ai/backend/core/pm_orchestrator.py), [`backend/core/ai_usage.py`](file:///Users/keshav/forge-ai/backend/core/ai_usage.py), [`backend/core/llm/`](file:///Users/keshav/forge-ai/backend/core/llm), [`backend/agents/`](file:///Users/keshav/forge-ai/backend/agents), [`backend/agent_registry/`](file:///Users/keshav/forge-ai/backend/agent_registry), [`backend/gateway/`](file:///Users/keshav/forge-ai/backend/gateway), [`backend/prompt_builder/`](file:///Users/keshav/forge-ai/backend/prompt_builder), [`orchestration/`](file:///Users/keshav/forge-ai/orchestration), [`orchestrator/`](file:///Users/keshav/forge-ai/orchestrator) |
| 6 | [`qa-engineer`](file:///Users/keshav/forge-ai/.agents/agents/qa-engineer.md) | Lead QA & Test Automation Engineer | `subagent: true`, `mainAgent: false` | `read_file`, `edit_file`, `write_file`, `run_command`, `manage_task` | [`backend/tests/`](file:///Users/keshav/forge-ai/backend/tests), [`orchestration/tests/`](file:///Users/keshav/forge-ai/orchestration/tests), [`frontend/tests/`](file:///Users/keshav/forge-ai/frontend/tests), [`frontend/playwright.config.ts`](file:///Users/keshav/forge-ai/frontend/playwright.config.ts), `frontend/src/**/*.test.{ts,tsx}`, [`pytest.ini`](file:///Users/keshav/forge-ai/pytest.ini) |
| 7 | [`security-engineer`](file:///Users/keshav/forge-ai/.agents/agents/security-engineer.md) | Principal Security Engineer | `subagent: true`, `mainAgent: false` | **Read-Only**: `read_file`, `search_web` | Read-only security auditing across auth, JWT, OAuth, CSRF, WebSockets, webhooks, BYOK encryption, Docker/sandbox isolation, K8s secrets, and `.gitallowed` |
| 8 | [`devops-engineer`](file:///Users/keshav/forge-ai/.agents/agents/devops-engineer.md) | Lead DevOps & Platform Engineer | `subagent: true`, `mainAgent: false` | `read_file`, `edit_file`, `write_file`, `run_command`, `manage_task` | [`Dockerfile`](file:///Users/keshav/forge-ai/Dockerfile), [`backend/Dockerfile`](file:///Users/keshav/forge-ai/backend/Dockerfile), [`frontend/Dockerfile`](file:///Users/keshav/forge-ai/frontend/Dockerfile), [`docker-compose.yml`](file:///Users/keshav/forge-ai/docker-compose.yml), [`docker-compose.prod.yml`](file:///Users/keshav/forge-ai/docker-compose.prod.yml), [`docker-compose.staging.yml`](file:///Users/keshav/forge-ai/docker-compose.staging.yml), [`k8s/`](file:///Users/keshav/forge-ai/k8s), [`deploy/`](file:///Users/keshav/forge-ai/deploy), [`.github/workflows/`](file:///Users/keshav/forge-ai/.github/workflows), [`wrangler.toml`](file:///Users/keshav/forge-ai/wrangler.toml), [`scripts/`](file:///Users/keshav/forge-ai/scripts), [`.gitignore`](file:///Users/keshav/forge-ai/.gitignore) |
| 9 | [`independent-reviewer`](file:///Users/keshav/forge-ai/.agents/agents/independent-reviewer.md) | Independent Technical Reviewer | `subagent: true`, `mainAgent: false` | **Read-Only**: `read_file`, `search_web` | Adversarial verification of all specialist assessments (`G1`) and code/test diffs (`G4`). Never writes code; never trusts unverified claims. |

---

## 3. The Eleven Non-Negotiable Engineering Rules

Defined in [`AGENTS.md`](file:///Users/keshav/forge-ai/AGENTS.md) and enforced across [`.agents/rules/`](file:///Users/keshav/forge-ai/.agents/rules):

1. **No direct commits to `main`** ([`.agents/rules/git-workflow.md`](file:///Users/keshav/forge-ai/.agents/rules/git-workflow.md)): All work occurs on task-scoped branches (`feat/<task-id>-*`, `fix/<task-id>-*`, `chore/<task-id>-*`, `test/<task-id>-*`).
2. **No merging without explicit CTO approval (`G5`)** ([`.agents/rules/approval-gates.md`](file:///Users/keshav/forge-ai/.agents/rules/approval-gates.md)): No branch is merged to `main` without explicit CTO sign-off.
3. **No deployment without explicit CTO approval (`G6`)** ([`.agents/rules/approval-gates.md`](file:///Users/keshav/forge-ai/.agents/rules/approval-gates.md)): No production or staging deployment (`wrangler`, `kubectl`, SSH/VPS deploy) runs without explicit CTO sign-off.
4. **No destructive database migrations without approval** ([`.agents/rules/security-policy.md`](file:///Users/keshav/forge-ai/.agents/rules/security-policy.md)): Dropping collections/indexes, `delete_many({})`, or Redis `FLUSHALL` requires explicit CTO approval.
5. **No modifying secrets or production credentials** ([`.agents/rules/security-policy.md`](file:///Users/keshav/forge-ai/.agents/rules/security-policy.md)): Never alter `.env`, `.dev.vars`, `k8s/secrets.yaml` secret values, or cloud secret stores; never echo raw secret values in chat or logs.
6. **No concurrent editing of the same files** ([`.agents/rules/git-workflow.md`](file:///Users/keshav/forge-ai/.agents/rules/git-workflow.md)): `orchestrator` enforces disjoint `Affected Files` sets across all `IN_PROGRESS` tasks in [`engineering/TASK_BOARD.md`](file:///Users/keshav/forge-ai/engineering/TASK_BOARD.md).
7. **Use isolated Git worktrees for independent implementation** ([`.agents/rules/git-workflow.md`](file:///Users/keshav/forge-ai/.agents/rules/git-workflow.md)): Implementation agents at Gate `G3` operate in `/Users/keshav/forge-ai.worktrees/<agent>-<task-id>` or `Workspace: "share"` / `"branch"`.
8. **Every implementation requires tests (`G3`)** ([`.agents/rules/engineering-standards.md`](file:///Users/keshav/forge-ai/.agents/rules/engineering-standards.md)): Automated `pytest`, Vitest, or Playwright tests are mandatory for every change.
9. **Every implementation requires independent review (`G4`)** ([`.agents/rules/approval-gates.md`](file:///Users/keshav/forge-ai/.agents/rules/approval-gates.md)): `independent-reviewer` (and `security-engineer` for security-sensitive diffs) must challenge and verify every diff before `VERIFIED`.
10. **All blockers must be documented** ([`.agents/rules/engineering-standards.md`](file:///Users/keshav/forge-ai/.agents/rules/engineering-standards.md)): Any blocker immediately transitions the task to `BLOCKED` in [`engineering/TASK_BOARD.md`](file:///Users/keshav/forge-ai/engineering/TASK_BOARD.md) and [`engineering/AGENT_STATUS.md`](file:///Users/keshav/forge-ai/engineering/AGENT_STATUS.md).
11. **Preserve existing functionality** ([`.agents/rules/engineering-standards.md`](file:///Users/keshav/forge-ai/.agents/rules/engineering-standards.md)): Never break existing working routes, WebSocket contracts, schemas, or UI flows.

---

## 4. Sequential Approval Gates (`G0`–`G6`)

```
[G0: Discovery] ──► [G1: Architecture & Audit] ──► [G2: Implementation Plan]
       │                       │                             │
  (CTO Approval)         (CTO Approval)                (CTO Approval)
                                                             │
                                                             ▼
[G6: Prod Deploy] ◄── [G5: Merge to main] ◄── [G4: Independent Review] ◄── [G3: Worktree Code + Tests]
       │                       │                        │                           │
  (CTO Approval)         (CTO Approval)        (independent-reviewer       (Owner + qa-engineer)
                                                + security-engineer)
```

| Gate | Description | Required Evidence | Sign-Off Authority |
| :--- | :--- | :--- | :--- |
| **G0** | Repository Discovery Approved | Full read-only inspection of repository structure, git/worktree state, services, and configs | `orchestrator` → **CTO** |
| **G1** | Architecture & Technical Assessment Approved | 7 specialist audits completed, historical issues revalidated, `independent-reviewer` challenge completed, `engineering/*.md` populated | Specialists + `independent-reviewer` → **CTO** |
| **G2** | Implementation Plan Approved | Disjoint file ownership matrix, worktree branches, test plan, and rollback plan in [`TASK_BOARD.md`](file:///Users/keshav/forge-ai/engineering/TASK_BOARD.md) | `orchestrator` + `architect` → **CTO** |
| **G3** | Implementation & Tests Completed | Isolated worktree diff, passing unit/integration/E2E tests, clean lint & typecheck | Owning Engineer + `qa-engineer` |
| **G4** | Independent Review Passed | Line-by-line diff verification, edge-case challenge, security sign-off | `independent-reviewer` (+ `security-engineer`) |
| **G5** | Merge Approved | Task `VERIFIED` at `G4`, [`RELEASE_READINESS.md`](file:///Users/keshav/forge-ai/engineering/RELEASE_READINESS.md) updated | **CTO Explicit Approval** |
| **G6** | Production Deployment Approved | Release checklist green, backup/rollback verified | **CTO Explicit Approval** |

---

## 5. Task Lifecycle & Handoff Protocol

Every task on [`engineering/TASK_BOARD.md`](file:///Users/keshav/forge-ai/engineering/TASK_BOARD.md) progresses strictly through five states:

1. **`TODO`**: Scoped with Task ID, Owner, Target Branch/Worktree, Affected Files, and Dependencies. Waiting for Gate `G2` approval or dependency completion.
2. **`IN_PROGRESS`**: Gate `G2` approved by CTO; isolated worktree created; owning engineer implementing fix and `qa-engineer` authoring/running tests (`G3`).
3. **`BLOCKED`**: Execution halted due to an upstream dependency, environment limitation, dirty git state, or requirement ambiguity. Recorded in both [`TASK_BOARD.md`](file:///Users/keshav/forge-ai/engineering/TASK_BOARD.md) and [`AGENT_STATUS.md`](file:///Users/keshav/forge-ai/engineering/AGENT_STATUS.md).
4. **`REVIEW`**: Implementation and test suite passing at `G3`; assigned to `independent-reviewer` (and `security-engineer` where applicable) for adversarial `G4` audit. If rejected, returns to `IN_PROGRESS` with specific defect citations.
5. **`VERIFIED`**: Passed Gate `G4` independent review; ready for CTO Gate `G5` merge approval.

