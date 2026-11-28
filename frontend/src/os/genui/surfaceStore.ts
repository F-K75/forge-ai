/**
 * Surface store (WS-B): the client-side state of every generated surface.
 *
 * Applies A2UI v1.0 server messages strictly in stream order:
 *  - `createSurface` creates (or re-creates) a surface with its components and
 *    data model;
 *  - `updateComponents` upserts components by id;
 *  - `updateDataModel` sets (or, without `value`, removes) a value at `path`;
 *  - `deleteSurface` removes the surface.
 * Updates for a surface that was never created are ignored (A2UI requires
 * `createSurface` first). Events already applied (`seq` ≤ the session's last
 * applied seq) are skipped, so stream replays are idempotent.
 *
 * Defence in depth: the stream client already validated each event, but every
 * message is validated again here (envelope + Forge catalog). Invalid
 * components are dropped individually and recorded in `dropped`; a message
 * that fails envelope validation, or a surface whose create was rejected,
 * marks the surface `failed` so SurfaceView shows the text fallback. Size caps
 * reject oversized component sets and data models.
 *
 * Also tracks `surface.placed`, `mcp_app.placed`, `agent.progress` and
 * `action.result` so the shell, ExecutionTimeline and action buttons can read
 * them from one place.
 */
import { createStore, type StoreApi } from "zustand/vanilla"
import type {
  A2UIComponent,
  A2UIServerMessage,
  AgentProgress,
  JsonObject,
  MCPAppPlacement,
  OsEvent,
  OsId,
  StoredSurface,
  SurfacePlacement,
  Timestamp,
} from "../contracts"
import { validateComponent, validateContract } from "../validate"
import { removeAt, setAt } from "./binding"

export const MAX_COMPONENTS_PER_SURFACE = 1000
export const MAX_DATA_MODEL_BYTES = 2 * 1024 * 1024
export const MAX_PROGRESS_EVENTS_PER_RUN = 500
export const ROOT_COMPONENT_ID = "root"

export interface ValidationIssue {
  path: string
  message: string
}

export interface DroppedComponent {
  id: string | null
  component: string | null
  errors: ValidationIssue[]
}

export interface SurfaceState {
  surfaceId: OsId
  sessionId: OsId | null
  turnId: OsId | null
  catalogId: string
  components: Record<string, A2UIComponent>
  dataModel: JsonObject
  sendDataModel: boolean
  /** Number of messages applied (StoredSurface.version after hydrate). */
  version: number
  dropped: DroppedComponent[]
  updatedAt: Timestamp | null
}

export interface SurfaceFailure {
  surfaceId: OsId
  reason: string
  errors: ValidationIssue[]
}

export type ActionStatus = "pending" | "accepted" | "completed" | "rejected" | "failed"

export interface ActionEntry {
  actionId: OsId
  surfaceId: OsId
  componentId: string
  name: string
  status: ActionStatus
  message: string | null
}

export interface ProgressEntry extends AgentProgress {
  seq: number
  ts: Timestamp
}

export interface ApplyResult {
  ok: boolean
  errors: ValidationIssue[]
}

export interface GenUIState {
  surfaces: Record<OsId, SurfaceState>
  failures: Record<OsId, SurfaceFailure>
  placements: Record<OsId, SurfacePlacement>
  mcpApps: Record<OsId, MCPAppPlacement>
  actions: Record<OsId, ActionEntry>
  /** Keyed by `runKey(project_id, run_id)`. */
  progress: Record<string, ProgressEntry[]>
  lastSeq: Record<OsId, number>

  applyMessage: (message: unknown, meta?: { sessionId?: OsId | null; turnId?: OsId | null; ts?: Timestamp }) => ApplyResult
  /** Route one (already validated) stream event into the store. */
  applyEvent: (event: OsEvent) => void
  /** Record an event the stream client rejected; marks the affected surface failed. */
  rejectEvent: (raw: unknown, errors: ValidationIssue[]) => void
  hydrate: (snapshots: readonly unknown[], opts?: { sessionId?: OsId; lastSeq?: number }) => ApplyResult
  writeData: (surfaceId: OsId, pointer: string, value: unknown) => boolean
  beginAction: (entry: Omit<ActionEntry, "status" | "message">) => void
  settleAction: (actionId: OsId, status: Exclude<ActionStatus, "pending">, message?: string | null) => void
  reset: () => void
}

export type SurfaceStore = StoreApi<GenUIState>

export function runKey(projectId: string, runId: string): string {
  return `${projectId}/${runId}`
}

function jsonSize(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function filterComponents(list: unknown[]): { kept: A2UIComponent[]; dropped: DroppedComponent[] } {
  const kept: A2UIComponent[] = []
  const dropped: DroppedComponent[] = []
  for (const c of list) {
    const result = validateComponent(c)
    if (result.valid) {
      kept.push(c as A2UIComponent)
    } else {
      const raw = (typeof c === "object" && c !== null ? c : {}) as Record<string, unknown>
      dropped.push({
        id: typeof raw.id === "string" ? raw.id : null,
        component: typeof raw.component === "string" ? raw.component : null,
        errors: result.errors,
      })
    }
  }
  return { kept, dropped }
}

function surfaceIdOf(message: unknown): string | null {
  if (typeof message !== "object" || message === null) return null
  for (const key of ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"]) {
    const body = (message as Record<string, unknown>)[key]
    if (typeof body === "object" && body !== null) {
      const id = (body as Record<string, unknown>).surfaceId
      if (typeof id === "string" && id.length > 0 && id.length <= 128) return id
    }
  }
  return null
}

const EMPTY = {
  surfaces: {},
  failures: {},
  placements: {},
  mcpApps: {},
  actions: {},
  progress: {},
  lastSeq: {},
}

export function createSurfaceStore(): SurfaceStore {
  return createStore<GenUIState>()((set, get) => {
    const fail = (surfaceId: string, reason: string, errors: ValidationIssue[]) => {
      console.warn(`[genui] surface ${surfaceId} failed: ${reason}`, errors)
      set((s) => {
        const surfaces = { ...s.surfaces }
        delete surfaces[surfaceId]
        return { surfaces, failures: { ...s.failures, [surfaceId]: { surfaceId, reason, errors } } }
      })
    }

    const applyMessage: GenUIState["applyMessage"] = (message, meta = {}) => {
      const envelope = validateContract("A2UIServerMessage", message)
      const sid = surfaceIdOf(message)
      if (!envelope.valid) {
        if (sid) fail(sid, "invalid A2UI message", envelope.errors)
        return { ok: false, errors: envelope.errors }
      }
      const m = message as A2UIServerMessage
      const ts = meta.ts ?? null

      if ("createSurface" in m) {
        const body = m.createSurface
        const { kept, dropped } = filterComponents(body.components ?? [])
        const dataModel = body.dataModel ?? {}
        if (jsonSize(dataModel) > MAX_DATA_MODEL_BYTES) {
          const errors = [{ path: "/createSurface/dataModel", message: "data model exceeds size limit" }]
          fail(body.surfaceId, "oversized data model", errors)
          return { ok: false, errors }
        }
        const components: Record<string, A2UIComponent> = {}
        for (const c of kept) components[c.id] = c
        set((s) => {
          const failures = { ...s.failures }
          delete failures[body.surfaceId]
          return {
            failures,
            surfaces: {
              ...s.surfaces,
              [body.surfaceId]: {
                surfaceId: body.surfaceId,
                sessionId: meta.sessionId ?? null,
                turnId: meta.turnId ?? null,
                catalogId: body.catalogId,
                components,
                dataModel,
                sendDataModel: body.sendDataModel === true,
                version: 1,
                dropped,
                updatedAt: ts,
              },
            },
          }
        })
        return { ok: dropped.length === 0, errors: dropped.flatMap((d) => d.errors) }
      }

      if ("deleteSurface" in m) {
        const id = m.deleteSurface.surfaceId
        set((s) => {
          const surfaces = { ...s.surfaces }
          const failures = { ...s.failures }
          const placements = { ...s.placements }
          delete surfaces[id]
          delete failures[id]
          delete placements[id]
          return { surfaces, failures, placements }
        })
        return { ok: true, errors: [] }
      }

      const id = "updateComponents" in m ? m.updateComponents.surfaceId : m.updateDataModel.surfaceId
      const current = get().surfaces[id]
      if (!current) {
        const errors = [{ path: "/surfaceId", message: `surface ${id} has not been created` }]
        console.warn(`[genui] ignoring update for unknown surface ${id}`)
        return { ok: false, errors }
      }

      if ("updateComponents" in m) {
        const { kept, dropped } = filterComponents(m.updateComponents.components)
        const components = { ...current.components }
        for (const c of kept) components[c.id] = c
        if (Object.keys(components).length > MAX_COMPONENTS_PER_SURFACE) {
          const errors = [{ path: "/updateComponents/components", message: "surface exceeds the component limit" }]
          return { ok: false, errors }
        }
        set((s) => ({
          surfaces: {
            ...s.surfaces,
            [id]: {
              ...current,
              components,
              dropped: [...current.dropped, ...dropped].slice(-100),
              version: current.version + 1,
              updatedAt: ts ?? current.updatedAt,
            },
          },
        }))
        return { ok: dropped.length === 0, errors: dropped.flatMap((d) => d.errors) }
      }

      const { path = "", value } = m.updateDataModel
      let next: unknown
      try {
        next = "value" in m.updateDataModel ? setAt(current.dataModel, path, value) : removeAt(current.dataModel, path)
      } catch (err) {
        const errors = [{ path: "/updateDataModel/path", message: (err as Error).message }]
        return { ok: false, errors }
      }
      if (typeof next !== "object" || next === null || Array.isArray(next)) {
        const errors = [{ path: "/updateDataModel/value", message: "the data model root must be an object" }]
        return { ok: false, errors }
      }
      if (jsonSize(next) > MAX_DATA_MODEL_BYTES) {
        const errors = [{ path: "/updateDataModel/value", message: "data model exceeds size limit" }]
        return { ok: false, errors }
      }
      set((s) => ({
        surfaces: {
          ...s.surfaces,
          [id]: { ...current, dataModel: next as JsonObject, version: current.version + 1, updatedAt: ts ?? current.updatedAt },
        },
      }))
      return { ok: true, errors: [] }
    }

    const applyEvent: GenUIState["applyEvent"] = (event) => {
      const last = get().lastSeq[event.session_id] ?? 0
      if (event.type === "heartbeat") return
      if (event.seq <= last) return
      set((s) => ({ lastSeq: { ...s.lastSeq, [event.session_id]: event.seq } }))
      switch (event.type) {
        case "a2ui.message":
          applyMessage(event.data.message, { sessionId: event.session_id, turnId: event.turn_id, ts: event.ts })
          return
        case "surface.placed": {
          const p = event.data.placement
          set((s) => ({ placements: { ...s.placements, [p.surface_id]: p } }))
          return
        }
        case "mcp_app.placed": {
          const p = event.data.placement
          set((s) => ({ mcpApps: { ...s.mcpApps, [p.app_id]: p } }))
          return
        }
        case "agent.progress": {
          const p = event.data.progress
          const key = runKey(p.project_id, p.run_id)
          set((s) => ({
            progress: {
              ...s.progress,
              [key]: [...(s.progress[key] ?? []), { ...p, seq: event.seq, ts: event.ts }].slice(-MAX_PROGRESS_EVENTS_PER_RUN),
            },
          }))
          return
        }
        case "action.result": {
          const { action_id, status, message } = event.data
          get().settleAction(action_id, status === "accepted" ? "accepted" : status, message ?? null)
          return
        }
        default:
          return
      }
    }

    return {
      ...EMPTY,
      applyMessage,
      applyEvent,
      rejectEvent: (raw, errors) => {
        const e = raw as { type?: unknown; data?: { message?: unknown } } | null
        if (e && e.type === "a2ui.message") {
          const sid = surfaceIdOf(e.data?.message)
          if (sid) fail(sid, "rejected by stream validation", errors)
        }
      },
      hydrate: (snapshots, opts = {}) => {
        const errors: ValidationIssue[] = []
        const surfaces: Record<string, SurfaceState> = {}
        snapshots.forEach((snap, i) => {
          // Components are checked one by one below, so validate the envelope without them.
          const shell =
            typeof snap === "object" && snap !== null ? { ...(snap as Record<string, unknown>), components: [] } : snap
          const env = validateContract("StoredSurface", shell)
          if (!env.valid) {
            errors.push(...env.errors.map((e) => ({ path: `/${i}${e.path}`, message: e.message })))
            return
          }
          const s = snap as StoredSurface
          if (!Array.isArray(s.components) || s.components.length > MAX_COMPONENTS_PER_SURFACE || jsonSize(s.data_model) > MAX_DATA_MODEL_BYTES) {
            errors.push({ path: `/${i}`, message: "snapshot exceeds size limits" })
            return
          }
          const { kept, dropped } = filterComponents(s.components)
          const components: Record<string, A2UIComponent> = {}
          for (const c of kept) components[c.id] = c
          surfaces[s.surface_id] = {
            surfaceId: s.surface_id,
            sessionId: s.session_id,
            turnId: s.turn_id,
            catalogId: s.catalog_id,
            components,
            dataModel: s.data_model,
            sendDataModel: false,
            version: s.version,
            dropped,
            updatedAt: s.updated_at,
          }
        })
        set((st) => ({
          surfaces: { ...st.surfaces, ...surfaces },
          lastSeq:
            opts.sessionId && typeof opts.lastSeq === "number"
              ? { ...st.lastSeq, [opts.sessionId]: Math.max(st.lastSeq[opts.sessionId] ?? 0, opts.lastSeq) }
              : st.lastSeq,
        }))
        return { ok: errors.length === 0, errors }
      },
      writeData: (surfaceId, pointer, value) => {
        const current = get().surfaces[surfaceId]
        if (!current) return false
        let next: unknown
        try {
          next = setAt(current.dataModel, pointer, value)
        } catch {
          return false
        }
        if (typeof next !== "object" || next === null || Array.isArray(next) || jsonSize(next) > MAX_DATA_MODEL_BYTES) return false
        set((s) => ({ surfaces: { ...s.surfaces, [surfaceId]: { ...current, dataModel: next as JsonObject } } }))
        return true
      },
      beginAction: (entry) =>
        set((s) => ({ actions: { ...s.actions, [entry.actionId]: { ...entry, status: "pending", message: null } } })),
      settleAction: (actionId, status, message = null) =>
        set((s) => {
          const prev = s.actions[actionId]
          if (!prev) return {}
          return { actions: { ...s.actions, [actionId]: { ...prev, status, message } } }
        }),
      reset: () => set({ ...EMPTY }),
    }
  })
}

/** True while an action dispatched from this component awaits its result. */
export function isComponentPending(state: GenUIState, surfaceId: string, componentId: string): boolean {
  for (const a of Object.values(state.actions)) {
    if (a.surfaceId === surfaceId && a.componentId === componentId && (a.status === "pending" || a.status === "accepted"))
      return true
  }
  return false
}

/** Handlers that connect a stream subscription to a store (WS-A passes these to subscribeSession). */
export function surfaceStreamHandlers(store: SurfaceStore) {
  return {
    onEvent: (event: OsEvent) => store.getState().applyEvent(event),
    onInvalid: (raw: unknown, errors: ValidationIssue[]) => store.getState().rejectEvent(raw, errors),
  }
}

/** The app-wide store used when no GenUIProvider supplies one. */
export const defaultSurfaceStore: SurfaceStore = createSurfaceStore()
