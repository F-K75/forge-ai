/**
 * Client for the OS session endpoints (`/v1/os/*`, WS-C) behind one
 * `OsBackend` interface. Demo mode (no backend) uses the in-browser fake in
 * ./fake/fakeOsBackend.ts, which implements the same interface and streams
 * contract-valid events, so the shell behaves identically in both modes.
 */
import { api } from "../../lib/api"
import type {
  AttachmentRef,
  OsId,
  SessionMessage,
  SessionSummary,
  StoredSurface,
  TurnAccepted,
  TurnRequest,
  UserActionRequest,
  WorkspaceState,
} from "../contracts"
import type { WorkspaceTransport } from "./workspaceClient"

/** GET /v1/os/sessions/{id}: everything needed to restore a conversation. */
export interface SessionDetail {
  session: SessionSummary
  messages: SessionMessage[]
  surfaces: StoredSurface[]
  /** Attach the stream after this seq to resume a live turn. */
  last_seq: number
}

/** The composer's tier choice (PHASE2_DECISIONS #7). */
export type ModelTier = "auto" | "fast" | "balanced" | "best"

export interface OsModelOption {
  provider: string
  model: string
  label: string
  tier: Exclude<ModelTier, "auto"> | null
}

export interface SessionPatch {
  title?: string
  pinned?: boolean
  archived?: boolean
}

export interface OsBackend {
  readonly kind: "live" | "fake"
  listSessions: () => Promise<SessionSummary[]>
  getSession: (sessionId: OsId) => Promise<SessionDetail>
  /** `sessionId` null creates a session (`POST /v1/os/sessions/new/turns`). */
  createTurn: (sessionId: OsId | null, req: TurnRequest) => Promise<TurnAccepted>
  cancelTurn: (sessionId: OsId, turnId: OsId) => Promise<void>
  updateSession: (sessionId: OsId, patch: SessionPatch) => Promise<SessionSummary>
  deleteSession: (sessionId: OsId) => Promise<void>
  sendAction: (req: UserActionRequest) => Promise<void>
  uploadAttachment: (file: File) => Promise<AttachmentRef>
  listModels: () => Promise<OsModelOption[]>
  /** Server workspace persistence; null keeps the workspace device-local (demo). */
  workspace: WorkspaceTransport | null
}

const enc = encodeURIComponent

function asArray<T>(data: unknown, ...keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === "object") {
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k]
      if (Array.isArray(v)) return v as T[]
    }
  }
  return []
}

export function attachmentKind(mime: string, name: string): AttachmentRef["kind"] {
  if (mime.startsWith("image/")) return "image"
  if (mime.startsWith("audio/")) return "audio"
  if (/\.(csv|tsv|json|xlsx?)$/i.test(name) || mime === "text/csv" || mime === "application/json") return "dataset"
  return "file"
}

function toModelOption(raw: Record<string, unknown>): OsModelOption | null {
  const provider = typeof raw.provider === "string" ? raw.provider : null
  const model = typeof raw.model === "string" ? raw.model : typeof raw.id === "string" ? raw.id : null
  if (!provider || !model) return null
  const tier = raw.tier === "fast" || raw.tier === "balanced" || raw.tier === "best" ? raw.tier : null
  const label =
    typeof raw.display_name === "string" ? raw.display_name : typeof raw.label === "string" ? raw.label : model
  return { provider, model, label, tier }
}

export const liveOsBackend: OsBackend = {
  kind: "live",
  async listSessions() {
    const res = await api.get("/v1/os/sessions", { params: { limit: 50 } })
    return asArray<SessionSummary>(res.data, "items", "sessions", "data")
  },
  async getSession(sessionId) {
    const res = await api.get(`/v1/os/sessions/${enc(sessionId)}`)
    const d = res.data as Partial<SessionDetail> & { last_seq?: number }
    return {
      session: d.session as SessionSummary,
      messages: d.messages ?? [],
      surfaces: d.surfaces ?? [],
      last_seq: typeof d.last_seq === "number" ? d.last_seq : 0,
    }
  },
  async createTurn(sessionId, req) {
    const res = await api.post(`/v1/os/sessions/${sessionId ? enc(sessionId) : "new"}/turns`, req)
    return res.data as TurnAccepted
  },
  async cancelTurn(sessionId, turnId) {
    await api.post(`/v1/os/sessions/${enc(sessionId)}/turns/${enc(turnId)}/cancel`)
  },
  async updateSession(sessionId, patch) {
    const res = await api.patch(`/v1/os/sessions/${enc(sessionId)}`, patch)
    return ((res.data as { session?: SessionSummary }).session ?? res.data) as SessionSummary
  },
  async deleteSession(sessionId) {
    await api.delete(`/v1/os/sessions/${enc(sessionId)}`)
  },
  async sendAction(req) {
    await api.post(`/v1/os/sessions/${enc(req.session_id)}/actions`, req)
  },
  async uploadAttachment(file) {
    const form = new FormData()
    form.append("file", file)
    const res = await api.post("/v1/os/attachments", form, { headers: { "Content-Type": "multipart/form-data" } })
    return res.data as AttachmentRef
  },
  async listModels() {
    const res = await api.get("/v1/os/models")
    return asArray<Record<string, unknown>>(res.data, "models", "items")
      .map(toModelOption)
      .filter((m): m is OsModelOption => m !== null)
  },
  workspace: {
    async getCurrent() {
      const res = await api.get("/v1/os/workspaces/current")
      return res.data as WorkspaceState
    },
    async put(ws) {
      const res = await api.put(`/v1/os/workspaces/${enc(ws.id)}`, ws)
      return res.data as WorkspaceState
    },
  },
}
