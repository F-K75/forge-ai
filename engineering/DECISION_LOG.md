# Forge AI — Architecture Decision Log (`engineering/DECISION_LOG.md`)

**Status**: Active  
**Owner**: Principal Systems Architect (`architect`) & Lead Engineering Orchestrator (`orchestrator`)

---

## ADR-001: Installation of Persistent 9-Agent Engineering Organisation

- **Date**: 2026-11-14
- **Status**: Accepted (Gate `G0` / `G1`)
- **Context**:
  Forge AI is a multi-subsystem platform combining a FastAPI/Motor/Redis/Celery backend (`backend/`), a React 18/Vite/TypeScript SPA (`frontend/`), a multi-agent build and PM orchestration layer (`backend/core/`, `backend/agents/`, `backend/agent_registry/`, `backend/prompt_builder/`), and Docker/Kubernetes/Cloudflare infrastructure (`k8s/`, `deploy/`, `.github/workflows/`). Uncoordinated single-agent edits previously left the repository with an uncommitted 64-commit merge on `main`, cross-service WebSocket contract drift, and unverified audit claims.
- **Decision**:
  Establish a persistent 9-agent engineering organisation ([`.agents/agents/*.md`](file:///Users/keshav/forge-ai/.agents/agents) and workspace plugin [`.agents/plugins/forge-engineering/`](file:///Users/keshav/forge-ai/.agents/plugins/forge-engineering/plugin.json)):
  1. `orchestrator` (Coordinator & Gatekeeper)
  2. `architect` (Read-Only Systems Architect)
  3. `backend-engineer` (FastAPI, MongoDB, Redis, Celery, WebSockets, Billing/Auth)
  4. `frontend-engineer` (React, TypeScript, Vite, Tailwind, Design Tokens, WebSocket hooks)
  5. `ai-engineer` (Orchestrators, Agents, LLM Router, `ai_usage.py`, Prompt Builder)
  6. `qa-engineer` (Pytest, Vitest, Playwright E2E, Coverage)
  7. `security-engineer` (Strictly Read-Only Security & Secrets Auditor)
  8. `devops-engineer` (Docker, Compose, K8s, GitHub Actions, Worktrees)
  9. `independent-reviewer` (Strictly Read-Only Adversarial Reviewer for Gates `G1` & `G4`)
- **Consequences**:
  - `architect`, `security-engineer`, and `independent-reviewer` are restricted to read-only tools (`read_file`, `search_web`) so they can never mutate code or self-approve changes.
  - Every code change requires both automated test verification (`qa-engineer` at Gate `G3`) and adversarial verification (`independent-reviewer` at Gate `G4`) before CTO merge approval (`G5`).

---

## ADR-002: Mandatory Isolated Git Worktree Strategy & File-Ownership Partitioning

- **Date**: 2026-11-14
- **Status**: Accepted
- **Context**:
  Concurrent agents operating on a single shared working tree cause `.git/index.lock` contention, accidental staging of untracked artifacts (`eng.traineddata`, `req.json`, `dump.rdb`), and cross-task regressions. Additionally, Antigravity read-only subagents invoked with `Workspace: "inherit"` inspect the committed `HEAD` snapshot rather than uncommitted git-index changes.
- **Decision**:
  1. **Zero Direct Commits to `main`**: All implementation work at Gate `G3` must happen on dedicated branches (`feat/<task-id>-*`, `fix/<task-id>-*`, `chore/<task-id>-*`, `test/<task-id>-*`).
  2. **Isolated Git Worktrees**: Every parallel implementation task at Gate `G3` must run in a dedicated worktree at `/Users/keshav/forge-ai.worktrees/<agent>-<task-id>` (or via Antigravity `Workspace: "share"` / `"branch"`).
  3. **Disjoint File Ownership**: `orchestrator` enforces in [`engineering/TASK_BOARD.md`](file:///Users/keshav/forge-ai/engineering/TASK_BOARD.md) that no two `IN_PROGRESS` tasks share any file in their `Affected Files` list.
  4. **Clean `HEAD` Prerequisite**: Before spawning `G3` implementation worktrees, the dirty uncommitted merge state on `main` (`.git/MERGE_HEAD` + staged artifacts) must be cleanly resolved on a dedicated branch (`TASK-001`) so committed `HEAD` matches the working tree across all subagent sandboxes.
- **Consequences**:
  - Worktrees persist through Gates `G3` and `G4` so `qa-engineer` and `independent-reviewer` can inspect committed branch diffs accurately.

---

## ADR-003: Resolution of Build File Storage Split (`db.builds` vs. `db.build_files`)

- **Date**: 2026-11-14
- **Status**: Proposed (Pending CTO Gate `G2` Approval)
- **Context**:
  To avoid MongoDB's 16 MB BSON document limit, [`backend/tasks/build_tasks.py`](file:///Users/keshav/forge-ai/backend/tasks/build_tasks.py#L152-L194) stores generated project files as individual documents in `db.build_files` (`BuildFile`) and removes `files` from `db.builds`. However:
  - [`backend/api/deployments.py`](file:///Users/keshav/forge-ai/backend/api/deployments.py#L489) (`_run_deployment_background`) and [`backend/api/deployments.py`](file:///Users/keshav/forge-ai/backend/api/deployments.py#L640) (`_github_push_background`) still read `files = build.get("files", {})` from `db.builds`, deploying empty directories (`{}`).
  - [`backend/api/deployments.py`](file:///Users/keshav/forge-ai/backend/api/deployments.py#L569-L574) unconditionally calls `await target.teardown(...)` inside the `finally:` block of `_run_deployment_background`, immediately destroying newly deployed containers.
- **Decision**:
  1. Introduce a single canonical helper `await get_build_files_map(db, build_id, fallback_build=build)` in `backend/services/` (or `backend/api/builds.py`) that loads `{doc["path"]: doc["content"]}` from `db.build_files` and falls back to `build.get("files", {})` only for legacy builds.
  2. Update `_run_deployment_background` and `_github_push_background` in [`backend/api/deployments.py`](file:///Users/keshav/forge-ai/backend/api/deployments.py#L489) to use this helper.
  3. Remove `await target.teardown(...)` from the success path in `_run_deployment_background`'s `finally:` block ([`deployments.py:569-574`](file:///Users/keshav/forge-ai/backend/api/deployments.py#L569-L574)), executing teardown only on deployment failure or explicit user deletion (`DELETE /deployments/{id}`).

---

## ADR-004: WebSocket Authentication & Subprotocol Standardization (RFC 6455)

- **Date**: 2026-11-14
- **Status**: Proposed (Pending CTO Gate `G2` Approval)
- **Context**:
  Revalidation of historical issue #4 confirmed that while [`useBuildSocket.ts`](file:///Users/keshav/forge-ai/frontend/src/hooks/useBuildSocket.ts#L49-L64) (`/v1/builds/ws/{id}`) and [`usePMSocket.ts`](file:///Users/keshav/forge-ai/frontend/src/hooks/usePMSocket.ts#L51-L63) (`/v1/initiatives/ws/{id}`) now authenticate via short-lived `ws-token` passed in `Sec-WebSocket-Protocol` and echoed by `websocket.accept(subprotocol=ws_token)`, three critical WebSocket defects remain:
  1. [`backend/api/agent_registry.py`](file:///Users/keshav/forge-ai/backend/api/agent_registry.py#L558) (`org_websocket`) calls `await websocket.accept()` **without** `subprotocol=ws_token`, causing browsers using [`useOrgSocket.ts`](file:///Users/keshav/forge-ai/frontend/src/hooks/useOrgSocket.ts#L121) to fail the RFC 6455 handshake immediately.
  2. [`backend/main.py`](file:///Users/keshav/forge-ai/backend/main.py#L106-L107) starts `ws_manager` and `pm_manager` in `lifespan`, but never calls `org_manager.start()` / `await org_manager.stop()`.
  3. When a non-browser client connects via `?token=` query parameter without a `Sec-WebSocket-Protocol` header, [`builds.py:427`](file:///Users/keshav/forge-ai/backend/api/builds.py#L427) and [`initiatives.py:909`](file:///Users/keshav/forge-ai/backend/api/initiatives.py#L909) still pass `subprotocol=ws_token`, sending an unsolicited `Sec-WebSocket-Protocol` response header in violation of RFC 6455 §4.2.2.
- **Decision**:
  1. Standardize all FastAPI WebSocket endpoints (`builds.py`, `initiatives.py`, `agent_registry.py`) to track `used_subprotocol = bool(subprotocol_header)` and call `await websocket.accept(subprotocol=ws_token if used_subprotocol else None)`.
  2. Wire `org_manager.start()` and `await org_manager.stop()` into [`backend/main.py`](file:///Users/keshav/forge-ai/backend/main.py#L106-L166) `lifespan`.
  3. Update [`useBuildSocket.ts`](file:///Users/keshav/forge-ai/frontend/src/hooks/useBuildSocket.ts#L6), [`usePMSocket.ts`](file:///Users/keshav/forge-ai/frontend/src/hooks/usePMSocket.ts#L6), and [`useOrgSocket.ts`](file:///Users/keshav/forge-ai/frontend/src/hooks/useOrgSocket.ts#L6) so that when `VITE_WS_URL` is empty in production, the client derives `wss://${window.location.host}` (or `ws://` on HTTP) instead of hardcoding `ws://localhost:8000`.

---

## ADR-005: End-to-End LLM Token & Cost Telemetry Across Streaming and `BaseAgent.run()`

- **Date**: 2026-11-14
- **Status**: Proposed (Pending CTO Gate `G2` Approval)
- **Context**:
  Revalidation of historical issue #2 (`backend/core/ai_usage.py`) by `ai-engineer` proved that while `track_usage()` is wired into `LLMRouter._record_usage()` ([`backend/core/llm/router.py:1040-1081`](file:///Users/keshav/forge-ai/backend/core/llm/router.py#L1040-L1081)), `LLMRouter.stream()` constructs `fake_resp = CompletionResponse(text="".join(collected), provider=..., model=...)` with an empty `usage={}` dict ([`router.py:826-831, 973-979`](file:///Users/keshav/forge-ai/backend/core/llm/router.py#L973-L979)). Because `_record_usage()` exits early when `prompt_tokens + completion_tokens <= 0` ([`router.py:1044-1045`](file:///Users/keshav/forge-ai/backend/core/llm/router.py#L1044-L1045)), and because `BaseAgent.run()` wraps `self.stream()` ([`backend/agents/base.py:427-456`](file:///Users/keshav/forge-ai/backend/agents/base.py#L427-L456)), **100% of streaming calls (`DeveloperAgent.generate_files`) and all 11 `BaseAgent.run()` methods (`DesignerAgent`, `ArchitectAgent.clarify/answer`, `DeveloperAgent.identify_questions`, and all 8 Agile PM agents) record 0 tokens and \$0.00 cost in `db.ai_usage`**.
- **Decision**:
  1. Capture real stream usage from provider SDKs (`stream.get_final_message().usage` in `AnthropicProvider`, `stream_options={"include_usage": True}` in `OpenAIProvider`/`OpenRouterProvider`) and fall back to deterministic token estimation (`estimate_tokens(prompt_text)`, `estimate_tokens(completion_text)`) in `LLMRouter.stream()` whenever a provider omits stream usage metadata or aborts mid-stream.
  2. Expand `MODEL_COSTS` and provider attribution in [`backend/core/ai_usage.py`](file:///Users/keshav/forge-ai/backend/core/ai_usage.py#L20-L94) to cover all models registered in `LLMRouter._register_default_providers` (`gpt-4o-mini`, `gpt-4.1`, `gemini-1.5-pro`, `llama-3.1-8b`, `mistral-small-latest`, `openrouter/auto`, Ollama models) and pass `response.provider` explicitly into `track_usage()`.
  3. Record `byok: True/False` on `db.ai_usage` documents so platform spend dashboards do not conflate user-paid BYOK calls with platform-funded LLM spend.

