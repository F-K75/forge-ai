// WS_EVENT_TYPES is generated from the backend's WSEventType enum
// (core/models.py) so the two sides can't drift apart — see
// backend/scripts/export_ws_events.py.
import { WS_EVENT_TYPES } from './generated/wsEvents'

export { WS_EVENT_TYPES }

export type WSEventType = (typeof WS_EVENT_TYPES)[keyof typeof WS_EVENT_TYPES]

export type WSTimestamp = string

export type WSEventBase<TType extends WSEventType, TData> = {
  type: TType
  build_id: string
  data: TData
  timestamp?: WSTimestamp
  version: number
}

export type BuildStartEvent = WSEventBase<'build_start', Record<string, unknown>>
export type AgentStartEvent = WSEventBase<'agent_start', { agent: string }>
export type AgentUpdateEvent = WSEventBase<'agent_update', { agent?: string; message: string }>
export type AgentProgressEvent = WSEventBase<'agent_progress', { agent?: string; progress?: number; message?: string }>
export type AgentCompleteEvent = WSEventBase<'agent_complete', { agent: string; files_changed?: string[] }>
// The full parsed (already-JSON-decoded) output of an agent's own work —
// e.g. the Architect's blueprint or the Business Model agent's plan. Sent
// once per agent, right after its agent_complete, for the workspace's
// document explorer (see backend/core/orchestrator.py's _emit_output).
export type AgentOutputEvent = WSEventBase<'agent_output', { agent: string; output: unknown }>
export type FileUpdateEvent = WSEventBase<
  'file_update',
  { delta: { changed: Record<string, string>; deleted: string[] }; debug_iteration?: number }
>
export type BuildCompleteEvent = WSEventBase<
  'build_complete',
  {
    files?: Record<string, string>
    validation?: any
    credits_used?: number
    business_model?: Record<string, unknown> | null
  }
>
// Interactive builds only (see CreateBuildRequest.interactive) — pauses the
// pipeline after a stage completes (or, for the architect's "clarify" kind,
// before it even starts) until the user responds via POST
// /builds/{id}/gate, or gate_timeout_seconds elapses and the backend
// auto-approves. See backend/core/orchestrator.py's _wait_for_gate.
export type GateRequestEvent = WSEventBase<
  'gate_request',
  { gate_id: string; stage: string; agent: string; kind: 'approval' | 'questions'; questions: string[]; timeout_seconds: number; requested_at: string }
>
export type GateResolvedEvent = WSEventBase<
  'gate_resolved',
  { gate_id: string; stage: string; agent: string; action: string; auto: boolean }
>
export type BuildFailedEvent = WSEventBase<'build_failed', { error?: string }>
export type StreamTokenEvent = WSEventBase<'stream_token', { agent?: string; token: string }>
export type DebugStartEvent = WSEventBase<'debug_start', { iteration?: number; errors?: any }>
export type CreditsUpdateEvent = WSEventBase<'credits_update', { credits_used?: number }>
export type ErrorEvent = WSEventBase<'error', { error?: string; agent?: string }>

export type AnyWSEvent =
  | BuildStartEvent
  | AgentStartEvent
  | AgentUpdateEvent
  | AgentProgressEvent
  | AgentCompleteEvent
  | AgentOutputEvent
  | FileUpdateEvent
  | BuildCompleteEvent
  | GateRequestEvent
  | GateResolvedEvent
  | BuildFailedEvent
  | StreamTokenEvent
  | DebugStartEvent
  | CreditsUpdateEvent
  | ErrorEvent


export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isValidBuildEventType(t: unknown): t is WSEventType {
  return typeof t === 'string' && Object.values(WS_EVENT_TYPES).includes(t as any)
}

/**
 * Defensive parsing: never throws.
 * Returns null for malformed events.
 */
export function parseWSEvent(raw: unknown): AnyWSEvent | null {
  if (!isRecord(raw)) return null
  const type = raw.type
  if (!isString(type) || !isValidBuildEventType(type)) {
    return null
  }

  const build_id = raw.build_id
  if (!isString(build_id)) return null

  const version = raw.version
  if (typeof version !== 'number' || version < 1) return null

  const data = raw.data
  // data can be any but must be object/primitive for our purposes
  if (data === undefined) return null

  // Minimal shape checks per known event types
  switch (type) {
    case WS_EVENT_TYPES.build_start:
      if (!isRecord(data)) return null
      return raw as BuildStartEvent
    case WS_EVENT_TYPES.agent_start:
      if (!isRecord(data) || !isString((data as any).agent)) return null
      return raw as AgentStartEvent
    case WS_EVENT_TYPES.agent_update:
      if (!isRecord(data) || !isString((data as any).message)) return null
      return raw as AgentUpdateEvent
    case WS_EVENT_TYPES.agent_progress:
      if (!isRecord(data)) return null
      return raw as AgentProgressEvent
    case WS_EVENT_TYPES.agent_complete:
      if (!isRecord(data) || !isString((data as any).agent)) return null
      return raw as AgentCompleteEvent
    case WS_EVENT_TYPES.agent_output:
      if (!isRecord(data) || !isString((data as any).agent) || (data as any).output === undefined) return null
      return raw as AgentOutputEvent
    case WS_EVENT_TYPES.file_update:
      // Previously required data.files, which the backend stopped sending
      // in favor of data.delta -- that mismatch meant every delta-shaped
      // file_update (every debug-loop patch) was silently dropped right
      // here, and patched files never reached the editor (WS-002).
      if (!isRecord(data) || !isRecord((data as any).delta) || !isRecord((data as any).delta.changed)) return null
      return raw as FileUpdateEvent
    case WS_EVENT_TYPES.build_complete:
      if (!isRecord(data)) return null
      return raw as BuildCompleteEvent
    case WS_EVENT_TYPES.gate_request:
      if (!isRecord(data) || !isString((data as any).gate_id) || !isString((data as any).agent)) return null
      return raw as GateRequestEvent
    case WS_EVENT_TYPES.gate_resolved:
      if (!isRecord(data) || !isString((data as any).gate_id)) return null
      return raw as GateResolvedEvent
    case WS_EVENT_TYPES.build_failed:
      if (!isRecord(data)) return null
      return raw as BuildFailedEvent
    case WS_EVENT_TYPES.stream_token:
      if (!isRecord(data) || !isString((data as any).token)) return null
      return raw as StreamTokenEvent
    case WS_EVENT_TYPES.debug_start:
      if (!isRecord(data)) return null
      return raw as DebugStartEvent
    case WS_EVENT_TYPES.credits_update:
      if (!isRecord(data)) return null
      return raw as CreditsUpdateEvent
    case WS_EVENT_TYPES.error:
      if (!isRecord(data)) return null
      return raw as ErrorEvent
    default:
      return null
  }

}

