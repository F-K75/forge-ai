import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

// LIVE_MODE: authenticated users land on the Command Center, not /projects.
vi.mock("./lib/env", () => ({
  LIVE_MODE: true,
  IS_PUBLIC_DEMO: false,
  PUBLIC_DEMO_APP_URL: "",
  // Classic shell: these tests cover the flag-off routing (os-shell tests cover /os).
  OS_SHELL_ENABLED: false,
}));

vi.mock("./components/GlobalBackground", () => ({ default: () => null }));
vi.mock("./components/DemoBanner", () => ({ DemoBanner: () => null }));

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

vi.mock("./pages/CommandCenterPage", () => ({
  default: () => <div data-testid="command-center-page">Command Center</div>,
}));
vi.mock("./pages/ProjectsPage", () => ({
  default: () => <div data-testid="projects-page">Projects</div>,
}));

import App from "./App";
import { useAuthStore } from "./store/authStore";

describe("authenticated default landing in LIVE_MODE", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { id: "u1", email: "dev@forge.ai", name: "Dev", is_admin: false } as never,
      isAuthenticated: true,
      isLoading: false,
      fetchMe: vi.fn().mockResolvedValue(undefined),
    } as never);
  });

  afterEach(() => {
    cleanup();
  });

  it.each(["/", "/signup", "/demo"])("sends %s to /command", async (from) => {
    window.history.pushState({}, "", from);
    render(<App />);

    expect(await screen.findByTestId("command-center-page")).toBeInTheDocument();
    await waitFor(() => expect(window.location.pathname).toBe("/command"));
    expect(screen.queryByTestId("projects-page")).not.toBeInTheDocument();
  });
});
