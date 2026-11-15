import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { axe } from "vitest-axe";
import { LeftNavRail } from "./LeftNavRail";
import { useUiStore } from "../store/uiStore";

describe("LeftNavRail Component", () => {
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
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("renders all 4 project pillars and global navigation items", () => {
    renderRail();

    // Project 4 pillars
    expect(document.getElementById("rail-nav-build")).toHaveAttribute("href", "/p/demo-project/workspace");
    expect(document.getElementById("rail-nav-plan")).toHaveAttribute("href", "/p/demo-project/initiatives");
    expect(document.getElementById("rail-nav-agents")).toHaveAttribute("href", "/p/demo-project/agents");
    expect(document.getElementById("rail-nav-reviews")).toHaveAttribute("href", "/p/demo-project/reviews");
    expect(document.getElementById("rail-nav-history")).toHaveAttribute("href", "/p/demo-project/history");
    expect(document.getElementById("rail-nav-project-settings")).toHaveAttribute("href", "/p/demo-project/settings");

    // Global section
    expect(document.getElementById("rail-nav-projects")).toHaveAttribute("href", "/projects");
    expect(document.getElementById("rail-nav-new-build")).toHaveAttribute("href", "/launch");
    expect(document.getElementById("rail-nav-marketplace")).toHaveAttribute("href", "/marketplace");
    expect(document.getElementById("rail-nav-billing")).toHaveAttribute("href", "/billing");
    expect(document.getElementById("rail-nav-settings")).toHaveAttribute("href", "/settings");
    expect(document.getElementById("rail-nav-admin-ops")).toHaveAttribute("href", "/admin");
  });

  it("collapses from 220px to 56px when clicking the collapse toggle", () => {
    renderRail();

    const rail = document.getElementById("left-nav-rail");
    expect(rail?.className).toContain("w-[220px]");

    const toggle = document.getElementById("rail-collapse-toggle")!;
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);

    expect(rail?.className).toContain("w-[56px]");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("renders mobile drawer with >=44px touch targets and handles close", () => {
    const onCloseMobile = vi.fn();
    renderRail({ mobileOpen: true, onCloseMobile });

    const drawer = document.getElementById("mobile-nav-drawer");
    expect(drawer).toBeInTheDocument();

    const mobileBuildLink = document.getElementById("rail-nav-build-mobile");
    expect(mobileBuildLink?.className).toContain("min-h-[44px]");

    const closeBtn = screen.getByRole("button", { name: /Close navigation menu/i });
    expect(closeBtn.className).toContain("min-h-[44px]");
    expect(closeBtn.className).toContain("min-w-[44px]");
    fireEvent.click(closeBtn);
    expect(onCloseMobile).toHaveBeenCalledTimes(1);
  });

  it("has no axe accessibility violations", async () => {
    const { container } = renderRail();
    const results = await axe(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results).toHaveNoViolations();
  });
});

