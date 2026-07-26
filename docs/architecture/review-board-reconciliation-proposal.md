# Reconciling `agent_registry`'s PR Workflow and the `orchestrator/` Review Board

Status: research/proposal, no code changed. Author: research pass over the repo as of this session.

A note on naming before anything else, because it tripped up the initial framing of
this task: **there are three, not two, systems in this repo with "agent"/"review" in
their name**, and they are all different:

1. `backend/agent_registry/` — the persistent per-project engineering org (this doc's subject).
2. `orchestrator/` — the standalone Review Board microservice (this doc's other subject).
3. `orchestration/` (note the different word) — a large, separate, older set of JSON
   reports, an `agent_runtime.py`, a `knowledge_service.py`, a `benchmark_runner.py`, and
   the `AGENT_CONTRACT.md` file. This is **not** part of either system compared below. It
   was named in this task's background as if it might live inside `orchestrator/`; it
   doesn't — `orchestrator/` has no `AGENT_CONTRACT.md` and no relationship to
   `orchestration/`'s code. I did not investigate `orchestration/` further since it's out
   of scope, but its existence is itself a data point: this repo already has a history of
   parallel, similarly-named "agent org" scaffolding, which is relevant context for a
   reconciliation decision (see Open Questions).

There is also `backend/core/orchestrator.py`, a third distinct thing again — the build
pipeline orchestrator that runs the actual code-generation agents (DeveloperAgent,
Debugger, etc.) for a project. It is **not** the `orchestrator/` Review Board. It does,
however, directly call into `backend/agent_registry` (see below), which is the one real
piece of cross-system wiring that exists today.

---

## 1. What each system actually does today

### 1.1 `backend/agent_registry/` — the persistent engineering org

Read via `__init__.py`, `pr_workflow.py`, and `ownership.py` in full; `models.py`,
`registry.py`, `team_chat.py`, and `monitoring.py` in full as well (they were small
enough and directly load-bearing for the review-flow question).

**Core entity: `AgentProfile`** (`models.py`). A persistent, named "employee" per
project: `id`, `project_id`, `role`, `department`, `display_name`, `level`
(junior→mid→senior→lead→principal), `status` (active/idle/retired), `owned_paths`
(accumulated from real work), `strengths`/`weaknesses` (derived from rolling success
rate once ≥5 tasks), `stats` (tasks completed/failed, success rate, tokens, cost,
review scores), and an append-only `decision_log`. `AgentRegistry`
(`registry.py`) seeds a default org per project (CTO/PM/Tech Lead/Architect +
departments), dynamically creates specialist agents on demand
(`get_or_create_agent`), records task outcomes (`record_task_result` — this is what
grows `owned_paths` and stats over time), and handles promotion (with a hard CTO
sign-off gate for LEAD/PRINCIPAL) and retirement.

**`ownership.py` — `CodeOwnership`.** A pure reverse-lookup over
`AgentProfile.owned_paths`: "who owns this file," "does this changeset cross into
someone else's territory" (`check_change` → `owned_by_you` / `unclaimed` /
`owned_by_other`), and a per-agent ownership summary. The module's own docstring is
explicit that this is **advisory only, not a gate**: the build pipeline currently runs
one DeveloperAgent (plus a Debugger patching its own output) over the whole generated
app, so a hard block on "someone else touched this file" would misfire on legitimate
debug-loop patches. It says outright that `check_change` is "the primitive a PR
workflow would call to gate merges" once execution is actually split across
specialists — i.e., this is forward-looking scaffolding, not an enforced policy today.

**`pr_workflow.py` — `PRWorkflow` / `ChangeRequest`.** Models the *lifecycle* of a
proposed changeset through named stages: `planning → implementing → self_review →
peer_review → qa → security_review → performance_review → approved → merged`, with
`rejected` reachable from any non-terminal stage. Critically, **this is a lifecycle/
state-machine and logging layer, not a review-execution engine**:
- `open()` creates a `ChangeRequest`, auto-suggests reviewers by asking
  `CodeOwnership.check_change` who owns the touched paths, and — if any touched path
  starts with one of `ARCHITECTURALLY_SENSITIVE_PREFIXES` (`backend/core/`,
  `backend/agent_registry/`, `backend/api/`) — also suggests the project's architect,
  regardless of ownership. It can optionally be tied to an approved `Plan`
  (`plan_id`), and rejects (`PlanNotApproved`) if the plan isn't in `APPROVED` status.
- `advance()` moves the request forward through `STAGE_ORDER`, refusing backward or
  sideways moves; every transition is logged to `TeamChat` and broadcast over a
  project WebSocket (`OrgEvent`/`org_ws_manager`).
- `request_review()` / `submit_review()` post typed messages
  (`REVIEW_REQUEST`/`APPROVAL`/`REJECTION`) to `TeamChat` and append a
  `ReviewDecision{reviewer_agent_id, approved, comment}` to the change request.
- **There is no LLM call, no automated judgment, and no actual diff/code inspection
  anywhere in this file.** `approved: bool` and `comment: str` are supplied entirely
  by the caller — whatever human or process invokes `submit_review`. The "review" is
  a data structure that gets filled in by someone else's decision, not a decision
  `pr_workflow.py` itself produces.
- `merge()` requires `stage == APPROVED` and zero pending reviewers, then flips the
  stage to `MERGED`. No git operations occur anywhere — the module's own docstring
  says so explicitly ("This models the lifecycle, not git itself").

**`team_chat.py`** — persistent, typed (comment/question/review_request/approval/
rejection/escalation/delegation/finding), threaded messages between real
`AgentProfile`s (and implicitly humans acting through the API), stored in Mongo, with
best-effort WebSocket fan-out. `pr_workflow.py` and `monitoring.py` both write into it.

**`monitoring.py`** — intake for repository health signals (CI failures, security
issues, perf regressions, dependency updates, tech debt, dead code, etc.).
`record_finding()` persists a `MonitoringFinding`; HIGH/CRITICAL severity
auto-escalates by routing through `TaskRouter` to the responsible specialist and
**opening a `ChangeRequest` on their behalf** via `PRWorkflow.open()`. This is the one
place inside `agent_registry` itself where something automatically drives the PR
workflow, but the docstring is explicit that real integrations (GitHub/CI webhooks)
are out of scope — this module is "the plumbing such integrations plug into later."
No such integration exists in the repo today (no webhook handlers calling
`record_finding` were found beyond `backend/api/monitoring_webhook.py`, which is
worth a closer look in a follow-up but wasn't required reading here).

**Live wiring (confirmed):**
- `backend/api/agent_registry.py` exposes the full surface — org chart, agents,
  ownership, chat, change requests (open/advance/request-review/submit-review/merge),
  monitoring findings, and a WebSocket — all under
  `/projects/{project_id}/org/...`, and is included in the main API router
  (`backend/api/v1.py`: `v1_router.include_router(agent_registry_router)`).
- `backend/core/orchestrator.py` (the build pipeline, distinct from `orchestrator/`)
  imports `get_agent_registry` and calls `record_task_result()` on both the
  success and failure paths, and `get_or_create_agent()` to resolve the profile for
  each build-pipeline `AgentType`. This is real, load-bearing integration — it's how
  `owned_paths` and performance stats actually accumulate.
- The frontend has a dedicated page, `frontend/src/pages/EngineeringOrgPage.tsx`,
  that renders the org chart and a full change-request UI: stage badges, an "advance
  stage" selector, "request review" (pick a reviewer agent), "submit review"
  (approve/reject checkbox + comment box, filled in by a human at the keyboard), and
  "merge." **This confirms the review step is human-in-the-loop by design in the
  current UI** — nothing here calls an LLM to produce the approval.

### 1.2 `orchestrator/` — the standalone Review Board

Read in full: `README.md`, `models.py`, `loader.py`, `context.py` (skimmed, but the
trigger-matching logic was read), `runner.py`, `consolidator.py`, `service.py`,
`api.py`, `main.py`, `config.py`, `store.py`, plus the one file in `agents/` at the
repo root (`security_engineer.json` — see the naming note below).

This is a **separate FastAPI microservice**, not a module imported by the main
backend. It has its own `main.py` (`uvicorn orchestrator.main:app --port 8100`), own
`Dockerfile`, own `requirements.txt`, own settings (`config.py`, env-prefixed,
completely independent of `backend/core/config`), and — critically — **its own MongoDB
connection to a different database** (`mongodb_db: str = "forge_review"` by default,
via its own `store.py`/`get_db()`, unrelated to `backend/core/database.get_db()`).
There is no shared auth: `orchestrator/api.py` has no `get_current_user` dependency at
all, unlike every route in `backend/api/agent_registry.py`.

**What it reviews:** a *repo snapshot on disk* (`repo_path`, a local directory the
service assumes is already present — it does not clone or fetch), either as a **full
audit** (every file matching a trigger) or a **diff review** (a unified `git diff`
string supplied in the request body — only the changed files' triggers fire). It is
explicitly read-only: "This system NEVER edits files, opens PRs, or deploys" is stated
in both the README and the `service.py` docstring, and confirmed by the code — nowhere
in `runner.py`/`consolidator.py`/`service.py` is there a write to the target repo.

**Reviewer definitions: `AgentConfig`** (`models.py`, loaded by `loader.py`). Static
JSON files, **one per reviewer role, not per project** — `id`, `stage` (an int used
only for sort order and reporting, not sequencing/gating), `model` (e.g.
`claude-haiku-4-5-20251001`), `system_prompt`, `triggers` (gitignore-style globs;
empty list = always runs), and a free-text `output_schema` shown to the model as a
formatting hint (not structurally enforced — output is parsed defensively, stripping
markdown fences and falling back to the first balanced `{...}` span). `loader.py`
fails loudly on a missing directory, empty directory, invalid JSON, schema violation,
or duplicate id. **Today there is exactly one agent definition in the repo**:
`./agents/security_engineer.json` (a security reviewer, stage 4, triggers on `*.py`,
`**/auth/**`, `**/api/**`, `**/*.env*`, `**/security*.py`). The README documents
"zero code changes to add an agent" as an explicit acceptance criterion, but as
shipped this is a single-reviewer panel, not the multi-specialist "review board" the
name evokes.

**Naming trap #2:** the agents directory is `./agents/` at the **repo root**
(resolved by `loader.py: _repo_root() / "agents"`, i.e. `orchestrator/`'s parent), not
`orchestrator/agents/`. It's easy to go looking inside `orchestrator/` and not find it.

**Execution flow (`service.execute_review`, called from a FastAPI `BackgroundTasks`
job kicked off by `POST /reviews`):** `load_agents()` → compute candidate files
(`context.candidate_files`, full-repo walk or diff-parsed) → `select_triggered_agents`
(each `AgentConfig` paired with the subset of candidate files matching its globs) →
`run_agents` fans them out concurrently under an `asyncio.Semaphore` (default
concurrency 5), each with retry-with-backoff on transient errors
(`providers.TRANSIENT_ERRORS`) and a hard failure isolation guarantee — **any single
agent that raises is captured as `AgentReport(status="failed", error=...)` and the run
still proceeds** with the rest. Each successful agent call returns a `score` (0–10)
and a list of `Issue{severity, title, description, fix, files}`.

`consolidator.consolidate()` is the one place actual synthesis happens: a **single
high-tier "CTO" model call** (`claude-sonnet-4-6` by default) is given all successful
agent reports as JSON and asked to deduplicate issues and return one
`ConsolidatedReport{overall_score, recommendation: GO|NO_GO|GO_WITH_FIXES, summary,
deduplicated_issues, top_10_critical, top_25_improvements}`. If there are zero
successful reports, or the consolidator call itself fails or returns unparseable
JSON, a deterministic fallback (`_fallback_consolidation`) computes the same shape
without a model call — any critical issue forces `NO_GO`, otherwise
`GO_WITH_FIXES`/`GO` based on whether any issues exist. **This — a single automated
judgment call that produces a genuine go/no-go decision from LLM analysis of the
actual code — is the one piece of real "review verdict" logic in either system.**
`agent_registry.pr_workflow` has nothing structurally equivalent; its "approved"
boolean is just whatever the caller passes in.

Results persist as a `ReviewRun` (per-agent reports, the consolidated report, cost/
token totals, `candidate_files`, `triggered_agents`) and a derived, sortable
`BacklogItem` list (severity/effort/impact, deduplicated by `(severity, title)`) in
the `forge_review` database — a genuine prioritized-backlog artifact, distinct from
anything `agent_registry` produces.

**API surface:** `POST /reviews` (kick off, returns `run_id` immediately, 202),
`GET /reviews`, `GET /reviews/{run_id}` (status + full results), `GET
/reviews/{run_id}/backlog?sort_by=severity|impact`, and `WS
/reviews/{run_id}/stream` (live progress: `run_started`, `agent_started`,
`agent_done` per agent, `consolidating`, `complete`/`error`, replaying missed history
to late subscribers).

**Live wiring (confirmed, and this is the most important correction to the task's
framing):** the Review Board is **not dormant**. It is:
- Deployed as its own service in `docker-compose.yml` (port 8100, its own Mongo/Redis
  env, healthcheck-gated startup) and in `k8s/orchestrator.yaml` (a real `Deployment`
  with 2–10 replicas, an HPA on CPU/memory, liveness/readiness probes against
  `/health`, a non-root `securityContext`).
- Called directly from the frontend: `frontend/src/lib/orchestratorApi.ts` is an
  axios client pointed at `VITE_ORCHESTRATOR_URL` (its own env var, defaulting to
  `http://localhost:8100`, i.e. a genuinely separate origin from the main backend's
  `VITE_API_URL`) with **no shared auth**, backing two dedicated pages —
  `frontend/src/pages/reviews/ReviewsListPage.tsx` and `ReviewDetailPage.tsx` — plus a
  `useReviewSocket.ts` hook for the live WebSocket stream, all reachable from
  `frontend/src/App.tsx`.
- Nowhere is it invoked from within `backend/` (no Python import of `orchestrator.*`
  outside `orchestrator/` itself, no HTTP client in `backend/` calling port 8100).
  It is reached exclusively by a human driving the frontend UI directly against it.

So: **live, but siloed** — a fully separate product surface with its own deploy
topology, database, and frontend pages, connected to nothing else in the platform.
There is no code path today that lets `agent_registry`'s `ChangeRequest` flow trigger
an `orchestrator/` review run, or vice versa.

---

## 2. Where they genuinely overlap

Being precise, because the names ("review," "reviewer," "agents") suggest more overlap
than the code actually has:

- **Both produce a persisted "review" record with reviewer-level findings and an
  overall verdict.** `ChangeRequest.reviews: List[ReviewDecision]` +
  `ChangeRequest.stage` vs. `ReviewRun.agent_reports: List[AgentReport]` +
  `ReviewRun.consolidated.recommendation`. Structurally similar shape (list of
  per-reviewer entries + one rolled-up outcome).
- **Both have a notion of "reviewers with a scope."** `agent_registry`'s
  `CodeOwnership` scopes reviewers by *empirically observed file ownership*;
  `orchestrator`'s `AgentConfig.triggers` scopes reviewers by *static glob pattern*.
  Different mechanism, same intent: "not every reviewer looks at everything."
  `ARCHITECTURALLY_SENSITIVE_PREFIXES` (agent_registry, hardcoded 3 path prefixes) and
  `triggers` (orchestrator, per-agent glob lists, data-driven) are the same idea —
  "always route certain paths to a specific reviewer" — implemented completely
  independently in the two systems.
- **Both relate to a changeset.** `agent_registry.ChangeRequest.changed_paths` and
  `orchestrator`'s diff-mode `diff`/candidate-file set are the same underlying concept
  (a set of files under review), though one is a list of path strings the caller
  supplies and the other is derived by parsing an actual unified diff.
- **Both escalate findings into actionable work.** `monitoring.py`'s auto-escalation
  (HIGH/CRITICAL finding → open a `ChangeRequest`) and `orchestrator`'s backlog
  (`BacklogItem`, prioritized by severity/impact) are structurally the same job:
  turning a raw finding into something a human/agent will act on. They just feed
  different downstream systems (a workflow stage machine vs. a sortable list).

That's genuinely it. Everything else that "sounds" similar is actually different:

- **"Reviewers" are not the same kind of thing.** `agent_registry.AgentProfile` is a
  persistent, stateful, project-scoped entity that accumulates performance history
  and can be promoted/retired. `orchestrator.AgentConfig` is a stateless, global
  (not project-scoped), version-controlled JSON config with no persistence, no
  history, no identity beyond a string `id`. Loading `security_engineer.json` twice
  in two different `orchestrator` review runs does not produce "the same reviewer
  remembering the last review" the way `AgentProfile.stats` would. **They are not
  interchangeable representations of the same underlying concept** — one is an
  in-world persistent character, the other is a prompt template.
- **"Review" means different things.** In `pr_workflow.py`, "review" = a human (or
  unspecified external caller) manually asserting approve/reject through an API call;
  the module does no analysis. In `orchestrator`, "review" = an LLM actually reading
  code and generating the verdict. Conflating these as "the same review flow, just
  implemented twice" would be a mistake — `agent_registry` doesn't have an automated
  review flow to consolidate with `orchestrator`'s; it has no automated review flow
  at all.
- **Scope differs by an order of magnitude.** `agent_registry` is per-project,
  persistent, multi-purpose (org chart, chat, planning, monitoring, ownership, PR
  lifecycle all interlinked). `orchestrator` is a single-purpose, stateless-between-
  runs audit tool against an arbitrary local directory that isn't even required to be
  a Forge project (`repo_path` is just a filesystem path; there's no `project_id`
  field anywhere in `orchestrator/models.py`).
- **Deployment/lifecycle differ.** `agent_registry` lives inside the monolith
  backend process; `orchestrator` is an independently scaled microservice with its own
  database, its own auth posture (none), and its own frontend surface.

---

## 3. Where they differ (summary table)

| | `agent_registry.pr_workflow` | `orchestrator/` (Review Board) |
|---|---|---|
| **Process** | In-process module of the main `backend` | Standalone FastAPI service, own Docker image, own k8s Deployment |
| **Scope** | Per-project (`project_id` on everything) | Per-repo-snapshot (`repo_path`, no project concept) |
| **Database** | Main backend Mongo (via `core.database.get_db`) | Separate Mongo db (`forge_review`, own connection) |
| **Auth** | Every route behind `get_current_user` + project-access check | None (`orchestrator/api.py` has no auth dependency) |
| **Reviewer identity** | `AgentProfile` — persistent, stateful, leveled, promotable | `AgentConfig` — stateless JSON config, no persistence |
| **How many reviewers exist today** | Whatever the default org seeds + dynamically created specialists (multiple, project-scoped) | Exactly one (`security_engineer.json`), global |
| **Who produces the verdict** | Whoever calls `submit_review` (human via UI today) | An LLM ("CTO" consolidator model), with deterministic fallback |
| **What triggers a review** | `ChangeRequest.open()` / `request_review()`, driven by UI clicks | `POST /reviews`, driven by UI form or curl |
| **Output artifact** | `ChangeRequest` state machine + `TeamChat` log | `ReviewRun` + sortable `BacklogItem` list |
| **Git awareness** | None — explicitly "not git itself" | Consumes a real unified diff in diff mode |
| **Write access to code** | None (workflow only) | None (explicitly read-only by design) |
| **Live today?** | Yes — main app, `EngineeringOrgPage.tsx` | Yes — separate service, `ReviewsListPage`/`ReviewDetailPage` |
| **Connected to each other?** | No | No |

---

## 4. Reconciliation options

**(a) Keep them fully separate, but document the boundary explicitly.**
Treat `agent_registry.pr_workflow` as the *governance/lifecycle* layer (who's
accountable, what stage is this in, who signed off) and `orchestrator/` as an
*analysis tool* (an automated opinion a human or the workflow can optionally consult).
This is close to a no-op relative to today, but with the naming/scope confusion
documented so nobody assumes they already talk to each other.
- *Pros:* Zero risk, zero engineering cost, respects that they were built for
  different purposes (per-project persistent org vs. arbitrary-repo audit tool) and
  currently serve different audiences (in-product team workflow vs. a standalone
  power-user page).
- *Cons:* Leaves real, user-visible redundancy — two "review" concepts, two "reviewer
  roster" concepts, two frontend surfaces — with no path to convergence. A future
  engineer will keep re-asking this same question. The security_engineer reviewer
  literally never talks to the `ChangeRequest` a real code change is tracked under.

**(b) `pr_workflow.py` calls out to `orchestrator/` as its review-execution backend.**
When a `ChangeRequest` enters a review stage (`peer_review`/`security_review`/
`performance_review`), `PRWorkflow` (or a new orchestration layer above it) triggers a
`POST /reviews` diff-mode run against the changed paths, waits for/polls the result,
and uses `ConsolidatedReport.recommendation` to auto-file a `ReviewDecision` (e.g.
`GO` → auto-approve, `NO_GO` → auto-reject with the summary as `comment`,
`GO_WITH_FIXES` → leave pending for human judgment). This is the most literal reading
of "these should be the same review," and gives `agent_registry` what it's currently
missing entirely: automated review content.
- *Pros:* Closes the most real gap identified above — right now `submit_review`'s
  `approved` boolean has no automated backing at all. Reuses real working LLM-review
  code instead of building it twice. Keeps `orchestrator`'s read-only guarantee intact
  (it never needs write access; `pr_workflow` still owns state transitions).
- *Cons:* Couples a request inside the main backend to an external service with no
  shared auth today (would need a service-to-service credential, not just reusing
  `get_current_user`), a different database, and its own deploy/scaling lifecycle —
  meaningful new failure mode and operational surface (timeouts, partial availability,
  cost attribution now spans two billing paths). `orchestrator` currently reviews an
  arbitrary `repo_path` on disk, not "the diff for change request X in project Y" —
  someone has to materialize that changeset to a filesystem path the orchestrator
  process can read, which doesn't exist today (no such glue code was found). Also only
  one reviewer (`security_engineer`) currently exists, so the initial payoff is
  narrow until more `agents/*.json` are authored.

**(c) Migrate `orchestrator`'s `AgentConfig` reviewer definitions into real
`AgentProfile` records in `agent_registry`, so there is one source of truth for "who
are our agents."** Concretely: seed a project's org (or a shared "review board"
department) with `AgentProfile`s whose `role` mirrors each `agents/*.json` id, giving
each a durable identity, `stats`, and a place in the org chart — and have
`orchestrator`'s runner resolve `model`/`system_prompt`/`triggers` from that record
(or a project-scoped version of it) instead of a static JSON file.
- *Pros:* Genuinely unifies "who are our agents" — today the platform literally has
  two disjoint agent rosters, one persistent, one config-file-based, with zero
  overlap even in naming. This also lets review-agent performance feed the same
  promotion/strength-weakness mechanics as build-pipeline agents.
- *Cons:* This is the most invasive option. `AgentConfig` is deliberately *not*
  project-scoped (one global roster of reviewers usable against any `repo_path`,
  including repos that aren't Forge projects at all) — folding it into a per-project
  `AgentProfile` model would either lose that generality or require inventing a
  "global" pseudo-project, which doesn't exist in `agent_registry`'s data model today
  (`AgentProfile.project_id` is required). It also breaks the stated "drop a JSON
  file, zero code changes" acceptance criterion the orchestrator README calls out
  explicitly as a design goal — `AgentProfile` creation currently goes through
  `AgentRegistry.get_or_create_agent`, an API/DB write, not a file drop.

**(d) Merge the frontend surfaces without merging the backends (thin unification).**
Keep both services as-is, but surface `orchestrator/` review runs *inside*
`EngineeringOrgPage.tsx` as a read-only "automated findings" panel attached to a
`ChangeRequest` (calling `orchestratorApi` from the existing project page, matched by
touched paths rather than by any real ID linkage), without wiring the backends
together at all.
- *Pros:* Cheapest way to make the overlap feel resolved to a human user — "I opened a
  change request, and I can see an automated review's opinion right there" — with no
  new inter-service coupling, no auth bridging, no shared data model changes.
- *Cons:* Cosmetic. Doesn't address that `pr_workflow`'s "review" still has zero
  automated backing; a user could easily read a green `orchestrator` panel as "this
  was approved" when nothing actually recorded a `ReviewDecision`. Risks making the
  disconnect *harder* to notice later, not easier.

---

## 5. Recommendation

**Option (b), scoped narrowly, is the one I'd pursue — but only as a proof of concept
against a single review stage (`security_review`, since that's the one reviewer that
already exists), not a full replacement of the human review flow.**

Reasoning: the single largest, most concrete gap this research surfaced is that
`agent_registry.pr_workflow`'s "review" step currently has **no automated content
behind it at all** — it's a bool and a comment, supplied entirely by whoever calls the
API. `orchestrator/` already has a working, tested, deployed system that produces
exactly that kind of judgment from actual code analysis. Wiring `security_review`
specifically (not `peer_review`, not `performance_review` — there's no orchestrator
agent for those yet) to call the existing `security_engineer` reviewer is a small,
well-scoped slice: one stage, one existing agent, one existing service, no new agent
authoring required, and no changes to either system's core code (`orchestrator/` stays
read-only and untouched; `agent_registry` gains a caller, not a rewrite of
`pr_workflow.py`'s state machine).

Option (c) is the more "correct" long-term architecture in the sense of "one roster of
agents," but it's premature: it requires resolving a real modeling tension
(project-scoped vs. global agents) that doesn't have an obvious answer yet, and
there's only one `orchestrator` agent defined today, so the payoff doesn't yet justify
migrating a whole config format. Revisit (c) once/if `orchestrator`'s roster grows
past one or two agents, since the coordination cost of two rosters grows with roster
size, not review-run count.

Option (a) (fully separate) is the safe fallback if the auth/deployment coupling in
(b) turns out to be more expensive than it looks once someone scopes it for real —
worth stating plainly since I haven't verified what it'd take to give `orchestrator`
a service credential or how the main backend would materialize a `ChangeRequest`'s
diff to a filesystem path the orchestrator process can read (no such diff-materialization
code exists anywhere in the repo today; this is a real gap in option (b), not just an
operational footnote).

**What pursuing (b) would involve, in prose (not implemented here):**
1. A small adapter — could live in `agent_registry` or as new glue code, not inside
   `orchestrator/` — that, given a `ChangeRequest`'s `project_id` and
   `changed_paths`, materializes a diff (or a checked-out snapshot) somewhere
   `orchestrator`'s `repo_path` can read, and calls `POST /reviews` in diff mode.
2. A way to poll (or subscribe to `orchestrator`'s WebSocket) for run completion
   without blocking the `advance()`/`submit_review()` request — likely a background
   task or a webhook-style callback from `orchestrator` back into
   `backend/api/agent_registry.py`, which doesn't exist today in either direction.
3. A decision rule mapping `ConsolidatedReport.recommendation` to a `ReviewDecision`
   (e.g. auto-post a `submit_review` call from a synthetic "security_engineer"
   `AgentProfile`, or leave it as a `TeamChat` `FINDING` message for a human to act
   on rather than auto-approving/rejecting — the safer starting choice, given
   `orchestrator`'s consolidator can itself fail into a conservative fallback).
4. Resolving the auth gap: either a service-to-service token `agent_registry` presents
   to `orchestrator`, or (simpler, since `orchestrator` currently has no auth at all)
   restricting `orchestrator`'s network exposure so only the backend can reach it,
   and letting the frontend's direct `orchestratorApi` calls continue as they are
   today for the standalone Review Board page.
5. Explicitly *not* touching `orchestrator`'s read-only guarantee, its independent
   deployability, or `pr_workflow.py`'s stage machine — this is additive glue, not a
   merge of the two systems.

---

## 6. Open questions for the user

1. **Is the standalone Review Board (`orchestrator/` + its frontend pages) meant to
   stay a general-purpose, non-Forge-project-scoped audit tool** (its current design:
   review *any* `repo_path`, not just Forge projects), **or should it become
   Forge-project-scoped** as part of any reconciliation? This materially changes which
   option is right — (c) only makes sense if the answer is "it should become
   project-scoped."
2. Should `orchestrator`'s currently-open network exposure (no auth on `orchestrator/api.py`,
   reachable directly from the frontend at its own origin) be tightened regardless of
   which reconciliation option is chosen? That's a pre-existing gap independent of this
   task, but it's directly relevant to option (b)'s "service-to-service call" design.
3. Is `orchestration/` (the third, differently-named system with `AGENT_CONTRACT.md`,
   `agent_runtime.py`, `knowledge_service.py`, etc.) dead, actively used elsewhere, or
   a predecessor of one of these two systems? It wasn't in scope for this research pass,
   but given it shares vocabulary and apparent intent with both systems compared here,
   any reconciliation plan should account for whether it's a third thing to eventually
   fold in, or something to formally retire so it stops adding to the confusion.
4. Is a single `security_engineer.json` genuinely the extent of the "review board"
   today, or are more agent definitions expected soon? The recommendation above
   assumes the roster stays small for now; a larger imminent roster would strengthen
   the case for option (c) sooner rather than later.
5. Does anyone currently use the standalone Review Board frontend pages
   (`ReviewsListPage`/`ReviewDetailPage`) in practice, or were they built but never
   adopted? This research confirmed they're wired up and deployable, not whether
   they're actually used — that's a product/usage question this repo pass can't
   answer from code alone.
