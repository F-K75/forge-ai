import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { axe } from "vitest-axe"
import type { CapabilityRendererProps, CompositeComponentProps } from "../contracts"
import { getStaticCapability } from "./catalog"
import { registerWsDComposites, WS_D_COMPOSITES } from "./composites"
import AgentConfigForm from "./composites/AgentConfigForm"
import CapabilityLauncher from "./composites/CapabilityLauncher"
import ProjectGrid from "./composites/ProjectGrid"
import { CapabilityLaunchContext } from "./composites/launch"
import { getLocalComposite } from "./composites/registry"
import { toWorkflowGraph } from "./composites/WorkflowCanvas"
import { CAPABILITY_RENDERERS, RouteScoped } from "./renderers"
import { useIsEmbedded } from "./embedding"
import { useCapabilities } from "./useCapabilities"
import { renderHook } from "@testing-library/react"

function compositeProps<P extends Record<string, unknown>>(props: P, overrides: Partial<CompositeComponentProps<P>> = {}): CompositeComponentProps<P> {
  return { surfaceId: "srf_1", componentId: "c1", props, dispatch: vi.fn(), write: vi.fn(), ...overrides }
}

function withProviders(ui: React.ReactElement, route = "/os") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe("registerWsDComposites", () => {
  it("registers all six WS-D composites through the (swappable) register function", () => {
    const register = vi.fn()
    registerWsDComposites(register)
    expect(register.mock.calls.map((c) => c[0]).sort()).toEqual([...WS_D_COMPOSITES].sort())
    registerWsDComposites()
    for (const name of WS_D_COMPOSITES) expect(getLocalComposite(name)).toBeTypeOf("function")
  })
})

describe("ProjectGrid", () => {
  it("renders cards and dispatches open with the project id", async () => {
    const props = compositeProps({ items: [{ id: "p1", name: "Bakery" }, { bogus: true }], open: { event: { name: "projects.manage.open" } } })
    const { container } = withProviders(<ProjectGrid {...props} />)
    fireEvent.click(screen.getByRole("button", { name: /Bakery/ }))
    expect(props.dispatch).toHaveBeenCalledWith("open", { project_id: "p1" })
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(await axe(container)).toHaveNoViolations()
  })

  it("shows an empty state", () => {
    withProviders(<ProjectGrid {...compositeProps({ items: [] })} />)
    expect(screen.getByText("No projects yet")).toBeInTheDocument()
  })
})

describe("AgentConfigForm", () => {
  it("submits the config and writes edits back to the bound path", async () => {
    const props = compositeProps({ value: { "@path": "/agent" }, submit: { event: { name: "agents.create.create" } } })
    const { container } = withProviders(<AgentConfigForm {...props} />)
    const submit = screen.getByRole("button", { name: "Create agent" })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "bug_triager" } })
    fireEvent.change(screen.getByLabelText("Skills (comma separated)"), { target: { value: "triage, github" } })
    expect(props.write).toHaveBeenLastCalledWith({ "@path": "/agent" }, expect.objectContaining({ role: "bug_triager", skills: ["triage", "github"] }))
    fireEvent.click(submit)
    expect(props.dispatch).toHaveBeenCalledWith("submit", expect.objectContaining({ role: "bug_triager", department: "engineering" }))
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe("CapabilityLauncher", () => {
  it("uses the shell's launcher when provided", () => {
    const launch = vi.fn()
    withProviders(
      <CapabilityLaunchContext.Provider value={launch}>
        <CapabilityLauncher {...compositeProps({ capabilityId: "models.compare", label: "Compare models" })} />
      </CapabilityLaunchContext.Provider>
    )
    fireEvent.click(screen.getByRole("button", { name: /Compare models/ }))
    expect(launch).toHaveBeenCalledWith("models.compare", {})
  })

  it("falls back to the legacy route, and is disabled when there is none", () => {
    withProviders(
      <Routes>
        <Route path="/os" element={<CapabilityLauncher {...compositeProps({ capabilityId: "projects.manage", label: "Projects" })} />} />
        <Route path="/projects" element={<p>projects page</p>} />
      </Routes>
    )
    fireEvent.click(screen.getByRole("button", { name: /Projects/ }))
    expect(screen.getByText("projects page")).toBeInTheDocument()
  })

  it("is disabled for an unknown capability without a launcher", () => {
    withProviders(<CapabilityLauncher {...compositeProps({ capabilityId: "nope.nothing", label: "Nothing" })} />)
    expect(screen.getByRole("button", { name: /Nothing/ })).toBeDisabled()
  })
})

describe("WorkflowCanvas graph", () => {
  it("serialises reactflow state back to the workflow.design graph shape", () => {
    const graph = toWorkflowGraph(
      [{ id: "a", position: { x: 10.4, y: 20.6 }, data: { label: "Design", role: "designer" } }],
      [{ id: "a->b", source: "a", target: "b" }]
    )
    expect(graph).toEqual({
      nodes: [{ id: "a", title: "Design", role: "designer", position: { x: 10, y: 21 } }],
      edges: [{ id: "a->b", source: "a", target: "b" }],
    })
  })
})

describe("renderers", () => {
  function rendererProps(id: string, params: Record<string, unknown> = {}, projectId: string | null = null): CapabilityRendererProps {
    return { capability: getStaticCapability(id)!, windowId: "w1", presentation: "window", params, projectId, sessionId: null, setTitle: vi.fn(), close: vi.fn() }
  }

  it("RouteScoped gives a page its own route params inside the shell router", () => {
    function Probe() {
      const { projectId } = useParams()
      return <p>{`project ${projectId} embedded ${String(useIsEmbedded())}`}</p>
    }
    withProviders(
      <RouteScoped pattern="/p/:projectId/files" location="/p/abc/files">
        <Probe />
      </RouteScoped>
    )
    expect(screen.getByText("project abc embedded false")).toBeInTheDocument()
  })

  it("project-scoped renderers ask for a project instead of crashing", async () => {
    const Renderer = CAPABILITY_RENDERERS["pages.WorkspacePage"]
    withProviders(<Renderer {...rendererProps("build.workspace")} />)
    expect(await screen.findByText("Pick a project first")).toBeInTheDocument()
  })

  it("admin console renderers refuse non-admins", async () => {
    const Renderer = CAPABILITY_RENDERERS["admin.Console.llm"]
    const { useAuthStore } = await import("../../store/authStore")
    const prev = useAuthStore.getState().user
    useAuthStore.setState({ user: prev ? { ...prev, is_admin: false } : null })
    withProviders(<Renderer {...rendererProps("models.admin")} />)
    expect(await screen.findByRole("alert")).toHaveTextContent(/admin accounts/)
    useAuthStore.setState({ user: prev })
  })

  it("renders a settings panel as an embedded capability", async () => {
    const Renderer = CAPABILITY_RENDERERS["settings.SupportTab"]
    const { container } = withProviders(<Renderer {...rendererProps("account.support")} />)
    // Wait for the lazily loaded panel itself (not the "Opening…" skeleton).
    expect(await screen.findByRole("heading", { level: 2 }, { timeout: 5000 })).toBeInTheDocument()
    expect(container.querySelector("[data-os-embedded='true'] h2")).not.toBeNull()
  })
})

describe("useCapabilities", () => {
  it("serves the static catalog without a backend (demo mode)", () => {
    const client = new QueryClient()
    const { result } = renderHook(() => useCapabilities(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    })
    expect(result.current.source).toBe("static")
    expect(result.current.get("models.compare")?.title).toBe("Compare models")
    expect(result.current.capabilities.length).toBeGreaterThan(60)
  })
})
