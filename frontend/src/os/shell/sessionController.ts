/**
 * Side-effecting glue between the composer, the backend, the event stream,
 * the surface store and the window manager. Kept outside React so the
 * command palette, keyboard shortcuts and tests can drive it directly.
 */
import type {
  AttachmentRef,
  CapabilityId,
  ModelSelection,
  OsEvent,
  OsId,
  SurfacePlacement,
  SurfacePresentationKind,
  TurnRequest,
} from "../contracts"
import {
  applySurfaceEvent,
  getCapability,
  hasSurface,
  hydrateSurface,
  osBackend,
  rejectSurfaceEvent,
  subscribeSession,
} from "./adapters"
import { newId, nowIso } from "./ids"
import type { ModelTier } from "./sessionsApi"
import {
  DRAFT_SESSION,
  emptyThread,
  reduceThread,
  threadFromHistory,
  useSessionStore,
  type ThreadMessage,
} from "./sessionStore"
import { focusedWindow, useWindowStore, type SizeHint } from "./windowStore"

let attached: { sessionId: OsId; unsubscribe: () => void } | null = null

/** Map the composer's tier choice onto the contract's ModelSelection. */
export function modelSelection(tier: ModelTier, pinned?: { provider: string; model: string } | null): ModelSelection {
  if (pinned) return { mode: "pinned", provider: pinned.provider, model: pinned.model }
  // Contract gap: ModelSelection has no `tier` field yet; tiers ride in `model`
  // under mode "auto" ("tier:fast" etc.) until a contract PR adds one.
  return tier === "auto" ? { mode: "auto" } : { mode: "auto", provider: null, model: `tier:${tier}` }
}

export function openCapability(
  capabilityId: CapabilityId,
  opts: {
    presentation?: SurfacePresentationKind
    title?: string
    sessionId?: OsId | null
    params?: Record<string, unknown>
    sizeHint?: SizeHint
    focus?: boolean
  } = {},
): OsId | null {
  const cap = getCapability(capabilityId)
  const requested = opts.presentation ?? cap?.default_surface ?? "window"
  const presentation = requested === "inline" ? "window" : requested
  const title = opts.title ?? cap?.title ?? capabilityId
  const store = useWindowStore.getState()
  if (cap?.renderer.kind === "legacy_route") {
    return store.open({
      kind: "legacy_route",
      route: cap.renderer.route,
      capability_id: capabilityId,
      title,
      presentation,
      session_id: opts.sessionId ?? null,
      size_hint: opts.sizeHint ?? "large",
      focus: opts.focus,
    })
  }
  return store.open({
    kind: "capability",
    capability_id: capabilityId,
    params: opts.params ?? {},
    title,
    presentation,
    session_id: opts.sessionId ?? null,
    size_hint: opts.sizeHint,
    focus: opts.focus,
  })
}

export function openLegacyRoute(route: string, title?: string): OsId {
  return useWindowStore.getState().open({
    kind: "legacy_route",
    route,
    title: title ?? titleForRoute(route),
    presentation: "window",
    size_hint: "large",
  })
}

export function titleForRoute(route: string): string {
  const path = route.split("?")[0] ?? route
  const known: Record<string, string> = {
    "/command": "Command Center",
    "/projects": "Projects",
    "/launch": "New build",
    "/approvals": "Approvals",
    "/agents": "Agents",
    "/skills": "Skills",
    "/protocols": "Protocols",
    "/marketplace": "Marketplace",
    "/billing": "Billing",
    "/settings": "Settings",
    "/admin": "Admin ops",
    "/initiatives": "Initiatives",
    "/reviews": "Reviews",
    "/studio-3d": "3D Studio",
  }
  if (known[path]) return known[path]!
  const last = path.split("/").filter(Boolean).pop() ?? "Page"
  return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, " ")
}

/** Open a placement from the stream (or a reopen chip) in the right container. */
export function placeSurface(p: SurfacePlacement, sessionId: OsId | null) {
  if (p.presentation === "inline") return
  if (hasSurface(p.surface_id)) {
    useWindowStore.getState().open({
      kind: "surface",
      surface_id: p.surface_id,
      capability_id: p.capability_id ?? null,
      title: p.title,
      presentation: p.presentation,
      session_id: sessionId,
      size_hint: p.size_hint,
      focus: p.focus !== false,
    })
  } else if (p.capability_id) {
    openCapability(p.capability_id, {
      presentation: p.presentation,
      title: p.title,
      sessionId,
      sizeHint: p.size_hint,
      focus: p.focus !== false,
    })
  }
}

function handleEvent(sessionId: OsId, event: OsEvent) {
  const store = useSessionStore.getState()
  const thread = store.threads[sessionId] ?? emptyThread(true)
  const { thread: next, effects } = reduceThread(thread, event)
  if (next === thread) return
  // WS-B's surface store first (a2ui messages, placements, progress, action
  // results): a placement below must see its surface.
  applySurfaceEvent(event)
  store.setThread(sessionId, next)
  for (const p of effects.placements) placeSurface(p, sessionId)
  for (const app of effects.mcpApps) {
    useWindowStore.getState().open({
      kind: "mcp_app",
      app_id: app.app_id,
      title: app.title,
      presentation: app.presentation,
      session_id: sessionId,
      params: { server_id: app.server_id, tool_name: app.tool_name, project_id: app.project_id },
    })
  }
  if (event.type === "turn.completed" || event.type === "turn.failed") {
    void refreshSessions()
  }
}

/** Subscribe to the active session's stream from its last seen seq. */
export function attachSession(sessionId: OsId) {
  if (attached?.sessionId === sessionId) return
  detachSession()
  const thread = useSessionStore.getState().threads[sessionId]
  const unsubscribe = subscribeSession(
    sessionId,
    {
      onEvent: (e) => handleEvent(sessionId, e),
      onInvalid: (raw, errors) => rejectSurfaceEvent(raw, errors),
      onStatus: (status) => useSessionStore.getState().updateThread(sessionId, (t) => ({ ...t, status })),
    },
    thread?.lastSeq ?? 0,
  )
  attached = { sessionId, unsubscribe }
}

export function detachSession() {
  attached?.unsubscribe()
  attached = null
}

/** Load a session's history (messages + surface snapshots) once, then attach. */
export async function openSession(sessionId: OsId): Promise<boolean> {
  const existing = useSessionStore.getState().threads[sessionId]
  if (!existing?.loaded) {
    try {
      const d = await osBackend.getSession(sessionId)
      for (const s of d.surfaces) hydrateSurface(s)
      useSessionStore.getState().setThread(sessionId, threadFromHistory(d.messages, d.last_seq))
      useSessionStore.getState().upsertSession(d.session)
    } catch {
      return false
    }
  }
  attachSession(sessionId)
  return true
}

export async function refreshSessions() {
  try {
    useSessionStore.getState().setSessions(await osBackend.listSessions())
  } catch {
    useSessionStore.getState().setSessions(useSessionStore.getState().sessions)
  }
}

export interface SendPromptInput {
  prompt: string
  attachments?: AttachmentRef[]
  model?: ModelSelection | null
}

/**
 * Send a prompt in the active session (or create one). Resolves with the
 * session id so the caller can route to /os/s/:id.
 */
export async function sendPrompt(input: SendPromptInput): Promise<OsId | null> {
  const prompt = input.prompt.trim().slice(0, 16_000)
  if (!prompt) return null
  const ws = useWindowStore.getState().workspace
  const sessionId = ws.active_session_id
  const key = sessionId ?? DRAFT_SESSION
  const clientTurnId = newId("ct")
  const sessions = useSessionStore.getState()
  const optimistic: ThreadMessage = {
    id: clientTurnId,
    turn_id: null,
    role: "user",
    text: prompt,
    format: "plain",
    attachments: input.attachments ?? [],
    surface_ids: [],
    placements: [],
    streaming: false,
    pending: true,
    created_at: nowIso(),
  }
  sessions.updateThread(key, (t) => ({ ...t, loaded: true, messages: [...t.messages, optimistic] }))
  const focused = focusedWindow(ws)
  const req: TurnRequest = {
    client_turn_id: clientTurnId,
    prompt,
    attachments: input.attachments?.length ? input.attachments : undefined,
    model: input.model ?? null,
    context: {
      active_window_id: focused?.id ?? null,
      open_capability_ids: Array.from(
        new Set(ws.windows.map((w) => w.capability_id).filter((c): c is string => Boolean(c))),
      ).slice(0, 50),
    },
  }
  try {
    const accepted = await osBackend.createTurn(sessionId, req)
    const sid = accepted.session_id
    const store = useSessionStore.getState()
    if (!sessionId) store.moveThread(DRAFT_SESSION, sid)
    store.updateThread(sid, (t) => ({
      ...t,
      loaded: true,
      runningTurnId: accepted.turn_id,
      lastSeq: Math.max(t.lastSeq, accepted.after_seq),
      messages: t.messages.map((m) => (m.id === clientTurnId ? { ...m, turn_id: accepted.turn_id } : m)),
    }))
    if (!sessionId) {
      useWindowStore.getState().setActiveSession(sid)
      const ts = nowIso()
      store.upsertSession({
        id: sid,
        title: prompt.length > 48 ? `${prompt.slice(0, 47)}…` : prompt,
        project_id: null,
        created_at: ts,
        updated_at: ts,
        turn_count: 1,
        pinned: false,
        archived: false,
      })
    }
    attachSession(sid)
    return sid
  } catch (err) {
    const status = (err as { status?: number; response?: { status?: number } })?.status ?? (err as { response?: { status?: number } })?.response?.status
    useSessionStore.getState().updateThread(key, (t) => ({
      ...t,
      messages: t.messages.map((m) =>
        m.id === clientTurnId
          ? {
              ...m,
              pending: false,
              error: {
                code: status === 409 ? "conflict" : "internal",
                message: status === 409 ? "Wait for the current answer to finish, then send again." : "Couldn't send that. Check your connection and try again.",
                retryable: true,
              },
            }
          : m,
      ),
    }))
    return sessionId
  }
}

export async function cancelActiveTurn() {
  const sid = useWindowStore.getState().workspace.active_session_id
  if (!sid) return
  const turn = useSessionStore.getState().threads[sid]?.runningTurnId
  if (turn) await osBackend.cancelTurn(sid, turn).catch(() => undefined)
}

/** Start a fresh conversation (the minimal home). */
export function newSession() {
  detachSession()
  useSessionStore.getState().setThread(DRAFT_SESSION, emptyThread(true))
  useWindowStore.getState().setActiveSession(null)
}
