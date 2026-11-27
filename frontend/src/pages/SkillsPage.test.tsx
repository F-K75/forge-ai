import { afterEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react"
import SkillsPage from "./SkillsPage"
import { renderWithProviders } from "../test/renderWithProviders"
import { previewRoute, keywordMatches } from "../lib/skillRouterPreview"
import { DEMO_SKILL_CATALOG } from "../lib/demo/skillsDemo"

afterEach(cleanup)

async function renderPage() {
  renderWithProviders(<SkillsPage />, { route: "/skills" })
  return screen.findByRole("list", { name: "Skills" })
}

describe("SkillsPage (demo mode)", () => {
  it("renders the hero, stats and the full 40-skill catalogue", async () => {
    const list = await renderPage()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Skills. What your agents know how to do.")
    expect(within(list).getAllByRole("listitem")).toHaveLength(40)
    expect(screen.getByText("Total skills").closest("div")?.parentElement).toHaveTextContent("40")
    expect(screen.getByRole("tab", { name: /All/ })).toHaveAttribute("aria-selected", "true")
  })

  it("filters by domain pill and by search", async () => {
    const list = await renderPage()
    fireEvent.click(screen.getByRole("tab", { name: /^Security/ }))
    expect(within(list).getAllByRole("listitem")).toHaveLength(5)
    expect(screen.getByRole("tab", { name: /^Security/ })).toHaveAttribute("aria-selected", "true")

    fireEvent.click(screen.getByRole("tab", { name: /^All/ }))
    fireEvent.change(screen.getByRole("searchbox", { name: "Search skills" }), { target: { value: "kubernetes" } })
    expect(within(screen.getByRole("list", { name: "Skills" })).getAllByRole("listitem")).toHaveLength(1)
    expect(screen.getByRole("button", { name: /Container K8s Delivery/ })).toBeInTheDocument()
  })

  it("shows a calm empty state and clears filters", async () => {
    await renderPage()
    fireEvent.change(screen.getByRole("searchbox", { name: "Search skills" }), { target: { value: "zzz-nothing" } })
    expect(screen.getByText("No skills match")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(within(screen.getByRole("list", { name: "Skills" })).getAllByRole("listitem")).toHaveLength(40)
  })

  it("supports arrow-key navigation in the domain control", async () => {
    await renderPage()
    const all = screen.getByRole("tab", { name: /^All/ })
    all.focus()
    fireEvent.keyDown(all, { key: "ArrowRight" })
    expect(screen.getByRole("tab", { name: /^Software/ })).toHaveAttribute("aria-selected", "true")
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /^Software/ }))
  })

  it("opens the drawer with instructions, dependency chain and permissions, and closes on Escape", async () => {
    await renderPage()
    fireEvent.click(screen.getByRole("button", { name: /^API Hardening:/ }))
    const dialog = await screen.findByRole("dialog", { name: "API Hardening" })
    await within(dialog).findByText("Checklist")
    expect(within(dialog).getByRole("list", { name: "Load order" })).toHaveTextContent("Fullstack Architecture")
    expect(within(dialog).getByText("write_code")).toBeInTheDocument()
    expect(within(dialog).getByText("Routing boost")).toBeInTheDocument()
    // Raw HTML is never injected
    expect(dialog.querySelector("script")).toBeNull()
    fireEvent.keyDown(window, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("routes a task in preview mode", async () => {
    await renderPage()
    const box = screen.getByRole("region", { name: "Route a task" })
    expect(within(box).getByText("Preview")).toBeInTheDocument()
    fireEvent.change(within(box).getByLabelText("Task"), {
      target: { value: "Add validation and pagination to the FastAPI endpoints" },
    })
    fireEvent.click(within(box).getByRole("button", { name: /Route/ }))
    const results = await within(box).findByRole("list", { name: "Activated skills" })
    expect(within(results).getByRole("button", { name: "API Hardening" })).toBeInTheDocument()
  })
})

describe("skill router preview mirrors the engine", () => {
  it("matches short keywords as whole words only", () => {
    expect(keywordMatches("ui", "build the ui layer")).toBe(true)
    expect(keywordMatches("ui", "build pipeline")).toBe(false)
    expect(keywordMatches("monetiz", "monetization plan")).toBe(true)
  })

  it("respects department permissions and resolves dependencies", () => {
    const acts = previewRoute(DEMO_SKILL_CATALOG, {
      role: "backend_engineer",
      department: "engineering",
      objective: "harden the fastapi endpoint validation",
      topK: 3,
    })
    const api = acts.find((a) => a.skill_name === "api-hardening")
    expect(api?.resolved_dependencies).toEqual(["fullstack-architecture"])
    const sec = previewRoute(DEMO_SKILL_CATALOG, { role: "designer", department: "design", objective: "security audit", topK: 8 })
    expect(sec.find((a) => a.skill_name === "security-threat-audit")).toBeUndefined()
  })
})
