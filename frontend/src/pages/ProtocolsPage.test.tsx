import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react"
import ProtocolsPage from "./ProtocolsPage"
import { renderWithProviders } from "../test/renderWithProviders"
import { mergeAudit, resetProtocolDemoState, validatePublicHttpsUrl } from "../lib/protocolsData"
import { DEMO_A2A_AUDIT, DEMO_MCP_AUDIT } from "../lib/demo/protocolsDemo"

beforeEach(resetProtocolDemoState)
afterEach(cleanup)

async function renderPage() {
  renderWithProviders(<ProtocolsPage />, { route: "/protocols" })
  return screen.findByRole("list", { name: "Active protocols" })
}

describe("ProtocolsPage (demo mode)", () => {
  it("renders the overview with live protocol cards and the deferred row", async () => {
    const list = await renderPage()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Protocols. How Forge talks to the world.")
    for (const name of ["MCP", "MCP Apps", "A2A", "AG-UI", "A2UI"]) {
      expect(within(list).getByText(name, { selector: "span" })).toBeInTheDocument()
    }
    const deferred = screen.getByRole("list", { name: "Deferred protocols" })
    expect(within(deferred).getAllByRole("listitem")).toHaveLength(7)
    expect(screen.getByRole("link", { name: /ADR: Defer P2\/P3/ })).toHaveAttribute("href", expect.stringContaining("ADR-protocol-deferral.md"))
  })

  it("switches tabs with the pill control and keeps tab/panel wiring", async () => {
    await renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /MCP servers/ }))
    const panel = screen.getByRole("tabpanel")
    expect(panel).toHaveAttribute("aria-labelledby", "protocols-tab-mcp")
    expect(within(panel).getByText("forge-workspace-mcp")).toBeInTheDocument()
    expect(within(panel).getByRole("table", { name: "MCP tools" })).toBeInTheDocument()
  })

  it("validates the MCP register form and registers a server", async () => {
    await renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /MCP servers/ }))
    fireEvent.change(screen.getByLabelText("Server ID"), { target: { value: "wiki-mcp" } })
    fireEvent.change(screen.getByLabelText("Endpoint URL"), { target: { value: "http://127.0.0.1/rpc" } })
    fireEvent.click(screen.getByRole("button", { name: /Register server/ }))
    expect(await screen.findByText("Endpoint URL must use https://.")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Endpoint URL"), { target: { value: "https://wiki-mcp.example.com/rpc" } })
    fireEvent.click(screen.getByRole("button", { name: /Register server/ }))
    expect(await screen.findByText(/wiki-mcp registered/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText("wiki-mcp").length).toBeGreaterThan(0))
  })

  it("validates the A2A discover form, then discovers, sends a task and shows the timeline", async () => {
    await renderPage()
    fireEvent.click(screen.getByRole("tab", { name: "A2A" }))
    const url = screen.getByLabelText("Agent URL")
    const discover = screen.getByRole("button", { name: /Discover/ })

    fireEvent.click(discover)
    expect(await screen.findByText("Enter the Agent URL.")).toBeInTheDocument()

    fireEvent.change(url, { target: { value: "https://localhost/agent" } })
    fireEvent.click(discover)
    expect(await screen.findByText(/Internal hostnames are blocked/)).toBeInTheDocument()

    fireEvent.change(url, { target: { value: "https://192.168.1.4/agent" } })
    fireEvent.click(discover)
    expect(await screen.findByText(/Private and loopback addresses/)).toBeInTheDocument()

    fireEvent.change(url, { target: { value: "https://agents.vendor-example.com" } })
    fireEvent.click(discover)
    const card = await screen.findByLabelText("Discovered agent")
    expect(within(card).getByText("Vendor Example Agent")).toBeInTheDocument()

    fireEvent.change(within(card).getByLabelText("Task"), { target: { value: "Check licence risk" } })
    fireEvent.click(within(card).getByRole("button", { name: /Send task/ }))
    const timeline = await within(card).findByRole("list", { name: "Task status timeline" })
    expect(within(timeline).getByText("submitted")).toBeInTheDocument()
  })

  it("shows the agent card JSON with copy buttons and lets you cancel a live inbound task", async () => {
    await renderPage()
    fireEvent.click(screen.getByRole("tab", { name: "A2A" }))
    expect(screen.getByLabelText("Agent card JSON")).toHaveTextContent('"name": "Forge AI Autonomous Engineering OS"')
    expect(screen.getAllByRole("button", { name: "Copy" }).length).toBeGreaterThanOrEqual(3)

    const inbound = await screen.findByRole("list", { name: "Inbound A2A tasks" })
    expect(within(inbound).getAllByRole("listitem")).toHaveLength(4)
    fireEvent.click(within(inbound).getByRole("button", { name: "Cancel task a2a_7f3c91d04b2e" }))
    await waitFor(() =>
      expect(within(screen.getByRole("list", { name: "Inbound A2A tasks" })).queryByRole("button", { name: "Cancel task a2a_7f3c91d04b2e" })).not.toBeInTheDocument()
    )
  })

  it("filters the audit table by protocol and outcome", async () => {
    await renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /Audit/ }))
    const table = screen.getByRole("table", { name: "Protocol audit records" })
    expect(within(table).getAllByRole("row")).toHaveLength(14) // header + 13
    fireEvent.click(screen.getByRole("tab", { name: /^Denied/ }))
    expect(within(table).getAllByRole("row")).toHaveLength(3)
    fireEvent.click(within(screen.getByRole("tablist", { name: "Filter by protocol" })).getByRole("tab", { name: "A2A" }))
    expect(within(table).getAllByRole("row")).toHaveLength(2)
    expect(within(table).getByText("10.0.4.12")).toBeInTheDocument()
  })
})

describe("protocol helpers", () => {
  it("validates public https URLs like the gateway pre-check", () => {
    expect(validatePublicHttpsUrl("https://mcp.example.com/rpc")).toBeNull()
    expect(validatePublicHttpsUrl("https://user:pw@mcp.example.com/rpc")).toMatch(/credentials/)
    expect(validatePublicHttpsUrl("https://10.1.2.3/rpc")).toMatch(/Private/)
    expect(validatePublicHttpsUrl("https://svc.internal/rpc")).toMatch(/Internal/)
    expect(validatePublicHttpsUrl("not a url at all")).toMatch(/valid/)
  })

  it("merges MCP and A2A audit records newest first", () => {
    const rows = mergeAudit(DEMO_MCP_AUDIT, DEMO_A2A_AUDIT)
    expect(rows).toHaveLength(13)
    expect(rows.every((r, i) => i === 0 || rows[i - 1].time >= r.time)).toBe(true)
  })
})
