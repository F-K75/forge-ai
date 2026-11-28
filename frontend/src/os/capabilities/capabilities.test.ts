import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import capabilityIndex from "../schemas/capability-index.json"
import catalogJson from "../schemas/forge-ember.catalog.json"
import type { CapabilityIndex } from "../contracts"
import { validateContract } from "../validate"
import {
  STATIC_CAPABILITY_CATALOG,
  actionEventName,
  fillRoute,
  filterCatalogForUser,
  getStaticCapability,
} from "./catalog"
import { CAPABILITY_RENDERERS, SHELL_COMPONENT_KEYS, resolveCapabilityRenderer } from "./renderers"
import { WS_D_COMPOSITES } from "./composites/registry"

const SHARED = resolve(process.cwd(), "..", "shared/os-schemas/capabilities.json")
const caps = STATIC_CAPABILITY_CATALOG.capabilities

describe("capabilities.json", () => {
  it("src/os/schemas copy matches shared/os-schemas (WS-D content file)", () => {
    const copy = readFileSync(resolve(process.cwd(), "src/os/schemas/capabilities.json"), "utf8")
    expect(copy).toBe(readFileSync(SHARED, "utf8"))
  })

  it("is a valid CapabilityCatalog", () => {
    expect(validateContract("CapabilityCatalog", STATIC_CAPABILITY_CATALOG).errors).toEqual([])
  })

  it("describes every capability in the index, in order, with matching coverage fields", () => {
    const index = capabilityIndex as unknown as CapabilityIndex
    expect(caps.map((c) => c.id)).toEqual(index.capabilities.map((c) => c.id))
    for (const [i, row] of index.capabilities.entries()) {
      const c = caps[i]
      expect([c.title, c.category, c.default_surface, c.admin_only, c.requires_project]).toEqual([
        row.title,
        row.category,
        row.default_surface,
        row.admin_only,
        row.requires_project,
      ])
      expect(c.legacy_routes).toEqual(row.legacy_routes)
    }
  })

  it("marks every destructive action as requiring confirmation", () => {
    for (const c of caps) for (const a of c.actions) if (a.destructive) expect(a.requires_confirmation, `${c.id}.${a.id}`).toBe(true)
  })

  it("names action events within the A2UI Action.event.name pattern", () => {
    for (const c of caps) for (const a of c.actions) expect(actionEventName(c.id, a.id)).toMatch(/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/)
  })
})

describe("resolveCapabilityRenderer", () => {
  it("resolves every component renderer key (shell keys belong to WS-A)", () => {
    const missing = caps
      .filter((c) => c.renderer.kind === "component")
      .map((c) => (c.renderer as { component_key: string }).component_key)
      .filter((k) => !(k in CAPABILITY_RENDERERS) && !(SHELL_COMPONENT_KEYS as readonly string[]).includes(k))
    expect(missing).toEqual([])
  })

  it("has no orphan renderer keys", () => {
    const used = new Set(caps.map((c) => (c.renderer.kind === "component" ? c.renderer.component_key : "")))
    expect(Object.keys(CAPABILITY_RENDERERS).filter((k) => !used.has(k))).toEqual([])
  })

  it("returns null for A2UI and shell-owned capabilities", () => {
    expect(resolveCapabilityRenderer(getStaticCapability("data.analyze")!)).toBeNull()
    expect(resolveCapabilityRenderer(getStaticCapability("system.sessions")!)).toBeNull()
    expect(resolveCapabilityRenderer(getStaticCapability("projects.manage")!)).toBe(CAPABILITY_RENDERERS["pages.ProjectsPage"])
  })
})

describe("catalog helpers", () => {
  it("hides admin-only capabilities from non-admins in the static fallback", () => {
    const user = filterCatalogForUser(STATIC_CAPABILITY_CATALOG, { isAdmin: false })
    expect(user.capabilities.some((c) => c.admin_only)).toBe(false)
    const admin = filterCatalogForUser(STATIC_CAPABILITY_CATALOG, { isAdmin: true })
    expect(admin.capabilities.length).toBe(caps.length)
  })

  it("fills legacy route params", () => {
    expect(fillRoute("/p/:projectId/files", { project_id: "p 1" })).toBe("/p/p%201/files")
    expect(fillRoute("/initiatives/:initiativeId/board", { initiativeId: "i1" })).toBe("/initiatives/i1/board")
    expect(fillRoute("/p/:projectId/files", {})).toBeNull()
  })
})

describe("composites", () => {
  it("WS-D owns every composite-tier catalog component except ExecutionTimeline (WS-B)", () => {
    const comps = (catalogJson as unknown as { components: Record<string, { "x-forge-tier"?: string }> }).components
    const composite = Object.entries(comps)
      .filter(([, schema]) => schema["x-forge-tier"] === "composite")
      .map(([name]) => name)
      .filter((n) => n !== "ExecutionTimeline")
    expect([...WS_D_COMPOSITES].sort()).toEqual(composite.sort())
  })
})
