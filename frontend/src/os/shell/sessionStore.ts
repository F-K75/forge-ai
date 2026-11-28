/**
 * Conversation state: the session list and, per session, the thread built
 * from the OS event stream (messages, streamed text, inline surfaces and
 * placement chips). `reduceThread` is the pure event reducer; side effects
 * (surface store, window placement) are returned to the caller
 * (./sessionController.ts) instead of being performed here.
 */
import { create } from "zustand"
import type {
  A2UIServerMessage,
  AttachmentRef,
  MCPAppPlacement,
  OsError,
  OsEvent,
  OsId,
  SessionMessage,
  SessionSummary,
  SurfacePlacement,
} from "../contracts"

export const DRAFT_SESSION = "__draft__"

export interface PlacementChip {
  surface_id: OsId
  title: string
  presentation: SurfacePlacement["presentation"]
  capability_id: string | null
}

export interface ThreadMessage {
  id: OsId
  turn_id: OsId | null
  role: "user" | "assistant" | "system"
  text: string
  format: "plain" | "markdown"
  attachments: AttachmentRef[]
  /** Inline generated surfaces rendered under the message. */
  surface_ids: OsId[]
  /** Surfaces placed in a panel/window/fullscreen: shown as reopen chips. */
  placements: PlacementChip[]
  streaming: boolean
  /** Optimistic user message not yet acknowledged by the server. */
  pending?: boolean
  error?: OsError | null
  cancelled?: boolean
  created_at: string
}

export type StreamStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed"

export interface SessionThread {
  messages: ThreadMessage[]
  lastSeq: number
  runningTurnId: OsId | null
  /** True once the history is loaded (or the thread was created here). */
  loaded: boolean
  status: StreamStatus
}

export function emptyThread(loaded = false): SessionThread {
  return { messages: [], lastSeq: 0, runningTurnId: null, loaded, status: "idle" }
}

export interface ThreadEffects {
  surfaceMessages: A2UIServerMessage[]
  placements: SurfacePlacement[]
  mcpApps: MCPAppPlacement[]
}

function assistantFor(messages: ThreadMessage[], turnId: OsId | null, createdAt: string): [ThreadMessage[], number] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role === "assistant" && m.turn_id === turnId) return [messages, i]
    if (m.turn_id !== turnId) break
  }
  const msg: ThreadMessage = {
    id: `asst_${turnId ?? "none"}_${messages.length}`,
    turn_id: turnId,
    role: "assistant",
    text: "",
    format: "plain",
    attachments: [],
    surface_ids: [],
    placements: [],
    streaming: true,
    created_at: createdAt,
  }
  return [[...messages, msg], messages.length]
}

function patchAt(messages: ThreadMessage[], i: number, patch: Partial<ThreadMessage>): ThreadMessage[] {
  const next = messages.slice()
  next[i] = { ...next[i]!, ...patch }
  return next
}

const FRIENDLY_ERRORS: Partial<Record<OsError["code"], string>> = {
  llm_unavailable: "No language model is configured, so I can only open features and run the built-in tools. Ask for something specific, like \"show my projects\".",
  rate_limited: "You're sending prompts faster than the limit allows. Try again in a moment.",
  budget_exceeded: "This workspace has reached its AI budget. Add credits in Billing to continue.",
  forbidden: "You don't have access to that.",
}

export function friendlyError(error: OsError): string {
  return FRIENDLY_ERRORS[error.code] ?? error.message
}

/** Apply one stream event. Events at or below `lastSeq` (replays) are ignored. */
export function reduceThread(thread: SessionThread, event: OsEvent): { thread: SessionThread; effects: ThreadEffects } {
  const effects: ThreadEffects = { surfaceMessages: [], placements: [], mcpApps: [] }
  if (event.type === "heartbeat" || event.seq <= thread.lastSeq) return { thread, effects }
  let messages = thread.messages
  let runningTurnId = thread.runningTurnId
  const turnId = event.turn_id

  switch (event.type) {
    case "turn.started": {
      runningTurnId = turnId
      const i = messages.findIndex((m) => m.role === "user" && (m.turn_id === turnId || m.id === event.data.message_id))
      if (i >= 0) messages = patchAt(messages, i, { id: event.data.message_id, turn_id: turnId, pending: false })
      else
        messages = [
          ...messages,
          {
            id: event.data.message_id,
            turn_id: turnId,
            role: "user",
            text: event.data.prompt_preview,
            format: "plain",
            attachments: [],
            surface_ids: [],
            placements: [],
            streaming: false,
            created_at: event.ts,
          },
        ]
      break
    }
    case "text.delta": {
      let i = messages.findIndex((m) => m.id === event.data.message_id)
      if (i < 0) {
        ;[messages, i] = assistantFor(messages, turnId, event.ts)
        messages = patchAt(messages, i, { id: event.data.message_id })
      }
      messages = patchAt(messages, i, { text: messages[i]!.text + event.data.delta, streaming: true })
      break
    }
    case "text.completed": {
      let i = messages.findIndex((m) => m.id === event.data.message_id)
      if (i < 0) {
        ;[messages, i] = assistantFor(messages, turnId, event.ts)
        messages = patchAt(messages, i, { id: event.data.message_id })
      }
      messages = patchAt(messages, i, { text: event.data.text, format: event.data.format, streaming: false })
      break
    }
    case "a2ui.message":
      effects.surfaceMessages.push(event.data.message)
      break
    case "surface.placed": {
      const p = event.data.placement
      let i: number
      ;[messages, i] = assistantFor(messages, turnId, event.ts)
      const m = messages[i]!
      if (p.presentation === "inline") {
        if (!m.surface_ids.includes(p.surface_id)) messages = patchAt(messages, i, { surface_ids: [...m.surface_ids, p.surface_id] })
      } else {
        if (!m.placements.some((x) => x.surface_id === p.surface_id))
          messages = patchAt(messages, i, {
            placements: [
              ...m.placements,
              { surface_id: p.surface_id, title: p.title, presentation: p.presentation, capability_id: p.capability_id ?? null },
            ],
          })
        effects.placements.push(p)
      }
      break
    }
    case "mcp_app.placed":
      effects.mcpApps.push(event.data.placement)
      break
    case "action.result":
      if ((event.data.status === "failed" || event.data.status === "rejected") && event.data.message) {
        messages = [
          ...messages,
          {
            id: `act_${event.data.action_id}_${event.seq}`,
            turn_id: turnId,
            role: "system",
            text: event.data.message,
            format: "plain",
            attachments: [],
            surface_ids: [],
            placements: [],
            streaming: false,
            created_at: event.ts,
          },
        ]
      }
      break
    case "turn.completed": {
      if (runningTurnId === turnId) runningTurnId = null
      messages = messages.map((m) =>
        m.turn_id === turnId && m.streaming
          ? { ...m, streaming: false, cancelled: event.data.status === "cancelled" }
          : m,
      )
      if (event.data.status === "cancelled" && !messages.some((m) => m.turn_id === turnId && m.role === "assistant")) {
        messages = [
          ...messages,
          {
            id: `cancel_${turnId}`,
            turn_id: turnId,
            role: "assistant",
            text: "",
            format: "plain",
            attachments: [],
            surface_ids: [],
            placements: [],
            streaming: false,
            cancelled: true,
            created_at: event.ts,
          },
        ]
      }
      break
    }
    case "turn.failed": {
      if (runningTurnId === turnId) runningTurnId = null
      let i: number
      ;[messages, i] = assistantFor(messages, turnId, event.ts)
      messages = patchAt(messages, i, { streaming: false, error: event.data.error })
      break
    }
    default:
      break
  }
  return { thread: { ...thread, messages, runningTurnId, lastSeq: event.seq }, effects }
}

export function threadFromHistory(messages: SessionMessage[], lastSeq: number): SessionThread {
  return {
    messages: messages.map((m) => ({
      id: m.id,
      turn_id: m.turn_id,
      role: m.role,
      text: m.text ?? "",
      format: m.format,
      attachments: m.attachments,
      surface_ids: m.surface_ids,
      placements: [],
      streaming: false,
      created_at: m.created_at,
    })),
    lastSeq,
    runningTurnId: null,
    loaded: true,
    status: "idle",
  }
}

export interface SessionStoreState {
  sessions: SessionSummary[]
  sessionsLoaded: boolean
  threads: Record<OsId, SessionThread>
  setSessions: (sessions: SessionSummary[]) => void
  upsertSession: (session: SessionSummary) => void
  removeSession: (id: OsId) => void
  setThread: (id: OsId, thread: SessionThread) => void
  updateThread: (id: OsId, fn: (t: SessionThread) => SessionThread) => void
  moveThread: (from: OsId, to: OsId) => void
}

export const useSessionStore = create<SessionStoreState>()((set) => ({
  sessions: [],
  sessionsLoaded: false,
  threads: {},
  setSessions: (sessions) => set({ sessions, sessionsLoaded: true }),
  upsertSession: (session) =>
    set((s) => {
      const i = s.sessions.findIndex((x) => x.id === session.id)
      const sessions = i >= 0 ? s.sessions.map((x) => (x.id === session.id ? session : x)) : [session, ...s.sessions]
      return { sessions }
    }),
  removeSession: (id) =>
    set((s) => {
      const threads = { ...s.threads }
      delete threads[id]
      return { sessions: s.sessions.filter((x) => x.id !== id), threads }
    }),
  setThread: (id, thread) => set((s) => ({ threads: { ...s.threads, [id]: thread } })),
  updateThread: (id, fn) => set((s) => ({ threads: { ...s.threads, [id]: fn(s.threads[id] ?? emptyThread()) } })),
  moveThread: (from, to) =>
    set((s) => {
      const t = s.threads[from]
      if (!t) return s
      const threads = { ...s.threads, [to]: t }
      delete threads[from]
      return { threads }
    }),
}))
