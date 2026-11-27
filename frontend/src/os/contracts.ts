/**
 * Forge OS shared contracts (Phase 1). Every workstream compiles against these
 * types; do not fork them. The wire truth is the JSON Schema in
 * ./schemas/os-contracts.schema.json (a byte-identical copy of
 * shared/os-schemas/, drift-tested in ./contracts.test.ts) and the A2UI
 * component catalog in ./schemas/forge-ember.catalog.json. The Pydantic
 * mirror is backend/core/os_contracts.py.
 *
 * Changing a contract: edit shared/os-schemas/*.json, run
 * `python backend/scripts/sync_os_schemas.py`, update this file and
 * backend/core/os_contracts.py in the same commit, and keep the example
 * payloads in shared/os-schemas/examples passing on both sides.
 *
 * See docs/os/ARCHITECTURE.md for how these fit together.
 */

// ---------------------------------------------------------------------------
// Versions and identifiers
// ---------------------------------------------------------------------------

/** Version tag on every OS stream event envelope (`OsEvent.v`). */
export const OS_PROTOCOL_VERSION = "forge-os/1" as const
/** A2UI protocol version Forge speaks on the wire (A2UI v1.0 message shapes). */
export const A2UI_VERSION = "1.0" as const
/** The only A2UI catalog the trusted shell renders. */
export const FORGE_CATALOG_ID = "urn:forge:a2ui:catalog:ember:1" as const

export type OsId = string
/** ISO-8601 UTC timestamp. */
export type Timestamp = string
/** RFC 6901 JSON Pointer ("" or starting with "/"). */
export type JsonPointer = string
/** Dotted lowercase capability id, e.g. "projects.manage" or "plan.initiative.board". */
export type CapabilityId = string
export type JsonObject = { [key: string]: unknown }

// ---------------------------------------------------------------------------
// Enumerations (keep in sync with the schema; contracts.test.ts checks parity)
// ---------------------------------------------------------------------------

export const INTENT_KINDS = [
  "chat",
  "build_website",
  "analyze_data",
  "create_agent",
  "design_workflow",
  "compare_models",
  "manage_projects",
  "monitor_run",
  "review_code",
  "approve_gate",
  "open_capability",
  "account",
  "unknown",
] as const
export type IntentKind = (typeof INTENT_KINDS)[number]

/** How a response is presented. "text" means no surface: plain assistant text only. */
export const PRESENTATION_KINDS = ["text", "inline", "panel", "window", "fullscreen"] as const
export type PresentationKind = (typeof PRESENTATION_KINDS)[number]
export type SurfacePresentationKind = Exclude<PresentationKind, "text">
export type WindowPresentationKind = Exclude<PresentationKind, "text" | "inline">

export const PERMISSIONS = [
  "authenticated",
  "project:read",
  "project:write",
  "kernel:run",
  "kernel:approve",
  "mcp:invoke",
  "deploy",
  "billing:manage",
  "org:manage",
  "admin",
] as const
export type Permission = (typeof PERMISSIONS)[number]

export const ENTRY_POINTS = ["prompt", "palette", "library", "deeplink"] as const
export type EntryPoint = (typeof ENTRY_POINTS)[number]

/**
 * Where a capability's / window's state lives:
 * ephemeral = memory only; session = with the conversation; workspace = with the
 * window layout; server = the feature's own backend collection (source of truth).
 */
export const PERSISTENCE_RULES = ["ephemeral", "session", "workspace", "server"] as const
export type PersistenceRule = (typeof PERSISTENCE_RULES)[number]

export const OS_EVENT_TYPES = [
  "turn.started",
  "intent.resolved",
  "plan.ready",
  "text.delta",
  "text.completed",
  "a2ui.message",
  "surface.placed",
  "mcp_app.placed",
  "agent.progress",
  "action.result",
  "turn.completed",
  "turn.failed",
  "heartbeat",
] as const
export type OsEventType = (typeof OS_EVENT_TYPES)[number]

export const CAPABILITY_CATEGORIES = [
  "build",
  "plan",
  "agents",
  "data",
  "models",
  "protocols",
  "governance",
  "account",
  "admin",
  "system",
] as const
export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number]

export const OS_ERROR_CODES = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation_failed",
  "rate_limited",
  "budget_exceeded",
  "llm_unavailable",
  "conflict",
  "internal",
] as const
export type OsErrorCode = (typeof OS_ERROR_CODES)[number]

// ---------------------------------------------------------------------------
// A2UI v1.0 profile (agent -> renderer and renderer -> agent)
// ---------------------------------------------------------------------------

/**
 * One flat A2UI component: `{ id, component, ...props }`. Props are validated
 * against the component's schema in the Forge Ember catalog; never render one
 * that has not passed `validateComponent` (./validate.ts).
 */
export interface A2UIComponent {
  id: string
  /** PascalCase catalog component name, e.g. "DataTable". */
  component: string
  [prop: string]: unknown
}

/** `{"@path": "/pointer"}` — a data-model binding (A2UI DataBinding). */
export interface A2UIDataBinding {
  "@path": JsonPointer
}

/** Forge's A2UI Action profile: agent-side events only (no renderer functionCall). */
export interface A2UIAction {
  event: { name: string; context?: JsonObject; userMessage?: string | A2UIDataBinding }
}

export interface A2UICreateSurface {
  version: typeof A2UI_VERSION
  createSurface: {
    surfaceId: OsId
    catalogId: typeof FORGE_CATALOG_ID
    components?: A2UIComponent[]
    dataModel?: JsonObject
    sendDataModel?: boolean
  }
}
export interface A2UIUpdateComponents {
  version: typeof A2UI_VERSION
  updateComponents: { surfaceId: OsId; components: A2UIComponent[] }
}
export interface A2UIUpdateDataModel {
  version: typeof A2UI_VERSION
  updateDataModel: { surfaceId: OsId; path?: JsonPointer; value: unknown }
}
export interface A2UIDeleteSurface {
  version: typeof A2UI_VERSION
  deleteSurface: { surfaceId: OsId }
}
export type A2UIServerMessage =
  | A2UICreateSurface
  | A2UIUpdateComponents
  | A2UIUpdateDataModel
  | A2UIDeleteSurface

/** Renderer -> agent user action (A2UI v1.0 `action` message shape). */
export interface A2UIUserAction {
  version: typeof A2UI_VERSION
  action: {
    name: string
    surfaceId: OsId
    sourceComponentId: string
    timestamp: Timestamp
    context: JsonObject
  }
}

// ---------------------------------------------------------------------------
// Intelligence kernel outputs
// ---------------------------------------------------------------------------

export interface IntentResult {
  kind: IntentKind
  confidence: number
  capability_ids: CapabilityId[]
  entities: JsonObject
  /** llm = LLM classifier; rules = deterministic fallback (no key / LLM down); explicit = palette/library. */
  source: "llm" | "rules" | "explicit"
  rationale: string | null
}

export interface ModelRef {
  provider: string
  model: string
}

export type PlanStepKind =
  | "respond_text"
  | "render_surface"
  | "open_capability"
  | "open_mcp_app"
  | "run_agent"
  | "call_tool"

export interface PlanStep {
  id: OsId
  kind: PlanStepKind
  title: string
  capability_id: CapabilityId | null
  requires_approval: boolean
}

export interface PresentationPlan {
  plan_id: OsId
  intent: IntentResult
  presentation: PresentationKind
  steps: PlanStep[]
  model: ModelRef | null
  /** True when the deterministic planner produced this plan (no LLM used). */
  fallback: boolean
}

export interface SurfacePlacement {
  surface_id: OsId
  presentation: SurfacePresentationKind
  title: string
  capability_id?: CapabilityId | null
  window_id?: OsId | null
  size_hint?: "compact" | "regular" | "large"
  focus?: boolean
}

export interface MCPAppPlacement {
  app_id: OsId
  server_id: OsId
  tool_name: string
  project_id: OsId
  presentation: WindowPresentationKind
  title: string
}

/** A kernel AG-UI event bridged into the OS stream (from AGUIStreamBroker). */
export interface AgentProgress {
  project_id: OsId
  run_id: OsId
  agui_type: string
  kernel_event: string
  payload: JsonObject
}

export interface Usage {
  input_tokens: number
  output_tokens: number
  cost_usd: number
}

export interface OsError {
  code: OsErrorCode
  message: string
  retryable: boolean
}

// ---------------------------------------------------------------------------
// Event stream (server -> client, SSE `data:` payloads)
// ---------------------------------------------------------------------------

export interface OsEventDataMap {
  "turn.started": { message_id: OsId; prompt_preview: string }
  "intent.resolved": { intent: IntentResult }
  "plan.ready": { plan: PresentationPlan }
  "text.delta": { message_id: OsId; delta: string }
  "text.completed": { message_id: OsId; text: string; format: "plain" | "markdown" }
  "a2ui.message": { message: A2UIServerMessage }
  "surface.placed": { placement: SurfacePlacement }
  "mcp_app.placed": { placement: MCPAppPlacement }
  "agent.progress": { progress: AgentProgress }
  "action.result": {
    action_id: OsId
    status: "accepted" | "completed" | "rejected" | "failed"
    message?: string | null
  }
  "turn.completed": { status: "completed" | "cancelled"; usage?: Usage | null }
  "turn.failed": { error: OsError }
  heartbeat: Record<string, never>
}

/**
 * One event on a session stream. `seq` is monotonic per session and is the SSE
 * `id:`; reconnect with `Last-Event-ID` / `?after_seq=` to replay. Heartbeats
 * repeat the last seq and are not persisted.
 */
export type OsEvent = {
  [T in OsEventType]: {
    v: typeof OS_PROTOCOL_VERSION
    seq: number
    session_id: OsId
    turn_id: OsId | null
    ts: Timestamp
    type: T
    data: OsEventDataMap[T]
  }
}[OsEventType]

export type OsEventOf<T extends OsEventType> = Extract<OsEvent, { type: T }>

// ---------------------------------------------------------------------------
// Requests (client -> server)
// ---------------------------------------------------------------------------

export interface AttachmentRef {
  id: OsId
  name: string
  mime_type: string
  size_bytes: number
  kind: "file" | "image" | "audio" | "dataset" | "url"
}

export interface ModelSelection {
  mode: "auto" | "pinned"
  provider?: string | null
  model?: string | null
}

/** POST /v1/os/sessions/{session_id}/turns (or /v1/os/sessions/new/turns). */
export interface TurnRequest {
  /** Client-generated idempotency key; a retry with the same id returns the same turn. */
  client_turn_id: OsId
  prompt: string
  attachments?: AttachmentRef[]
  model?: ModelSelection | null
  project_id?: OsId | null
  context?: {
    active_window_id?: OsId | null
    open_capability_ids?: CapabilityId[]
  }
}

export interface TurnAccepted {
  session_id: OsId
  turn_id: OsId
  /** e.g. "/v1/os/sessions/{id}/stream" */
  stream_path: string
  after_seq: number
}

/** POST /v1/os/sessions/{session_id}/actions — a user interaction on a generated surface. */
export interface UserActionRequest {
  action_id: OsId
  session_id: OsId
  turn_id?: OsId | null
  a2ui: A2UIUserAction
}

/** POST /v1/os/capabilities/{capability_id}/invoke — palette/library/surface invoking a capability action. */
export interface CapabilityInvocation {
  action_id: OsId
  capability_id: CapabilityId
  action: OsId
  input: JsonObject
  session_id?: OsId | null
  project_id?: OsId | null
  presentation?: SurfacePresentationKind | null
}

// ---------------------------------------------------------------------------
// Persisted state: sessions, messages, surfaces, workspaces, windows
// ---------------------------------------------------------------------------

export interface SessionSummary {
  id: OsId
  title: string
  project_id: OsId | null
  created_at: Timestamp
  updated_at: Timestamp
  turn_count: number
  pinned: boolean
  archived: boolean
}

export interface SessionMessage {
  id: OsId
  session_id: OsId
  turn_id: OsId
  role: "user" | "assistant" | "system"
  created_at: Timestamp
  text: string | null
  format: "plain" | "markdown"
  attachments: AttachmentRef[]
  surface_ids: OsId[]
  intent: IntentKind | null
}

/** Server-side snapshot of a surface after applying every A2UI message (for reload/replay). */
export interface StoredSurface {
  surface_id: OsId
  session_id: OsId
  turn_id: OsId
  catalog_id: typeof FORGE_CATALOG_ID
  title: string
  components: A2UIComponent[]
  data_model: JsonObject
  version: number
  updated_at: Timestamp
}

export interface WindowBounds {
  x: number
  y: number
  w: number
  h: number
}

export type WindowKind = "surface" | "capability" | "mcp_app" | "legacy_route"

export interface WindowState {
  id: OsId
  kind: WindowKind
  title: string
  presentation: WindowPresentationKind
  surface_id?: OsId | null
  capability_id?: CapabilityId | null
  app_id?: OsId | null
  /** Only for kind "legacy_route": an in-app path such as "/p/abc/initiatives". */
  route?: string | null
  session_id?: OsId | null
  params?: JsonObject
  bounds?: WindowBounds | null
  z: number
  state: "normal" | "minimized" | "maximized"
  pinned?: boolean
}

/** PUT /v1/os/workspaces/{id} with `version` for optimistic concurrency (409 on mismatch). */
export interface WorkspaceState {
  id: OsId
  name: string
  version: number
  active_session_id: OsId | null
  nav_collapsed: boolean
  layout: "free" | "tiled" | "focus"
  windows: WindowState[]
  updated_at: Timestamp
}

// ---------------------------------------------------------------------------
// Capability registry
// ---------------------------------------------------------------------------

export interface ApiBinding {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "WS"
  /** Backend path template, e.g. "/v1/projects/{project_id}/kernel/runs". */
  path: string
  stream: "none" | "sse" | "websocket"
}

export interface CapabilityAction {
  id: OsId
  title: string
  permissions: Permission[]
  destructive: boolean
  requires_confirmation: boolean
  input_schema: JsonObject
}

export type CapabilityRenderer =
  | { kind: "legacy_route"; route: string }
  | { kind: "component"; component_key: string }
  | { kind: "a2ui"; catalog_id: typeof FORGE_CATALOG_ID }
  | { kind: "mcp_app"; app_id: OsId }

export interface CapabilityDescriptor {
  id: CapabilityId
  version: number
  title: string
  summary: string
  category: CapabilityCategory
  intents: IntentKind[]
  keywords: string[]
  permissions: Permission[]
  requires_project: boolean
  admin_only: boolean
  min_plan: "free" | "standard" | "pro" | "enterprise" | null
  entry_points: EntryPoint[]
  surfaces: SurfacePresentationKind[]
  default_surface: SurfacePresentationKind
  renderer: CapabilityRenderer
  actions: CapabilityAction[]
  input_schema: JsonObject
  output_schema: JsonObject
  api_bindings: ApiBinding[]
  persistence: PersistenceRule
  /** Old routes this capability replaces; they must keep working (redirect or render). */
  legacy_routes: string[]
  status: "available" | "beta" | "deprecated" | "hidden"
}

/** GET /v1/os/capabilities — filtered server-side to what the caller may use. */
export interface CapabilityCatalog {
  version: number
  capabilities: CapabilityDescriptor[]
}

/** Coverage row: every existing feature/route maps to one capability (docs/os/CAPABILITY_MATRIX.md). */
export interface CapabilityIndexEntry {
  id: CapabilityId
  title: string
  category: CapabilityCategory
  intents: IntentKind[]
  default_surface: SurfacePresentationKind
  requires_project: boolean
  admin_only: boolean
  legacy_routes: string[]
  /** existing = has UI today; existing_backend_only = API without UI; new = net-new for the OS. */
  origin: "existing" | "existing_backend_only" | "new"
  /** Workstream that builds the descriptor + surface (docs/os/IMPLEMENTATION_PLAN.md). */
  owner: "WS-A" | "WS-B" | "WS-C" | "WS-D"
}

/** ./schemas/capability-index.json — the seed WS-D grows into full CapabilityDescriptors. */
export interface CapabilityIndex {
  version: number
  /** Public routes rendered outside the OS shell (landing, auth, docs, legal). */
  outside_shell_routes: string[]
  capabilities: CapabilityIndexEntry[]
}

/** Schema `$defs` names that ./validate.ts can check a payload against. */
export const CONTRACT_DEFS = [
  "OsEvent",
  "A2UIServerMessage",
  "A2UIUserAction",
  "IntentResult",
  "PresentationPlan",
  "SurfacePlacement",
  "TurnRequest",
  "TurnAccepted",
  "UserActionRequest",
  "CapabilityInvocation",
  "SessionSummary",
  "SessionMessage",
  "StoredSurface",
  "WindowState",
  "WorkspaceState",
  "CapabilityDescriptor",
  "CapabilityCatalog",
  "CapabilityIndex",
] as const
export type ContractDef = (typeof CONTRACT_DEFS)[number]
