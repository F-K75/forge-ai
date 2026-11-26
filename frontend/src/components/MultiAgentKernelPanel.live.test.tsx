/**
 * LIVE_MODE wiring for A2UI approval cards and MCP App views.
 *
 * The axios client (`lib/api`) is mocked at the transport boundary, so these
 * tests exercise the real `kernelApi` / `protocolApi` helpers, URLs and params.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react"
import type { KernelRun, MCPAppResourcePayload } from "../lib/kernelApi"

vi.mock("../lib/env", () => ({ LIVE_MODE: true, PUBLIC_DEMO_APP_URL: "", IS_PUBLIC_DEMO: false }))

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  defaults: { baseURL: "http://localhost:8000" },
}))
vi.mock("../lib/api", () => ({ api: apiMock, default: apiMock }))

import { MultiAgentKernelPanel } from "./MultiAgentKernelPanel"
import { planObjectiveLocally } from "../lib/kernelApi"

const PROJECT = "proj-live"
const GATE_ID = "gate_live_1"
const CSP = "default-src 'none'; script-src 'unsafe-inline'"

function makeRun(gateStatus: "pending" | "approved"): KernelRun {
  const run = planObjectiveLocally(PROJECT, "Build API and release it", { requireDeliveryApproval: true })
  return {
    ...run,
    id: "krun_live",
    status: gateStatus === "pending" ? "waiting_approval" : "completed",
    approval_gates: [
      {
        gate_id: GATE_ID,
        gate_name: "pre_delivery_approval",
        reason: "Human sign-off required before Delivery",
        wave_index: 2,
        status: gateStatus,
        decided_by: gateStatus === "approved" ? "owner@forge.test" : null,
        note: "",
        created_at: "2026-11-26T00:00:00Z",
      },
    ],
  }
}

function gateSurface() {
  return {
    surface_id: `a2ui_gate_${GATE_ID}`,
    protocol: "a2ui/v1",
    title: "Approval Required: pre_delivery_approval",
    components: [
      {
        type: "approval_card",
        gate_id: GATE_ID,
        gate_name: "pre_delivery_approval",
        reason: "Human sign-off required before Delivery",
        wave_index: 2,
        risk_level: "medium",
        actions: ["approve", "reject"],
      },
    ],
  }
}

const chartResource: MCPAppResourcePayload = {
  app_id: "app_chart",
  tool_name: "chart",
  server_id: "charts",
  resource_uri: "ui://charts/app.html",
  mime_type: "text/html;profile=mcp-app",
  html: `<!DOCTYPE html>\n<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<p>chart</p>`,
  size_bytes: 10,
  content_sha256: "0".repeat(64),
  protocol: "mcp-apps/v1",
  extension: "io.modelcontextprotocol/ui",
  warnings: [],
  sandbox: {
    render_mode: "iframe-srcdoc",
    iframe_sandbox: "allow-scripts",
    iframe_allow: "",
    referrer_policy: "no-referrer",
    csp: CSP,
    allowed_domains: { connect_domains: [], resource_domains: [], frame_domains: [] },
    denied_permissions: [],
    prefers_border: false,
  },
}

let gateState: "pending" | "approved"
let approveResponse: () => Promise<unknown>

beforeEach(() => {
  gateState = "pending"
  approveResponse = async () => {
    gateState = "approved"
    return { data: { run_id: "krun_live", gate: makeRun("approved").approval_gates![0], idempotent: false } }
  }
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))) // AG-UI SSE stream never opens
  apiMock.get.mockImplementation(async (url: string) => {
    if (url.endsWith("/kernel/runs/krun_live")) return { data: makeRun(gateState) }
    if (url.endsWith("/protocols/a2ui/runs/krun_live/surfaces")) {
      return { data: { run_id: "krun_live", protocol: "a2ui/v1", surfaces: gateState === "pending" ? [gateSurface()] : [] } }
    }
    if (url.endsWith("/protocols/mcp/tools")) {
      return {
        data: {
          servers: [],
          audit_log: [],
          tools: [
            {
              name: "chart",
              server_id: "charts",
              description: "Render a chart",
              allowed_departments: ["design", "engineering"],
            },
          ],
          apps: [
            {
              app_id: "app_chart",
              title: "Chart Viewer",
              tool_name: "chart",
              server_id: "charts",
              description: "Interactive chart",
              protocol: "mcp-apps/v1",
              ui_schema: { kind: "mcp-app-resource", resource_uri: "ui://charts/app.html" },
              resource_uri: "ui://charts/app.html",
            },
          ],
        },
      }
    }
    if (url.endsWith("/protocols/mcp/apps/app_chart/resource")) return { data: chartResource }
    throw Object.assign(new Error("not mocked"), { response: { status: 404 } })
  })
  apiMock.post.mockImplementation(async (url: string) => {
    if (url.endsWith("/kernel/runs")) return { data: makeRun("pending") }
    if (url.endsWith(`/kernel/runs/krun_live/gates/${GATE_ID}/approve`)) return approveResponse()
    throw Object.assign(new Error("not mocked"), { response: { status: 404 } })
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function startRunAndOpenProtocols() {
  render(<MultiAgentKernelPanel projectId={PROJECT} />)
  fireEvent.click(screen.getByRole("button", { name: /Execute Parallel Waves/i }))
  await screen.findByText(/Governance Approval Required/i)
  fireEvent.click(screen.getByRole("tab", { name: /Protocols/i }))
  return screen.findByRole("button", { name: /^Approve pre_delivery_approval/i })
}

describe("MultiAgentKernelPanel (LIVE_MODE) A2UI approval card", () => {
  it("clicking Approve calls the gate API, disables while pending, and refreshes the run", async () => {
    let release: () => void = () => {}
    approveResponse = () =>
      new Promise((resolve) => {
        release = () => {
          gateState = "approved"
          resolve({ data: { run_id: "krun_live", gate: makeRun("approved").approval_gates![0], idempotent: false } })
        }
      })

    const approve = await startRunAndOpenProtocols()
    fireEvent.click(approve)

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        `/v1/projects/${PROJECT}/kernel/runs/krun_live/gates/${GATE_ID}/approve`,
        { note: "" },
      ),
    )
    // Pending: both actions disabled
    expect(screen.getByRole("button", { name: /^Approve pre_delivery_approval/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /^Reject pre_delivery_approval/i })).toBeDisabled()

    release()

    // Run + surfaces refreshed: banner gone, gate history shows approved, card gone
    await waitFor(() => {
      expect(screen.queryByText(/Governance Approval Required/i)).toBeNull()
      expect(screen.queryByRole("button", { name: /^Approve pre_delivery_approval/i })).toBeNull()
    })
    expect(apiMock.get).toHaveBeenCalledWith(`/v1/projects/${PROJECT}/kernel/runs/krun_live`)
    expect(apiMock.get).toHaveBeenCalledWith(`/v1/projects/${PROJECT}/protocols/a2ui/runs/krun_live/surfaces`)
    const history = screen.getByText("Governance Gate History").parentElement as HTMLElement
    expect(within(history).getByText("approved")).toBeInTheDocument()
  })

  it("shows the server error inline when the decision is refused", async () => {
    approveResponse = async () => {
      throw Object.assign(new Error("Request failed"), {
        response: { status: 403, data: { detail: "Only the project owner or an org owner/admin can decide governance gates" } },
      })
    }
    const approve = await startRunAndOpenProtocols()
    fireEvent.click(approve)
    const alert = await screen.findByText(/Only the project owner or an org owner\/admin/i)
    expect(alert).toHaveAttribute("role", "alert")
    // Still actionable after the failure
    expect(screen.getByRole("button", { name: /^Approve pre_delivery_approval/i })).toBeEnabled()
  })
})

describe("MultiAgentKernelPanel (LIVE_MODE) MCP App view", () => {
  it("opens a resource-backed MCP App in a sandboxed iframe via the resource endpoint", async () => {
    render(<MultiAgentKernelPanel projectId={PROJECT} />)
    fireEvent.click(screen.getByRole("tab", { name: /Protocols/i }))
    fireEvent.click(await screen.findByRole("button", { name: /Open Chart Viewer view/i }))

    const frame = (await screen.findByTitle("MCP App: Chart Viewer")) as HTMLIFrameElement
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts")
    expect(frame.getAttribute("srcdoc")).toBe(chartResource.html)
    expect(apiMock.get).toHaveBeenCalledWith(`/v1/projects/${PROJECT}/protocols/mcp/apps/app_chart/resource`, {
      params: { role: "workspace_operator", department: "design" },
    })
  })
})
