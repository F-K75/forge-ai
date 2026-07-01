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
}

export type BuildStartEvent = WSEventBase<'build_start', Record<string, unknown>>
export type AgentStartEvent = WSEventBase<'agent_start', { agent: string }>
export type AgentUpdateEvent = WSEventBase<'agent_update', { agent?: string; message: string }>
export type AgentProgressEvent = WSEventBase<'agent_progress', { agent?: string; progress?: number; message?: string }>
export type AgentCompleteEvent = WSEventBase<'agent_complete', { agent: string; files_changed?: string[] }>
export type FileUpdateEvent = WSEventBase<'file_update', { files: Record<string, string> }>
export type BuildCompleteEvent = WSEventBase<
  'build_complete',
  {
    files?: Record<string, string>
    validation?: any
    credits_used?: number
    business_model?: Record<string, unknown> | null
  }
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
  | FileUpdateEvent
  | BuildCompleteEvent
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
    case WS_EVENT_TYPES.file_update:
      if (!isRecord(data) || !isRecord((data as any).files)) return null
      return raw as FileUpdateEvent
    case WS_EVENT_TYPES.build_complete:
      if (!isRecord(data)) return null
      return raw as BuildCompleteEvent
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

