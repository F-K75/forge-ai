import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TopNavBar } from "./TopNavBar";

describe("TopNavBar Redesigned Component", () => {
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

  it("renders Forge brand identity and active workspace", () => {
    renderTopNavBar();

    // Brand
    expect(screen.getByText("FORGE")).toBeInTheDocument();
    expect(screen.getByText("OS 2.4")).toBeInTheDocument();

    // Active workspace trigger
    const projectBtn = document.getElementById("taskbar-project-switcher-btn");
    expect(projectBtn).toBeInTheDocument();
    expect(projectBtn).toHaveTextContent(/Forge Core Engine/i);
  });

  it("opens and filters the workspace dropdown", () => {
    renderTopNavBar();

    const projectBtn = document.getElementById("taskbar-project-switcher-btn");
    expect(projectBtn).toBeInTheDocument();
    fireEvent.click(projectBtn!);

    // Check popover opened
    const dropdown = document.getElementById("taskbar-project-switcher-dropdown");
    expect(dropdown).toBeInTheDocument();
    expect(within(dropdown!).getByPlaceholderText(/Filter workspaces.../i)).toBeInTheDocument();

    // Filter projects
    const input = within(dropdown!).getByPlaceholderText(/Filter workspaces.../i);
    fireEvent.change(input, { target: { value: "Engine" } });
    expect(within(dropdown!).getByText("Forge Core Engine")).toBeInTheDocument();
  });

  it("renders primary workflow navigation tabs", () => {
    renderTopNavBar();

    expect(document.getElementById("taskbar-tab-workspace")).toHaveTextContent("Workspace");
    expect(document.getElementById("taskbar-tab-projects")).toHaveTextContent("Projects");
    expect(document.getElementById("taskbar-tab-initiatives")).toHaveTextContent("Initiatives");
    expect(document.getElementById("taskbar-tab-agents")).toHaveTextContent("Agents");
    expect(document.getElementById("taskbar-tab-reviews")).toHaveTextContent("Reviews");
    expect(document.getElementById("taskbar-tab-launchpad")).toHaveTextContent("Launchpad");
  });

  it("opens the More dropdown with secondary tools", () => {
    renderTopNavBar();

    const moreBtn = screen.getByRole("button", { name: /More/i });
    fireEvent.click(moreBtn);

    expect(screen.getByText("Marketplace")).toBeInTheDocument();
    expect(screen.getByText("Model Studio")).toBeInTheDocument();
    expect(screen.getByText("Billing & Compute")).toBeInTheDocument();
    expect(screen.getByText("Admin Console")).toBeInTheDocument();
  });

  it("triggers agent fleet callback when clicking fleet beacon", () => {
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
  });

  it("opens user account menu popover", () => {
    renderTopNavBar();

    const userBadge = document.getElementById("os-user-profile-badge");
    expect(userBadge).toBeInTheDocument();
    fireEvent.click(userBadge!);

    expect(screen.getByText("Account Settings")).toBeInTheDocument();
    expect(screen.getByText("Billing & Subscriptions")).toBeInTheDocument();
    expect(screen.getByText("Sign Out")).toBeInTheDocument();
  });

  it("toggles the mobile drawer when clicking the hamburger toggle", () => {
    renderTopNavBar();

    const drawerToggle = screen.getByRole("button", { name: /Toggle Navigation Drawer/i });
    fireEvent.click(drawerToggle);

    expect(screen.getByText("Active Workspace")).toBeInTheDocument();
    expect(screen.getByText("Core Workflow")).toBeInTheDocument();
    expect(screen.getByText("Ecosystem & Settings")).toBeInTheDocument();
  });
});
