import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { usePMStore } from "../../store/pmStore";
import ReleasesTab from "./ReleasesTab";
import type { PMInitiative, PMStory, PMTask, PMSprint } from "../../lib/types/api";

const mockInitiative: PMInitiative = {
  id: "init-test-123",
  user_id: "user-1",
  name: "Enterprise Multi-Region Federation",
  status: "active",
  version: 1,
  vision: "Global low-latency synchronization across distributed clusters.",
  estimated_timeline: "4-Quarter Horizon",
};

const mockStories: PMStory[] = [
  {
    id: "story-1",
    epic_id: "epic-1",
    initiative_id: mockInitiative.id,
    title: "Cross-region database replication engine",
    priority: "p0",
    story_points: 8,
    status: "done",
    acceptance_criteria: ["Replication lag < 50ms"],
  },
  {
    id: "story-2",
    epic_id: "epic-1",
    initiative_id: mockInitiative.id,
    title: "Global DNS failover automation",
    priority: "p1",
    story_points: 5,
    status: "done",
    acceptance_criteria: ["Automated health check probes"],
  },
];

const mockTasks: PMTask[] = [
  {
    id: "task-1",
    epic_id: "epic-1",
    story_id: "story-1",
    initiative_id: mockInitiative.id,
    title: "Deploy multi-region CockroachDB cluster",
    status: "done",
    assigned_agent: "DevOpsAgent",
  },
  {
    id: "task-2",
    epic_id: "epic-1",
    story_id: "story-2",
    initiative_id: mockInitiative.id,
    title: "Configure Route53 latency routing policies",
    status: "done",
    assigned_agent: "CloudEng",
  },
];

const mockSprints: PMSprint[] = [
  {
    id: "sprint-1",
    initiative_id: mockInitiative.id,
    sprint_number: 1,
    name: "Sprint 1 — Core Topology",
    status: "active",
    start_date: "2026-09-01T00:00:00Z",
    end_date: "2026-09-14T00:00:00Z",
  },
];

describe("ReleasesTab Component (Redesigned)", () => {
  beforeEach(() => {
    localStorage.clear();
    usePMStore.setState({
      initiative: mockInitiative,
      stories: mockStories,
      tasks: mockTasks,
      sprints: mockSprints,
      loading: false,
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders the redesigned releases header, metrics, and spotlight banner", async () => {
    render(<ReleasesTab />);

    // Header check
    expect(
      screen.getByText("Release Management & Orchestration")
    ).toBeInTheDocument();
    expect(screen.getByText("SemVer Cadence")).toBeInTheDocument();

    // Primary action buttons
    expect(screen.getByText("Changelog")).toBeInTheDocument();
    expect(screen.getByText("Auto-Compile")).toBeInTheDocument();
    expect(screen.getByText("New Release")).toBeInTheDocument();

    // Telemetry strip
    expect(screen.getByText("Active Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Mean Confidence")).toBeInTheDocument();
    expect(screen.getByText("Shippable Scope")).toBeInTheDocument();
    expect(screen.getByText("Release Blockers")).toBeInTheDocument();

    // Spotlight banner
    await waitFor(() => {
      expect(screen.getByText("Target In-Flight Milestone")).toBeInTheDocument();
    });
  });

  it("renders release cards and allows searching releases", async () => {
    render(<ReleasesTab />);

    await waitFor(() => {
      expect(screen.getAllByText("v1.0.0").length).toBeGreaterThan(0);
      expect(screen.getAllByText("v1.1.0-rc1").length).toBeGreaterThan(0);
    });

    // Test search filter
    const searchInput = screen.getByPlaceholderText(
      /Search by version, deliverable, or approver/i
    );
    fireEvent.change(searchInput, { target: { value: "v1.0.0" } });

    expect(screen.getAllByText("v1.0.0").length).toBeGreaterThan(0);
    // In card grid, v1.1.0-rc1 card should not be present
    expect(screen.queryByTestId("release-card-rel-init-test-123-110")).not.toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: "" } });
    expect(screen.getAllByText("v1.1.0-rc1").length).toBeGreaterThan(0);
  });

  it("filters releases by status pills", async () => {
    render(<ReleasesTab />);

    await waitFor(() => {
      expect(screen.getAllByText("v1.0.0").length).toBeGreaterThan(0);
    });

    // Click 'Staging' filter
    const stagingBtn = screen.getByRole("button", { name: "Staging" });
    fireEvent.click(stagingBtn);

    expect(screen.getAllByText("v1.1.0-rc1").length).toBeGreaterThan(0);
    // v1.0.0 is released, so in grid it shouldn't be matched
    expect(document.getElementById("release-card-rel-init-test-123-100")).toBeNull();

    // Click 'All' filter to restore
    const allBtn = screen.getByRole("button", { name: "All" });
    fireEvent.click(allBtn);
    expect(screen.getAllByText("v1.0.0").length).toBeGreaterThan(0);
  });

  it("opens create release modal and adds a new release with semver bump", async () => {
    render(<ReleasesTab />);

    const newReleaseBtn = screen.getByRole("button", { name: /New Release/i });
    fireEvent.click(newReleaseBtn);

    // Modal should be open
    expect(screen.getByText("Create New Release Plan")).toBeInTheDocument();

    // Click 'Major' bump button
    const majorBtn = screen.getByRole("button", { name: "Major" });
    fireEvent.click(majorBtn);

    const versionInput = screen.getByLabelText(/Version Tag/i) as HTMLInputElement;
    expect(versionInput.value).toMatch(/^v\d+\.0\.0$/);

    // Fill custom deliverable and submit
    const textarea = screen.getByPlaceholderText(/e\.g\. User authentication/i);
    fireEvent.change(textarea, {
      target: { value: "Distributed consensus verification suite" },
    });

    const submitBtn = screen.getByRole("button", { name: "Create Plan" });
    fireEvent.click(submitBtn);

    // Modal should close and new release should appear
    await waitFor(() => {
      expect(screen.queryByText("Create New Release Plan")).not.toBeInTheDocument();
    });
  });

  it("opens release details inspection drawer and displays deployment readiness gates", async () => {
    render(<ReleasesTab />);

    await waitFor(() => {
      expect(screen.getByText("v1.0.0")).toBeInTheDocument();
    });

    // Click 'Manage' on the first release card
    const manageButtons = screen.getAllByRole("button", { name: /Manage/i });
    fireEvent.click(manageButtons[0]);

    // Drawer should open
    await waitFor(() => {
      expect(screen.getByText("Deployment Readiness Gates")).toBeInTheDocument();
      expect(screen.getByText("QA Test Suite Execution")).toBeInTheDocument();
      expect(screen.getByText("Zero P0 / Critical Blockers")).toBeInTheDocument();
      expect(screen.getByText("Formatted Release Notes")).toBeInTheDocument();
    });

    // Close drawer
    const doneBtn = screen.getByRole("button", { name: "Done" });
    fireEvent.click(doneBtn);

    await waitFor(() => {
      expect(
        screen.queryByText("Deployment Readiness Gates")
      ).not.toBeInTheDocument();
    });
  });

  it("opens consolidated changelog modal and allows copying markdown", async () => {
    render(<ReleasesTab />);

    const changelogBtn = screen.getByRole("button", { name: "Changelog" });
    fireEvent.click(changelogBtn);

    expect(
      screen.getByText("Initiative Changelog & Release Notes")
    ).toBeInTheDocument();
    expect(screen.getByText(/Copy Markdown/i)).toBeInTheDocument();
    expect(screen.getByText(/Download \.md/i)).toBeInTheDocument();
  });
});
