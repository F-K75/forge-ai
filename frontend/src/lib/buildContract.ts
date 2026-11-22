// REST shapes of the build endpoints (backend/api/builds.py) and the rule for
// reading a build's persisted execution status (plan Revision 3, C10 / B1-7).

/** Canonical persisted execution status (`builds.build_status`, A1). */
export type CanonicalBuildStatus = 'pending' | 'running' | 'completed' | 'failed'

/** POST /v1/builds/ → `{build_id, status}`; never `id` (F15). */
export interface CreateBuildResponse {
  build_id: string
  status?: string
  build_status?: string
  idempotent?: boolean
}

export interface ExecutionTransition {
  from?: string | null
  to: string
  at?: string | null
  reason?: string | null
  attempt_token?: string | null
}

/** One entry of `build.agents` (core/models.py AgentStep). */
export interface BuildStepDoc {
  agent: string
  status?: string
  started_at?: string | null
  completed_at?: string | null
  output?: string
  files_changed?: string[]
  error?: string | null
}

/** GET /v1/builds/{id}: the persisted build document (fields this client reads). */
export interface BuildDetail {
  id: string
  project_id?: string
  prompt?: string
  status?: string
  build_status?: string
  execution_transitions?: ExecutionTransition[]
  agents?: BuildStepDoc[]
  agent_messages?: unknown[]
  pending_gate?: Record<string, unknown> | null
  credits_used?: number
  debug_iterations?: number
  business_model?: Record<string, unknown> | null
  error?: string | null
  interactive?: boolean
  collab_config?: { protocol_version?: number } | null
  blackboard?: unknown[]
  escalations?: unknown[]
  created_at?: string
  completed_at?: string | null
}

export interface PersistedStatus {
  status: CanonicalBuildStatus
  /** The legacy status said `debugging` (a sub-state of running). */
  debugging: boolean
  source: 'build_status' | 'execution_transitions' | 'status'
}

const CANONICAL: readonly string[] = ['pending', 'running', 'completed', 'failed']

function fromLegacy(status: string): { status: CanonicalBuildStatus; debugging: boolean } | null {
  switch (status) {
    case 'pending':
    case 'running':
    case 'failed':
      return { status, debugging: false }
    case 'debugging':
      return { status: 'running', debugging: true }
    case 'success':
    case 'completed':
      return { status: 'completed', debugging: false }
    default:
      return null
  }
}

/**
 * The build's persisted execution status. Prefers the canonical
 * `build_status`, then the last recorded `execution_transitions[].to`, and
 * falls back to the legacy `status` for backends that don't write either yet.
 * Returns null when the document carries none of them.
 */
export function readPersistedStatus(doc: {
  build_status?: unknown
  execution_transitions?: unknown
  status?: unknown
}): PersistedStatus | null {
  const legacy = typeof doc.status === 'string' ? fromLegacy(doc.status) : null
  const debugging = legacy?.debugging ?? false

  if (typeof doc.build_status === 'string' && CANONICAL.includes(doc.build_status)) {
    return { status: doc.build_status as CanonicalBuildStatus, debugging, source: 'build_status' }
  }
  if (Array.isArray(doc.execution_transitions) && doc.execution_transitions.length > 0) {
    const last = doc.execution_transitions[doc.execution_transitions.length - 1] as { to?: unknown }
    if (typeof last?.to === 'string' && CANONICAL.includes(last.to)) {
      return { status: last.to as CanonicalBuildStatus, debugging, source: 'execution_transitions' }
    }
  }
  return legacy ? { ...legacy, source: 'status' } : null
}

export function isTerminalPersisted(p: PersistedStatus | null): boolean {
  return p?.status === 'completed' || p?.status === 'failed'
}

/** Backend timestamps are naive UTC (no zone suffix); make them parseable as UTC. */
export function asUtc(ts: string | null | undefined): string | null {
  if (!ts) return null
  return /([zZ]|[+-]\d\d:?\d\d)$/.test(ts) ? ts : `${ts}Z`
}

export function timeOf(ts: string | null | undefined): number | null {
  const iso = asUtc(ts)
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}
