import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { usePMStore } from "../../store/pmStore";
import ActivityTab from "./ActivityTab";
import type { PMInitiative, PMTask, PMExecution } from "../../lib/types/api";

const mockInitiative: PMInitiative = {
  id: "init-test-activity",
  user_id: "user-1",
  name: "Distributed Event Mesh",
  status: "active",
  version: 1,
  vision: "High-throughput real-time event distribution fabric.",
  estimated_timeline: "3 Sprints",
};

const mockTasks: PMTask[] = [
  {
    id: "task-101",
    epic_id: "epic-1",
    story_id: "story-1",
    initiative_id: mockInitiative.id,
    title: "Implement Kafka event bus consumer group",
    status: "done",
    assigned_agent: "BackendEng",
  },
  {
    id: "task-102",
    epic_id: "epic-1",
    story_id: "story-2",
    initiative_id: mockInitiative.id,
    title: "Configure dead letter queue re-drive policy",
    status: "blocked",
    assigned_agent: "DevOpsAgent",
  },
];

const mockExecutions: PMExecution[] = [
  {
    id: "exec-101",
    task_id: "task-101",
    initiative_id: mockInitiative.id,
    agent: "BackendEng",
    status: "completed",
    tokens_used: 3500,
    cost_usd: 0.0105,
    duration_seconds: 14.2,
    current_thought: "Verified all unit tests and schema deserialization for Kafka stream.",
    logs: [
      "[INFO] Worker connected to Kafka broker at localhost:9092",
      "[INFO] Subscribed to topic 'audit-events-v1'",
      "[SUCCESS] 500 events processed without offset desync",
    ],
    generated_files: ["src/consumers/auditConsumer.ts"],
    started_at: "2026-09-22T08:00:00Z",
    completed_at: "2026-09-22T08:00:14Z",
  },
  {
    id: "exec-102",
    task_id: "task-102",
    initiative_id: mockInitiative.id,
    agent: "DevOpsAgent",
    status: "running",
    tokens_used: 1200,
    cost_usd: 0.0036,
    duration_seconds: 5.1,
    current_thought: "Investigating broker network partition and IAM credential expiry.",
    logs: [
      "[INFO] Probing AWS SQS dead-letter queue",
      "[WARN] Authorization token expired for role arn:aws:iam::prod-dlq-manager",
    ],
    started_at: "2026-09-22T08:30:00Z",
  },
];

const mockDecisions = [
  {
    taskId: "task-102",
    summary: "Dead Letter Queue retry policy requires exponential backoff with jitter",
    recommendedNextTasks: ["Increase DLQ visibility timeout to 300s"],
    bottlenecks: ["IAM credentials rate limit in us-east-1"],
    at: Date.now() - 3600000,
  },
];

describe("ActivityTab Component (Redesigned)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePMStore.setState({
      initiative: mockInitiative,
      tasks: mockTasks,
      executions: mockExecutions,
      decisionFeed: mockDecisions,
      refreshExecutions: vi.fn().mockResolvedValue(undefined),
      refreshTasks: vi.fn().mockResolvedValue(undefined),
      addExecutionLocal: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders executive telemetry metrics and live stream header", () => {
    render(<ActivityTab />);

    expect(screen.getByText("Activity Timeline & Agent Fleet Telemetry")).toBeDefined();
    expect(screen.getByText("Live Audit")).toBeDefined();

    // Check metric headers
    expect(screen.getByText("Fleet Executions")).toBeDefined();
    expect(screen.getByText("Compute & Tokens")).toBeDefined();
    expect(screen.getByText("Neural Decisions")).toBeDefined();
    expect(screen.getByText("Mean Agent Latency")).toBeDefined();

    // Token count formatted
    expect(screen.getByText("4,700")).toBeDefined(); // 3500 + 1200
  });

  it("renders chronological activity events and actor badges", () => {
    render(<ActivityTab />);

    // Agent executions should be visible
    expect(
      screen.getByText('BackendEng worked on "Implement Kafka event bus consumer group"')
    ).toBeDefined();
    expect(screen.getAllByText("BackendEng").length).toBeGreaterThan(0);

    // Neural decision item should be visible
    expect(
      screen.getByText(
        "Dead Letter Queue retry policy requires exponential backoff with jitter"
      )
    ).toBeDefined();

    // Blocked alert should be visible
    expect(
      screen.getByText('Task Blocked: "Configure dead letter queue re-drive policy"')
    ).toBeDefined();
  });

  it("filters activity events by category pills", async () => {
    render(<ActivityTab />);

    // Click on "Decisions" category pill
    const decisionsPill = screen.getByRole("button", { name: "Decisions" });
    fireEvent.click(decisionsPill);

    // Decision item should be present
    expect(
      screen.getByText(
        "Dead Letter Queue retry policy requires exponential backoff with jitter"
      )
    ).toBeDefined();

    // Agent execution should be filtered out
    expect(
      screen.queryByText('BackendEng worked on "Implement Kafka event bus consumer group"')
    ).toBeNull();
  });

  it("filters activity events by search query", async () => {
    render(<ActivityTab />);

    const searchInput = screen.getByPlaceholderText(
      "Search by task, agent persona, logs, or thoughts..."
    );
    fireEvent.change(searchInput, { target: { value: "Kafka" } });

    // Should match Kafka consumer task execution
    expect(
      screen.getByText('BackendEng worked on "Implement Kafka event bus consumer group"')
    ).toBeDefined();

    // Non-matching events should not be in the list
    expect(
      screen.queryByText('Task Blocked: "Configure dead letter queue re-drive policy"')
    ).toBeNull();
  });

  it("opens the event inspector drawer and views logs and thoughts", async () => {
    render(<ActivityTab />);

    // Click on the BackendEng event
    const eventCard = screen.getByText(
      'BackendEng worked on "Implement Kafka event bus consumer group"'
    );
    fireEvent.click(eventCard);

    // Drawer should open
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Terminal Output & Logs")).toBeDefined();
    expect(screen.getByText("Copy Logs")).toBeDefined();

    // Check log line in terminal view
    expect(
      screen.getByText("[INFO] Worker connected to Kafka broker at localhost:9092")
    ).toBeDefined();

    // Switch to Neural Reasoning & Context tab
    const thoughtsTab = screen.getByRole("button", { name: "Neural Reasoning & Context" });
    fireEvent.click(thoughtsTab);

    expect(screen.getByText("Agent Thought Stream")).toBeDefined();
    expect(
      screen.getAllByText(
        "Verified all unit tests and schema deserialization for Kafka stream."
      ).length
    ).toBeGreaterThan(0);
  });

  it("opens export audit log modal and renders markdown report", async () => {
    render(<ActivityTab />);

    const exportBtn = screen.getByRole("button", { name: /Export Log/i });
    fireEvent.click(exportBtn);

    // Modal should open
    expect(screen.getByText("Export Activity & Fleet Audit Log")).toBeDefined();
    expect(screen.getByRole("button", { name: /Copy Markdown/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Download \.md/i })).toBeDefined();
  });
});
