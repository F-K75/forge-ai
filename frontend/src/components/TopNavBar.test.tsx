import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import { TopNavBar } from "./TopNavBar";
import { OPEN_COMMAND_PALETTE_EVENT } from "../lib/commandPalette";

describe("TopNavBar slim context bar", () => {
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

  const renderTopNavBar = (props = {}, initialEntry = "/command") => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <TopNavBar {...props} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("shows the current page title as the breadcrumb on top-level pages", () => {
    renderTopNavBar({}, "/command");
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByText("Command Center")).toHaveAttribute("aria-current", "page");
  });

  it("renders a Projects › project › section trail on project pages", () => {
    renderTopNavBar({}, "/p/demo-project/reviews");
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Projects" })).toHaveAttribute("href", "/projects");
    expect(within(crumbs).getByRole("link", { name: "Forge Core Engine" })).toHaveAttribute(
      "href",
      "/p/demo-project/workspace"
    );
    expect(within(crumbs).getByText("Reviews")).toHaveAttribute("aria-current", "page");
  });

  it("no longer carries primary navigation, the project switcher or the user menu", () => {
    renderTopNavBar();
    expect(screen.queryByRole("navigation", { name: "Primary Navigation" })).not.toBeInTheDocument();
    expect(document.getElementById("taskbar-project-switcher-btn")).not.toBeInTheDocument();
    expect(document.getElementById("os-user-profile-badge")).not.toBeInTheDocument();
  });

  it("triggers agent fleet callback when clicking the fleet status pill", () => {
    const onOpenAgentFleet = vi.fn();
    renderTopNavBar({ onOpenAgentFleet, activeAgentCount: 5 });

    const fleetBtn = document.getElementById("os-agent-fleet-trigger");
    expect(fleetBtn).toBeInTheDocument();
    expect(fleetBtn).toHaveTextContent("5");
    expect(fleetBtn).toHaveAccessibleName(/5 agents working/i);

    fireEvent.click(fleetBtn!);
    expect(onOpenAgentFleet).toHaveBeenCalledTimes(1);
  });

  it("renders the mono credit balance linking to billing", () => {
    renderTopNavBar({ creditsBalance: 4200 });

    const creditsChip = document.getElementById("os-credits-chip");
    expect(creditsChip).toBeInTheDocument();
    expect(creditsChip).toHaveTextContent("4,200");
    expect(creditsChip).toHaveAttribute("href", "/billing");
  });

  it("opens the command palette from the compact search button", () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
    renderTopNavBar();

    const cmdTrigger = document.getElementById("os-terminal-trigger");
    expect(cmdTrigger).toHaveTextContent("⌘K");
    fireEvent.click(cmdTrigger!);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
  });

  it("renders the theme toggle", () => {
    renderTopNavBar();
    expect(screen.getByRole("button", { name: /^Theme:/ })).toBeInTheDocument();
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
    const { container } = renderTopNavBar({ activeAgentCount: 3, creditsBalance: 1200 }, "/p/demo-project/workspace");
    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});
