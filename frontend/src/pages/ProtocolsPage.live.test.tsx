/** LIVE_MODE wiring for the Protocols page: axios is mocked at the transport boundary. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react"

vi.mock("../lib/env", () => ({ LIVE_MODE: true, PUBLIC_DEMO_APP_URL: "", IS_PUBLIC_DEMO: false }))

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  defaults: { baseURL: "http://localhost:8000" },
}))
vi.mock("../lib/api", () => ({ api: apiMock, default: apiMock, projectsApi: { list: () => apiMock.get("/projects/").then((r: { data: { projects: unknown } }) => r.data.projects) } }))

import ProtocolsPage from "./ProtocolsPage"
import { renderWithProviders } from "../test/renderWithProviders"

const P = "proj-live"

beforeEach(() => {
  apiMock.get.mockImplementation(async (url: string) => {
    if (url === "/projects/") return { data: { projects: [{ id: P, name: "Live project" }] } }
    if (url.endsWith("/protocols/mcp/tools"))
      return { data: { servers: [{ server_id: "forge-workspace-mcp", transport: "in-process", status: "connected" }], tools: [], apps: [], audit_log: [] } }
    if (url.endsWith("/protocols/a2a/.well-known/agent.json"))
      return { data: { name: "Forge", description: "d", version: "2.0.0", protocol: "a2a/v1", url: "u", capabilities: {}, protocols_supported: [], authentication: { schemes: [], projectScoped: true }, departments: [], skills: [] } }
    if (url.endsWith("/protocols/a2a/audit")) return { data: { audit_log: [] } }
    throw Object.assign(new Error("not mocked"), { response: { status: 404 } })
  })
  apiMock.post.mockImplementation(async (url: string, body: { agent_url?: string }) => {
    if (url.endsWith("/protocols/a2a/remote/discover")) {
      if (body.agent_url?.includes("blocked")) throw Object.assign(new Error("x"), { response: { status: 400, data: { detail: "Remote URL blocked by SSRF policy" } } })
      return { data: { name: "Remote Reviewer", description: "Reviews things", url: "https://remote.example.com/rpc", skills: [] } }
    }
    throw Object.assign(new Error("not mocked"), { response: { status: 404 } })
  })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ProtocolsPage (LIVE_MODE)", () => {
  it("reads the gateway for the active project and calls remote discover", async () => {
    renderWithProviders(<ProtocolsPage />, { route: "/protocols" })
    await screen.findByRole("list", { name: "Active protocols" })
    expect(apiMock.get).toHaveBeenCalledWith(`/v1/projects/${P}/protocols/mcp/tools`, expect.anything())
    expect(apiMock.get).toHaveBeenCalledWith(`/v1/projects/${P}/protocols/a2a/audit`, { params: { limit: 100 } })

    fireEvent.click(screen.getByRole("tab", { name: "A2A" }))
    fireEvent.change(screen.getByLabelText("Agent URL"), { target: { value: "https://blocked.example.com" } })
    fireEvent.click(screen.getByRole("button", { name: /Discover/ }))
    expect(await screen.findByText("Remote URL blocked by SSRF policy")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Agent URL"), { target: { value: "https://remote.example.com" } })
    fireEvent.click(screen.getByRole("button", { name: /Discover/ }))
    const card = await screen.findByLabelText("Discovered agent")
    expect(within(card).getByText("Remote Reviewer")).toBeInTheDocument()
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(`/v1/projects/${P}/protocols/a2a/remote/discover`, { agent_url: "https://remote.example.com" })
    )
  })
})
