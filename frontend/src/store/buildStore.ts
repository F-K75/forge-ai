import { create } from 'zustand'
import type { AnyWSEvent } from '../lib/wsContract'
import type { Agent } from '../lib/agents'

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
  error: string | null

  // Actions
  startBuild: (buildId: string, prompt: string) => void
  handleEvent: (event: AnyWSEvent) => void
  sendMessage: (msg: BuildMessage) => void
  setOpenFile: (path: string | null) => void
  setBuildId: (buildId: string | null) => void
  setFiles: (files: Record<string, string>) => void
  reset: () => void
}

const AGENT_ORDER: Agent['id'][] = ['architect', 'designer', 'developer', 'integration', 'pm']

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
  designer: 'Designer',
  developer: 'Developer',
  integration: 'Integration',
  pm: 'PM',
}

export const useBuildStore = create<BuildState>((set, get) => ({
  buildId: null,
  status: 'idle',
  prompt: '',

  activeAgent: null,
  agentStates: initialAgentStates(),

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
  error: null,

  startBuild: (buildId, prompt) => set({
    buildId,
    prompt,
    status: 'running',
    activeAgent: null,
    agentStates: initialAgentStates(),
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
    error: null,
  }),

  setBuildId: (buildId: string | null) => set({ buildId }),

  sendMessage: (msg) => set(state => ({ messages: [...state.messages, msg] })),

  setOpenFile: (path) => set({ openFile: path }),

  handleEvent: (event: AnyWSEvent) => {
    const { type, data } = event

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

        case 'agent_progress': {
          // No UI mapping yet; ignore safely.
          return state
        }

        case 'agent_complete': {
          const agent = data.agent
          return {
            agentStates: { ...state.agentStates, [agent]: 'done' },
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
          const paths = Object.keys(data.files)
          return {
            files: { ...state.files, ...data.files },
            openFile: paths.length > 0 ? paths[paths.length - 1] : state.openFile,
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
            files,
            openFile: state.openFile ?? (paths.length > 0 ? paths[0] : null),
            validation: data.validation ?? null,
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

        case 'credits_update': {
          return { creditsUsed: data.credits_used ?? state.creditsUsed }
        }

        default:
          return state
      }
    })
  },

  setFiles: (files) => set({ files }),

  reset: () => set({
    buildId: null,
    status: 'idle',
    prompt: '',
    activeAgent: null,
    agentStates: initialAgentStates(),
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
    error: null,
  }),
}))
