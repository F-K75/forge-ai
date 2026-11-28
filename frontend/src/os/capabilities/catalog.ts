/**
 * Static capability catalog (WS-D): the synced copy of
 * shared/os-schemas/capabilities.json, used as the offline / demo-mode
 * fallback for GET /v1/os/capabilities and by tests. The server filters the
 * live catalog by permission, admin flag and plan; `filterCatalogForUser`
 * mirrors the coarse part of that (admin-only, hidden) for the fallback so
 * the palette never offers admin tools to non-admins. The server remains
 * authoritative: every action is re-authorised on invoke.
 */
import rawCatalog from "../schemas/capabilities.json"
import type {
  CapabilityAction,
  CapabilityCatalog,
  CapabilityDescriptor,
  CapabilityId,
} from "../contracts"

export const STATIC_CAPABILITY_CATALOG = rawCatalog as unknown as CapabilityCatalog

const BY_ID = new Map<CapabilityId, CapabilityDescriptor>(
  STATIC_CAPABILITY_CATALOG.capabilities.map((c) => [c.id, c])
)

export function getStaticCapability(id: CapabilityId): CapabilityDescriptor | undefined {
  return BY_ID.get(id)
}

export function getCapabilityAction(
  capability: CapabilityDescriptor,
  actionId: string
): CapabilityAction | undefined {
  return capability.actions.find((a) => a.id === actionId)
}

export interface CatalogViewer {
  isAdmin?: boolean
}

export function filterCatalogForUser(
  catalog: CapabilityCatalog,
  viewer: CatalogViewer | null | undefined
): CapabilityCatalog {
  return {
    version: catalog.version,
    capabilities: catalog.capabilities.filter(
      (c) => c.status !== "hidden" && (!c.admin_only || viewer?.isAdmin === true)
    ),
  }
}

/** A2UI event name a generated surface uses for `(capability, action)`; mirrors backend `action_event_name`. */
export function actionEventName(capabilityId: CapabilityId, actionId: string): string {
  return `${capabilityId}.${actionId}`
}

/** Fill `:param` segments of a legacy route; returns null if a param is missing. */
export function fillRoute(route: string, params: Record<string, unknown>): string | null {
  let missing = false
  const out = route.replace(/:([A-Za-z]+)/g, (_m, name: string) => {
    const value = params[name] ?? params[toSnake(name)]
    if (typeof value !== "string" || !value) {
      missing = true
      return ""
    }
    return encodeURIComponent(value)
  })
  return missing ? null : out
}

function toSnake(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}
