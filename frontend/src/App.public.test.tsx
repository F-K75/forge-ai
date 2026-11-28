import { describe, expect, it, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, within } from "@testing-library/react"

// LIVE_MODE: a real backend, so ProtectedRoute would bounce logged-out
// visitors to /login. The legal and docs pages must not.
vi.mock("./lib/env", () => ({
  LIVE_MODE: true,
  IS_PUBLIC_DEMO: false,
  PUBLIC_DEMO_APP_URL: "",
  // Classic shell: these tests cover the flag-off routing (os-shell tests cover /os).
  OS_SHELL_ENABLED: false,
}))

vi.mock("./components/GlobalBackground", () => ({ default: () => null }))
vi.mock("./components/DemoBanner", () => ({ DemoBanner: () => null }))
vi.mock("./components/AppShell", () => ({ default: () => <div data-testid="app-shell" /> }))

import App from "./App"
import { useAuthStore } from "./store/authStore"
import { PUBLIC_DOCS } from "./content"

describe("public legal and docs routes (logged out)", () => {
  let fetchMe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMe = vi.fn().mockRejectedValue(new Error("401"))
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false, fetchMe } as never)
  })

  afterEach(cleanup)

  const cases: Array<[string, RegExp]> = [
    ["/privacy", /Privacy Policy\. What we collect and why\./],
    ["/terms", /Terms of Service\. The rules for using Forge\./],
    ["/docs", /Documentation\. How Forge works, in depth\./],
    ...PUBLIC_DOCS.map((d): [string, RegExp] => [`/docs/${d.slug}`, new RegExp(d.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))]),
  ]

  it.each(cases)("renders %s without signing in", async (path, title) => {
    window.history.pushState({}, "", path)
    render(<App />)
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument()
    expect(window.location.pathname).toBe(path)
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument()
    expect(fetchMe).not.toHaveBeenCalled()
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument()
    expect(screen.getByRole("contentinfo")).toBeInTheDocument()
  })

  it("shows the document's Last updated date and a TOC on /privacy", async () => {
    window.history.pushState({}, "", "/privacy")
    render(<App />)
    await screen.findByRole("heading", { level: 1 })
    expect(screen.getByText("July 18, 2026").tagName).toBe("TIME")
    const tocs = screen.getAllByRole("navigation", { name: "On this page" })
    const link = within(tocs[0]).getByRole("link", { name: "2. Information We Collect" })
    expect(link).toHaveAttribute("href", "#2-information-we-collect")
    expect(document.getElementById("2-information-we-collect")?.tagName).toBe("H2")
    expect(screen.getByRole("table")).toBeInTheDocument()
  })

  it("lists every public doc on /docs with a left nav", async () => {
    window.history.pushState({}, "", "/docs")
    render(<App />)
    await screen.findByRole("heading", { level: 1 })
    const main = screen.getByRole("main")
    for (const d of PUBLIC_DOCS) {
      expect(within(main).getAllByRole("link", { name: new RegExp(d.title.replace(/\.$/, "")) })[0]).toHaveAttribute(
        "href",
        `/docs/${d.slug}`
      )
    }
    const side = screen.getByRole("navigation", { name: "Documentation" })
    expect(within(side).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page")
  })

  it("shows a not-found state for an unknown doc", async () => {
    window.history.pushState({}, "", "/docs/secrets")
    render(<App />)
    expect(await screen.findByRole("heading", { level: 1, name: /Page not found/ })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /All docs/ })).toHaveAttribute("href", "/docs")
  })
})
