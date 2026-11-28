/**
 * Workspace persistence (seam 4, WS-A <-> WS-C).
 *
 *  1. First paint comes from the localStorage mirror (instant, offline-safe).
 *  2. Live mode then loads `GET /v1/os/workspaces/current` and reconciles.
 *  3. Every change is mirrored to localStorage immediately and `PUT` to the
 *     server, debounced, carrying the last server `version`.
 *  4. On `409` the client re-reads the server copy and merges: the server wins
 *     on workspace-level fields, window-local changes made since the last sync
 *     are re-applied on top (3-way merge against the last synced copy).
 */
import type { OsId, WindowState, WorkspaceState } from "../contracts"
import { validateContract } from "../validate"
import { emptyWorkspace, useWindowStore } from "./windowStore"

export const WORKSPACE_STORAGE_KEY = "forge-os-workspace"
export const PUT_DEBOUNCE_MS = 800

export interface WorkspaceTransport {
  getCurrent: () => Promise<WorkspaceState>
  /** Resolves with the server copy (new version). Rejects with `{ status: 409 }` on a version conflict. */
  put: (ws: WorkspaceState) => Promise<WorkspaceState>
}

function isValidWorkspace(value: unknown): value is WorkspaceState {
  return validateContract("WorkspaceState", value).valid
}

export function loadLocalWorkspace(storage: Storage | null = safeStorage()): WorkspaceState {
  try {
    const raw = storage?.getItem(WORKSPACE_STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isValidWorkspace(parsed)) return parsed
    }
  } catch {
    // Corrupt mirror: start clean.
  }
  return emptyWorkspace()
}

export function saveLocalWorkspace(ws: WorkspaceState, storage: Storage | null = safeStorage()) {
  try {
    storage?.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(ws))
  } catch {
    // Quota or private mode: the server copy (live) is still authoritative.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

function sameWindow(a: WindowState, b: WindowState): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 3-way merge after a 409. `base` is the last copy both sides agreed on.
 * Workspace-level fields come from the server. For windows:
 * - added locally (not in base)        -> kept
 * - deleted locally (in base, not local) -> dropped
 * - changed locally vs base             -> local copy wins (window-local change)
 * - unchanged locally                   -> server copy (or dropped if the server deleted it)
 * - added on the server                 -> kept
 */
export function mergeWorkspace(
  base: WorkspaceState | null,
  local: WorkspaceState,
  server: WorkspaceState,
): WorkspaceState {
  const baseById = new Map((base?.windows ?? []).map((w) => [w.id, w]))
  const localById = new Map(local.windows.map((w) => [w.id, w]))
  const out: WindowState[] = []
  const seen = new Set<OsId>()

  for (const sw of server.windows) {
    seen.add(sw.id)
    const bw = baseById.get(sw.id)
    const lw = localById.get(sw.id)
    if (!lw) {
      // Deleted locally only if it existed in base; otherwise it's new on the server.
      if (!bw) out.push(sw)
      continue
    }
    if (bw && sameWindow(bw, lw)) out.push(sw)
    else out.push(lw)
  }
  for (const lw of local.windows) {
    if (seen.has(lw.id)) continue
    const bw = baseById.get(lw.id)
    if (!bw) out.push(lw) // added locally
    else if (!sameWindow(bw, lw)) out.push(lw) // server deleted it, but we changed it: keep ours
    // else: server deleted an unchanged window -> drop
  }
  return { ...server, windows: out.slice(-24) }
}

export interface WorkspaceSyncHandle {
  stop: () => void
  /** Flush a pending PUT immediately (tests, beforeunload). */
  flush: () => Promise<void>
}

/**
 * Wire the window store to localStorage (+ the server when a transport is
 * given). Call once when the OS shell mounts.
 */
export function startWorkspaceSync(opts: {
  transport?: WorkspaceTransport | null
  storage?: Storage | null
  debounceMs?: number
} = {}): WorkspaceSyncHandle {
  const storage = opts.storage === undefined ? safeStorage() : opts.storage
  const transport = opts.transport ?? null
  const debounceMs = opts.debounceMs ?? PUT_DEBOUNCE_MS
  let base: WorkspaceState | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let inflight: Promise<void> | null = null
  let dirty = false
  let applyingServer = false
  let stopped = false

  const store = useWindowStore
  store.getState().hydrate(loadLocalWorkspace(storage))

  const applyServer = (ws: WorkspaceState) => {
    applyingServer = true
    store.getState().hydrate(ws)
    applyingServer = false
    saveLocalWorkspace(ws, storage)
  }

  const push = async (): Promise<void> => {
    if (!transport || stopped) return
    dirty = false
    const local = store.getState().workspace
    try {
      const saved = await transport.put({ ...local, version: base?.version ?? local.version })
      base = saved
      // Keep local edits made while the PUT was in flight.
      const now = store.getState().workspace
      applyServer(now === local ? saved : { ...now, version: saved.version })
    } catch (err) {
      if ((err as { status?: number })?.status === 409 || (err as { response?: { status?: number } })?.response?.status === 409) {
        const server = await transport.getCurrent()
        const merged = mergeWorkspace(base, store.getState().workspace, server)
        base = server
        applyServer(merged)
        dirty = true
        schedule()
      } else {
        dirty = true // retry on the next change
      }
    }
  }

  const schedule = () => {
    if (!transport || stopped) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      inflight = push().finally(() => {
        inflight = null
      })
    }, debounceMs)
  }

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.workspace === prev.workspace || applyingServer) return
    saveLocalWorkspace(state.workspace, storage)
    dirty = true
    schedule()
  })

  if (transport) {
    transport
      .getCurrent()
      .then((server) => {
        if (stopped) return
        const local = store.getState().workspace
        base = server
        // Server wins when it is newer than our mirror; an equal version means
        // the mirror may hold edits that never reached the server: push them.
        if (
          server.version > local.version ||
          Date.parse(local.updated_at) <= Date.parse(server.updated_at)
        ) {
          applyServer(server)
        } else {
          applyServer({ ...local, version: server.version })
          dirty = true
          schedule()
        }
      })
      .catch(() => {
        // Offline or endpoint not deployed yet: keep the local mirror.
      })
  }

  return {
    stop: () => {
      stopped = true
      unsubscribe()
      if (timer) clearTimeout(timer)
    },
    flush: async () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (inflight) await inflight
      if (dirty) await push()
    },
  }
}
