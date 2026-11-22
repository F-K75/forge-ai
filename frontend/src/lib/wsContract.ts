// WS_EVENT_TYPES is generated from the backend's WSEventType enum
// (core/models.py) so the two sides can't drift apart — see
// backend/scripts/export_ws_events.py.
import { WS_EVENT_TYPES } from './generated/wsEvents'
import {
  COLLAB_EVENT_TYPES,
  MESSAGE_STATES,
  isCollabEventType,
  legacyStatusToState,
  normalizeEntry,
  normalizeEscalation,
  stateToLegacyStatus,
  type BlackboardEntry,
  type CollabEventType,
  type CollabLane,
  type Escalation,
  type MessageState,
  type MessageTransition,
} from './collabContract'

export { WS_EVENT_TYPES, COLLAB_EVENT_TYPES }

export type WSEventType = (typeof WS_EVENT_TYPES)[keyof typeof WS_EVENT_TYPES]

/** Every build event this client understands: the generated enum plus the
 * collaboration protocol v2 events (lib/collabContract.ts). */
export type BuildEventType = WSEventType | CollabEventType

export type WSTimestamp = string

export type WSEventBase<TType extends BuildEventType, TData> = {
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
// Protocol v2 adds kind "escalation", answered with action "answers" and
// answers[0] = the chosen option.
export type GateKind = 'approval' | 'questions' | 'escalation'
export interface GateRequestData {
  gate_id: string
  stage: string
  agent: string
  kind: GateKind
  questions: string[]
  timeout_seconds: number
  requested_at: string
  escalation_id?: string
  subject?: string
  detail?: string
  options?: string[]
}
export type GateRequestEvent = WSEventBase<'gate_request', GateRequestData>
export type GateResolvedEvent = WSEventBase<
  'gate_resolved',
  { gate_id: string; stage: string; agent: string; action: string; auto: boolean }
>
// Agent-to-agent request/reply, routed by the backend orchestrator (see
// backend/core/agent_communication.py). One request event when a question
// is recorded, one response event when it is answered or turned away.
// Protocol v2 keeps the legacy keys and adds the v2 ones (optional here).
export type AgentMessageStatus = 'pending' | 'answered' | 'rejected' | 'timeout' | 'failed'
export interface AgentMessageData {
  message_id: string
  conversation_id: string
  correlation_id?: string | null
  sender: string
  recipient: string
  message_type: string
  question: string
  answer?: string | null
  status: AgentMessageStatus
  reason?: string | null
  credits_charged: number
  delivery_attempts?: number
  delivery_started_at?: string | null
  credits_used?: number
  created_at?: string
  resolved_at?: string | null
  duration_ms?: number | null
  // Protocol v2
  protocol_version?: number
  state?: MessageState
  lane?: CollabLane
  subject?: string | null
  content?: string
  payload?: unknown
  parent_message_id?: string | null
  transitions?: MessageTransition[]
}
export type AgentMessageRequestEvent = WSEventBase<'agent_message_request', AgentMessageData>
export type AgentMessageResponseEvent = WSEventBase<'agent_message_response', AgentMessageData>
export type BuildFailedEvent = WSEventBase<'build_failed', { error?: string }>
export type StreamTokenEvent = WSEventBase<'stream_token', { agent?: string; token: string }>
export type DebugStartEvent = WSEventBase<'debug_start', { iteration?: number; errors?: any }>
export type CreditsUpdateEvent = WSEventBase<'credits_update', { credits_used?: number }>
export type ErrorEvent = WSEventBase<'error', { error?: string; agent?: string }>
export type CollabDecisionRecordedEvent = WSEventBase<'collab_decision_recorded', { entry: BlackboardEntry }>
export type CollabEscalationOpenedEvent = WSEventBase<'collab_escalation_opened', { escalation: Escalation }>
export type CollabEscalationResolvedEvent = WSEventBase<'collab_escalation_resolved', { escalation: Escalation }>

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
  | AgentMessageRequestEvent
  | AgentMessageResponseEvent
  | BuildFailedEvent
  | StreamTokenEvent
  | DebugStartEvent
  | CreditsUpdateEvent
  | ErrorEvent
  | CollabDecisionRecordedEvent
  | CollabEscalationOpenedEvent
  | CollabEscalationResolvedEvent


export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isValidBuildEventType(t: unknown): t is BuildEventType {
  return (typeof t === 'string' && Object.values(WS_EVENT_TYPES).includes(t as any)) || isCollabEventType(t)
}

const LEGACY_STATUSES: readonly string[] = ['pending', 'answered', 'rejected', 'timeout', 'failed']

/**
 * Accepts both message shapes: v1 (`question` + `status`) and v2, which may
 * carry `content` and `state` instead. The result always has the legacy
 * `question` and `status` filled in, so v1 consumers keep working.
 */
function normalizeAgentMessageData(data: Record<string, unknown>): AgentMessageData | null {
  if (!isString(data.message_id) || !isString(data.sender) || !isString(data.recipient)) return null
  const question = isString(data.question) ? data.question : isString(data.content) ? data.content : null
  if (question === null) return null
  const state = (MESSAGE_STATES as readonly string[]).includes(data.state as string)
    ? (data.state as MessageState)
    : null
  let status: AgentMessageStatus
  if (isString(data.status) && LEGACY_STATUSES.includes(data.status)) status = data.status as AgentMessageStatus
  else if (state) status = stateToLegacyStatus(state)
  else return null
  return {
    ...data,
    conversation_id: isString(data.conversation_id) ? data.conversation_id : '',
    message_type: isString(data.message_type) ? data.message_type : 'clarification',
    question,
    status,
    state: state ?? legacyStatusToState(status, data.delivery_attempts, data.reason),
    credits_charged: typeof data.credits_charged === 'number' ? data.credits_charged : 0,
  } as AgentMessageData
}

function normalizeGateRequest(data: Record<string, unknown>): GateRequestData | null {
  if (!isString(data.gate_id)) return null
  const kind: GateKind = data.kind === 'questions' || data.kind === 'escalation' ? data.kind : 'approval'
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isString) : [])
  const gate: GateRequestData = {
    ...data,
    gate_id: data.gate_id,
    stage: isString(data.stage) ? data.stage : '',
    agent: isString(data.agent) ? data.agent : '',
    kind,
    questions: strings(data.questions),
    timeout_seconds: typeof data.timeout_seconds === 'number' ? data.timeout_seconds : 0,
    requested_at: isString(data.requested_at) ? data.requested_at : '',
  }
  if (kind === 'escalation') {
    gate.escalation_id = isString(data.escalation_id) ? data.escalation_id : undefined
    gate.subject = isString(data.subject) ? data.subject : undefined
    gate.detail = isString(data.detail) ? data.detail : undefined
    gate.options = strings(data.options)
  }
  return gate
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
    case WS_EVENT_TYPES.gate_request: {
      const gate = isRecord(data) ? normalizeGateRequest(data) : null
      if (!gate) return null
      return { ...raw, data: gate } as GateRequestEvent
    }
    case WS_EVENT_TYPES.gate_resolved:
      if (!isRecord(data) || !isString((data as any).gate_id)) return null
      return raw as GateResolvedEvent
    case WS_EVENT_TYPES.agent_message_request:
    case WS_EVENT_TYPES.agent_message_response: {
      // Relaxed for protocol v2: `content`/`state` are accepted in place of
      // `question`/`status` (which v2 still sends, for older clients).
      const message = isRecord(data) ? normalizeAgentMessageData(data) : null
      if (!message) return null
      return { ...raw, data: message } as AgentMessageRequestEvent | AgentMessageResponseEvent
    }
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
    case COLLAB_EVENT_TYPES.collab_decision_recorded: {
      const entry = isRecord(data) ? normalizeEntry(data.entry) : null
      if (!entry) return null
      return { ...raw, data: { entry } } as CollabDecisionRecordedEvent
    }
    case COLLAB_EVENT_TYPES.collab_escalation_opened:
    case COLLAB_EVENT_TYPES.collab_escalation_resolved: {
      const escalation = isRecord(data) ? normalizeEscalation(data.escalation) : null
      if (!escalation) return null
      return { ...raw, data: { escalation } } as CollabEscalationOpenedEvent | CollabEscalationResolvedEvent
    }
    default:
      return null
  }

}
