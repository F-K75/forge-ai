import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { axe } from "vitest-axe"
import { ConfirmDialogHost, requestConfirm } from "./ConfirmDialog"

const req = { surfaceId: "srf", componentId: "c1", actionName: "project.delete", label: "Delete project", riskLevel: "high", context: {} }

describe("ConfirmDialog (GenUIProvider confirm hook)", () => {
  afterEach(cleanup)

  it("resolves true only on the confirm button, with focus on Cancel", async () => {
    const { container } = render(<ConfirmDialogHost />)
    let p!: Promise<boolean>
    act(() => {
      p = Promise.resolve(requestConfirm(req))
    })
    const dialog = await screen.findByRole("alertdialog", { name: "Delete project?" })
    expect(document.activeElement).toHaveTextContent("Cancel")
    expect(await axe(container)).toHaveNoViolations()
    fireEvent.click(screen.getAllByRole("button", { name: "Delete project" }).at(-1)!)
    await expect(p).resolves.toBe(true)
    expect(dialog).not.toBeInTheDocument()
  })

  it("Escape declines", async () => {
    render(<ConfirmDialogHost />)
    let p!: Promise<boolean>
    act(() => {
      p = Promise.resolve(requestConfirm({ ...req, label: null, actionName: "run.cancel", riskLevel: null }))
    })
    await screen.findByRole("alertdialog", { name: "Cancel?" })
    fireEvent.keyDown(window, { key: "Escape" })
    await expect(p).resolves.toBe(false)
  })
})
