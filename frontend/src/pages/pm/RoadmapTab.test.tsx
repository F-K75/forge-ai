import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { usePMStore } from "../../store/pmStore";
import RoadmapTab from "./RoadmapTab";
import type { PMInitiative, PMEpic, PMStory, PMTask, PMSprint } from "../../lib/types/api";

const mockInitiative: PMInitiative = {
  id: "2e92a0da-1038-4158-ae55-00fec5c52b21",
  user_id: "7e478c34-99c6-4792-a612-f3d73691a0af",
  name: "Self-serve seat downgrade",
  status: "active",
  version: 1,
  vision: "Teams on annual plans can reduce seat count without contacting support.",
  estimated_timeline: "4-Quarter Horizon",
  roadmap: [
    {
      phase: "Phase 1: Architecture & API",
      duration: "Weeks 1–3",
      goal: "Backend schema contracts and billing microservice stubs.",
    },
    {
      phase: "Phase 2: Self-Serve Flow",
      duration: "Weeks 4–7",
      goal: "User facing adjustments and verification checks.",
    },
  ],
};

const mockEpics: PMEpic[] = [
  {
    id: "epic-1",
    initiative_id: mockInitiative.id,
    title: "Billing Service Integration",
    priority: "p0",
    story_points: 21,
    estimated_duration: "Cadence: Q1",
    description: "Core Stripe seat count downgrade contracts.",
  },
  {
    id: "epic-2",
    initiative_id: mockInitiative.id,
    title: "Self-Serve UI Workflow",
    priority: "p1",
    story_points: 13,
    estimated_duration: "Cadence: Q2",
    description: "Interactive seat management modal and confirmation dialogs.",
  },
];

const mockStories: PMStory[] = [
  {
    id: "story-1",
    epic_id: "epic-1",
    initiative_id: mockInitiative.id,
    title: "Stripe subscription proration logic",
    priority: "p0",
    story_points: 8,
    acceptance_criteria: ["Ensure prorated invoice is returned"],
  },
  {
    id: "story-2",
    epic_id: "epic-2",
    initiative_id: mockInitiative.id,
    title: "Seat adjustment stepper interface",
    priority: "p1",
    story_points: 5,
    acceptance_criteria: ["Show remaining license count"],
  },
];

const mockTasks: PMTask[] = [
  {
    id: "task-1",
    story_id: "story-1",
    epic_id: "epic-1",
    initiative_id: mockInitiative.id,
    title: "Implement proration calculation endpoint",
    status: "done",
    estimated_hours: 6,
  },
  {
    id: "task-2",
    story_id: "story-2",
    epic_id: "epic-2",
    initiative_id: mockInitiative.id,
    title: "Build downgrade confirmation step",
    status: "in_progress",
    estimated_hours: 4,
  },
];

describe("RoadmapTab Redesign", () => {
  beforeEach(() => {
    usePMStore.setState({
      initiative: mockInitiative,
      prd: null,
      epics: mockEpics,
      stories: mockStories,
      tasks: mockTasks,
      sprints: [],
      loading: false,
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the executive telemetry header and KPI cards", () => {
    render(<RoadmapTab />);
    expect(screen.getByText(/Strategic Product Roadmap/)).toBeTruthy();
    expect(screen.getByText("Self-serve seat downgrade")).toBeTruthy();
    expect(screen.getByText(/Total Epics/)).toBeTruthy();
    expect(screen.getByText(/Delivery Progress/)).toBeTruthy();
    expect(screen.getByText(/Effort & Capacity/)).toBeTruthy();
  });

  it("renders the interactive timeline and Gantt chart view by default", () => {
    render(<RoadmapTab />);
    expect(screen.getByText(/Interactive Gantt & Chronological Horizon/)).toBeTruthy();
    expect(screen.getAllByText("Billing Service Integration").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Self-Serve UI Workflow").length).toBeGreaterThan(0);
  });

  it("switches to the Quarter & Cadence Board view", () => {
    render(<RoadmapTab />);
    const quartersTab = screen.getByRole("button", { name: /Quarter & Cadence Board/i });
    fireEvent.click(quartersTab);

    expect(screen.getByText(/Q1 Horizon/i)).toBeTruthy();
    expect(screen.getByText(/Q2 Horizon/i)).toBeTruthy();
  });

  it("switches to the Strategic Milestones view", () => {
    render(<RoadmapTab />);
    const milestonesTab = screen.getByRole("button", { name: /Strategic Milestones & Releases/i });
    fireEvent.click(milestonesTab);

    expect(screen.getByText(/Phase 1: Architecture & API/i)).toBeTruthy();
    expect(screen.getByText(/Phase 2: Self-Serve Flow/i)).toBeTruthy();
    expect(screen.getAllByText(/Release Gate Criteria/i).length).toBeGreaterThan(0);
  });

  it("switches to the Epic Decomposition Matrix and expands stories", () => {
    render(<RoadmapTab />);
    const epicsTab = screen.getByRole("button", { name: /Epic Decomposition Matrix/i });
    fireEvent.click(epicsTab);

    expect(screen.getByText(/Epic Decomposition & Scope Matrix/i)).toBeTruthy();
    const expandButtons = screen.getAllByTitle(/Expand stories/i);
    expect(expandButtons.length).toBeGreaterThan(0);
    fireEvent.click(expandButtons[0]);

    expect(screen.getByText("Stripe subscription proration logic")).toBeTruthy();
    expect(screen.getByText("Ensure prorated invoice is returned")).toBeTruthy();
  });

  it("opens and closes the Epic detail modal", () => {
    render(<RoadmapTab />);
    // Click on an epic in the timeline
    const epicTitle = screen.getAllByText("Billing Service Integration")[0];
    fireEvent.click(epicTitle);

    expect(screen.getByText("Core Stripe seat count downgrade contracts.")).toBeTruthy();
    expect(screen.getByText("Linked User Stories (1)")).toBeTruthy();

    const doneButton = screen.getByRole("button", { name: /Done/i });
    fireEvent.click(doneButton);

    // Modal should close
    expect(screen.queryByText("Linked User Stories (1)")).toBeNull();
  });

  it("filters epics using search and priority buttons", () => {
    render(<RoadmapTab />);
    const searchInput = screen.getByPlaceholderText(/Search epics, milestones/i);
    fireEvent.change(searchInput, { target: { value: "Billing" } });

    expect(screen.getAllByText("Billing Service Integration").length).toBeGreaterThan(0);
    expect(screen.queryByText("Self-Serve UI Workflow")).toBeNull();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getAllByText("Self-Serve UI Workflow").length).toBeGreaterThan(0);

    // Priority filter
    const p0Button = screen.getByRole("button", { name: /^p0$/i });
    fireEvent.click(p0Button);

    expect(screen.getAllByText("Billing Service Integration").length).toBeGreaterThan(0);
    expect(screen.queryByText("Self-Serve UI Workflow")).toBeNull();
  });

  it("triggers AI Horizon Forecast", async () => {
    render(<RoadmapTab />);
    const forecastButton = screen.getByRole("button", { name: /AI Horizon Forecast/i });
    fireEvent.click(forecastButton);

    expect(screen.getByText(/Forecasting…/i)).toBeTruthy();
  });
});
