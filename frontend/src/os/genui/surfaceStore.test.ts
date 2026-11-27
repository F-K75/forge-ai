import { beforeEach, describe, expect, it, vi } from "vitest"
import { FORGE_CATALOG_ID, type A2UIServerMessage, type OsEvent, type StoredSurface } from "../contracts"
import { FIXTURE_SESSION, loadOsEventExamples } from "../stream/testFixtures"
import { createSurfaceStore, isComponentPending, MAX_DATA_MODEL_BYTES, runKey, surfaceStreamHandlers } from "./surfaceStore"

const VALID = loadOsEventExamples().valid

const create = (surfaceId: string, components: unknown[] = [], dataModel: Record<string, unknown> = {}) =>
  ({
    version: "1.0",
    createSurface: { surfaceId, catalogId: FORGE_CATALOG_ID, components, dataModel },
  }) as unknown as A2UIServerMessage

const heading = (id: string, text: unknown) => ({ id, component: "Heading", text })

function event(seq: number, message: unknown, session = FIXTURE_SESSION): OsEvent {
  return {
    v: "forge-os/1",
    seq,
    session_id: session,
    turn_id: "turn_x",
    ts: "2026-11-27T10:00:00Z",
    type: "a2ui.message",
    data: { message: message as A2UIServerMessage },
  }
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

describe("surfaceStore lifecycle", () => {
  it("applies the shared example stream: create → place → data update → delete", () => {
    const store = createSurfaceStore()
    const apply = store.getState().applyEvent
    const upTo = (seq: number) => VALID.filter((e) => e.seq <= seq && e.type !== "heartbeat").forEach(apply)

    upTo(9)
    const s = store.getState().surfaces.srf_sales
    expect(Object.keys(s.components).sort()).toEqual(["chart", "root", "table", "title"])
    expect(s.dataModel).toEqual({ rows: [{ region: "EMEA", revenue: 1200 }, { region: "APAC", revenue: 900 }] })
    expect(s.sessionId).toBe(FIXTURE_SESSION)
    expect(s.turnId).toBe("turn_02")
    expect(store.getState().placements.srf_sales.presentation).toBe("window")

    upTo(10)
    expect(store.getState().surfaces.srf_sales.dataModel.rows).toEqual([
      { region: "EMEA", revenue: 1250 },
      { region: "APAC", revenue: 900 },
    ])
    expect(store.getState().surfaces.srf_sales.version).toBe(2)

    upTo(14)
    expect(store.getState().progress[runKey("proj_1", "run_9")]).toHaveLength(1)
    expect(store.getState().mcpApps.app_weather.presentation).toBe("panel")

    VALID.forEach(apply)
    expect(store.getState().surfaces.srf_sales).toBeUndefined()
    expect(store.getState().placements.srf_sales).toBeUndefined()
    expect(store.getState().lastSeq[FIXTURE_SESSION]).toBe(15)
  })

  it("is idempotent under replay: events at or below the last seq are skipped", () => {
    const store = createSurfaceStore()
    const { applyEvent } = store.getState()
    applyEvent(event(1, create("s1", [], { n: 1 })))
    applyEvent(event(2, { version: "1.0", updateDataModel: { surfaceId: "s1", path: "/n", value: 2 } }))
    applyEvent(event(2, { version: "1.0", updateDataModel: { surfaceId: "s1", path: "/n", value: 99 } }))
    applyEvent(event(1, create("s1", [], { n: 0 })))
    expect(store.getState().surfaces.s1.dataModel).toEqual({ n: 2 })
    // Sequence numbers are tracked per session.
    applyEvent(event(1, create("s2"), "ses_other"))
    expect(store.getState().surfaces.s2).toBeDefined()
  })

  it("ignores updates for a surface that was never created", () => {
    const store = createSurfaceStore()
    const r = store.getState().applyMessage({ version: "1.0", updateComponents: { surfaceId: "ghost", components: [heading("h", "x")] } })
    expect(r.ok).toBe(false)
    expect(store.getState().surfaces.ghost).toBeUndefined()
    const r2 = store.getState().applyMessage({ version: "1.0", updateDataModel: { surfaceId: "ghost", value: {} } })
    expect(r2.errors[0].message).toMatch(/not been created/)
  })

  it("upserts components in order and recreates a surface on a second createSurface", () => {
    const store = createSurfaceStore()
    const { applyMessage } = store.getState()
    applyMessage(create("s", [{ id: "root", component: "Column", children: ["a"] }, heading("a", "first")]))
    applyMessage({ version: "1.0", updateComponents: { surfaceId: "s", components: [heading("a", "second"), heading("b", "new")] } })
    expect(store.getState().surfaces.s.components.a.text).toBe("second")
    expect(store.getState().surfaces.s.components.b).toBeDefined()
    applyMessage(create("s", [heading("root", "reset")], { fresh: true }))
    expect(Object.keys(store.getState().surfaces.s.components)).toEqual(["root"])
    expect(store.getState().surfaces.s.dataModel).toEqual({ fresh: true })
    expect(store.getState().surfaces.s.version).toBe(1)
  })

  it("replaces the whole data model with an empty path and rejects a non-object root", () => {
    const store = createSurfaceStore()
    const { applyMessage } = store.getState()
    applyMessage(create("s", [], { a: 1 }))
    applyMessage({ version: "1.0", updateDataModel: { surfaceId: "s", value: { b: 2 } } })
    expect(store.getState().surfaces.s.dataModel).toEqual({ b: 2 })
    const bad = applyMessage({ version: "1.0", updateDataModel: { surfaceId: "s", path: "", value: [1] } })
    expect(bad.ok).toBe(false)
    expect(store.getState().surfaces.s.dataModel).toEqual({ b: 2 })
  })
})

describe("surfaceStore security", () => {
  it("drops unknown and invalid components individually and keeps the rest", () => {
    const store = createSurfaceStore()
    const r = store.getState().applyMessage(
      create("s", [
        heading("root", "ok"),
        { id: "evil", component: "Script", src: "https://evil.example/x.js" },
        { id: "html", component: "Text", text: "x", html: "<img onerror=alert(1)>" },
        { id: "link", component: "LinkList", links: [{ label: "x", url: "javascript:alert(1)" }] },
      ])
    )
    expect(r.ok).toBe(false)
    const s = store.getState().surfaces.s
    expect(Object.keys(s.components)).toEqual(["root"])
    expect(s.dropped.map((d) => d.id)).toEqual(["evil", "html", "link"])
  })

  it("marks a surface failed when its message fails envelope validation", () => {
    const store = createSurfaceStore()
    const r = store.getState().applyMessage({
      version: "1.0",
      createSurface: { surfaceId: "foreign", catalogId: "https://a2ui.org/basic" },
    })
    expect(r.ok).toBe(false)
    expect(store.getState().failures.foreign.reason).toMatch(/invalid/)
    expect(store.getState().surfaces.foreign).toBeUndefined()
  })

  it("rejectEvent from the stream marks the affected surface failed", () => {
    const store = createSurfaceStore()
    const handlers = surfaceStreamHandlers(store)
    handlers.onEvent(event(1, create("s1", [heading("root", "x")])))
    handlers.onInvalid(
      { type: "a2ui.message", data: { message: { version: "1.0", updateComponents: { surfaceId: "s1", components: [{ id: "x", component: "Iframe" }] } } } },
      [{ path: "/components/0/component", message: "not in catalog" }]
    )
    expect(store.getState().failures.s1).toBeDefined()
    expect(store.getState().surfaces.s1).toBeUndefined()
    handlers.onInvalid("garbage", [])
    expect(Object.keys(store.getState().failures)).toEqual(["s1"])
  })

  it("rejects oversized data models on create, update and local write", () => {
    const store = createSurfaceStore()
    const { applyMessage, writeData } = store.getState()
    const huge = "x".repeat(MAX_DATA_MODEL_BYTES + 10)
    expect(applyMessage(create("big", [], { blob: huge })).ok).toBe(false)
    expect(store.getState().failures.big.reason).toMatch(/oversized/)
    applyMessage(create("s", [], { a: 1 }))
    expect(applyMessage({ version: "1.0", updateDataModel: { surfaceId: "s", path: "/blob", value: huge } }).ok).toBe(false)
    expect(writeData("s", "/blob", huge)).toBe(false)
    expect(store.getState().surfaces.s.dataModel).toEqual({ a: 1 })
  })

  it("refuses prototype-polluting data-model paths", () => {
    const store = createSurfaceStore()
    store.getState().applyMessage(create("s", [], {}))
    const r = store.getState().applyMessage({ version: "1.0", updateDataModel: { surfaceId: "s", path: "/__proto__/polluted", value: true } })
    expect(r.ok).toBe(false)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(store.getState().writeData("s", "/constructor/prototype/x", 1)).toBe(false)
  })
})

describe("surfaceStore hydrate, data writes and actions", () => {
  const snapshot: StoredSurface = {
    surface_id: "srf_saved",
    session_id: FIXTURE_SESSION,
    turn_id: "turn_02",
    catalog_id: FORGE_CATALOG_ID,
    title: "Saved",
    components: [heading("root", { "@path": "/t" }), { id: "bad", component: "Nope" }],
    data_model: { t: "Hello" },
    version: 7,
    updated_at: "2026-11-27T10:00:00Z",
  }

  it("hydrates from StoredSurface snapshots, drops bad components and seeds lastSeq", () => {
    const store = createSurfaceStore()
    const r = store.getState().hydrate([snapshot, { surface_id: 1 }], { sessionId: FIXTURE_SESSION, lastSeq: 12 })
    expect(r.ok).toBe(false)
    const s = store.getState().surfaces.srf_saved
    expect(s.version).toBe(7)
    expect(Object.keys(s.components)).toEqual(["root"])
    expect(s.dropped).toHaveLength(1)
    expect(store.getState().lastSeq[FIXTURE_SESSION]).toBe(12)
    // Events already folded into the snapshot are skipped.
    store.getState().applyEvent(event(12, { version: "1.0", deleteSurface: { surfaceId: "srf_saved" } }))
    expect(store.getState().surfaces.srf_saved).toBeDefined()
  })

  it("writes input values back into the data model", () => {
    const store = createSurfaceStore()
    store.getState().hydrate([snapshot])
    expect(store.getState().writeData("srf_saved", "/form/name", "Ada")).toBe(true)
    expect(store.getState().surfaces.srf_saved.dataModel).toEqual({ t: "Hello", form: { name: "Ada" } })
    expect(store.getState().writeData("missing", "/x", 1)).toBe(false)
  })

  it("tracks optimistic action state through action.result", () => {
    const store = createSurfaceStore()
    const st = store.getState()
    st.beginAction({ actionId: "act_1", surfaceId: "s", componentId: "btn", name: "approve" })
    expect(isComponentPending(store.getState(), "s", "btn")).toBe(true)
    st.applyEvent({
      v: "forge-os/1", seq: 1, session_id: "ses", turn_id: null, ts: "2026-11-27T10:00:00Z",
      type: "action.result", data: { action_id: "act_1", status: "accepted" },
    })
    expect(store.getState().actions.act_1.status).toBe("accepted")
    expect(isComponentPending(store.getState(), "s", "btn")).toBe(true)
    st.applyEvent({
      v: "forge-os/1", seq: 2, session_id: "ses", turn_id: null, ts: "2026-11-27T10:00:00Z",
      type: "action.result", data: { action_id: "act_1", status: "rejected", message: "Not allowed" },
    })
    expect(store.getState().actions.act_1).toMatchObject({ status: "rejected", message: "Not allowed" })
    expect(isComponentPending(store.getState(), "s", "btn")).toBe(false)
  })
})
