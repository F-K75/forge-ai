import { describe, expect, it, vi, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"

// Live mode: the gate only applies with a real backend.
vi.mock("./lib/env", () => ({ LIVE_MODE: true }))
// Stand-in for the real admin page so the test doesn't hit admin APIs.
vi.mock("./pages/AdminConsole", () => ({ default: () => <div>Admin console page</div> }))

import App from "./App"
import { useAuthStore } from "./store/authStore"

function renderAdminConsoleAs(user: Record<string, unknown>) {
  window.history.pushState({}, "", "/admin-console")
  useAuthStore.setState({
    user: user as never,
    isAuthenticated: true,
    isLoading: false,
    fetchMe: async () => {},
  } as never)
  return render(<App />)
}

afterEach(() => cleanup())

describe("AdminRoute", () => {
  it("asks an admin without MFA to enable it instead of loading admin pages", async () => {
    renderAdminConsoleAs({ id: "u1", email: "a@b.c", name: "A", is_admin: true, mfa_enabled: false })

    expect(await screen.findByText(/turn on two-factor authentication/i)).toBeInTheDocument()
    const link = screen.getByRole("link", { name: /set up two-factor authentication/i })
    expect(link.getAttribute("href")).toBe("/settings#security")
    expect(screen.queryByText("Admin console page")).not.toBeInTheDocument()
  })

  it("lets an admin with MFA enabled through", async () => {
    renderAdminConsoleAs({ id: "u1", email: "a@b.c", name: "A", is_admin: true, mfa_enabled: true })

    expect(await screen.findByText("Admin console page")).toBeInTheDocument()
    expect(screen.queryByText(/turn on two-factor authentication/i)).not.toBeInTheDocument()
  })
})
