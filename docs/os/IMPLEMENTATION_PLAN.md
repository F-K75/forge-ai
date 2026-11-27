# Forge OS implementation plan (Phase 2: four parallel workstreams)

Phase 1 (this change) delivered the design ([ARCHITECTURE.md](ARCHITECTURE.md),
[CAPABILITY_MATRIX.md](CAPABILITY_MATRIX.md), [A2UI_DECISION.md](A2UI_DECISION.md)) and the **shared
contracts as code**. Phase 2 splits the build into four workstreams that can run at the same time because:

1. they compile against the same frozen contracts, and
2. **no file is owned by more than one workstream** (table below). A workstream that needs a change in
   someone else's file asks the owner, or opens a contract PR (see "Changing a contract").

## Shared contracts (frozen for Phase 2; change only by contract PR)

| Path | What |
|---|---|
| `shared/os-schemas/os-contracts.schema.json` | Canonical JSON Schema: event stream, A2UI v1.0 profile, requests, state, capability descriptor |
| `shared/os-schemas/forge-ember.catalog.json` | Canonical closed A2UI component catalog (38 components) |
| `shared/os-schemas/examples/*.json` | Valid and invalid example payloads run by both test suites |
| `shared/os-schemas/vendor/a2ui-v1_0/*` | Official A2UI v1.0 schemas (conformance tests only) |
| `frontend/src/os/contracts.ts` | TypeScript types, constants and in-process seams (`CapabilityRendererProps`, `CompositeComponentProps`, `SubscribeSession`) |
| `frontend/src/os/validate.ts`, `frontend/src/os/jsonSchema.ts` | Client-side envelope and catalog validation |
| `frontend/src/os/schemas/*` | Byte-identical copies (the frontend image copies only `frontend/`) |
| `frontend/src/os/contracts.test.ts`, `frontend/src/os/jsonSchema.test.ts` | Drift, parity, example and route-coverage tests |
| `backend/core/os_contracts.py` | Strict Pydantic mirror, validators, `os_event_to_sse`, `ActionContext` / `ActionOutcome` / `CapabilityActionHandler` |
| `backend/core/os_schemas/*` | Byte-identical copies (the backend image copies only `backend/`) |
| `backend/scripts/sync_os_schemas.py` | Copies `shared/` to both copies; `--check` for CI |
| `backend/tests/test_os_contracts.py`, `backend/tests/test_os_a2ui_conformance.py` | Backend contract and A2UI conformance tests |
| `docs/os/*` | These documents |

**Exception:** `shared/os-schemas/capability-index.json` and a new `shared/os-schemas/capabilities.json`
(full `CapabilityDescriptor`s) are **content owned by WS-D**. Their *shape* is still contract-controlled.
After editing them, WS-D runs the sync script, which rewrites only those files' copies.

### Changing a contract

1. Open a PR titled `contract: …` that touches only contract files. Edit `shared/os-schemas/*` first, then
   run `python backend/scripts/sync_os_schemas.py`, then update `contracts.ts` and `os_contracts.py`, then add
   or update examples.
2. Both suites must stay green: `npx vitest run src/os` and `pytest tests/test_os_contracts.py
   tests/test_os_a2ui_conformance.py`.
3. All four workstream leads review it. Changes should be additive (new optional fields, new event types,
   new catalog components). Anything breaking needs a `forge-os/2` envelope or catalog `:2`.
4. Only one contract PR may be open at a time, so the copies cannot conflict.

## File ownership

Paths are relative to the repo root. `**` means everything below. "New" means the workstream creates it.
Each workstream owns the tests next to its files and the listed test paths.

### WS-A: OS shell (frontend)

| Owns | Notes |
|---|---|
| `frontend/src/os/shell/**` (new) | `OsHome.tsx` (minimal home: branding, centred composer, nav/history, account), `Composer.tsx` (text, attachments → `POST /v1/os/attachments`, voice via existing `useVoiceToText`, model selector from `GET /v1/os/models`, centred → bottom transition), `NavHistoryPanel.tsx`, `WindowManager.tsx` + `windowStore.ts` (zustand: open, focus, z-order, minimise, maximise, tile, presentation switching, keyboard), `PanelDock.tsx`, `InlineSurfaceSlot.tsx`, `LegacyRouteWindow.tsx` (renders an existing route's element inside a window), `CapabilityLibrary.tsx`, `sessionStore.ts` (messages and text deltas from the stream), `sessionsApi.ts`, `workspaceClient.ts` (load, `localStorage` mirror, debounced `PUT` with `version`, 409 merge), `osRoutes.tsx` |
| `frontend/src/App.tsx` | Adds `/os` and `/os/s/:sessionId` behind `VITE_OS_SHELL`, mounts the OS shell layout, keeps **every** existing route (the coverage test enforces this), and changes redirect targets only when the flag is on |
| `frontend/src/components/AppShell.tsx`, `LeftNavRail.tsx`, `TopNavBar.tsx`, `CommandPalette.tsx`, `OSWindow.tsx`, `NotificationsBell.tsx`, `DemoBanner.tsx` and their `*.test.tsx` | Palette moves from the static `COMMANDS` array to the capability registry plus sessions plus actions. `OSWindow` becomes the window chrome used by `WindowManager` |
| `frontend/src/lib/commandPalette.ts`, `frontend/src/lib/env.ts`, `frontend/src/store/uiStore.ts` | `VITE_OS_SHELL` flag; UI prefs move into `WorkspaceState` |
| `frontend/tests/os-shell*.spec.ts` (new, Playwright) | Home → first prompt → composer docks → window opens; legacy deep links still work |

Consumes WS-B's `subscribeSession` (`SubscribeSession` type) and `<SurfaceView surfaceId />`, plus WS-D's
`useCapabilities()` and `resolveCapabilityRenderer()`. Until those land it uses local fakes typed against
`contracts.ts`.

### WS-B: generative UI engine (frontend)

| Owns | Notes |
|---|---|
| `frontend/src/os/stream/**` (new) | `osStreamClient.ts` implementing `SubscribeSession`: fetch-based SSE reader (same approach as `kernelApi.subscribeAguiStream`), Last-Event-ID/`after_seq` resume, backoff, heartbeat watchdog, `validateOsEvent` on every frame (invalid frames go to `onInvalid`, never applied), fan-out to multiple subscribers |
| `frontend/src/os/genui/**` (new) | `surfaceStore.ts` (applies `createSurface`, `updateComponents`, `updateDataModel` and `deleteSurface` in order; per-surface data model; snapshot hydrate from `StoredSurface`), `binding.ts` (RFC 6901 get and set, `{"@path"}` resolution, template children), `registry/` (catalog name → lazy React component; **all 31 core components**: layout, content, data, status and input, Ember Night styled, a11y; plus `registerComposite()` for composites), `SurfaceView.tsx` (renders a surface from `root`, with an error boundary per component), `TextFallback.tsx`, `actions.ts` + `actionsApi.ts` (A2UI `action` → `POST /v1/os/sessions/{id}/actions`, optimistic pending state, confirmation hook), `composites/ExecutionTimeline.tsx` (live AG-UI via `agent.progress` and `subscribeAguiStream`), `mcp/MCPAppSurface.tsx` (handles `mcp_app.placed`: fetch resource, mount `MCPAppFrame`) |
| `frontend/src/components/a2ui/**` | Legacy renderer stays; any shared styling extraction happens here. `MCPAppFrame.tsx` and `mcpAppSecurity.ts` are hardened, not replaced |

Rule: no `dangerouslySetInnerHTML`, no `eval` or `new Function`, no style or URL props beyond the catalog.
A lint rule (`no-restricted-syntax`) on `src/os/genui/**` enforces this. The ESLint config itself is shared;
WS-B adds an override block only for its own path.

### WS-C: intelligence orchestration and OS backend (FastAPI)

| Owns | Notes |
|---|---|
| `backend/api/os.py` (new) | Router `prefix="/os"` implementing the endpoint table in ARCHITECTURE.md |
| `backend/api/v1.py` | One `include_router` line for `api/os.py` (`/v1/os/*` only; no legacy root-level mount) |
| `backend/core/os/**` (new package) | `sessions.py` (repositories for `os_sessions`, `os_messages`, `os_turns`, `os_surfaces`, `os_workspaces`, all scoped by `user_id` and `org_id`), `events.py` (atomic per-session `seq`, append to `os_events`, Redis `os:session:{id}` publish, `psubscribe` listener waking local SSE queues, heartbeat, replay), `turns.py` (turn lifecycle, idempotency, cancel), `intent.py` (LLM classifier via `AIGateway.generate(structured_output_schema=IntentResult)`), `intent_rules.py` (**deterministic fallback**: keywords from the capability index, attachment MIME rules, explicit mentions), `planner.py` (`PresentationPlan`, permission/plan/project checks, presentation choice), `executors.py` (text via `AIGateway.stream`, `render_surface`, `open_capability`, `run_agent` bridge from `AGUIStreamBroker.subscribe` to `agent.progress`, `open_mcp_app`), `surface_validation.py` (wraps `validate_a2ui_message`, drop-and-log), `legacy_a2ui.py` (`a2ui/v1` → v1.0 using `LEGACY_A2UI_COMPONENT_MAP`), `capability_registry.py` (loads `capabilities.json`, filters by caller, dispatches to `CapabilityActionHandler`s registered by WS-D, validates action input against `input_schema`), `models_catalog.py` (non-admin, secret-free model list for `GET /v1/os/models`), `attachments.py` |
| `backend/core/migrations.py` | A migration adding the `os_*` indexes in ARCHITECTURE.md |
| `backend/core/feature_flags.py` | `os_shell` flag |
| `backend/tests/test_os_api*.py`, `test_os_events*.py`, `test_os_planner*.py`, `test_os_intent_rules*.py`, `test_os_sessions*.py` (new) | Includes a **no-LLM-key test**: with no providers registered, every owner-example prompt in CAPABILITY_MATRIX.md resolves to its capability, and chat returns `turn.failed{llm_unavailable}` or a canned answer |

`core/protocol_gateway.py`, `core/agent_kernel.py`, `core/llm/**` and `gateway/**` are **read-only** for
WS-C. It uses their public APIs; changes to them are separate PRs reviewed by their current owners.

### WS-D: capability migration (wrap existing features)

| Owns | Notes |
|---|---|
| `shared/os-schemas/capability-index.json`, `shared/os-schemas/capabilities.json` (new) | Content only. Grows the 71-row index into full `CapabilityDescriptor`s (actions, input/output schemas, API bindings, permissions). The descriptors are data, loaded by WS-C (server) and WS-D's frontend registry |
| `frontend/src/os/capabilities/**` (new) | `useCapabilities()` (React Query over `GET /v1/os/capabilities`, with a static fallback from the synced `capabilities.json`), `resolveCapabilityRenderer()` (`component_key` → `lazyWithRetry(() => import(...))` of existing pages and panels, taking `CapabilityRendererProps`), `composites/` (`LivePreview`, `DeployPanel`, `WorkflowCanvas`, `AgentConfigForm`, `ProjectGrid`, `CapabilityLauncher`, registered with WS-B's `registerComposite`, each wrapping existing components such as `forge-os/live/*`, `pm/*` and reactflow) |
| `frontend/src/pages/**`, `frontend/src/components/**` **except** the files owned by WS-A and `components/a2ui/**` (WS-B) | Only to make pages embeddable: accept `embedded` / `CapabilityRendererProps`, drop full-page assumptions, keep routes working. Business logic stays where it is |
| `frontend/src/lib/**` **except** `lib/commandPalette.ts` and `lib/env.ts` (WS-A); `frontend/src/hooks/**`, `frontend/src/store/**` **except** `store/uiStore.ts` (WS-A) | Feature API clients (`api.ts`, `kernelApi.ts`, `pmApi.ts`, `orchestratorApi.ts`, …) and stores, if a wrapped feature needs them |
| `backend/core/os_capabilities/**` (new package) | One `CapabilityActionHandler` per `(capability, action)`, calling existing services (projects, builds, deployments, kernel, initiatives, billing, …), plus deterministic surface builders for no-LLM mode (`data.analyze` table and chart from a parsed dataset, `models.compare` table from `models_catalog`, `governance.approvals` gate card) |
| `backend/tests/test_os_capability_*.py` (new) | Per-capability handler tests with the existing fakes |

WS-D does **not** change existing backend routers. If a capability needs a missing endpoint (see open
questions), WS-C adds it under `/v1/os/*`, or the feature's current owner adds it in a separate PR.

### Ownership conflicts resolved

| File or area | Owner | Why |
|---|---|---|
| `App.tsx` | WS-A | Routing is shell behaviour; WS-D never edits routes |
| `components/OSWindow.tsx` | WS-A | Window chrome; WS-D renders inside it |
| `components/a2ui/MCPAppFrame.tsx` | WS-B | Sandbox security lives with the GenUI engine |
| `ExecutionTimeline` composite | WS-B | It is the AG-UI integration |
| Other composites | WS-D | They wrap existing feature components |
| `capability-index.json` | WS-D (content) | The coverage test in `contracts.test.ts` (contract) enforces completeness |
| `api/v1.py` | WS-C | One line |
| ESLint config | shared | Each workstream adds only path-scoped overrides; any other change is a contract PR |

## Integration seams and order

```
Week 0  contracts frozen (this PR)
WS-B    stream client + surface store + core registry ──┐
WS-C    sessions/events/stream + rules planner ─────────┼─► first end-to-end: "tell me a joke" (text) and
WS-A    home + composer + window manager (fakes) ───────┘   "show my projects" (legacy route in a window)
WS-D    index → descriptors for build/projects/approvals ─► "build me a site" (preview + code + deploy)
then    LLM intent + generated surfaces (data, compare, agent form, workflow, timeline), palette and library on the
        registry, all 71 capabilities, flag flip
```

- **Seam 1, stream** (WS-C → WS-B → WS-A): `OsEvent` over SSE. WS-B and WS-A use a fixture replayer over
  `shared/os-schemas/examples/os-event.examples.json` until WS-C is live.
- **Seam 2, surfaces** (WS-C and WS-D → WS-B): A2UI v1.0 messages limited to the catalog. Both sides
  validate.
- **Seam 3, capabilities** (WS-D → WS-A, WS-C): `capabilities.json` + `CapabilityRendererProps` +
  `CapabilityActionHandler`.
- **Seam 4, workspace** (WS-A ↔ WS-C): `WorkspaceState` with `version`.

## Definition of done (every workstream)

- `npx tsc --noEmit`, `npx vitest run`, `npm run lint`, `npm run build` plus the bundle budget, and backend
  `python -m pytest -q -p no:cacheprovider` all green.
- Contract tests untouched or extended only through a contract PR.
- No `dangerouslySetInnerHTML`, `eval` or `new Function` in `src/os/**`. Every generated surface path has a
  text fallback.
- Ember Night tokens only (no hard-coded colours). Keyboard and screen-reader paths covered by `vitest-axe`
  for new shell and registry components.
- Works with no LLM key (WS-C's no-key test plus a WS-A Playwright run with the backend in no-key mode).
- Every legacy route still renders (existing route tests plus the coverage test).

## Open questions for the owner

1. **A2UI status.** The A2UI repo's v1.0 spec doc says "Status: Current", and Google reportedly announced
   1.0 as stable. Both a2ui.org and the blog were unreachable from this session, though, and some mirrors
   still say "candidate". The plan targets v1.0 either way. Is it acceptable to skip v0.9 compatibility?
2. **Home route.** Should the OS live at `/os` behind a flag, then take over `/` for signed-in users, or
   replace `/command` directly? What happens to the Command Center dashboard by default: hidden, or
   pinned as a summonable window?
3. **Dataset analysis backend (`data.analyze`).** Which formats (CSV, XLSX, Parquet?) and size limits, and
   where do parsed datasets live: GridFS, object storage, or ephemeral only? Should the analysis run on
   the server (pandas in the worker) or the client?
4. **Workflow canvas (`workflow.design`).** Is a designed workflow a kernel plan template, a new persisted
   "workflow" entity, or an initiative? This decides the persistence endpoint.
5. **Model comparison data.** May non-admins see provider and model names, prices and capabilities? Is
   there a curated metadata source, or is it derived from the router registry and optimizer pricing
   (`/api/optimizer/pricing`)?
6. **Sessions and orgs.** Are conversations private to the user, or shareable inside an org or project? What
   retention period: 30-day event replay, sessions kept until deleted?
7. **Model selector.** Should users pin a model per turn (BYOK and Pro only?), or only choose a "fast /
   balanced / best" tier that the router maps?
8. **Existing AG-UI SSE multi-worker gap.** `AGUIStreamBroker` publishes to Redis, but nothing subscribes, so
   `/protocols/agui/runs/{id}/stream` only sees events from its own worker. Fix it now, as a separate PR by
   the kernel owner, or only bridge kernel events through the new OS event log?
9. **MCP Apps SDK.** Adopt `@modelcontextprotocol/ext-apps` (MIT, needs zod 4) for the host bridge, or
   keep the current minimal size-only bridge? This interacts with the A2UI SDK's zod 3 requirement (see
   A2UI_DECISION.md).
10. **Voice.** Is the browser speech API (`useVoiceToText`) enough, or is server-side transcription expected
    for attachments and voice notes?
