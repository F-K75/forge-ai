import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { useState, type ReactNode } from "react"
import { axe } from "vitest-axe"
import type { A2UIComponent, CompositeComponentProps, JsonObject } from "../../contracts"
import { CATALOG_COMPONENTS, validateComponent } from "../../validate"
import { setAt } from "../binding"
import { createRenderContext } from "../renderContext"
import {
  COMPOSITE_COMPONENT_NAMES,
  CORE_COMPONENT_NAMES,
  registerComposite,
  registeredComponentNames,
  resolveComponent,
} from "./index"
import { CORE_SAMPLES, type ComponentSample } from "./samples"

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- must match vitest's own declaration
  interface Assertion<T> {
    toHaveNoViolations(): void
  }
}

const AXE_OPTIONS = { rules: { "color-contrast": { enabled: false } } }

afterEach(cleanup)

// recharts' ResponsiveContainer needs ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

/** Minimal renderer: the real one is SurfaceView (tested separately). */
function Harness({ sample, onDispatch }: { sample: ComponentSample; onDispatch?: (...args: unknown[]) => void }) {
  const [model, setModel] = useState<JsonObject>(sample.dataModel ?? {})
  const byId = Object.fromEntries(sample.components.map((c) => [c.id, c]))
  const renderNode = (id: string, scope: string | null, key: string): ReactNode => {
    const node = byId[id] as A2UIComponent | undefined
    const entry = node ? resolveComponent(node.component) : null
    if (!node || !entry || entry.kind !== "core") return null
    const ctx = createRenderContext({
      surfaceId: "s",
      dataModel: model,
      scope,
      renderChild: renderNode,
      dispatch: (action, binding, extra, hint) => onDispatch?.(action, binding, extra, hint),
      write: (pointer, value) => setModel((m) => setAt(m, pointer, value)),
    })
    return <entry.Component key={key} node={node} ctx={ctx} />
  }
  return (
    <main>
      {renderNode("root", null, "root")}
      <output data-testid="model">{JSON.stringify(model)}</output>
    </main>
  )
}

const renderSample = (name: string, onDispatch?: (...args: unknown[]) => void) =>
  render(<Harness sample={CORE_SAMPLES[name]} onDispatch={onDispatch} />)

const model = () => JSON.parse(screen.getByTestId("model").textContent ?? "{}")

describe("registry coverage", () => {
  it("maps every core catalog component, and only catalog components", () => {
    expect(CORE_COMPONENT_NAMES).toHaveLength(31)
    for (const name of CORE_COMPONENT_NAMES) expect(resolveComponent(name)?.kind).toBe("core")
    expect(registeredComponentNames().every((n) => CATALOG_COMPONENTS.includes(n))).toBe(true)
    expect(CORE_COMPONENT_NAMES.length + COMPOSITE_COMPONENT_NAMES.length).toBe(CATALOG_COMPONENTS.length)
  })

  it("resolves unknown names to nothing (closed allowlist)", () => {
    for (const name of ["Script", "Iframe", "Html", "constructor", "__proto__", "toString"]) {
      expect(resolveComponent(name)).toBeNull()
    }
  })

  it("has a catalog-valid sample for every core component", () => {
    expect(Object.keys(CORE_SAMPLES).sort()).toEqual([...CORE_COMPONENT_NAMES].sort())
    for (const sample of Object.values(CORE_SAMPLES)) {
      for (const c of sample.components) expect(validateComponent(c).errors).toEqual([])
    }
  })

  it("registerComposite only accepts composite catalog names and can be undone", () => {
    expect(() => registerComposite("Button", () => null)).toThrow(/not a composite/)
    expect(() => registerComposite("Evil", () => null)).toThrow(/not a composite/)
    expect(resolveComponent("LivePreview")).toBeNull()
    const Live = (p: CompositeComponentProps) => <p>{String(p.props.projectId)}</p>
    const off = registerComposite("LivePreview", Live)
    expect(resolveComponent("LivePreview")).toMatchObject({ kind: "composite", Component: Live })
    off()
    expect(resolveComponent("LivePreview")).toBeNull()
  })
})

describe("registry components are accessible (vitest-axe)", () => {
  for (const name of Object.keys(CORE_SAMPLES)) {
    it(`${name} has no axe violations`, async () => {
      const { container } = renderSample(name)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
      })
      expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations()
    })
  }
})

describe("registry component behaviour", () => {
  it("Text resolves bindings and renders markdown without raw HTML", () => {
    renderSample("Text")
    expect(screen.getByText("Bound text")).toBeInTheDocument()
    cleanup()
    render(
      <Harness
        sample={{ components: [{ id: "root", component: "Text", format: "markdown", text: "**bold** <img src=x onerror=alert(1)> [x](javascript:alert(1))" }] }}
      />
    )
    expect(document.querySelector("img")).toBeNull()
    expect(document.querySelector("a")).toBeNull()
    expect(document.body.textContent).toContain("<img src=x onerror=alert(1)>")
  })

  it("Heading maps catalog level n to h(n+1)", () => {
    renderSample("Heading")
    expect(screen.getByRole("heading", { level: 3, name: "Sales by region" })).toBeInTheDocument()
  })

  it("Tabs switch with click and arrow keys", () => {
    renderSample("Tabs")
    const [first, second] = screen.getAllByRole("tab")
    expect(first).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("First panel")).toBeInTheDocument()
    fireEvent.keyDown(first, { key: "ArrowRight" })
    expect(second).toHaveAttribute("aria-selected", "true")
    expect(second).toHaveFocus()
    expect(screen.getByText("Second panel")).toBeInTheDocument()
    fireEvent.click(first)
    expect(screen.getByText("First panel")).toBeInTheDocument()
  })

  it("ProgressBar exposes progressbar semantics from bound values", () => {
    renderSample("ProgressBar")
    const bar = screen.getByRole("progressbar", { name: "Build" })
    expect(bar).toHaveAttribute("aria-valuenow", "4")
    expect(bar).toHaveAttribute("aria-valuemax", "10")
    expect(screen.getByText("40%")).toBeInTheDocument()
  })

  it("LinkList opens http(s) links safely and renders javascript: URLs as inert text", () => {
    render(
      <Harness
        sample={{
          components: [
            {
              id: "root",
              component: "LinkList",
              links: [
                { label: "Good", url: "https://example.com/a" },
                { label: "Evil", url: "javascript:alert(1)" },
                { label: "Data", url: "data:text/html,<script>alert(1)</script>" },
                { label: "Creds", url: "https://user:pw@example.com" },
              ],
            },
          ],
        }}
      />
    )
    const links = screen.getAllByRole("link")
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute("href", "https://example.com/a")
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer")
    expect(links[0]).toHaveAttribute("target", "_blank")
    for (const label of ["Evil", "Data", "Creds"]) expect(screen.getByText(label).closest("a")).toBeNull()
    expect(document.querySelector('[href^="javascript"]')).toBeNull()
  })

  it("DataTable sorts, formats, paginates and dispatches row actions", () => {
    const onDispatch = vi.fn()
    renderSample("DataTable", onDispatch)
    const rows = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent)
    expect(rows()).toEqual(["EMEA", "APAC", "AMER"])
    expect(screen.getByText("$1200.00")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Revenue/ }))
    expect(rows()).toEqual(["APAC", "EMEA", "AMER"])
    expect(screen.getByRole("columnheader", { name: /Revenue/ })).toHaveAttribute("aria-sort", "ascending")
    fireEvent.click(screen.getByRole("button", { name: /Revenue/ }))
    expect(rows()).toEqual(["AMER", "EMEA", "APAC"])
    fireEvent.click(screen.getByRole("button", { name: "Open AMER" }))
    expect(onDispatch).toHaveBeenCalledWith(
      { event: { name: "open_region" } },
      expect.anything(),
      { row: { region: "AMER", revenue: 1500, state: "failed" }, index: 0 },
      undefined
    )
  })

  it("DataTable paginates long data", () => {
    const rowsData = Array.from({ length: 12 }, (_, i) => ({ n: i }))
    render(
      <Harness
        sample={{
          components: [{ id: "root", component: "DataTable", columns: [{ key: "n", label: "N", type: "number" }], rows: { "@path": "/r" }, pageSize: 5 }],
          dataModel: { r: rowsData },
        }}
      />
    )
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument()
    expect(screen.getByText("5")).toBeInTheDocument()
  })

  it("Chart renders an accessible data table alongside the drawing", () => {
    renderSample("Chart")
    const table = screen.getByRole("table", { name: "Revenue" })
    expect(within(table).getByText("EMEA")).toBeInTheDocument()
    expect(within(table).getByText("1200")).toBeInTheDocument()
  })

  it("ComparisonTable marks the best value", () => {
    renderSample("ComparisonTable")
    expect(screen.getByText("(best)").parentElement).toHaveTextContent("3")
  })

  it("inputs write back to the data model", () => {
    renderSample("TextField")
    fireEvent.change(screen.getByLabelText("Agent name"), { target: { value: "Scout" } })
    expect(model()).toEqual({ form: { name: "Scout" } })
    cleanup()

    renderSample("Select")
    fireEvent.change(screen.getByLabelText("Model tier"), { target: { value: "best" } })
    expect(model().form.tier).toBe("best")
    cleanup()

    renderSample("Toggle")
    const sw = screen.getByRole("switch", { name: "Notify me" })
    fireEvent.click(sw)
    expect(model().form.notify).toBe(true)
    expect(sw).toHaveAttribute("aria-checked", "true")
    cleanup()

    renderSample("FilterBar")
    fireEvent.change(screen.getByLabelText("Region"), { target: { value: "emea" } })
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "acme" } })
    fireEvent.change(screen.getByLabelText("Revenue minimum"), { target: { value: "10" } })
    fireEvent.click(screen.getByRole("switch", { name: "Active only" }))
    expect(model().f).toEqual({ region: "emea", q: "acme", rev: { min: 10 }, active: true })
  })

  it("Button, Form and ApprovalCard dispatch their actions with hints", () => {
    const onDispatch = vi.fn()
    renderSample("Button", onDispatch)
    fireEvent.click(screen.getByRole("button", { name: "Run again" }))
    expect(onDispatch).toHaveBeenLastCalledWith(
      { event: { name: "rerun", context: { runId: "r1" } } },
      expect.anything(),
      undefined,
      { destructive: false, label: "Run again" }
    )
    cleanup()

    renderSample("Form", onDispatch)
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    expect(onDispatch.mock.lastCall?.[0]).toEqual({ event: { name: "create_agent", context: { name: { "@path": "/form/name" } } } })
    cleanup()

    renderSample("ApprovalCard", onDispatch)
    fireEvent.click(screen.getByRole("button", { name: "Approve" }))
    expect(onDispatch.mock.lastCall?.[2]).toEqual({ gateId: "g1" })
    expect(onDispatch.mock.lastCall?.[3]).toMatchObject({ riskLevel: "high" })
    fireEvent.click(screen.getByRole("button", { name: "Reject" }))
    expect(onDispatch.mock.lastCall?.[0]).toEqual({ event: { name: "reject_gate" } })
  })

  it("template children render one instance per item with item-scoped bindings", () => {
    render(
      <Harness
        sample={{
          components: [
            { id: "root", component: "Column", children: { componentId: "item", path: "/people" } },
            { id: "item", component: "Text", text: { "@path": "/name" } },
          ],
          dataModel: { people: [{ name: "Ada" }, { name: "Grace" }] },
        }}
      />
    )
    expect(screen.getByText("Ada")).toBeInTheDocument()
    expect(screen.getByText("Grace")).toBeInTheDocument()
  })
})
