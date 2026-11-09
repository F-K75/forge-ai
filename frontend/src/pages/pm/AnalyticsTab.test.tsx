import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { usePMStore } from "../../store/pmStore";
import AnalyticsTab from "./AnalyticsTab";
import type { PMInitiative, PMStory, PMTask, PMSprint, PMExecution } from "../../lib/types/api";

// Mock ResponsiveContainer for jsdom environment
vi.mock("recharts", async () => {
  const original = await vi.importActual<any>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: any) => (
      <div style={{ width: 800, height: 300 }}>{children}</div>
    ),
  };
});

const mockInitiative: PMInitiative = {
  id: "init-test-analytics",
  user_id: "user-1",
  name: "Autonomous High-Throughput Engine",
  status: "active",
  version: 1,
  vision: "Distributed AI agent swarms executing continuous CI/CD pipelines.",
  estimated_timeline: "3 Sprints",
};

const mockStories: PMStory[] = [
  {
    id: "story-1",
    epic_id: "epic-1",
    initiative_id: mockInitiative.id,
    title: "Cluster consensus mechanism",
    priority: "p0",
    story_points: 8,
    status: "done",
  },
  {
    id: "story-2",
    epic_id: "epic-1",
    initiative_id: mockInitiative.id,
    title: "Dynamic memory compaction",
    priority: "p1",
    story_points: 5,
    status: "in_progress",
  },
];

const mockTasks: PMTask[] = [
  {
    id: "task-1",
    epic_id: "epic-1",
    story_id: "story-1",
    initiative_id: mockInitiative.id,
    title: "Implement Raft election loop",
    status: "done",
    assigned_agent: "BackendEng",
  },
  {
    id: "task-2",
    epic_id: "epic-1",
    story_id: "story-2",
    initiative_id: mockInitiative.id,
    title: "Compaction daemon benchmarking",
    status: "in_progress",
    assigned_agent: "DevOpsAgent",
  },
];

const mockSprints: PMSprint[] = [
  {
    id: "sprint-1",
    initiative_id: mockInitiative.id,
    sprint_number: 1,
    name: "Foundation & Consensus",
    capacity: 25,
    story_points_planned: 24,
    story_points_completed: 24,
    status: "completed",
  },
  {
    id: "sprint-2",
    initiative_id: mockInitiative.id,
    sprint_number: 2,
    name: "Memory & Cache",
    capacity: 30,
    story_points_planned: 28,
    story_points_completed: 18,
    status: "active",
  },
];

const mockExecutions: PMExecution[] = [
  {
    id: "exec-1",
    task_id: "task-1",
    initiative_id: mockInitiative.id,
    agent: "BackendEng",
    status: "completed",
    tokens_used: 4500,
    cost_usd: 0.0135,
    duration_seconds: 120,
  },
  {
    id: "exec-2",
    task_id: "task-2",
    initiative_id: mockInitiative.id,
    agent: "DevOpsAgent",
    status: "in_progress",
    tokens_used: 2800,
    cost_usd: 0.0084,
    duration_seconds: 90,
  },
];

describe("AnalyticsTab Component (Redesigned)", () => {
  beforeEach(() => {
    usePMStore.setState({
      initiative: mockInitiative,
      epics: [
        {
          id: "epic-1",
          initiative_id: mockInitiative.id,
          title: "Distributed Core Topology",
          story_points: 13,
          priority: "High",
        },
      ],
      stories: mockStories,
      tasks: mockTasks,
      sprints: mockSprints,
      executions: mockExecutions,
      decisionFeed: [
        {
          summary: "Database lock contention resolved with advisory locks",
          bottlenecks: ["I/O Latency"],
          recommendedNextTasks: ["Deploy pg_stat_statements"],
          at: Date.now(),
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the executive telemetry header and KPI cards", async () => {
    render(<AnalyticsTab />);

    expect(screen.getByText("Engineering Velocity & Fleet Analytics")).toBeInTheDocument();
    expect(screen.getByText("Real-time Telemetry")).toBeInTheDocument();

    // Verify all 4 KPI cards exist
    expect(screen.getByText("Sprint Velocity")).toBeInTheDocument();
    expect(screen.getByText("Fleet Autonomy Rate")).toBeInTheDocument();
    expect(screen.getByText("Compute & Tokens")).toBeInTheDocument();
    expect(screen.getByText("Mean Cycle Turnaround")).toBeInTheDocument();
  });

  it("allows switching to Fleet Compute & Cost view", async () => {
    render(<AnalyticsTab />);

    const fleetTabBtn = screen.getByRole("button", { name: /Fleet Compute & Cost/i });
    fireEvent.click(fleetTabBtn);

    expect(screen.getByText(/Agent Compute & Token Consumption by Persona/i)).toBeInTheDocument();
    expect(screen.getByText(/Inference Cost & SLA Ledger/i)).toBeInTheDocument();
    expect(screen.getByText("BackendEng")).toBeInTheDocument();
  });

  it("allows switching to Workstream Flow view and displays decision feed", async () => {
    render(<AnalyticsTab />);

    const throughputTabBtn = screen.getByRole("button", { name: /Workstream Flow/i });
    fireEvent.click(throughputTabBtn);

    expect(screen.getByText(/Task Status Flow Distribution/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Architectural Bottlenecks & Triage Feed/i)).toBeInTheDocument();
    expect(screen.getByText(/Database lock contention resolved with advisory locks/i)).toBeInTheDocument();
    expect(screen.getByText("I/O Latency")).toBeInTheDocument();
  });

  it("allows switching to Telemetry Audit Log and filtering events", async () => {
    render(<AnalyticsTab />);

    const auditTabBtn = screen.getByRole("button", { name: /Telemetry Audit Log/i });
    fireEvent.click(auditTabBtn);

    expect(screen.getByText(/Telemetry Events & Execution Audit/i)).toBeInTheDocument();

    // Search events
    const searchInput = screen.getByPlaceholderText("Search events...");
    fireEvent.change(searchInput, { target: { value: "tasks_completed" } });

    await waitFor(() => {
      expect(screen.getByText("tasks_completed")).toBeInTheDocument();
    });
  });

  it("opens the Export Report modal and handles export actions", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(<AnalyticsTab />);

    const exportBtn = screen.getByRole("button", { name: /Export Report/i });
    fireEvent.click(exportBtn);

    expect(screen.getByText("Export Engineering Analytics Dataset")).toBeInTheDocument();
    expect(screen.getByText("Payload Preview")).toBeInTheDocument();

    // Verify Copy and Download buttons
    expect(screen.getByRole("button", { name: /Copy JSON/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download \.json/i })).toBeInTheDocument();

    // Test clipboard copy
    fireEvent.click(screen.getByRole("button", { name: /Copy JSON/i }));
    expect(writeTextMock).toHaveBeenCalled();
  });

  it("handles timeframe selection changes and manual sync refresh", async () => {
    render(<AnalyticsTab />);

    const timeframeSelect = screen.getByRole("combobox");
    fireEvent.change(timeframeSelect, { target: { value: "7d" } });
    expect(screen.getByDisplayValue("Trailing 7 Days")).toBeInTheDocument();

    const syncBtn = screen.getByRole("button", { name: /Sync/i });
    fireEvent.click(syncBtn);
    expect(syncBtn).toBeInTheDocument();
  });
});
