import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"

// FlowPage's telemetry strip calls the backend; keep it offline in tests.
vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>()
  return {
    ...actual,
    flowApi: { ...actual.flowApi, personalAnalytics: vi.fn(async () => null), agentStats: vi.fn(async () => null) },
  }
})

import FlowPage from "./FlowPage"
import { buildDemoOverview, overviewFromKernelRuns } from "../lib/commandCenterData"
import { planObjectiveLocally } from "../lib/kernelApi"

afterEach(cleanup)

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

function renderAt(route: string) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/p/:projectId/agents" element={<FlowPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  )
}

const runHeader = () =>
  screen.getByRole("region", { name: "Parallel Execution Waves" }).querySelector("[data-run-id]") as HTMLElement

describe("FlowPage ?run= deep link", () => {
  it("opens the run a Command Center demo link points at", async () => {
    const run = buildDemoOverview().runs.find((r) => r.projectId === "demo-project")!
    expect(run.href).toBe(`/p/demo-project/agents?run=${run.id}`)
    renderAt(run.href)
    await waitFor(() => expect(runHeader()).toHaveAttribute("data-run-id", run.id))
    expect(runHeader()).toHaveAttribute("data-highlighted", "true")
    expect(screen.getByTestId("location")).toHaveTextContent(run.href)
  })

  it("parses the live Command Center href (URL-encoded run id) back to the same id", () => {
    const kernelRun = { ...planObjectiveLocally("proj-x", "Ship it"), id: "krun a/b", status: "running" as const }
    const overview = overviewFromKernelRuns([{ projectId: "proj-x", projectName: "X", runs: [kernelRun] }], null)
    const href = overview.runs[0].href
    const url = new URL(href, "http://forge.local")
    expect(url.pathname).toBe("/p/proj-x/agents")
    expect(url.searchParams.get("run")).toBe("krun a/b")
    expect([...url.searchParams.keys()]).toEqual(["run"])
  })

  it("shows a notice and drops the stale ?run= when the run isn't found", async () => {
    renderAt("/p/demo-project/agents?run=run-nope&tab=x")
    expect(await screen.findByText("That run is no longer available")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(/^\/p\/demo-project\/agents\?tab=x$/))
    // The notice stays after the param is gone, until dismissed.
    expect(screen.getByText("That run is no longer available")).toBeInTheDocument()
    expect(runHeader()).not.toHaveAttribute("data-highlighted")
  })
})
