/**
 * In-browser stand-in for WS-C's `/v1/os/*` API, used in demo mode (no
 * backend) and in tests. It keeps a per-session event log (persisted to
 * localStorage), allocates `seq` exactly like the server, replays after
 * `afterSeq`, and streams new events with small delays, so the shell's
 * resume/replay paths are exercised for real.
 */
import {
  OS_PROTOCOL_VERSION,
  type A2UIComponent,
  type AttachmentRef,
  type OsEvent,
  type OsEventType,
  type OsId,
  type OsStreamHandlers,
  type SessionMessage,
  type SessionSummary,
  type StoredSurface,
  type SubscribeSession,
} from "../../contracts"
import { FORGE_CATALOG_ID } from "../../contracts"
import { newId, nowIso } from "../ids"
import { attachmentKind, type OsBackend, type OsModelOption, type SessionDetail } from "../sessionsApi"
import { planFakeAction, planFakeTurn, type FakeEventSpec } from "./fakePlanner"

const STORAGE_KEY = "forge-os-demo-sessions-v1"
const MAX_EVENTS_PER_SESSION = 600
const MAX_SESSIONS = 40

interface FakeDb {
  sessions: SessionSummary[]
  events: Record<OsId, OsEvent[]>
  /** Full prompt text per turn (turn.started only carries a preview). */
  prompts: Record<OsId, { text: string; attachments: AttachmentRef[] }>
}

function emptyDb(): FakeDb {
  return { sessions: [], events: {}, prompts: {} }
}

export interface FakeBackendOptions {
  storage?: Storage | null
  /** Multiplies every event delay (0 = emit synchronously-ish, for tests). */
  speed?: number
}

export function createFakeOsBackend(opts: FakeBackendOptions = {}): OsBackend & { subscribe: SubscribeSession; reset: () => void } {
  const storage =
    opts.storage === undefined ? (typeof localStorage === "undefined" ? null : localStorage) : opts.storage
  const speed = opts.speed ?? 1
  const listeners = new Map<OsId, Set<OsStreamHandlers>>()
  const running = new Map<OsId, OsId>() // session -> turn
  let db = load()

  function load(): FakeDb {
    try {
      const raw = storage?.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as FakeDb
        if (Array.isArray(parsed.sessions) && parsed.events && parsed.prompts) return parsed
      }
    } catch {
      // ignore corrupt demo data
    }
    return emptyDb()
  }

  function save() {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(db))
    } catch {
      // ignore quota errors in the demo
    }
  }

  function lastSeq(sessionId: OsId): number {
    const log = db.events[sessionId]
    return log && log.length ? log[log.length - 1]!.seq : 0
  }

  function append<T extends OsEventType>(sessionId: OsId, turnId: OsId | null, spec: FakeEventSpec<T>) {
    const event = {
      v: OS_PROTOCOL_VERSION,
      seq: lastSeq(sessionId) + 1,
      session_id: sessionId,
      turn_id: turnId,
      ts: nowIso(),
      type: spec.type,
      data: spec.data,
    } as OsEvent
    const log = (db.events[sessionId] ??= [])
    log.push(event)
    if (log.length > MAX_EVENTS_PER_SESSION) log.splice(0, log.length - MAX_EVENTS_PER_SESSION)
    const s = db.sessions.find((x) => x.id === sessionId)
    if (s) s.updated_at = event.ts
    if (spec.type === "turn.completed" || spec.type === "turn.failed") running.delete(sessionId)
    save()
    for (const h of listeners.get(sessionId) ?? []) h.onEvent(event)
  }

  function emit(sessionId: OsId, turnId: OsId | null, specs: FakeEventSpec[]) {
    let t = 0
    for (const spec of specs) {
      t += spec.delay * speed
      if (speed === 0) {
        queueMicrotask(() => append(sessionId, turnId, spec))
      } else {
        setTimeout(() => append(sessionId, turnId, spec), t)
      }
    }
  }

  function titleFrom(prompt: string): string {
    const clean = prompt.replace(/\s+/g, " ").trim()
    const t = clean.length > 48 ? `${clean.slice(0, 47).trimEnd()}…` : clean
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "New session"
  }

  function detail(sessionId: OsId): SessionDetail {
    const session = db.sessions.find((s) => s.id === sessionId)
    if (!session) throw Object.assign(new Error("Session not found"), { status: 404 })
    const messages: SessionMessage[] = []
    const surfaces = new Map<OsId, StoredSurface>()
    const byTurnAssistant = new Map<OsId, SessionMessage>()
    for (const e of db.events[sessionId] ?? []) {
      const turnId = e.turn_id ?? "turn"
      if (e.type === "turn.started") {
        const p = db.prompts[turnId]
        messages.push({
          id: e.data.message_id,
          session_id: sessionId,
          turn_id: turnId,
          role: "user",
          created_at: e.ts,
          text: p?.text ?? e.data.prompt_preview,
          format: "plain",
          attachments: p?.attachments ?? [],
          surface_ids: [],
          intent: null,
        })
      } else if (e.type === "text.completed") {
        const m: SessionMessage = {
          id: e.data.message_id,
          session_id: sessionId,
          turn_id: turnId,
          role: "assistant",
          created_at: e.ts,
          text: e.data.text,
          format: e.data.format,
          attachments: [],
          surface_ids: [],
          intent: null,
        }
        messages.push(m)
        byTurnAssistant.set(turnId, m)
      } else if (e.type === "surface.placed" && e.data.placement.presentation === "inline") {
        const m = byTurnAssistant.get(turnId)
        if (m) m.surface_ids.push(e.data.placement.surface_id)
      } else if (e.type === "a2ui.message") {
        const msg = e.data.message
        if ("createSurface" in msg) {
          surfaces.set(msg.createSurface.surfaceId, {
            surface_id: msg.createSurface.surfaceId,
            session_id: sessionId,
            turn_id: turnId,
            catalog_id: FORGE_CATALOG_ID,
            title: msg.createSurface.surfaceId,
            components: msg.createSurface.components ?? [],
            data_model: msg.createSurface.dataModel ?? {},
            version: 1,
            updated_at: e.ts,
          })
        } else if ("updateComponents" in msg) {
          const s = surfaces.get(msg.updateComponents.surfaceId)
          if (s) {
            const byId = new Map<string, A2UIComponent>(s.components.map((c) => [c.id, c]))
            for (const c of msg.updateComponents.components) byId.set(c.id, c)
            s.components = [...byId.values()]
            s.version += 1
            s.updated_at = e.ts
          }
        } else if ("deleteSurface" in msg) {
          surfaces.delete(msg.deleteSurface.surfaceId)
        }
      }
    }
    return { session, messages, surfaces: [...surfaces.values()], last_seq: lastSeq(sessionId) }
  }

  const subscribe: SubscribeSession = (sessionId, handlers, afterSeq = 0) => {
    const set = listeners.get(sessionId) ?? new Set()
    listeners.set(sessionId, set)
    handlers.onStatus?.("connecting")
    let active = true
    queueMicrotask(() => {
      if (!active) return
      handlers.onStatus?.("open")
      for (const e of db.events[sessionId] ?? []) if (e.seq > afterSeq) handlers.onEvent(e)
      set.add(handlers)
    })
    return () => {
      active = false
      set.delete(handlers)
      handlers.onStatus?.("closed")
    }
  }

  const MODELS: OsModelOption[] = [
    { provider: "anthropic", model: "claude-haiku", label: "Claude Haiku", tier: "fast" },
    { provider: "anthropic", model: "claude-sonnet", label: "Claude Sonnet", tier: "balanced" },
    { provider: "anthropic", model: "claude-opus", label: "Claude Opus", tier: "best" },
    { provider: "openai", model: "gpt-4.1", label: "GPT-4.1", tier: "balanced" },
    { provider: "google", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "best" },
  ]

  return {
    kind: "fake",
    subscribe,
    reset() {
      db = emptyDb()
      save()
    },
    async listSessions() {
      return [...db.sessions].filter((s) => !s.archived).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    },
    async getSession(sessionId) {
      return detail(sessionId)
    },
    async createTurn(sessionId, req) {
      let sid = sessionId
      if (!sid) {
        sid = newId("ses")
        const ts = nowIso()
        db.sessions.unshift({
          id: sid,
          title: titleFrom(req.prompt),
          project_id: req.project_id ?? null,
          created_at: ts,
          updated_at: ts,
          turn_count: 0,
          pinned: false,
          archived: false,
        })
        if (db.sessions.length > MAX_SESSIONS) {
          const dropped = db.sessions.splice(MAX_SESSIONS)
          for (const d of dropped) delete db.events[d.id]
        }
        db.events[sid] = []
      }
      const session = db.sessions.find((s) => s.id === sid)
      if (!session) throw Object.assign(new Error("Session not found"), { status: 404 })
      if (running.has(sid)) throw Object.assign(new Error("A turn is already running"), { status: 409 })
      const turnId = newId("turn")
      session.turn_count += 1
      db.prompts[turnId] = { text: req.prompt, attachments: req.attachments ?? [] }
      running.set(sid, turnId)
      const after = lastSeq(sid)
      save()
      emit(
        sid,
        turnId,
        planFakeTurn({
          prompt: req.prompt,
          attachments: req.attachments ?? [],
          turnId,
          idSeed: turnId.slice(5, 13),
          userMessageId: req.client_turn_id,
          assistantMessageId: newId("msg"),
        }),
      )
      return { session_id: sid, turn_id: turnId, stream_path: `/v1/os/sessions/${sid}/stream`, after_seq: after }
    },
    async cancelTurn(sessionId, turnId) {
      if (running.get(sessionId) !== turnId) return
      running.delete(sessionId)
      append(sessionId, turnId, { type: "turn.completed", data: { status: "cancelled", usage: null }, delay: 0 })
    },
    async updateSession(sessionId, patch) {
      const s = db.sessions.find((x) => x.id === sessionId)
      if (!s) throw Object.assign(new Error("Session not found"), { status: 404 })
      if (patch.title !== undefined) s.title = patch.title.slice(0, 200)
      if (patch.pinned !== undefined) s.pinned = patch.pinned
      if (patch.archived !== undefined) s.archived = patch.archived
      s.updated_at = nowIso()
      save()
      return { ...s }
    },
    async deleteSession(sessionId) {
      db.sessions = db.sessions.filter((s) => s.id !== sessionId)
      delete db.events[sessionId]
      save()
    },
    async sendAction(req) {
      emit(req.session_id, req.turn_id ?? null, planFakeAction(req.a2ui.action.name, req.a2ui.action.surfaceId, req.action_id))
    },
    async uploadAttachment(file) {
      return {
        id: newId("att"),
        name: file.name.slice(0, 255) || "attachment",
        mime_type: (file.type || "application/octet-stream").slice(0, 127),
        size_bytes: Math.min(file.size, 52_428_800),
        kind: attachmentKind(file.type, file.name),
      }
    },
    async listModels() {
      return MODELS
    },
    workspace: null,
  }
}
