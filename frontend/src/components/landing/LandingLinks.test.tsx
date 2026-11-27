import { describe, it, expect, afterEach } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { LandingNav } from "./LandingNav"
import { LandingFooter } from "./LandingFooter"
import { footerColumns } from "./footerLinks"

afterEach(cleanup)

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LandingNav />
      <LandingFooter />
    </MemoryRouter>
  )
}

const PROTECTED = ["/demo", "/command", "/skills", "/protocols"]

describe("landing nav and footer links", () => {
  it("points Docs at the public /docs page, not GitHub", () => {
    renderAt("/home")
    const nav = screen.getByRole("navigation", { name: "Primary" })
    expect(within(nav).getByRole("link", { name: "Docs" })).toHaveAttribute("href", "/docs")
    expect(document.querySelector('a[href*="github.com"]')).toBeNull()
  })

  it("has a Legal column with Privacy and Terms", () => {
    renderAt("/home")
    const legal = screen.getByRole("navigation", { name: "Legal" })
    expect(within(legal).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy")
    expect(within(legal).getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms")
    const resources = screen.getByRole("navigation", { name: "Resources" })
    expect(within(resources).getByRole("link", { name: "Documentation" })).toHaveAttribute("href", "/docs")
    expect(within(resources).getByRole("link", { name: "Protocols" })).toHaveAttribute("href", "/docs/protocols")
  })

  it("keeps section links as in-page anchors on the landing page", () => {
    renderAt("/home")
    const nav = screen.getByRole("navigation", { name: "Primary" })
    expect(within(nav).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "#pricing")
    const product = screen.getByRole("navigation", { name: "Product" })
    expect(within(product).getByRole("link", { name: "How it works" })).toHaveAttribute("href", "#product")
  })

  it("sends section links back to the landing page from other public pages", () => {
    renderAt("/privacy")
    const nav = screen.getByRole("navigation", { name: "Primary" })
    expect(within(nav).getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/home#pricing")
    const resources = screen.getByRole("navigation", { name: "Resources" })
    expect(within(resources).getByRole("link", { name: "FAQ" })).toHaveAttribute("href", "/home#faq")
  })

  it("marks Docs as current on doc pages", () => {
    renderAt("/docs/architecture")
    const nav = screen.getByRole("navigation", { name: "Primary" })
    expect(within(nav).getByRole("link", { name: "Docs" })).toHaveAttribute("aria-current", "page")
  })

  it("with a real backend, never links logged-out visitors into sign-in-only routes", () => {
    const links = footerColumns(true).flatMap((c) => c.links)
    for (const l of links) expect(PROTECTED).not.toContain(l.to)
    expect(links.filter((l) => l.to === "/login").map((l) => l.label)).toEqual([
      "Sign in to try it",
      "Sign in for skills",
      "Sign in",
    ])
  })

  it("in the mock-data demo, keeps the open demo and skills catalogue", () => {
    const links = footerColumns(false).flatMap((c) => c.links)
    expect(links).toContainEqual({ label: "Live demo", to: "/demo" })
    expect(links).toContainEqual({ label: "Skills catalogue", to: "/skills" })
    expect(links.map((l) => l.to)).not.toContain("/protocols")
  })
})
