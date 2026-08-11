import { create } from 'zustand'
import type { AnyPMWSEvent } from '../lib/pmWsContract'
import { initiativesApi, epicsApi, storiesApi, tasksApi, sprintsApi, agentExecutionsApi } from '../lib/pmApi'
import { captureEvent } from '../lib/analytics'
import type { PMInitiative, PMPRD, PMEpic, PMStory, PMTask, PMSprint, PMExecution } from '../lib/types/api'

export interface DecisionFeedItem {
  taskId?: string
  summary: string
  recommendedNextTasks: string[]
  bottlenecks: string[]
  at: number
}

export interface PMState {
  initiative: PMInitiative | null
  prd: PMPRD | null
  epics: PMEpic[]
  stories: PMStory[]
  tasks: PMTask[]
  sprints: PMSprint[]
  executions: PMExecution[]
  generationStatus: 'idle' | 'generating' | 'complete' | 'failed' | 'review'
  generationStage: string | null
  generationError: string | null
  decisionFeed: DecisionFeedItem[]

  loading: boolean
  error: string | null

  hydrate: (initiativeId: string) => Promise<void>
  refreshTasks: () => Promise<void>
  refreshExecutions: () => Promise<void>
  handleEvent: (event: AnyPMWSEvent) => void
  setTaskLocal: (taskId: string, patch: Partial<Pick<PMTask, 'status'>>) => void
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
      const initiative = await initiativesApi.get(initiativeId) as PMInitiative
      const [epics, stories, tasks, sprints, executions, prd] = await Promise.all([
        epicsApi.list(initiativeId).catch(() => []) as PMEpic[],
        storiesApi.list({ initiative_id: initiativeId }).catch(() => []) as PMStory[],
        tasksApi.list({ initiative_id: initiativeId }).catch(() => []) as PMTask[],
        sprintsApi.list(initiativeId).catch(() => []) as PMSprint[],
        agentExecutionsApi.list(initiativeId).catch(() => []) as PMExecution[],
        initiativesApi.getPrd(initiativeId).catch(() => null) as PMPRD | null,
      ])
      set({
        initiative, prd, epics, stories, tasks, sprints, executions,
        generationStatus:
          initiative.status === 'generating' ? 'generating' :
          initiative.status === 'failed' ? 'failed' :
          initiative.status === 'review' ? 'review' : 'complete',
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
      const tasks = await tasksApi.list({ initiative_id: initiative.id }) as PMTask[]
      set({ tasks })
    } catch {
      // keep stale data on transient failure
    }
  },

  refreshExecutions: async () => {
    const { initiative } = get()
    if (!initiative) return
    try {
      const executions = await agentExecutionsApi.list(initiative.id) as PMExecution[]
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
        captureEvent('initiative_generation_complete', { initiative_id: initiative?.id })
        if (initiative) get().hydrate(initiative.id)
        return
      }
      case 'generation_failed':
        set({ generationStatus: 'failed', generationError: (data as any).error ?? 'Generation failed' })
        captureEvent('initiative_generation_failed', { error: (data as any).error ?? 'Generation failed' })
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
