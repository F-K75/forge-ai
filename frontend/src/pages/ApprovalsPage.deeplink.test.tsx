import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { useLocation } from "react-router-dom"
import ApprovalsPage from "./ApprovalsPage"
import { renderWithProviders } from "../test/renderWithProviders"
import { resetApprovalsDemoState } from "../lib/approvalsData"

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

const scrollIntoView = vi.fn()
const originalScroll = Element.prototype.scrollIntoView
const originalMatchMedia = window.matchMedia

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  resetApprovalsDemoState()
  scrollIntoView.mockReset()
  Element.prototype.scrollIntoView = scrollIntoView
  mockReducedMotion(false)
})
afterEach(() => {
  cleanup()
  Element.prototype.scrollIntoView = originalScroll
  window.matchMedia = originalMatchMedia
})

function renderAt(route: string) {
  renderWithProviders(
    <>
      <ApprovalsPage />
      <LocationProbe />
    </>,
    { route }
  )
}

const location = () => screen.getByTestId("location").textContent

describe("ApprovalsPage deep links (?gate=)", () => {
  it("selects, highlights and scrolls to a pending gate", async () => {
    renderAt("/approvals?gate=gate_budget_52aa")
    const detail = await screen.findByRole("article")
    expect(within(detail).getByRole("heading", { name: "Budget overrun approval" })).toBeInTheDocument()

    const list = screen.getByRole("list", { name: "Pending gates" })
    const row = within(list).getByText("Budget overrun approval").closest("button")!
    expect(row).toHaveAttribute("aria-current", "true")
    expect(row).toHaveAttribute("data-highlighted", "true")
    expect(row.className).toContain("ring-accent/35")
    expect(row.className).toContain("motion-reduce:transition-none")
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" }))
    expect(screen.queryByText("That approval is no longer available")).not.toBeInTheDocument()
    expect(location()).toBe("/approvals?gate=gate_budget_52aa")
  })

  it("fades the highlight after a moment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      renderAt("/approvals?gate=gate_budget_52aa")
      await screen.findByRole("article")
      const row = within(screen.getByRole("list", { name: "Pending gates" })).getByText("Budget overrun approval").closest("button")!
      expect(row).toHaveAttribute("data-highlighted", "true")
      await vi.advanceTimersByTimeAsync(3000)
      await waitFor(() => expect(row).not.toHaveAttribute("data-highlighted"))
      expect(row).toHaveAttribute("aria-current", "true")
    } finally {
      vi.useRealTimers()
    }
  })

  it("scrolls without smooth motion when the user prefers reduced motion", async () => {
    mockReducedMotion(true)
    renderAt("/approvals?gate=gate_budget_52aa")
    await screen.findByRole("article")
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "center" }))
  })

  it("switches to the Decided filter when the gate was already decided", async () => {
    renderAt("/approvals?gate=gate_destructive_4f1c")
    const decided = await screen.findByRole("list", { name: "Decided gates" })
    expect(screen.getByRole("tab", { name: /Decided/ })).toHaveAttribute("aria-selected", "true")
    const row = within(decided).getByText("Destructive change approval").closest("button")!
    expect(row).toHaveAttribute("aria-current", "true")
    expect(row).toHaveAttribute("data-highlighted", "true")
    const detail = screen.getByRole("article")
    expect(within(detail).getByRole("heading", { name: "Destructive change approval" })).toBeInTheDocument()
    expect(await screen.findByRole("region", { name: "Decision record" })).toHaveTextContent("rejected by omar@forge.dev")
    expect(screen.queryByText("That approval is no longer available")).not.toBeInTheDocument()
  })

  it("shows a calm notice and the first pending gate when the gate is unknown", async () => {
    renderAt("/approvals?gate=gate_does_not_exist")
    expect(await screen.findByText("That approval is no longer available")).toBeInTheDocument()
    const notice = screen.getByText("That approval is no longer available").closest("[role]")!
    expect(notice).toHaveAttribute("role", "status")
    expect(notice).toHaveTextContent("Showing the oldest pending gate instead.")

    const detail = screen.getByRole("article")
    expect(within(detail).getByRole("heading", { name: "Security review approval" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: /Pending/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByRole("button", { current: true })).toHaveAttribute("aria-current", "true")
    expect(document.querySelector("[data-highlighted]")).toBeNull()
    await waitFor(() => expect(location()).toBe("/approvals"))

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(screen.queryByText("That approval is no longer available")).not.toBeInTheDocument()
  })

  it("keeps ?gate= in sync (replace) when the user picks another gate", async () => {
    renderAt("/approvals?gate=gate_budget_52aa")
    const list = await screen.findByRole("list", { name: "Pending gates" })
    fireEvent.click(within(list).getByText("Pre-delivery approval").closest("button")!)
    await waitFor(() => expect(location()).toBe("/approvals?gate=gate_delivery_7c41"))
    expect(within(screen.getByRole("article")).getByRole("heading", { name: "Pre-delivery approval" })).toBeInTheDocument()

    // Switching to Decided moves the selection, and the URL follows it.
    fireEvent.click(screen.getByRole("tab", { name: /Decided/ }))
    await waitFor(() => expect(location()).not.toBe("/approvals?gate=gate_delivery_7c41"))
    const decidedSelected = within(screen.getByRole("list", { name: "Decided gates" })).getByRole("button", { current: true })
    expect(location()).toBe(`/approvals?gate=${decidedSelected.getAttribute("data-gate-id")}`)
  })

  it("adds ?gate= on click from a plain /approvals visit", async () => {
    renderAt("/approvals")
    const list = await screen.findByRole("list", { name: "Pending gates" })
    expect(location()).toBe("/approvals")
    fireEvent.click(within(list).getByText("Budget overrun approval").closest("button")!)
    await waitFor(() => expect(location()).toBe("/approvals?gate=gate_budget_52aa"))
  })
})
