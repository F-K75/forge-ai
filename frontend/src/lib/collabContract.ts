// Collaboration protocol v2: the client side of the shared contract in
// docs/architecture/collaboration-protocol-v2.md (messages, the Decisions
// blackboard, Escalations, the three new events and the hydration endpoint).
//
// The three new event names are declared here as string literals rather than
// read from ./generated/wsEvents.ts, which only the backend regenerates
// (backend/scripts/export_ws_events.py). Once it lists them too, the two
// declarations simply overlap.

export const COLLAB_EVENT_TYPES = {
  collab_decision_recorded: 'collab_decision_recorded',
  collab_escalation_opened: 'collab_escalation_opened',
  collab_escalation_resolved: 'collab_escalation_resolved',
} as const

export type CollabEventType = (typeof COLLAB_EVENT_TYPES)[keyof typeof COLLAB_EVENT_TYPES]

export function isCollabEventType(t: unknown): t is CollabEventType {
  return typeof t === 'string' && (Object.values(COLLAB_EVENT_TYPES) as string[]).includes(t)
}

// --- Messages (§2) -------------------------------------------------------

export const MESSAGE_TYPES = [
  'clarification',
  'information',
  'review_request',
  'review_response',
  'revision_request',
  'finding',
  'decision_proposal',
  'escalation',
] as const
export type MessageType = (typeof MESSAGE_TYPES)[number]

export const MESSAGE_STATES = ['queued', 'dispatched', 'completed', 'rejected', 'timed_out', 'interrupted', 'failed'] as const
export type MessageState = (typeof MESSAGE_STATES)[number]

export const LANES = ['activity', 'decisions', 'escalations'] as const
export type CollabLane = (typeof LANES)[number]

export interface MessageTransition {
  state: string
  at: string | null
  reason: string | null
}

/** One agent-to-agent message, normalized from either a v1 or a v2 payload. */
export interface CollabMessage {
  message_id: string
  sender: string
  recipient: string
  message_type: string
  state: MessageState
  lane: CollabLane
  subject: string | null
  /** `content` in v2; mirrors the legacy `question`. */
  content: string
  answer: string | null
  reason: string | null
  payload: unknown
  parent_message_id: string | null
  credits_charged: number
  created_at: string | null
  resolved_at: string | null
  transitions: MessageTransition[]
  protocol_version: number
}

// --- Decisions lane: blackboard (§4) --------------------------------------

export const BLACKBOARD_KINDS = ['decision', 'assumption', 'open_question', 'risk', 'constraint'] as const
export type BlackboardKind = (typeof BLACKBOARD_KINDS)[number]

export interface BlackboardEntry {
  entry_id: string
  key: string
  kind: BlackboardKind
  value: string
  rationale: string | null
  owner_agent: string | null
  source_message_id: string | null
  version: number
  created_at: string | null
  superseded_by: string | null
}

// --- Escalations lane (§5) ------------------------------------------------

export const ESCALATION_STATES = ['open', 'resolved', 'expired'] as const
export type EscalationState = (typeof ESCALATION_STATES)[number]

export interface EscalationConflict {
  key: string
  existing_value: string
  proposed_value: string
}

export interface Escalation {
  escalation_id: string
  raised_by: string | null
  decision_owner: string | null
  subject: string
  detail: string
  options: string[]
  conflict: EscalationConflict | null
  state: EscalationState
  resolution: string | null
  /** `agent:<id>`, `user` or `default`. */
  resolved_by: string | null
  rationale: string | null
  created_at: string | null
  resolved_at: string | null
}

// --- Hydration endpoint (§7) ----------------------------------------------

export interface CollaborationBudget {
  credits_used: number
  reserved_credits: number
  messages_used: number
  max_messages: number
}

export interface CollaborationSnapshot {
  protocol_version: number
  messages: CollabMessage[]
  decisions: BlackboardEntry[]
  escalations: Escalation[]
  budget: CollaborationBudget | null
}

// --- Normalizers (never throw; null for anything unusable) ----------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
function oneOf<T extends string>(values: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : null
}

/**
 * Legacy `status` → v2 `state`, per Revision 1 §4.3 of the plan:
 * pending (no delivery attempt) → queued, pending (attempted) → dispatched,
 * answered → completed, timeout → timed_out, failed + interrupted → interrupted.
 */
export function legacyStatusToState(status: unknown, deliveryAttempts?: unknown, reason?: unknown): MessageState {
  switch (status) {
    case 'pending':
      return num(deliveryAttempts) > 0 ? 'dispatched' : 'queued'
    case 'answered':
      return 'completed'
    case 'rejected':
      return 'rejected'
    case 'timeout':
      return 'timed_out'
    case 'failed':
      return reason === 'interrupted' ? 'interrupted' : 'failed'
    default:
      return 'queued'
  }
}

/** v2 `state` → the legacy `status` that v1 consumers still read. */
export function stateToLegacyStatus(state: MessageState): 'pending' | 'answered' | 'rejected' | 'timeout' | 'failed' {
  switch (state) {
    case 'queued':
    case 'dispatched':
      return 'pending'
    case 'completed':
      return 'answered'
    case 'rejected':
      return 'rejected'
    case 'timed_out':
      return 'timeout'
    default:
      return 'failed'
  }
}

export function messageStateOf(raw: Record<string, unknown>): MessageState {
  return oneOf(MESSAGE_STATES, raw.state) ?? legacyStatusToState(raw.status, raw.delivery_attempts, raw.reason)
}

function defaultLane(messageType: string): CollabLane {
  if (messageType === 'escalation') return 'escalations'
  if (messageType === 'decision_proposal') return 'decisions'
  return 'activity'
}

function normalizeTransitions(v: unknown): MessageTransition[] {
  if (!Array.isArray(v)) return []
  return v.filter(isObj).map((t) => ({
    // R1 §4.3 named this key `status`; the shared contract names it `state`.
    state: str(t.state) ?? str(t.status) ?? '',
    at: str(t.at),
    reason: str(t.reason),
  }))
}

export function normalizeMessage(raw: unknown): CollabMessage | null {
  if (!isObj(raw)) return null
  const message_id = str(raw.message_id)
  const sender = str(raw.sender)
  const recipient = str(raw.recipient)
  const content = str(raw.content) ?? str(raw.question)
  if (!message_id || !sender || !recipient || content === null) return null
  const message_type = str(raw.message_type) ?? 'clarification'
  return {
    message_id,
    sender,
    recipient,
    message_type,
    state: messageStateOf(raw),
    lane: oneOf(LANES, raw.lane) ?? defaultLane(message_type),
    subject: str(raw.subject),
    content,
    answer: str(raw.answer),
    reason: str(raw.reason),
    payload: raw.payload ?? null,
    parent_message_id: str(raw.parent_message_id),
    credits_charged: num(raw.credits_charged),
    created_at: str(raw.created_at),
    resolved_at: str(raw.resolved_at),
    transitions: normalizeTransitions(raw.transitions),
    protocol_version: num(raw.protocol_version, 1),
  }
}

export function normalizeEntry(raw: unknown): BlackboardEntry | null {
  if (!isObj(raw)) return null
  const entry_id = str(raw.entry_id)
  const key = str(raw.key)
  if (!entry_id || !key) return null
  const value = typeof raw.value === 'string' ? raw.value : raw.value == null ? '' : JSON.stringify(raw.value)
  return {
    entry_id,
    key,
    kind: oneOf(BLACKBOARD_KINDS, raw.kind) ?? 'decision',
    value,
    rationale: str(raw.rationale),
    owner_agent: str(raw.owner_agent),
    source_message_id: str(raw.source_message_id),
    version: num(raw.version, 1),
    created_at: str(raw.created_at),
    superseded_by: str(raw.superseded_by),
  }
}

export function normalizeEscalation(raw: unknown): Escalation | null {
  if (!isObj(raw)) return null
  const escalation_id = str(raw.escalation_id)
  if (!escalation_id) return null
  const conflict = isObj(raw.conflict)
    ? {
        key: str(raw.conflict.key) ?? '',
        existing_value: str(raw.conflict.existing_value) ?? '',
        proposed_value: str(raw.conflict.proposed_value) ?? '',
      }
    : null
  return {
    escalation_id,
    raised_by: str(raw.raised_by),
    decision_owner: str(raw.decision_owner),
    subject: str(raw.subject) ?? '',
    detail: str(raw.detail) ?? '',
    options: Array.isArray(raw.options) ? raw.options.filter((o): o is string => typeof o === 'string') : [],
    conflict,
    state: oneOf(ESCALATION_STATES, raw.state) ?? 'open',
    resolution: str(raw.resolution),
    resolved_by: str(raw.resolved_by),
    rationale: str(raw.rationale),
    created_at: str(raw.created_at),
    resolved_at: str(raw.resolved_at),
  }
}

function normalizeList<T>(v: unknown, normalize: (raw: unknown) => T | null): T[] {
  if (!Array.isArray(v)) return []
  const out: T[] = []
  for (const item of v) {
    const n = normalize(item)
    if (n) out.push(n)
  }
  return out
}

export function normalizeSnapshot(raw: unknown): CollaborationSnapshot | null {
  if (!isObj(raw)) return null
  const b = isObj(raw.budget) ? raw.budget : null
  return {
    protocol_version: num(raw.protocol_version, 1),
    messages: normalizeList(raw.messages, normalizeMessage),
    decisions: normalizeList(raw.decisions, normalizeEntry),
    escalations: normalizeList(raw.escalations, normalizeEscalation),
    budget: b
      ? {
          credits_used: num(b.credits_used),
          reserved_credits: num(b.reserved_credits),
          messages_used: num(b.messages_used),
          max_messages: num(b.max_messages),
        }
      : null,
  }
}

/**
 * The same snapshot built from a GET /builds/{id} document, for backends that
 * don't serve the hydration endpoint yet (or when it fails). A build without a
 * `collab_config` snapshot is a legacy (protocol 1) build.
 */
export function snapshotFromBuildDoc(doc: Record<string, unknown>): CollaborationSnapshot {
  const config = isObj(doc.collab_config) ? doc.collab_config : null
  return {
    protocol_version: num(config?.protocol_version, 1),
    messages: normalizeList(doc.agent_messages, normalizeMessage),
    decisions: normalizeList(doc.blackboard, normalizeEntry),
    escalations: normalizeList(doc.escalations, normalizeEscalation),
    budget: null,
  }
}

// --- Monotonic merge: never move a record back to an earlier state ---------

export function messageStateRank(state: MessageState): number {
  if (state === 'queued') return 0
  if (state === 'dispatched') return 1
  return 2
}

function mergeTransitions(a: MessageTransition[], b: MessageTransition[]): MessageTransition[] {
  if (b.length === 0) return a
  if (a.length === 0) return b
  const seen = new Set(a.map((t) => `${t.state}@${t.at}`))
  const extra = b.filter((t) => !seen.has(`${t.state}@${t.at}`))
  return extra.length === 0 ? a : [...a, ...extra]
}

/** Returns `existing` (same reference) when `incoming` would move it backwards. */
export function mergeMessage(existing: CollabMessage | undefined, incoming: CollabMessage): CollabMessage {
  if (!existing) return incoming
  const before = messageStateRank(existing.state)
  const after = messageStateRank(incoming.state)
  if (after < before) return existing
  // Two different terminal states: the first one recorded is final.
  if (after === before && after === 2 && incoming.state !== existing.state) return existing
  return {
    ...existing,
    ...incoming,
    // Fields a later partial payload may omit must not be wiped.
    answer: incoming.answer ?? existing.answer,
    reason: incoming.reason ?? existing.reason,
    subject: incoming.subject ?? existing.subject,
    created_at: existing.created_at ?? incoming.created_at,
    resolved_at: incoming.resolved_at ?? existing.resolved_at,
    transitions: mergeTransitions(existing.transitions, incoming.transitions),
    protocol_version: Math.max(existing.protocol_version, incoming.protocol_version),
  }
}

export function escalationStateRank(state: EscalationState): number {
  return state === 'open' ? 0 : 1
}

export function mergeEscalation(existing: Escalation | undefined, incoming: Escalation): Escalation {
  if (!existing) return incoming
  const before = escalationStateRank(existing.state)
  const after = escalationStateRank(incoming.state)
  if (after < before) return existing
  if (after === before && after === 1 && incoming.state !== existing.state) return existing
  return {
    ...existing,
    ...incoming,
    options: incoming.options.length > 0 ? incoming.options : existing.options,
    conflict: incoming.conflict ?? existing.conflict,
    created_at: existing.created_at ?? incoming.created_at,
  }
}

export function mergeEntry(existing: BlackboardEntry | undefined, incoming: BlackboardEntry): BlackboardEntry {
  if (!existing) return incoming
  if (incoming.version < existing.version) return existing
  // Once superseded, an entry stays superseded.
  if (existing.superseded_by && !incoming.superseded_by) {
    return incoming.version === existing.version ? existing : { ...incoming, superseded_by: existing.superseded_by }
  }
  return { ...existing, ...incoming, created_at: existing.created_at ?? incoming.created_at }
}

/** Upsert into a list keyed by id; returns the same list when nothing changed. */
export function upsertById<T>(list: T[], item: T, idOf: (t: T) => string, merge: (a: T | undefined, b: T) => T): T[] {
  const id = idOf(item)
  const i = list.findIndex((x) => idOf(x) === id)
  if (i === -1) return [...list, merge(undefined, item)]
  const merged = merge(list[i], item)
  if (merged === list[i]) return list
  const next = list.slice()
  next[i] = merged
  return next
}
