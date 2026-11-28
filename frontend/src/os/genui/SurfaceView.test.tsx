import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { axe } from "vitest-axe"
import { FORGE_CATALOG_ID, type A2UIServerMessage, type CompositeComponentProps, type UserActionRequest } from "../contracts"
import { createFixtureSubscribe } from "../stream/fixtureReplayer"
import { FIXTURE_SESSION, loadOsEventExamples } from "../stream/testFixtures"
import { GenUIProvider } from "./GenUIProvider"
import { registerComposite } from "./registry"
import { SurfaceView } from "./SurfaceView"
import { createSurfaceStore, surfaceStreamHandlers, type SurfaceStore } from "./surfaceStore"
import { FALLBACK_MESSAGE } from "./TextFallback"

const VALID = loadOsEventExamples().valid
const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } }

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function create(surfaceId: string, components: unknown[], dataModel: Record<string, unknown> = {}): A2UIServerMessage {
  return { version: "1.0", createSurface: { surfaceId, catalogId: FORGE_CATALOG_ID, components, dataModel } } as unknown as A2UIServerMessage
}

function mount(store: SurfaceStore, surfaceId: string, extra: Partial<Parameters<typeof GenUIProvider>[0]> = {}) {
  return render(
    <GenUIProvider sessionId="ses_1" store={store} {...extra}>
      <SurfaceView surfaceId={surfaceId} />
    </GenUIProvider>
  )
}

describe("SurfaceView end to end (fixture stream → store → render)", () => {
  it("renders the example dataset surface, applies the data update, then removes it", async () => {
    const store = createSurfaceStore()
    // Replay up to the data-model update (seq 10), then the rest.
    const firstPart = VALID.filter((e) => e.seq <= 10)
    const stop = createFixtureSubscribe(firstPart)(FIXTURE_SESSION, surfaceStreamHandlers(store))
    const { container } = mount(store, "srf_sales")
    expect(await screen.findByRole("heading", { name: "Sales by region" })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Sales by region" })).toBeInTheDocument()
    expect(await screen.findByText("$1250.00")).toBeInTheDocument()
    expect(screen.getByText("$900.00")).toBeInTheDocument()
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations()
    stop()

    act(() => {
      for (const e of VALID.filter((e) => e.seq > 10 && e.type !== "heartbeat")) store.getState().applyEvent(e)
    })
    expect(screen.queryByRole("heading", { name: "Sales by region" })).toBeNull()
    expect(screen.getByRole("status")).toHaveTextContent(/Preparing/)
  })
})

describe("SurfaceView states and fallbacks", () => {
  it("shows a status while the surface does not exist yet", () => {
    mount(createSurfaceStore(), "srf_missing")
    expect(screen.getByRole("status")).toHaveTextContent("Preparing view…")
  })

  it("shows the text fallback with a capability link when the surface failed validation", () => {
    const store = createSurfaceStore()
    const onOpen = vi.fn()
    act(() => {
      store.getState().applyEvent({
        v: "forge-os/1", seq: 1, session_id: "ses_1", turn_id: null, ts: "2026-11-27T10:00:00Z",
        type: "surface.placed",
        data: { placement: { surface_id: "srf_bad", presentation: "window", title: "Forecast", capability_id: "data.analyze" } },
      })
      store.getState().rejectEvent(
        { type: "a2ui.message", data: { message: { createSurface: { surfaceId: "srf_bad" } } } },
        [{ path: "/x", message: "nope" }]
      )
    })
    mount(store, "srf_bad", { onOpenCapability: onOpen })
    expect(screen.getByRole("note", { name: `Forecast: ${FALLBACK_MESSAGE}` })).toBeInTheDocument()
    expect(screen.queryByText("nope")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Open Forecast" }))
    expect(onOpen).toHaveBeenCalledWith("data.analyze")
  })

  it("falls back to recovered text when there is no root component", () => {
    const store = createSurfaceStore()
    store.getState().applyMessage(create("s", [{ id: "h", component: "Heading", text: "Orphan heading" }]))
    mount(store, "s")
    expect(screen.getByText(FALLBACK_MESSAGE)).toBeInTheDocument()
    expect(screen.getByText("Orphan heading")).toBeInTheDocument()
  })

  it("isolates a crashing component behind its own error boundary", () => {
    const store = createSurfaceStore()
    const Boom = (): never => {
      throw new Error("boom")
    }
    const off = registerComposite("ProjectGrid", Boom)
    store.getState().applyMessage(
      create("s", [
        { id: "root", component: "Column", children: ["ok", "grid"] },
        { id: "ok", component: "Text", text: "Still here" },
        { id: "grid", component: "ProjectGrid", items: [] },
      ])
    )
    mount(store, "s")
    expect(screen.getByText("Still here")).toBeInTheDocument()
    expect(screen.getByText("This part of the result couldn't be displayed.")).toBeInTheDocument()
    off()
  })

  it("cuts cycles in the component graph", () => {
    const store = createSurfaceStore()
    store.getState().applyMessage(
      create("s", [
        { id: "root", component: "Column", children: ["a"] },
        { id: "a", component: "Card", title: "Loop", children: ["root"] },
      ])
    )
    mount(store, "s")
    expect(screen.getAllByText("Loop")).toHaveLength(1)
  })

  it("renders an unregistered composite as a note, then the composite once WS-D registers it", () => {
    const store = createSurfaceStore()
    store.getState().applyMessage(
      create("s", [
        { id: "root", component: "Column", children: ["prev"] },
        { id: "prev", component: "LivePreview", projectId: { "@path": "/p" } },
      ], { p: "proj_9" })
    )
    mount(store, "s")
    expect(screen.getByText("This view isn't available here yet.")).toBeInTheDocument()
    let received: CompositeComponentProps | null = null
    const Live = (p: CompositeComponentProps) => {
      received = p
      return <p>Preview of {String(p.props.projectId)}</p>
    }
    let off = () => {}
    act(() => {
      off = registerComposite("LivePreview", Live)
    })
    expect(screen.getByText("Preview of proj_9")).toBeInTheDocument()
    expect(received!).toMatchObject({ surfaceId: "s", componentId: "prev", props: { projectId: "proj_9" } })
    act(() => off())
  })

  it("composites dispatch named action props and write through bindings", async () => {
    const store = createSurfaceStore()
    const post = vi.fn().mockResolvedValue({})
    store.getState().applyMessage(
      create("s", [
        { id: "root", component: "AgentConfigForm", value: { "@path": "/agent" }, submit: { event: { name: "save_agent", context: { cfg: { "@path": "/agent" } } } } },
      ], { agent: { name: "A" } })
    )
    const Form = (p: CompositeComponentProps) => (
      <div>
        <button type="button" onClick={() => p.write({ "@path": "/agent/name" }, "B")}>rename</button>
        <button type="button" onClick={() => p.dispatch("submit")}>save</button>
      </div>
    )
    const off = registerComposite("AgentConfigForm", Form)
    mount(store, "s", { post })
    fireEvent.click(screen.getByRole("button", { name: "rename" }))
    expect(store.getState().surfaces.s.dataModel).toEqual({ agent: { name: "B" } })
    fireEvent.click(screen.getByRole("button", { name: "save" }))
    await waitFor(() => expect(post).toHaveBeenCalled())
    expect((post.mock.calls[0][1] as UserActionRequest).a2ui.action.context).toEqual({ cfg: { name: "B" } })
    off()
  })
})

describe("SurfaceView actions", () => {
  const approval = () =>
    create("s", [
      { id: "root", component: "ApprovalCard", gateId: "g1", gateName: "Ship it", riskLevel: "critical", approve: { event: { name: "approve_gate" } }, reject: { event: { name: "reject_gate" } } },
    ])

  it("confirms, shows pending until action.result, then shows rejection messages", async () => {
    const store = createSurfaceStore()
    store.getState().applyMessage(approval())
    const post = vi.fn().mockResolvedValue({})
    const confirm = vi.fn().mockResolvedValue(true)
    mount(store, "s", { post, confirm })
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ actionName: "approve_gate", riskLevel: "critical" }))
    const approve = screen.getByRole("button", { name: "Approve" })
    expect(approve).toHaveAttribute("aria-busy", "true")
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled()

    const actionId = (post.mock.calls[0][1] as UserActionRequest).action_id
    act(() => {
      store.getState().applyEvent({
        v: "forge-os/1", seq: 5, session_id: "ses_1", turn_id: null, ts: "2026-11-27T10:00:00Z",
        type: "action.result", data: { action_id: actionId, status: "rejected", message: "Approver role required" },
      })
    })
    expect(screen.getByRole("alert")).toHaveTextContent("Approver role required")
    expect(screen.getByRole("button", { name: "Approve" })).not.toHaveAttribute("aria-busy")
  })

  it("does not post when the user declines the confirmation", async () => {
    const store = createSurfaceStore()
    store.getState().applyMessage(approval())
    const post = vi.fn()
    const confirm = vi.fn().mockResolvedValue(false)
    mount(store, "s", { post, confirm })
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())
    expect(post).not.toHaveBeenCalled()
  })
})
