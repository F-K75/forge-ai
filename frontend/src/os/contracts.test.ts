import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import contractsSchema from "./schemas/os-contracts.schema.json"
import capabilityIndex from "./schemas/capability-index.json"
import {
  CAPABILITY_CATEGORIES,
  CONTRACT_DEFS,
  ENTRY_POINTS,
  FORGE_CATALOG_ID,
  INTENT_KINDS,
  OS_ERROR_CODES,
  OS_EVENT_TYPES,
  PERMISSIONS,
  PERSISTENCE_RULES,
  PRESENTATION_KINDS,
  type CapabilityIndex,
  type OsEvent,
  type TurnRequest,
  type WorkspaceState,
} from "./contracts"
import {
  CATALOG_COMPONENTS,
  validateA2UIMessage,
  validateComponent,
  validateContract,
  validateOsEvent,
} from "./validate"

// Tests run from frontend/, so the repo root is one level up (as in content.drift.test.ts).
const SHARED = resolve(process.cwd(), "..", "shared/os-schemas")
const SCHEMA_FILES = [
  "os-contracts.schema.json",
  "forge-ember.catalog.json",
  "capability-index.json",
]

type Defs = Record<
  string,
  { enum?: string[]; oneOf?: unknown[]; properties?: Record<string, { enum?: string[] }> }
>
const DEFS = (contractsSchema as unknown as { $defs: Defs }).$defs

interface ExampleGroup {
  def: string
  file: string
  valid: unknown[]
  invalid: { reason: string; payload: unknown }[]
}

function loadExampleGroups(): ExampleGroup[] {
  const dir = resolve(SHARED, "examples")
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .flatMap((file) => {
      const doc = JSON.parse(readFileSync(resolve(dir, file), "utf8"))
      const groups = (doc.groups ?? [doc]) as Omit<ExampleGroup, "file">[]
      return groups.map((g) => ({ ...g, file }))
    })
}

function check(def: string, payload: unknown) {
  if (def === "catalog:component") return validateComponent(payload)
  if (def === "OsEvent") return validateOsEvent(payload)
  return validateContract(def, payload)
}

describe("OS schema copies", () => {
  it.each(SCHEMA_FILES)(
    "src/os/schemas/%s matches shared/os-schemas (run backend/scripts/sync_os_schemas.py)",
    (name) => {
      const copy = readFileSync(resolve(process.cwd(), "src/os/schemas", name), "utf8")
      expect(copy).toBe(readFileSync(resolve(SHARED, name), "utf8"))
    }
  )
})

describe("enum parity between contracts.ts and the schema", () => {
  it.each([
    ["IntentKind", INTENT_KINDS],
    ["PresentationKind", PRESENTATION_KINDS],
    ["Permission", PERMISSIONS],
    ["EntryPoint", ENTRY_POINTS],
    ["PersistenceRule", PERSISTENCE_RULES],
    ["OsEventType", OS_EVENT_TYPES],
  ] as const)("%s", (def, values) => {
    expect([...values]).toEqual(DEFS[def].enum)
  })

  it("capability categories and error codes", () => {
    expect([...CAPABILITY_CATEGORIES]).toEqual(DEFS.CapabilityDescriptor.properties!.category.enum)
    expect([...OS_ERROR_CODES]).toEqual(DEFS.OsError.properties!.code.enum)
  })

  it("every event type has exactly one envelope variant", () => {
    expect(DEFS.OsEvent.oneOf).toHaveLength(OS_EVENT_TYPES.length)
  })

  it("every CONTRACT_DEFS entry exists in the schema", () => {
    for (const def of CONTRACT_DEFS) expect(DEFS[def], def).toBeDefined()
  })

  it("catalog id constant matches the schema", () => {
    expect(DEFS.CatalogId.enum).toEqual([FORGE_CATALOG_ID])
  })
})

describe("shared example payloads", () => {
  const groups = loadExampleGroups()

  it("cover the main contracts", () => {
    const defs = new Set(groups.map((g) => g.def))
    for (const d of [
      "OsEvent",
      "TurnRequest",
      "UserActionRequest",
      "CapabilityInvocation",
      "WorkspaceState",
      "CapabilityDescriptor",
      "catalog:component",
    ]) {
      expect(defs.has(d), d).toBe(true)
    }
  })

  const valid = groups.flatMap((g) =>
    g.valid.map((p, i) => [`${g.file} ${g.def} valid[${i}]`, g.def, p] as const)
  )
  const invalid = groups.flatMap((g) =>
    g.invalid.map((c) => [`${g.file} ${g.def}: ${c.reason}`, g.def, c.payload] as const)
  )

  it.each(valid)("%s passes", (_id, def, payload) => {
    const result = check(def, payload)
    expect(result.errors).toEqual([])
  })

  it.each(invalid)("%s is rejected", (_id, def, payload) => {
    expect(check(def, payload).valid).toBe(false)
  })
})

describe("typed payloads conform to the schema", () => {
  // These literals are type-checked against contracts.ts by `tsc`, then
  // validated against the schema, so a TS/schema mismatch fails one or the other.
  const turn: TurnRequest = {
    client_turn_id: "ct_typed",
    prompt: "Compare GPT-class and Claude-class models on cost",
    model: { mode: "auto" },
    context: { open_capability_ids: ["models.compare"] },
  }
  const events: OsEvent[] = [
    {
      v: "forge-os/1",
      seq: 1,
      session_id: "ses_typed",
      turn_id: "turn_1",
      ts: "2026-11-27T10:00:00Z",
      type: "a2ui.message",
      data: {
        message: {
          version: "1.0",
          createSurface: {
            surfaceId: "srf_cmp",
            catalogId: FORGE_CATALOG_ID,
            components: [
              {
                id: "root",
                component: "ComparisonTable",
                subjects: [
                  { id: "a", label: "Model A" },
                  { id: "b", label: "Model B" },
                ],
                rows: [{ label: "Input $/1M", values: [3, 5], better: "lower" }],
              },
            ],
          },
        },
      },
    },
    {
      v: "forge-os/1",
      seq: 2,
      session_id: "ses_typed",
      turn_id: "turn_1",
      ts: "2026-11-27T10:00:01Z",
      type: "surface.placed",
      data: {
        placement: { surface_id: "srf_cmp", presentation: "window", title: "Model comparison" },
      },
    },
    {
      v: "forge-os/1",
      seq: 3,
      session_id: "ses_typed",
      turn_id: "turn_1",
      ts: "2026-11-27T10:00:02Z",
      type: "turn.completed",
      data: { status: "completed", usage: null },
    },
  ]
  const workspace: WorkspaceState = {
    id: "ws_typed",
    name: "Default",
    version: 0,
    active_session_id: null,
    nav_collapsed: true,
    layout: "focus",
    windows: [
      {
        id: "w1",
        kind: "surface",
        title: "Model comparison",
        presentation: "window",
        surface_id: "srf_cmp",
        z: 0,
        state: "maximized",
      },
    ],
    updated_at: "2026-11-27T10:00:02Z",
  }

  it("TurnRequest", () => expect(validateContract("TurnRequest", turn).errors).toEqual([]))
  it.each(events.map((e) => [e.type, e] as const))("OsEvent %s", (_t, e) =>
    expect(validateOsEvent(e).errors).toEqual([])
  )
  it("WorkspaceState", () =>
    expect(validateContract("WorkspaceState", workspace).errors).toEqual([]))
})

describe("A2UI catalog validation", () => {
  it("exposes a closed component allowlist including the ported legacy set", () => {
    for (const name of [
      "Column",
      "Text",
      "DataTable",
      "Chart",
      "ComparisonTable",
      "ApprovalCard",
      "WorkflowCanvas",
      "ExecutionTimeline",
      "LivePreview",
    ]) {
      expect(CATALOG_COMPONENTS).toContain(name)
    }
  })

  it("rejects an unknown component inside an otherwise valid envelope", () => {
    const message = {
      version: "1.0",
      createSurface: {
        surfaceId: "s1",
        catalogId: FORGE_CATALOG_ID,
        components: [{ id: "root", component: "Iframe", src: "https://x.example" }],
      },
    }
    expect(validateContract("A2UIServerMessage", message).valid).toBe(true)
    const result = validateA2UIMessage(message)
    expect(result.valid).toBe(false)
    expect(result.errors[0].path).toBe("/components/0/component")
  })

  it("rejects event handlers smuggled as props", () => {
    const message = {
      version: "1.0",
      updateComponents: {
        surfaceId: "s1",
        components: [{ id: "t", component: "Text", text: "hi", onClick: "alert(1)" }],
      },
    }
    expect(validateA2UIMessage(message).valid).toBe(false)
  })
})

describe("capability index", () => {
  const index = capabilityIndex as unknown as CapabilityIndex

  it("is a valid CapabilityIndex", () => {
    expect(validateContract("CapabilityIndex", index).errors).toEqual([])
  })

  it("has unique ids and assigns every legacy route to exactly one capability", () => {
    const ids = index.capabilities.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    const routes = index.capabilities.flatMap((c) => c.legacy_routes)
    expect(new Set(routes).size).toBe(routes.length)
  })

  it("covers every route declared in App.tsx (hide complexity, not functionality)", () => {
    const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8")
    const declared = [...app.matchAll(/\bpath="([^"]+)"/g)].map((m) => m[1])
    expect(declared.length).toBeGreaterThan(40)
    const routes = new Set([
      ...index.outside_shell_routes,
      ...index.capabilities.flatMap((c) => c.legacy_routes),
    ])
    const uncovered = declared.filter((p) =>
      p.startsWith("/") || p === "*"
        ? !routes.has(p)
        : // A nested (relative) child must be matched by a deeper absolute route, not a top-level namesake.
          ![...routes].some(
            (r) => r.endsWith(`/${p}`) && r.split("/").length > p.split("/").length + 1
          )
    )
    expect(
      uncovered,
      "add these routes to a capability in shared/os-schemas/capability-index.json"
    ).toEqual([])
  })
})
