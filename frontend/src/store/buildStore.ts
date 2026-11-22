import { create } from 'zustand'
import type { AgentMessageData, AnyWSEvent, GateKind } from '../lib/wsContract'
import { isRecord } from '../lib/wsContract'
import type { Agent } from '../lib/agents'
import {
  readPersistedStatus,
  type BuildDetail,
  type BuildStepDoc,
  type ExecutionTransition,
  type PersistedStatus,
} from '../lib/buildContract'
import { legacyStatusToState, messageStateRank, type MessageState } from '../lib/collabContract'
import { useDeploymentStore } from './deploymentStore'
import { useCollaborationStore } from './collaborationStore'

// Legacy per-agent tracker — kept for backward-compat selectors.
export type AgentRunStatus = 'idle' | 'running' | 'complete' | 'failed'
export interface AgentRunState {
  type: string
  status: AgentRunStatus
  output: string
  filesChanged: string[]
}

// Mirrors AgentPipeline's AgentState — kept independent so this store
// doesn't import a component module.
export type PipelineNodeState = 'idle' | 'active' | 'done' | 'debugging'

export type UiBuildStatus = 'idle' | 'running' | 'debugging' | 'complete' | 'failed'

export interface ValidationState {
  score?: number
  missing_features?: string[]
  [key: string]: unknown
}

export interface BuildMessage {
  from: 'user' | 'system'
  text: string
  agent?: Agent['id']
}

export interface DebugInfo {
  iteration: number
  errors: string[]
}

// An interactive build's pending checkpoint — see GateRequestEvent. Cleared
// when the matching gate_resolved event arrives (whether resolved by the
// user, auto-approve, or the server's own timeout).
export interface PendingGate {
  gateId: string
  stage: string
  agent: string
  kind: GateKind
  questions: string[]
  timeoutSeconds: number
  requestedAt: string
  // kind === 'escalation' (collaboration protocol v2)
  escalationId?: string
  subject?: string
  detail?: string
  options?: string[]
}

/** One run of one agent, for the Activity lane (hydrated from build.agents). */
export interface StepRecord {
  agent: string
  status: 'running' | 'success' | 'failed'
  startedAt: string | null
  completedAt: string | null
  iteration?: number
}

/** The persisted state of a build, as fetched on every (re)connect. */
export interface BuildHydration {
  buildId: string
  detail: BuildDetail
  /** GET /builds/{id}/files; null when that request failed. */
  files: Record<string, string> | null
}

export interface BuildState {
  buildId: string | null
  status: UiBuildStatus
  prompt: string

  /**
   * The build's persisted execution status (build_status, else the legacy
   * status) from the REST state. While it is known, it alone decides
   * `status`: WS events only add the debugging sub-state of a running build,
   * and a terminal event makes the socket re-read the persisted state
   * instead of flipping `status` itself (B1-7). Null in demo mode and before
   * the first snapshot, when `status` follows events (monotonically).
   */
  persistedStatus: PersistedStatus | null
  transitions: ExecutionTransition[]
  debugActive: boolean
  lastHydratedAt: string | null

  // Pipeline-driven state
  activeAgent: Agent['id'] | null
  agentStates: Record<string, PipelineNodeState>
  steps: StepRecord[]

  // Chat
  messages: BuildMessage[]

  // Editor
  files: Record<string, string>
  openFile: string | null
  streamBuffer: string

  // Metrics
  tokenCount: number
  creditsUsed: number
  qaScore: number | null

  // Debug loop
  debug: DebugInfo | null
  debugIterations: number

  // Legacy (kept for backward-compat selectors)
  agents: AgentRunState[]

  validation: ValidationState | null
  businessModel: Record<string, unknown> | null
  error: string | null

  // Each agent's own structured output (blueprint, design system, QA
  // report, etc.) — see AgentOutputEvent. Keyed by agent id.
  agentOutputs: Record<string, unknown>

  // Interactive-build approval gate (see PendingGate). autoApprove is a
  // client-only preference — ChatPanel watches it and, when true, responds
  // to any new gate immediately instead of waiting on the user.
  pendingGate: PendingGate | null
  autoApprove: boolean

  // Agent-to-agent exchanges (e.g. Developer asking the Architect), in the
  // order they were raised; updated in place when the response arrives.
  agentMessages: AgentMessageData[]

  // Workspace OS Layout State
  viewMode: 'split' | 'editor' | 'chat' | 'preview' | 'diff'
  showContextPanel: boolean
  showBottomPanel: boolean
  bottomTab: 'terminal' | 'problems' | 'output' | 'logs' | 'git'
  activeModel: string

  // Actions
  /** A build this client just created. `initial` is the create response. */
  startBuild: (buildId: string, prompt: string, initial?: { status?: string; build_status?: string }) => void
  /** Follow an existing build (e.g. the project's latest, after a reload). */
  attachBuild: (buildId: string, prompt?: string) => void
  /** Apply the persisted REST state; events received meanwhile are applied after. */
  hydrate: (snapshot: BuildHydration) => void
  handleEvent: (event: AnyWSEvent) => void
  sendMessage: (msg: BuildMessage) => void
  setOpenFile: (path: string | null) => void
  setBuildId: (buildId: string | null) => void
  setFiles: (files: Record<string, string>) => void
  setAutoApprove: (value: boolean) => void
  setViewMode: (mode: 'split' | 'editor' | 'chat' | 'preview' | 'diff') => void
  toggleContextPanel: () => void
  toggleBottomPanel: () => void
  setBottomTab: (tab: 'terminal' | 'problems' | 'output' | 'logs' | 'git') => void
  setActiveModel: (model: string) => void
  reset: () => void
}

export const AGENT_ORDER: Agent['id'][] = ['architect', 'business_improver', 'designer', 'developer', 'integration', 'pm']

// The backend also emits a pseudo-agent id 'debugger' for the debug loop,
// which isn't one of the 6 specialists — narrow to a real Agent['id'] so
// chat messages only get an agent-colored treatment for a genuine agent.
const knownAgentId = (id: string): Agent['id'] | undefined =>
  (AGENT_ORDER as string[]).includes(id) ? (id as Agent['id']) : undefined

const initialAgents = (): AgentRunState[] =>
  AGENT_ORDER.map(type => ({
    type,
    status: 'idle',
    output: '',
    filesChanged: [],
  }))

const initialAgentStates = (): Record<string, PipelineNodeState> =>
  Object.fromEntries(AGENT_ORDER.map(id => [id, 'idle' as PipelineNodeState]))

export const AGENT_LABELS: Record<string, string> = {
  architect: 'Architect',
  business_improver: 'Business Model',
  designer: 'Designer',
  developer: 'Developer',
  integration: 'Integration',
  pm: 'PM',
  debugger: 'Debugger',
}

const AGENT_MESSAGE_REASONS: Record<string, string> = {
  budget_exhausted: 'credit budget reached',
  question_limit: 'question limit reached',
  timeout: 'timed out',
  route_not_allowed: 'not permitted',
  invalid_question: 'empty question',
  empty_answer: 'no answer returned',
  interrupted: 'interrupted by a restart',
}

function agentMessageState(m: AgentMessageData): MessageState {
  return m.state ?? legacyStatusToState(m.status, m.delivery_attempts, m.reason)
}

// De-duplicated by message_id; a replayed or out-of-order event never moves
// an exchange back (e.g. a late "pending" after its "answered").
function upsertAgentMessage(list: AgentMessageData[], msg: AgentMessageData): AgentMessageData[] {
  const i = list.findIndex(m => m.message_id === msg.message_id)
  if (i === -1) return [...list, msg]
  if (messageStateRank(agentMessageState(msg)) < messageStateRank(agentMessageState(list[i]))) return list
  const next = list.slice()
  next[i] = { ...list[i], ...msg }
  return next
}

const isTerminal = (s: UiBuildStatus) => s === 'complete' || s === 'failed'

export function uiStatusFromPersisted(p: PersistedStatus, debugActive: boolean): UiBuildStatus {
  if (p.status === 'completed') return 'complete'
  if (p.status === 'failed') return 'failed'
  return p.debugging || debugActive ? 'debugging' : 'running'
}

/**
 * The one place `status` is decided. With a persisted status known, it wins
 * outright. Without one (demo mode, or before the first snapshot) the status
 * an event proposes is taken, except that a terminal status never goes back.
 */
function resolveStatus(state: BuildState, patch: Partial<BuildState>): Partial<BuildState> {
  const persisted = patch.persistedStatus !== undefined ? patch.persistedStatus : state.persistedStatus
  const debugActive = patch.debugActive ?? state.debugActive
  if (persisted) {
    const status = uiStatusFromPersisted(persisted, debugActive)
    return status === state.status && patch.status === undefined ? patch : { ...patch, status }
  }
  if (patch.status === undefined) return patch
  if (isTerminal(state.status) && !isTerminal(patch.status)) {
    const rest = { ...patch }
    delete rest.status
    return rest
  }
  return patch
}

// --- Steps (Activity lane) -------------------------------------------------

function lastIndexWhere<T>(list: T[], pred: (t: T) => boolean): number {
  for (let i = list.length - 1; i >= 0; i--) if (pred(list[i])) return i
  return -1
}

function stepStarted(steps: StepRecord[], agent: string, at: string | null, iteration?: number): StepRecord[] {
  const i = lastIndexWhere(steps, s => s.agent === agent)
  if (i !== -1 && steps[i].status === 'running') return steps
  if (iteration !== undefined && steps.some(s => s.agent === agent && s.iteration === iteration)) return steps
  return [...steps, { agent, status: 'running', startedAt: at, completedAt: null, ...(iteration !== undefined ? { iteration } : {}) }]
}

function stepFinished(steps: StepRecord[], agent: string, at: string | null, status: 'success' | 'failed'): StepRecord[] {
  const i = lastIndexWhere(steps, s => s.agent === agent)
  if (i !== -1 && steps[i].status === 'running') {
    const next = steps.slice()
    next[i] = { ...steps[i], status, completedAt: at }
    return next
  }
  if (i !== -1) return steps // already finished: a replayed event
  return [...steps, { agent, status, startedAt: null, completedAt: at }]
}

function stepsFromDocs(docs: BuildStepDoc[]): StepRecord[] {
  const out: StepRecord[] = []
  for (const d of docs) {
    if (!d || typeof d.agent !== 'string') continue
    const status =
      d.status === 'success' ? 'success' : d.status === 'failed' ? 'failed' : d.status === 'running' || d.status === 'debugging' ? 'running' : null
    if (!status) continue // pending: not started yet
    out.push({ agent: d.agent, status, startedAt: d.started_at ?? null, completedAt: d.completed_at ?? null })
  }
  return out
}

function parseJson(text: unknown): unknown {
  if (typeof text !== 'string' || !text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function pendingGateFrom(raw: unknown): PendingGate | null {
  if (!isRecord(raw) || typeof raw.gate_id !== 'string') return null
  // The user has already answered; the worker just hasn't picked it up yet.
  if (raw.response) return null
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  const kind: GateKind = raw.kind === 'questions' || raw.kind === 'escalation' ? raw.kind : 'approval'
  return {
    gateId: raw.gate_id,
    stage: typeof raw.stage === 'string' ? raw.stage : '',
    agent: typeof raw.agent === 'string' ? raw.agent : '',
    kind,
    questions: strings(raw.questions),
    timeoutSeconds: typeof raw.timeout_seconds === 'number' ? raw.timeout_seconds : 0,
    requestedAt: typeof raw.requested_at === 'string' ? raw.requested_at : '',
    ...(kind === 'escalation'
      ? {
          escalationId: typeof raw.escalation_id === 'string' ? raw.escalation_id : undefined,
          subject: typeof raw.subject === 'string' ? raw.subject : undefined,
          detail: typeof raw.detail === 'string' ? raw.detail : undefined,
          options: strings(raw.options),
        }
      : {}),
  }
}

function agentMessagesFrom(raw: unknown): AgentMessageData[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (m): m is AgentMessageData =>
      isRecord(m) && typeof m.message_id === 'string' && typeof m.sender === 'string' && typeof m.recipient === 'string',
  ).map(m => ({ ...m, question: m.question ?? m.content ?? '' }))
}

/** Everything hydration derives from the persisted build document. */
function stateFromDetail(state: BuildState, { detail, files }: BuildHydration): Partial<BuildState> {
  const docs = Array.isArray(detail.agents) ? detail.agents : []
  const lastDoc = (agent: string) => {
    const i = lastIndexWhere(docs, d => d?.agent === agent)
    return i === -1 ? undefined : docs[i]
  }
  const persisted = readPersistedStatus(detail) ?? state.persistedStatus

  const agentStates = initialAgentStates()
  for (const id of AGENT_ORDER) {
    const d = lastDoc(id)
    if (d?.status === 'success') agentStates[id] = 'done'
    else if (d?.status === 'running') agentStates[id] = 'active'
    else if (d?.status === 'debugging') agentStates[id] = 'debugging'
  }
  if (persisted?.debugging) agentStates.developer = 'debugging'

  const runningIdx = lastIndexWhere(docs, d => (d?.status === 'running' || d?.status === 'debugging') && !!knownAgentId(d.agent))
  const activeAgent = runningIdx === -1 || persisted?.status === 'completed' || persisted?.status === 'failed'
    ? null
    : (docs[runningIdx].agent as Agent['id'])

  const agents: AgentRunState[] = AGENT_ORDER.map(type => {
    const own = docs.filter(d => d?.agent === type || (type === 'developer' && d?.agent === 'debugger'))
    const d = lastDoc(type)
    const status: AgentRunStatus =
      d?.status === 'success' ? 'complete' : d?.status === 'failed' ? 'failed' : d?.status === 'running' || d?.status === 'debugging' ? 'running' : 'idle'
    return {
      type,
      status,
      output: typeof d?.output === 'string' ? d.output : '',
      filesChanged: Array.from(new Set(own.flatMap(s => (Array.isArray(s.files_changed) ? s.files_changed : [])))),
    }
  })

  const agentOutputs = { ...state.agentOutputs }
  for (const id of AGENT_ORDER) {
    const d = lastDoc(id)
    const parsed = d?.status === 'success' ? parseJson(d.output) : null
    if (parsed !== null) agentOutputs[id] = parsed
  }
  const pmOutput = agentOutputs.pm
  const validation = isRecord(pmOutput) ? (pmOutput as ValidationState) : state.validation
  const score = validation?.score

  let agentMessages = state.agentMessages
  for (const m of agentMessagesFrom(detail.agent_messages)) agentMessages = upsertAgentMessage(agentMessages, m)

  const nextFiles = files ?? state.files
  const paths = Object.keys(nextFiles)
  const terminal = persisted?.status === 'completed' || persisted?.status === 'failed'

  return {
    persistedStatus: persisted,
    transitions: Array.isArray(detail.execution_transitions) ? detail.execution_transitions : state.transitions,
    debugActive: terminal ? false : persisted?.debugging ?? state.debugActive,
    lastHydratedAt: new Date().toISOString(),
    prompt: state.prompt || (typeof detail.prompt === 'string' ? detail.prompt : ''),
    agentStates,
    activeAgent,
    agents,
    steps: stepsFromDocs(docs),
    files: nextFiles,
    openFile: state.openFile && nextFiles[state.openFile] !== undefined ? state.openFile : paths[0] ?? null,
    creditsUsed: typeof detail.credits_used === 'number' ? detail.credits_used : state.creditsUsed,
    debugIterations: typeof detail.debug_iterations === 'number' ? detail.debug_iterations : state.debugIterations,
    businessModel: detail.business_model ?? state.businessModel,
    error: typeof detail.error === 'string' && detail.error ? detail.error : persisted?.status === 'failed' ? state.error : null,
    agentOutputs,
    validation,
    qaScore: typeof score === 'number' ? score : state.qaScore,
    pendingGate: pendingGateFrom(detail.pending_gate),
    agentMessages,
    streamBuffer: terminal ? '' : state.streamBuffer,
  }
}

const freshBuildState = (buildId: string | null, prompt: string) => ({
  buildId,
  prompt,
  status: 'idle' as UiBuildStatus,
  persistedStatus: null,
  transitions: [],
  debugActive: false,
  lastHydratedAt: null,
  activeAgent: null,
  agentStates: initialAgentStates(),
  steps: [],
  files: {},
  openFile: null,
  streamBuffer: '',
  tokenCount: 0,
  creditsUsed: 0,
  qaScore: null,
  debug: null,
  debugIterations: 0,
  agents: initialAgents(),
  validation: null,
  businessModel: null,
  error: null,
  agentOutputs: {},
  agentMessages: [],
  pendingGate: null,
  autoApprove: false,
})

export const useBuildStore = create<BuildState>((set, _get) => ({
  ...freshBuildState(null, ''),
  messages: [],

  viewMode: 'split',
  showContextPanel: true,
  showBottomPanel: false,
  bottomTab: 'terminal',
  activeModel: 'Gemini 2.5 Pro',

  startBuild: (buildId, prompt, initial) => {
    useDeploymentStore.getState().reset()
    useCollaborationStore.getState().reset(buildId)
    set({
      ...freshBuildState(buildId, prompt),
      status: 'running',
      persistedStatus: initial ? readPersistedStatus(initial) : null,
    })
  },

  attachBuild: (buildId, prompt = '') => {
    useDeploymentStore.getState().reset()
    useCollaborationStore.getState().reset(buildId)
    set({ ...freshBuildState(buildId, prompt), messages: [] })
  },

  hydrate: (snapshot) => {
    set(state => {
      if (state.buildId !== null && state.buildId !== snapshot.buildId) return state
      return resolveStatus(state, { buildId: snapshot.buildId, ...stateFromDetail(state, snapshot) })
    })
  },

  setBuildId: (buildId: string | null) => set({ buildId }),

  sendMessage: (msg) => set(state => ({ messages: [...state.messages, msg] })),

  setOpenFile: (path) => set({ openFile: path }),

  setAutoApprove: (value) => set({ autoApprove: value }),

  handleEvent: (event: AnyWSEvent) => {
    const { type, data } = event
    const at = event.timestamp ?? new Date().toISOString()

    // Deployments are driven over the same build_id channel and reuse
    // build_start/agent_progress/build_complete/build_failed event types
    // (see backend/api/deployments.py) — a deployment_id in data means this
    // event belongs to deploymentStore, not the code build's own state.
    if (isRecord(data) && typeof (data as { deployment_id?: unknown }).deployment_id === 'string') {
      useDeploymentStore.getState().handleEvent(type, data as { deployment_id: string; status?: string; url?: string; error?: string })
      return
    }

    // Collaboration lanes (protocol v2) live in their own store.
    const collab = useCollaborationStore.getState()
    if (type === 'agent_message_request' || type === 'agent_message_response') collab.applyMessage(data)
    else if (type === 'collab_decision_recorded') collab.applyDecision(data.entry)
    else if (type === 'collab_escalation_opened' || type === 'collab_escalation_resolved') collab.applyEscalation(data.escalation)

    set(state => {
      const patch = ((): Partial<BuildState> | null => {
        switch (type) {
          case 'agent_start': {
            const agent = data.agent
            const label = AGENT_LABELS[agent] ?? agent
            return {
              status: 'running',
              debugActive: false,
              activeAgent: agent as Agent['id'],
              agentStates: { ...state.agentStates, [agent]: 'active' },
              steps: stepStarted(state.steps, agent, at),
              agents: state.agents.map(a =>
                a.type === agent ? { ...a, status: 'running' as AgentRunStatus } : a
              ),
              messages: [...state.messages, { from: 'system', text: `${label} started`, agent: knownAgentId(agent) }],
            }
          }

          case 'agent_update': {
            const agent = data.agent
            const label = agent ? AGENT_LABELS[agent] ?? agent : null
            return {
              messages: [
                ...state.messages,
                {
                  from: 'system',
                  text: label ? `${label}: ${data.message}` : data.message,
                  agent: agent ? knownAgentId(agent) : undefined,
                },
              ],
            }
          }

          case 'agent_progress': {
            // No UI mapping yet; ignore safely.
            return null
          }

          case 'agent_output': {
            return {
              agentOutputs: { ...state.agentOutputs, [data.agent]: data.output },
            }
          }

          case 'agent_complete': {
            const agent = data.agent
            const newFiles = data.files_changed || []
            return {
              debugActive: agent === 'debugger' ? false : state.debugActive,
              steps: stepFinished(state.steps, agent, at, 'success'),
              agentStates:
                agent === 'debugger'
                  ? { ...state.agentStates, debugger: 'done', developer: 'done' }
                  : { ...state.agentStates, [agent]: 'done' },
              activeAgent: state.activeAgent === agent ? null : state.activeAgent,
              agents: state.agents.map(a => {
                // The debug loop reports completion as a separate 'debugger'
                // pseudo-agent (see AGENT_ORDER above), which has no entry of
                // its own here — without this branch, files patched during
                // debugging never landed in the Developer agent's
                // filesChanged, so its file list went stale after any retry.
                if (agent === 'debugger') {
                  return a.type === 'developer'
                    ? { ...a, status: 'complete' as AgentRunStatus, filesChanged: Array.from(new Set([...a.filesChanged, ...newFiles])) }
                    : a
                }
                return a.type === agent
                  ? { ...a, status: 'complete' as AgentRunStatus, filesChanged: newFiles }
                  : a
              }),
            }
          }

          case 'stream_token': {
            return {
              streamBuffer: state.streamBuffer + data.token,
              tokenCount: state.tokenCount + 1,
            }
          }

          case 'file_update': {
            // Was `data.files` (WS-002) -- the backend only ever sent that
            // shape once per build (right after the Developer agent); every
            // debug-loop patch used data.delta instead, which this handler
            // didn't understand, so parseWSEvent silently dropped those
            // events and patched files never reached the editor.
            const { changed, deleted } = data.delta
            const changedPaths = Object.keys(changed)
            const files = { ...state.files, ...changed }
            for (const path of deleted ?? []) delete files[path]
            const lastTouched = changedPaths[changedPaths.length - 1] ?? deleted?.[deleted.length - 1]
            return {
              files,
              openFile: lastTouched ?? state.openFile,
              streamBuffer: '',
            }
          }

          case 'build_complete': {
            const files = data.files || state.files
            const paths = Object.keys(files)
            const score = data.validation?.score ?? null
            return {
              status: 'complete',
              debugActive: false,
              activeAgent: null,
              files,
              openFile: state.openFile ?? (paths.length > 0 ? paths[0] : null),
              validation: data.validation ?? null,
              businessModel: data.business_model ?? state.businessModel,
              qaScore: typeof score === 'number' ? score : null,
              creditsUsed: data.credits_used ?? state.creditsUsed,
              streamBuffer: '',
              messages: [
                ...state.messages,
                { from: 'system', text: `Build complete — QA score ${typeof score === 'number' ? score : '—'}/100` },
              ],
            }
          }

          case 'gate_request': {
            const label = AGENT_LABELS[data.agent] ?? data.agent
            const text =
              data.kind === 'escalation'
                ? `Decision needed: ${data.subject ?? 'an escalation'}.`
                : data.kind === 'questions'
                ? `${label} has ${data.questions.length} question${data.questions.length === 1 ? '' : 's'} before starting.`
                : `${label} is done — waiting for approval to continue.`
            return {
              pendingGate: {
                gateId: data.gate_id,
                stage: data.stage,
                agent: data.agent,
                kind: data.kind,
                questions: data.questions,
                timeoutSeconds: data.timeout_seconds,
                requestedAt: data.requested_at,
                ...(data.kind === 'escalation'
                  ? { escalationId: data.escalation_id, subject: data.subject, detail: data.detail, options: data.options ?? [] }
                  : {}),
              },
              messages: [...state.messages, { from: 'system', text, agent: knownAgentId(data.agent) }],
            }
          }

          case 'gate_resolved': {
            // Only clear if this resolves the gate we're currently showing —
            // a stale/duplicate event for an already-cleared gate shouldn't
            // resurrect stale UI state.
            if (state.pendingGate && state.pendingGate.gateId !== data.gate_id) return null
            // The server-timeout auto-approve case already gets its own
            // "No response — continuing automatically" agent_update right
            // after this event (see orchestrator._wait_for_gate) — narrating
            // it here too would just duplicate that line.
            if (data.auto) return { pendingGate: null }
            const label = AGENT_LABELS[data.agent] ?? data.agent
            const text =
              data.action === 'cancel'
                ? `Build cancelled at ${label}.`
                : data.action === 'answers' && state.pendingGate?.kind === 'escalation'
                ? 'Decision recorded — continuing.'
                : `${label}: approved — continuing.`
            return {
              pendingGate: null,
              messages: [...state.messages, { from: 'system', text, agent: knownAgentId(data.agent) }],
            }
          }

          case 'agent_message_request': {
            const from = AGENT_LABELS[data.sender] ?? data.sender
            const to = AGENT_LABELS[data.recipient] ?? data.recipient
            const agentMessages = upsertAgentMessage(state.agentMessages, data)
            if (agentMessages === state.agentMessages) return null
            return {
              agentMessages,
              messages: [
                ...state.messages,
                { from: 'system', text: `${from} → ${to}: ${data.question}`, agent: knownAgentId(data.sender) },
              ],
            }
          }

          case 'agent_message_response': {
            const from = AGENT_LABELS[data.sender] ?? data.sender
            const to = AGENT_LABELS[data.recipient] ?? data.recipient
            const agentMessages = upsertAgentMessage(state.agentMessages, data)
            if (agentMessages === state.agentMessages) return null
            const text =
              data.status === 'answered'
                ? `${to} → ${from}: ${data.answer ?? ''}`
                : `${from} continues without an answer from ${to} (${AGENT_MESSAGE_REASONS[data.reason ?? ''] ?? data.reason ?? data.status}).`
            return {
              agentMessages,
              creditsUsed: data.credits_used ?? state.creditsUsed,
              messages: [
                ...state.messages,
                { from: 'system', text, agent: knownAgentId(data.status === 'answered' ? data.recipient : data.sender) },
              ],
            }
          }

          case 'collab_decision_recorded': {
            const label = AGENT_LABELS[data.entry.owner_agent ?? ''] ?? data.entry.owner_agent ?? 'Orchestrator'
            return {
              messages: [...state.messages, { from: 'system', text: `${label} recorded ${data.entry.kind} "${data.entry.key}".`, agent: knownAgentId(data.entry.owner_agent ?? '') }],
            }
          }

          case 'collab_escalation_opened':
          case 'collab_escalation_resolved': {
            const e = data.escalation
            const text =
              type === 'collab_escalation_opened'
                ? `Escalation opened: ${e.subject}`
                : `Escalation ${e.state}: ${e.subject}${e.resolution ? ` → ${e.resolution}` : ''}`
            // A resolved escalation makes its gate moot, even if gate_resolved was missed.
            const clearsGate =
              type === 'collab_escalation_resolved' &&
              state.pendingGate?.kind === 'escalation' &&
              state.pendingGate.escalationId === e.escalation_id
            return {
              ...(clearsGate ? { pendingGate: null } : {}),
              messages: [...state.messages, { from: 'system', text }],
            }
          }

          case 'build_failed': {
            return {
              status: 'failed',
              debugActive: false,
              error: data.error ?? 'Build failed',
              messages: [...state.messages, { from: 'system', text: `Build failed: ${data.error ?? 'Unknown error'}` }],
            }
          }

          case 'debug_start': {
            const iteration = data.iteration ?? state.debugIterations + 1
            const errors: string[] = Array.isArray(data.errors) ? data.errors : []
            return {
              status: 'debugging',
              debugActive: true,
              debug: { iteration, errors },
              debugIterations: iteration,
              steps: stepStarted(state.steps, 'debugger', at, iteration),
              agentStates: { ...state.agentStates, developer: 'debugging' },
              messages: [
                ...state.messages,
                { from: 'system', text: `Retrying — iteration ${iteration}/3` },
              ],
            }
          }

          case 'credits_update': {
            return { creditsUsed: data.credits_used ?? state.creditsUsed }
          }

          case 'error': {
            return { error: data.error ?? state.error }
          }

          default:
            return null
        }
      })()
      return patch ? resolveStatus(state, patch) : state
    })
  },

  setFiles: (files) => set({ files }),

  setViewMode: (viewMode) => set({ viewMode }),
  toggleContextPanel: () => set((state) => ({ showContextPanel: !state.showContextPanel })),
  toggleBottomPanel: () => set((state) => ({ showBottomPanel: !state.showBottomPanel })),
  setBottomTab: (bottomTab) => set({ bottomTab, showBottomPanel: true }),
  setActiveModel: (activeModel) => set({ activeModel }),

  reset: () => {
    useDeploymentStore.getState().reset()
    useCollaborationStore.getState().reset(null)
    set({ ...freshBuildState(null, ''), messages: [] })
  },
}))
