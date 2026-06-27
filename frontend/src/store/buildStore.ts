import { create } from 'zustand'

export type AgentStatus = 'idle' | 'running' | 'complete' | 'failed'

export interface AgentState {
  type: string
  status: AgentStatus
  output: string
  filesChanged: string[]
}

export interface BuildState {
  buildId: string | null
  status: 'idle' | 'pending' | 'running' | 'success' | 'failed' | 'debugging'
  prompt: string
  agents: AgentState[]
  files: Record<string, string>
  streamBuffer: string
  creditsUsed: number
  debugIterations: number
  validation: any | null
  error: string | null

  // Actions
  startBuild: (buildId: string, prompt: string) => void
  handleEvent: (event: any) => void
  setFiles: (files: Record<string, string>) => void
  reset: () => void
}

const AGENT_ORDER = ['architect', 'designer', 'developer', 'integration', 'pm']

const initialAgents = (): AgentState[] =>
  AGENT_ORDER.map(type => ({
    type,
    status: 'idle',
    output: '',
    filesChanged: [],
  }))

export const useBuildStore = create<BuildState>((set, get) => ({
  buildId: null,
  status: 'idle',
  prompt: '',
  agents: initialAgents(),
  files: {},
  streamBuffer: '',
  creditsUsed: 0,
  debugIterations: 0,
  validation: null,
  error: null,

  startBuild: (buildId, prompt) => set({
    buildId,
    prompt,
    status: 'pending',
    agents: initialAgents(),
    files: {},
    streamBuffer: '',
    creditsUsed: 0,
    debugIterations: 0,
    validation: null,
    error: null,
  }),

  handleEvent: (event) => {
    const { type, data } = event

    set(state => {
      switch (type) {
        case 'agent_start': {
          const agents = state.agents.map(a =>
            a.type === data.agent ? { ...a, status: 'running' as AgentStatus } : a
          )
          return { agents, status: 'running' }
        }

        case 'agent_complete': {
          const agents = state.agents.map(a =>
            a.type === data.agent
              ? { ...a, status: 'complete' as AgentStatus, filesChanged: data.files_changed || [] }
              : a
          )
          return { agents }
        }

        case 'stream_token': {
          return { streamBuffer: state.streamBuffer + data.token }
        }

        case 'file_update': {
          return {
            files: { ...state.files, ...data.files },
            streamBuffer: '',
          }
        }

        case 'build_complete': {
          return {
            status: 'success',
            files: data.files || state.files,
            validation: data.validation,
            creditsUsed: data.credits_used || state.creditsUsed,
            streamBuffer: '',
          }
        }

        case 'build_failed': {
          return { status: 'failed', error: data.error }
        }

        case 'debug_start': {
          return {
            status: 'debugging',
            debugIterations: data.iteration || state.debugIterations + 1,
          }
        }

        default:
          return {}
      }
    })
  },

  setFiles: (files) => set({ files }),

  reset: () => set({
    buildId: null,
    status: 'idle',
    prompt: '',
    agents: initialAgents(),
    files: {},
    streamBuffer: '',
    creditsUsed: 0,
    debugIterations: 0,
    validation: null,
    error: null,
  }),
}))
