import { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Cpu,
  Database,
  FileWarning,
  GitBranch,
  Radio,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import {
  type A2AAgentCard,
  type A2UISurface,
  type AGUIEvent,
  type BenchmarkSuiteReport,
  type KernelRun,
  type KnowledgeHit,
  type KnowledgeSnapshot,
  type MarketplaceSkillPackage,
  type MCPAppSpec,
  type MCPToolSpec,
  type SkillManifest,
  type TenantGovernancePolicy,
} from "../lib/kernelApi";

export type InspectorTab =
  | "blackboard"
  | "repairs"
  | "skills"
  | "protocols"
  | "worktrees"
  | "memory"
  | "enterprise"
  | "delegations";

interface KernelInspectorPanelProps {
  activeRun: KernelRun;
  maxRepairRounds: number;
  skillsCatalog: SkillManifest[];
  mcpTools: MCPToolSpec[];
  mcpApps: MCPAppSpec[];
  a2aCard: A2AAgentCard;
  aguiEvents: AGUIEvent[];
  a2uiSurfaces: A2UISurface[];
  onInvokeMcpScan: (sampleCode: string) => Promise<void>;
  mcpScanResult: string | null;
  invokingMcp: boolean;
  onRegisterMcpServer: (serverId: string, endpointUrl: string) => Promise<void>;
  mcpRegisterStatus: string | null;
  registeringMcp: boolean;
  knowledgeSnapshot: KnowledgeSnapshot;
  memoryHits: KnowledgeHit[];
  onQueryMemory: (query: string) => Promise<void>;
  queryingMemory: boolean;
  benchmarkReport: BenchmarkSuiteReport | null;
  onRunBenchmarks: () => Promise<void>;
  runningBenchmarks: boolean;
  marketplacePackages: MarketplaceSkillPackage[];
  onInstallMarketplacePkg: (packageId: string) => Promise<void>;
  installingPkgId: string | null;
  marketplaceStatus: string | null;
  tenantPolicy: TenantGovernancePolicy;
  onUpdatePolicy: (
    patch: Partial<
      Pick<
        TenantGovernancePolicy,
        "max_run_budget_usd" | "require_approval_for_delivery" | "allow_local_llm_routing"
      >
    >,
  ) => Promise<void>;
}

export function KernelInspectorPanel({
  activeRun,
  maxRepairRounds,
  skillsCatalog,
  mcpTools,
  mcpApps,
  a2aCard,
  aguiEvents,
  a2uiSurfaces,
  onInvokeMcpScan,
  mcpScanResult,
  invokingMcp,
  onRegisterMcpServer,
  mcpRegisterStatus,
  registeringMcp,
  knowledgeSnapshot,
  memoryHits,
  onQueryMemory,
  queryingMemory,
  benchmarkReport,
  onRunBenchmarks,
  runningBenchmarks,
  marketplacePackages,
  onInstallMarketplacePkg,
  installingPkgId,
  marketplaceStatus,
  tenantPolicy,
  onUpdatePolicy,
}: KernelInspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("blackboard");
  const [skillSearch, setSkillSearch] = useState<string>("");
  const [skillDomainFilter, setSkillDomainFilter] = useState<string>("all");
  const [mcpSampleInput, setMcpSampleInput] = useState<string>(
    "const safe = textContent; // test MCP security.static_scan",
  );
  const [extServerId, setExtServerId] = useState<string>("docs-mcp");
  const [extServerUrl, setExtServerUrl] = useState<string>("https://mcp.example.com/rpc");
  const [memoryQuery, setMemoryQuery] = useState<string>("architecture security contract");

  const artifacts = activeRun.artifacts || [];
  const conflicts = activeRun.conflicts || [];
  const repairCycles = activeRun.repair_cycles || [];
  const skillActivations = activeRun.skill_activations || [];
  const worktrees = activeRun.worktrees || [];
  const reconciliations = activeRun.reconciliations || [];
  const evaluations = activeRun.evaluations || [];
  const traceSummary = activeRun.trace_summary;
  const policyEnforcements = activeRun.policy_enforcements || [];
  const costSummary = activeRun.cost_summary || {
    max_budget_usd: activeRun.config.max_budget_usd ?? 2.5,
    spent_usd: activeRun.metrics.total_cost_usd ?? 0,
    remaining_usd: activeRun.metrics.budget_remaining_usd ?? 2.5,
    utilization_pct: 0,
  };

  const skillDomains = useMemo(
    () => Array.from(new Set(skillsCatalog.map((s) => s.domain))).sort(),
    [skillsCatalog],
  );

  const filteredSkills = useMemo(() => {
    const q = skillSearch.trim().toLowerCase();
    return skillsCatalog.filter((s) => {
      if (skillDomainFilter !== "all" && s.domain !== skillDomainFilter) return false;
      if (!q) return true;
      return `${s.name} ${s.description} ${s.domain}`.toLowerCase().includes(q);
    });
  }, [skillsCatalog, skillDomainFilter, skillSearch]);

  const tabs: Array<{ id: InspectorTab; label: string; count: number; icon: typeof Database }> = [
    { id: "blackboard", label: "Blackboard", count: artifacts.length, icon: Database },
    { id: "repairs", label: "Repair Loops", count: repairCycles.length, icon: Wrench },
    { id: "skills", label: "Skills", count: skillActivations.length || skillsCatalog.length, icon: Sparkles },
    { id: "protocols", label: "Protocols", count: aguiEvents.length, icon: Radio },
    { id: "worktrees", label: "Worktrees & Evals", count: evaluations.length, icon: Cpu },
    { id: "memory", label: "Memory & Bench", count: knowledgeSnapshot.node_count, icon: BookOpen },
    {
      id: "enterprise",
      label: "Traces & Market",
      count: traceSummary?.span_count ?? marketplacePackages.length,
      icon: Activity,
    },
    { id: "delegations", label: "Delegations", count: activeRun.delegations.length, icon: ShieldCheck },
  ];

  return (
    <section
      aria-label="Multi-Agent Collaboration Inspector"
      className="rounded-lg border border-border bg-panel p-4 space-y-3"
    >
      <div className="overflow-x-auto border-b border-border pb-2">
        <div className="flex items-center gap-1 min-w-max" role="tablist">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActiveTab(tab.id)}
                className={`px-2.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                  selected
                    ? "bg-accent-soft text-accent border border-accent/40"
                    : "text-muted hover:text-ink"
                }`}
              >
                <Icon size={12} />
                <span>
                  {tab.label} ({tab.count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: Shared Blackboard & Parallel File Conflicts */}
      {activeTab === "blackboard" && (
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {conflicts.length > 0 && (
            <div className="space-y-1.5">
              {conflicts.map((conf) => (
                <div
                  key={conf.conflict_id}
                  className="rounded-md border border-warn/50 bg-warn/10 p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-warn flex items-center gap-1.5">
                      <FileWarning size={13} />
                      Parallel File Conflict · Wave {conf.wave_index}
                    </span>
                    <span className="font-mono text-[11px] text-warn">{conf.status}</span>
                  </div>
                  <p className="font-mono text-[11px] text-ink">{conf.file_path}</p>
                  <p className="text-[11px] text-muted">
                    Concurrent writers: {conf.roles.join(", ")}
                  </p>
                </div>
              ))}
            </div>
          )}

          {artifacts.length === 0 ? (
            <p className="text-xs text-muted py-4">
              Execute DAG waves to publish versioned Shared Blackboard artifacts (ADRs, API
              contracts, patches, security audits) with automatic file-conflict detection.
            </p>
          ) : (
            artifacts.map((art) => (
              <div
                key={art.artifact_id}
                className="rounded-md border border-border bg-base p-2.5 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    {art.producer_role} · <span className="text-accent">{art.artifact_type}</span>
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-muted">
                    v{art.version} · Wave {art.wave_index}
                  </span>
                </div>
                <p className="text-[11px] text-muted">{art.summary}</p>
                {art.touched_files.length > 0 && (
                  <p className="text-[11px] font-mono text-muted">
                    Files: {art.touched_files.join(" · ")}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: Autonomous Critique -> Remediation -> Re-Verification Loops */}
      {activeTab === "repairs" && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {repairCycles.length === 0 ? (
            <p className="text-xs text-muted py-4">
              When Security or QA agents emit blocking findings, the kernel automatically
              re-dispatches the owning engineer and re-verifies up to {maxRepairRounds} round(s).
            </p>
          ) : (
            repairCycles.map((cycle) => (
              <div
                key={cycle.cycle_id}
                className="rounded-md border border-border bg-base p-2.5 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-ink flex items-center gap-1">
                    {cycle.reviewer_role}
                    <ArrowRight size={11} className="text-muted" />
                    {cycle.target_role} · Round {cycle.round_number}
                  </span>
                  <span
                    className={`text-[11px] font-mono font-semibold ${
                      cycle.outcome === "resolved"
                        ? "text-ok"
                        : cycle.outcome === "escalated"
                          ? "text-warn"
                          : "text-err"
                    }`}
                  >
                    {cycle.outcome}
                  </span>
                </div>
                {cycle.findings.map((f) => (
                  <div key={f.finding_id} className="text-[11px] text-muted">
                    <span className="font-mono text-err mr-1">[{f.severity}]</span>
                    <span className="text-ink">{f.message}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: Intelligent Skill Engine (SKILL.md Discovery & Routing) */}
      {activeTab === "skills" && (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {skillActivations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-ink">
                Activated Skills in Current Run ({skillActivations.length})
              </p>
              <div className="divide-y divide-border rounded-md border border-border bg-base">
                {skillActivations.slice(0, 8).map((act, idx) => (
                  <div
                    key={`${act.skill_name}-${act.task_id || idx}`}
                    className="px-2.5 py-2 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-ink">{act.skill_name}</span>
                      <span className="text-muted">
                        {" "}
                        · {act.role || "agent"} · {act.domain.replace(/_/g, " ")}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-accent shrink-0">
                      score {act.score}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              aria-label="Search skills"
              value={skillSearch}
              onChange={(e) => setSkillSearch(e.target.value)}
              placeholder="Filter skills by name or capability..."
              className="flex-1 min-w-[160px] rounded border border-border bg-base px-2.5 py-1 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
            />
            <select
              aria-label="Filter skills by domain"
              value={skillDomainFilter}
              onChange={(e) => setSkillDomainFilter(e.target.value)}
              className="rounded border border-border bg-base px-2 py-1 text-xs text-ink"
            >
              <option value="all">All 9 Domains</option>
              {skillDomains.map((dom) => (
                <option key={dom} value={dom}>
                  {dom.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="divide-y divide-border rounded-md border border-border bg-base">
            {filteredSkills.map((skill) => (
              <div key={skill.name} className="p-2.5 text-xs space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-ink">
                    {skill.name}
                  </span>
                  <span className="text-[11px] text-muted font-mono">
                    {skill.origin} · {skill.domain.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-[11px] text-muted">{skill.description}</p>
                {skill.dependencies.length > 0 && (
                  <p className="text-[11px] font-mono text-muted">
                    Requires: {skill.dependencies.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: Protocol Gateway (AG-UI Stream, MCP Tools, A2UI Surfaces) */}
      {activeTab === "protocols" && (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {/* A2UI Declarative Surfaces */}
          {a2uiSurfaces.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-ink">
                A2UI Declarative Surfaces ({a2uiSurfaces.length})
              </p>
              {a2uiSurfaces.map((surface) => (
                <div
                  key={surface.surface_id}
                  className="rounded-md border border-border bg-base p-2.5 text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">{surface.title}</span>
                    <span className="font-mono text-[10px] text-muted">{surface.protocol}</span>
                  </div>
                  {surface.components.map((comp, idx) => {
                    if (comp.type === "metric_row" && Array.isArray(comp.items)) {
                      return (
                        <div
                          key={`${surface.surface_id}-m-${idx}`}
                          className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1"
                        >
                          {(comp.items as Array<{ label: string; value: string }>).map((item) => (
                            <div key={item.label} className="text-[11px]">
                              <div className="text-muted">{item.label}</div>
                              <div className="font-mono tabular-nums font-semibold text-ink">
                                {item.value}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Governed MCP Tool Gateway */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-ink">
              MCP Governed Tools ({mcpTools.length})
            </p>
            <div className="divide-y divide-border rounded-md border border-border bg-base">
              {mcpTools.map((tool) => (
                <div key={tool.name} className="px-2.5 py-2 text-[11px] space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold text-ink">{tool.name}</span>
                    <span className="font-mono text-muted">
                      {tool.server_id} · {tool.allowed_departments.length} depts
                    </span>
                  </div>
                  <p className="text-muted">{tool.description}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                aria-label="MCP static security scan snippet"
                value={mcpSampleInput}
                onChange={(e) => setMcpSampleInput(e.target.value)}
                className="flex-1 rounded border border-border bg-base px-2.5 py-1 text-xs font-mono text-ink focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                disabled={invokingMcp}
                onClick={() => void onInvokeMcpScan(mcpSampleInput)}
                className="px-2.5 py-1 rounded border border-border bg-base text-xs font-medium text-ink hover:border-accent/60 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Run MCP Scan
              </button>
            </div>
            {mcpScanResult && (
              <p className="text-[11px] font-mono text-ink bg-base border border-border rounded px-2.5 py-1.5">
                {mcpScanResult}
              </p>
            )}
          </div>

          {/* P1 MCP Apps (Declarative Interactive Tool Views) */}
          {mcpApps.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-ink">
                MCP Apps ({mcpApps.length})
              </p>
              <div className="divide-y divide-border rounded-md border border-border bg-base">
                {mcpApps.map((app) => (
                  <div key={app.app_id} className="px-2.5 py-2 text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">{app.title}</span>
                      <span className="font-mono text-muted">
                        {app.protocol} · {app.tool_name}
                      </span>
                    </div>
                    <p className="text-muted">{app.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* External Streamable HTTP MCP Server Registration */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-ink">
              Register External MCP Server (HTTPS)
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label="External MCP server ID"
                value={extServerId}
                onChange={(e) => setExtServerId(e.target.value)}
                placeholder="server-id"
                className="w-28 rounded border border-border bg-base px-2 py-1 text-xs font-mono text-ink focus:outline-none focus:border-accent"
              />
              <input
                type="url"
                aria-label="External MCP endpoint URL"
                value={extServerUrl}
                onChange={(e) => setExtServerUrl(e.target.value)}
                placeholder="https://mcp.example.com/rpc"
                className="flex-1 min-w-[160px] rounded border border-border bg-base px-2 py-1 text-xs font-mono text-ink focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                disabled={registeringMcp}
                onClick={() => void onRegisterMcpServer(extServerId, extServerUrl)}
                className="px-2.5 py-1 rounded border border-border bg-base text-xs font-medium text-ink hover:border-accent/60 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Register MCP
              </button>
            </div>
            {mcpRegisterStatus && (
              <p className="text-[11px] font-mono text-ink bg-base border border-border rounded px-2.5 py-1.5">
                {mcpRegisterStatus}
              </p>
            )}
          </div>

          {/* P1 A2A Agent Card */}
          <div className="rounded-md border border-border bg-base p-2.5 text-xs space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">A2A Agent Card · {a2aCard.name}</span>
              <span className="font-mono text-[10px] text-accent">{a2aCard.protocol}</span>
            </div>
            <p className="text-[11px] text-muted">
              {a2aCard.departments.length} departments · {a2aCard.skills.length} advertised skills ·{" "}
              {a2aCard.protocols_supported.join(" · ")}
            </p>
            <p className="text-[11px] font-mono text-muted truncate">
              Endpoint: {a2aCard.url}
            </p>
          </div>

          {/* AG-UI & AI SDK UI Stream Protocol v1 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-ink">
                AG-UI &amp; AI SDK UI Event Stream ({aguiEvents.length} events)
              </p>
              <span className="text-[10px] font-mono text-muted">
                x-vercel-ai-ui-message-stream: v1
              </span>
            </div>
            {aguiEvents.length === 0 ? (
              <p className="text-[11px] text-muted">
                Execute waves to stream live AG-UI state-delta and lifecycle events.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-md border border-border bg-base">
                {aguiEvents.slice(-8).reverse().map((ev) => (
                  <div
                    key={`agui-${ev.event_id}`}
                    className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] font-mono"
                  >
                    <span className="text-ink truncate">
                      #{ev.event_id} · {ev.agui_type} ·{" "}
                      <span className="text-muted">{ev.kernel_event}</span>
                    </span>
                    <span className="text-muted tabular-nums shrink-0">
                      {ev.timestamp.slice(11, 19)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Isolated Worktrees, Role Model Routing & Artifact Quality Evals */}
      {activeTab === "worktrees" && (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {/* Budget & Cost Guard Summary */}
          <div className="rounded-md border border-border bg-base p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">Run Cost Budget Guard</span>
              <span className="font-mono tabular-nums text-muted">
                ${costSummary.spent_usd.toFixed(4)} / ${costSummary.max_budget_usd.toFixed(2)} (
                {costSummary.utilization_pct.toFixed(1)}%)
              </span>
            </div>
            <progress
              aria-label="Run cost budget utilization"
              value={Math.min(100, Math.max(0, costSummary.utilization_pct))}
              max={100}
              className="h-1.5 w-full overflow-hidden rounded bg-panel-alt accent-accent"
            />
          </div>

          {/* Isolated Worktree Leases */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-ink flex items-center gap-1.5">
              <GitBranch size={12} className="text-accent" />
              Isolated Worktree Leases ({worktrees.length})
            </p>
            {worktrees.length === 0 ? (
              <p className="text-[11px] text-muted">
                Parallel engineering and infrastructure tasks automatically lease isolated
                worktrees during execution.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-md border border-border bg-base">
                {worktrees.map((wt) => (
                  <div
                    key={wt.lease_id}
                    className="px-2.5 py-2 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-ink truncate">
                        {wt.role} · {wt.branch_name}
                      </div>
                      <div className="font-mono text-muted truncate">{wt.isolation_mode}</div>
                    </div>
                    <span
                      className={`font-mono shrink-0 ${
                        wt.status === "released" ? "text-ok" : "text-accent"
                      }`}
                    >
                      {wt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Wave Patch Reconciliations */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-ink">
              Wave Patch Reconciliations ({reconciliations.length})
            </p>
            {reconciliations.length === 0 ? (
              <p className="text-[11px] text-muted">
                After each parallel wave, isolated worktree diffs are reconciled for clean merge
                order and exact file-level conflict detection.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-md border border-border bg-base">
                {reconciliations.map((rec) => (
                  <div
                    key={`rec-${rec.wave_index}-${rec.reconciled_at}`}
                    className="px-2.5 py-2 text-[11px] space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-ink tabular-nums">
                        Wave {rec.wave_index} · {rec.leases_checked} lease
                        {rec.leases_checked === 1 ? "" : "s"} · {rec.clean_files.length} clean
                      </span>
                      <span
                        className={`font-mono font-semibold shrink-0 ${
                          rec.status === "clean" ? "text-ok" : "text-warn"
                        }`}
                      >
                        {rec.status}
                      </span>
                    </div>
                    {rec.conflicting_files.length > 0 && (
                      <p className="font-mono text-warn truncate">
                        Conflicts:{" "}
                        {rec.conflicting_files.map((cf) => cf.file_path).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Artifact Quality Evaluations */}
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-ink">
              Artifact Quality Rubrics ({evaluations.length})
            </p>
            {evaluations.length === 0 ? (
              <p className="text-[11px] text-muted">
                Published Blackboard artifacts are automatically scored for completeness,
                traceability, conflict safety, and verification clearance.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-md border border-border bg-base">
                {evaluations.map((ev) => (
                  <div
                    key={`${ev.artifact_id}-${ev.evaluated_at}`}
                    className="px-2.5 py-2 flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="font-mono text-ink truncate">
                      {ev.producer_role} · {ev.artifact_type} v{ev.version}
                    </span>
                    <span
                      className={`font-mono tabular-nums font-semibold shrink-0 ${
                        ev.passed ? "text-ok" : "text-warn"
                      }`}
                    >
                      {Math.round(ev.overall_score * 100)}% · {ev.passed ? "pass" : "review"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: Milestone #2 — Cross-Run Knowledge Fabric & Multi-Agent Benchmarks */}
      {activeTab === "memory" && (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {/* Knowledge Fabric Graph Summary & Hybrid Search */}
          <div className="rounded-md border border-border bg-base p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-ink">Cross-Run Knowledge Fabric</span>
              <span className="font-mono tabular-nums text-[11px] text-muted">
                {knowledgeSnapshot.node_count} nodes · {knowledgeSnapshot.edge_count} edges
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                aria-label="Query cross-run knowledge fabric"
                value={memoryQuery}
                onChange={(e) => setMemoryQuery(e.target.value)}
                placeholder="Search episodic runs, artifacts, or repair lessons..."
                className="flex-1 rounded border border-border bg-panel px-2.5 py-1 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                disabled={queryingMemory}
                onClick={() => void onQueryMemory(memoryQuery)}
                className="px-2.5 py-1 rounded border border-border bg-panel text-xs font-medium text-ink hover:border-accent/60 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                Query Memory
              </button>
            </div>
            {memoryHits.length > 0 ? (
              <div className="divide-y divide-border rounded border border-border bg-panel">
                {memoryHits.map((hit) => (
                  <div key={hit.node_id} className="px-2.5 py-1.5 text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-ink truncate">
                        [{hit.node_type}] {hit.label}
                      </span>
                      <span className="font-mono tabular-nums text-accent shrink-0">
                        score {hit.score}
                      </span>
                    </div>
                    <p className="text-muted">{hit.summary}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted">
                Completed runs automatically index episodes, touched files, and repair lessons for
                cross-run retrieval.
              </p>
            )}
          </div>

          {/* Multi-Agent Benchmark Harness & Regression Gate */}
          <div className="rounded-md border border-border bg-base p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-ink">
                Multi-Agent Benchmark Harness
              </span>
              <button
                type="button"
                disabled={runningBenchmarks}
                onClick={() => void onRunBenchmarks()}
                className="px-2.5 py-1 rounded bg-accent text-white text-[11px] font-semibold hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {runningBenchmarks ? "Running Suite..." : "Run Benchmark Suite"}
              </button>
            </div>
            {benchmarkReport ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
                  <span className="text-ink">
                    Pass rate: {Math.round(benchmarkReport.pass_rate * 100)}% · Avg quality:{" "}
                    {Math.round(benchmarkReport.avg_quality_score * 100)}% · $
                    {benchmarkReport.total_cost_usd.toFixed(4)}
                  </span>
                  <span
                    className={`font-semibold ${
                      benchmarkReport.regression_gate.passed ? "text-ok" : "text-err"
                    }`}
                  >
                    Gate: {benchmarkReport.regression_gate.passed ? "passed" : "regression"}
                  </span>
                </div>
                <div className="divide-y divide-border rounded border border-border bg-panel">
                  {benchmarkReport.cases.map((c) => (
                    <div
                      key={c.case_id}
                      className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-ink truncate">{c.title}</div>
                        <div className="text-muted truncate">{c.details}</div>
                      </div>
                      <span
                        className={`font-mono tabular-nums shrink-0 ${
                          c.passed ? "text-ok" : "text-err"
                        }`}
                      >
                        {c.passed ? "pass" : "fail"} · {Math.round(c.quality_score * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted">
                Run deterministic multi-agent scenarios (worktree reconciliation, critique-repair,
                and local-LLM offload) against the project regression gate.
              </p>
            )}
          </div>
        </div>
      )}

      {/* TAB 7: Milestone #3 — OpenTelemetry Traces, Tenant Policy & Skill Marketplace */}
      {activeTab === "enterprise" && (
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          {/* OpenTelemetry W3C Trace Waterfall */}
          <div className="rounded-md border border-border bg-base p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-ink">OpenTelemetry W3C Run Trace</span>
              <span className="font-mono text-[10px] text-muted truncate">
                {traceSummary ? `trace ${traceSummary.trace_id.slice(0, 16)}...` : "OTLP/v1 ready"}
              </span>
            </div>
            {traceSummary && traceSummary.spans.length > 0 ? (
              <div className="divide-y divide-border rounded border border-border bg-panel">
                {traceSummary.spans.slice(0, 10).map((sp) => (
                  <div
                    key={sp.span_id}
                    className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[11px] font-mono"
                  >
                    <span className="text-ink truncate">
                      {sp.name}
                      {sp.attributes?.["agent.role"]
                        ? ` · ${String(sp.attributes["agent.role"])}`
                        : ""}
                    </span>
                    <span
                      className={`tabular-nums shrink-0 ${
                        sp.status === "OK" ? "text-ok" : "text-err"
                      }`}
                    >
                      {sp.status} · {sp.duration_ms}ms
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted">
                Execute waves to record hierarchical W3C Trace Context spans (run, wave, task, and
                reconciliation) exportable in OTLP JSON.
              </p>
            )}
          </div>

          {/* Tenant Governance Policy Engine */}
          <div className="rounded-md border border-border bg-base p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-ink">Tenant Governance Policy</span>
              <span className="font-mono tabular-nums text-[11px] text-muted">
                Ceiling ${tenantPolicy.max_run_budget_usd.toFixed(2)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tenantPolicy.require_approval_for_delivery}
                  onChange={(e) =>
                    void onUpdatePolicy({ require_approval_for_delivery: e.target.checked })
                  }
                  className="accent-accent"
                />
                <span>Mandate Pre-Delivery Approval</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tenantPolicy.allow_local_llm_routing}
                  onChange={(e) =>
                    void onUpdatePolicy({ allow_local_llm_routing: e.target.checked })
                  }
                  className="accent-accent"
                />
                <span>Allow Local LLM Routing</span>
              </label>
            </div>
            {policyEnforcements.length > 0 && (
              <p className="text-[11px] font-mono text-warn">
                Enforced: {policyEnforcements.join(" · ")}
              </p>
            )}
          </div>

          {/* Governed Agent & Skill Marketplace */}
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-ink">
              Agent &amp; Skill Marketplace ({marketplacePackages.length} verified)
            </p>
            {marketplaceStatus && (
              <p className="text-[11px] font-mono text-ink bg-base border border-border rounded px-2.5 py-1.5">
                {marketplaceStatus}
              </p>
            )}
            <div className="divide-y divide-border rounded-md border border-border bg-base">
              {marketplacePackages.map((pkg) => (
                <div key={pkg.package_id} className="px-2.5 py-2 text-[11px] space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-semibold text-ink">{pkg.title}</span>
                      <span className="font-mono text-muted">
                        {" "}
                        · v{pkg.version} · {pkg.installs} installs
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={pkg.installed || installingPkgId === pkg.package_id}
                      onClick={() => void onInstallMarketplacePkg(pkg.package_id)}
                      className="px-2 py-0.5 rounded border border-border bg-panel text-[11px] font-medium text-ink hover:border-accent/60 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {pkg.installed
                        ? "Installed"
                        : installingPkgId === pkg.package_id
                          ? "Installing..."
                          : "Install Skill"}
                    </button>
                  </div>
                  <p className="text-muted">{pkg.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: Governed Delegations */}
      {activeTab === "delegations" && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {activeRun.delegations.length === 0 ? (
            <p className="text-xs text-muted py-4">
              Run the DAG waves to observe policy-enforced agent-to-agent delegations with depth and
              route validation.
            </p>
          ) : (
            activeRun.delegations.map((del) => (
              <div
                key={del.delegation_id}
                className="rounded-md border border-border bg-base p-2.5 text-xs space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-ink flex items-center gap-1">
                    {del.from_role}
                    <ArrowRight size={11} className="text-muted" />
                    {del.to_role}
                  </span>
                  <span
                    className={`font-mono text-[11px] tabular-nums ${
                      del.status === "answered" ? "text-ok" : "text-err"
                    }`}
                  >
                    {del.status} · {del.duration_ms}ms
                  </span>
                </div>
                <p className="text-[11px] text-muted">{del.question}</p>
                {del.answer && <p className="text-[11px] text-ink">{del.answer}</p>}
                {del.reason && <p className="text-[11px] text-err">Policy: {del.reason}</p>}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
}
