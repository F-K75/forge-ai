---
trigger: always_on
---

# Forge AI Approval Gates (`.agents/rules/approval-gates.md`)

All engineering work in Forge AI is governed by seven sequential Approval Gates (`G0` through `G6`). **Agents must never bypass, auto-approve, or skip any gate.**

## Gate Definitions & Mandatory Criteria

| Gate | Name | Owner / Approver | Mandatory Entry & Exit Criteria |
| :--- | :--- | :--- | :--- |
| **G0** | **Repository Discovery Approved** | Orchestrator -> **CTO Approval** | Complete read-only inspection of repository structure, git/worktree state, frontend, backend, AI orchestration, DB/Redis/Celery, WebSockets, Docker/K8s, CI/CD, tests, and security configuration. |
| **G1** | **Architecture & Technical Assessment Approved** | Specialist Agents + `independent-reviewer` -> **CTO Approval** | Specialist assessments completed; historical issues revalidated from source; `independent-reviewer` has challenged findings; `engineering/ARCHITECTURE.md` and `engineering/TASK_BOARD.md` populated; CTO approves assessment. |
| **G2** | **Implementation Plan Approved** | `orchestrator` + `architect` -> **CTO Approval** | Task breakdown, isolated Git worktree assignments, file ownership matrix, test strategy, and rollback plan documented in `engineering/TASK_BOARD.md` and `engineering/DECISION_LOG.md`. **No code modifications may begin before CTO approves G2.** |
| **G3** | **Implementation & Tests Completed** | Owning Engineer + `qa-engineer` | Code implemented in isolated worktree branch; unit, integration, and E2E tests written and passing; linter and typecheck clean; test evidence logged in `engineering/TASK_BOARD.md`. |
| **G4** | **Independent Review Passed** | `independent-reviewer` + `security-engineer` | `independent-reviewer` (and `security-engineer` for security-sensitive diffs) inspects the branch diff and test outputs, challenges edge cases, verifies rule compliance, and records `APPROVED` in `engineering/TASK_BOARD.md`. |
| **G5** | **CTO Approves Merge** | **CTO Explicit Approval** | Task is `VERIFIED` at `G4`; `engineering/RELEASE_READINESS.md` updated; CTO explicitly approves merging the feature/fix branch into `main`. |
| **G6** | **CTO Approves Production Deployment** | **CTO Explicit Approval** | Release readiness checklist green; rollback procedure verified; CTO explicitly authorizes staging/production deployment. |

## Enforcement Rules

1. **Hard Stop at G0/G1/G2**: During discovery and planning (`G0`–`G2`), application code (`backend/`, `frontend/`, `orchestration/`, `k8s/`, `.github/workflows/`) is strictly read-only.
2. **Separation of Duties at G3/G4**: The agent that writes code for a task at `G3` can **never** act as the `independent-reviewer` for that task at `G4`.
3. **Hard Stop at G5/G6**: Even after `independent-reviewer` marks a task `VERIFIED` (`G4`), no agent may merge to `main` (`G5`) or deploy (`G6`) without an explicit message from the CTO granting approval.

