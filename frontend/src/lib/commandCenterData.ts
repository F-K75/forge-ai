// Command Center ("agentic OS home") view model.
//
// The page renders one `FleetOverview`. In LIVE_MODE it is assembled from the
// kernel runs of the user's projects (kernelApi.listRuns), the LLM gateway
// health endpoint and the projects list, then the stat tiles and activity feed
// are replaced by the backend's fleet summary (commandCenterApi.summary), which
// carries the comparison values behind the deltas. In demo mode it comes from
// `buildDemoOverview`, which reuses the demo project catalogue in mockData.

import type { CommandCenterSummary, SummaryActivityEvent } from "./commandCenterApi";
import type { KernelRun, KernelRunStatus } from "./kernelApi";
import { PROJECTS } from "./mockData";

export type FleetRunStatus = "planning" | "running" | "awaiting_approval" | "failed";

export interface FleetAgent {
  role: string;
  name: string;
}

export interface FleetRun {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  objective: string;
  status: FleetRunStatus;
  progress: number;
  totalTasks: number;
  completedTasks: number;
  agents: FleetAgent[];
  costUsd: number;
  startedAt: string;
  href: string;
}

export interface FleetGate {
  id: string;
  runId: string;
  projectId: string;
  projectName: string;
  gateName: string;
  reason: string;
  createdAt: string;
}

export type ActivityKind =
  | "run_started"
  | "task_completed"
  | "gate_opened"
  | "gate_approved"
  | "gate_rejected"
  | "run_failed"
  | "run_completed"
  | "run_cancelled"
  | "skill_invoked"
  | "deploy_started"
  | "deploy_live"
  | "deploy_failed";

export interface ActivityEvent {
  id: string;
  at: string;
  kind: ActivityKind;
  actor: string;
  text: string;
  projectName: string;
  href?: string;
}

export type CircuitState = "closed" | "half_open" | "open";

export interface GatewayProvider {
  name: string;
  kind: "local" | "cloud";
  healthy: boolean;
  circuit: CircuitState;
  model?: string | null;
}

export interface GatewaySummary {
  providers: GatewayProvider[];
  /** Share of model calls served by local providers, 0–1. */
  localShare: number;
  calls24h: number;
}

/**
 * Stat tile values. A `null` delta means there is no honest comparison (no
 * history, no baseline): the tile shows no delta at all rather than "0".
 */
export interface FleetStats {
  activeRuns: number;
  /** vs the same time yesterday. */
  activeRunsDelta: number | null;
  agentsWorking: number;
  /** vs one hour ago. */
  agentsDelta: number | null;
  pendingApprovals: number;
  spendTodayUsd: number;
  budgetUsd: number;
  /** % change vs yesterday over the same elapsed time. */
  spendDeltaPct: number | null;
  skillsInvoked24h: number;
  /** vs the prior 24h. */
  skillsDelta: number | null;
}

export interface FleetOverview {
  runs: FleetRun[];
  gates: FleetGate[];
  activity: ActivityEvent[];
  /** null when the gateway can't be read (e.g. the user isn't an admin). */
  gateway: GatewaySummary | null;
  stats: FleetStats;
  projectCount: number;
}

// ─── Formatting helpers ─────────────────────────────────────────────────────

const ACRONYMS = new Set(["qa", "ui", "ux", "ai", "pm", "ml", "api", "sre"]);

export function roleLabel(role: string): string {
  return role
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

export function firstNameOf(name: string | undefined | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0];
}

export function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h < 5) return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function fleetSummaryLine(runs: FleetRun[]): string {
  const inFlight = runs.filter((r) => r.status !== "failed");
  if (inFlight.length === 0) return "No runs in flight. Describe something to build to start one.";
  const projects = new Set(inFlight.map((r) => r.projectId)).size;
  const runWord = inFlight.length === 1 ? "run" : "runs";
  const projWord = projects === 1 ? "project" : "projects";
  return `${inFlight.length} ${runWord} in flight across ${projects} ${projWord}`;
}

const LOCAL_PROVIDER_HINTS = ["ollama", "lmstudio", "lm_studio", "vllm", "local", "llama"];

export function isLocalProvider(name: string): boolean {
  const n = name.toLowerCase();
  return LOCAL_PROVIDER_HINTS.some((h) => n.includes(h));
}

// ─── Live mapping ───────────────────────────────────────────────────────────

const ACTIVE_STATUSES: KernelRunStatus[] = ["planned", "running", "waiting_approval"];

export function mapRunStatus(status: KernelRunStatus): FleetRunStatus | null {
  switch (status) {
    case "planned":
      return "planning";
    case "running":
      return "running";
    case "waiting_approval":
      return "awaiting_approval";
    case "failed":
    case "partial_failure":
      return "failed";
    default:
      return null;
  }
}

function shortTitle(objective: string): string {
  const firstLine = objective.split(/\n|\. /)[0].trim();
  return firstLine.length > 64 ? `${firstLine.slice(0, 61)}…` : firstLine;
}

function runAgents(run: KernelRun): FleetAgent[] {
  const seen = new Map<string, FleetAgent>();
  for (const t of run.tasks ?? []) {
    if (!seen.has(t.role)) seen.set(t.role, { role: t.role, name: roleLabel(t.role) });
  }
  return [...seen.values()];
}

function isWithin(iso: string | null | undefined, ms: number, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && now - t <= ms;
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Build the overview from raw kernel runs. Only runs that are active, or
 * failed within the last day, are listed; everything else only feeds the
 * activity timeline and 24h counters.
 */
export function overviewFromKernelRuns(
  runsByProject: Array<{ projectId: string; projectName: string; runs: KernelRun[] }>,
  gateway: GatewaySummary | null,
  now: number = Date.now(),
): FleetOverview {
  const runs: FleetRun[] = [];
  const gates: FleetGate[] = [];
  const activity: ActivityEvent[] = [];
  let spendToday = 0;
  let budget = 0;
  let skills24h = 0;
  const workingRoles = new Set<string>();

  for (const { projectId, projectName, runs: projectRuns } of runsByProject) {
    for (const run of projectRuns) {
      const status = mapRunStatus(run.status);
      const href = `/p/${projectId}/agents?run=${encodeURIComponent(run.id)}`;
      const total = run.metrics?.total_tasks ?? run.tasks?.length ?? 0;
      const done = run.metrics?.completed_tasks ?? 0;
      const cost = run.cost_summary?.spent_usd ?? run.metrics?.total_cost_usd ?? 0;

      if (isWithin(run.created_at, DAY, now)) {
        spendToday += cost;
        skills24h += run.skill_activations?.length ?? run.metrics?.skill_activation_count ?? 0;
      }

      const isActive = ACTIVE_STATUSES.includes(run.status);
      if (isActive) budget += run.cost_summary?.max_budget_usd ?? run.config?.max_budget_usd ?? 0;

      if (status && (isActive || isWithin(run.finished_at ?? run.created_at, DAY, now))) {
        runs.push({
          id: run.id,
          projectId,
          projectName,
          title: shortTitle(run.objective),
          objective: run.objective,
          status,
          progress: total > 0 ? (done / total) * 100 : 0,
          totalTasks: total,
          completedTasks: done,
          agents: runAgents(run),
          costUsd: cost,
          startedAt: run.started_at ?? run.created_at,
          href,
        });
      }

      if (run.status === "running") {
        for (const t of run.tasks ?? []) if (t.status === "running") workingRoles.add(`${run.id}:${t.role}`);
      }

      for (const g of run.approval_gates ?? []) {
        if (g.status === "pending") {
          gates.push({
            id: g.gate_id,
            runId: run.id,
            projectId,
            projectName,
            gateName: g.gate_name,
            reason: g.reason,
            createdAt: g.created_at,
          });
          activity.push({
            id: `${run.id}:${g.gate_id}:open`,
            at: g.created_at,
            kind: "gate_opened",
            actor: "Lead Orchestrator",
            text: `requested approval: ${g.gate_name}`,
            projectName,
            href,
          });
        } else if (g.decided_at) {
          activity.push({
            id: `${run.id}:${g.gate_id}:decided`,
            at: g.decided_at,
            kind: g.status === "approved" ? "gate_approved" : "gate_rejected",
            actor: g.decided_by || "You",
            text: `${g.status === "approved" ? "approved" : "rejected"} ${g.gate_name}`,
            projectName,
            href,
          });
        }
      }

      activity.push({
        id: `${run.id}:start`,
        at: run.started_at ?? run.created_at,
        kind: "run_started",
        actor: "Lead Orchestrator",
        text: `started “${shortTitle(run.objective)}”`,
        projectName,
        href,
      });
      if (run.finished_at) {
        const failed = run.status === "failed" || run.status === "partial_failure";
        activity.push({
          id: `${run.id}:end`,
          at: run.finished_at,
          kind: failed ? "run_failed" : "run_completed",
          actor: "Lead Orchestrator",
          text: failed ? `run failed: ${shortTitle(run.objective)}` : `shipped “${shortTitle(run.objective)}”`,
          projectName,
          href,
        });
      }
    }
  }

  const order: Record<FleetRunStatus, number> = {
    awaiting_approval: 0,
    running: 1,
    planning: 2,
    failed: 3,
  };
  runs.sort((a, b) => order[a.status] - order[b.status] || Date.parse(b.startedAt) - Date.parse(a.startedAt));
  gates.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  activity.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  const activeCount = runs.filter((r) => r.status !== "failed").length;
  return {
    runs,
    gates,
    activity: activity.slice(0, 8),
    gateway,
    projectCount: runsByProject.length,
    stats: {
      activeRuns: activeCount,
      // Raw runs carry no history to compare against; see applyCommandCenterSummary.
      activeRunsDelta: null,
      agentsWorking: workingRoles.size,
      agentsDelta: null,
      pendingApprovals: gates.length,
      spendTodayUsd: spendToday,
      budgetUsd: budget,
      spendDeltaPct: null,
      skillsInvoked24h: skills24h,
      skillsDelta: null,
    },
  };
}

// ─── Backend fleet summary ──────────────────────────────────────────────────

const ORCHESTRATOR = "Lead Orchestrator";

function summaryActivity(ev: SummaryActivityEvent): ActivityEvent {
  const title = ev.title ? shortTitle(ev.title) : "";
  const href = ev.run_id
    ? `/p/${ev.project_id}/agents?run=${encodeURIComponent(ev.run_id)}`
    : undefined;
  const base = { id: ev.id, at: ev.at, projectName: ev.project_name || ev.project_id, href };
  const decider = ev.actor === "system" ? "System" : ev.actor || "A reviewer";
  switch (ev.kind) {
    case "run_started":
      return { ...base, kind: "run_started", actor: ORCHESTRATOR, text: `started “${title}”` };
    case "run_completed":
      return { ...base, kind: "run_completed", actor: ORCHESTRATOR, text: `shipped “${title}”` };
    case "run_failed":
      return { ...base, kind: "run_failed", actor: ORCHESTRATOR, text: `run failed: ${title}` };
    case "run_cancelled":
      return { ...base, kind: "run_cancelled", actor: ORCHESTRATOR, text: `cancelled “${title}”` };
    case "gate_opened":
      return { ...base, kind: "gate_opened", actor: ORCHESTRATOR, text: `requested approval: ${title}` };
    case "gate_approved":
      return { ...base, kind: "gate_approved", actor: decider, text: `approved ${title}` };
    case "gate_rejected":
      return { ...base, kind: "gate_rejected", actor: decider, text: `rejected ${title}` };
    case "deploy_started":
      return { ...base, kind: "deploy_started", actor: "Deploy", text: `started to ${title}` };
    case "deploy_live":
      return { ...base, kind: "deploy_live", actor: "Deploy", text: `went live at ${title}` };
    case "deploy_failed":
      return { ...base, kind: "deploy_failed", actor: "Deploy", text: `failed for ${title}` };
  }
}

/**
 * Overlay the backend fleet summary on an overview built from raw runs. The
 * stat tiles (with their real comparisons; a null comparison stays null) and
 * the activity feed come from the summary, which spans every accessible
 * project and includes deploys. Runs, gates and gateway health are unchanged.
 */
export function applyCommandCenterSummary(
  overview: FleetOverview,
  summary: CommandCenterSummary,
): FleetOverview {
  const { stats } = summary;
  const spend = stats.spend_today;
  return {
    ...overview,
    activity: summary.activity.map(summaryActivity),
    stats: {
      activeRuns: stats.active_runs.current,
      activeRunsDelta: stats.active_runs.delta,
      agentsWorking: stats.agents_working.current,
      agentsDelta: stats.agents_working.delta,
      pendingApprovals: stats.pending_approvals.current,
      spendTodayUsd: spend.current_usd,
      budgetUsd: spend.daily_budget_usd ?? spend.active_run_caps_usd,
      spendDeltaPct: spend.delta_pct === null ? null : Math.round(spend.delta_pct),
      skillsInvoked24h: stats.skills_invoked.current,
      skillsDelta: stats.skills_invoked.delta,
    },
  };
}

export interface GatewayHealthResponse {
  status?: string;
  providers?: Array<{
    name: string;
    healthy?: boolean;
    degraded?: boolean;
    default_model?: string | null;
  }>;
}

export function gatewayFromHealth(
  health: GatewayHealthResponse,
  runs: KernelRun[] = [],
): GatewaySummary {
  const providers: GatewayProvider[] = (health.providers ?? []).map((p) => ({
    name: p.name,
    kind: isLocalProvider(p.name) ? "local" : "cloud",
    healthy: p.healthy !== false,
    circuit: p.degraded ? "open" : "closed",
    model: p.default_model ?? null,
  }));
  let local = 0;
  let total = 0;
  for (const run of runs) {
    for (const t of run.tasks ?? []) {
      if (!t.model_id && !t.model_tier) continue;
      total += 1;
      if (isLocalProvider(`${t.model_id ?? ""} ${t.model_tier ?? ""}`)) local += 1;
    }
  }
  return { providers, localShare: total > 0 ? local / total : 0, calls24h: total };
}

// ─── Demo data ──────────────────────────────────────────────────────────────

function ago(now: number, minutes: number): string {
  return new Date(now - minutes * 60_000).toISOString();
}

const agent = (role: string): FleetAgent => ({ role, name: roleLabel(role) });

function projectName(id: string): string {
  if (id === "demo-project") return "Forge Core Engine";
  return PROJECTS.find((p) => p.id === id)?.name ?? id;
}

/** Realistic, self-consistent demo fleet. Times are relative to `now`. */
export function buildDemoOverview(now: number = Date.now()): FleetOverview {
  const runs: FleetRun[] = [
    {
      id: "run-7f3a",
      projectId: "demo-project",
      projectName: projectName("demo-project"),
      title: "SAML single sign-on for the admin console",
      objective: "Add SAML 2.0 SSO with Okta and Entra ID, plus SCIM user provisioning.",
      status: "awaiting_approval",
      progress: 72,
      totalTasks: 18,
      completedTasks: 13,
      agents: [
        agent("solution_architect"),
        agent("backend_engineer"),
        agent("security_engineer"),
        agent("qa_engineer"),
        agent("code_reviewer"),
      ],
      costUsd: 4.18,
      startedAt: ago(now, 94),
      href: "/p/demo-project/agents?run=run-7f3a",
    },
    {
      id: "run-2c91",
      projectId: "proj-001",
      projectName: projectName("proj-001"),
      title: "Streak heatmap and weekly insights",
      objective: "Ship a GitHub-style streak heatmap with a weekly insights email digest.",
      status: "running",
      progress: 48,
      totalTasks: 12,
      completedTasks: 6,
      agents: [agent("ui_designer"), agent("frontend_engineer"), agent("backend_engineer"), agent("qa_engineer")],
      costUsd: 1.72,
      startedAt: ago(now, 41),
      href: "/p/proj-001/agents?run=run-2c91",
    },
    {
      id: "run-b04e",
      projectId: "demo-project",
      projectName: projectName("demo-project"),
      title: "Migrate job queue to Redis Streams",
      objective: "Replace the polling worker with Redis Streams consumer groups and back-pressure.",
      status: "running",
      progress: 31,
      totalTasks: 15,
      completedTasks: 5,
      agents: [agent("system_architect"), agent("backend_engineer"), agent("reliability_engineer")],
      costUsd: 2.06,
      startedAt: ago(now, 23),
      href: "/p/demo-project/agents?run=run-b04e",
    },
    {
      id: "run-e6d2",
      projectId: "proj-002",
      projectName: projectName("proj-002"),
      title: "Walk-forward optimisation mode",
      objective: "Add walk-forward optimisation with configurable in-sample and out-of-sample windows.",
      status: "planning",
      progress: 6,
      totalTasks: 9,
      completedTasks: 0,
      agents: [agent("product_manager"), agent("solution_architect")],
      costUsd: 0.21,
      startedAt: ago(now, 4),
      href: "/p/proj-002/agents?run=run-e6d2",
    },
  ];

  const gates: FleetGate[] = [
    {
      // Ids match src/lib/demo/approvalsDemo.ts so "Review" deep-links open the same gate.
      id: "gate_delivery_7c41",
      runId: "run-7f3a",
      projectId: "demo-project",
      projectName: projectName("demo-project"),
      gateName: "Delivery approval",
      reason: "Security review passed with 2 low findings. Merge 14 files into main?",
      createdAt: ago(now, 6),
    },
    {
      id: "gate_budget_52aa",
      runId: "run-2c91",
      projectId: "proj-001",
      projectName: projectName("proj-001"),
      gateName: "Budget overrun",
      reason: "Projected spend $3.40 exceeds the run budget of $2.50 by 36%.",
      createdAt: ago(now, 18),
    },
  ];

  const activity: ActivityEvent[] = [
    { id: "a1", at: ago(now, 2), kind: "task_completed", actor: "QA Engineer", text: "passed 42 integration tests on the SSO callback", projectName: projectName("demo-project"), href: runs[0].href },
    { id: "a2", at: ago(now, 4), kind: "run_started", actor: "Product Manager", text: "started planning walk-forward optimisation", projectName: projectName("proj-002"), href: runs[3].href },
    { id: "a3", at: ago(now, 6), kind: "gate_opened", actor: "Lead Orchestrator", text: "requested delivery approval", projectName: projectName("demo-project"), href: runs[0].href },
    { id: "a4", at: ago(now, 11), kind: "skill_invoked", actor: "Security Engineer", text: "ran security-threat-audit on 14 files", projectName: projectName("demo-project"), href: runs[0].href },
    { id: "a5", at: ago(now, 18), kind: "gate_opened", actor: "Database Engineer", text: "requested a schema migration review", projectName: projectName("proj-001"), href: runs[1].href },
    { id: "a6", at: ago(now, 52), kind: "run_failed", actor: "Lead Orchestrator", text: "PDF export run failed after 3 repair rounds", projectName: projectName("proj-005") },
    { id: "a7", at: ago(now, 126), kind: "run_completed", actor: "Release Manager", text: "shipped invoice tax line items", projectName: projectName("proj-005") },
  ];

  const gateway: GatewaySummary = {
    providers: [
      { name: "anthropic", kind: "cloud", healthy: true, circuit: "closed", model: "claude-sonnet" },
      { name: "openai", kind: "cloud", healthy: true, circuit: "half_open", model: "gpt-4.1" },
      { name: "ollama", kind: "local", healthy: true, circuit: "closed", model: "qwen2.5-coder:14b" },
    ],
    localShare: 0.38,
    calls24h: 1284,
  };

  const agentsWorking = new Set(
    runs.filter((r) => r.status === "running" || r.status === "awaiting_approval").flatMap((r) => r.agents.map((a) => `${r.id}:${a.role}`)),
  ).size;

  return {
    runs,
    gates,
    activity,
    gateway,
    projectCount: 6,
    stats: {
      activeRuns: runs.length,
      activeRunsDelta: 2,
      agentsWorking,
      agentsDelta: 3,
      pendingApprovals: gates.length,
      spendTodayUsd: 8.17,
      budgetUsd: 25,
      spendDeltaPct: -12,
      skillsInvoked24h: 146,
      skillsDelta: 18,
    },
  };
}
