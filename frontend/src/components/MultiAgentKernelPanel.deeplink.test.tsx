import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MultiAgentKernelPanel } from "./MultiAgentKernelPanel"

const scrollIntoView = vi.fn()
const originalScroll = Element.prototype.scrollIntoView

beforeEach(() => {
  scrollIntoView.mockReset()
  Element.prototype.scrollIntoView = scrollIntoView
})
afterEach(() => {
  cleanup()
  Element.prototype.scrollIntoView = originalScroll
})

const board = () => screen.getByRole("region", { name: "Parallel Execution Waves" })
const runHeader = () => board().querySelector("[data-run-id]") as HTMLElement

describe("MultiAgentKernelPanel ?run= deep link (demo mode)", () => {
  it("opens the linked run, shows it in the inspector and highlights it", async () => {
    const onMissing = vi.fn()
    render(<MultiAgentKernelPanel projectId="demo-project" focusRunId="run-7f3a" onFocusRunMissing={onMissing} />)

    await waitFor(() => expect(runHeader()).toHaveAttribute("data-run-id", "run-7f3a"))
    expect(within(board()).getByText("run-7f3a")).toBeInTheDocument()
    expect(runHeader()).toHaveAttribute("data-highlighted", "true")
    expect(runHeader().className).toContain("ring-accent/35")
    expect(screen.getByLabelText("Engineering Objective")).toHaveValue(
      "Add SAML 2.0 SSO with Okta and Entra ID, plus SCIM user provisioning."
    )
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
    expect(screen.queryByText("That run is no longer available")).not.toBeInTheDocument()
    expect(onMissing).not.toHaveBeenCalled()

    // The inspector follows the active run: its A2UI surfaces are the linked run's.
    const inspector = screen.getByRole("region", { name: "Multi-Agent Collaboration Inspector" })
    fireEvent.click(within(inspector).getByRole("tab", { name: /Protocols/i }))
    await waitFor(() => expect(inspector.querySelector('[data-surface-id="a2ui_summary_run-7f3a"]')).not.toBeNull())
  })

  it("shows a calm notice when the run isn't in this project", async () => {
    const onMissing = vi.fn()
    // run-2c91 exists, but in proj-001, not demo-project.
    render(<MultiAgentKernelPanel projectId="demo-project" focusRunId="run-2c91" onFocusRunMissing={onMissing} />)

    const notice = (await screen.findByText("That run is no longer available")).closest("[role]")!
    expect(notice).toHaveAttribute("role", "status")
    expect(notice).toHaveTextContent("run-2c91")
    expect(onMissing).toHaveBeenCalledWith("run-2c91")
    expect(runHeader()).not.toHaveAttribute("data-run-id", "run-2c91")
    expect(runHeader()).not.toHaveAttribute("data-highlighted")

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(screen.queryByText("That run is no longer available")).not.toBeInTheDocument()
  })

  it("renders the default local plan without a ?run= link", () => {
    render(<MultiAgentKernelPanel projectId="demo-project" />)
    expect(runHeader()).not.toHaveAttribute("data-highlighted")
    expect(screen.queryByText("That run is no longer available")).not.toBeInTheDocument()
  })
})
