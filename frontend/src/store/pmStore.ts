import { create } from 'zustand'
import type { AnyPMWSEvent } from '../lib/pmWsContract'
import { initiativesApi, epicsApi, storiesApi, tasksApi, sprintsApi, agentExecutionsApi } from '../lib/pmApi'

export interface DecisionFeedItem {
  taskId?: string
  summary: string
  recommendedNextTasks: string[]
  bottlenecks: string[]
  at: number
}

export interface PMState {
  initiative: Record<string, any> | null
  prd: Record<string, any> | null
  epics: Record<string, any>[]
  stories: Record<string, any>[]
  tasks: Record<string, any>[]
  sprints: Record<string, any>[]
  executions: Record<string, any>[]
  generationStatus: 'idle' | 'generating' | 'complete' | 'failed'
  generationStage: string | null
  generationError: string | null
  decisionFeed: DecisionFeedItem[]

  loading: boolean
  error: string | null

  hydrate: (initiativeId: string) => Promise<void>
  refreshTasks: () => Promise<void>
  refreshExecutions: () => Promise<void>
  handleEvent: (event: AnyPMWSEvent) => void
  setTaskLocal: (taskId: string, patch: Record<string, unknown>) => void
  reset: () => void
}

const initialState = {
  initiative: null,
  prd: null,
  epics: [],
  stories: [],
  tasks: [],
  sprints: [],
  executions: [],
  generationStatus: 'idle' as const,
  generationStage: null,
  generationError: null,
  decisionFeed: [],
  loading: false,
  error: null,
}

export const usePMStore = create<PMState>((set, get) => ({
  ...initialState,

  hydrate: async (initiativeId: string) => {
    set({ loading: true, error: null })
    try {
      const initiative = await initiativesApi.get(initiativeId)
      const [epics, stories, tasks, sprints, executions, prd] = await Promise.all([
        epicsApi.list(initiativeId).catch(() => []),
        storiesApi.list({ initiative_id: initiativeId }).catch(() => []),
        tasksApi.list({ initiative_id: initiativeId }).catch(() => []),
        sprintsApi.list(initiativeId).catch(() => []),
        agentExecutionsApi.list(initiativeId).catch(() => []),
        initiativesApi.getPrd(initiativeId).catch(() => null),
      ])
      set({
        initiative, prd, epics, stories, tasks, sprints, executions,
        generationStatus:
          initiative.status === 'generating' ? 'generating' :
          initiative.status === 'failed' ? 'failed' : 'complete',
        generationError: initiative.generation_error ?? null,
        loading: false,
      })
    } catch {
      set({ loading: false, error: 'Failed to load initiative' })
    }
  },

  refreshTasks: async () => {
    const { initiative } = get()
    if (!initiative) return
    try {
      const tasks = await tasksApi.list({ initiative_id: initiative.id })
      set({ tasks })
    } catch {
      // keep stale data on transient failure
    }
  },

  refreshExecutions: async () => {
    const { initiative } = get()
    if (!initiative) return
    try {
      const executions = await agentExecutionsApi.list(initiative.id)
      set({ executions })
    } catch {
      // keep stale data on transient failure
    }
  },

  setTaskLocal: (taskId, patch) =>
    set(state => ({
      tasks: state.tasks.map(t => (t.id === taskId ? { ...t, ...patch } : t)),
    })),

  handleEvent: (event: AnyPMWSEvent) => {
    const { type, data } = event

    switch (type) {
      case 'generation_start':
        set({ generationStatus: 'generating', generationStage: (data as any).stage ?? null })
        return
      case 'generation_stage':
        set({ generationStage: (data as any).stage ?? null })
        return
      case 'epics_ready':
      case 'stories_ready':
      case 'tasks_ready':
      case 'sprint_plan_ready':
        // Counts only -- the full records land via a re-hydrate once
        // generation_complete fires, avoiding partial/inconsistent lists
        // mid-generation.
        return
      case 'generation_complete': {
        const { initiative } = get()
        set({ generationStatus: 'complete', generationStage: null })
        if (initiative) get().hydrate(initiative.id)
        return
      }
      case 'generation_failed':
        set({ generationStatus: 'failed', generationError: (data as any).error ?? 'Generation failed' })
        return
      case 'task_status_changed': {
        const { task_id, status } = data as { task_id: string; status: string }
        get().setTaskLocal(task_id, { status })
        return
      }
      case 'agent_exec_start':
      case 'agent_exec_complete':
      case 'agent_exec_failed':
        get().refreshExecutions()
        return
      case 'decision_made': {
        const d = data as { task_id?: string; summary?: string; recommended_next_tasks?: string[]; bottlenecks?: string[] }
        if (!d.summary) return
        set(state => ({
          decisionFeed: [
            { taskId: d.task_id, summary: d.summary!, recommendedNextTasks: d.recommended_next_tasks ?? [], bottlenecks: d.bottlenecks ?? [], at: Date.now() },
            ...state.decisionFeed,
          ].slice(0, 20),
        }))
        return
      }
      default:
        return
    }
  },

  reset: () => set({ ...initialState }),
}))
