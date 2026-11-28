/**
 * TEMPORARY stand-in for WS-D's `useCapabilities()` (src/os/capabilities/**).
 * Grows the synced capability index into minimal `CapabilityDescriptor`s:
 * capabilities with a parameter-free legacy route render that route in a
 * window; everything else has an `a2ui` renderer and is opened by prompt.
 * Delete once ./index.ts points at WS-D.
 */
import capabilityIndex from "../../schemas/capability-index.json"
import {
  FORGE_CATALOG_ID,
  type CapabilityDescriptor,
  type CapabilityIndex,
  type CapabilityIndexEntry,
  type CapabilityRenderer,
} from "../../contracts"

const INDEX = capabilityIndex as unknown as CapabilityIndex

/** Plain-language summaries for the library (WS-D owns the real copy). */
const SUMMARIES: Record<string, string> = {
  "build.new": "Describe an app or site and Forge plans and builds it.",
  "projects.manage": "Every project, import a repo, rename or delete.",
  "fleet.overview": "The former Command Center: runs, gates and costs.",
  "data.analyze": "Drop in a CSV and ask for charts and tables.",
  "models.compare": "Compare models by quality, speed and price.",
  "governance.approvals": "Gates waiting on a human decision.",
  "plan.initiatives": "Vision to epics, sprints, board and releases.",
  "agents.org": "The engineering org and its agents.",
  "skills.catalog": "Skills your agents can use.",
  "protocols.hub": "MCP servers, A2A peers and the audit trail.",
  "reviews.board": "Automated code review runs.",
  "marketplace.browse": "Templates, playbooks and plugins.",
  "account.billing": "Plan, credits and invoices.",
  "account.settings": "Profile, security, models, integrations.",
  "studio.spatial": "The fleet as a 3D scene.",
}

function rendererFor(entry: CapabilityIndexEntry): CapabilityRenderer {
  const route = entry.legacy_routes.find((r) => !r.includes(":"))
  if (route) return { kind: "legacy_route", route }
  if (entry.id.startsWith("system.")) return { kind: "component", component_key: `shell.${entry.id}` }
  return { kind: "a2ui", catalog_id: FORGE_CATALOG_ID }
}

export function descriptorFromIndex(entry: CapabilityIndexEntry): CapabilityDescriptor {
  const surfaces = Array.from(new Set([entry.default_surface, "window" as const]))
  return {
    id: entry.id,
    version: 1,
    title: entry.title,
    summary: SUMMARIES[entry.id] ?? "",
    category: entry.category,
    intents: entry.intents,
    keywords: [entry.id.replace(/[._]/g, " "), entry.category],
    permissions: entry.admin_only ? ["authenticated", "admin"] : ["authenticated"],
    requires_project: entry.requires_project,
    admin_only: entry.admin_only,
    min_plan: null,
    entry_points: ["prompt", "palette", "library", ...(entry.legacy_routes.length ? (["deeplink"] as const) : [])],
    surfaces,
    default_surface: entry.default_surface,
    renderer: rendererFor(entry),
    actions: [],
    input_schema: {},
    output_schema: {},
    api_bindings: [],
    persistence: "server",
    legacy_routes: entry.legacy_routes,
    status: "available",
  }
}

const STATIC: CapabilityDescriptor[] = INDEX.capabilities.map(descriptorFromIndex)

export interface UseCapabilitiesResult {
  capabilities: CapabilityDescriptor[]
  isLoading: boolean
}

/** Same shape WS-D's hook returns; admin-only rows are filtered for non-admins. */
export function useShimCapabilities(opts: { isAdmin?: boolean } = {}): UseCapabilitiesResult {
  return {
    capabilities: opts.isAdmin ? STATIC : STATIC.filter((c) => !c.admin_only),
    isLoading: false,
  }
}

export function getShimCapability(id: string): CapabilityDescriptor | undefined {
  return STATIC.find((c) => c.id === id)
}
