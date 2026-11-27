# ADR: A2UI for Forge OS generated surfaces

**Status:** Proposed (Phase 1) · **Date:** 2026-11-27 · **Owners:** WS-B (renderer), WS-C (server validation)

## Decision

**Speak official A2UI v1.0 on the wire. Render it with Forge's own trusted registry, not the official
renderer SDK (for now).**

1. Generated surfaces are A2UI v1.0 messages: `createSurface`, `updateComponents`, `updateDataModel`,
   `deleteSurface` from agent to renderer, and `action` from renderer to agent. These are carried
   inside the Forge OS event stream (`a2ui.message` events, `frontend/src/os/contracts.ts`).
2. The only catalog the shell renders is the **Forge Ember catalog**
   (`catalogId: "urn:forge:a2ui:catalog:ember:1"`, `shared/os-schemas/forge-ember.catalog.json`), written in
   the A2UI v1.0 catalog document layout. It is a closed allowlist of 38 components. Each one maps to a
   hand-written React component in the WS-B registry, styled with Ember Night tokens.
3. Forge uses a **restricted profile** of A2UI. There are no renderer-side functions (`functions: {}`),
   `Action` is `{event: …}` only (no `functionCall`), there is no `callRendererFunction` or
   `callAgentFunction`, there are no secret text fields, and links must be `http(s)`. Every message is
   validated twice, by the server before it is persisted or streamed and by the client before it is
   rendered.
4. The legacy `a2ui/v1` surfaces (`backend/core/protocol_gateway.py`,
   `frontend/src/components/a2ui/*`) keep working. WS-C adds a server-side adapter from legacy surfaces to
   v1.0 messages using `LEGACY_A2UI_COMPONENT_MAP` (`backend/core/os_contracts.py`). The legacy endpoint
   `GET …/protocols/a2ui/runs/{run_id}/surfaces` is not changed.
5. **Revisit `@a2ui/react`** once it reaches 1.x, or once a quarter passes without breaking changes. Because
   the wire format already matches the spec, adopting the official renderer later only changes the
   renderer. No producers or stored data change.

`backend/tests/test_os_a2ui_conformance.py` checks that Forge's A2UI is a subset of official v1.0. It
validates every A2UI message in the shared examples against the official v1.0 JSON Schemas, vendored
unmodified in `shared/os-schemas/vendor/a2ui-v1_0/`.

## What was verified, and how

Outbound network was partly restricted. **a2ui.org and developers.googleblog.com could not be reached**
(DNS refused by the session's network policy). The npm registry and `raw.githubusercontent.com` could be
reached. Everything marked *verified* was read directly from those sources on 2026-11-27.

| Fact | Status | Source |
|---|---|---|
| A2UI v1.0 spec doc header: "**Version:** 1.0 **Status:** Current **Created:** Nov 20, 2025 **Last Updated:** Jun 8, 2026" | verified | `https://raw.githubusercontent.com/a2ui-project/a2ui/main/specification/v1_0/docs/a2ui_protocol.md` |
| v1.0 agent→renderer message types: `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`. The v1.0 JSON schema also defines `callRendererFunction` and `agentFunctionResponse` | verified | same doc; `agent_to_renderer.json` in `@a2ui/web_core@0.16.1` |
| v1.0 renderer→agent: `action {name, surfaceId, sourceComponentId, timestamp, context}` (required), plus `callAgentFunction`, `rendererFunctionResponse`, `error` | verified | `renderer_to_agent.json` in `@a2ui/web_core@0.16.1` |
| v1.0 changes vs 0.9: bidirectional function calls, inline components/dataModel in `createSurface`, `theme` removed, catalog function maps, UAX #31 identifiers, reserved `@` namespace | verified | v1.0 spec doc, "Changes from previous versions" |
| Components are flat `{id, component, …props}`; data binding `{"@path": "/json/pointer"}`; children by id or template `{componentId, path}`; transport-agnostic (ordered, framed delivery; JSONL, WebSocket or SSE) | verified | v1.0 spec doc; `common_types.json` |
| Catalog concept: a catalog document with `catalogId`, `components` (name → JSON Schema), `functions`, `$defs`; the v1.0 basic catalog has Text, Image, Icon, Video, AudioPlayer, Row, Column, List, Card, Tabs, Modal, Divider, Button, TextField, CheckBox, ChoicePicker, Slider, DateTimeInput | verified | `src/v1_0/schemas/catalogs/basic/catalog.json` in `@a2ui/web_core@0.16.1` |
| Official React renderer: **`@a2ui/react` 0.16.1**, Apache-2.0, published 2026-11-23, repo `github.com/a2ui-project/a2ui` (`typescript/renderers/react`). Peers: `react ^17‖^18‖^19`, **`zod ^3.25.76`**. Deps: `@a2ui/web_core ^0.16.1`, `@a2ui/markdown-it`, `markdown-it`, `clsx` | verified | `https://registry.npmjs.org/@a2ui/react` |
| Its README says it renders v0.9, v0.9.1 and v1.0 surfaces; `@a2ui/react/v0_8` is the legacy v0.8 renderer | verified | npm README of `@a2ui/react@0.16.1` |
| `@a2ui/web_core` 0.16.1 (Apache-2.0) depends on `lit ^3.3.3`, `@lit/context`, `@preact/signals-core`, `zod ^3.25.76`, `zod-to-json-schema`, `validate-color`. Its `DEFAULT_PROTOCOL_VERSION` is `'0.9'` | verified | npm registry; `src/catalog/schema_loader.js` in the tarball |
| Release cadence: `@a2ui/react` went 0.8.0 (2026-03-17) → 0.16.1 (2026-11-23). The 0.16.0 changelog alone lists more than 15 "BREAKING CHANGE" entries | verified | npm `time` field; `CHANGELOG.md` in the `@a2ui/web_core@0.16.1` tarball |
| Other official renderers: `@a2ui/lit` 0.16.0, `@a2ui/angular` 0.16.0 (Apache-2.0) | verified | npm registry |
| v0.8 message types `surfaceUpdate`, `dataModelUpdate`, `beginRendering`, `deleteSurface`; in v0.9 `beginRendering`→`createSurface`, `surfaceUpdate`→`updateComponents`, `dataModelUpdate`→`updateDataModel`, `userAction`→`action` | **unverified** (search-result snippets of a2ui.org pages only) | a2ui.org/specification/v0.8-a2ui, v0.9-evolution-guide (not reachable) |
| Google announced "A2UI 1.0" as its first stable version; secondary coverage dates it 2026-11-11 | **unverified** (search results only; blog not reachable) | developers.googleblog.com "A2UI 1.0: Build delightful, fast, reliable agentic experiences"; sdtimes.com; infoq.com |
| Some mirrors and a2ui.org reportedly still label v1.0 a release candidate and v0.9.1 "current" | **unverified**, conflicts with the repo doc above | search-result snippets |
| Project moved from `github.com/google/A2UI` to `github.com/a2ui-project/a2ui` | **partly verified**: npm `repository` fields point to a2ui-project; the move itself was not confirmed | npm registry |
| Python agent SDK on PyPI under `a2ui`, `a2ui-agent` or `a2ui-sdk` | **not found** (those names do not exist on PyPI). Forge's backend does not need one | `https://pypi.org/pypi/<name>/json` |
| Adjacent protocols: `@ag-ui/core` 1.0.5 and `@ag-ui/client` 1.0.5 (MIT, peer `zod ^3.25.18‖^4`), PyPI `ag-ui-protocol` 1.0.0 (MIT); MCP Apps `@modelcontextprotocol/ext-apps` 2.0.4 (MIT, peer **`zod ^4.2.0`**, `@modelcontextprotocol/* ^2`) | verified | npm registry, PyPI |

The schemas and changelog were read from
`https://registry.npmjs.org/@a2ui/web_core/-/web_core-0.16.1.tgz`
(sha256 `545b76606daf8cb1698983e73366fb13d6df68e34c9e5e4a157634b066817dd4`). The tarball was extracted into a
scratch directory and never executed.

## Forge `a2ui/v1` compared with A2UI v1.0

| Aspect | Forge `a2ui/v1` (today) | A2UI v1.0 (official) | Forge OS profile (this ADR) |
|---|---|---|---|
| Envelope | One JSON object per surface: `{surface_id, protocol: "a2ui/v1", title, components[]}`, returned by REST | Stream of messages: `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`, each with `version: "1.0"` | v1.0 messages inside `a2ui.message` OS events, plus a Forge `surface.placed` event that says where the surface goes (inline, panel, window or fullscreen) |
| Component shape | `{type: "metric_row", ...snake_case props}`, a flat list with no ids and no nesting | `{id, component: "Row", ...props}`, an adjacency list with children referenced by id | v1.0 shape; PascalCase names; camelCase props |
| Layout | Implicit vertical stack | Explicit `Column`, `Row`, `Card`, `Tabs` and so on, with a `root` component | v1.0 explicit layout |
| Data | Values inlined; no data model | Separate data model; `{"@path"}` bindings; incremental `updateDataModel` | v1.0 data model and bindings (needed for live tables, charts and forms) |
| Catalog | Hard-coded 16 types in `A2UI_COMPONENT_SCHEMAS` and `parseA2UI.ts` | Catalog document negotiated by `catalogId` | Closed Forge Ember catalog in the v1.0 catalog document format, 38 components (the 16 legacy types are ported) |
| Interaction | `approval_card.actions: ["approve", "reject"]` handled ad hoc | `Action.event` → renderer→agent `action` message; optional function calls | `Action.event` only → `POST /v1/os/sessions/{id}/actions` carrying the v1.0 `action` payload |
| Validation | Server: closed per-type schemas, components dropped on failure. Client: `parseA2UIComponent` narrowing | JSON Schema plus catalog validation in `web_core` | Same idea, formalised: JSON Schema envelope plus catalog, on both server (`jsonschema`) and client (`frontend/src/os/jsonSchema.ts`), from one shared schema file |
| Streaming | None (poll the REST endpoint) | Progressive by design | Progressive via the OS SSE stream, with replay by `seq` |

What carries over from `a2ui/v1` unchanged: closed allowlists, length and item caps, the http(s)-only URL
rule (`safeHttpUrl` / `validate_a2ui_url`), plain text only (no HTML), and drop-on-invalid behaviour.

## Why not adopt `@a2ui/react` now

1. **Churn.** Nine minor versions in eight months, all 0.x, and more than 15 breaking changes in the latest
   minor. Forge would carry upgrade work on every release for a layer that should be stable.
2. **Dependency conflict.** `@a2ui/react` and `@a2ui/web_core` require `zod ^3.25.76`. The MCP Apps SDK
   (`@modelcontextprotocol/ext-apps` 2.0.4), which Forge would want for its MCP Apps host, requires
   `zod ^4.2.0`. The frontend has no zod today. Taking both would mean two zod majors in the bundle, or
   waiting for one side to move.
3. **Bundle and runtime footprint.** `web_core` brings `lit`, `@lit/context`, `@preact/signals-core`,
   `markdown-it` and an expression and regex engine. The frontend bundle is size-checked in CI
   (`scripts/check-bundle-size.js`). Forge's renderer needs none of that engine, because the profile
   disables functions.
4. **Attack surface.** The official engine evaluates catalog functions, `formatString` templates and regexes,
   and routes unknown functions to the agent (`callAgentFunction`). For a renderer inside the trusted shell,
   the smaller engine is safer: data binding, a closed component map, and agent-side events only.
5. **Design language.** The basic catalog's components would be restyled or wrapped anyway to meet Ember
   Night (`docs/design/EMBER_NIGHT_DESIGN_LANGUAGE.md`). Forge already owns a tested registry
   (`components/a2ui/A2UIRenderer.tsx`, 16 components).
6. **Default version.** `web_core` defaults to protocol `0.9`, and the conflicting public signals on v1.0
   status (see the table above) suggest letting the SDK settle first.

The licence is not a blocker: Apache-2.0 is compatible with Forge's MIT licence, with attribution in NOTICE
if the code is ever bundled.

## Consequences

- **WS-B** builds `frontend/src/os/genui/`: a surface store that applies v1.0 messages, a `{"@path"}`
  resolver over a per-surface data model, the catalog→component registry, action dispatch, and a text
  fallback for any surface that fails validation. It reuses `frontend/src/os/validate.ts`.
- **WS-C** emits only v1.0 messages, validates with `core.os_contracts.validate_a2ui_message` before persisting
  or streaming, and drops (and logs) invalid components, as `_finalize_a2ui_surface` does today.
- **Catalog changes are contract changes.** Edit `shared/os-schemas/forge-ember.catalog.json`, run
  `backend/scripts/sync_os_schemas.py`, add example payloads, and keep the conformance test green.
- **Richer UIs than the catalog allows** (custom editors, third-party widgets) go through **MCP Apps** only:
  sandboxed `<iframe srcdoc sandbox="allow-scripts">` from `core/mcp_apps.py` and `MCPAppFrame.tsx`, placed
  by an `mcp_app.placed` event. Never inline them.

## Revisit when

- `@a2ui/react` reaches 1.x, or a quarter passes with no breaking change, **and** the zod major conflict with
  the MCP Apps SDK is resolved; or
- Forge needs to render third-party agent surfaces from the official basic catalog. In that case add the
  basic catalog as a second allowed `catalogId`, rendered by the official SDK inside its own error boundary,
  still with functions disabled.
