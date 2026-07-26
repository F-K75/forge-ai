// Mirrors lib/pmWsContract.ts's typed-event-union + parse-function pattern
// for the project_id-scoped engineering-org channel -- see
// backend/agent_registry/ws_events.py's OrgEventType/OrgEvent and
// backend/services/org_ws_manager.py's OrgConnectionManager.
//
// Unlike PM_WS_EVENT_TYPES (which comes from a generated file produced by
// backend/scripts/export_ws_events.py), there is no generated export for
// this small, stable six-value enum, so the values are declared directly
// here.
export const ORG_WS_EVENT_TYPES = {
  message_posted: "message_posted",
  change_request_updated: "change_request_updated",
  finding_recorded: "finding_recorded",
  finding_resolved: "finding_resolved",
  plan_created: "plan_created",
  plan_decided: "plan_decided",
} as const

export type OrgWSEventType = (typeof ORG_WS_EVENT_TYPES)[keyof typeof ORG_WS_EVENT_TYPES]

export type OrgWSEventBase<TType extends OrgWSEventType, TData> = {
  type: TType
  project_id: string
  data: TData
  timestamp?: string
}

// Data shapes taken directly from each emission site:
// backend/agent_registry/team_chat.py's post(), pr_workflow.py's
// advance()/request_review()/submit_review()/merge(), monitoring.py's
// record_finding()/resolve(), and planning.py's create_plan()/approve()/
// reject().
export type MessagePostedEvent = OrgWSEventBase<
  "message_posted",
  { message_id: string; from_agent_id: string; message_type: string; content: string }
>
export type ChangeRequestUpdatedEvent = OrgWSEventBase<
  "change_request_updated",
  { change_request_id: string; stage: string }
>
export type FindingRecordedEvent = OrgWSEventBase<
  "finding_recorded",
  { finding_id: string; category: string; severity: string }
>
export type FindingResolvedEvent = OrgWSEventBase<
  "finding_resolved",
  { finding_id: string; category: string; severity: string }
>
export type PlanCreatedEvent = OrgWSEventBase<"plan_created", { plan_id: string; status: string }>
export type PlanDecidedEvent = OrgWSEventBase<"plan_decided", { plan_id: string; status: string }>

export type AnyOrgWSEvent =
  | MessagePostedEvent
  | ChangeRequestUpdatedEvent
  | FindingRecordedEvent
  | FindingResolvedEvent
  | PlanCreatedEvent
  | PlanDecidedEvent

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === "string"
}

function isValidOrgEventType(t: unknown): t is OrgWSEventType {
  return typeof t === "string" && Object.values(ORG_WS_EVENT_TYPES).includes(t as any)
}

/** Defensive parsing: never throws. Returns null for malformed events (and
 * for the server's periodic {"type":"ping"} keep-alive, which isn't a valid
 * OrgEventType). */
export function parseOrgWSEvent(raw: unknown): AnyOrgWSEvent | null {
  if (!isRecord(raw)) return null
  const type = raw.type
  if (!isString(type) || !isValidOrgEventType(type)) return null

  const project_id = raw.project_id
  if (!isString(project_id)) return null

  const data = raw.data
  if (data === undefined || !isRecord(data)) return null

  return raw as AnyOrgWSEvent
}
