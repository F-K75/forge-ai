import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { usePMStore } from "../../store/pmStore";
import SprintsTab from "./SprintsTab";

vi.mock("../../lib/pmApi", () => ({
  sprintsApi: {
    list: vi.fn().mockResolvedValue([]),
    reports: vi.fn().mockResolvedValue({
      reviews: [{ summary: "Test Review" }],
      retros: [{ what_went_well: ["Fast release"], what_went_wrong: ["Flaky test"] }],
      risk_reports: [{ risks: [{ severity: "HIGH", description: "Test risk" }] }],
      tech_debt: [{ items: [{ severity: "LOW", description: "Old mock file" }] }],
    }),
    standups: vi.fn().mockResolvedValue([
      {
        yesterday: "Built authentication",
        today: "Writing tests",
        blockers: ["None"],
        sprint_health: "OPTIMAL",
      },
    ]),
    standup: vi.fn().mockResolvedValue({}),
    review: vi.fn().mockResolvedValue({}),
    retro: vi.fn().mockResolvedValue({}),
    riskReport: vi.fn().mockResolvedValue({}),
    techDebt: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
  },
  tasksApi: {
    list: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue({}),
  },
}));

// Mock ResizeObserver for Recharts
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

import type { PMSprint, PMTask } from "../../lib/types/api";

const mockSprints: PMSprint[] = [
  {
    id: "sprint-1",
    initiative_id: "init-test",
    sprint_number: 1,
    name: "Sprint 1: Architecture Core",
    goal: "Establish foundation schemas and APIs",
    capacity: 40,
    velocity: 38,
    story_points_planned: 38,
    story_points_completed: 38,
    status: "completed",
  },
  {
    id: "sprint-2",
    initiative_id: "init-test",
    sprint_number: 2,
    name: "Sprint 2: Real-time Execution",
    goal: "Deploy real-time stream handlers and risk gates",
    capacity: 45,
    velocity: 42,
    story_points_planned: 42,
    story_points_completed: 20,
    completion_probability: 0.9,
    status: "active",
  },
];

const mockTasks: PMTask[] = [
  {
    id: "task-1",
    story_id: "story-1",
    epic_id: "epic-1",
    initiative_id: "init-test",
    title: "Setup PostgreSQL connection pool",
    description: "Config max connections and keepalive",
    status: "done",
    assigned_agent: "backend_agent",
    priority: "P0",
    sprint_id: "sprint-2",
    estimated_hours: 6,
  },
  {
    id: "task-2",
    story_id: "story-1",
    epic_id: "epic-1",
    initiative_id: "init-test",
    title: "Implement WebSocket telemetry endpoint",
    description: "Push task state updates to connected clients",
    status: "in_progress",
    assigned_agent: "frontend_agent",
    priority: "P1",
    sprint_id: "sprint-2",
    estimated_hours: 8,
  },
];

describe("SprintsTab Redesign", () => {
  beforeEach(() => {
    cleanup();
    usePMStore.setState({
      sprints: mockSprints,
      tasks: mockTasks,
      stories: [],
      epics: [],
    });
  });

  it("renders sprint switcher and commitment banner", () => {
    render(
      <BrowserRouter>
        <SprintsTab />
      </BrowserRouter>
    );

    // Both sprints should appear in the sprint picker
    expect(screen.getByText("Sprint 1")).toBeDefined();
    expect(screen.getByText("Sprint 2")).toBeDefined();

    // The active sprint goal should be rendered
    expect(screen.getByText(/Deploy real-time stream handlers/i)).toBeDefined();
  });

  it("renders 12-column KPI metric cards", () => {
    render(
      <BrowserRouter>
        <SprintsTab />
      </BrowserRouter>
    );

    expect(screen.getByText("STORY POINTS BURN")).toBeDefined();
    expect(screen.getByText("VELOCITY & CAPACITY")).toBeDefined();
    expect(screen.getByText("AI FORECAST & HEALTH")).toBeDefined();
    expect(screen.getByText("WORK ITEMS")).toBeDefined();
  });

  it("renders sprint backlog tasks and supports search", () => {
    render(
      <BrowserRouter>
        <SprintsTab />
      </BrowserRouter>
    );

    // Tasks should be listed in the backlog tab by default
    expect(screen.getByText("Setup PostgreSQL connection pool")).toBeDefined();
    expect(screen.getByText("Implement WebSocket telemetry endpoint")).toBeDefined();

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Search tasks by title/i);
    fireEvent.change(searchInput, { target: { value: "PostgreSQL" } });

    expect(screen.getByText("Setup PostgreSQL connection pool")).toBeDefined();
    expect(screen.queryByText("Implement WebSocket telemetry endpoint")).toBeNull();
  });

  it("allows switching to the Burndown & Velocity charts tab", () => {
    render(
      <BrowserRouter>
        <SprintsTab />
      </BrowserRouter>
    );

    const chartsTab = screen.getByRole("button", { name: /Burndown & Velocity/i });
    fireEvent.click(chartsTab);

    expect(screen.getByText("BURNDOWN SIMULATION")).toBeDefined();
    expect(screen.getByText("VELOCITY HISTORY")).toBeDefined();
    expect(screen.getByText("AGENT WORKLOAD")).toBeDefined();
  });

  it("allows switching to the Scrum Ceremonies tab and viewing reports", () => {
    render(
      <BrowserRouter>
        <SprintsTab />
      </BrowserRouter>
    );

    const ceremoniesTab = screen.getByRole("button", { name: /Scrum Ceremonies/i });
    fireEvent.click(ceremoniesTab);

    expect(screen.getAllByText("Daily Stand-up").length).toBeGreaterThan(0);
    expect(screen.getByText("Sprint Review")).toBeDefined();
    expect(screen.getByText("Retrospective")).toBeDefined();
    expect(screen.getByText("Risk Assessment")).toBeDefined();
    expect(screen.getByText("Technical Debt")).toBeDefined();
  });

  it("opens the Plan New Sprint modal when clicking NEW SPRINT button", () => {
    render(
      <BrowserRouter>
        <SprintsTab />
      </BrowserRouter>
    );

    const newSprintBtn = screen.getByRole("button", { name: /NEW SPRINT/i });
    fireEvent.click(newSprintBtn);

    expect(screen.getByText("PLAN NEW SPRINT CYCLE")).toBeDefined();
    expect(screen.getByLabelText(/SPRINT NAME/i)).toBeDefined();
    expect(screen.getByLabelText(/SPRINT GOAL/i)).toBeDefined();
  });
});
