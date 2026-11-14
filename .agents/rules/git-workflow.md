---
trigger: always_on
---

# Forge AI Git & Worktree Workflow (`.agents/rules/git-workflow.md`)

All agents must follow this Git and worktree workflow without exception.

## 1. Branch Protection & Commit Rules

1. **No Direct Commits to `main`**:
   - Committing directly to `main` is strictly forbidden.
   - All changes must be authored on task-specific branches named:
     - `feat/<task-id>-<short-slug>` (new features)
     - `fix/<task-id>-<short-slug>` (bug & security fixes)
     - `chore/<task-id>-<short-slug>` (CI, tooling, docs, cleanup)
     - `test/<task-id>-<short-slug>` (test suite additions)
2. **No Merging Without Explicit CTO Approval (`G5`)**:
   - No agent may run `git merge`, `git rebase` onto `main`, or merge a Pull Request without explicit Gate `G5` approval from the CTO.
3. **No Force Pushing to Shared Branches**:
   - `git push --force` and `git reset --hard` on shared branches are prohibited unless explicitly instructed by the CTO.

## 2. Isolated Git Worktree Strategy

To prevent concurrent file edits, index lock contention (`.git/index.lock`), and cross-agent state pollution:

1. **Mandatory Worktree Isolation for Implementation (`G3`)**:
   - Whenever an implementation agent (`backend-engineer`, `frontend-engineer`, `ai-engineer`, `qa-engineer`, `devops-engineer`) executes a task at Gate `G3`, it must operate in a dedicated Git worktree outside the primary workspace:
     ```bash
     git worktree add -b <branch-name> /Users/keshav/forge-ai.worktrees/<agent>-<task-id> main
     ```
   - Or, when invoked via Antigravity subagents (`invoke_subagent` or `swarm`), use `Workspace: "share"` or `Workspace: "branch"` so each writer agent receives an isolated working copy.
2. **No Concurrent Editing of the Same Files**:
   - Before assigning any task to `IN_PROGRESS`, the `orchestrator` must verify in `engineering/TASK_BOARD.md` that the task's `Affected Files` set is completely disjoint from all other `IN_PROGRESS` tasks.
   - If two tasks touch overlapping files, the second task must remain `TODO` or `BLOCKED` (with a documented dependency on the first task ID) until the first task is merged.
3. **Worktree Lifecycle & Cleanup**:
   - Worktrees remain intact through Gate `G3` (Implementation & Tests) and Gate `G4` (Independent Review) so `independent-reviewer` and `qa-engineer` can inspect the exact branch diff and run tests in isolation.
   - Only after Gate `G5` (CTO approves merge) and successful merge may the worktree be pruned (`git worktree remove`).

## 3. Pre-Commit & Staging Discipline

1. **Inspect Before Staging**: Always run `git status` and `git diff` before staging files. Never run blind `git add .` or `git add -A` that could sweep up `.env`, `dump.rdb`, `req.json`, `eng.traineddata`, or untracked scratch files.
2. **Respect Pre-Commit Hooks**: Never bypass pre-commit secret scanning or lint hooks with `--no-verify`.
3. **Conventional Commit Messages**: Format all commits as `<type>(<scope>): <concise summary> [TASK-ID]`.

