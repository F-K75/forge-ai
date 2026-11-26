/**
 * LIVE_MODE wiring for the Approvals inbox. The axios client is mocked at the
 * transport boundary (as in MultiAgentKernelPanel.live.test.tsx), so these tests
 * exercise the real kernelApi / protocolApi helpers, URLs and payloads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react"
import type { KernelRun } from "../lib/kernelApi"

vi.mock("../lib/env", () => ({ LIVE_MODE: true, PUBLIC_DEMO_APP_URL: "", IS_PUBLIC_DEMO: false }))

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  defaults: { baseURL: "http://localhost:8000" },
}))
vi.mock("../lib/api", () => ({
  api: apiMock,
  default: apiMock,
  projectsApi: { list: () => apiMock.get("/projects/").then((r: { data: { projects: unknown } }) => r.data.projects) },
}))

import ApprovalsPage from "./ApprovalsPage"
import { planObjectiveLocally } from "../lib/kernelApi"
import { renderWithProviders } from "../test/renderWithProviders"

const PROJECT = "proj-live"
const RUN = "krun_live"
const GATE = "gate_live_1"

let gateStatus: "pending" | "approved" | "rejected"
let decision: () => Promise<unknown>

function makeRun(): KernelRun {
  const run = planObjectiveLocally(PROJECT, "Build API and release it", { requireDeliveryApproval: true })
  return {
    ...run,
    id: RUN,
    status: gateStatus === "pending" ? "waiting_approval" : "completed",
    approval_gates: [
      {
        gate_id: GATE,
        gate_name: "pre_delivery_approval",
        reason: "Human sign-off required before Delivery",
        wave_index: 2,
        status: gateStatus,
        decided_by: gateStatus === "pending" ? null : "owner@forge.test",
        note: "",
        created_at: "2026-11-26T00:00:00Z",
        decided_at: gateStatus === "pending" ? null : "2026-11-26T00:05:00Z",
      },
    ],
  }
}

beforeEach(() => {
  gateStatus = "pending"
  decision = async () => {
    gateStatus = "approved"
    return { data: { run_id: RUN, gate: makeRun().approval_gates![0], idempotent: false } }
  }
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === "/projects/") return { data: { projects: [{ id: PROJECT, name: "Live project" }] } }
    if (url === `/v1/projects/${PROJECT}/kernel/runs`) return { data: { runs: [makeRun()] } }
    if (url === `/v1/projects/${PROJECT}/protocols/a2ui/runs/${RUN}/surfaces`) {
      return {
        data: {
          run_id: RUN,
          protocol: "a2ui/v1",
          surfaces:
            gateStatus === "pending"
              ? [
                  {
                    surface_id: `a2ui_gate_${GATE}`,
                    protocol: "a2ui/v1",
                    title: "Approval Required: pre_delivery_approval",
                    components: [
                      { type: "approval_card", gate_id: GATE, gate_name: "pre_delivery_approval", reason: "Human sign-off required before Delivery", wave_index: 2, risk_level: "medium", actions: ["approve", "reject"] },
                    ],
                  },
                ]
              : [],
        },
      }
    }
    throw Object.assign(new Error("not mocked"), { response: { status: 404 } })
  })
  apiMock.post.mockImplementation(async (url: string) => {
    if (url.endsWith(`/gates/${GATE}/approve`) || url.endsWith(`/gates/${GATE}/reject`)) return decision()
    throw Object.assign(new Error("not mocked"), { response: { status: 404 } })
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ApprovalsPage (LIVE_MODE)", () => {
  it("collects gates from each project's runs and approves via the kernel gate endpoint", async () => {
    renderWithProviders(<ApprovalsPage />, { route: "/approvals" })
    const list = await screen.findByRole("list", { name: "Pending gates" })
    expect(within(list).getByText("Pre-delivery approval")).toBeInTheDocument()
    expect(apiMock.get).toHaveBeenCalledWith(`/v1/projects/${PROJECT}/kernel/runs`, { params: { limit: 20 } })

    const detail = screen.getByRole("article")
    const approve = await within(detail).findByRole("button", { name: "Approve pre_delivery_approval" })
    expect(within(detail).getByText("medium risk")).toBeInTheDocument() // risk from the server's A2UI surface
    fireEvent.click(approve)

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(`/v1/projects/${PROJECT}/kernel/runs/${RUN}/gates/${GATE}/approve`, { note: "" })
    )
    await waitFor(() => expect(within(detail).getByText("Approved", { selector: "p" })).toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole("tab", { name: /Pending/ })).toHaveTextContent("Pending0"))
  })

  it("confirms before rejecting and calls the reject endpoint", async () => {
    decision = async () => {
      gateStatus = "rejected"
      return { data: { run_id: RUN, gate: makeRun().approval_gates![0], idempotent: false } }
    }
    renderWithProviders(<ApprovalsPage />, { route: "/approvals" })
    const detail = await screen.findByRole("article")
    fireEvent.click(await within(detail).findByRole("button", { name: "Reject pre_delivery_approval" }))
    expect(apiMock.post).not.toHaveBeenCalled()
    fireEvent.click(within(detail).getByRole("button", { name: "Confirm reject" }))
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(`/v1/projects/${PROJECT}/kernel/runs/${RUN}/gates/${GATE}/reject`, { note: "" })
    )
    await waitFor(() => expect(within(detail).getByText("Rejected", { selector: "p" })).toBeInTheDocument())
  })

  it("shows a decision error and keeps the gate actionable (403)", async () => {
    decision = async () => {
      throw Object.assign(new Error("forbidden"), { response: { status: 403, data: {} } })
    }
    renderWithProviders(<ApprovalsPage />, { route: "/approvals" })
    const detail = await screen.findByRole("article")
    fireEvent.click(await within(detail).findByRole("button", { name: "Approve pre_delivery_approval" }))
    expect(await within(detail).findByRole("alert")).toHaveTextContent("You do not have permission to decide this gate.")
    expect(within(detail).getByRole("button", { name: "Approve pre_delivery_approval" })).not.toBeDisabled()
  })

  it("shows a load error with retry when the kernel is unreachable", async () => {
    apiMock.get.mockImplementation(async (url: string) => {
      if (url === "/projects/") return { data: { projects: [{ id: PROJECT, name: "Live project" }] } }
      throw Object.assign(new Error("down"), { response: { status: 502 } })
    })
    renderWithProviders(<ApprovalsPage />, { route: "/approvals" })
    expect(await screen.findByText("Couldn't load approval gates.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
  })
})
