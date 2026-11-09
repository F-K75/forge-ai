import { create } from 'zustand'
import type { AnyPMWSEvent } from '../lib/pmWsContract'
import { initiativesApi, epicsApi, storiesApi, tasksApi, sprintsApi, agentExecutionsApi } from '../lib/pmApi'
import { captureEvent } from '../lib/analytics'
import type { PMInitiative, PMPRD, PMEpic, PMStory, PMTask, PMSprint, PMExecution } from '../lib/types/api'
import {
  findInitiativeById,
  updateLocalTaskStatus,
  updateLocalTask,
  addLocalTask,
  deleteLocalTask,
  addLocalExecution,
  updateLocalSprint,
  addLocalSprint,
  updateLocalEpic,
  addLocalEpic,
  deleteLocalEpic,
  updateLocalStory,
  addLocalStory,
  deleteLocalStory,
  updateLocalInitiative,
} from '../lib/pmData'

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
  setTaskLocal: (taskId: string, patch: Partial<PMTask>) => void
  addTaskLocal: (task: PMTask) => void
  deleteTaskLocal: (taskId: string) => void
  setEpicLocal: (epicId: string, patch: Partial<PMEpic>) => void
  addEpicLocal: (epic: PMEpic) => void
  deleteEpicLocal: (epicId: string) => void
  setStoryLocal: (storyId: string, patch: Partial<PMStory>) => void
  addStoryLocal: (story: PMStory) => void
  deleteStoryLocal: (storyId: string) => void
  setInitiativeLocal: (patch: Partial<PMInitiative>) => void
  addExecutionLocal: (execution: PMExecution) => void
  setSprintLocal: (sprintId: string, patch: Partial<PMSprint>) => void
  addSprintLocal: (sprint: PMSprint) => void
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
        epicsApi.list(initiativeId).catch(() => []) as unknown as PMEpic[],
        storiesApi.list({ initiative_id: initiativeId }).catch(() => []) as unknown as PMStory[],
        tasksApi.list({ initiative_id: initiativeId }).catch(() => []) as unknown as PMTask[],
        sprintsApi.list(initiativeId).catch(() => []) as unknown as PMSprint[],
        agentExecutionsApi.list(initiativeId).catch(() => []) as unknown as PMExecution[],
        initiativesApi.getPrd(initiativeId).catch(() => null) as unknown as PMPRD | null,
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
      const fallback = findInitiativeById(initiativeId)
      if (fallback) {
        const rawDecisions = (fallback as any).decision_feed || (fallback as any).decisions || (fallback.initiative as any)?.decision_feed || []
        const mappedDecisions: DecisionFeedItem[] = rawDecisions.map((d: any) => ({
          summary: d.summary || d.text || String(d),
          recommendedNextTasks: d.recommended_next_tasks || d.recommendedNextTasks || [],
          bottlenecks: d.bottlenecks || [],
        }))

        set({
          initiative: fallback.initiative,
          prd: fallback.prd,
          epics: fallback.epics,
          stories: fallback.stories,
          tasks: fallback.tasks,
          sprints: fallback.sprints,
          executions: fallback.executions,
          decisionFeed: mappedDecisions.length > 0 ? mappedDecisions : get().decisionFeed,
          generationStatus:
            fallback.initiative.status === 'generating' ? 'generating' :
            fallback.initiative.status === 'failed' ? 'failed' :
            fallback.initiative.status === 'review' ? 'review' : 'complete',
          generationError: fallback.initiative.generation_error ?? null,
          loading: false,
          error: null,
        })
      } else {
        set({ loading: false, error: 'Failed to load initiative' })
      }
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

  setTaskLocal: (taskId, patch) => {
    const { initiative } = get()
    if (initiative) {
      updateLocalTask(initiative.id, taskId, patch)
      if (patch.status) {
        updateLocalTaskStatus(initiative.id, taskId, patch.status)
      }
    }
    set(state => ({
      tasks: state.tasks.map(t => (t.id === taskId ? { ...t, ...patch } : t)),
    }))
  },

  addTaskLocal: (task) => {
    const { initiative } = get()
    if (initiative) {
      addLocalTask(initiative.id, task)
    }
    set(state => ({
      tasks: [task, ...state.tasks.filter(t => t.id !== task.id)],
    }))
  },

  deleteTaskLocal: (taskId) => {
    const { initiative } = get()
    if (initiative) {
      deleteLocalTask(initiative.id, taskId)
    }
    set(state => ({
      tasks: state.tasks
        .filter(t => t.id !== taskId)
        .map(t => ({
          ...t,
          dependencies: Array.isArray(t.dependencies) ? t.dependencies.filter(d => d !== taskId) : [],
        })),
      sprints: state.sprints.map(s => ({
        ...s,
        task_ids: Array.isArray(s.task_ids) ? s.task_ids.filter(id => id !== taskId) : [],
      })),
    }))
  },

  setEpicLocal: (epicId, patch) => {
    const { initiative } = get()
    if (initiative) {
      updateLocalEpic(initiative.id, epicId, patch)
    }
    set(state => ({
      epics: state.epics.map(e => (e.id === epicId ? { ...e, ...patch } : e)),
    }))
  },

  addEpicLocal: (epic) => {
    const { initiative } = get()
    if (initiative) {
      addLocalEpic(initiative.id, epic)
    }
    set(state => ({
      epics: [...state.epics, epic],
    }))
  },

  deleteEpicLocal: (epicId) => {
    const { initiative } = get()
    if (initiative) {
      deleteLocalEpic(initiative.id, epicId)
    }
    set(state => ({
      epics: state.epics.filter(e => e.id !== epicId),
    }))
  },

  setStoryLocal: (storyId, patch) => {
    const { initiative } = get()
    if (initiative) {
      updateLocalStory(initiative.id, storyId, patch)
    }
    set(state => ({
      stories: state.stories.map(s => (s.id === storyId ? { ...s, ...patch } : s)),
    }))
  },

  addStoryLocal: (story) => {
    const { initiative } = get()
    if (initiative) {
      addLocalStory(initiative.id, story)
    }
    set(state => ({
      stories: [...state.stories, story],
    }))
  },

  deleteStoryLocal: (storyId) => {
    const { initiative } = get()
    if (initiative) {
      deleteLocalStory(initiative.id, storyId)
    }
    set(state => ({
      stories: state.stories.filter(s => s.id !== storyId),
    }))
  },

  setInitiativeLocal: (patch) => {
    const { initiative } = get()
    if (initiative) {
      updateLocalInitiative(initiative.id, patch)
      set(state => ({
        initiative: state.initiative ? { ...state.initiative, ...patch } : null,
      }))
    }
  },

  addExecutionLocal: (execution) => {
    const { initiative } = get()
    if (initiative) {
      addLocalExecution(initiative.id, execution)
    }
    set(state => ({
      executions: [execution, ...state.executions.filter(e => e.id !== execution.id)],
    }))
  },

  setSprintLocal: (sprintId, patch) => {
    const { initiative } = get()
    if (initiative) {
      updateLocalSprint(initiative.id, sprintId, patch)
    }
    set(state => ({
      sprints: state.sprints.map(s => (s.id === sprintId ? { ...s, ...patch } : s)),
    }))
  },

  addSprintLocal: (sprint) => {
    const { initiative } = get()
    if (initiative) {
      addLocalSprint(initiative.id, sprint)
    }
    set(state => ({
      sprints: [...state.sprints.filter(s => s.id !== sprint.id), sprint],
    }))
  },

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
