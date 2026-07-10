import { create } from 'zustand'
import toast from 'react-hot-toast'
import type { AnyWSEvent } from '../lib/wsContract'
import { isRecord } from '../lib/wsContract'
import type { Agent } from '../lib/agents'
import { buildsApi } from '../lib/api'
import { LIVE_MODE } from '../lib/env'
import { useDeploymentStore } from './deploymentStore'

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

export interface ValidationState {
  score?: number
  missing_features?: string[]
  [key: string]: unknown
}

export interface BuildMessage {
  from: 'user' | 'system'
  text: string
}

// A pause point in an interactive build: the pipeline is waiting for the
// user to approve the stage (kind "approval") or answer the architect's
// clarifying questions (kind "questions"). See backend Orchestrator._wait_for_gate.
export interface PendingGate {
  gateId: string
  stage: string
  agent: string
  kind: 'approval' | 'questions'
  questions: string[]
  timeoutSeconds: number | null
}

export type GateAction = 'approve' | 'cancel' | 'answers'

export interface DebugInfo {
  iteration: number
  errors: string[]
}

export interface BuildState {
  buildId: string | null
  status: 'idle' | 'running' | 'debugging' | 'complete' | 'failed'
  prompt: string

  // Pipeline-driven state
  activeAgent: Agent['id'] | null
  agentStates: Record<string, PipelineNodeState>

  // Interactive flow: structured per-agent results + the gate (if any)
  // the pipeline is currently paused on.
  agentOutputs: Record<string, unknown>
  pendingGate: PendingGate | null
  gateSubmitting: boolean

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

  // Actions
  startBuild: (buildId: string, prompt: string) => void
  handleEvent: (event: AnyWSEvent) => void
  sendMessage: (msg: BuildMessage) => void
  setOpenFile: (path: string | null) => void
  setBuildId: (buildId: string | null) => void
  setFiles: (files: Record<string, string>) => void
  respondGate: (action: GateAction, answers?: string[]) => Promise<void>
  reset: () => void
}

const AGENT_ORDER: Agent['id'][] = ['architect', 'business_improver', 'designer', 'developer', 'integration', 'pm']

const initialAgents = (): AgentRunState[] =>
  AGENT_ORDER.map(type => ({
    type,
    status: 'idle',
    output: '',
    filesChanged: [],
  }))

const initialAgentStates = (): Record<string, PipelineNodeState> =>
  Object.fromEntries(AGENT_ORDER.map(id => [id, 'idle' as PipelineNodeState]))

const AGENT_LABELS: Record<string, string> = {
  architect: 'Architect',
  business_improver: 'Business Model',
  designer: 'Designer',
  developer: 'Developer',
  integration: 'Integration',
  pm: 'PM',
  debugger: 'Debugger',
}

export const useBuildStore = create<BuildState>((set, get) => ({
  buildId: null,
  status: 'idle',
  prompt: '',

  activeAgent: null,
  agentStates: initialAgentStates(),

  agentOutputs: {},
  pendingGate: null,
  gateSubmitting: false,

  messages: [],

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

  startBuild: (buildId, prompt) => {
    useDeploymentStore.getState().reset()
    set({
      buildId,
      prompt,
      status: 'running',
      activeAgent: null,
      agentStates: initialAgentStates(),
      agentOutputs: {},
      pendingGate: null,
      gateSubmitting: false,
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
    })
  },

  setBuildId: (buildId: string | null) => set({ buildId }),

  sendMessage: (msg) => set(state => ({ messages: [...state.messages, msg] })),

  setOpenFile: (path) => set({ openFile: path }),

  handleEvent: (event: AnyWSEvent) => {
    const { type, data } = event

    // Deployments are driven over the same build_id channel and reuse
    // build_start/agent_progress/build_complete/build_failed event types
    // (see backend/api/deployments.py) — a deployment_id in data means this
    // event belongs to deploymentStore, not the code build's own state.
    if (isRecord(data) && typeof (data as { deployment_id?: unknown }).deployment_id === 'string') {
      useDeploymentStore.getState().handleEvent(type, data as { deployment_id: string; status?: string; url?: string; error?: string })
      return
    }

    set(state => {
      switch (type) {
        case 'agent_start': {
          const agent = data.agent
          const label = AGENT_LABELS[agent] ?? agent
          return {
            status: 'running',
            activeAgent: agent as Agent['id'],
            agentStates: { ...state.agentStates, [agent]: 'active' },
            agents: state.agents.map(a =>
              a.type === agent ? { ...a, status: 'running' as AgentRunStatus } : a
            ),
            messages: [...state.messages, { from: 'system', text: `${label} started` }],
          }
        }

        case 'agent_update': {
          const agent = data.agent
          const label = agent ? AGENT_LABELS[agent] ?? agent : null
          return {
            messages: [
              ...state.messages,
              { from: 'system', text: label ? `${label}: ${data.message}` : data.message },
            ],
          }
        }

        case 'agent_progress': {
          // No UI mapping yet; ignore safely.
          return state
        }

        case 'agent_complete': {
          const agent = data.agent
          return {
            agentStates:
              agent === 'debugger'
                ? { ...state.agentStates, debugger: 'done', developer: 'done' }
                : { ...state.agentStates, [agent]: 'done' },
            activeAgent: state.activeAgent === agent ? null : state.activeAgent,
            agents: state.agents.map(a =>
              a.type === agent
                ? { ...a, status: 'complete' as AgentRunStatus, filesChanged: data.files_changed || [] }
                : a
            ),
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
          for (const path of deleted) delete files[path]
          const lastTouched = changedPaths[changedPaths.length - 1] ?? deleted[deleted.length - 1]
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
            activeAgent: null,
            pendingGate: null,
            gateSubmitting: false,
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

        case 'build_failed': {
          return {
            status: 'failed',
            error: data.error ?? 'Build failed',
            pendingGate: null,
            gateSubmitting: false,
            messages: [...state.messages, { from: 'system', text: `Build failed: ${data.error ?? 'Unknown error'}` }],
          }
        }

        case 'debug_start': {
          const iteration = data.iteration ?? state.debugIterations + 1
          const errors: string[] = Array.isArray(data.errors) ? data.errors : []
          return {
            status: 'debugging',
            debug: { iteration, errors },
            debugIterations: iteration,
            agentStates: { ...state.agentStates, developer: 'debugging' },
            messages: [
              ...state.messages,
              { from: 'system', text: `Retrying — iteration ${iteration}/3` },
            ],
          }
        }

        case 'agent_output': {
          return {
            agentOutputs: { ...state.agentOutputs, [data.agent]: data.output },
          }
        }

        case 'gate_request': {
          const label = AGENT_LABELS[data.agent] ?? data.agent
          const isQuestions = data.kind === 'questions'
          return {
            pendingGate: {
              gateId: data.gate_id,
              stage: data.stage,
              agent: data.agent,
              kind: isQuestions ? 'questions' : 'approval',
              questions: Array.isArray(data.questions) ? data.questions : [],
              timeoutSeconds: typeof data.timeout_seconds === 'number' ? data.timeout_seconds : null,
            },
            gateSubmitting: false,
            messages: [
              ...state.messages,
              {
                from: 'system',
                text: isQuestions
                  ? `${label} has questions before drawing the architecture`
                  : `${label} finished — waiting for your go-ahead`,
              },
            ],
          }
        }

        case 'gate_resolved': {
          // Only clear if it's the gate we're showing (a stale resolve for a
          // previous gate must not dismiss a newer one).
          if (state.pendingGate && state.pendingGate.gateId !== data.gate_id) return state
          return {
            pendingGate: null,
            gateSubmitting: false,
            messages: data.auto
              ? [...state.messages, { from: 'system', text: 'No response — continuing automatically' }]
              : state.messages,
          }
        }

        case 'credits_update': {
          return { creditsUsed: data.credits_used ?? state.creditsUsed }
        }

        case 'error': {
          return { error: data.error ?? state.error }
        }

        default:
          return state
      }
    })
  },

  setFiles: (files) => set({ files }),

  respondGate: async (action, answers) => {
    const { buildId, pendingGate, gateSubmitting } = get()
    if (!buildId || !pendingGate || gateSubmitting) return

    if (!LIVE_MODE) {
      // Demo mode: the mock emitter watches pendingGate and resumes its
      // timeline once cleared — see runMockBuild.
      set(state => ({
        pendingGate: null,
        messages:
          action === 'cancel'
            ? state.messages
            : [...state.messages, { from: 'system', text: action === 'answers' ? 'Answers sent' : 'Approved — continuing' }],
        ...(action === 'cancel' ? { status: 'failed' as const, error: 'Build cancelled' } : {}),
      }))
      return
    }

    set({ gateSubmitting: true })
    try {
      await buildsApi.respondGate(buildId, { gate_id: pendingGate.gateId, action, answers })
      // pendingGate clears when the worker emits gate_resolved; keep
      // gateSubmitting on so the buttons stay disabled until then.
    } catch (err: any) {
      set({ gateSubmitting: false })
      const detail = err?.response?.data?.detail
      toast.error(typeof detail === 'string' ? detail : 'Failed to send response')
    }
  },

  reset: () => {
    useDeploymentStore.getState().reset()
    set({
      buildId: null,
      status: 'idle',
      prompt: '',
      activeAgent: null,
      agentStates: initialAgentStates(),
      agentOutputs: {},
      pendingGate: null,
      gateSubmitting: false,
      messages: [],
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
    })
  },
}))
