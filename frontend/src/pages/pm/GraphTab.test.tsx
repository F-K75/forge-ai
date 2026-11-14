import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { usePMStore } from "../../store/pmStore";
import GraphTab from "./GraphTab";
import type { PMInitiative, PMEpic, PMStory, PMTask, PMExecution } from "../../lib/types/api";

// Mock ResizeObserver for jsdom
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const mockInitiative: PMInitiative = {
  id: "init-fintech-test",
  user_id: "user-system",
  name: "Autonomous Clearing & Settlement Engine",
  status: "active",
  version: 1,
  vision: "High-throughput real-time transaction ledger with zero-drift reconciliation.",
  estimated_timeline: "6 sprints · 12 weeks",
};

const mockEpics: (PMEpic & { dependencies?: string[] })[] = [
  {
    id: "epic-1",
    initiative_id: mockInitiative.id,
    title: "Double-Entry Ledger Core",
    priority: "p0",
    story_points: 21,
    estimated_duration: "Cadence: Q1",
    description: "Core accounting contracts and debit/credit constraints.",
  },
  {
    id: "epic-2",
    initiative_id: mockInitiative.id,
    title: "Real-Time Settlement Webhooks",
    priority: "p1",
    story_points: 13,
    estimated_duration: "Cadence: Q2",
    description: "Instantaneous settlement delivery with retry policies.",
    dependencies: ["epic-1"],
  },
];

const mockStories: PMStory[] = [
  {
    id: "story-1",
    epic_id: "epic-1",
    initiative_id: mockInitiative.id,
    title: "Idempotent debit-credit validation",
    priority: "p0",
    story_points: 8,
    acceptance_criteria: ["Transactions must balance to zero"],
  },
  {
    id: "story-2",
    epic_id: "epic-2",
    initiative_id: mockInitiative.id,
    title: "Webhook signature verification",
    priority: "p1",
    story_points: 5,
    acceptance_criteria: ["HMAC SHA-256 header"],
  },
];

const mockTasks: PMTask[] = [
  {
    id: "task-1",
    story_id: "story-1",
    epic_id: "epic-1",
    initiative_id: mockInitiative.id,
    title: "Implement database debit-credit schema",
    status: "done",
    priority: "p0",
    estimated_hours: 6,
    assigned_agent: "Database Engineer",
    generated_files: ["src/db/ledger.ts"],
  },
  {
    id: "task-2",
    story_id: "story-2",
    epic_id: "epic-2",
    initiative_id: mockInitiative.id,
    title: "Build webhook dispatcher service",
    status: "todo",
    priority: "p1",
    estimated_hours: 8,
    assigned_agent: "Backend Specialist",
    dependencies: ["task-1"], // task-1 is done, so task-2 is unblocked
  },
  {
    id: "task-3",
    story_id: "story-2",
    epic_id: "epic-2",
    initiative_id: mockInitiative.id,
    title: "Configure dead-letter queue",
    status: "todo",
    priority: "p2",
    estimated_hours: 4,
    assigned_agent: "Infrastructure Specialist",
    dependencies: ["task-2"], // task-2 is todo (not done), so task-3 is BLOCKED!
  },
];

const mockExecutions: PMExecution[] = [
  {
    id: "exec-1",
    initiative_id: mockInitiative.id,
    task_id: "task-1",
    agent: "developer",
    status: "completed",
    started_at: new Date().toISOString(),
  },
];

describe("GraphTab Redesign from Scratch", () => {
  beforeEach(() => {
    usePMStore.setState({
      initiative: mockInitiative,
      prd: null,
      epics: mockEpics,
      stories: mockStories,
      tasks: mockTasks,
      executions: mockExecutions,
      sprints: [],
      loading: false,
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the executive telemetry header with real metrics", () => {
    render(
      <BrowserRouter>
        <GraphTab />
      </BrowserRouter>
    );

    // Header title and node/edge count badge
    expect(screen.getByText("Dependency & Lineage Graph")).toBeTruthy();
    expect(screen.getByText(/nodes ·/)).toBeTruthy();

    // Critical Path and Blocked status indicators
    expect(screen.getByText("Path:")).toBeTruthy();
    expect(screen.getByText("Blocked:")).toBeTruthy();
    expect(screen.getByText("Zero Cycles")).toBeTruthy();
  });

  it("renders the multi-layer filter bar with search, focus modes, and layer pills", () => {
    render(
      <BrowserRouter>
        <GraphTab />
      </BrowserRouter>
    );

    // Search bar
    expect(
      screen.getByPlaceholderText(/Search nodes, labels, assignees/i)
    ).toBeTruthy();

    // Focus mode buttons
    expect(screen.getByRole("button", { name: /^All$/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Critical Path/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Blocked/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /In-Progress/i })).toBeTruthy();

    // Layer pills
    expect(screen.getByRole("button", { name: /Initiative/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Epics/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Stories/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tasks/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Agent Runs/i })).toBeTruthy();
  });

  it("displays nodes across layers in the canvas", () => {
    render(
      <BrowserRouter>
        <GraphTab />
      </BrowserRouter>
    );

    // Root initiative node
    expect(
      screen.getByText("Autonomous Clearing & Settlement Engine")
    ).toBeTruthy();

    // Epic nodes
    expect(screen.getByText("Double-Entry Ledger Core")).toBeTruthy();
    expect(screen.getByText("Real-Time Settlement Webhooks")).toBeTruthy();

    // Story nodes
    expect(screen.getByText("Idempotent debit-credit validation")).toBeTruthy();

    // Task nodes
    expect(
      screen.getByText("Implement database debit-credit schema")
    ).toBeTruthy();
  });

  it("filters nodes when searching", () => {
    render(
      <BrowserRouter>
        <GraphTab />
      </BrowserRouter>
    );

    const searchInput = screen.getByPlaceholderText(
      /Search nodes, labels, assignees/i
    );
    fireEvent.change(searchInput, { target: { value: "Webhooks" } });

    // Webhooks epic should remain visible
    expect(screen.getByText("Real-Time Settlement Webhooks")).toBeTruthy();

    // Ledger epic should be filtered out
    expect(screen.queryByText("Double-Entry Ledger Core")).toBeNull();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getByText("Double-Entry Ledger Core")).toBeTruthy();
  });

  it("filters to blocked tasks when clicking Blocked focus mode", () => {
    render(
      <BrowserRouter>
        <GraphTab />
      </BrowserRouter>
    );

    const blockedBtn = screen.getByRole("button", { name: /Blocked/i });
    fireEvent.click(blockedBtn);

    // task-3 is blocked, so it should be visible
    expect(screen.getByText("Configure dead-letter queue")).toBeTruthy();

    // task-1 is done (not blocked)
    expect(
      screen.queryByText("Implement database debit-credit schema")
    ).toBeNull();
  });

  it("switches layout modes between Horizontal, Vertical, and Radial", () => {
    render(
      <BrowserRouter>
        <GraphTab />
      </BrowserRouter>
    );

    const verticalBtn = screen.getByRole("button", { name: /^Vertical$/i });
    fireEvent.click(verticalBtn);

    // Should remain rendered without error
    expect(screen.getByText("Double-Entry Ledger Core")).toBeTruthy();

    const radialBtn = screen.getByRole("button", { name: /^Radial$/i });
    fireEvent.click(radialBtn);
    expect(screen.getByText("Double-Entry Ledger Core")).toBeTruthy();

    const horizontalBtn = screen.getByRole("button", { name: /^Horizontal$/i });
    fireEvent.click(horizontalBtn);
    expect(screen.getByText("Double-Entry Ledger Core")).toBeTruthy();
  });

  it("opens the Node Inspector drawer when clicking a node", async () => {
    render(
      <BrowserRouter>
        <GraphTab />
      </BrowserRouter>
    );

    // Click on task-3 node
    const taskTitle = screen.getByText("Configure dead-letter queue");
    fireEvent.click(taskTitle);

    // Inspector should open
    const inspector = screen.getByLabelText("Node Inspector");
    expect(inspector).toBeTruthy();
    expect(within(inspector).getByText(/Tasks Inspector/i)).toBeTruthy();
    expect(within(inspector).getByText("Infrastructure Specialist")).toBeTruthy();

    // Check upstream prerequisites: task-3 depends on task-2
    expect(within(inspector).getByText(/Upstream Prerequisites/i)).toBeTruthy();

    // Close inspector
    const closeBtn = screen.getByLabelText("Close Inspector");
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByLabelText("Node Inspector")).toBeNull();
    });
  });

  it("opens the Topology Diagnostics modal and displays health metrics", () => {
    render(
      <BrowserRouter>
        <GraphTab />
      </BrowserRouter>
    );

    const diagnosticsBtn = screen.getByRole("button", {
      name: /Diagnostics/i,
    });
    fireEvent.click(diagnosticsBtn);

    expect(
      screen.getByText(/Topology Diagnostics & Dependency Health/i)
    ).toBeTruthy();
    expect(screen.getByText("DAG Acyclicity")).toBeTruthy();
    expect(screen.getByText("Strict DAG")).toBeTruthy();
    expect(screen.getByText(/Parallelism Index/i)).toBeTruthy();

    // Dismiss modal
    const dismissBtn = screen.getByRole("button", { name: /Dismiss/i });
    fireEvent.click(dismissBtn);

    expect(
      screen.queryByText(/Topology Diagnostics & Dependency Health/i)
    ).toBeNull();
  });

  it("toggles layer visibility when clicking a layer filter pill", () => {
    render(
      <BrowserRouter>
        <GraphTab />
      </BrowserRouter>
    );

    // Toggle Epics layer off
    const epicsPill = screen.getByRole("button", { name: /Epics/i });
    fireEvent.click(epicsPill);

    expect(screen.queryByText("Double-Entry Ledger Core")).toBeNull();

    // Toggle Epics layer back on
    fireEvent.click(epicsPill);
    expect(screen.getByText("Double-Entry Ledger Core")).toBeTruthy();
  });
});
