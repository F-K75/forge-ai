import { describe, expect, it } from "vitest";
import {
  buildDemoOverview,
  firstNameOf,
  fleetSummaryLine,
  gatewayFromHealth,
  greetingFor,
  mapRunStatus,
  overviewFromKernelRuns,
  roleLabel,
} from "./commandCenterData";
import type { KernelRun } from "./kernelApi";

const NOW = Date.parse("2026-11-26T18:00:00Z");
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

function run(partial: Partial<KernelRun> & Pick<KernelRun, "id" | "status">): KernelRun {
  return {
    project_id: "p1",
    objective: "Ship the thing. With details.",
    tasks: [],
    waves: [],
    delegations: [],
    config: {} as KernelRun["config"],
    risk_level: "low",
    risk_notes: "",
    created_at: iso(30),
    duration_ms: 0,
    metrics: { total_tasks: 10, wave_count: 1, max_parallelism: 1, completed_tasks: 4, failed_tasks: 0, blocked_tasks: 0, delegation_count: 0 },
    ...partial,
  };
}

describe("commandCenterData helpers", () => {
  it("formats names, roles and greetings", () => {
    expect(firstNameOf("Maya Sharma")).toBe("Maya");
    expect(firstNameOf("")).toBe("there");
    expect(roleLabel("backend_engineer")).toBe("Backend Engineer");
    expect(greetingFor(new Date(2026, 0, 1, 9))).toBe("Good morning");
    expect(greetingFor(new Date(2026, 0, 1, 14))).toBe("Good afternoon");
    expect(greetingFor(new Date(2026, 0, 1, 21))).toBe("Good evening");
  });

  it("summarises in-flight runs across projects", () => {
    const demo = buildDemoOverview(NOW);
    expect(fleetSummaryLine(demo.runs)).toBe("4 runs in flight across 3 projects");
    expect(fleetSummaryLine([])).toMatch(/No runs in flight/);
  });

  it("maps kernel statuses to dashboard pills", () => {
    expect(mapRunStatus("planned")).toBe("planning");
    expect(mapRunStatus("waiting_approval")).toBe("awaiting_approval");
    expect(mapRunStatus("partial_failure")).toBe("failed");
    expect(mapRunStatus("completed")).toBeNull();
  });
});

describe("overviewFromKernelRuns", () => {
  it("lists active runs, pending gates and counts working agents", () => {
    const overview = overviewFromKernelRuns(
      [
        {
          projectId: "p1",
          projectName: "Alpha",
          runs: [
            run({
              id: "r1",
              status: "running",
              tasks: [
                { id: "t1", title: "", role: "backend_engineer", department: "", description: "", depends_on: [], wave_index: 0, status: "running", attempts: 1, duration_ms: 0 },
                { id: "t2", title: "", role: "qa_engineer", department: "", description: "", depends_on: [], wave_index: 0, status: "pending", attempts: 0, duration_ms: 0 },
              ],
              cost_summary: { max_budget_usd: 10, spent_usd: 1.5, remaining_usd: 8.5, utilization_pct: 15 },
              skill_activations: [{ skill_name: "api-hardening", domain: "", version: "", origin: "", score: 1, resolved_dependencies: [], instructions_excerpt: "" }],
            }),
            run({
              id: "r2",
              status: "waiting_approval",
              approval_gates: [
                { gate_id: "g1", gate_name: "Delivery", reason: "Merge?", wave_index: 1, status: "pending", note: "", created_at: iso(5) },
              ],
            }),
            run({ id: "r3", status: "completed", finished_at: iso(60 * 30) }),
          ],
        },
      ],
      null,
      NOW,
    );

    expect(overview.runs.map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(overview.runs[1].progress).toBe(40);
    expect(overview.runs[1].agents.map((a) => a.name)).toEqual(["Backend Engineer", "QA Engineer"]);
    expect(overview.runs[1].href).toBe("/p/p1/agents?run=r1");
    expect(overview.gates).toHaveLength(1);
    expect(overview.stats).toMatchObject({
      activeRuns: 2,
      agentsWorking: 1,
      pendingApprovals: 1,
      spendTodayUsd: 1.5,
      skillsInvoked24h: 1,
    });
    expect(overview.activity[0].kind).toBe("gate_opened");
  });
});

describe("gatewayFromHealth", () => {
  it("classifies local providers and open circuits", () => {
    const gw = gatewayFromHealth({
      providers: [
        { name: "anthropic", healthy: true, degraded: false },
        { name: "ollama", healthy: true, degraded: true },
      ],
    });
    expect(gw.providers).toEqual([
      expect.objectContaining({ name: "anthropic", kind: "cloud", circuit: "closed" }),
      expect.objectContaining({ name: "ollama", kind: "local", circuit: "open" }),
    ]);
  });
});
