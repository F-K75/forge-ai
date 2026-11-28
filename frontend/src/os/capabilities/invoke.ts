import { api } from "../../lib/api"
import type { CapabilityId, CapabilityInvocation, JsonObject, SurfacePresentationKind } from "../contracts"

function newActionId(): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  return `act_${rand.replace(/-/g, "").slice(0, 24)}`
}

/**
 * POST /v1/os/capabilities/{id}/invoke (WS-C) for renderer-initiated actions
 * that have no dedicated feature endpoint (e.g. saving a workflow template).
 * The server re-authorises the action exactly as for generated surfaces.
 */
export async function invokeCapability(
  capabilityId: CapabilityId,
  action: string,
  input: JsonObject,
  opts: { sessionId?: string | null; projectId?: string | null; presentation?: SurfacePresentationKind | null } = {}
): Promise<unknown> {
  const body: CapabilityInvocation = {
    action_id: newActionId(),
    capability_id: capabilityId,
    action,
    input,
    session_id: opts.sessionId ?? null,
    project_id: opts.projectId ?? null,
    presentation: opts.presentation ?? null,
  }
  const res = await api.post(`/v1/os/capabilities/${encodeURIComponent(capabilityId)}/invoke`, body)
  return res.data
}
