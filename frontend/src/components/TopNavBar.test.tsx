import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import { TopNavBar } from "./TopNavBar";

describe("TopNavBar Compact Context Bar", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  const renderTopNavBar = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TopNavBar {...props} />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  it("renders Forge brand identity and active workspace breadcrumb", () => {
    renderTopNavBar();

    expect(screen.getByText("FORGE")).toBeInTheDocument();

    const projectBtn = document.getElementById("taskbar-project-switcher-btn");
    expect(projectBtn).toBeInTheDocument();
    expect(projectBtn).toHaveTextContent(/Forge Core Engine/i);
  });

  it("opens and filters the workspace switcher dropdown", () => {
    renderTopNavBar();

    const projectBtn = document.getElementById("taskbar-project-switcher-btn");
    expect(projectBtn).toBeInTheDocument();
    fireEvent.click(projectBtn!);

    const dropdown = document.getElementById("taskbar-project-switcher-dropdown");
    expect(dropdown).toBeInTheDocument();

    const input = within(dropdown!).getByPlaceholderText(/Filter workspaces.../i);
    fireEvent.change(input, { target: { value: "Engine" } });
    expect(within(dropdown!).getByText("Forge Core Engine")).toBeInTheDocument();
  });

  it("triggers agent fleet callback when clicking fleet pill", () => {
    const onOpenAgentFleet = vi.fn();
    renderTopNavBar({ onOpenAgentFleet, activeAgentCount: 5 });

    const fleetBtn = document.getElementById("os-agent-fleet-trigger");
    expect(fleetBtn).toBeInTheDocument();
    expect(fleetBtn).toHaveTextContent("5");

    fireEvent.click(fleetBtn!);
    expect(onOpenAgentFleet).toHaveBeenCalledTimes(1);
  });

  it("renders compute credit balance and command palette trigger", () => {
    renderTopNavBar({ creditsBalance: 4200 });

    const creditsChip = document.getElementById("os-credits-chip");
    expect(creditsChip).toBeInTheDocument();
    expect(creditsChip).toHaveTextContent("4,200");

    const cmdTrigger = document.getElementById("os-terminal-trigger");
    expect(cmdTrigger).toBeInTheDocument();
    expect(cmdTrigger).toHaveTextContent("⌘K");
  });

  it("opens user account menu popover", () => {
    renderTopNavBar();

    const userBadge = document.getElementById("os-user-profile-badge");
    expect(userBadge).toBeInTheDocument();
    fireEvent.click(userBadge!);

    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    expect(screen.getByText("Billing & Subscriptions")).toBeInTheDocument();
    expect(screen.getByText("Admin Governance")).toBeInTheDocument();
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });

  it("calls onToggleMobileNav when clicking the mobile drawer toggle", () => {
    const onToggleMobileNav = vi.fn();
    renderTopNavBar({ onToggleMobileNav, mobileNavOpen: false });

    const drawerToggle = screen.getByRole("button", { name: /Toggle Navigation Drawer/i });
    expect(drawerToggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(drawerToggle);
    expect(onToggleMobileNav).toHaveBeenCalledTimes(1);
  });

  it("has no axe accessibility violations", async () => {
    const { container } = renderTopNavBar({ activeAgentCount: 3, creditsBalance: 1200 });
    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});
