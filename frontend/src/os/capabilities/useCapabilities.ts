import { useQuery } from "@tanstack/react-query"
import { api } from "../../lib/api"
import { LIVE_MODE } from "../../lib/env"
import { useAuthStore } from "../../store/authStore"
import type { CapabilityCatalog, CapabilityDescriptor, CapabilityId } from "../contracts"
import { validateContract } from "../validate"
import { STATIC_CAPABILITY_CATALOG, filterCatalogForUser } from "./catalog"

export const CAPABILITIES_QUERY_KEY = ["os", "capabilities"] as const

/** GET /v1/os/capabilities (WS-C), validated against the CapabilityCatalog contract. */
export async function fetchCapabilityCatalog(): Promise<CapabilityCatalog> {
  const res = await api.get("/v1/os/capabilities")
  const result = validateContract("CapabilityCatalog", res.data)
  if (!result.valid) {
    throw new Error("Capability catalog failed validation")
  }
  return res.data as CapabilityCatalog
}

export interface UseCapabilitiesResult {
  catalog: CapabilityCatalog
  capabilities: CapabilityDescriptor[]
  get: (id: CapabilityId) => CapabilityDescriptor | undefined
  /** "server" once GET /v1/os/capabilities answered; "static" while loading, offline or in demo mode. */
  source: "server" | "static"
  isLoading: boolean
  error: unknown
}

/**
 * The capability registry for the shell, palette and library.
 *
 * React Query over GET /v1/os/capabilities (server-filtered to what the
 * caller may use). Until it answers, if it fails, or in demo mode (no
 * backend) the static catalog from the synced capabilities.json is used,
 * filtered client-side for admin-only entries.
 */
export function useCapabilities(): UseCapabilitiesResult {
  const isAdmin = useAuthStore((s) => s.user?.is_admin === true)
  const query = useQuery({
    queryKey: CAPABILITIES_QUERY_KEY,
    queryFn: fetchCapabilityCatalog,
    enabled: LIVE_MODE,
    staleTime: 5 * 60_000,
    retry: 1,
  })
  const catalog = query.data ?? filterCatalogForUser(STATIC_CAPABILITY_CATALOG, { isAdmin })
  const byId = new Map(catalog.capabilities.map((c) => [c.id, c]))
  return {
    catalog,
    capabilities: catalog.capabilities,
    get: (id) => byId.get(id),
    source: query.data ? "server" : "static",
    isLoading: LIVE_MODE && query.isLoading,
    error: query.error,
  }
}
