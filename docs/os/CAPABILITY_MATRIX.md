# Forge OS capability matrix

Every existing feature, page and panel, mapped to a capability the OS can open on demand. The
machine-readable seed is [`shared/os-schemas/capability-index.json`](../../shared/os-schemas/capability-index.json);
`frontend/src/os/contracts.test.ts` fails if a route in `frontend/src/App.tsx` is not covered by it.
WS-D turns each row into a full `CapabilityDescriptor` (`frontend/src/os/contracts.ts`).

**Rule: hide complexity, not functionality.** Nothing below is removed. Every row is reachable from
the command palette (⌘K) and the capability library, and every row with a legacy route keeps that
route working (deep links, bookmarks, tests).

## Legend

- **Capability**: id (`CapabilityDescriptor.id`). ⚙︎ = backend API exists but no UI today; ✦ = new for the OS.
- **Intent**: what a prompt sounds like when this capability is the answer. The planner maps it to an `IntentKind`.
- **Perms**: `Permission` values checked server-side (`auth` = signed in). Project-scoped rows also require
  project access (`core/permissions.has_project_access`).
- **Actions**: `CapabilityAction` ids. Destructive actions (delete, revoke, cancel, reject, downgrade, rollback) are
  `requires_confirmation: true` and are never executed from a generated surface without an explicit user click.
- **I/O**: sketch of `input_schema -> output_schema`.
- **Surfaces**: default first, then other allowed `SurfacePresentationKind`s.
- **APIs**: existing backend bindings (`ApiBinding`). Paths are shown under `/v1` where the router is mounted there.
- **Persist**: `PersistenceRule`: `server` (feature's own collections stay the source of truth), `session`,
  `workspace`, `ephemeral`.
- **Reach**: P = prompt, K = palette, L = library, D = deep link (legacy routes listed). All rows are P/K/L.

## Intent to presentation (owner examples)

| Prompt | IntentKind | Capability | Presentation |
|---|---|---|---|
| "Build me a site for my bakery" | build_website | build.new, then build.preview + build.code + build.deploy | window group (preview focused) |
| "Chart revenue by region" + CSV | analyze_data | data.analyze | window: Chart + DataTable + FilterBar |
| "Create an agent that triages bugs" | create_agent | agents.create | window: AgentConfigForm |
| "Design an onboarding workflow" | design_workflow | workflow.design | fullscreen: WorkflowCanvas |
| "Compare Claude and GPT for coding" | compare_models | models.compare | window: ComparisonTable |
| "Show my projects" | manage_projects | projects.manage | window (legacy page in a window) |
| "How's run 42 going?" | monitor_run | agents.kernel_run | panel: ExecutionTimeline (live AG-UI) |
| "Approve the prod deploy" | approve_gate | governance.approvals | inline: ApprovalCard |
| "Tell me a joke" | chat | chat.answer | text only |

## OS shell and system

| Capability | Intent | Perms | Actions | I/O | Surfaces | APIs | Persist | Reach |
|---|---|---|---|---|---|---|---|---|
| `chat.answer` ✦<br>Answer in plain text | Small talk, questions, jokes, explanations: anything with no better capability | auth | answer | prompt -> markdown text | **inline** | `POST /v1/os/sessions/{id}/turns` (new, WS-C) via AIGateway | session | P K L |
| `system.capability_library` ✦<br>Capability library | "What can you do?", "show me everything"; ⌘K and the library button | auth | search, open, pin | query -> CapabilityDescriptor[] filtered by permission/plan | **panel**, window | `GET /v1/os/capabilities` (new) | workspace (pins) | P K L |
| `system.sessions` ✦<br>Conversations and history | "Show my past conversations", reopen a session | auth | list, open, rename, pin, archive, delete | -> SessionSummary[]; open -> messages + StoredSurface[] | **panel** | `GET/PATCH/DELETE /v1/os/sessions[/{id}]` (new) | server | P K L |
| `system.notifications`<br>Notifications | "Any notifications?"; bell in the shell header | auth | list, mark read | -> notification[] | **panel** | `GET /v1/growth/notifications`, `POST /v1/growth/notifications/{id}/read` | server | P K L |

## Build, projects and studio

| Capability | Intent | Perms | Actions | I/O | Surfaces | APIs | Persist | Reach |
|---|---|---|---|---|---|---|---|---|
| `build.new`<br>New build | "Build me a website/app for…" with no project yet | auth, kernel:run | describe, start build | prompt, template? -> project_id, build_id | **fullscreen**, window | `POST /v1/projects/`, `POST /v1/builds/` | server | P K L D: `/launch` |
| `build.workspace`<br>Build workspace (project) | "Open the workspace", "continue building X"; composite of preview + code + debug + deploy | project:read; project:write to edit | open, run build, gate decision | project_id -> build state stream | **fullscreen**, window | `GET /v1/projects/{id}`, `POST /v1/builds/`, `GET /v1/builds/{id}`, `WS /v1/builds/ws/{build_id}`, `POST /v1/builds/{id}/gate` | server (+ workspace layout) | P K L D: `/p/:projectId`, `/p/:projectId/workspace`, `/workspace`, `/build/:projectId` |
| `build.preview`<br>Live preview (project) | Website build turn: live preview of the current build | project:read | refresh, open in tab | project_id, build_id? -> sandboxed preview iframe | **window**, panel, fullscreen | `GET /v1/builds/{id}/files` (preview runtime, `lib/previewRuntime.ts`) | ephemeral | P K L |
| `build.code`<br>Code view (project) | "Show me the code", diff of generated files | project:read | open file, copy | build_id, path? -> files / diff | **window**, panel | `GET /v1/builds/{id}/files` | ephemeral | P K L |
| `build.debug`<br>Debug console (project) | "Why did the build fail?" | project:read | view logs, retry | build_id -> agent log stream | **panel**, window | `WS /v1/builds/ws/{build_id}` | ephemeral | P K L |
| `build.deploy`<br>Deploy (project) | "Deploy it", "what's the URL?", custom domain, env vars | deploy | deploy, redeploy, delete, set env vars, set domain, push to GitHub | project_id, build_id, target -> deployment {status, url} | **panel**, window | `POST/GET /v1/deployments/`, `/{id}/redeploy`, `/{id}/env-vars`, `/{id}/domain`, `/{id}/logs`, `/{id}/url`, `POST /v1/deployments/github/push` | server | P K L |
| `build.files`<br>Files (project) | "Show the project files" | project:read | browse, open, download | project_id -> file tree | **window**, panel | `GET /v1/builds/{id}/files` | server | P K L D: `/p/:projectId/files`, `/files` |
| `build.history`<br>Build history and rollback (project) | "Show build history", "roll back to v3" | project:read; project:write for rollback | list builds, compare, rollback | project_id -> build[]; rollback(version) | **window**, fullscreen | `GET /v1/projects/{id}/builds`, `POST /v1/builds/{id}/rollback/{version}` | server | P K L D: `/p/:projectId/history`, `/history`, `/project/:projectId` |
| `projects.manage`<br>Projects | "Show my projects", "import my repo", "delete project X" | auth; project:write for mutations | list, create, import repo, rename, open, delete (confirm) | filters -> Project[] | **window**, panel, fullscreen | `GET/POST /v1/projects/`, `PUT/DELETE /v1/projects/{id}`, `POST /v1/repos/import` | server | P K L D: `/projects` |
| `projects.settings`<br>Project settings (project) | "Project settings", integrations for this project | project:write | update settings | project_id -> settings | **panel**, window | `PUT /v1/projects/{id}` | server | P K L D: `/p/:projectId/settings` |
| `studio.spatial`<br>3D spatial studio | "Open the 3D studio" | auth | orbit, change finish | -> 3D scene | **fullscreen** | none (client-only) | device-local | P K L D: `/studio-3d` |

## Agents, skills and workflows

| Capability | Intent | Perms | Actions | I/O | Surfaces | APIs | Persist | Reach |
|---|---|---|---|---|---|---|---|---|
| `fleet.overview`<br>Fleet overview | "How are my agents doing?", "what's running?" (former Command Center dashboard, now on demand) | auth | open run, decide gate | -> fleet summary {runs, gates, costs} | **window**, panel, inline (summary) | `GET /v1/command-center/summary`, kernel gate approve/reject | server | P K L D: `/command` |
| `fleet.agent_graph`<br>Agent fleet graph | "Show the agent fleet graph" | auth | focus agent | fleet summary -> graph | **panel**, window | `GET /v1/command-center/summary` | ephemeral | P K L |
| `agents.org`<br>Engineering org and project agents | "Show the engineering org", project agents and flow | project:read | route task, promote, retire, change requests, monitoring findings | project_id -> org graph, agents, changes | **fullscreen**, window | `GET /v1/projects/{project_id}/org`, `/org/agents*`, `/org/route`, `/org/graph*`, `/org/changes*`, `/org/monitoring/findings*`, `WS /v1/projects/{project_id}/org/ws` | server | P K L D: `/agents`, `/p/:projectId/agents`, `/p/:projectId/flow`, `/flow`, `/project/:projectId/org` |
| `agents.create` ⚙︎<br>Create or configure an agent (project) | "Create an agent that…" -> agent config form | project:write | create, assign task, promote | AgentConfig {role, department, model, skills, budget} -> agent | **window**, panel | `POST /v1/projects/{project_id}/org/agents`, `POST /v1/projects/{project_id}/org/agents/{agent_id}/tasks` | server | P K L |
| `agents.kernel_run`<br>Multi-agent run and live timeline (project) | "Run the agents on <objective>", "show progress of run X" -> live execution timeline | kernel:run; kernel:approve for gates | plan, start, cancel, approve/reject gate | objective, budget -> KernelRun + AG-UI stream | **window**, panel, inline (status) | `POST /v1/projects/{project_id}/kernel/plan`, `POST/GET /v1/projects/{project_id}/kernel/runs`, `/runs/{id}/artifacts`, `/gates/{gate}/approve|reject`, `/cancel`, `GET /v1/projects/{project_id}/protocols/agui/runs/{id}/stream` (SSE), `GET /v1/projects/{project_id}/protocols/a2ui/runs/{id}/surfaces` | server | P K L |
| `agents.product_lead`<br>Product lead: why, what changed, what next (project) | "Why did we build X?", "what changed?", "what's next?" | project:read | ask | project_id, question -> answer + decisions | **panel**, inline | `GET /v1/product-lead/projects/{id}/why|what-changed|what-next|decisions[/pending]` | server | P K L |
| `agents.memory`<br>Knowledge and episodic memory (project) | "What do the agents remember about…" | project:read | browse, query | query, top_k -> KnowledgeHit[] | **panel**, window | `GET /v1/projects/{project_id}/os/memory`, `POST /v1/projects/{project_id}/os/memory/query` | server | P K L |
| `agents.benchmarks`<br>Benchmarks and regression gate (project) | "Run the benchmark suite", regression gate | kernel:run | run, view | -> BenchmarkSuiteReport | **window**, panel | `POST /v1/projects/{project_id}/os/benchmarks/run`, `GET /v1/projects/{project_id}/os/benchmarks` | server | P K L |
| `agents.traces`<br>Run traces (project) | "Show the trace for run X" | project:read | view, export | run_id -> spans | **window**, fullscreen | `GET /v1/projects/{project_id}/os/traces[/{run_id}]` | server | P K L |
| `agents.workload`<br>Agent workload (project) | "Who is overloaded?" | project:read | view | project_id -> workload by agent | **panel** | `GET /v1/projects/{project_id}/workload` | server | P K L |
| `agents.repo_memory` ⚙︎<br>Repository memory (project) | "What does Forge know about this repo?" (no UI today) | project:read; project:write to edit | view, edit | project_id -> memory doc | **panel** | `GET/PUT /v1/projects/{project_id}/memory` | server | P K L |
| `skills.catalog`<br>Skills | "What skills do agents have?", "which skill handles X?" | project:read | browse, route preview, telemetry | department?, query -> SkillManifest[]; route -> RouteResult | **window**, panel | `GET /v1/projects/{project_id}/skills`, `POST /v1/projects/{project_id}/skills/route`, `GET /v1/projects/{project_id}/skills/telemetry`, `GET /v1/projects/{project_id}/skills/{name}` | server | P K L D: `/skills` |
| `workflow.design` ✦<br>Workflow canvas (project) | "Design a workflow / pipeline" -> node canvas (new; reuses reactflow + kernel plan) | project:write | add/connect nodes, save, run | WorkflowGraph {nodes, edges} -> saved plan | **fullscreen**, window | `POST /v1/projects/{project_id}/kernel/plan` (preview); persistence endpoint is an open question | server (proposed) | P K L |

## Data

| Capability | Intent | Perms | Actions | I/O | Surfaces | APIs | Persist | Reach |
|---|---|---|---|---|---|---|---|---|
| `data.analyze` ✦<br>Analyze a dataset | "Chart this CSV", "analyze this dataset" -> charts, tables, filters (new) | auth | filter, sort, change chart, export | attachment(dataset) -> DataTable + Chart + FilterBar surface | **window**, panel, inline | upload + parse endpoint (new, WS-C); open question | session | P K L |
| `data.retrieval` ⚙︎<br>Knowledge retrieval index | "Index these docs", "search the knowledge base" (no UI today) | project:write | index, search, delete source | query -> hits | **panel** | `POST /api/retrieval/index|search`, `DELETE /api/retrieval/source/{id}` | server | P K L |

## Models

| Capability | Intent | Perms | Actions | I/O | Surfaces | APIs | Persist | Reach |
|---|---|---|---|---|---|---|---|---|
| `models.compare` ✦<br>Compare models | "Compare Claude vs GPT for coding" -> comparison table (new) | auth | compare, pin model for session | model ids?, criteria -> ComparisonTable | **window**, inline | needs a non-admin model metadata endpoint (`GET /v1/os/models`, new); `/api/llm/models` is admin-only | ephemeral | P K L |

## Protocols

| Capability | Intent | Perms | Actions | I/O | Surfaces | APIs | Persist | Reach |
|---|---|---|---|---|---|---|---|---|
| `protocols.hub`<br>Protocols: MCP, A2A, audit | "Show MCP servers", "register an MCP server", A2A agent card, audit | project:read; mcp:invoke to register/invoke | register server, invoke tool, A2A send/discover, view audit | -> servers, tools, apps, agent card, audit | **window**, fullscreen | `GET /v1/projects/{project_id}/protocols/mcp/tools|apps`, `POST /v1/projects/{project_id}/protocols/mcp/servers|invoke`, `/v1/projects/{project_id}/protocols/a2a/*` | server | P K L D: `/protocols` |
| `protocols.mcp_app`<br>Run an MCP App (project) | "Open the <app> MCP App" -> sandboxed iframe | mcp:invoke | open, resize | app_id, role, department -> MCPAppResourcePayload | **window**, panel | `GET /v1/projects/{project_id}/protocols/mcp/apps/{app_id}/resource` | ephemeral | P K L |

## Plan (AI-native agile PM)

| Capability | Intent | Perms | Actions | I/O | Surfaces | APIs | Persist | Reach |
|---|---|---|---|---|---|---|---|---|
| `plan.initiatives`<br>Initiatives | "Plan a new initiative", "show my initiatives" | auth; project:write to create | list, create (credit preview), open | -> Initiative[]; create(vision) -> initiative | **fullscreen**, window | `GET/POST /v1/initiatives/`, `GET /v1/initiatives/credit-preview` | server | P K L D: `/initiatives`, `/p/:projectId/initiatives` |
| `plan.initiative.overview`<br>Initiative overview and PRD | "Show the PRD for X", approvals, comments | project:read; project:write to edit/approve | edit PRD, approve, comment, regenerate, cancel, export | initiative_id -> initiative + PRD | **fullscreen**, window | `GET/PUT /v1/initiatives/{id}[/prd]`, `/approve`, `/comments`, `/approvals`, `/regenerate`, `/cancel`, `/export`, `WS /v1/initiatives/ws/{id}` | server | P K L D: `/initiatives/:initiativeId`, `/p/:projectId/initiatives/:initiativeId` |
| `plan.initiative.board`<br>Initiative kanban board | "Show the board", move tasks | project:write | create/update task, change status, execute task | initiative_id -> tasks by status | **fullscreen**, window | `/v1/tasks/*`, `WS /v1/initiatives/ws/{id}` | server | P K L D: `/initiatives/:initiativeId/board`, `/p/:projectId/initiatives/:initiativeId/board` |
| `plan.initiative.sprints`<br>Initiative sprints | "Plan the next sprint", standups, sprint report | project:write | update sprint, standup, report | initiative_id -> sprints | **fullscreen**, window | `/v1/sprints/*` | server | P K L D: `/initiatives/:initiativeId/sprints`, `/p/:projectId/initiatives/:initiativeId/sprints` |
| `plan.initiative.agent_runs`<br>Initiative agent runs | "What did the PM agents do?" | project:read | view run panes, standup | initiative_id -> agent executions | **fullscreen**, window | `GET /v1/agent-executions/`, `/v1/sprints/*/standup` | server | P K L D: `/initiatives/:initiativeId/agent-runs`, `/p/:projectId/initiatives/:initiativeId/agent-runs` |
| `plan.initiative.roadmap`<br>Initiative roadmap | "Show the roadmap" | project:read; project:write to edit epics | timeline/quarter/milestone views, edit epic | initiative_id -> epics, milestones | **fullscreen**, window | `/v1/epics/*` | server | P K L D: `/initiatives/:initiativeId/roadmap`, `/p/:projectId/initiatives/:initiativeId/roadmap` |
| `plan.initiative.graph`<br>Initiative dependency graph | "Show dependencies" | project:read | filter, inspect node, diagnostics | initiative_id -> graph | **fullscreen**, window | `GET /v1/initiatives/{id}/graph` | server | P K L D: `/initiatives/:initiativeId/graph`, `/p/:projectId/initiatives/:initiativeId/graph` |
| `plan.initiative.releases`<br>Initiative releases | "Generate release notes" | project:write | generate, edit, delete release | initiative_id -> releases | **fullscreen**, window | `/v1/releases/*` | server | P K L D: `/initiatives/:initiativeId/releases`, `/p/:projectId/initiatives/:initiativeId/releases` |
| `plan.initiative.activity`<br>Initiative activity and decisions | "What happened on X?", decision feed | project:read | filter feed, open execution | initiative_id -> activity + decisions | **fullscreen**, window, panel | `GET /v1/agent-executions/`, `/v1/tasks/*`, `WS /v1/initiatives/ws/{id}` | server | P K L D: `/initiatives/:initiativeId/activity`, `/p/:projectId/initiatives/:initiativeId/activity` |
| `plan.initiative.integrations`<br>Initiative integrations | "Sync with Jira/Linear/GitHub" | project:write | connect, disconnect, sync | initiative_id, provider -> integration status | **fullscreen**, panel, window | `GET/POST /v1/initiatives/{id}/integrations`, `DELETE .../{provider}`, `POST .../{provider}/sync` | server | P K L D: `/initiatives/:initiativeId/integrations`, `/p/:projectId/initiatives/:initiativeId/integrations` |
| `plan.initiative.analytics`<br>Initiative analytics | "How is the initiative trending?" | project:read | view charts | initiative_id -> analytics | **fullscreen**, window, inline | `GET /v1/analytics/initiatives/{id}` | server | P K L D: `/initiatives/:initiativeId/analytics`, `/p/:projectId/initiatives/:initiativeId/analytics` |
| `plan.decisions` ⚙︎<br>Decision log (project) | "Show the decision log" (no UI today) | project:read; project:write to record | list, record, pending | project/initiative -> decisions | **panel** | `GET /v1/decision-log/projects/{id}/decisions[/pending]`, `POST /v1/decision-log/decisions` | server | P K L |
| `plan.plans` ⚙︎<br>Execution plans (approve / reject) (project) | "Show pending execution plans" (no UI today) | kernel:approve | create, approve, reject | project_id -> plans | **panel**, window | `POST/GET /v1/projects/{project_id}/planning/plans`, `/plans/{id}/approve|reject` | server | P K L |

## Governance and reviews

| Capability | Intent | Perms | Actions | I/O | Surfaces | APIs | Persist | Reach |
|---|---|---|---|---|---|---|---|---|
| `governance.approvals`<br>Approvals | "What needs my approval?", "approve the deploy gate" | kernel:approve | approve, reject (confirm) | -> pending gates across projects | **window**, panel, inline (single gate) | `GET /v1/projects/{project_id}/kernel/runs`, `POST /v1/projects/{project_id}/kernel/runs/{id}/gates/{gate}/approve|reject`, `POST /v1/builds/{id}/gate` | server | P K L D: `/approvals` |
| `governance.policy`<br>Tenant governance policy (project) | "Who may use which models/tools?" tenant policy | org:manage | view, update policy | project_id -> TenantGovernancePolicy | **panel**, window | `GET/PUT /v1/projects/{project_id}/os/policy`, `/v1/api/orgs/*` (org LLM policy) | server | P K L |
| `reviews.board`<br>Review board | "Review my PR", "show reviews" | project:read; project:write to start | start review, list | -> review runs (orchestrator service) | **window**, fullscreen | orchestrator service (`lib/orchestratorApi.ts`), review WS | server | P K L D: `/reviews`, `/p/:projectId/reviews` |
| `reviews.detail`<br>Review run | "Show review X" | project:read | view findings, backlog, live progress | run_id -> ReviewRunDetails | **fullscreen**, window | orchestrator service, review WS (`hooks/useReviewSocket.ts`) | server | P K L D: `/reviews/:runId`, `/p/:projectId/reviews/:runId` |

## Account, billing and marketplace

| Capability | Intent | Perms | Actions | I/O | Surfaces | APIs | Persist | Reach |
|---|---|---|---|---|---|---|---|---|
| `marketplace.browse`<br>Marketplace | "Find a template/playbook", publish one | auth | browse, download, rate, publish | query -> MarketplaceItem[] | **window**, fullscreen | `/v1/marketplace/*`, skill marketplace `{P}/os/marketplace*` | server | P K L D: `/marketplace` |
| `account.billing`<br>Billing and credits | "What plan am I on?", "buy credits", "upgrade" | billing:manage | checkout, portal, buy credits, cancel, reactivate, downgrade (confirm) | -> plan, subscription, usage, invoices | **window**, panel | `/v1/billing/plans|subscription|usage|invoices|checkout|portal|credits/purchase|cancel|reactivate|downgrade` | server | P K L D: `/billing` |
| `account.settings`<br>Settings | "Open settings" (tabbed container of the account.* panels) | auth | switch tab | tab? -> settings | **window**, fullscreen | `GET/PUT /v1/auth/me` | server | P K L D: `/settings` |
| `account.profile`<br>Profile | "Change my name/avatar" | auth | update profile | -> user profile | **panel** | `PUT /v1/auth/me` | server | P K L |
| `account.appearance`<br>Appearance | "Switch to light mode", density, motion | auth | set theme | -> preferences | **panel**, inline | `PUT /v1/auth/me` (preferences) | server + device-local | P K L |
| `account.byok_models`<br>AI models (bring your own key) | "Use my own Anthropic/OpenAI key" | auth (Pro+) | set provider/key/model | -> BYOK settings (key never returned) | **panel** | `PUT /v1/auth/me` | server | P K L |
| `account.agent_fleet`<br>Agent fleet preferences | "Agent fleet preferences" | auth | update | -> preferences | **panel** | `PUT /v1/auth/me` | server | P K L |
| `account.api_keys`<br>Developer API keys | "Create an API key" | auth | create (shown once), list, revoke (confirm) | -> ApiKey[] | **panel** | `POST/GET /v1/api-keys/`, `DELETE /v1/api-keys/{id}` | server | P K L |
| `account.integrations`<br>Integrations and webhooks | "Add a webhook", connect GitHub | auth | create/delete webhook, connect | -> webhooks, integrations | **panel** | `/v1/webhooks/*`, `PUT /v1/auth/me` | server | P K L |
| `account.notifications`<br>Notification preferences | "Stop emailing me" | auth | update email preferences | -> EmailPreferences | **panel**, inline | `GET/PUT /v1/email/preferences` | server | P K L |
| `account.security`<br>Security, MFA and sessions | "Turn on 2FA", "sign out other sessions", change password | auth | MFA setup/verify/disable, revoke sessions, change password | -> sessions, mfa status | **panel** | `/v1/auth/mfa/*`, `GET/DELETE /v1/auth/sessions[/{id}]`, `POST /v1/auth/me/password` | server | P K L |
| `account.privacy`<br>Privacy and data export | "Export my data", "delete my account" | auth | export, delete (confirm) | -> export stream | **panel** | `GET /v1/gdpr/export`, `DELETE /v1/gdpr/delete` | server | P K L |
| `account.support`<br>Support tickets | "I need help", open a ticket | auth | create, list tickets | -> SupportTicket[] | **panel** | `POST/GET /v1/support/tickets` | server | P K L |
| `account.organization` ⚙︎<br>Organization and members | "Invite a teammate", manage org roles (no UI today) | org:manage | create org, invite, accept, change role, remove member | -> Organization, members | **window**, panel | `/v1/auth/organizations*` | server | P K L |
| `account.referrals` ⚙︎<br>Referrals | "Refer a friend" (no UI today) | auth | create, list | -> referrals | **panel** | `POST/GET /v1/growth/referrals` | server | P K L |

## Admin (admin_only, MFA required)

| Capability | Intent | Perms | Actions | I/O | Surfaces | APIs | Persist | Reach |
|---|---|---|---|---|---|---|---|---|
| `models.admin`<br>LLM management | "Manage LLM providers", per-agent model overrides | admin | test provider, reload, set agent override | -> providers, models, usage, health | **fullscreen**, window | `GET /api/llm/providers|models|usage|health`, `POST /api/llm/test|reload`, `PUT /api/llm/agent/{agent}` | server | P K L D: `/models`, `/llm-management` |
| `admin.ops`<br>Admin ops console | "Admin overview", users, builds, fraud, flags, audit | admin (MFA required) | users, credits, dead-letter retry, flags, audit, export users | -> admin overview | **fullscreen**, window | `/v1/admin/*` | server | P K L D: `/admin`, `/admin-console` |
| `admin.prompts`<br>Prompt studio | "Edit the planner prompt template" | admin | create/update/delete/preview/validate template | -> templates | **fullscreen**, window | `/v1/prompts/*` | server | P K L D: `/prompt-studio` |
| `admin.optimization`<br>Optimization and budgets | "Where is AI spend going?", budgets | admin | set/remove budget, view breakdown | -> spending, budgets | **fullscreen**, window | `/api/optimizer/*`, `/api/budgets/*` | server | P K L D: `/optimization-dashboard` |
| `admin.health`<br>Engineering health | "Engineering health" | admin | view metrics, rollback prompt versions, evaluate | -> health metrics | **fullscreen**, window | `GET /v1/admin/engineering-health`, `/v1/engineering/*` | server | P K L D: `/engineering-health` |
| `admin.analytics` ⚙︎<br>Product analytics | "Show funnel/retention/churn" (no dedicated UI today) | admin | view | range -> metrics | **fullscreen**, window | `/v1/analytics/funnel|retention|conversion|churn|ai-cost|revenue|onboarding` | server | P K L |

## Outside the OS shell

These stay as standalone pages with no shell, unchanged: `/`, `/home`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/google-callback`, `/onboarding`, `/privacy`, `/terms`, `/docs`, `/docs/:slug`, `/demo`, `*`.
Landing, auth (login, signup, password reset, email verification, Google callback), onboarding, legal and docs.
`/demo` keeps redirecting into the authenticated home.

## Shell chrome that is not a capability

Shell-owned (WS-A), always present, no capability id: Forge branding, the prompt composer (attachments,
voice input via `lib/useVoiceToText.ts`, model selector), the collapsible nav/history panel, profile and account
menu (sign out lives here), the command palette itself, keyboard shortcuts (the Alt-key map in `AppShell.tsx`
becomes palette shortcuts), the demo banner, toasts and the error boundary.

## Gaps found during the audit

- `/api/llm/models` and `/api/llm/providers` are `admin_required`, so `models.compare` needs a new non-admin,
  secret-free model metadata endpoint (WS-C: `GET /v1/os/models`).
- `data.analyze` and `workflow.design` have no backend today (dataset upload/parse; workflow persistence). See
  the open questions in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).
- Rows marked ⚙︎ (organizations, referrals, decision log, execution plans, repo memory, retrieval, product
  analytics) have APIs but no UI; the OS makes them reachable for the first time.
- The existing `/v1/projects/{project_id}/os/*` router (`api/enterprise.py`: memory, benchmarks, traces, skill
  marketplace, policy) is unrelated to the new top-level `/v1/os/*` OS API. Names are distinct on purpose; do not
  merge them.
