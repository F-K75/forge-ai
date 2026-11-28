import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("./lib/env", () => ({
  LIVE_MODE: false,
  IS_PUBLIC_DEMO: false,
  PUBLIC_DEMO_APP_URL: "",
  // Classic shell: these tests cover the flag-off routing (os-shell tests cover /os).
  OS_SHELL_ENABLED: false,
}));

vi.mock("./components/AppShell", async () => {
  const { Outlet } = await import("react-router-dom");
  return {
    default: () => (
      <div data-testid="app-shell">
        <Outlet />
      </div>
    ),
  };
});

vi.mock("./pages/WorkspacePage", () => ({
  default: () => <div data-testid="workspace-page">Workspace Page</div>,
}));
vi.mock("./pages/FlowPage", () => ({
  default: () => <div data-testid="flow-page">Flow / Agents Page</div>,
}));
vi.mock("./pages/FilesPage", () => ({
  default: () => <div data-testid="files-page">Files Page</div>,
}));
vi.mock("./pages/CommandCenterPage", () => ({
  default: () => <div data-testid="command-center-page">Command Center</div>,
}));
vi.mock("./pages/HistoryPage", () => ({
  default: () => <div data-testid="history-page">History Page</div>,
}));

import App from "./App";
import { useAuthStore } from "./store/authStore";

describe("Canonical Route Redirects", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: "u1", email: "dev@forge.ai", name: "Dev" } as never,
      isAuthenticated: true,
      isLoading: false,
      fetchMe: async () => {},
    } as never);
  });

  afterEach(() => {
    cleanup();
  });

  const cases: Array<{ from: string; to: string; testId: string }> = [
    { from: "/build/proj-42", to: "/p/proj-42/workspace", testId: "workspace-page" },
    { from: "/project/proj-42", to: "/p/proj-42/history", testId: "history-page" },
    { from: "/project/proj-42/org", to: "/p/proj-42/agents", testId: "flow-page" },
    { from: "/workspace", to: "/p/demo-project/workspace", testId: "workspace-page" },
    { from: "/flow", to: "/p/demo-project/agents", testId: "flow-page" },
    { from: "/files", to: "/p/demo-project/files", testId: "files-page" },
    { from: "/history", to: "/p/demo-project/history", testId: "history-page" },
  ];

  // The Command Center is the default landing for the app.
  const landingCases: Array<{ from: string; to: string }> = [
    { from: "/demo", to: "/command" },
    { from: "/?app=true", to: "/command" },
  ];

  it.each(landingCases)("lands $from on the Command Center", async ({ from, to }) => {
    window.history.pushState({}, "", from);
    render(<App />);

    expect(await screen.findByTestId("command-center-page")).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.pathname).toBe(to);
    });
  });

  it.each(cases)(
    "redirects legacy route $from to canonical $to",
    async ({ from, to, testId }) => {
      window.history.pushState({}, "", from);
      render(<App />);

      expect(await screen.findByTestId(testId)).toBeInTheDocument();
      await waitFor(() => {
        expect(window.location.pathname).toBe(to);
      });
    }
  );
});

