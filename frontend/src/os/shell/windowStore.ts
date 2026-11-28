/**
 * Window manager state (zustand). The persisted part is exactly the contract
 * `WorkspaceState` (windows, layout, nav, active session); `workspaceClient`
 * mirrors it to localStorage and the server. Everything else here (the
 * workspace area size) is device-local and never persisted.
 */
import { create } from "zustand"
import type {
  CapabilityId,
  JsonObject,
  OsId,
  WindowBounds,
  WindowKind,
  WindowPresentationKind,
  WindowState,
  WorkspaceState,
} from "../contracts"
import { newId, nowIso } from "./ids"

/** Schema cap on `WorkspaceState.windows`. */
export const MAX_WINDOWS = 24
export const MIN_WINDOW_W = 320
export const MIN_WINDOW_H = 220
const TILE_GAP = 12
const CASCADE_STEP = 28

export type SizeHint = "compact" | "regular" | "large"

export interface OpenWindowSpec {
  kind: WindowKind
  title: string
  presentation?: WindowPresentationKind
  surface_id?: OsId | null
  capability_id?: CapabilityId | null
  app_id?: OsId | null
  route?: string | null
  session_id?: OsId | null
  params?: JsonObject
  size_hint?: SizeHint
  /** Default true: raise and focus the window. */
  focus?: boolean
}

export interface WorkspaceArea {
  w: number
  h: number
}

export function emptyWorkspace(): WorkspaceState {
  return {
    id: "ws_default",
    name: "My workspace",
    version: 0,
    active_session_id: null,
    nav_collapsed: false,
    layout: "free",
    windows: [],
    updated_at: nowIso(),
  }
}

/** A window belongs to the active session, is global (no session) or pinned. */
export function isWindowVisible(w: WindowState, activeSessionId: OsId | null): boolean {
  return !w.session_id || w.session_id === activeSessionId || w.pinned === true
}

/** The focused window: highest z among visible, non-minimised windows. */
export function focusedWindow(ws: WorkspaceState): WindowState | null {
  let top: WindowState | null = null
  for (const w of ws.windows) {
    if (w.state === "minimized" || !isWindowVisible(w, ws.active_session_id)) continue
    if (!top || w.z > top.z) top = w
  }
  return top
}

/** Identity used to de-duplicate opens: the same surface/capability/route focuses the existing window. */
export function windowKey(w: Pick<WindowState, "kind" | "surface_id" | "capability_id" | "route" | "app_id" | "params">): string {
  switch (w.kind) {
    case "surface":
      return `surface:${w.surface_id ?? ""}`
    case "legacy_route":
      return `route:${w.route ?? ""}`
    case "mcp_app":
      return `app:${w.app_id ?? ""}`
    case "capability":
      return `cap:${w.capability_id ?? ""}:${JSON.stringify(w.params ?? {})}`
  }
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

export function defaultSize(hint: SizeHint | undefined, area: WorkspaceArea): { w: number; h: number } {
  const ratio = hint === "compact" ? [0.38, 0.5] : hint === "large" ? [0.72, 0.8] : [0.56, 0.68]
  return {
    w: Math.round(clamp(area.w * ratio[0]!, MIN_WINDOW_W, Math.max(MIN_WINDOW_W, area.w - 32))),
    h: Math.round(clamp(area.h * ratio[1]!, MIN_WINDOW_H, Math.max(MIN_WINDOW_H, area.h - 32))),
  }
}

/** Cascade new windows from the centre so consecutive opens don't stack exactly. */
export function cascadeBounds(index: number, hint: SizeHint | undefined, area: WorkspaceArea): WindowBounds {
  const { w, h } = defaultSize(hint, area)
  const step = (index % 6) * CASCADE_STEP
  const x = clamp(Math.round((area.w - w) / 2) + step - 2 * CASCADE_STEP, 8, Math.max(8, area.w - w - 8))
  const y = clamp(Math.round((area.h - h) / 3) + step - CASCADE_STEP, 8, Math.max(8, area.h - h - 8))
  return { x, y, w, h }
}

/** Grid bounds for `n` windows filling `area` (used by tile). */
export function tileBounds(n: number, area: WorkspaceArea): WindowBounds[] {
  if (n <= 0) return []
  const cols = n <= 3 ? n : Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)
  const cw = (area.w - TILE_GAP * (cols + 1)) / cols
  const ch = (area.h - TILE_GAP * (rows + 1)) / rows
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols)
    const c = i % cols
    // The last row stretches when it has fewer windows.
    const inRow = r === rows - 1 ? n - cols * (rows - 1) : cols
    const w = (area.w - TILE_GAP * (inRow + 1)) / inRow
    return {
      x: Math.round(TILE_GAP + c * (w + TILE_GAP)),
      y: Math.round(TILE_GAP + r * (ch + TILE_GAP)),
      w: Math.round(inRow === cols ? cw : w),
      h: Math.round(ch),
    }
  })
}

/** Shrink/shift bounds so the window fits `area`; returns the same object when it already fits. */
export function fitBounds(b: WindowBounds, area: WorkspaceArea): WindowBounds {
  const w = Math.max(MIN_WINDOW_W, Math.min(b.w, area.w - 16))
  const h = Math.max(MIN_WINDOW_H, Math.min(b.h, area.h - 16))
  const x = clamp(b.x, 8, Math.max(8, area.w - w - 8))
  const y = clamp(b.y, 8, Math.max(8, area.h - h - 8))
  return x === b.x && y === b.y && w === b.w && h === b.h ? b : { x, y, w, h }
}

function maxZ(windows: WindowState[]): number {
  return windows.reduce((m, w) => Math.max(m, w.z), 0)
}

/** Keep z small and dense (schema: integer >= 0) while preserving order. */
function normaliseZ(windows: WindowState[]): WindowState[] {
  if (maxZ(windows) < 10_000) return windows
  const order = [...windows].sort((a, b) => a.z - b.z).map((w) => w.id)
  return windows.map((w) => ({ ...w, z: order.indexOf(w.id) + 1 }))
}

export interface WindowStoreState {
  workspace: WorkspaceState
  area: WorkspaceArea
  setArea: (area: WorkspaceArea) => void
  hydrate: (ws: WorkspaceState) => void
  open: (spec: OpenWindowSpec) => OsId
  focus: (id: OsId) => void
  close: (id: OsId) => void
  closeAll: () => void
  minimize: (id: OsId) => void
  /** Minimise every visible window (shows the conversation). */
  minimizeAll: () => void
  restore: (id: OsId) => void
  toggleMaximize: (id: OsId) => void
  setBounds: (id: OsId, bounds: WindowBounds) => void
  setPresentation: (id: OsId, presentation: WindowPresentationKind) => void
  setTitle: (id: OsId, title: string) => void
  setRoute: (id: OsId, route: string) => void
  togglePin: (id: OsId) => void
  tile: () => void
  cycleFocus: (direction?: 1 | -1) => void
  setNavCollapsed: (collapsed: boolean) => void
  setActiveSession: (sessionId: OsId | null) => void
}

function touch(ws: WorkspaceState, patch: Partial<WorkspaceState>): WorkspaceState {
  const next = { ...ws, ...patch, updated_at: nowIso() }
  if (patch.windows) next.windows = normaliseZ(patch.windows)
  return next
}

function mapWindow(ws: WorkspaceState, id: OsId, fn: (w: WindowState) => WindowState): WorkspaceState {
  if (!ws.windows.some((w) => w.id === id)) return ws
  return touch(ws, { windows: ws.windows.map((w) => (w.id === id ? fn(w) : w)) })
}

export const useWindowStore = create<WindowStoreState>()((set, get) => ({
  workspace: emptyWorkspace(),
  area: { w: 1200, h: 760 },

  setArea: (area) => {
    const cur = get().area
    if (cur.w === area.w && cur.h === area.h) return
    // Phones show sheets; keep desktop bounds untouched.
    if (area.w < 640 || area.h < 160) return set({ area })
    set({ area })
    const ws = get().workspace
    if (ws.layout === "tiled") return get().tile()
    // Keep every window inside the (possibly smaller) workspace area.
    let changed = false
    const windows = ws.windows.map((w) => {
      if (!w.bounds) return w
      const b = fitBounds(w.bounds, area)
      if (b === w.bounds) return w
      changed = true
      return { ...w, bounds: b }
    })
    if (changed) set({ workspace: { ...ws, windows } })
  },

  hydrate: (ws) => set({ workspace: { ...ws, windows: normaliseZ(ws.windows) } }),

  open: (spec) => {
    const { workspace: ws, area } = get()
    const presentation = spec.presentation ?? "window"
    const candidate = {
      kind: spec.kind,
      surface_id: spec.surface_id ?? null,
      capability_id: spec.capability_id ?? null,
      route: spec.route ?? null,
      app_id: spec.app_id ?? null,
      params: spec.params ?? {},
    }
    const key = windowKey(candidate)
    const existing = ws.windows.find((w) => windowKey(w) === key)
    const z = maxZ(ws.windows) + 1
    if (existing) {
      set({
        workspace: mapWindow(ws, existing.id, (w) => ({
          ...w,
          title: spec.title || w.title,
          presentation: spec.presentation ?? w.presentation,
          state: w.state === "minimized" ? "normal" : w.state,
          session_id: w.session_id && w.session_id !== ws.active_session_id ? ws.active_session_id : w.session_id,
          z: spec.focus === false ? w.z : z,
        })),
      })
      return existing.id
    }
    const id = newId("win")
    const visibleCount = ws.windows.filter((w) => isWindowVisible(w, ws.active_session_id)).length
    const win: WindowState = {
      id,
      kind: spec.kind,
      title: spec.title.slice(0, 200) || "Untitled",
      presentation,
      surface_id: candidate.surface_id,
      capability_id: candidate.capability_id,
      app_id: candidate.app_id,
      route: candidate.route,
      session_id: spec.session_id ?? null,
      params: candidate.params,
      bounds: cascadeBounds(visibleCount, spec.size_hint, area),
      z: spec.focus === false ? 1 : z,
      state: presentation === "fullscreen" ? "maximized" : "normal",
      pinned: false,
    }
    let windows = [...ws.windows, win]
    if (windows.length > MAX_WINDOWS) {
      // Evict the least recently focused, unpinned window.
      const victim = [...windows].filter((w) => !w.pinned && w.id !== id).sort((a, b) => a.z - b.z)[0]
      if (victim) windows = windows.filter((w) => w.id !== victim.id)
    }
    set({ workspace: touch(ws, { windows, layout: ws.layout === "tiled" ? "free" : ws.layout }) })
    return id
  },

  focus: (id) => {
    const ws = get().workspace
    const z = maxZ(ws.windows) + 1
    const target = ws.windows.find((w) => w.id === id)
    if (!target) return
    if (target.z === z - 1 && target.state !== "minimized") return
    set({
      workspace: mapWindow(ws, id, (w) => ({ ...w, z, state: w.state === "minimized" ? "normal" : w.state })),
    })
  },

  close: (id) => {
    const ws = get().workspace
    set({ workspace: touch(ws, { windows: ws.windows.filter((w) => w.id !== id) }) })
  },

  closeAll: () => {
    const ws = get().workspace
    set({
      workspace: touch(ws, {
        windows: ws.windows.filter((w) => !isWindowVisible(w, ws.active_session_id)),
      }),
    })
  },

  minimize: (id) => set({ workspace: mapWindow(get().workspace, id, (w) => ({ ...w, state: "minimized" })) }),

  minimizeAll: () => {
    const ws = get().workspace
    set({
      workspace: touch(ws, {
        windows: ws.windows.map((w) =>
          isWindowVisible(w, ws.active_session_id) && w.presentation !== "panel" ? { ...w, state: "minimized" } : w,
        ),
      }),
    })
  },

  restore: (id) => get().focus(id),

  toggleMaximize: (id) => {
    const ws = get().workspace
    const z = maxZ(ws.windows) + 1
    set({
      workspace: mapWindow(ws, id, (w) => ({
        ...w,
        z,
        state: w.state === "maximized" ? "normal" : "maximized",
        presentation: w.state === "maximized" && w.presentation === "fullscreen" ? "window" : w.presentation,
      })),
    })
  },

  setBounds: (id, bounds) => {
    const ws = get().workspace
    const next = mapWindow(ws, id, (w) => ({
      ...w,
      bounds: {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        w: Math.round(Math.max(MIN_WINDOW_W, bounds.w)),
        h: Math.round(Math.max(MIN_WINDOW_H, bounds.h)),
      },
    }))
    set({ workspace: next.layout === "tiled" ? { ...next, layout: "free" } : next })
  },

  setPresentation: (id, presentation) => {
    const ws = get().workspace
    const z = maxZ(ws.windows) + 1
    set({
      workspace: mapWindow(ws, id, (w) => ({
        ...w,
        presentation,
        z,
        state: presentation === "fullscreen" ? "maximized" : "normal",
      })),
    })
  },

  setTitle: (id, title) => {
    const t = title.trim().slice(0, 200)
    if (!t) return
    const ws = get().workspace
    if (ws.windows.find((w) => w.id === id)?.title === t) return
    set({ workspace: mapWindow(ws, id, (w) => ({ ...w, title: t })) })
  },

  setRoute: (id, route) => {
    if (!route.startsWith("/")) return
    const ws = get().workspace
    if (ws.windows.find((w) => w.id === id)?.route === route) return
    set({ workspace: mapWindow(ws, id, (w) => ({ ...w, route: route.slice(0, 512) })) })
  },

  togglePin: (id) => set({ workspace: mapWindow(get().workspace, id, (w) => ({ ...w, pinned: !w.pinned })) }),

  tile: () => {
    const { workspace: ws, area } = get()
    const targets = ws.windows
      .filter(
        (w) =>
          isWindowVisible(w, ws.active_session_id) &&
          w.state !== "minimized" &&
          w.presentation !== "panel",
      )
      .sort((a, b) => a.z - b.z)
    const bounds = tileBounds(targets.length, area)
    const byId = new Map(targets.map((w, i) => [w.id, bounds[i]!]))
    set({
      workspace: touch(ws, {
        layout: "tiled",
        windows: ws.windows.map((w) =>
          byId.has(w.id)
            ? { ...w, bounds: byId.get(w.id)!, state: "normal", presentation: "window" }
            : w,
        ),
      }),
    })
  },

  cycleFocus: (direction = 1) => {
    const ws = get().workspace
    const visible = ws.windows
      .filter((w) => isWindowVisible(w, ws.active_session_id))
      .sort((a, b) => a.z - b.z)
    if (visible.length < 2) {
      if (visible[0]) get().focus(visible[0].id)
      return
    }
    const top = focusedWindow(ws)
    if (direction === 1) {
      // Bring the bottom-most window to the front (like ⌘` on macOS).
      get().focus(visible[0]!.id)
    } else if (top) {
      // Send the top window to the back.
      const minZ = Math.min(...visible.map((w) => w.z))
      set({ workspace: mapWindow(ws, top.id, (w) => ({ ...w, z: Math.max(0, minZ - 1) })) })
    }
  },

  setNavCollapsed: (collapsed) => {
    const ws = get().workspace
    if (ws.nav_collapsed === collapsed) return
    set({ workspace: touch(ws, { nav_collapsed: collapsed }) })
  },

  setActiveSession: (sessionId) => {
    const ws = get().workspace
    if (ws.active_session_id === sessionId) return
    set({ workspace: touch(ws, { active_session_id: sessionId }) })
  },
}))
