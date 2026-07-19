import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { usePMStore } from "../../store/pmStore";
import AgentRunsTab from "./AgentRunsTab";

// AgentRunsTab fetches standups over the network on mount; stub it so the
// test doesn't depend on a running backend.
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
    standup: vi.fn(),
  },
}));

// Renders AgentRunsTab against the exact response shapes returned by the
// real local backend (curl'd from /initiatives, /initiatives/{id}/prd,
// /epics, /stories, /tasks, /sprints, /sprints/{id}/standups,
// /agent-executions during manual verification) to catch field-mapping
// mismatches a typecheck alone wouldn't.
const initiative = {
  id: "2e92a0da-1038-4158-ae55-00fec5c52b21",
  user_id: "7e478c34-99c6-4792-a612-f3d73691a0af",
  name: "Self-serve seat downgrade",
  status: "active",
  vision:
    "Teams on annual plans can't reduce seat count without contacting support, driving avoidable churn tickets and a 4-day median resolution time.",
  risks: [{ description: "contract minimums per plan tier are unconfirmed" }],
};

const prd = {
  id: "22c8fc3d-8787-4a95-8e7f-a06769952b41",
  version: 1,
  solution:
    "Admins can reduce seat count from Billing -> Plan without a support ticket.",
  personas: [{ name: "Workspace admin" }, { name: "Billing owner" }],
};

const epics = [
  {
    id: "0c671fb2-1d70-4a2f-9bd0-67be9a113cf6",
    title: "Self-serve downgrade flow",
    priority: "p0",
    estimated_duration: "Billing - admin-facing",
  },
];

const stories = [
  {
    id: "6af0665b-84ee-42c3-8b7f-01ca5db3fbba",
    epic_id: "0c671fb2-1d70-4a2f-9bd0-67be9a113cf6",
    title: "As an admin, I want to see the exact credit before confirming.",
    acceptance_criteria: ["Credit shown matches proration engine output"],
  },
];

const tasks = [
  {
    id: "c818822b-ec31-48dd-b494-363b20035660",
    title: "Add proration preview endpoint",
    category: "backend",
    dependencies: [],
    estimated_hours: 3,
  },
];

const sprints = [
  {
    id: "be566781-c496-4659-b6ec-d198bd944d3b",
    sprint_number: 1,
    name: "Sprint 1",
    capacity: 32,
    status: "active",
    team_load: { Frontend: 28, Backend: 34, QA: 10 },
  },
];

const executions = [
  {
    id: "125660ee-a504-4275-9df3-73f7dcbb07dd",
    task_id: "c818822b-ec31-48dd-b494-363b20035660",
    agent: "backend_agent",
    status: "running",
    current_thought: "Running tests",
    progress: 75,
    logs: [
      "checked out branch task/3390-proration-endpoint",
      "4 passed, 1 failed - test_proration_currency_locale",
    ],
    cost_usd: 0.17,
    tokens_used: 22880,
    duration_seconds: 13,
  },
];

const decisionFeed = [
  {
    taskId: "c818822b-ec31-48dd-b494-363b20035660",
    summary: "Re-estimated proration task after a 2h overrun.",
    recommendedNextTasks: ["Add proration edge-case tests"],
    bottlenecks: ["Backend over capacity by 2h"],
    at: Date.now(),
  },
];

describe("AgentRunsTab", () => {
  beforeEach(() => {
    usePMStore.setState({
      initiative,
      prd,
      epics,
      stories,
      tasks,
      sprints,
      executions,
      decisionFeed,
      loading: false,
    } as any);
  });

  it("renders every agent's run shell against real API-shaped data without throwing", async () => {
    render(<AgentRunsTab />);
    expect(screen.getByText(/Business Analyst/)).toBeTruthy();
    expect(screen.getByText(/Decision Engine/)).toBeTruthy();
    expect(screen.getByText(/PRD Writer/)).toBeTruthy();
    expect(screen.getByText(/Epic Generator/)).toBeTruthy();
    expect(screen.getByText(/Story Generator/)).toBeTruthy();
    expect(screen.getByText(/Task Generator/)).toBeTruthy();
    expect(screen.getByText(/Sprint Planner/)).toBeTruthy();
    expect(screen.getByText(/Scrum Master/)).toBeTruthy();
    expect(screen.getByText(/Task Executor/)).toBeTruthy();
    expect(screen.getAllByText(/Self-serve downgrade flow/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Re-estimated proration task/)).toBeTruthy();
    expect(screen.getByText(/Running tests/)).toBeTruthy();
    expect(screen.getByText(/Integration/)).toBeTruthy();
    expect(screen.getByText(/No tech stack defined for this initiative yet/)).toBeTruthy();
    expect(screen.getByText(/doesn't have a backend data source in the initiative pipeline yet/)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByText(/Currency formatting per locale/)).toBeTruthy()
    );
  });
});
