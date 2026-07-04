// Mirrors lib/wsContract.ts (which is build_id-scoped) for the initiative_id-
// scoped Agile PM channel -- see backend/services/pm_ws_manager.py.
import { PM_WS_EVENT_TYPES } from './generated/pmWsEvents'

export { PM_WS_EVENT_TYPES }

export type PMWSEventType = (typeof PM_WS_EVENT_TYPES)[keyof typeof PM_WS_EVENT_TYPES]

export type PMWSEventBase<TType extends PMWSEventType, TData> = {
  type: TType
  initiative_id: string
  data: TData
  timestamp?: string
}

export type GenerationStartEvent = PMWSEventBase<'generation_start', { stage?: string }>
export type GenerationStageEvent = PMWSEventBase<'generation_stage', { stage?: string; vision?: string }>
export type EpicsReadyEvent = PMWSEventBase<'epics_ready', { count: number }>
export type StoriesReadyEvent = PMWSEventBase<'stories_ready', { count: number }>
export type TasksReadyEvent = PMWSEventBase<'tasks_ready', { count: number }>
export type SprintPlanReadyEvent = PMWSEventBase<'sprint_plan_ready', { count: number }>
export type GenerationCompleteEvent = PMWSEventBase<
  'generation_complete',
  { epics: number; stories: number; tasks: number; sprints: number }
>
export type GenerationFailedEvent = PMWSEventBase<'generation_failed', { error?: string }>
export type TaskStatusChangedEvent = PMWSEventBase<'task_status_changed', { task_id: string; status: string }>
export type AgentExecStartEvent = PMWSEventBase<'agent_exec_start', { task_id: string; execution_id: string; agent: string }>
export type AgentExecProgressEvent = PMWSEventBase<'agent_exec_progress', { task_id: string; execution_id: string; progress?: number }>
export type AgentExecLogEvent = PMWSEventBase<'agent_exec_log', { task_id: string; execution_id: string; log: string }>
export type AgentExecCompleteEvent = PMWSEventBase<'agent_exec_complete', { task_id: string; execution_id: string; files?: string[] }>
export type AgentExecFailedEvent = PMWSEventBase<'agent_exec_failed', { task_id: string; execution_id: string; error?: string }>
export type SprintUpdatedEvent = PMWSEventBase<'sprint_updated', Record<string, unknown>>
export type DecisionMadeEvent = PMWSEventBase<
  'decision_made',
  { task_id?: string; summary?: string; recommended_next_tasks?: string[]; bottlenecks?: string[] }
>
export type PMErrorEvent = PMWSEventBase<'error', { error?: string }>

export type AnyPMWSEvent =
  | GenerationStartEvent
  | GenerationStageEvent
  | EpicsReadyEvent
  | StoriesReadyEvent
  | TasksReadyEvent
  | SprintPlanReadyEvent
  | GenerationCompleteEvent
  | GenerationFailedEvent
  | TaskStatusChangedEvent
  | AgentExecStartEvent
  | AgentExecProgressEvent
  | AgentExecLogEvent
  | AgentExecCompleteEvent
  | AgentExecFailedEvent
  | SprintUpdatedEvent
  | DecisionMadeEvent
  | PMErrorEvent

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isValidPMEventType(t: unknown): t is PMWSEventType {
  return typeof t === 'string' && Object.values(PM_WS_EVENT_TYPES).includes(t as any)
}

/** Defensive parsing: never throws. Returns null for malformed events. */
export function parsePMWSEvent(raw: unknown): AnyPMWSEvent | null {
  if (!isRecord(raw)) return null
  const type = raw.type
  if (!isString(type) || !isValidPMEventType(type)) return null

  const initiative_id = raw.initiative_id
  if (!isString(initiative_id)) return null

  const data = raw.data
  if (data === undefined || !isRecord(data)) return null

  return raw as AnyPMWSEvent
}
