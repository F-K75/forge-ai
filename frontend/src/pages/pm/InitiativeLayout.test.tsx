import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InitiativeLayout, { INITIATIVE_TABS } from "./InitiativeLayout";
import { usePMStore } from "../../store/pmStore";

vi.mock("../../hooks/usePMSocket", () => ({
  usePMSocket: () => {},
}));

vi.mock("../../components/pm/InitiativeMixedMediaTray", () => ({
  default: () => null,
}));

vi.mock("../../components/pm/InitiativeCopilotChat", () => ({
  default: () => null,
}));

vi.mock("../../components/pm/RequirementsSurvey", () => ({
  RequirementsSurvey: () => null,
}));

describe("InitiativeLayout (Phase 3 Consolidated 3-Tab Structure)", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    usePMStore.setState({
      initiative: {
        id: "init-1",
        name: "Forge Core Platform",
        status: "active",
        vision: "Unified dark-first developer workspace",
        product_scope: "Core PM + Agent Execution",
        estimated_timeline: "Q1-Q2 2026",
        version: 1,
      } as any,
      epics: [{ id: "e1", title: "Epic 1" }] as any,
      sprints: [{ id: "s1", name: "Sprint 1" }] as any,
      generationStatus: "complete",
      generationError: null,
      loading: false,
      error: null,
      hydrate: vi.fn(),
      reset: vi.fn(),
    });
  });

  it("exposes exactly 3 primary tabs: Overview, Board, and Agent Runs", () => {
    expect(INITIATIVE_TABS.map((t) => t.label)).toEqual([
      "Overview",
      "Board",
      "Agent Runs",
    ]);

    render(
      <MemoryRouter initialEntries={["/initiatives/init-1"]}>
        <Routes>
          <Route path="/initiatives/:initiativeId" element={<InitiativeLayout />}>
            <Route index element={<div>Overview Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent("Overview");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveTextContent("Board");
    expect(tabs[2]).toHaveTextContent("Agent Runs");
    expect(screen.getByText("Overview Content")).toBeInTheDocument();
  });

  it("highlights Board tab on deep-linked /sprints sub-route", () => {
    render(
      <MemoryRouter initialEntries={["/p/proj-1/initiatives/init-1/sprints"]}>
        <Routes>
          <Route
            path="/p/:projectId/initiatives/:initiativeId"
            element={<InitiativeLayout />}
          >
            <Route path="sprints" element={<div>Sprints Deep Link</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs[1]).toHaveTextContent("Board");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Sprints Deep Link")).toBeInTheDocument();
  });

  it("highlights Agent Runs tab on deep-linked /integrations sub-route", () => {
    render(
      <MemoryRouter initialEntries={["/initiatives/init-1/integrations"]}>
        <Routes>
          <Route path="/initiatives/:initiativeId" element={<InitiativeLayout />}>
            <Route path="integrations" element={<div>Integrations Deep Link</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs[2]).toHaveTextContent("Agent Runs");
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Integrations Deep Link")).toBeInTheDocument();
  });
});
