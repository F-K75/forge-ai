import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { axe } from "vitest-axe"
import { FORGE_CATALOG_ID, type OsEvent } from "../../contracts"
import type { AGUIEvent } from "../../../lib/kernelApi"
import { FIXTURE_SESSION, loadOsEventExamples } from "../../stream/testFixtures"
import type { SubscribeAgui } from "../context"
import { GenUIProvider } from "../GenUIProvider"
import { SurfaceView } from "../SurfaceView"
import { createSurfaceStore } from "../surfaceStore"
import { registerBuiltinComposites } from "./index"

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } }
const VALID = loadOsEventExamples().valid

afterEach(cleanup)
registerBuiltinComposites()

function progress(seq: number, agui_type: string, kernel_event: string, payload: Record<string, unknown> = {}): OsEvent {
  return {
    v: "forge-os/1", seq, session_id: FIXTURE_SESSION, turn_id: "turn_03", ts: `2026-11-27T10:02:0${seq % 10}Z`,
    type: "agent.progress", data: { progress: { project_id: "proj_1", run_id: "run_9", agui_type, kernel_event, payload } },
  }
}

function setup(subscribeAgui: SubscribeAgui | null) {
  const store = createSurfaceStore()
  store.getState().applyMessage({
    version: "1.0",
    createSurface: {
      surfaceId: "srf_run",
      catalogId: FORGE_CATALOG_ID,
      components: [{ id: "root", component: "ExecutionTimeline", projectId: "proj_1", runId: "run_9" }],
    },
  })
  const utils = render(
    <GenUIProvider sessionId={FIXTURE_SESSION} store={store} subscribeAgui={subscribeAgui}>
      <SurfaceView surfaceId="srf_run" />
    </GenUIProvider>
  )
  return { store, ...utils }
}

describe("ExecutionTimeline", () => {
  it("renders live agent.progress from the OS stream (shared example) and tracks run state", async () => {
    const { store, container } = setup(null)
    expect(screen.getByText("Waiting")).toBeInTheDocument()
    act(() => {
      VALID.filter((e) => e.type === "agent.progress").forEach((e) => store.getState().applyEvent(e))
    })
    expect(screen.getByRole("log", { name: "Run progress" })).toHaveTextContent("Wave started · wave 1")
    expect(screen.getByText("Running")).toBeInTheDocument()
    act(() => store.getState().applyEvent(progress(20, "RUN_FINISHED", "kernel_run_completed")))
    expect(screen.getByText("Completed")).toBeInTheDocument()
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations()
  })

  it("merges a direct AG-UI subscription and de-duplicates events seen on both paths", () => {
    let push: (e: AGUIEvent) => void = () => {}
    const unsubscribe = vi.fn()
    const subscribe = vi.fn<SubscribeAgui>((_p, _r, onEvent) => {
      push = onEvent
      return unsubscribe
    })
    const { store, unmount } = setup(subscribe)
    expect(subscribe).toHaveBeenCalledWith("proj_1", "run_9", expect.any(Function))
    act(() => {
      store.getState().applyEvent(progress(1, "STEP_STARTED", "kernel_wave_started", { wave_index: 1 }))
      push({ event_id: 1, agui_type: "STEP_STARTED", kernel_event: "kernel_wave_started", project_id: "proj_1", run_id: "run_9", payload: { wave_index: 1 }, timestamp: "t" })
      push({ event_id: 2, agui_type: "HEARTBEAT", kernel_event: "", project_id: "proj_1", run_id: "run_9", payload: {}, timestamp: "t" })
      push({ event_id: 3, agui_type: "RUN_ERROR", kernel_event: "kernel_run_failed", project_id: "proj_1", run_id: "run_9", payload: { title: "Build broke" }, timestamp: "t" })
    })
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(2)
    expect(items[1]).toHaveTextContent("Run failed · Build broke")
    expect(screen.getByText("Failed")).toBeInTheDocument()
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
