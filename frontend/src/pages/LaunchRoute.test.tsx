import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("../lib/env", () => ({
  LIVE_MODE: true,
  IS_PUBLIC_DEMO: false,
  PUBLIC_DEMO_APP_URL: "",
}));

vi.mock("../components/GlobalBackground", () => ({
  default: () => null,
}));

vi.mock("../components/DemoBanner", () => ({
  DemoBanner: () => null,
}));

vi.mock("../components/AppShell", async () => {
  const { Outlet } = await import("react-router-dom");
  return {
    default: () => (
      <div data-testid="app-shell">
        <Outlet />
      </div>
    ),
  };
});

vi.mock("./Launch", () => ({
  default: () => <div data-testid="launch-page">Launchpad Ready</div>,
}));

vi.mock("./ProjectsPage", () => ({
  default: () => <div data-testid="projects-page">Projects Hub</div>,
}));

import App from "../App";
import { useAuthStore } from "../store/authStore";

describe("/launch routing in LIVE_MODE", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/launch");
    useAuthStore.setState({
      isAuthenticated: true,
      isLoading: false,
      user: { id: "u1", email: "dev@forge.ai", is_admin: false } as any,
      fetchMe: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("renders /launch inside AppShell for authenticated users without bouncing to /projects", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeInTheDocument();
      expect(screen.getByTestId("launch-page")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("projects-page")).not.toBeInTheDocument();
  });
});
