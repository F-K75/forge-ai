import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { usePMStore } from "../../store/pmStore";
import KanbanTab, { normalizePriority } from "./KanbanTab";

vi.mock("../../lib/pmApi", () => ({
  tasksApi: {
    execute: vi.fn().mockResolvedValue({}),
    updateStatus: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("../../lib/geminiPM", () => ({
  executeTaskWithGemini: vi.fn().mockResolvedValue({
    thought: "Done",
    tokens_used: 100,
    cost_usd: 0.01,
    duration_seconds: 2,
    logs: ["completed"],
  }),
}));

const mockTasks = [
  {
    id: "task-1",
    title: "Implement OAuth token refresh",
    description: "Handle expired Google OAuth tokens gracefully",
    status: "backlog",
    assigned_agent: "backend_agent",
    priority: "p0",
    category: "backend",
    sprint_id: "sprint-1",
  },
  {
    id: "task-2",
    title: "Design Responsive Navigation Header",
    description: "Create mobile drawer and desktop navbar",
    status: "in_progress",
    assigned_agent: "frontend_agent",
    priority: "p1",
    category: "frontend",
    sprint_id: "sprint-1",
  },
  {
    id: "task-3",
    title: "End-to-End Cypress Integration Tests",
    description: "Write smoke tests for the billing checkout flow",
    status: "testing",
    assigned_agent: "qa_agent",
    priority: "p2",
    category: "qa",
    sprint_id: "sprint-2",
  },
  {
    id: "task-4",
    title: "Database Index Tuning on Audit Logs",
    description: "Optimize B-tree indexes for fast queries",
    status: "done",
    assigned_agent: "systems_agent",
    priority: "p3",
    category: "infrastructure",
    sprint_id: "sprint-2",
  },
  {
    id: "task-5",
    title: "Documentation for Public REST API",
    description: "Write OpenAPI 3.0 spec for developer portal",
    status: "backlog",
    assigned_agent: undefined,
    priority: "p2",
    category: "docs",
    sprint_id: "sprint-1",
  },
];

const mockSprints = [
  { id: "sprint-1", sprint_number: 1, name: "Sprint 1", capacity: 40, status: "active" },
  { id: "sprint-2", sprint_number: 2, name: "Sprint 2", capacity: 40, status: "planning" },
];

describe("KanbanTab Search and Filter", () => {
  beforeEach(() => {
    cleanup();
    usePMStore.setState({
      tasks: mockTasks as any,
      sprints: mockSprints as any,
      initiative: { id: "init-1", name: "Test Initiative", tech_stack: ["React", "TypeScript"] } as any,
    });
  });

  it("renders search input, priority filter, assignee filter, and all initial tasks", () => {
    render(<KanbanTab />);

    const searchInput = screen.getByPlaceholderText(/search tasks by keyword/i);
    expect(searchInput).toBeTruthy();
    expect(screen.getByLabelText(/filter by priority level/i)).toBeTruthy();
    expect(screen.getByLabelText(/filter by assignee/i)).toBeTruthy();
    expect(screen.getByLabelText(/filter by sprint/i)).toBeTruthy();

    expect(screen.getByText(/Implement OAuth token refresh/i)).toBeTruthy();
    expect(screen.getByText(/Design Responsive Navigation Header/i)).toBeTruthy();
    expect(screen.getByText(/End-to-End Cypress Integration Tests/i)).toBeTruthy();
    expect(screen.getByText(/Database Index Tuning on Audit Logs/i)).toBeTruthy();
    expect(screen.getByText(/Documentation for Public REST API/i)).toBeTruthy();

    // Verification of count indicator
    expect(screen.getByText(/SHOWING/i)).toBeTruthy();
    expect(screen.getByText(/5 TASKS/i)).toBeTruthy();
  });

  it("filters tasks by keyword in title", () => {
    render(<KanbanTab />);
    const searchInput = screen.getByPlaceholderText(/search tasks by keyword/i);

    fireEvent.change(searchInput, { target: { value: "Cypress" } });

    expect(screen.getByLabelText(/End-to-End Cypress Integration Tests/i)).toBeTruthy();
    expect(screen.queryByText(/Implement OAuth token refresh/i)).toBeNull();
    expect(screen.queryByText(/Design Responsive Navigation Header/i)).toBeNull();
  });

  it("filters tasks by keyword in description", () => {
    render(<KanbanTab />);
    const searchInput = screen.getByPlaceholderText(/search tasks by keyword/i);

    fireEvent.change(searchInput, { target: { value: "OpenAPI" } });

    expect(screen.getByText(/Documentation for Public REST API/i)).toBeTruthy();
    expect(screen.queryByText(/Implement OAuth token refresh/i)).toBeNull();
  });

  it("filters tasks by assignee using search bar keyword", () => {
    render(<KanbanTab />);
    const searchInput = screen.getByPlaceholderText(/search tasks by keyword/i);

    // Searching "qa" should match qa_agent
    fireEvent.change(searchInput, { target: { value: "qa" } });

    expect(screen.getByText(/End-to-End Cypress Integration Tests/i)).toBeTruthy();
    expect(screen.queryByText(/Implement OAuth token refresh/i)).toBeNull();
  });

  it("filters tasks by priority level using search bar keyword (e.g. p0, critical)", () => {
    render(<KanbanTab />);
    const searchInput = screen.getByPlaceholderText(/search tasks by keyword/i);

    // Searching "p0"
    fireEvent.change(searchInput, { target: { value: "p0" } });
    expect(screen.getByText(/Implement OAuth token refresh/i)).toBeTruthy();
    expect(screen.queryByText(/Design Responsive Navigation Header/i)).toBeNull();

    // Searching "critical"
    fireEvent.change(searchInput, { target: { value: "critical" } });
    expect(screen.getByText(/Implement OAuth token refresh/i)).toBeTruthy();
    expect(screen.queryByText(/Design Responsive Navigation Header/i)).toBeNull();
  });

  it("filters tasks by priority level dropdown", () => {
    render(<KanbanTab />);
    const prioritySelect = screen.getByLabelText(/filter by priority level/i);

    // Select P1 - HIGH
    fireEvent.change(prioritySelect, { target: { value: "p1" } });

    expect(screen.getByText(/Design Responsive Navigation Header/i)).toBeTruthy();
    expect(screen.queryByText(/Implement OAuth token refresh/i)).toBeNull();
    expect(screen.queryByText(/End-to-End Cypress Integration Tests/i)).toBeNull();
  });

  it("filters tasks by assignee dropdown", () => {
    render(<KanbanTab />);
    const assigneeSelect = screen.getByLabelText(/filter by assignee/i);

    // Select BACKEND AGENT
    fireEvent.change(assigneeSelect, { target: { value: "backend_agent" } });

    expect(screen.getByText(/Implement OAuth token refresh/i)).toBeTruthy();
    expect(screen.queryByText(/Design Responsive Navigation Header/i)).toBeNull();
  });

  it("filters unassigned tasks using assignee dropdown", () => {
    render(<KanbanTab />);
    const assigneeSelect = screen.getByLabelText(/filter by assignee/i);

    fireEvent.change(assigneeSelect, { target: { value: "unassigned" } });

    expect(screen.getByText(/Documentation for Public REST API/i)).toBeTruthy();
    expect(screen.queryByText(/Implement OAuth token refresh/i)).toBeNull();
  });

  it("filters tasks using quick priority chips", () => {
    render(<KanbanTab />);

    // Click P0 chip
    const p0Chip = screen.getByRole("button", { name: /^P0 \(\d+\)$/i });
    fireEvent.click(p0Chip);

    expect(screen.getByText(/Implement OAuth token refresh/i)).toBeTruthy();
    expect(screen.queryByText(/Design Responsive Navigation Header/i)).toBeNull();

    // Click ALL chip to reset
    const allChip = screen.getByRole("button", { name: /^ALL \(\d+\)$/i });
    fireEvent.click(allChip);

    expect(screen.getByText(/Implement OAuth token refresh/i)).toBeTruthy();
    expect(screen.getByText(/Design Responsive Navigation Header/i)).toBeTruthy();
  });

  it("clears search input with clear button and resets all filters with reset button", () => {
    render(<KanbanTab />);
    const searchInput = screen.getByPlaceholderText(/search tasks by keyword/i);

    fireEvent.change(searchInput, { target: { value: "OAuth" } });
    expect(screen.queryByText(/Design Responsive Navigation Header/i)).toBeNull();

    // Clear search with X button
    const clearBtn = screen.getByLabelText(/clear search input/i);
    fireEvent.click(clearBtn);

    expect(screen.getByText(/Design Responsive Navigation Header/i)).toBeTruthy();

    // Filter by priority and then use RESET button
    const prioritySelect = screen.getByLabelText(/filter by priority level/i);
    fireEvent.change(prioritySelect, { target: { value: "p3" } });
    expect(screen.queryByText(/Implement OAuth token refresh/i)).toBeNull();

    const resetBtn = screen.getByRole("button", { name: /reset/i });
    fireEvent.click(resetBtn);

    expect(screen.getByText(/Implement OAuth token refresh/i)).toBeTruthy();
    expect(screen.getByText(/Design Responsive Navigation Header/i)).toBeTruthy();
  });

  it("shows zero state banner when no tasks match", () => {
    render(<KanbanTab />);
    const searchInput = screen.getByPlaceholderText(/search tasks by keyword/i);

    fireEvent.change(searchInput, { target: { value: "nonexistent query xyz" } });

    expect(screen.getByText(/no tasks match your search/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /clear all filters/i })).toBeTruthy();

    // Click clear all filters
    fireEvent.click(screen.getByRole("button", { name: /clear all filters/i }));
    expect(screen.getByText(/Implement OAuth token refresh/i)).toBeTruthy();
  });

  it("normalizePriority normalizes variations correctly", () => {
    expect(normalizePriority("p0")).toBe("p0");
    expect(normalizePriority("P0")).toBe("p0");
    expect(normalizePriority("critical")).toBe("p0");
    expect(normalizePriority("urgent")).toBe("p0");
    expect(normalizePriority("p1")).toBe("p1");
    expect(normalizePriority("high")).toBe("p1");
    expect(normalizePriority("p2")).toBe("p2");
    expect(normalizePriority("medium")).toBe("p2");
    expect(normalizePriority("med")).toBe("p2");
    expect(normalizePriority("p3")).toBe("p3");
    expect(normalizePriority("low")).toBe("p3");
    expect(normalizePriority(undefined)).toBe("");
  });
});

describe("KanbanTab Task Dependencies and Blockers", () => {
  const dependencyTasks = [
    {
      id: "task-1",
      title: "Implement OAuth token refresh",
      description: "Prerequisite for frontend auth flow",
      status: "in_progress",
      priority: "p0",
      assigned_agent: "backend_agent",
      dependencies: [],
    },
    {
      id: "task-2",
      title: "Design Responsive Navigation Header",
      description: "Depends on OAuth token refresh",
      status: "backlog",
      priority: "p1",
      assigned_agent: "frontend_agent",
      dependencies: ["task-1"], // Blocked by task-1
    },
    {
      id: "task-3",
      title: "Database Schema Migration",
      description: "Already completed foundation",
      status: "done",
      priority: "p1",
      assigned_agent: "backend_agent",
      dependencies: [],
    },
    {
      id: "task-4",
      title: "Audit Logging Service",
      description: "Depends on completed schema migration",
      status: "backlog",
      priority: "p2",
      assigned_agent: "backend_agent",
      dependencies: ["task-3"], // Unblocked because task-3 is done
    },
  ];

  beforeEach(() => {
    cleanup();
    usePMStore.setState({
      tasks: dependencyTasks as any,
      sprints: [
        { id: "sprint-1", sprint_number: 1, name: "Sprint 1", capacity: 40, status: "active" },
      ] as any,
      initiative: { id: "init-1", name: "Test Initiative", tech_stack: ["React", "TypeScript"] } as any,
    });
  });

  it("visually displays BLOCKED and BLOCKS badges on cards with active blockers", () => {
    render(<KanbanTab />);

    // task-2 is blocked by task-1 (which is in_progress, not done)
    const blockedBadge = document.getElementById("kanban-blocker-badge-task-2");
    expect(blockedBadge).toBeTruthy();
    expect(blockedBadge?.textContent).toContain("BLOCKED (1)");

    // task-1 blocks downstream task-2
    const blocksBadge = document.getElementById("kanban-blocks-badge-task-1");
    expect(blocksBadge).toBeTruthy();
    expect(blocksBadge?.textContent).toContain("BLOCKS 1");

    // task-4's prerequisite (task-3) is done, so it shows UNBLOCKED
    const unblockedBadge = document.getElementById("kanban-unblocked-badge-task-4");
    expect(unblockedBadge).toBeTruthy();
    expect(unblockedBadge?.textContent).toContain("UNBLOCKED");
  });

  it("filters tasks when clicking the BLOCKED ONLY filter chip", () => {
    render(<KanbanTab />);

    const blockedChip = document.getElementById("kanban-blocked-only-filter-btn");
    expect(blockedChip).toBeTruthy();

    fireEvent.click(blockedChip!);

    // Only task-2 has an active unresolved blocker
    expect(screen.getByText(/Design Responsive Navigation Header/i)).toBeTruthy();
    expect(screen.queryByText(/Audit Logging Service/i)).toBeNull();
    expect(screen.queryByText(/Database Schema Migration/i)).toBeNull();

    // Clicking it again toggles it off
    fireEvent.click(blockedChip!);
    expect(screen.getByText(/Audit Logging Service/i)).toBeTruthy();
  });

  it("toggles dependency arrows on and off via the toolbar button", () => {
    render(<KanbanTab />);

    const arrowToggleBtn = document.getElementById("kanban-toggle-arrows-btn");
    expect(arrowToggleBtn).toBeTruthy();
    expect(arrowToggleBtn?.textContent).toContain("ARROWS: ON");

    // Clicking toggles to OFF
    fireEvent.click(arrowToggleBtn!);
    expect(arrowToggleBtn?.textContent).toContain("ARROWS: OFF");

    // Clicking again toggles back to ON
    fireEvent.click(arrowToggleBtn!);
    expect(arrowToggleBtn?.textContent).toContain("ARROWS: ON");
  });

  it("opens TaskDependencyModal when clicking DEPS button on a card", () => {
    render(<KanbanTab />);

    const task2DepsBtn = document.getElementById("kanban-link-deps-btn-task-2");
    expect(task2DepsBtn).toBeTruthy();

    // Click DEPS on task-2
    fireEvent.click(task2DepsBtn!);

    // Modal should be visible with title and sections
    expect(screen.getByText(/Task Dependencies & Blockers/i)).toBeTruthy();
    expect(screen.getByText(/Link New Dependency \/ Blocker/i)).toBeTruthy();
  });

  it("links and unlinks dependencies via the modal and updates store", () => {
    render(<KanbanTab />);

    // Open modal for task-1 (which currently has 0 dependencies)
    const task1DepsBtn = document.getElementById("kanban-link-deps-btn-task-1");
    expect(task1DepsBtn).toBeTruthy();
    fireEvent.click(task1DepsBtn!);

    expect(screen.getByText(/Task Dependencies & Blockers/i)).toBeTruthy();

    // Select task-3 as a prerequisite dependency
    const depSelect = document.getElementById("candidate-dependency-select");
    expect(depSelect).toBeTruthy();
    fireEvent.change(depSelect!, { target: { value: "task-3" } });

    // Click Link Dependency button
    const linkBtn = document.getElementById("add-dependency-btn");
    expect(linkBtn).toBeTruthy();
    fireEvent.click(linkBtn!);

    // Check that store has updated task-1's dependencies to include task-3
    const updatedTask1 = usePMStore.getState().tasks.find((t) => t.id === "task-1");
    expect(updatedTask1?.dependencies).toContain("task-3");

    // Now test unlinking task-3 from task-1
    const unlinkBtn = document.getElementById("unlink-dep-task-3");
    expect(unlinkBtn).toBeTruthy();
    fireEvent.click(unlinkBtn!);

    const afterUnlink = usePMStore.getState().tasks.find((t) => t.id === "task-1");
    expect(afterUnlink?.dependencies).not.toContain("task-3");
  });

  it("prevents circular dependencies by excluding downstream tasks from candidate options", () => {
    render(<KanbanTab />);

    // task-2 depends on task-1 (task-1 -> task-2)
    // If task-1 were to depend on task-2, it would create a circular dependency (task-1 -> task-2 -> task-1)
    const task1DepsBtn = document.getElementById("kanban-link-deps-btn-task-1");
    fireEvent.click(task1DepsBtn!);

    const depSelect = document.getElementById("candidate-dependency-select") as HTMLSelectElement;
    expect(depSelect).toBeTruthy();

    const options = Array.from(depSelect.options).map((opt) => opt.value);
    // task-2 must NOT be present as an option because it would create a cycle!
    expect(options).not.toContain("task-2");
    // task-3 and task-4 should be available
    expect(options).toContain("task-3");
    expect(options).toContain("task-4");
  });

  it("supports switching between 12-column grid and continuous lanes view modes", () => {
    render(<KanbanTab />);

    const gridBtn = document.getElementById("kanban-view-mode-grid");
    const lanesBtn = document.getElementById("kanban-view-mode-lanes");
    expect(gridBtn).toBeTruthy();
    expect(lanesBtn).toBeTruthy();

    // Default is 12-column grid
    const backlogCol = document.getElementById("kanban-column-backlog");
    expect(backlogCol?.className).toContain("col-span-12");

    // Switch to lanes
    fireEvent.click(lanesBtn!);
    expect(backlogCol?.className).toContain("w-[300px]");

    // Switch back to 12-col grid
    fireEvent.click(gridBtn!);
    expect(backlogCol?.className).toContain("col-span-12");
  });

  it("filters visible columns with column presets (Active Sprint, Core Flow, QA)", () => {
    render(<KanbanTab />);

    // Switch to Active Sprint preset
    const activePresetBtn = document.getElementById("kanban-column-preset-active");
    expect(activePresetBtn).toBeTruthy();
    fireEvent.click(activePresetBtn!);

    // In Active preset: Ready, In Progress, Code Review, Testing are visible; Backlog is hidden
    expect(document.getElementById("kanban-column-ready")).toBeTruthy();
    expect(document.getElementById("kanban-column-in_progress")).toBeTruthy();
    expect(document.getElementById("kanban-column-backlog")).toBeNull();

    // Switch to All Columns preset
    const allPresetBtn = document.getElementById("kanban-column-preset-all");
    fireEvent.click(allPresetBtn!);
    expect(document.getElementById("kanban-column-backlog")).toBeTruthy();
  });
});
