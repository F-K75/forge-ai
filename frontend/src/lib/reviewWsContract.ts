// Hand-written mirror of orchestrator/service.py's `_emit()` calls and
// orchestrator/runner.py's `run_agents()` emit calls. Unlike the main
// backend's build-socket events (lib/wsContract.ts), these are NOT
// generated from a backend enum — there is no equivalent export script for
// this standalone service — and the payload is flat (no `data` wrapper).

export const REVIEW_WS_EVENT_TYPES = [
  'run_started',
  'agent_started',
  'agent_done',
  'consolidating',
  'complete',
  'error',
  'ping',
] as const

export type ReviewWSEventType = (typeof REVIEW_WS_EVENT_TYPES)[number]

export type ReviewWSEventBase<TType extends ReviewWSEventType> = {
  type: TType
  run_id?: string
}

export type RunStartedEvent = ReviewWSEventBase<'run_started'> & {
  mode: 'full' | 'diff'
  candidate_files: number
  triggered_agents: string[]
}

export type AgentStartedEvent = ReviewWSEventBase<'agent_started'> & {
  agent_id: string
  stage: number
  matched_files: string[]
}

export type AgentDoneEvent = ReviewWSEventBase<'agent_done'> & {
  agent_id: string
  status: 'success' | 'failed' | 'skipped'
  score: number | null
  issues: number
  cost_usd: number
  error?: string | null
}

export type ConsolidatingEvent = ReviewWSEventBase<'consolidating'> & {
  reports: number
}

export type CompleteEvent = ReviewWSEventBase<'complete'> & {
  overall_score: number
  recommendation: 'GO' | 'NO_GO' | 'GO_WITH_FIXES'
  backlog_items: number
  total_cost_usd: number
  total_tokens: number
}

export type ReviewErrorEvent = ReviewWSEventBase<'error'> & {
  error?: string
}

export type PingEvent = ReviewWSEventBase<'ping'>

export type AnyReviewWSEvent =
  | RunStartedEvent
  | AgentStartedEvent
  | AgentDoneEvent
  | ConsolidatingEvent
  | CompleteEvent
  | ReviewErrorEvent
  | PingEvent

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isValidReviewEventType(t: unknown): t is ReviewWSEventType {
  return typeof t === 'string' && (REVIEW_WS_EVENT_TYPES as readonly string[]).includes(t)
}

/** Defensive parsing: never throws. Returns null for malformed events. */
export function parseReviewWSEvent(raw: unknown): AnyReviewWSEvent | null {
  if (!isRecord(raw)) return null
  const type = raw.type
  if (!isString(type) || !isValidReviewEventType(type)) return null

  switch (type) {
    case 'run_started':
      if (!isString((raw as any).mode) || !Array.isArray((raw as any).triggered_agents)) return null
      return raw as RunStartedEvent
    case 'agent_started':
      if (!isString((raw as any).agent_id)) return null
      return raw as AgentStartedEvent
    case 'agent_done':
      if (!isString((raw as any).agent_id) || !isString((raw as any).status)) return null
      return raw as AgentDoneEvent
    case 'consolidating':
      return raw as ConsolidatingEvent
    case 'complete':
      if (!isString((raw as any).recommendation)) return null
      return raw as CompleteEvent
    case 'error':
      return raw as ReviewErrorEvent
    case 'ping':
      return raw as PingEvent
    default:
      return null
  }
}
