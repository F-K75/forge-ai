import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mock sub-pages so tests focus on routing, deep-linking, and tab switching without API calls
vi.mock("./AdminConsole", () => ({ default: () => <div data-testid="mock-admin-console">AdminConsole View</div> }));
vi.mock("./LLMManagementPage", () => ({ default: () => <div data-testid="mock-llm-management">LLMManagement View</div> }));
vi.mock("./PromptStudioPage", () => ({ default: () => <div data-testid="mock-prompt-studio">PromptStudio View</div> }));
vi.mock("./OptimizationDashboard", () => ({ default: () => <div data-testid="mock-optimization">Optimization View</div> }));
vi.mock("./EngineeringHealthPage", () => ({ default: () => <div data-testid="mock-health">EngineeringHealth View</div> }));
vi.mock("./AdjudicationPage", () => ({ default: () => <div data-testid="mock-adjudication">Adjudication View</div> }));

// Live mode for App-level redirect tests
vi.mock("../lib/env", () => ({ LIVE_MODE: true, IS_PUBLIC_DEMO: false, PUBLIC_DEMO_APP_URL: "" }));

import AdminOpsPage from "./AdminOpsPage";
import App from "../App";
import { useAuthStore } from "../store/authStore";

function renderAdminOps(initialEntry = "/admin") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin" element={<AdminOpsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("AdminOpsPage", () => {
  afterEach(() => cleanup());

  it("renders Overview tab by default and switches between all 5 tabs", () => {
    renderAdminOps("/admin");

    expect(screen.getByRole("heading", { name: /Admin Ops Console/i })).toBeInTheDocument();
    expect(screen.getByTestId("mock-admin-console")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Overview/i })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: /LLM & Models/i }));
    expect(screen.getByTestId("mock-llm-management")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /LLM & Models/i })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: /Prompt Studio/i }));
    expect(screen.getByTestId("mock-prompt-studio")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Optimization/i }));
    expect(screen.getByTestId("mock-optimization")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Engineering Health/i }));
    expect(screen.getByTestId("mock-health")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Adjudication/i }));
    expect(screen.getByTestId("mock-adjudication")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Adjudication/i })).toHaveAttribute("aria-selected", "true");
  });

  it("supports ?tab= deep linking and falls back to Overview for unknown tabs", () => {
    renderAdminOps("/admin?tab=prompts");
    expect(screen.getByTestId("mock-prompt-studio")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Prompt Studio/i })).toHaveAttribute("aria-selected", "true");
    cleanup();

    renderAdminOps("/admin?tab=optimization");
    expect(screen.getByTestId("mock-optimization")).toBeInTheDocument();
    cleanup();

    renderAdminOps("/admin?tab=health");
    expect(screen.getByTestId("mock-health")).toBeInTheDocument();
    cleanup();

    renderAdminOps("/admin?tab=unknown-tab");
    expect(screen.getByTestId("mock-admin-console")).toBeInTheDocument();
  });

  it.each([
    ["/admin-console", "mock-admin-console", "?tab=overview"],
    ["/llm-management", "mock-llm-management", "?tab=llm"],
    ["/models", "mock-llm-management", "?tab=llm"],
    ["/prompt-studio", "mock-prompt-studio", "?tab=prompts"],
    ["/optimization-dashboard", "mock-optimization", "?tab=optimization"],
    ["/engineering-health", "mock-health", "?tab=health"],
  ])("redirects legacy route %s to /admin%s", async (legacyPath, expectedTestId, expectedSearch) => {
    window.history.pushState({}, "", legacyPath);
    useAuthStore.setState({
      user: { id: "u1", email: "admin@forge.dev", name: "Admin", is_admin: true, mfa_enabled: true } as never,
      isAuthenticated: true,
      isLoading: false,
      fetchMe: async () => {},
    } as never);

    render(<App />);

    expect(await screen.findByTestId(expectedTestId, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/admin");
    expect(window.location.search).toBe(expectedSearch);
  });
});

