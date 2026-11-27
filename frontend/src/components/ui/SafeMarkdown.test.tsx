import { describe, it, expect, afterEach } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SafeMarkdown } from "./SafeMarkdown"
import { extractHeadings, safeHref } from "./markdown"

afterEach(cleanup)

function md(source: string, props: Partial<Parameters<typeof SafeMarkdown>[0]> = {}) {
  return render(
    <MemoryRouter>
      <SafeMarkdown source={source} {...props} />
    </MemoryRouter>
  )
}

describe("safeHref", () => {
  it.each(["https://forge.ai/x", "http://a.b", "mailto:privacy@forge.ai", "/docs", "#top", "./a.md", "../b.md", "c.md"])(
    "allows %s",
    (href) => expect(safeHref(href)).toBe(href)
  )

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example/x",
  ])("rejects %s", (href) => expect(safeHref(href)).toBeNull())
})

describe("SafeMarkdown links", () => {
  it("renders links as plain text by default", () => {
    md("See [the docs](https://forge.ai/docs).")
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(screen.getByText(/the docs/)).toBeInTheDocument()
  })

  it("renders javascript: links inert even with links on", () => {
    const { container } = md("Click [me](javascript:alert(1)) and [this](JAVASCRIPT:void(0)).", { links: true })
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
    expect(container.querySelector("a")).toBeNull()
    expect(container.innerHTML).not.toMatch(/javascript:/i)
    expect(screen.getByText("me")).toBeInTheDocument()
  })

  it("opens external links in a new tab without opener", () => {
    md("[Forge](https://forge.ai)", { links: true })
    const a = screen.getByRole("link", { name: "Forge" })
    expect(a).toHaveAttribute("href", "https://forge.ai")
    expect(a).toHaveAttribute("target", "_blank")
    expect(a).toHaveAttribute("rel", "noopener noreferrer")
  })

  it("keeps mailto and relative links, routed through resolveLink", () => {
    md("[Mail](mailto:legal@forge.ai) [API](API_REFERENCE.md) [Gone](../SECRET.md)", {
      links: true,
      resolveLink: (h) => (h === "API_REFERENCE.md" ? "/docs/api-reference" : h.startsWith("mailto:") ? h : null),
    })
    expect(screen.getByRole("link", { name: "Mail" })).toHaveAttribute("href", "mailto:legal@forge.ai")
    expect(screen.getByRole("link", { name: "API" })).toHaveAttribute("href", "/docs/api-reference")
    expect(screen.queryByRole("link", { name: "Gone" })).not.toBeInTheDocument()
    expect(screen.getByText("Gone")).toBeInTheDocument()
  })

  it("shows raw HTML as literal text", () => {
    const { container } = md('<img src=x onerror="alert(1)"> <script>alert(1)</script>', { links: true })
    expect(container.querySelector("img, script")).toBeNull()
    expect(container).toHaveTextContent("<script>alert(1)</script>")
  })
})

describe("SafeMarkdown blocks", () => {
  it("renders tables, keeping pipes inside code spans", () => {
    md("| Method | Path |\n|---|---|\n| POST | `/reviews` — `\"full\"|\"diff\"` |\n| GET | `/x` |")
    const table = screen.getByRole("table")
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["Method", "Path"])
    expect(screen.getAllByRole("row")).toHaveLength(3)
    expect(table).toHaveTextContent('"full"|"diff"')
  })

  it("renders horizontal rules", () => {
    const { container } = md("Above\n\n---\n\nBelow")
    expect(container.querySelector("hr")).not.toBeNull()
  })

  it("gives prose headings ids that match extractHeadings", () => {
    const src = "## 1. Introduction\n\ntext\n\n### Sub `code`\n\n## Contact\n\n## Contact"
    md(src, { variant: "prose" })
    const ids = extractHeadings(src).map((h) => h.id)
    expect(ids).toEqual(["1-introduction", "sub-code", "contact", "contact-2"])
    expect(screen.getByRole("heading", { level: 2, name: "1. Introduction" })).toHaveAttribute("id", "1-introduction")
    expect(screen.getByRole("heading", { level: 3, name: "Sub code" })).toHaveAttribute("id", "sub-code")
    expect(document.getElementById("contact-2")).not.toBeNull()
  })

  it("keeps the compact variant's h3/h4 mapping", () => {
    md("## Title\n\n### Sub")
    expect(screen.getByRole("heading", { level: 3, name: "Title" })).not.toHaveAttribute("id")
    expect(screen.getByRole("heading", { level: 4, name: "Sub" })).toBeInTheDocument()
  })
})
