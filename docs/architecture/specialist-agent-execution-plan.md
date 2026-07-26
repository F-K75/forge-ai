# Specialist Agent Execution: Research & Staged Migration Plan

Status: **proposal / research only** — nothing in this document has been implemented.
Audience: engineers who will implement (some version of) this next.

## 0. TL;DR

- The live build pipeline (`backend/core/orchestrator.py`) is a fixed sequential
  chain of six generic agents. It touches `agent_registry` only to *log*
  activity against a persistent `AgentProfile` after the fact — the resolved
  agent identity never influences what actually gets generated.
- `backend/agent_registry/` is a rich, well-tested-looking org/ownership/
  planning/chat bookkeeping layer sitting *next to* the pipeline, not *inside*
  it.
- `backend/graph/` is a separate, uncommitted, ~7,800-line DAG execution
  engine that looks like the obvious substrate for "real" parallel specialist
  execution, but it is **untested, not wired into anything, and internally
  inconsistent** (two incompatible `GraphNode`/`NodeType` definitions in the
  same package — see §1.3). It should not be treated as production-ready.
- Recommended path (§4): keep `orchestrator.py`'s sequential stage shape,
  and inside the Developer stage dispatch to real, path-partitioned
  specialist calls chosen via `agent_registry.task_router`, gated by a
  feature flag, with the existing monolithic `DeveloperAgent` as a hard
  fallback. This reuses the `agent_profile_id` / `record_task_result` wiring
  `orchestrator.py` already has, and keeps blast radius on the revenue path
  small and reversible.
- `backend/graph/` is not a prerequisite for this — its fate (harden vs.
  archive) is called out as an open question (§6), not a blocker.

---

## 1. Current state summary

### 1.1 How `core/orchestrator.py` actually executes a build today

`Orchestrator.run_build()` (`backend/core/orchestrator.py:69-486`) is a single
long async method run per build. It is **not** a DAG, not parallel across
stages, and there is exactly one `Orchestrator` instance shared as a
process-wide singleton across every concurrent user's build (see the comment
at lines 108-113 — nothing is cached per-build on `self`, only on local
`build`/`files` variables passed through). Stage order, as actually coded:

1. **BUILD_START** event.
2. **Architect** (`self.architect`, a single `ArchitectAgent` instance) —
   optionally `clarify()`\-s open questions on interactive first builds, then
   `blueprint()`. Produces the app blueprint dict.
3. **Business model** (`self.business_model.improve(...)`).
4. **Designer** (`self.designer.design(blueprint, ...)`).
5. **Developer** (`self.developer.generate_files(blueprint, design, ...)`,
   streamed token-by-token to the client) — the single `DeveloperAgent`
   instance generates **every file in the app** in one LLM call. There is no
   per-domain split (frontend vs. backend vs. database) anywhere here.
6. **Integration** (`self.integration.integrate(...)`), only if
   `blueprint.get("integrations")` is non-empty.
7. CSP injection, sandbox static check, content moderation scan (non-agent,
   synchronous local logic).
8. **PM validation + debug loop**: `self.pm.validate(...)`; on failure,
   `self.developer.patch_files(...)` (labeled `AgentType.DEBUGGER` for
   bookkeeping, but it's literally the same `DeveloperAgent` instance's
   `patch_files` method) patches, then PM re-validates, up to
   `MAX_DEBUG_ITERATIONS = 3` times.
9. **BUILD_COMPLETE**, or `BuildStatus.FAILED` if the debug loop is exhausted.

Every stage funnels through `_start_agent()` / `_complete_agent()`
(`orchestrator.py:635-735`), which append/update an `AgentStep` on
`build.agents`, handle credit charging (`_start_agent`'s `credit_map`, keyed
by the fixed `AgentType` enum — one flat charge per stage, not per
underlying LLM call), and emit `WSEvent`s. Resume-after-crash
(`_try_recover_json` / `_find_success_output`, lines 577-604) assumes
**exactly one `AgentStep` per `AgentType` per build** — this assumption
matters a lot for §2 and §5.

### 1.2 Where/how `orchestrator.py` touches `agent_registry` today

Exactly one hook, and it is **purely observational**:

- `_AGENT_TYPE_ROLE_DEPARTMENT` (lines 43-51) is a static map from the fixed
  pipeline `AgentType` enum to an `agent_registry` `(role, department)` pair
  — e.g. `AgentType.DEVELOPER -> ("developer", "specialists")`,
  `AgentType.DEBUGGER -> ("debugger", "qa")`. This is a 1:1, hardcoded
  mapping; it is not derived from the content of the build.
- `_resolve_agent_profile()` (line 621) calls
  `agent_registry.get_or_create_agent(project_id, role, department=...)`
  inside `_start_agent()` and stashes the returned `AgentProfile.id` on
  `AgentStep.agent_profile_id` (field already exists on the model,
  `core/models.py:210`). Wrapped in try/except — a registry hiccup never
  blocks a build.
- `_complete_agent()` calls `agent_registry.record_task_result(project_id,
  agent_profile_id, success=True, files_touched=...)` on success, and the
  outer `except` block in `run_build()` does the same with `success=False`
  for any step left `RUNNING` on a crash.

That's it. `record_task_result` is what drives `AgentProfile.stats`,
`owned_paths`, promotion eligibility, etc. — but **nothing about the
resolved `AgentProfile` (its role, level, strengths/weaknesses, owned paths)
ever flows back into what gets generated.** The same hardcoded
`DeveloperAgent` instance runs regardless of which `AgentProfile` id got
attached to the step. There is no call anywhere in `orchestrator.py` to
`task_router.route()`, `PlanningService.create_plan()`, or
`CodeOwnership.check_change()`.

This is corroborated by `agent_registry/ownership.py`'s own docstring
(lines 9-14): *"This is deliberately advisory, not a hard gate: the current
build pipeline runs a single DeveloperAgent (and a Debugger patching its own
output) across the whole generated app, so an automatic block on 'someone
else touched this file' would fire on completely legitimate debug-loop
patches. Once execution is split across specialist agents that each really
do own a slice of the tree, `check_change` is the primitive a PR workflow
would call to gate merges."* — i.e. the `agent_registry` authors already knew
this gap existed and designed `ownership.py` anticipating it.

`agent_registry/planning.py`'s `PlanTask.depends_on` is also explicitly
always empty today (its own docstring: *"There are no computed dependency
edges between tasks yet — that needs real code-structure analysis this pass
doesn't have"*) — so even the planning layer isn't yet capable of describing
real parallel task graphs, only a flat list of per-department tasks.

The rest of `agent_registry/` (`team_chat.py`, `pr_workflow.py`,
`monitoring.py`, `knowledge_graph.py`, `repo_memory.py`, `activity.py`,
`workload.py`) and its API surface (`api/agent_registry.py`, ~30 REST routes
plus a `/ws` websocket) are fully built and reachable — org chart, per-agent
task history, code ownership summaries, team chat, a PR-style
`ChangeRequest` review workflow with stage transitions, monitoring findings.
All of it is real, persisted, queryable — and entirely disconnected from
build execution. It's an operational/observability layer bolted onto the
side of the pipeline, not driving it.

### 1.3 What `backend/graph/` actually provides today — honest assessment

`backend/graph/` is **untracked in git** (`git status` shows it as an
untracked directory; `git log -- backend/graph/` returns nothing — it has
never been committed). It is 16 Python files, ~7,800 lines
(`wc -l backend/graph/*.py`), plus an `ARCHITECTURE.md` describing a
DAG-based parallel execution engine: `models.py`, `runtime.py`,
`executor.py`, `scheduler.py`, `state.py`, `planner.py`, `memory.py`,
`event_bus.py`, `validator.py`, `retry.py`, `loop.py`, `self_improve.py`,
`observability.py`, `dashboard.py`, `integration.py`.

**What's genuinely there and reasonably coherent:**
- `graph/models.py` + `graph/runtime.py`: an `ExecutionGraph` with
  `GraphNode`/`GraphEdge`, topological ordering, and `GraphRuntime`'s
  `_build_parallel_groups()` (`runtime.py:432-459`) which does a real
  Kahn's-algorithm-style layering of independent nodes into parallel
  execution groups, run via `asyncio.wait(..., return_when=ALL_COMPLETED)`
  in `_execute_group()`. This part of the mechanism is credible.
- `graph/retry.py`, `graph/event_bus.py`, `graph/state.py`: retry policy
  with backoff, a pub/sub event bus, and a checkpoint/state machine — all
  present, all plausible in isolation.
- `graph/integration.py::AgentNodeAdapter` (lines 114-132) has a **correct**
  `AgentType -> method name` map (`ARCHITECT: "blueprint"`,
  `DEVELOPER: "generate_files"`, `INTEGRATION: "integrate"`,
  `PM: "validate"`, `DEBUGGER: "patch_files"`, etc.) — i.e. someone did
  correctly work out how to call each real agent's real structured method.

**Concrete, verified problems:**
- **Two incompatible node type systems in one package.** `graph/models.py`
  defines `GraphNode`/`NodeType` and is what `graph/runtime.py`,
  `scheduler.py`, and `planner.py` all import and use. Separately,
  `graph/integration.py` defines its *own*, structurally different
  `GraphNode` (dataclass, `next_nodes: List[str]`, no `NodeType.AGENT` from
  `models.py` — its own local `NodeType` enum, `integration.py:45-56`) and
  its own `GraphDefinition`. These two `GraphNode` classes are not
  interchangeable. Anything built against `graph/runtime.GraphRuntime` does
  not work against `graph/integration.GraphOrchestrator` and vice versa.
- **The "real" node executor bypasses agents' actual generation logic.**
  `graph/runtime.py::NodeExecutor._run_agent_node()` (lines 165-205)
  dynamically imports an agent class by string-formatting a class name and
  calls the *generic* `BaseAgent.run(messages)` — i.e. a raw LLM call with
  whatever's in `node.inputs`. It does **not** call
  `ArchitectAgent.blueprint()`, `DeveloperAgent.generate_files()`, or any of
  the JSON-contract-producing methods the real pipeline actually depends on.
  So even fully wired up, a `runtime.py` "developer" node would not produce
  the `{"files": {...}}` shape `orchestrator.py` needs — it's a shallow,
  non-functional stand-in for real agent execution, not a drop-in
  replacement. (The *correct* mapping exists, but only in the
  `AgentNodeAdapter` half of the package that `runtime.py` doesn't use.)
- **`GraphOrchestrator.run_build()` currently just calls the real
  `Orchestrator`.** `graph/integration.py:611-644`: if no `graph_id` is
  passed and `graph_loader.get_default_graph()` returns `None` — which it
  always does today, since nothing populates a default graph anywhere —
  `GraphOrchestrator.run_build()` falls straight through to
  `self._orchestrator.run_build(...)`, i.e. today's exact sequential
  pipeline, with some extra tracing/dashboard bookkeeping wrapped around it.
  It is not, in its current state, doing any graph-based execution at all in
  practice.
- **A stub extension point.** `graph/integration.py::NodePlugin.execute()`
  (line 513) unconditionally `raise NotImplementedError` — the plugin system
  is scaffolding, not usable.
- **No connection to `agent_registry` whatsoever.** `graph/runtime.py`'s
  node execution has no concept of an `AgentProfile`, no ownership check, no
  `task_router` classification — nodes are anonymous, keyed only by a raw
  `agent_type` string. It is exactly the "ephemeral/anonymous graph nodes,
  not persistent named agents" state the task description predicted.
- **Zero test coverage.** `grep -rn` across the repo for any test importing
  `graph.*` (excluding `agent_registry/knowledge_graph.py`, which is
  confusingly similar in name but unrelated) turns up nothing. `backend/
  tests/test_knowledge_graph.py` tests `agent_registry`'s knowledge graph,
  not `backend/graph/`.
- **Not wired into anything.** `grep -rln "from graph"` / `"import graph"`
  across the whole backend (excluding `venv/`) returns files inside
  `backend/graph/` itself and nothing else — no API router mounts it, no
  Celery task calls it, `core/orchestrator.py` does not import it.
- Even its own `ARCHITECTURE.md` shows signs of being generated without a
  final pass: its "Implementation Status" section lists
  `ARCHITECTURE.md — This document` under **Missing**, immediately below
  claiming 14 files are **Complete** — a self-referential inconsistency
  that suggests this document (and plausibly the package) did not get a
  careful human review pass before being left in the tree.

**Honest verdict:** `backend/graph/` is architecturally the right *shape* of
substrate for real parallel specialist execution (DAG, topological
parallel-group scheduling, retry, event bus) — but as it stands today it is
an uncommitted, untested, internally-inconsistent, functionally-inert
package that has never run in this codebase. Treating it as
"production-ready execution substrate we just need to wire up" would be a
mistake. Treating it as "a useful reference for what the scheduling core
could look like, and possibly salvageable with real investment" is fair.

---

## 2. The gap: what would have to change, and why it's risky

To make specialist agents really execute their own slice of a build, at
minimum:

1. **Real specialist agent implementations.** Today there is exactly one
   `DeveloperAgent` (`backend/agents/developer.py`) generating the entire
   app in one call. Getting to "React Engineer" / "API Engineer" /
   "Database Engineer" actually executing means writing N agent classes (or
   N parameterized configurations of a generalized agent) each scoped to a
   slice of the file tree, each with its own prompt/context framing. This
   is new code, not just rewiring.
2. **Real task decomposition with dependencies.** `PlanningService` already
   decomposes an objective into per-department `PlanTask`s via
   `task_router`, but `PlanTask.depends_on` is always empty by its own
   design (`planning.py:15-16, 68-71`) — there is no code-structure
   analysis to know that, say, the database schema must exist before the
   API layer that queries it. Building this is nontrivial and was
   explicitly deferred by the `agent_registry` authors.
3. **A concurrency-safe way to merge specialist output into one `files`
   dict.** Today exactly one writer (`DeveloperAgent`) mutates `files`
   sequentially; introduce concurrent specialist writers and you need a
   defined merge/conflict policy, especially for cross-cutting shared files
   (`package.json`, `backend/main.py`, `App.tsx`) that multiple specialists
   plausibly want to touch.
4. **`task_router`'s classifier needs to be trusted at generation time, not
   just for advisory routing.** It's an explicitly deterministic
   keyword-substring heuristic (`task_router.py:1-9`), good enough today
   because misrouting only mis-labels an `AgentProfile` in a bookkeeping
   record. Once its output decides *which agent actually writes which
   files*, a misclassification produces wrong or missing code, not just a
   wrong log entry.
5. **Credit charging, resume, and the debug loop all currently assume one
   step per stage.** `_start_agent`'s `credit_map` is one flat charge per
   `AgentType`; `_try_recover_json`/`_find_success_output` assume exactly
   one `SUCCESS` `AgentStep` per `AgentType` per build; the debug loop is a
   single `self.developer.patch_files()` call reacting to a merged error
   report. Splitting the Developer stage into N specialist calls touches
   all three assumptions and needs deliberate extension, not just "add more
   agents."
6. **Interactive gates poll a single `build.pending_gate` document field**
   (`_wait_for_gate`, `orchestrator.py:500-575`). Concurrent specialist
   steps completing at different times raises the question of when (or
   whether) a gate should fire relative to a stage that's no longer a
   single atomic unit.

**Why this is risky:** `core/orchestrator.py` is the live, revenue-generating
pipeline — every paying build runs through it (`tasks/build_tasks.py`
instantiates the single `orchestrator = Orchestrator()` singleton at module
scope and calls `orchestrator.run_build(...)` for every build task). A
mistake here doesn't just log an error — it can silently corrupt or drop
files from customers' generated apps, over/under-charge credits, or hang a
build on a gate/poll loop. Any change to this file needs to be additive,
flag-gated, and hold the existing sequential single-`DeveloperAgent` path as
a proven fallback for as long as the new path is unproven.

---

## 3. Design options

### Option A — Extend `backend/graph/` as the execution substrate

Fix the `graph/models.GraphNode` vs. `graph/integration.GraphNode`
inconsistency, adopt `AgentNodeAdapter`'s correct method-mapping, wire
`GraphRuntime`'s node execution to resolve/create an `AgentProfile` via
`agent_registry.get_or_create_agent()` per node (instead of an anonymous
`agent_type` string), feed it from `PlanningService.create_plan()` output
once `depends_on` is populated, and let `GraphRuntime._build_parallel_groups`
drive real DAG parallelism.

- **Reuses**: the most existing machinery of any option — parallel group
  scheduling, retry engine, event bus, checkpoint/state machine (~7,800
  lines already written).
- **Effort/Risk**: **Highest**. Before any of it can be trusted in the
  revenue path it needs: the `NodeType` inconsistency resolved, a full test
  suite written from zero (there is none today), the file-merge/conflict
  layer built (exists in neither `graph/` nor `agent_registry/` today), and
  it fully replaces the orchestrator's execution path — the largest blast
  radius of any option.
- **Backward compatibility**: hard. `_try_recover_json`/`_find_success_output`
  assume the sequential single-step-per-`AgentType` shape; graph-based
  multi-node-per-stage execution doesn't fit that resume model without a
  dual-read/migration layer for builds in flight during a deploy.
- **Verdict**: architecturally closest to the product vision, but not
  credible as a near-term step given the package's current state (§1.3).

### Option B — Keep `orchestrator.py`'s sequential shape; dispatch each stage's work to specialists chosen via `task_router`

Keep the stage order (Architect → Business Model → Designer → Developer →
Integration → PM/debug) exactly as it is. Inside the **Developer** stage
specifically, replace the single `self.developer.generate_files(...)` call
with: run `task_router.route(project_id, blueprint_summary)` (or a
purpose-built decomposition over the blueprint) to get 2–4 `Assignment`s
(e.g. `react_engineer` → `frontend/**`, `api_engineer` → `backend/**`,
`database_engineer` → schema/migration files), partition file-path
responsibility up front so there's no write overlap, run the assignments
concurrently with `asyncio.gather`, and merge results into `files` by path
prefix. Each `Assignment.agent_id` becomes the `AgentStep.agent_profile_id`
— which the code already threads through `_start_agent`/`_complete_agent`,
just not populated by anything real today.

- **Reuses**: `task_router.route()`, `registry.get_or_create_agent()`,
  `record_task_result()` — all already imported into `orchestrator.py`,
  currently doing nothing but bookkeeping. Does not touch or depend on
  `backend/graph/` at all.
- **Effort/Risk**: **Lowest of the three.** Blast radius is one stage; the
  sequential envelope, resume, gate, and credit logic barely change; a
  single conditional gets you a full on/off flag.
- **Backward compatibility**: easiest — a specialist step can still be
  recorded under `AgentType.DEVELOPER` for resume-bucket purposes (role
  detail lives in `agent_profile_id`/step metadata only), so an in-flight
  build resumed mid-deploy behaves the same either way.
- **Cons**: hand-rolled per-stage concurrency, not a reusable scheduler; if
  you later want true cross-stage parallelism (e.g. Designer and early
  API-scaffolding overlapping) this shape doesn't give you that for free;
  path-partitioning is workable for typical web-app blueprints but fragile
  for genuinely cross-cutting single files (a defined tie-breaker or merge
  pass is needed before this scales past 2-3 specialists — see §6).
- **Verdict**: pragmatic, reversible, ships value without betting on
  `backend/graph/`'s fate.

### Option C — New, minimal, purpose-built dispatcher (not `backend/graph/`, not hand-rolled per stage)

A small (~200-300 line) new module, e.g. `core/specialist_dispatch.py`, that
takes a list of `PlanTask`/`Assignment` objects with `depends_on` edges and
runs them with bounded concurrency (`asyncio.Semaphore` + `gather`),
purpose-built for exactly the file-dict merge semantics a build needs — not
the generic HTTP/router/memory/validator node types `graph/` carries.

- **Reuses**: `agent_registry`'s `task_router`/`registry`/`ownership` fully;
  avoids `graph/`'s untested surface and internal inconsistency entirely.
- **Effort/Risk**: medium — between A and B. Still a new, unproven module
  going into the live pipeline, so it needs the same staged rollout care as
  Option A, just over a smaller/simpler piece of code.
- **Cons**: is substantively "rewrite the useful 20% of `graph/` from
  scratch" — duplicated investment risk if `backend/graph/` is later
  deliberately hardened and revived anyway.
- **Verdict**: reasonable if the team decides `backend/graph/` is not worth
  salvaging (§6) but still wants a reusable scheduler rather than bespoke
  per-stage code sooner rather than later.

---

## 4. Recommended approach

**Option B**, with Option C's dispatcher pattern kept in mind as a natural
Phase-4+ evolution *if* specialist splitting proves out and needs to
generalize beyond the Developer stage.

Justification:
- Smallest blast radius on the pipeline every paying build runs through.
- Maximizes reuse of `agent_registry` hooks `orchestrator.py` **already
  imports and calls today** (`_resolve_agent_profile`, `record_task_result`)
  — they just don't influence generation yet. Turning them from "logging
  only" into "actually drives which specialist runs" is a much smaller,
  more auditable change than adopting an entirely separate, untested
  execution engine.
- Does not require first fixing, testing, and reconciling an unrelated
  ~7,800-line orphaned package (`backend/graph/`) before shipping any real
  specialist-execution value.
- Independently reversible per-stage via a feature flag, with the existing
  monolithic `DeveloperAgent` path always available as a fallback.

`backend/graph/`'s disposition (harden into Option A later, or archive) is
deliberately **not** a prerequisite for this recommendation — it's called
out as an open question (§6) to resolve on its own timeline, informed by
whoever originally built it and why it was left unfinished/uncommitted.

---

## 5. Staged migration plan

Every phase below must ship with: a feature flag (checked live per-build,
not just at process boot — see the `ENABLE_LOOP_ENGINEERING`
pattern in `core/orchestrator.py:33` for precedent, but per-project/
per-user granularity is preferable to a single global env var — see §6),
a kill switch, and metrics comparing the new path's success/regen rate
against the existing monolithic path (the harness/`MetricsCollector` wiring
`orchestrator.py` already calls via `_evaluate_agent_output` can be reused
for this).

### Phase 0 — Prep, no pipeline behavior change
- Add real test coverage for the `agent_registry` code paths
  `orchestrator.py` is about to start depending on for real, not just
  logging: what happens if `get_or_create_agent` or `task_router.route`
  raises or misclassifies mid-build once its output actually drives
  generation (today these are best-effort, swallowed by `try/except` and
  invisible to build outcomes).
- Decide and implement the feature-flag mechanism (global env var vs.
  per-project DB flag — see §6) before any generation-path code lands.
- No changes to `core/orchestrator.py`, `backend/agents/*`, or
  `backend/graph/*` in this phase.

### Phase 1 — Prove the wiring off the paying build path
Route one narrow, low-stakes task type through a *real* specialist call —
deliberately **not** inside `orchestrator.run_build()` yet. Candidates:
- A background monitoring-finding auto-suggestion in
  `agent_registry/monitoring.py`, or
- A manual "ask the org to do X" command surfaced through
  `agent_registry/team_chat.py`,

that calls `task_router.route()`, resolves a real `AgentProfile`, and
actually generates something with a role-specific prompt (not just logs
it) — then calls `record_task_result` with the real outcome. This proves
end-to-end that a resolved `AgentProfile`'s role can meaningfully change
what gets generated, without any risk to a paying build. Fully reversible
by flag; no build behavior changes at all.

### Phase 2 — First touch of `core/orchestrator.py`, smallest possible slice
Introduce the specialist split for exactly one narrow case inside the
**Developer** stage — e.g. run one additional specialist (say
`api_engineer`) *alongside* the existing monolithic `DeveloperAgent` call
for blueprints with a clearly backend-only shape, behind the flag. The
monolithic `DeveloperAgent` output remains the source of truth; the
specialist call's output is compared/logged, not yet merged into `files` in
production traffic. If the flag is off, or the specialist call fails or
times out, behavior is byte-for-byte identical to today.
- Preserve resume semantics: keep specialist steps recorded under
  `AgentType.DEVELOPER` for `_try_recover_json`/`_find_success_output`
  bucketing purposes (role/agent detail lives only in `agent_profile_id`
  and step metadata) so an in-flight build resumed mid-deploy of this
  change doesn't break.
- Kill switch must be checkable mid-incident without a redeploy (a DB-backed
  flag `tasks/build_tasks.py`/`orchestrator.py` reads per build, not a
  process-start-time constant).

### Phase 3 — Real path-partitioned concurrent generation
Once Phase 2 has run long enough to trust the wiring: replace the single
`DeveloperAgent.generate_files()` call with 2-3 path-partitioned specialist
calls run concurrently via `asyncio.gather` (Option B, §3) for
flagged builds, merging into `files` by pre-agreed non-overlapping path
prefixes. Add `CodeOwnership.check_change()` as a **warning-only**
annotation surfaced in the `AGENT_OUTPUT` WS event (not a hard gate — per
`ownership.py`'s own stated design intent) so humans can observe
cross-owner touches accumulate before any hard gate is considered.

### Phase 4 — Harden and decide on generalization
After Phase 3 has run in production across enough builds to have real
success/regen-rate data:
- Consider extending `planning.py`'s `PlanTask.depends_on` computation
  (real code-structure-aware dependencies) if more than 2-3 specialists per
  build is desired.
- Consider hardening ownership from advisory to soft-block-with-override.
- **Only then** revisit whether `backend/graph/` (fixed, tested,
  reconciled) is worth adopting as a general-purpose scheduler underneath
  this, replacing the hand-rolled `asyncio.gather` groupings from Phase 3 —
  an explicit, separate decision, not a prerequisite for any earlier phase.

Rollback at every phase is "flip the flag" — no data migration is required
at any point, since `AgentStep.agent_profile_id` already exists on the
model and is purely additive.

---

## 6. Open questions for the team

1. **Flag granularity**: global env var (simple, but all-or-nothing across
   every customer at once) vs. per-project DB flag (safer gradual rollout,
   more plumbing) vs. per-user/plan-tier allowlist (e.g. beta/Enterprise
   customers first)? This should be settled before Phase 1.
2. **Cross-cutting file merge policy**: when two specialists both
   legitimately want to touch the same file (e.g. `backend/main.py` wanted
   by both `api_engineer` and `auth_engineer`), what's the resolution —
   further partition, a dedicated integration/merge pass, or serialize
   just those specific paths? Needs an explicit answer before Phase 3.
3. **`backend/graph/`'s disposition**: is it worth the investment to fix
   (reconcile the two `NodeType` systems, write tests, wire it up) and
   treat as the long-term substrate (Option A / Phase 4), or should it be
   archived/deleted to stop it confusing future readers, given it's
   uncommitted, untested, has zero callers, and its own architecture doc
   has an internal inconsistency? Whoever built it should weigh in on why
   it was left unfinished before a decision is made either way.
4. **Do specialists need genuinely different prompts/models per role**, or
   does Phase 2/3 start as the same underlying agent class instantiated
   multiple times with different path scopes (same "brain," partitioned
   responsibility) as a first cut? Materially changes Phase 2/3 effort.
5. **Credit accounting**: `settings.credits_developer` today is one flat
   charge per Developer stage, keyed by `AgentType`, not by number of
   underlying LLM calls. Once one stage becomes N specialist calls, is the
   total charge unchanged, or per-specialist? Product decision, not just
   engineering.
6. **Does `AgentProfile.level` (JUNIOR → MID → SENIOR → LEAD → PRINCIPAL,
   `agent_registry/registry.py`'s `PROMOTION_THRESHOLDS`) ever gate what an
   agent is allowed to do** once agents do real work (e.g. only SENIOR+
   allowed to touch architecturally-sensitive paths per
   `pr_workflow.ARCHITECTURALLY_SENSITIVE_PREFIXES`), or does it stay
   purely statistical/cosmetic indefinitely?
7. **Incident response for a corrupted specialist-generated build**: same
   PM-validation/debug-loop safety net as today, or does the specialist
   path need its own guardrail (e.g. auto-revert to monolithic
   `DeveloperAgent` output if PM validation fails repeatedly on a
   specialist-generated build)? Who owns on-call for this?
8. **Should specialist output eventually flow through `pr_workflow.py`'s
   `ChangeRequest`/stage-transition/review model** instead of writing
   straight into `files`, turning code review from advisory bookkeeping
   into a real part of the generation pipeline — and if so, is that in
   scope for the phases above or explicitly a later phase 5+?
