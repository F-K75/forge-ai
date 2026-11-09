import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { usePMStore } from "../../store/pmStore";
import AgentRunsTab from "./AgentRunsTab";

vi.mock("../../lib/pmApi", () => ({
  sprintsApi: {
    standups: vi.fn().mockResolvedValue([
      {
        id: "c5a599ab-88cc-4dbd-9c19-cf604bff3e5e",
        date: "2026-07-11T17:01:06.192000",
        blockers: ["Currency formatting per locale waiting on i18n key approval"],
        risks: ["Backend over capacity by 2h"],
      },
    ]),
    standup: vi.fn().mockResolvedValue({
      id: "live-standup-1",
      date: "2026-07-12T10:00:00.000000",
      blockers: [],
      risks: [],
    }),
  },
}));

const mockInitiative = {
  id: "2e92a0da-1038-4158-ae55-00fec5c52b21",
  user_id: "7e478c34-99c6-4792-a612-f3d73691a0af",
  name: "Self-serve seat downgrade",
  status: "active",
  vision: "Teams can reduce seat count without contacting support.",
  risks: [{ description: "contract minimums per plan tier are unconfirmed" }],
  tech_stack: ["PostgreSQL", "FastAPI", "React", "Docker"],
};

const mockPrd = {
  id: "22c8fc3d-8787-4a95-8e7f-a06769952b41",
  version: 1,
  solution: "Admins can reduce seat count from Billing -> Plan without a support ticket.",
  personas: [{ name: "Workspace admin" }],
};

const mockEpics = [
  {
    id: "0c671fb2-1d70-4a2f-9bd0-67be9a113cf6",
    title: "Self-serve downgrade flow",
    priority: "p0",
    estimated_duration: "Billing - admin-facing",
  },
];

const mockStories = [
  {
    id: "6af0665b-84ee-42c3-8b7f-01ca5db3fbba",
    epic_id: "0c671fb2-1d70-4a2f-9bd0-67be9a113cf6",
    title: "As an admin, I want to see credit before confirming.",
    acceptance_criteria: ["Credit shown matches proration engine output"],
  },
];

const mockTasks = [
  {
    id: "c818822b-ec31-48dd-b494-363b20035660",
    title: "Add proration preview endpoint",
    category: "backend",
    dependencies: [],
    estimated_hours: 3,
  },
];

const mockSprints = [
  {
    id: "be566781-c496-4659-b6ec-d198bd944d3b",
    sprint_number: 1,
    name: "Sprint 1",
    capacity: 32,
    status: "active",
    team_load: { Frontend: 28, Backend: 34 },
  },
];

const mockExecutions = [
  {
    id: "125660ee-a504-4275-9df3-73f7dcbb07dd",
    task_id: "c818822b-ec31-48dd-b494-363b20035660",
    agent: "task_executor",
    status: "running",
    current_thought: "Executing test suite in isolated container",
    progress: 80,
    logs: [
      "checked out branch task/3390-proration-endpoint",
      "5 passed, 0 failed - test_proration_currency_locale",
    ],
    cost_usd: 0.22,
    tokens_used: 31200,
    duration_seconds: 14,
  },
];

const mockDecisionFeed = [
  {
    taskId: "c818822b-ec31-48dd-b494-363b20035660",
    summary: "Re-allocated backend sprint load after discovering schema migration conflict.",
    recommendedNextTasks: ["Run isolated database migration", "Validate index creation"],
    bottlenecks: ["Database locks during active hours"],
    at: Date.now(),
  },
];

describe("AgentRunsTab Redesign", () => {
  beforeEach(() => {
    usePMStore.setState({
      initiative: mockInitiative,
      prd: mockPrd,
      epics: mockEpics,
      stories: mockStories,
      tasks: mockTasks,
      sprints: mockSprints,
      executions: mockExecutions,
      decisionFeed: mockDecisionFeed,
      loading: false,
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the executive telemetry header and stage progression", () => {
    render(<AgentRunsTab />);
    expect(screen.getByText(/Autonomous Agent Fleet/)).toBeTruthy();
    expect(screen.getByText(/Pipeline Topology & Lifecycle Progression/)).toBeTruthy();
    expect(screen.getByText(/Tokens Processed/)).toBeTruthy();
    expect(screen.getByText(/Inference Cost/)).toBeTruthy();
    expect(screen.getByText(/Avg Latency/)).toBeTruthy();
  });

  it("allows switching to the Live Console & Logs terminal view", () => {
    const { container } = render(<AgentRunsTab />);
    const consoleTab = container.querySelector("#tab-live-console") as HTMLButtonElement;
    expect(consoleTab).toBeTruthy();
    fireEvent.click(consoleTab);

    expect(screen.getByText(/Active Session/)).toBeTruthy();
    expect(screen.getByText(/Auto-scroll/)).toBeTruthy();
    expect(screen.getByText(/checked out branch task\/3390-proration-endpoint/)).toBeTruthy();
  });

  it("allows switching to the Decisions & Audit Feed view", () => {
    const { container } = render(<AgentRunsTab />);
    const decisionsTab = container.querySelector("#tab-decisions-feed") as HTMLButtonElement;
    expect(decisionsTab).toBeTruthy();
    fireEvent.click(decisionsTab);

    expect(screen.getByText(/Autonomous Decision Engine Feed/)).toBeTruthy();
    expect(screen.getByText(/Re-allocated backend sprint load/)).toBeTruthy();
    expect(screen.getByText(/Database locks during active hours/)).toBeTruthy();
    expect(screen.getByText(/Recommended Next Actions/)).toBeTruthy();
  });

  it("allows switching to the Fleet Matrix view", () => {
    const { container } = render(<AgentRunsTab />);
    const matrixTab = container.querySelector("#tab-fleet-matrix") as HTMLButtonElement;
    expect(matrixTab).toBeTruthy();
    fireEvent.click(matrixTab);

    expect(screen.getByText(/Autonomous Gateway Agent Fleet Matrix/)).toBeTruthy();
    expect(screen.getByText(/11 Agents Active/)).toBeTruthy();
  });

  it("filters agents by stage", () => {
    const { container } = render(<AgentRunsTab />);
    const discoveryFilter = container.querySelector("#stage-filter-Discovery") as HTMLButtonElement;
    expect(discoveryFilter).toBeTruthy();
    fireEvent.click(discoveryFilter);

    // Business Analyst is in Discovery
    expect(screen.getByText(/Business Analyst/)).toBeTruthy();
    // Sprint Planner is in Planning, should not be shown
    expect(screen.queryByText(/Sprint Planner/)).toBeNull();
  });

  it("filters agents using search input", () => {
    render(<AgentRunsTab />);
    const searchInput = screen.getByPlaceholderText(/Search agents by name/i);
    fireEvent.change(searchInput, { target: { value: "Scrum Master" } });

    expect(screen.getByText(/Scrum Master/)).toBeTruthy();
    expect(screen.queryByText(/Business Analyst/)).toBeNull();
  });

  it("toggles card expand and collapse", () => {
    const { container } = render(<AgentRunsTab />);
    // Toggle Collapse All
    const collapseAllBtn = container.querySelector("#btn-toggle-expand-all") as HTMLButtonElement;
    expect(collapseAllBtn).toBeTruthy();
    fireEvent.click(collapseAllBtn);

    expect(screen.getByText("Expand All")).toBeTruthy();
  });
});
