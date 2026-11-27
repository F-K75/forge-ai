import { describe, expect, it } from "vitest";
import type { CommandCenterSummary } from "./commandCenterApi";
import {
  applyCommandCenterSummary,
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
    // Raw runs carry no history: no comparison is invented.
    expect(overview.stats.activeRunsDelta).toBeNull();
    expect(overview.stats.agentsDelta).toBeNull();
    expect(overview.stats.spendDeltaPct).toBeNull();
    expect(overview.stats.skillsDelta).toBeNull();
  });
});

describe("applyCommandCenterSummary", () => {
  const cmp = (current: number, delta: number | null) => ({
    current,
    previous: delta === null ? null : current - delta,
    delta,
    compared_to: null,
    unavailable_reason: delta === null ? ("no_baseline" as const) : null,
  });
  const summary = (spend: Partial<CommandCenterSummary["stats"]["spend_today"]> = {}): CommandCenterSummary => ({
    window: "24h",
    generated_at: iso(0),
    scope: { project_count: 2, projects_truncated: false, max_projects: 50, history_truncated: false },
    stats: {
      active_runs: cmp(5, 2),
      agents_working: cmp(3, null),
      pending_approvals: cmp(1, null),
      spend_today: {
        current_usd: 2.25,
        previous_usd: 3,
        delta_pct: -24.6,
        compared_to: "yesterday_same_time",
        unavailable_reason: null,
        daily_budget_usd: null,
        active_run_caps_usd: 7.5,
        ...spend,
      },
      skills_invoked: cmp(12, -3),
    },
    activity: [
      { id: "r1:start", kind: "run_started", at: iso(10), project_id: "p1", project_name: "Alpha", run_id: "r1", title: "Ship the thing. With details.", actor: null },
      { id: "r1:g:decided", kind: "gate_rejected", at: iso(20), project_id: "p1", project_name: "Alpha", run_id: "r1", title: "Delivery", actor: "system" },
      { id: "d1:failed", kind: "deploy_failed", at: iso(30), project_id: "p2", project_name: "", run_id: null, title: "docker", actor: null },
    ],
  });

  it("takes stats and activity from the summary, keeping null comparisons null", () => {
    const base = overviewFromKernelRuns([{ projectId: "p1", projectName: "Alpha", runs: [] }], null, NOW);
    const merged = applyCommandCenterSummary(base, summary());
    expect(merged.stats).toEqual({
      activeRuns: 5,
      activeRunsDelta: 2,
      agentsWorking: 3,
      agentsDelta: null,
      pendingApprovals: 1,
      spendTodayUsd: 2.25,
      budgetUsd: 7.5,
      spendDeltaPct: -25,
      skillsInvoked24h: 12,
      skillsDelta: -3,
    });
    expect(merged.activity.map((a) => [a.kind, a.actor, a.text, a.projectName, a.href])).toEqual([
      ["run_started", "Lead Orchestrator", "started “Ship the thing”", "Alpha", "/p/p1/agents?run=r1"],
      ["gate_rejected", "System", "rejected Delivery", "Alpha", "/p/p1/agents?run=r1"],
      ["deploy_failed", "Deploy", "failed for docker", "p2", undefined],
    ]);
    expect(merged.runs).toBe(base.runs);
  });

  it("prefers a configured daily budget and passes a null spend delta through", () => {
    const base = overviewFromKernelRuns([], null, NOW);
    const merged = applyCommandCenterSummary(base, summary({ daily_budget_usd: 20, delta_pct: null }));
    expect(merged.stats.budgetUsd).toBe(20);
    expect(merged.stats.spendDeltaPct).toBeNull();
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
