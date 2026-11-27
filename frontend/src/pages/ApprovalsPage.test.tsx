import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react"
import ApprovalsPage from "./ApprovalsPage"
import { renderWithProviders } from "../test/renderWithProviders"
import { gateTitle, resetApprovalsDemoState } from "../lib/approvalsData"

beforeEach(resetApprovalsDemoState)
afterEach(cleanup)

async function renderPage() {
  renderWithProviders(<ApprovalsPage />, { route: "/approvals" })
  return screen.findByRole("list", { name: "Pending gates" })
}

describe("ApprovalsPage (demo mode)", () => {
  it("lists pending gates across projects with the first one open in the detail pane", async () => {
    const list = await renderPage()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Approvals. Decisions only you can make.")
    expect(within(list).getAllByRole("listitem")).toHaveLength(3)
    expect(within(list).getByText("Analytics pipeline", { exact: false })).toBeInTheDocument()
    const detail = screen.getByRole("article")
    expect(within(detail).getByRole("heading", { name: "Security review approval" })).toBeInTheDocument()
    expect((await within(detail).findByRole("button", { name: "Approve security_review_approval" }))).toBeInTheDocument()
  })

  it("filters by project and switches to decided history with who/when", async () => {
    await renderPage()
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "proj-analytics" } })
    expect(within(screen.getByRole("list", { name: "Pending gates" })).getAllByRole("listitem")).toHaveLength(1)

    fireEvent.click(screen.getByRole("tab", { name: /Decided/ }))
    const decided = screen.getByRole("list", { name: "Decided gates" })
    expect(within(decided).getAllByRole("listitem")).toHaveLength(1)
    expect(within(decided).getByText("by omar@forge.dev")).toBeInTheDocument()
    const record = await screen.findByRole("region", { name: "Decision record" })
    expect(record).toHaveTextContent("rejected by omar@forge.dev")
    expect(record).toHaveTextContent("Migrate the dashboards first.")
  })

  it("approves a gate and moves it out of the pending list", async () => {
    await renderPage()
    const detail = screen.getByRole("article")
    fireEvent.click((await within(detail).findByRole("button", { name: "Approve security_review_approval" })))
    expect(await within(detail).findByText("Approving…")).toBeInTheDocument()
    expect(await within(detail).findByText("Approved", { selector: "p" })).toBeInTheDocument()
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Pending gates" })).getAllByRole("listitem")).toHaveLength(2))
  })

  it("asks for confirmation before rejecting", async () => {
    await renderPage()
    const detail = screen.getByRole("article")
    fireEvent.click((await within(detail).findByRole("button", { name: "Reject security_review_approval" })))
    const confirm = within(detail).getByRole("group", { name: "Confirm rejection" })
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }))
    expect(within(detail).queryByRole("group", { name: "Confirm rejection" })).not.toBeInTheDocument()
  })

  it("shows the calm empty state once nothing is pending", async () => {
    await renderPage()
    for (let i = 0; i < 3; i++) {
      const detail = screen.getByRole("article")
      const approve = await within(detail).findByRole("button", { name: /^Approve / })
      fireEvent.click(approve)
      await within(detail).findByText("Approved", { selector: "p" })
      if (i < 2) {
        await waitFor(() => expect(within(screen.getByRole("list", { name: "Pending gates" })).getAllByRole("listitem")).toHaveLength(2 - i))
        fireEvent.click(within(screen.getByRole("list", { name: "Pending gates" })).getAllByRole("button")[0])
      } else {
        // The just-decided gate stays open to show its outcome until you navigate away.
        await waitFor(() => expect(screen.getByRole("tab", { name: /Pending/ })).toHaveTextContent("Pending0"))
        expect(screen.getByRole("article")).toBeInTheDocument()
        fireEvent.click(screen.getByRole("tab", { name: /Decided/ }))
        fireEvent.click(screen.getByRole("tab", { name: /Pending/ }))
      }
    }
    expect(await screen.findByText("Nothing needs you right now.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /View 6 past decisions/ })).toBeInTheDocument()
  })

  it("humanises gate names", () => {
    expect(gateTitle("pre_delivery_approval")).toBe("Pre-delivery approval")
  })
})
