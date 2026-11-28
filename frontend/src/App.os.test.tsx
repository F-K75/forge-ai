import { describe, expect, it, vi, afterEach, beforeEach } from "vitest"
import { render, screen, cleanup, waitFor, fireEvent, within } from "@testing-library/react"

// Forge OS shell on (the default), demo mode (no backend: the in-browser fake).
vi.mock("./lib/env", () => ({
  LIVE_MODE: false,
  IS_PUBLIC_DEMO: false,
  PUBLIC_DEMO_APP_URL: "",
  DEMO_LOGIN_ENABLED: true,
  OS_SHELL_ENABLED: true,
}))

vi.mock("./components/GlobalBackground", () => ({ default: () => null }))
vi.mock("./components/AppShell", () => ({ default: () => <div data-testid="classic-shell" /> }))
vi.mock("./pages/ProjectsPage", () => ({ default: () => <div data-testid="projects-page">Projects page</div> }))
vi.mock("./pages/CommandCenterPage", () => ({ default: () => <div data-testid="command-center-page">Command Center</div> }))
vi.mock("./pages/WorkspacePage", async () => {
  const { useParams } = await import("react-router-dom")
  return {
    default: function Ws() {
      const { projectId } = useParams()
      return <div data-testid="workspace-page">Workspace {projectId}</div>
    },
  }
})

import App from "./App"
import { useAuthStore } from "./store/authStore"
import { useWindowStore, emptyWorkspace } from "./os/shell/windowStore"
import { useSessionStore } from "./os/shell/sessionStore"

describe("Forge OS shell routing (VITE_OS_SHELL on)", () => {
  beforeEach(() => {
    localStorage.clear()
    useWindowStore.getState().hydrate(emptyWorkspace())
    useSessionStore.setState({ sessions: [], sessionsLoaded: false, threads: {} })
    useAuthStore.setState({
      user: { id: "u1", email: "dev@forge.ai", name: "Dev Person", plan: "pro", credits: 10 } as never,
      isAuthenticated: true,
      isLoading: false,
      fetchMe: async () => {},
    } as never)
  })
  afterEach(cleanup)

  it.each(["/demo", "/?app=true"])("lands %s on the minimal home at /os", async (from) => {
    window.history.pushState({}, "", from)
    render(<App />)
    expect(await screen.findByTestId("os-shell")).toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname).toBe("/os"))
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("What should we make?")
    expect(screen.getByLabelText("Message Forge")).toBeInTheDocument()
    expect(screen.queryByTestId("classic-shell")).not.toBeInTheDocument()
    // No permanent dashboards on the home.
    expect(screen.queryByTestId("command-center-page")).not.toBeInTheDocument()
  })

  it("opens a legacy deep link as a window over the home and keeps the URL", async () => {
    window.history.pushState({}, "", "/projects")
    render(<App />)
    const page = await screen.findByTestId("projects-page")
    const win = page.closest("[data-os-window]") as HTMLElement
    expect(win).not.toBeNull()
    expect(within(win).getByRole("heading", { name: "Projects" })).toBeInTheDocument()
    expect(window.location.pathname).toBe("/projects")
  })

  it("follows redirects inside the window (/workspace -> /p/demo-project/workspace)", async () => {
    window.history.pushState({}, "", "/workspace")
    render(<App />)
    expect(await screen.findByTestId("workspace-page")).toHaveTextContent("Workspace demo-project")
    await waitFor(() => expect(window.location.pathname).toBe("/p/demo-project/workspace"))
  })

  it("closing the front legacy window returns the URL to /os", async () => {
    window.history.pushState({}, "", "/command")
    render(<App />)
    await screen.findByTestId("command-center-page")
    fireEvent.click(screen.getByRole("button", { name: "Close Command Center" }))
    await waitFor(() => expect(window.location.pathname).toBe("/os"))
    expect(screen.queryByTestId("command-center-page")).not.toBeInTheDocument()
  })

  it("first prompt docks the composer, creates a session and opens the answer's window", async () => {
    window.history.pushState({}, "", "/os")
    render(<App />)
    const box = await screen.findByLabelText("Message Forge")
    expect(screen.getByTestId("os-composer")).toHaveAttribute("data-variant", "center")
    fireEvent.change(box, { target: { value: "Show my projects" } })
    fireEvent.keyDown(box, { key: "Enter" })
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/os\/s\/ses_/))
    expect(screen.getByTestId("os-composer")).toHaveAttribute("data-variant", "docked")
    expect(await screen.findByText("Opening your projects.", {}, { timeout: 4000 })).toBeInTheDocument()
    expect(await screen.findByTestId("projects-page", {}, { timeout: 4000 })).toBeInTheDocument()
  })
})
