import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup, fireEvent } from "@testing-library/react"
import { A2UISurfaceView } from "./A2UIRenderer"
import { parseA2UIComponent, safeHttpUrl } from "./parseA2UI"
import type { A2UISurface } from "../../lib/kernelApi"

afterEach(cleanup)

function surface(components: Array<Record<string, unknown>>): A2UISurface {
  return { surface_id: "s1", protocol: "a2ui/v1", title: "Test Surface", components }
}

const ALL_COMPONENTS: Array<Record<string, unknown>> = [
  { type: "heading", text: "Run Heading", level: 2 },
  { type: "metric_row", items: [{ label: "Tasks Completed", value: "3/4" }] },
  { type: "checklist", items: [{ label: "Lint passed", checked: true }] },
  {
    type: "approval_card",
    gate_id: "gate_1",
    gate_name: "pre_delivery_approval",
    reason: "Human sign-off required",
    wave_index: 3,
    risk_level: "high",
    actions: ["approve", "reject"],
  },
  {
    type: "conflict_list",
    items: [{ file_path: "shared/api.ts", wave_index: 1, roles: ["be", "fe"], status: "detected" }],
  },
  {
    type: "eval_table",
    rows: [{ role: "backend_engineer", artifact_type: "code_patch", score: 0.9, passed: true }],
  },
  {
    type: "text_block",
    format: "markdown",
    text: "# Plan\n- step one\n- step two\n\nClosing note",
  },
  { type: "key_value_list", items: [{ key: "Risk Level", value: "high" }] },
  { type: "progress_bar", label: "Tasks completed", value: 1, max: 4, tone: "info" },
  {
    type: "timeline",
    events: [
      {
        timestamp: "2026-01-01T00:00:00Z",
        actor: "architect",
        label: "Started: Design",
        status: "running",
      },
    ],
  },
  {
    type: "status_list",
    items: [
      {
        id: "t1",
        title: "Build API",
        status: "failed",
        owner: "backend_engineer",
        detail: "Type error",
      },
    ],
  },
  {
    type: "code_diff",
    file_path: "app.py",
    language: "python",
    diff: "@@ -1 +1 @@\n-old line\n+new line",
  },
  {
    type: "cost_breakdown",
    currency: "USD",
    total: 0.07,
    budget: 5,
    items: [{ label: "frontend_engineer", amount: 0.05 }],
  },
  {
    type: "agent_roster",
    agents: [{ role: "security_auditor", department: "security", status: "active", task_count: 2 }],
  },
  { type: "callout", tone: "warning", title: "Budget warning", text: "85% of budget used" },
  { type: "link_list", links: [{ label: "Run docs", url: "https://example.com/docs" }] },
]

describe("A2UI renderer", () => {
  it("renders every supported component type", () => {
    render(<A2UISurfaceView surface={surface(ALL_COMPONENTS)} />)

    expect(screen.getByRole("heading", { name: "Run Heading" })).toBeInTheDocument()
    expect(screen.getByText("Tasks Completed")).toBeInTheDocument()
    expect(screen.getByText("Lint passed")).toBeInTheDocument()
    expect(screen.getByText("pre_delivery_approval")).toBeInTheDocument()
    expect(screen.getByText("shared/api.ts")).toBeInTheDocument()
    expect(screen.getByText("90%")).toBeInTheDocument()
    expect(screen.getByText("Plan")).toBeInTheDocument()
    expect(screen.getByText("step two")).toBeInTheDocument()
    expect(screen.getByText("Risk Level")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Tasks completed" })).toHaveAttribute(
      "aria-valuenow",
      "1"
    )
    expect(screen.getByText("Started: Design")).toBeInTheDocument()
    expect(screen.getByText("Build API")).toBeInTheDocument()
    expect(screen.getByText("+new line")).toBeInTheDocument()
    expect(screen.getByText("frontend_engineer")).toBeInTheDocument()
    expect(screen.getByText("security_auditor")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toHaveTextContent("85% of budget used")
    const link = screen.getByRole("link", { name: "Run docs" })
    expect(link).toHaveAttribute("href", "https://example.com/docs")
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow")
  })

  it("renders unknown or malformed components as nothing", () => {
    const { container } = render(
      <A2UISurfaceView
        surface={surface([
          { type: "iframe", src: "https://evil.example" },
          { type: "raw_html", html: "<b id='injected'>x</b>" },
          { type: "progress_bar", label: "missing max", value: 1 },
          { type: "callout", tone: "neon", text: "bad tone" },
          { notype: true },
        ])}
      />
    )
    expect(container.querySelector("iframe")).toBeNull()
    expect(container.querySelector("#injected")).toBeNull()
    expect(screen.queryByText("bad tone")).toBeNull()
    expect(screen.queryByRole("progressbar")).toBeNull()
    // Only the surface header is rendered.
    expect(screen.getByText("Test Surface")).toBeInTheDocument()
  })

  it("keeps script markup inert as text", () => {
    const payload = '<script>window.__xss = 1</script><img src=x onerror="window.__xss=2">'
    const { container } = render(
      <A2UISurfaceView
        surface={surface([
          { type: "text_block", format: "markdown", text: payload },
          { type: "code_diff", diff: `+${payload}` },
          { type: "callout", tone: "info", text: payload },
        ])}
      />
    )
    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("img")).toBeNull()
    expect(screen.getAllByText(payload, { exact: false }).length).toBeGreaterThanOrEqual(2)
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined()
  })

  it("drops links with non-http(s) schemes", () => {
    render(
      <A2UISurfaceView
        surface={surface([
          {
            type: "link_list",
            links: [
              { label: "js", url: "javascript:alert(1)" },
              { label: "js-upper", url: "JAVASCRIPT:alert(1)" },
              { label: "data", url: "data:text/html,<script>alert(1)</script>" },
              { label: "proto-relative", url: "//evil.example" },
              { label: "creds", url: "https://user:pw@example.com" },
              { label: "ok", url: "http://localhost:3000/run" },
            ],
          },
        ])}
      />
    )
    const links = screen.getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveTextContent("ok")
  })

  it("wires approval actions only when a handler is provided", () => {
    const onAction = vi.fn()
    render(<A2UISurfaceView surface={surface([ALL_COMPONENTS[3]])} onApprovalAction={onAction} />)
    fireEvent.click(screen.getByRole("button", { name: /approve/i }))
    expect(onAction).toHaveBeenCalledWith("gate_1", "approve")
  })

  it("requires an inline confirmation before emitting reject", () => {
    const onAction = vi.fn()
    render(<A2UISurfaceView surface={surface([ALL_COMPONENTS[3]])} onApprovalAction={onAction} />)
    fireEvent.click(screen.getByRole("button", { name: /^reject/i }))
    expect(onAction).not.toHaveBeenCalled()
    // Cancel backs out without a decision
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: /^reject/i }))
    fireEvent.click(screen.getByRole("button", { name: /confirm reject/i }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(onAction).toHaveBeenCalledWith("gate_1", "reject")
  })

  it("renders approval actions as Ember Night pills (primary / secondary / error-tonal / ghost)", () => {
    const onAction = vi.fn()
    const { container } = render(
      <A2UISurfaceView surface={surface([ALL_COMPONENTS[3]])} onApprovalAction={onAction} />
    )
    const card = container.querySelector('[data-a2ui="approval_card"]')
    expect(card).toHaveClass("rounded-[12px]", "border-border")
    expect(card).not.toHaveClass("border-warn/40")
    expect(screen.getByText("high risk")).toHaveClass("rounded-pill", "text-error")

    const approve = screen.getByRole("button", { name: "Approve pre_delivery_approval" })
    expect(approve).toHaveTextContent("Approve")
    expect(approve).toHaveClass("rounded-pill", "bg-ink")
    const reject = screen.getByRole("button", { name: "Reject pre_delivery_approval" })
    expect(reject).toHaveClass("rounded-pill", "bg-glass")
    expect(reject).not.toHaveClass("bg-base")

    fireEvent.click(reject)
    const group = screen.getByRole("group", { name: "Confirm rejection" })
    expect(group).toBeInTheDocument()
    const confirm = screen.getByRole("button", { name: "Confirm reject" })
    expect(confirm).toHaveClass("rounded-pill", "text-error", "border-error/30")
    expect(confirm).not.toHaveClass("text-accent")
    const cancel = screen.getByRole("button", { name: "Cancel" })
    expect(cancel).toHaveClass("rounded-pill", "bg-transparent", "text-muted")
    fireEvent.click(cancel)
    expect(screen.queryByRole("group", { name: "Confirm rejection" })).toBeNull()
    expect(onAction).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Reject pre_delivery_approval" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm reject" }))
    expect(onAction).toHaveBeenCalledWith("gate_1", "reject")
    fireEvent.click(screen.getByRole("button", { name: "Approve pre_delivery_approval" }))
    expect(onAction).toHaveBeenLastCalledWith("gate_1", "approve")
  })

  it("disables actions while pending, shows errors, and hides actions once resolved", () => {
    const onAction = vi.fn()
    const { rerender } = render(
      <A2UISurfaceView
        surface={surface([ALL_COMPONENTS[3]])}
        onApprovalAction={onAction}
        approvalState={{ gate_1: { pending: "approve" } }}
      />
    )
    const approve = screen.getByRole("button", { name: /^approve/i })
    expect(approve).toBeDisabled()
    expect(approve).toHaveTextContent("Approving…")
    expect(screen.getByRole("button", { name: /^reject/i })).toBeDisabled()
    fireEvent.click(approve)
    expect(onAction).not.toHaveBeenCalled()

    rerender(
      <A2UISurfaceView
        surface={surface([ALL_COMPONENTS[3]])}
        onApprovalAction={onAction}
        approvalState={{ gate_1: { error: "Approval gate already rejected" } }}
      />
    )
    expect(screen.getByRole("alert")).toHaveTextContent("Approval gate already rejected")
    expect(screen.getByRole("button", { name: /^approve/i })).toBeEnabled()

    rerender(
      <A2UISurfaceView
        surface={surface([ALL_COMPONENTS[3]])}
        onApprovalAction={onAction}
        approvalState={{ gate_1: { resolved: "approved" } }}
      />
    )
    expect(screen.getByRole("status")).toHaveTextContent("Approved")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("safeHttpUrl and parseA2UIComponent narrow untrusted input", () => {
    expect(safeHttpUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1")
    expect(safeHttpUrl(" javascript:alert(1)")).toBeNull()
    expect(safeHttpUrl("java\nscript:alert(1)")).toBeNull()
    expect(safeHttpUrl(42)).toBeNull()
    expect(
      parseA2UIComponent({ type: "status_list", items: [{ title: "x", status: "bogus" }] })
    ).toEqual({
      type: "status_list",
      items: [],
    })
    expect(
      parseA2UIComponent({ type: "cost_breakdown", currency: "EUR", total: 1, items: [] })
    ).toBeNull()
    expect(parseA2UIComponent(null)).toBeNull()
  })
})
