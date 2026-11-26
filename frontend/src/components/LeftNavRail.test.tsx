import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import { LeftNavRail } from "./LeftNavRail";
import { useUiStore } from "../store/uiStore";
import { OPEN_COMMAND_PALETTE_EVENT } from "../lib/commandPalette";

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="location">{loc.pathname}</div>;
}

describe("LeftNavRail sidebar", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    useUiStore.setState({ sidebarCollapsed: false });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  const renderRail = (props = {}, initialEntry = "/p/demo-project/workspace") => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <LeftNavRail {...props} />
          <Routes>
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("renders every group: Workspace, Engineering org, current project and Account", () => {
    renderRail();

    // Workspace
    expect(document.getElementById("rail-nav-command")).toHaveAttribute("href", "/command");
    expect(document.getElementById("rail-nav-projects")).toHaveAttribute("href", "/projects");
    expect(document.getElementById("rail-nav-new-build")).toHaveAttribute("href", "/launch");
    expect(document.getElementById("rail-nav-approvals")).toHaveAttribute("href", "/approvals");

    // Engineering org
    expect(document.getElementById("rail-nav-org")).toHaveAttribute("href", "/agents");
    expect(document.getElementById("rail-nav-skills")).toHaveAttribute("href", "/skills");
    expect(document.getElementById("rail-nav-protocols")).toHaveAttribute("href", "/protocols");
    expect(document.getElementById("rail-nav-models")).toHaveAttribute("href", "/models");
    expect(document.getElementById("rail-nav-studio-3d")).toHaveAttribute("href", "/studio-3d");

    // Current project
    expect(document.getElementById("rail-nav-build")).toHaveAttribute("href", "/p/demo-project/workspace");
    expect(document.getElementById("rail-nav-plan")).toHaveAttribute("href", "/p/demo-project/initiatives");
    expect(document.getElementById("rail-nav-agents")).toHaveAttribute("href", "/p/demo-project/agents");
    expect(document.getElementById("rail-nav-reviews")).toHaveAttribute("href", "/p/demo-project/reviews");
    expect(document.getElementById("rail-nav-files")).toHaveAttribute("href", "/p/demo-project/files");
    expect(document.getElementById("rail-nav-history")).toHaveAttribute("href", "/p/demo-project/history");
    expect(document.getElementById("rail-nav-project-settings")).toHaveAttribute("href", "/p/demo-project/settings");

    // Account
    expect(document.getElementById("rail-nav-marketplace")).toHaveAttribute("href", "/marketplace");
    expect(document.getElementById("rail-nav-billing")).toHaveAttribute("href", "/billing");
    expect(document.getElementById("rail-nav-settings")).toHaveAttribute("href", "/settings");
    expect(document.getElementById("rail-nav-admin-ops")).toHaveAttribute("href", "/admin");

    const rail = document.getElementById("left-nav-rail")!;
    for (const name of ["Workspace", "Engineering org", "Project", "Account"]) {
      expect(within(rail).getByRole("navigation", { name })).toBeInTheDocument();
    }
  });

  it("marks only the active route with aria-current", () => {
    renderRail({}, "/p/demo-project/reviews");
    expect(document.getElementById("rail-nav-reviews")).toHaveAttribute("aria-current", "page");
    expect(document.getElementById("rail-nav-build")).not.toHaveAttribute("aria-current");
  });

  it("shows the pending approvals count pill from the fleet overview", async () => {
    renderRail({}, "/command");
    const approvals = document.getElementById("rail-nav-approvals")!;
    await waitFor(() => expect(approvals).toHaveAccessibleName(/Approvals, 2 pending/));
    expect(approvals).toHaveTextContent("2");
  });

  it("collapses from 240px to 64px icons when clicking the collapse toggle", () => {
    renderRail();

    const rail = document.getElementById("left-nav-rail");
    expect(rail?.className).toContain("w-[240px]");

    const toggle = document.getElementById("rail-collapse-toggle")!;
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);

    expect(rail?.className).toContain("w-[64px]");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Collapsed items keep an accessible name via aria-label.
    expect(document.getElementById("rail-nav-projects")).toHaveAccessibleName("Projects");
  });

  it("opens the command palette from the ⌘K search field", () => {
    const listener = vi.fn();
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
    renderRail();
    const search = document.getElementById("sidebar-search-trigger")!;
    expect(search).toHaveTextContent("⌘K");
    fireEvent.click(search);
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
  });

  it("switches projects from the workspace switcher, keeping the current section", () => {
    renderRail({}, "/p/demo-project/history");
    const btn = document.getElementById("sidebar-project-switcher-btn")!;
    expect(btn).toHaveTextContent(/Forge Core Engine/);
    fireEvent.click(btn);

    const dropdown = document.getElementById("sidebar-project-switcher-dropdown")!;
    fireEvent.change(within(dropdown).getByLabelText("Filter projects"), { target: { value: "habit" } });
    expect(within(dropdown).queryByText("nse-backtester")).not.toBeInTheDocument();
    fireEvent.click(within(dropdown).getByText("habit-tracker"));

    expect(screen.getByTestId("location")).toHaveTextContent("/p/proj-001/history");
  });

  it("opens the user menu with account, org, admin, home and sign-out entries", () => {
    renderRail();
    fireEvent.click(document.getElementById("sidebar-user-menu-btn")!);
    const menu = screen.getByRole("menu", { name: "Account menu" });
    for (const label of [
      "Account settings",
      "Billing & subscription",
      "Engineering organization",
      "Admin governance",
      "Forge home",
      "Sign out",
    ]) {
      expect(within(menu).getByRole("menuitem", { name: label })).toBeInTheDocument();
    }
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Engineering organization" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/project/demo-project/org");
  });

  it("opens the help & shortcuts dialog", () => {
    renderRail();
    fireEvent.click(document.getElementById("sidebar-help-btn")!);
    expect(screen.getByRole("dialog", { name: /Help & keyboard shortcuts/ })).toBeInTheDocument();
  });

  it("renders mobile drawer with >=44px touch targets and handles close", () => {
    const onCloseMobile = vi.fn();
    renderRail({ mobileOpen: true, onCloseMobile });

    const drawer = document.getElementById("mobile-nav-drawer");
    expect(drawer).toBeInTheDocument();

    const mobileBuildLink = document.getElementById("rail-nav-build-mobile");
    expect(mobileBuildLink?.className).toContain("min-h-[44px]");
    expect(document.getElementById("rail-nav-command-mobile")).toHaveAttribute("href", "/command");

    const closeBtn = screen.getByRole("button", { name: /Close navigation menu/i });
    expect(closeBtn.className).toContain("min-h-[44px]");
    expect(closeBtn.className).toContain("min-w-[44px]");
    fireEvent.click(closeBtn);
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });

  it("closes the mobile drawer on Escape", () => {
    const onCloseMobile = vi.fn();
    renderRail({ mobileOpen: true, onCloseMobile });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });

  it("has no axe accessibility violations (expanded and collapsed)", async () => {
    const { container } = renderRail();
    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results).toHaveNoViolations();

    fireEvent.click(document.getElementById("rail-collapse-toggle")!);
    const collapsed = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(collapsed).toHaveNoViolations();
  });
});
