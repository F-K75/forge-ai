import { useState, useEffect, useRef, useMemo } from "react";
import {
  Play,
  Square,
  GitBranch,
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Brain,
  Sliders,
  Loader2,
  RefreshCw,
  Lock,
} from "lucide-react";
import { LIVE_MODE } from "../lib/env";
import {
  kernelApi,
  skillApi,
  protocolApi,
  enterpriseOsApi,
  productLeadApi,
  subscribeAguiStream,
  buildLocalA2AAgentCard,
  defaultTenantPolicy,
  LOCAL_ORG_BLUEPRINT,
  LOCAL_SKILLS_CATALOG,
  LOCAL_MCP_TOOLS,
  LOCAL_MCP_APPS,
  LOCAL_MARKETPLACE_PACKAGES,
  planObjectiveLocally,
  type OrgBlueprint,
  type KernelRun,
  type KernelTask,
  type DelegationRecord,
  type BlackboardArtifact,
  type FileConflict,
  type RepairCycleRecord,
  type ApprovalGate,
  type SkillManifest,
  type SkillActivation,
  type WorktreeLease,
  type WaveReconciliationReport,
  type ArtifactEvaluation,
  type AGUIEvent,
  type MCPToolSpec,
  type MCPAppSpec,
  type A2AAgentCard,
  type A2UISurface,
  type KnowledgeSnapshot,
  type KnowledgeHit,
  type BenchmarkSuiteReport,
  type MarketplaceSkillPackage,
  type TenantGovernancePolicy,
  type TraceSpan,
  type ProductLeadAnswer,
} from "../lib/kernelApi";
import { KernelInspectorPanel } from "./KernelInspectorPanel";

interface MultiAgentKernelPanelProps {
  projectId?: string;
}

const OBJECTIVE_PRESETS = [
  {
    label: "Full-Stack Feature + Security Gate",
    objective:
      "Design system architecture and UI tokens, implement React dashboard frontend and FastAPI backend API with MongoDB schema migration, run security audit and E2E tests, and prepare release rollout.",
  },
  {
    label: "AI RAG Pipeline + Observability",
    objective:
      "Design distributed RAG embedding and context window architecture, build AI engineer retrieval service, configure Prometheus observability and Kubernetes autoscaling, and verify benchmark accuracy.",
  },
  {
    label: "Multi-Tenant Billing & Compliance",
    objective:
      "Define pricing business model and PRD requirements, build database billing schema and RBAC auth security controls, perform GDPR compliance audit, and publish API documentation.",
  },
];

const DEPT_ARTIFACT_TYPE: Record<string, string> = {
  leadership: "adr",
  business: "prd",
  architecture: "api_contract",
  design: "ui_spec",
  engineering: "code_patch",
  infrastructure: "infra_plan",
  security: "security_audit",
  quality: "qa_report",
  delivery: "release_checklist",
};

const DEPT_MODEL_ROUTING: Record<string, { tier: string; model: string; cost: number }> = {
  leadership: { tier: "reasoning", model: "gemini-2.5-pro", cost: 0.045 },
  architecture: { tier: "reasoning", model: "gemini-2.5-pro", cost: 0.045 },
  security: { tier: "reasoning", model: "gemini-2.5-pro", cost: 0.045 },
  business: { tier: "balanced", model: "gemini-2.5-flash", cost: 0.012 },
  design: { tier: "balanced", model: "gemini-2.5-flash", cost: 0.012 },
  engineering: { tier: "balanced", model: "gemini-2.5-flash", cost: 0.012 },
  infrastructure: { tier: "balanced", model: "gemini-2.5-flash", cost: 0.012 },
  quality: { tier: "balanced", model: "gemini-2.5-flash", cost: 0.012 },
  delivery: { tier: "fast", model: "gemini-2.5-flash-lite", cost: 0.004 },
};

function defaultFilesForRole(role: string): string[] {
  switch (role) {
    case "frontend_engineer":
      return ["frontend/src/pages/FlowPage.tsx", "shared/api-contract.ts"];
    case "backend_engineer":
      return ["backend/api/kernel.py", "shared/api-contract.ts"];
    case "database_engineer":
      return ["backend/core/database.py"];
    case "solution_architect":
    case "system_architect":
      return ["engineering/ARCHITECTURE.md", "shared/api-contract.ts"];
    case "ui_designer":
    case "ux_researcher":
      return ["frontend/src/lib/designTokens.ts"];
    case "security_engineer":
    case "security_auditor":
      return ["engineering/SECURITY_AUDIT.md"];
    case "qa_engineer":
    case "code_reviewer":
    case "independent_reviewer":
      return ["backend/tests/test_agent_collaboration.py"];
    case "devops_engineer":
    case "cloud_engineer":
    case "reliability_engineer":
      return ["k8s/deployment.yaml"];
    case "release_manager":
      return ["RELEASE_CHECKLIST.md"];
    default:
      return [`artifacts/${role}.md`];
  }
}

function statusTone(status: KernelTask["status"] | KernelRun["status"]): string {
  switch (status) {
    case "completed":
      return "text-ok border-ok/40 bg-ok/10";
    case "running":
      return "text-accent border-accent/50 bg-accent-soft";
    case "waiting_approval":
      return "text-warn border-warn/50 bg-warn/10";
    case "failed":
      return "text-err border-err/40 bg-err/10";
    case "blocked":
    case "partial_failure":
      return "text-warn border-warn/40 bg-warn/10";
    case "cancelled":
      return "text-muted border-border bg-panel-alt";
    default:
      return "text-muted border-border bg-base";
  }
}

const A2UI_TASK_STATUSES = new Set(["pending", "running", "completed", "failed", "blocked", "cancelled"]);

/**
 * Offline mirror of the backend's `build_a2ui_surfaces_for_run`: builds A2UI
 * surfaces purely from the locally held KernelRun snapshot (no network).
 */
function synthesizeLocalA2UISurfaces(run: KernelRun): A2UISurface[] {
  const surfaces: A2UISurface[] = [];
  const evals = run.evaluations || [];
  const tasks = run.tasks || [];
  const conflicts = run.conflicts || [];
  const avgQ =
    evals.length > 0
      ? evals.reduce((acc, e) => acc + e.overall_score, 0) / evals.length
      : 0;

  // 1. Interactive approval cards for pending governance gates
  for (const gate of (run.approval_gates || []).filter((g) => g.status === "pending")) {
    surfaces.push({
      surface_id: `a2ui_gate_${gate.gate_id}`,
      protocol: "a2ui/v1",
      title: `Approval Required: ${gate.gate_name}`,
      components: [
        {
          type: "approval_card",
          gate_id: gate.gate_id,
          gate_name: gate.gate_name,
          reason: gate.reason || null,
          wave_index: gate.wave_index,
          risk_level: "medium",
          actions: ["approve", "reject"],
        },
      ],
    });
  }

  // 2. Execution & quality summary
  const summaryComponents: Array<Record<string, unknown>> = [
    {
      type: "metric_row",
      items: [
        {
          label: "Tasks Completed",
          value: `${run.metrics.completed_tasks}/${run.metrics.total_tasks}`,
        },
        { label: "Blackboard Artifacts", value: String((run.artifacts || []).length) },
        { label: "Repair Cycles", value: String((run.repair_cycles || []).length) },
        { label: "Avg Quality", value: `${Math.round(avgQ * 100)}%` },
        {
          label: "Estimated Cost",
          value: `$${(run.cost_summary?.spent_usd ?? 0).toFixed(4)}`,
        },
        { label: "Worktree Leases", value: String((run.worktrees || []).length) },
      ],
    },
  ];
  if (conflicts.length > 0) {
    summaryComponents.push({
      type: "conflict_list",
      items: conflicts.slice(0, 50).map((c) => ({
        file_path: c.file_path,
        wave_index: c.wave_index,
        roles: c.roles.slice(0, 20),
        status: c.status,
      })),
    });
  }
  if (evals.length > 0) {
    summaryComponents.push({
      type: "eval_table",
      rows: evals.slice(0, 50).map((e) => ({
        role: e.producer_role,
        artifact_type: e.artifact_type,
        score: e.overall_score,
        passed: e.passed,
      })),
    });
  }
  surfaces.push({
    surface_id: `a2ui_summary_${run.id}`,
    protocol: "a2ui/v1",
    title: "Run Execution & Quality Surface",
    components: summaryComponents,
  });

  // 3. Agent activity: progress + task board
  if (tasks.length > 0) {
    const completed = tasks.filter((t) => t.status === "completed").length;
    const failed = tasks.some((t) => t.status === "failed");
    surfaces.push({
      surface_id: `a2ui_activity_${run.id}`,
      protocol: "a2ui/v1",
      title: "Agent Activity",
      components: [
        {
          type: "progress_bar",
          label: "Tasks completed",
          value: completed,
          max: tasks.length,
          tone: failed ? "error" : completed === tasks.length ? "success" : "info",
        },
        {
          type: "status_list",
          items: tasks.slice(0, 100).map((t) => ({
            id: t.id,
            title: t.title,
            status: A2UI_TASK_STATUSES.has(t.status) ? t.status : "pending",
            owner: t.role,
            detail: t.error || `Wave ${t.wave_index}`,
          })),
        },
      ],
    });
  }
  return surfaces;
}

export function MultiAgentKernelPanel({
  projectId = "demo-project",
}: MultiAgentKernelPanelProps) {
  const [blueprint, setBlueprint] = useState<OrgBlueprint>(LOCAL_ORG_BLUEPRINT);
  const [skillsCatalog, setSkillsCatalog] = useState<SkillManifest[]>(LOCAL_SKILLS_CATALOG);
  const [mcpTools, setMcpTools] = useState<MCPToolSpec[]>(LOCAL_MCP_TOOLS);
  const [mcpApps, setMcpApps] = useState<MCPAppSpec[]>(LOCAL_MCP_APPS);
  const [a2aCard, setA2ACard] = useState<A2AAgentCard>(() => buildLocalA2AAgentCard(projectId));
  const [aguiEvents, setAguiEvents] = useState<AGUIEvent[]>([]);
  const [a2uiSurfaces, setA2UISurfaces] = useState<A2UISurface[]>([]);
  const [mcpScanResult, setMcpScanResult] = useState<string | null>(null);
  const [invokingMcp, setInvokingMcp] = useState<boolean>(false);
  const [mcpRegisterStatus, setMcpRegisterStatus] = useState<string | null>(null);
  const [registeringMcp, setRegisteringMcp] = useState<boolean>(false);

  // Milestones #2 & #3 state: Knowledge Fabric, Benchmarks, Marketplace & Tenant Governance Policy
  const [knowledgeSnapshot, setKnowledgeSnapshot] = useState<KnowledgeSnapshot>(() => ({
    project_id: projectId,
    node_count: 2,
    edge_count: 1,
    counts_by_type: { decision: 1, lesson: 1 },
    recent_nodes: [
      {
        node_id: "seed_arch_contract",
        project_id: projectId,
        node_type: "decision",
        label: "Architecture Contract Gate",
        summary:
          "Freeze API contract schemas and UI design tokens in Wave 0/1 before parallel engineering worktrees execute.",
        created_at: new Date().toISOString(),
      },
      {
        node_id: "seed_sec_lesson",
        project_id: projectId,
        node_type: "lesson",
        label: "Repair lesson (security_engineer -> backend_engineer)",
        summary:
          "Enforce project ownership assertions on every authenticated route and validate external URLs against non-public addresses.",
        created_at: new Date().toISOString(),
      },
    ],
  }));
  const [memoryHits, setMemoryHits] = useState<KnowledgeHit[]>([]);
  const [queryingMemory, setQueryingMemory] = useState<boolean>(false);
  const [benchmarkReport, setBenchmarkReport] = useState<BenchmarkSuiteReport | null>(null);
  const [runningBenchmarks, setRunningBenchmarks] = useState<boolean>(false);
  const [marketplacePackages, setMarketplacePackages] = useState<MarketplaceSkillPackage[]>(
    LOCAL_MARKETPLACE_PACKAGES,
  );
  const [installingPkgId, setInstallingPkgId] = useState<string | null>(null);
  const [marketplaceStatus, setMarketplaceStatus] = useState<string | null>(null);
  const [tenantPolicy, setTenantPolicy] = useState<TenantGovernancePolicy>(() =>
    defaultTenantPolicy(projectId),
  );

  const [objective, setObjective] = useState<string>(OBJECTIVE_PRESETS[0].objective);
  const [maxConcurrency, setMaxConcurrency] = useState<number>(4);
  const [maxDelegations, setMaxDelegations] = useState<number>(12);
  const [maxRepairRounds, setMaxRepairRounds] = useState<number>(2);
  const [maxBudgetUsd, setMaxBudgetUsd] = useState<number>(2.5);
  const [includeGates, setIncludeGates] = useState<boolean>(true);
  const [requireDeliveryApproval, setRequireDeliveryApproval] = useState<boolean>(false);
  const [isolateWorktrees, setIsolateWorktrees] = useState<boolean>(true);
  const [preferLocalLlm, setPreferLocalLlm] = useState<boolean>(false);
  const [failFast, setFailFast] = useState<boolean>(false);
  const [simulateBlockingFinding, setSimulateBlockingFinding] = useState<boolean>(true);

  const [activeRun, setActiveRun] = useState<KernelRun>(() =>
    planObjectiveLocally(projectId, OBJECTIVE_PRESETS[0].objective, {
      maxConcurrency: 4,
      includeGovernanceGates: true,
      maxDelegations: 12,
      maxRepairRounds: 2,
      requireDeliveryApproval: false,
      maxBudgetUsd: 2.5,
      isolateWorktrees: true,
      preferLocalLlm: false,
    }),
  );
  const [planning, setPlanning] = useState<boolean>(false);
  const [executing, setExecuting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [gateNote, setGateNote] = useState<string>("");
  const [resolvingGate, setResolvingGate] = useState<boolean>(false);

  // Persistent Product Lead Q&A state
  const [leadQuestion, setLeadQuestion] = useState<string>(
    "Why was architecture scheduled before engineering?",
  );
  const [leadAnswer, setLeadAnswer] = useState<ProductLeadAnswer | null>(null);
  const [askingLead, setAskingLead] = useState<boolean>(false);
  const [localDecisions, setLocalDecisions] = useState<
    Array<{ id: string; trigger: string; rationale: string; actions: string[]; created_at: string }>
  >([
    {
      id: "dec_seed_1",
      trigger: "kernel_dag_stage_order",
      rationale:
        "Architecture and Design (Tier 1) execute before Engineering (Tier 2) so API contracts and tokens are frozen before parallel implementation waves begin.",
      actions: ["Enforced Kahn topological waves", "Enabled bounded parallel concurrency"],
      created_at: new Date().toISOString(),
    },
  ]);

  const cancelRef = useRef<boolean>(false);
  const pollTimerRef = useRef<number | null>(null);
  const aguiUnsubRef = useRef<(() => void) | null>(null);
  const localGateResolverRef = useRef<
    ((decision: { approved: boolean; note: string }) => void) | null
  >(null);

  useEffect(() => {
    setA2UISurfaces(synthesizeLocalA2UISurfaces(activeRun));
  }, [activeRun]);

  useEffect(() => {
    setA2ACard(buildLocalA2AAgentCard(projectId));
    if (!LIVE_MODE || !projectId) return;
    let mounted = true;
    kernelApi
      .getOrgBlueprint(projectId)
      .then((data) => {
        if (mounted && data?.departments?.length) setBlueprint(data);
      })
      .catch(() => {});

    skillApi
      .listSkills(projectId)
      .then((data) => {
        if (mounted && data?.skills?.length) setSkillsCatalog(data.skills);
      })
      .catch(() => {});

    protocolApi
      .listMcpTools(projectId)
      .then((data) => {
        if (mounted && data?.tools?.length) setMcpTools(data.tools);
        if (mounted && data?.apps?.length) setMcpApps(data.apps);
      })
      .catch(() => {});

    protocolApi
      .getA2AAgentCard(projectId)
      .then((card) => {
        if (mounted && card?.protocol) setA2ACard(card);
      })
      .catch(() => {});

    enterpriseOsApi
      .getMemory(projectId)
      .then((snap) => {
        if (mounted && snap) setKnowledgeSnapshot(snap);
      })
      .catch(() => {});

    enterpriseOsApi
      .listMarketplace(projectId)
      .then((res) => {
        if (mounted && res?.packages?.length) setMarketplacePackages(res.packages);
      })
      .catch(() => {});

    enterpriseOsApi
      .getPolicy(projectId)
      .then((pol) => {
        if (mounted && pol?.project_id) setTenantPolicy(pol);
      })
      .catch(() => {});

    return () => {
      mounted = false;
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
      if (aguiUnsubRef.current) {
        aguiUnsubRef.current();
        aguiUnsubRef.current = null;
      }
    };
  }, [projectId]);

  const taskById = useMemo(() => {
    const map = new Map<string, KernelTask>();
    for (const t of activeRun.tasks) map.set(t.id, t);
    return map;
  }, [activeRun.tasks]);

  const activeDepartmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of activeRun.tasks) {
      counts[t.department] = (counts[t.department] || 0) + 1;
    }
    return counts;
  }, [activeRun.tasks]);

  const artifacts = activeRun.artifacts || [];
  const conflicts = activeRun.conflicts || [];
  const repairCycles = activeRun.repair_cycles || [];
  const approvalGates = activeRun.approval_gates || [];
  const pendingGate = approvalGates.find((g) => g.status === "pending") || null;

  const handlePlan = async (nextObjective?: string) => {
    const targetObjective = (nextObjective ?? objective).trim();
    if (targetObjective.length < 3) {
      setErrorMsg("Enter an engineering objective of at least 3 characters to plan DAG waves.");
      return;
    }
    setErrorMsg(null);
    setPlanning(true);
    try {
      if (LIVE_MODE) {
        const planned = await kernelApi.planObjective(projectId, {
          objective: targetObjective,
          max_agents: 10,
          include_governance_gates: includeGates,
        });
        setActiveRun(planned);
      } else {
        const planned = planObjectiveLocally(projectId, targetObjective, {
          maxAgents: 10,
          includeGovernanceGates: includeGates,
          maxConcurrency,
          maxDelegations,
          failFast,
          maxRepairRounds,
          requireDeliveryApproval,
          maxBudgetUsd,
          isolateWorktrees,
          preferLocalLlm,
        });
        setActiveRun(planned);
      }
    } catch {
      const fallback = planObjectiveLocally(projectId, targetObjective, {
        maxAgents: 10,
        includeGovernanceGates: includeGates,
        maxConcurrency,
        maxDelegations,
        failFast,
        maxRepairRounds,
        requireDeliveryApproval,
        maxBudgetUsd,
        isolateWorktrees,
        preferLocalLlm,
      });
      setActiveRun(fallback);
      setErrorMsg("Backend kernel unreachable — generated deterministic local DAG plan instead.");
    } finally {
      setPlanning(false);
    }
  };

  const handleInvokeMcpScan = async (sampleCode: string) => {
    setInvokingMcp(true);
    try {
      if (LIVE_MODE) {
        const res = await protocolApi.invokeMcpTool(projectId, {
          tool_name: "security.static_scan",
          role: "security_engineer",
          department: "security",
          arguments: { code: sampleCode },
        });
        const count = Number((res.result as { finding_count?: number } | undefined)?.finding_count ?? 0);
        setMcpScanResult(
          res.ok
            ? `MCP security.static_scan completed: ${count} blocking finding(s).`
            : `MCP denied/error: ${res.error || "Unknown error"}`,
        );
      } else {
        const unsafePattern = /(dangerouslySetInnerHTML|\.innerHTML\s*=|shell\s*=\s*True|sk-[A-Za-z0-9]{20,})/;
        const flagged = unsafePattern.test(sampleCode);
        setMcpScanResult(
          flagged
            ? "MCP security.static_scan flagged 1 blocking security hygiene pattern."
            : "MCP security.static_scan passed: 0 blocking findings.",
        );
      }
    } catch {
      setMcpScanResult("MCP tool invocation failed — verify permissions or server connectivity.");
    } finally {
      setInvokingMcp(false);
    }
  };

  const handleRegisterMcpServer = async (serverId: string, endpointUrl: string) => {
    const cleanId = serverId.trim();
    const cleanUrl = endpointUrl.trim();
    if (cleanId.length < 2) {
      setMcpRegisterStatus("Enter a valid server ID (at least 2 characters).");
      return;
    }
    try {
      const parsed = new URL(cleanUrl);
      const host = parsed.hostname.toLowerCase();
      if (
        parsed.protocol !== "https:" ||
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "169.254.169.254" ||
        host.endsWith(".local") ||
        host.endsWith(".internal")
      ) {
        setMcpRegisterStatus(
          "Rejected: external MCP servers must use a public https:// endpoint.",
        );
        return;
      }
    } catch {
      setMcpRegisterStatus("Rejected: enter a valid https:// URL for the MCP server.");
      return;
    }

    setRegisteringMcp(true);
    try {
      if (LIVE_MODE) {
        const res = await protocolApi.registerMcpServer(projectId, {
          server_id: cleanId,
          endpoint_url: cleanUrl,
          discover_tools: false,
        });
        setMcpRegisterStatus(
          `Registered external MCP server '${String(res.server?.server_id || cleanId)}' (${cleanUrl}).`,
        );
      } else {
        setMcpRegisterStatus(
          `Registered external HTTPS MCP server '${cleanId}' (${cleanUrl}) in gateway policy.`,
        );
      }
    } catch {
      setMcpRegisterStatus("Failed to register MCP server — verify URL and project permissions.");
    } finally {
      setRegisteringMcp(false);
    }
  };

  const handleQueryMemory = async (query: string) => {
    const clean = query.trim();
    if (clean.length < 2) return;
    setQueryingMemory(true);
    try {
      if (LIVE_MODE) {
        const res = await enterpriseOsApi.queryMemory(projectId, { query: clean, top_k: 5 });
        setMemoryHits(res.hits || []);
      } else {
        const qWords = clean
          .toLowerCase()
          .split(/[^a-z0-9_/-]+/)
          .filter((w) => w.length >= 2);
        const scored: KnowledgeHit[] = knowledgeSnapshot.recent_nodes
          .map((n) => {
            const hay = `${n.label} ${n.summary} ${n.node_type}`.toLowerCase();
            const overlap = qWords.filter((w) => hay.includes(w)).length;
            return {
              node_id: n.node_id,
              node_type: n.node_type,
              label: n.label,
              summary: n.summary,
              score: Number((overlap * 1.4 + (n.node_type === "lesson" ? 0.5 : 0)).toFixed(2)),
              related_labels: [],
              created_at: n.created_at,
            };
          })
          .filter((h) => h.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        setMemoryHits(scored);
      }
    } catch {
      setMemoryHits([]);
    } finally {
      setQueryingMemory(false);
    }
  };

  const handleRunBenchmarks = async () => {
    setRunningBenchmarks(true);
    try {
      if (LIVE_MODE) {
        const report = await enterpriseOsApi.runBenchmarks(projectId);
        setBenchmarkReport(report);
      } else {
        await new Promise((r) => setTimeout(r, 140));
        const hasBaseline = benchmarkReport !== null;
        const nextReport: BenchmarkSuiteReport = {
          suite_id: `bench_${Date.now().toString(36)}`,
          project_id: projectId,
          cases: [
            {
              case_id: "parallel_worktree_reconciliation",
              title: "Parallel Worktree Conflict Reconciliation",
              passed: true,
              quality_score: 0.96,
              cost_usd: 0.0042,
              duration_ms: 82,
              wave_count: 1,
              reconciliations: 1,
              repair_cycles: 0,
              details: "Detected overlapping shared/contract.ts write across isolated parallel worktrees.",
            },
            {
              case_id: "autonomous_critique_repair",
              title: "Autonomous Critique-Repair Loop",
              passed: true,
              quality_score: 0.98,
              cost_usd: 0.0118,
              duration_ms: 114,
              wave_count: 2,
              reconciliations: 1,
              repair_cycles: 1,
              details: "Security finding automatically re-dispatched backend_engineer and resolved in round 1.",
            },
            {
              case_id: "local_llm_cost_efficiency",
              title: "Local LLM Routing & Zero-Cloud-Cost Offload",
              passed: true,
              quality_score: 0.97,
              cost_usd: 0,
              duration_ms: 64,
              wave_count: 2,
              reconciliations: 1,
              repair_cycles: 0,
              details: "Routed balanced and fast tasks to Ollama/vLLM preference with $0.0000 cloud spend.",
            },
          ],
          pass_rate: 1.0,
          avg_quality_score: 0.97,
          total_cost_usd: 0.016,
          total_duration_ms: 260,
          regression_gate: {
            passed: true,
            has_baseline: hasBaseline,
            quality_delta: 0,
            cost_delta_pct: 0,
            regressions: [],
          },
          executed_at: new Date().toISOString(),
        };
        setBenchmarkReport(nextReport);
      }
    } finally {
      setRunningBenchmarks(false);
    }
  };

  const handleInstallMarketplacePkg = async (packageId: string) => {
    const pkg = marketplacePackages.find((p) => p.package_id === packageId);
    if (!pkg) return;
    setInstallingPkgId(packageId);
    setMarketplaceStatus(null);
    try {
      const blocked = pkg.required_permissions.filter((p) =>
        tenantPolicy.blocked_skill_permissions.includes(p),
      );
      if (blocked.length > 0) {
        setMarketplaceStatus(
          `Blocked by tenant governance policy: forbidden permission(s) ${blocked.join(", ")}.`,
        );
        return;
      }
      if (LIVE_MODE) {
        await enterpriseOsApi.installMarketplacePackage(projectId, packageId);
      }
      setMarketplacePackages((prev) =>
        prev.map((item) =>
          item.package_id === packageId
            ? { ...item, installed: true, installs: item.installs + (item.installed ? 0 : 1) }
            : item,
        ),
      );
      setSkillsCatalog((prev) =>
        prev.some((s) => s.name === pkg.name)
          ? prev
          : [
              ...prev,
              {
                name: pkg.name,
                domain: pkg.domain,
                description: pkg.description,
                version: pkg.version,
                keywords: pkg.keywords,
                dependencies: [],
                required_permissions: pkg.required_permissions,
                allowed_departments: pkg.allowed_departments,
                origin: "marketplace",
              },
            ],
      );
      setMarketplaceStatus(
        `Installed "${pkg.title}" (${pkg.name}) into the active Skill Engine catalog.`,
      );
    } catch {
      setMarketplaceStatus("Unable to install marketplace package — check tenant policy or permissions.");
    } finally {
      setInstallingPkgId(null);
    }
  };

  const handleUpdatePolicy = async (
    patch: Partial<
      Pick<
        TenantGovernancePolicy,
        "max_run_budget_usd" | "require_approval_for_delivery" | "allow_local_llm_routing"
      >
    >,
  ) => {
    const nextPolicy: TenantGovernancePolicy = {
      ...tenantPolicy,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    setTenantPolicy(nextPolicy);
    if (patch.require_approval_for_delivery) {
      setRequireDeliveryApproval(true);
    }
    if (patch.allow_local_llm_routing === false) {
      setPreferLocalLlm(false);
    }
    if (LIVE_MODE) {
      try {
        const saved = await enterpriseOsApi.updatePolicy(projectId, patch);
        setTenantPolicy(saved);
      } catch {
        // Keep optimistic state on transient error
      }
    }
  };

  const runLocalWaveExecution = async (initialRun: KernelRun) => {
    cancelRef.current = false;
    setExecuting(true);
    setErrorMsg(null);
    setAguiEvents([]);

    const startTime = Date.now();
    let aguiSeq = 0;
    const versionCounter = new Map<string, number>();
    const waveFileOwners = new Map<number, Map<string, Array<{ taskId: string; role: string }>>>();

    const emitLocalAgui = (aguiType: string, kernelEvent: string, payload: Record<string, unknown>) => {
      aguiSeq += 1;
      const ev: AGUIEvent = {
        event_id: aguiSeq,
        agui_type: aguiType,
        kernel_event: kernelEvent,
        project_id: projectId,
        run_id: initialRun.id,
        payload,
        timestamp: new Date().toISOString(),
      };
      setAguiEvents((prev) => [...prev.slice(-49), ev]);
    };

    const workingRun: KernelRun = {
      ...initialRun,
      status: "running",
      started_at: new Date().toISOString(),
      delegations: [],
      artifacts: [],
      conflicts: [],
      repair_cycles: [],
      approval_gates: [],
      skill_activations: [],
      worktrees: [],
      reconciliations: [],
      evaluations: [],
      cost_summary: {
        max_budget_usd: maxBudgetUsd,
        spent_usd: 0,
        remaining_usd: maxBudgetUsd,
        utilization_pct: 0,
      },
      tasks: initialRun.tasks.map((t) => ({
        ...t,
        status: "pending",
        attempts: 0,
        duration_ms: 0,
        cost_usd: 0,
        activated_skills: [],
        worktree_lease_id: null,
        error: null,
      })),
    };

    const syncRun = () => {
      const completedCount = workingRun.tasks.filter((t) => t.status === "completed").length;
      const blockedCount = workingRun.tasks.filter((t) => t.status === "blocked").length;
      const evals = workingRun.evaluations || [];
      const avgQ =
        evals.length > 0
          ? Number(
              (evals.reduce((sum, e) => sum + e.overall_score, 0) / evals.length).toFixed(3),
            )
          : 0;
      const spent = workingRun.cost_summary?.spent_usd ?? 0;
      workingRun.metrics = {
        ...workingRun.metrics,
        completed_tasks: completedCount,
        blocked_tasks: blockedCount,
        delegation_count: workingRun.delegations.length,
        artifact_count: (workingRun.artifacts || []).length,
        conflict_count: (workingRun.conflicts || []).length,
        repair_cycle_count: (workingRun.repair_cycles || []).length,
        skill_activation_count: (workingRun.skill_activations || []).length,
        worktree_count: (workingRun.worktrees || []).length,
        reconciliation_count: (workingRun.reconciliations || []).length,
        avg_quality_score: avgQ,
        total_cost_usd: spent,
        budget_remaining_usd: Math.max(0, Number((maxBudgetUsd - spent).toFixed(6))),
        pending_gates: (workingRun.approval_gates || []).filter((g) => g.status === "pending").length,
      };
      setActiveRun({
        ...workingRun,
        tasks: workingRun.tasks.map((t) => ({ ...t })),
        delegations: [...workingRun.delegations],
        artifacts: [...(workingRun.artifacts || [])],
        conflicts: [...(workingRun.conflicts || [])],
        repair_cycles: [...(workingRun.repair_cycles || [])],
        approval_gates: [...(workingRun.approval_gates || [])],
        skill_activations: [...(workingRun.skill_activations || [])],
        worktrees: [...(workingRun.worktrees || [])],
        reconciliations: [...(workingRun.reconciliations || [])],
        evaluations: [...(workingRun.evaluations || [])],
        cost_summary: workingRun.cost_summary ? { ...workingRun.cost_summary } : undefined,
      });
    };

    const publishLocalArtifact = (task: KernelTask, waveIndex: number, summary: string) => {
      const artifactType = DEPT_ARTIFACT_TYPE[task.department] || "review_note";
      const vKey = `${artifactType}:${task.role}`;
      const nextVersion = (versionCounter.get(vKey) || 0) + 1;
      versionCounter.set(vKey, nextVersion);
      const touched = defaultFilesForRole(task.role);

      const art: BlackboardArtifact = {
        artifact_id: `art_${(workingRun.artifacts || []).length + 1}`,
        key: task.role,
        artifact_type: artifactType,
        version: nextVersion,
        producer_task_id: task.id,
        producer_role: task.role,
        department: task.department,
        wave_index: waveIndex,
        summary,
        touched_files: touched,
        created_at: new Date().toISOString(),
      };
      workingRun.artifacts = [...(workingRun.artifacts || []), art];

      let collided = false;
      let wMap = waveFileOwners.get(waveIndex);
      if (!wMap) {
        wMap = new Map();
        waveFileOwners.set(waveIndex, wMap);
      }
      for (const fp of touched) {
        const owners = wMap.get(fp) || [];
        if (!owners.some((o) => o.taskId === task.id)) {
          owners.push({ taskId: task.id, role: task.role });
          wMap.set(fp, owners);
        }
        if (owners.length > 1) {
          collided = true;
          const existing = (workingRun.conflicts || []).find(
            (c) => c.wave_index === waveIndex && c.file_path === fp,
          );
          if (existing) {
            existing.task_ids = owners.map((o) => o.taskId);
            existing.roles = owners.map((o) => o.role);
          } else {
            const conf: FileConflict = {
              conflict_id: `conf_${(workingRun.conflicts || []).length + 1}`,
              file_path: fp,
              wave_index: waveIndex,
              task_ids: owners.map((o) => o.taskId),
              roles: owners.map((o) => o.role),
              status: "detected",
              detected_at: new Date().toISOString(),
            };
            workingRun.conflicts = [...(workingRun.conflicts || []), conf];
            emitLocalAgui("CUSTOM", "kernel_conflict_detected", { file_path: fp, wave_index: waveIndex });
          }
        }
      }

      const overall = collided ? 0.9 : 1.0;
      const evaluation: ArtifactEvaluation = {
        artifact_id: art.artifact_id,
        producer_role: art.producer_role,
        artifact_type: art.artifact_type,
        version: art.version,
        completeness_score: 1.0,
        traceability_score: 1.0,
        conflict_safety_score: collided ? 0.5 : 1.0,
        verification_score: 1.0,
        overall_score: overall,
        passed: overall >= 0.75,
        notes: collided ? ["Same-wave file overlap mitigated by isolated worktree lease."] : [],
        evaluated_at: new Date().toISOString(),
      };
      workingRun.evaluations = [...(workingRun.evaluations || []), evaluation];
      emitLocalAgui("STATE_DELTA", "kernel_artifact_published", {
        artifact_id: art.artifact_id,
        role: task.role,
        version: art.version,
      });
    };

    emitLocalAgui("RUN_STARTED", "kernel_run_started", { wave_count: workingRun.waves.length });
    syncRun();
    const byId = new Map(workingRun.tasks.map((t) => [t.id, t]));
    let repairTriggered = false;

    for (let w = 0; w < workingRun.waves.length; w++) {
      if (cancelRef.current) break;
      const waveIds = workingRun.waves[w];

      // Pre-Delivery Human-in-the-Loop Approval Gate
      const hasDeliveryTask = waveIds.some((tid) => byId.get(tid)?.department === "delivery");
      if (requireDeliveryApproval && hasDeliveryTask) {
        const gate: ApprovalGate = {
          gate_id: `gate_delivery_${w}`,
          gate_name: "pre_delivery_approval",
          reason: "Human sign-off required before Delivery / Release wave executes",
          wave_index: w,
          status: "pending",
          note: "",
          created_at: new Date().toISOString(),
        };
        workingRun.approval_gates = [...(workingRun.approval_gates || []), gate];
        workingRun.status = "waiting_approval";
        emitLocalAgui("CUSTOM", "kernel_approval_required", { gate_id: gate.gate_id });
        syncRun();

        const decision = await new Promise<{ approved: boolean; note: string }>((resolve) => {
          localGateResolverRef.current = resolve;
        });
        localGateResolverRef.current = null;

        gate.status = decision.approved ? "approved" : "rejected";
        gate.decided_by = "workspace-operator";
        gate.note = decision.note;
        gate.decided_at = new Date().toISOString();
        emitLocalAgui("CUSTOM", "kernel_approval_resolved", {
          gate_id: gate.gate_id,
          status: gate.status,
        });

        if (cancelRef.current) break;
        if (!decision.approved) {
          for (const t of workingRun.tasks) {
            if (t.status === "pending") {
              t.status = "blocked";
              t.error = "Blocked: pre-delivery approval gate was rejected";
            }
          }
          syncRun();
          break;
        }
        workingRun.status = "running";
        syncRun();
      }

      emitLocalAgui("STEP_STARTED", "kernel_wave_started", { wave_index: w, tasks: waveIds.length });

      for (let i = 0; i < waveIds.length; i += maxConcurrency) {
        if (cancelRef.current) break;
        const batch = waveIds.slice(i, i + maxConcurrency);

        for (const tid of batch) {
          const task = byId.get(tid);
          if (!task) continue;

          // Route matching skills for this task
          const matchedSkills = skillsCatalog
            .filter(
              (s) =>
                s.allowed_departments.length === 0 ||
                s.allowed_departments.includes(task.department),
            )
            .slice(0, 2);
          task.activated_skills = matchedSkills.map((s) => s.name);
          for (const ms of matchedSkills) {
            const act: SkillActivation = {
              task_id: task.id,
              role: task.role,
              skill_name: ms.name,
              domain: ms.domain,
              version: ms.version,
              origin: ms.origin,
              score: 3.5,
              resolved_dependencies: ms.dependencies,
              instructions_excerpt: ms.description,
            };
            workingRun.skill_activations = [...(workingRun.skill_activations || []), act];
          }

          // Model Router + Cost Budget Guard
          const baseRoute = DEPT_MODEL_ROUTING[task.department] || DEPT_MODEL_ROUTING.engineering;
          const route =
            preferLocalLlm && (baseRoute.tier === "balanced" || baseRoute.tier === "fast")
              ? { tier: baseRoute.tier, model: "qwen2.5-coder:32b", cost: 0.001 }
              : baseRoute;
          task.model_tier = route.tier;
          task.model_id = route.model;
          const currentSpent = workingRun.cost_summary?.spent_usd ?? 0;
          if (currentSpent + route.cost > maxBudgetUsd) {
            task.status = "blocked";
            task.error = `Run budget cap ($${maxBudgetUsd.toFixed(2)}) reached before starting ${task.role}`;
            continue;
          }

          // Worktree lease for parallel engineering / infrastructure tasks
          if (
            isolateWorktrees &&
            (task.department === "engineering" || task.department === "infrastructure")
          ) {
            const lease: WorktreeLease = {
              lease_id: `wt_${(workingRun.worktrees || []).length + 1}_${task.id}`,
              run_id: workingRun.id,
              task_id: task.id,
              role: task.role,
              department: task.department,
              branch_name: `agent/${workingRun.id.slice(0, 10)}/${task.role}`,
              worktree_path: `/tmp/forge-ai-worktrees/${workingRun.id}/${task.id}`,
              isolation_mode: "isolated_dir",
              status: "active",
              created_at: new Date().toISOString(),
            };
            task.worktree_lease_id = lease.lease_id;
            workingRun.worktrees = [...(workingRun.worktrees || []), lease];
          }

          task.status = "running";
          task.attempts += 1;
          task.started_at = new Date().toISOString();
        }
        syncRun();

        await new Promise((r) => setTimeout(r, 200));
        if (cancelRef.current) break;

        for (const tid of batch) {
          const task = byId.get(tid);
          if (!task || task.status !== "running") continue;
          const baseRoute = DEPT_MODEL_ROUTING[task.department] || DEPT_MODEL_ROUTING.engineering;
          const route =
            preferLocalLlm && (baseRoute.tier === "balanced" || baseRoute.tier === "fast")
              ? { tier: baseRoute.tier, model: "qwen2.5-coder:32b", cost: 0.001 }
              : baseRoute;
          const dur = 150 + Math.floor(Math.random() * 170);
          task.status = "completed";
          task.duration_ms = dur;
          task.cost_usd = Number(((task.cost_usd || 0) + route.cost).toFixed(6));
          task.finished_at = new Date().toISOString();
          const summary = `${task.role.replace(/_/g, " ")} verified wave ${w} deliverables via ${route.model}.`;
          task.output = { summary };

          const nextSpent = Number(((workingRun.cost_summary?.spent_usd ?? 0) + route.cost).toFixed(6));
          workingRun.cost_summary = {
            max_budget_usd: maxBudgetUsd,
            spent_usd: nextSpent,
            remaining_usd: Math.max(0, Number((maxBudgetUsd - nextSpent).toFixed(6))),
            utilization_pct: Number(((nextSpent / maxBudgetUsd) * 100).toFixed(1)),
          };

          publishLocalArtifact(task, w, summary);

          if (
            workingRun.delegations.length < maxDelegations &&
            (task.department === "engineering" || task.department === "security")
          ) {
            const targetRole =
              task.department === "engineering" ? "solution_architect" : "backend_engineer";
            const delegation: DelegationRecord = {
              delegation_id: `del_${workingRun.delegations.length + 1}`,
              from_task_id: task.id,
              from_role: task.role,
              to_role: targetRole,
              question:
                task.department === "engineering"
                  ? `Confirm contract schema & boundary constraints for ${task.role.replace(/_/g, " ")}.`
                  : `Verify auth middleware & input validation coverage for endpoints.`,
              depth: 1,
              status: "answered",
              answer: `Policy-approved contract verified by ${targetRole.replace(/_/g, " ")}.`,
              duration_ms: 42 + workingRun.delegations.length * 11,
              created_at: new Date().toISOString(),
            };
            workingRun.delegations.push(delegation);
            emitLocalAgui("TOOL_CALL_RESULT", "kernel_delegation", {
              from: task.role,
              to: targetRole,
            });
          }
        }
        syncRun();
      }

      // Wave-level Git Worktree Patch Reconciliation
      const waveWorktrees = (workingRun.worktrees || []).filter((wt) =>
        waveIds.includes(wt.task_id),
      );
      if (waveWorktrees.length > 0 && !cancelRef.current) {
        const wMap = waveFileOwners.get(w) || new Map();
        const cleanFiles: string[] = [];
        const conflictingFiles: WaveReconciliationReport["conflicting_files"] = [];
        const leaseByTask = new Map(waveWorktrees.map((wt) => [wt.task_id, wt.lease_id]));
        for (const [fp, owners] of Array.from(wMap.entries()).sort((a, b) =>
          a[0].localeCompare(b[0]),
        )) {
          const leasedOwners = owners.filter((o: { taskId: string }) => leaseByTask.has(o.taskId));
          if (leasedOwners.length > 1) {
            conflictingFiles.push({
              file_path: fp,
              roles: leasedOwners.map((o: { role: string }) => o.role),
              lease_ids: leasedOwners.map((o: { taskId: string }) => leaseByTask.get(o.taskId) || ""),
            });
          } else if (leasedOwners.length === 1) {
            cleanFiles.push(fp);
          }
        }
        const report: WaveReconciliationReport = {
          wave_index: w,
          leases_checked: waveWorktrees.length,
          clean_files: cleanFiles,
          conflicting_files: conflictingFiles,
          merge_order: waveWorktrees.map((wt) => `${wt.role}:${wt.branch_name}`),
          status: conflictingFiles.length > 0 ? "conflicts_detected" : "clean",
          reconciled_at: new Date().toISOString(),
        };
        workingRun.reconciliations = [...(workingRun.reconciliations || []), report];
        emitLocalAgui("STATE_DELTA", "kernel_wave_reconciled", {
          wave_index: w,
          status: report.status,
          leases_checked: report.leases_checked,
        });
        syncRun();
      }

      // Autonomous Critique -> Remediation -> Re-Verification Loop (Preview Demo)
      if (!cancelRef.current && simulateBlockingFinding && maxRepairRounds > 0 && !repairTriggered) {
        const reviewerTask = waveIds
          .map((tid) => byId.get(tid))
          .find(
            (t): t is KernelTask =>
              Boolean(t) &&
              (t!.department === "security" || t!.department === "quality") &&
              t!.status === "completed",
          );
        const targetTask = workingRun.tasks.find(
          (t) =>
            (t.role === "backend_engineer" || t.department === "engineering") &&
            t.status === "completed",
        );

        if (reviewerTask && targetTask) {
          repairTriggered = true;
          const findingMsg =
            reviewerTask.department === "security"
              ? "Missing project ownership assertion on kernel artifacts route"
              : "Edge-case regression detected on parallel wave conflict serializer";

          targetTask.status = "running";
          targetTask.attempts += 1;
          targetTask.model_tier = "reasoning";
          targetTask.model_id = "gemini-2.5-pro";
          syncRun();
          await new Promise((r) => setTimeout(r, 200));
          if (cancelRef.current) break;

          targetTask.status = "completed";
          publishLocalArtifact(
            targetTask,
            targetTask.wave_index,
            `Remediated round 1 finding from ${reviewerTask.role}: added guard & validation.`,
          );

          reviewerTask.status = "running";
          reviewerTask.attempts += 1;
          syncRun();
          await new Promise((r) => setTimeout(r, 160));
          if (cancelRef.current) break;

          reviewerTask.status = "completed";
          publishLocalArtifact(
            reviewerTask,
            w,
            `Re-verified ${targetTask.role} v2 artifact — 0 blocking findings remaining.`,
          );

          const cycle: RepairCycleRecord = {
            cycle_id: `rep_${(workingRun.repair_cycles || []).length + 1}`,
            round_number: 1,
            reviewer_task_id: reviewerTask.id,
            reviewer_role: reviewerTask.role,
            target_task_id: targetTask.id,
            target_role: targetTask.role,
            findings: [
              {
                finding_id: "find_1",
                severity: "critical",
                blocking: true,
                target_role: targetTask.role,
                message: findingMsg,
                suggested_fix: "Enforce project access check and add unit regression test",
              },
            ],
            outcome: "resolved",
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
          };
          workingRun.repair_cycles = [...(workingRun.repair_cycles || []), cycle];
          emitLocalAgui("CUSTOM", "kernel_repair_cycle", {
            reviewer: reviewerTask.role,
            target: targetTask.role,
            outcome: "resolved",
          });
          syncRun();
        }
      }
    }

    // Release all isolated worktree leases cleanly
    workingRun.worktrees = (workingRun.worktrees || []).map((wt) => ({
      ...wt,
      status: "released",
      released_at: new Date().toISOString(),
    }));

    // Enforce tenant governance policy notes & generate OpenTelemetry W3C Trace Summary
    const enforcements: string[] = [];
    if (maxBudgetUsd > tenantPolicy.max_run_budget_usd) {
      enforcements.push(
        `Clamped budget ceiling to $${tenantPolicy.max_run_budget_usd.toFixed(2)}`,
      );
    }
    if (tenantPolicy.require_approval_for_delivery) {
      enforcements.push("Mandatory Pre-Delivery Approval Gate active");
    }
    workingRun.policy_enforcements = enforcements;

    if (cancelRef.current) {
      for (const t of workingRun.tasks) {
        if (t.status === "pending" || t.status === "running") {
          t.status = "cancelled";
        }
      }
      workingRun.status = "cancelled";
    } else {
      const allCompleted = workingRun.tasks.every((t) => t.status === "completed");
      workingRun.status = allCompleted ? "completed" : "partial_failure";
    }

    workingRun.finished_at = new Date().toISOString();
    workingRun.duration_ms = Date.now() - startTime;

    const traceId = `${workingRun.id.replace(/[^a-f0-9]/gi, "").padEnd(16, "a").slice(0, 16)}${Date.now().toString(16).padStart(16, "0").slice(-16)}`;
    const rootSpanId = "1000000000000001";
    const spans: TraceSpan[] = [
      {
        trace_id: traceId,
        span_id: rootSpanId,
        parent_span_id: null,
        name: "kernel.run",
        kind: "INTERNAL",
        duration_ms: workingRun.duration_ms,
        status: workingRun.status === "completed" ? "OK" : "ERROR",
        attributes: { "forge.run_id": workingRun.id, "forge.waves": workingRun.waves.length },
      },
      ...workingRun.tasks.map((t, idx) => ({
        trace_id: traceId,
        span_id: `200000000000${String(idx + 1).padStart(4, "0")}`,
        parent_span_id: rootSpanId,
        name: "kernel.task",
        kind: "INTERNAL",
        duration_ms: t.duration_ms || 120,
        status: t.status === "completed" ? "OK" : "ERROR",
        attributes: {
          "agent.role": t.role,
          "agent.department": t.department,
          "llm.model": t.model_id || "gemini-2.5-flash",
          "llm.cost_usd": t.cost_usd || 0,
        },
      })),
    ];
    const costByDept: Record<string, number> = {};
    for (const t of workingRun.tasks) {
      costByDept[t.department] = Number(
        ((costByDept[t.department] || 0) + (t.cost_usd || 0)).toFixed(6),
      );
    }
    workingRun.trace_summary = {
      trace_id: traceId,
      run_id: workingRun.id,
      project_id: projectId,
      span_count: spans.length,
      error_span_count: spans.filter((s) => s.status !== "OK").length,
      total_duration_ms: workingRun.duration_ms,
      cost_by_department: costByDept,
      spans,
    };

    // Ingest completed run into Cross-Run Knowledge Fabric
    setKnowledgeSnapshot((prev) => {
      const epNode = {
        node_id: `ep_${workingRun.id}`,
        project_id: projectId,
        node_type: "episode",
        label: `Run ${workingRun.id} (${workingRun.status})`,
        summary: `Objective: ${workingRun.objective.slice(0, 180)} | Artifacts: ${(workingRun.artifacts || []).length} | Repairs: ${(workingRun.repair_cycles || []).length}`,
        created_at: new Date().toISOString(),
      };
      return {
        ...prev,
        node_count: prev.node_count + 1 + (workingRun.artifacts || []).length,
        edge_count: prev.edge_count + (workingRun.artifacts || []).length,
        counts_by_type: {
          ...prev.counts_by_type,
          episode: (prev.counts_by_type.episode || 0) + 1,
        },
        recent_nodes: [epNode, ...prev.recent_nodes].slice(0, 20),
      };
    });

    emitLocalAgui("RUN_FINISHED", "kernel_run_completed", { status: workingRun.status });
    syncRun();

    setLocalDecisions((prev) => [
      {
        id: `dec_${workingRun.id}`,
        trigger: `kernel_run:${workingRun.id}`,
        rationale: `Multi-agent kernel executed "${workingRun.objective}" across ${workingRun.waves.length} wave(s), activated ${(workingRun.skill_activations || []).length} skill(s), and published ${(workingRun.artifacts || []).length} evaluated artifact(s) (${workingRun.status}).`,
        actions: workingRun.tasks.map((t) => `${t.role}: ${t.status}`),
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    setExecuting(false);
  };

  const handleExecute = async () => {
    const cleanObjective = objective.trim();
    if (cleanObjective.length < 3) {
      setErrorMsg("Enter an engineering objective before starting execution.");
      return;
    }
    setErrorMsg(null);

    if (!LIVE_MODE) {
      const freshPlan = planObjectiveLocally(projectId, cleanObjective, {
        maxAgents: 10,
        includeGovernanceGates: includeGates,
        maxConcurrency,
        maxDelegations,
        failFast,
        maxRepairRounds,
        requireDeliveryApproval,
        maxBudgetUsd,
        isolateWorktrees,
        preferLocalLlm,
      });
      await runLocalWaveExecution(freshPlan);
      return;
    }

    setExecuting(true);
    try {
      const started = await kernelApi.startRun(projectId, {
        objective: cleanObjective,
        max_agents: 10,
        include_governance_gates: includeGates,
        max_concurrency: maxConcurrency,
        max_delegations_per_run: maxDelegations,
        max_repair_rounds: maxRepairRounds,
        require_delivery_approval: requireDeliveryApproval,
        max_budget_usd: maxBudgetUsd,
        isolate_worktrees: isolateWorktrees,
        prefer_local_llm: preferLocalLlm,
        fail_fast: failFast,
      });
      setActiveRun(started);
      setAguiEvents([]);

      if (aguiUnsubRef.current) {
        aguiUnsubRef.current();
      }
      aguiUnsubRef.current = subscribeAguiStream(projectId, started.id, (ev) => {
        setAguiEvents((prev) =>
          prev.some((existing) => existing.event_id === ev.event_id)
            ? prev
            : [...prev.slice(-49), ev],
        );
      });

      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const latest = await kernelApi.getRun(projectId, started.id);
          setActiveRun(latest);
          protocolApi
            .getA2UISurfaces(projectId, started.id)
            .then((res) => {
              if (res?.surfaces) setA2UISurfaces(res.surfaces);
            })
            .catch(() => {});

          if (
            latest.status === "completed" ||
            latest.status === "failed" ||
            latest.status === "partial_failure" ||
            latest.status === "cancelled"
          ) {
            if (pollTimerRef.current !== null) {
              window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            if (aguiUnsubRef.current) {
              aguiUnsubRef.current();
              aguiUnsubRef.current = null;
            }
            setExecuting(false);
          }
        } catch {
          if (pollTimerRef.current !== null) {
            window.clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          if (aguiUnsubRef.current) {
            aguiUnsubRef.current();
            aguiUnsubRef.current = null;
          }
          setExecuting(false);
        }
      }, 1500);
    } catch {
      const fallback = planObjectiveLocally(projectId, cleanObjective, {
        maxAgents: 10,
        includeGovernanceGates: includeGates,
        maxConcurrency,
        maxDelegations,
        failFast,
        maxRepairRounds,
        requireDeliveryApproval,
        maxBudgetUsd,
        isolateWorktrees,
        preferLocalLlm,
      });
      await runLocalWaveExecution(fallback);
    }
  };

  const handleResolveGate = async (approved: boolean) => {
    if (!pendingGate) return;
    setResolvingGate(true);
    try {
      if (localGateResolverRef.current) {
        localGateResolverRef.current({ approved, note: gateNote.trim() });
        setGateNote("");
        return;
      }
      if (LIVE_MODE) {
        if (approved) {
          await kernelApi.approveGate(projectId, activeRun.id, pendingGate.gate_id, gateNote.trim());
        } else {
          await kernelApi.rejectGate(projectId, activeRun.id, pendingGate.gate_id, gateNote.trim());
        }
        setGateNote("");
        const refreshed = await kernelApi.getRun(projectId, activeRun.id);
        setActiveRun(refreshed);
      }
    } catch {
      setErrorMsg("Unable to submit governance gate decision. Retry or cancel the active run.");
    } finally {
      setResolvingGate(false);
    }
  };

  /** Approve/reject a gate from an A2UI approval_card. Throws on failure so the card can show the error. */
  const handleA2UIGateDecision = async (gateId: string, action: "approve" | "reject") => {
    const approved = action === "approve";
    const gate = (activeRun.approval_gates || []).find((g) => g.gate_id === gateId);
    if (localGateResolverRef.current && gate?.status === "pending") {
      localGateResolverRef.current({ approved, note: gateNote.trim() });
      setGateNote("");
      return;
    }
    if (!LIVE_MODE) {
      throw new Error("Gate is no longer awaiting a decision");
    }
    if (approved) {
      await kernelApi.approveGate(projectId, activeRun.id, gateId, gateNote.trim());
    } else {
      await kernelApi.rejectGate(projectId, activeRun.id, gateId, gateNote.trim());
    }
    setGateNote("");
    // The decision succeeded; refresh failures are non-fatal (polling will catch up).
    try {
      const refreshed = await kernelApi.getRun(projectId, activeRun.id);
      setActiveRun(refreshed);
      const res = await protocolApi.getA2UISurfaces(projectId, activeRun.id);
      if (res?.surfaces) setA2UISurfaces(res.surfaces);
    } catch {
      /* ignore */
    }
  };

  const handleLoadMcpAppResource = (app: MCPAppSpec, ctx: { role: string; department: string }) =>
    protocolApi.getMcpAppResource(projectId, app.app_id, ctx);

  const handleCancel = async () => {
    cancelRef.current = true;
    if (localGateResolverRef.current) {
      localGateResolverRef.current({ approved: false, note: "Cancelled by operator" });
    }
    if (LIVE_MODE && activeRun.id) {
      try {
        await kernelApi.cancelRun(projectId, activeRun.id);
      } catch {
        // Ignore if run already finished
      }
    }
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setExecuting(false);
  };

  const handleAskProductLead = async (mode: "why" | "what-changed" | "what-next") => {
    setAskingLead(true);
    try {
      if (LIVE_MODE) {
        const res =
          mode === "why"
            ? await productLeadApi.why(projectId, leadQuestion)
            : mode === "what-changed"
              ? await productLeadApi.whatChanged(projectId)
              : await productLeadApi.whatNext(projectId);
        setLeadAnswer(res);
      } else {
        if (mode === "what-changed") {
          setLeadAnswer({
            answer: `${localDecisions.length} kernel decision(s) recorded in this workspace. Latest: ${localDecisions[0]?.rationale || "None"}.`,
            confidence: 0.92,
            changes: localDecisions,
          });
        } else if (mode === "what-next") {
          const pendingTasks = activeRun.tasks.filter((t) => t.status === "pending").length;
          setLeadAnswer({
            answer: pendingGate
              ? `Execution is paused at governance gate "${pendingGate.gate_name}". Approve or reject the gate to continue.`
              : pendingTasks > 0
                ? `${pendingTasks} planned agent task(s) across ${activeRun.waves.length} wave(s) are ready for parallel execution.`
                : `Latest run (${activeRun.id}) finished with status "${activeRun.status}". Next step: inspect blackboard artifacts, quality evaluations, or start a new objective.`,
            confidence: 0.9,
          });
        } else {
          const qWords = leadQuestion
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length > 3);
          const match = localDecisions.find((d) =>
            qWords.some((w) => `${d.trigger} ${d.rationale}`.toLowerCase().includes(w)),
          );
          setLeadAnswer(
            match
              ? {
                  answer: `${match.rationale} (Source: ${match.trigger})`,
                  confidence: 0.88,
                  citations: [match],
                }
              : {
                  answer: "I don't have enough evidence.",
                  confidence: 0.0,
                  citations: [],
                },
          );
        }
      }
    } catch {
      setLeadAnswer({
        answer: "I don't have enough evidence.",
        confidence: 0.0,
        citations: [],
      });
    } finally {
      setAskingLead(false);
    }
  };

  return (
    <div className="p-4 sm:p-5 space-y-5 bg-base">
      {/* 1. 9-Department Autonomous Engineering Org Blueprint */}
      <section aria-label="Autonomous Engineering Organisation">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <Layers size={15} className="text-accent" />
              Autonomous Engineering Organisation
            </h2>
            <p className="text-xs text-muted">
              {blueprint.department_count} departments · {blueprint.role_count} specialist roles ·{" "}
              {skillsCatalog.length} skills · AG-UI / MCP / A2UI · isolated worktrees & budget guard
            </p>
          </div>
          {selectedDepartment && (
            <button
              type="button"
              onClick={() => setSelectedDepartment(null)}
              className="text-xs font-medium text-accent hover:underline cursor-pointer"
            >
              Clear department filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-9 gap-2">
          {blueprint.departments.map((dept) => {
            const assignedCount = activeDepartmentCounts[dept.key] || 0;
            const isSelected = selectedDepartment === dept.key;
            return (
              <button
                key={dept.key}
                type="button"
                onClick={() => setSelectedDepartment(isSelected ? null : dept.key)}
                className={`text-left p-2.5 rounded-md border transition-colors cursor-pointer ${
                  isSelected
                    ? "border-accent bg-accent-soft"
                    : assignedCount > 0
                      ? "border-border bg-panel hover:border-accent/50"
                      : "border-border/70 bg-panel-alt/40 hover:border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-semibold text-ink truncate">{dept.name}</span>
                  <span className="text-[10px] font-mono text-muted">T{dept.stage_tier}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px]">
                  <span className="text-muted">{dept.roles.length} roles</span>
                  {assignedCount > 0 && (
                    <span className="font-mono tabular-nums font-semibold text-accent">
                      {assignedCount} active
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Objective Planner & Kernel Governance Controls */}
      <section
        aria-label="Multi-Agent DAG Planner"
        className="rounded-lg border border-border bg-panel p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="kernel-objective-input" className="text-xs font-semibold text-ink">
            Engineering Objective
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {OBJECTIVE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setObjective(preset.objective);
                  void handlePlan(preset.objective);
                }}
                className="px-2 py-1 text-[11px] rounded border border-border bg-base text-muted hover:text-ink hover:border-accent/50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <textarea
          id="kernel-objective-input"
          rows={2}
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="Describe a cross-functional engineering objective to decompose into parallel multi-agent waves..."
          className="w-full rounded-md border border-border bg-base px-3 py-2 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
            <label className="flex items-center gap-1.5">
              <Sliders size={13} />
              <span>Concurrency:</span>
              <select
                aria-label="Max parallel concurrency"
                value={maxConcurrency}
                onChange={(e) => setMaxConcurrency(Number(e.target.value))}
                className="rounded border border-border bg-base px-2 py-1 text-xs text-ink"
              >
                {[1, 2, 4, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} parallel
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5">
              <span>Delegations:</span>
              <select
                aria-label="Max delegations per run"
                value={maxDelegations}
                onChange={(e) => setMaxDelegations(Number(e.target.value))}
                className="rounded border border-border bg-base px-2 py-1 text-xs text-ink"
              >
                {[4, 8, 12, 20].map((n) => (
                  <option key={n} value={n}>
                    {n} max
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5">
              <span>Repair rounds:</span>
              <select
                aria-label="Max autonomous repair rounds"
                value={maxRepairRounds}
                onChange={(e) => setMaxRepairRounds(Number(e.target.value))}
                className="rounded border border-border bg-base px-2 py-1 text-xs text-ink"
              >
                {[0, 1, 2, 3].map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "Off" : `${n} round${n === 1 ? "" : "s"}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5">
              <span>Budget cap:</span>
              <select
                aria-label="Max run budget USD"
                value={maxBudgetUsd}
                onChange={(e) => setMaxBudgetUsd(Number(e.target.value))}
                className="rounded border border-border bg-base px-2 py-1 text-xs font-mono tabular-nums text-ink"
              >
                {[0.5, 1.0, 2.5, 5.0, 10.0].map((amt) => (
                  <option key={amt} value={amt}>
                    ${amt.toFixed(2)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeGates}
                onChange={(e) => setIncludeGates(e.target.checked)}
                className="accent-accent"
              />
              <span>Auto Architecture & QA Gates</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isolateWorktrees}
                onChange={(e) => setIsolateWorktrees(e.target.checked)}
                className="accent-accent"
              />
              <span>Isolate Worktrees</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={preferLocalLlm}
                onChange={(e) => setPreferLocalLlm(e.target.checked)}
                className="accent-accent"
              />
              <span>Prefer Local LLM (Ollama/vLLM)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={requireDeliveryApproval}
                onChange={(e) => setRequireDeliveryApproval(e.target.checked)}
                className="accent-accent"
              />
              <span>Pre-Delivery Approval Gate</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={failFast}
                onChange={(e) => setFailFast(e.target.checked)}
                className="accent-accent"
              />
              <span>Fail-Fast Waves</span>
            </label>

            {!LIVE_MODE && (
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={simulateBlockingFinding}
                  onChange={(e) => setSimulateBlockingFinding(e.target.checked)}
                  className="accent-accent"
                />
                <span>Simulate Blocking Finding</span>
              </label>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handlePlan()}
              disabled={planning || executing}
              className="px-3 py-1.5 rounded-md border border-border bg-base text-xs font-medium text-ink hover:border-accent/60 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw size={13} className={planning ? "animate-spin" : ""} />
              Plan DAG Waves
            </button>

            {executing ? (
              <button
                type="button"
                onClick={() => void handleCancel()}
                className="px-3 py-1.5 rounded-md border border-err/50 bg-err/10 text-xs font-semibold text-err hover:bg-err/20 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Square size={13} />
                Cancel Run
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleExecute()}
                disabled={planning}
                className="px-3.5 py-1.5 rounded-md bg-accent text-on-ink text-xs font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Play size={13} />
                Execute Parallel Waves
              </button>
            )}
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn flex items-center gap-2"
          >
            <AlertTriangle size={14} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </section>

      {/* Interactive Human-in-the-Loop Governance Approval Gate Banner */}
      {pendingGate && (
        <section
          aria-label="Human Approval Gate"
          className="rounded-lg border border-warn/60 bg-warn/10 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-ink flex items-center gap-1.5">
                <Lock size={14} className="text-warn" />
                Governance Approval Required ·{" "}
                <span className="font-mono">{pendingGate.gate_name}</span>
              </h3>
              <p className="text-xs text-muted">{pendingGate.reason}</p>
            </div>
            <span className="text-[11px] font-mono text-warn">
              Paused before Wave {pendingGate.wave_index}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              aria-label="Approval gate decision note"
              value={gateNote}
              onChange={(e) => setGateNote(e.target.value)}
              placeholder="Optional sign-off note or rejection reason..."
              className="flex-1 min-w-[200px] rounded-md border border-border bg-base px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={resolvingGate}
              onClick={() => void handleResolveGate(true)}
              className="px-3 py-1.5 rounded-md bg-accent text-on-ink text-xs font-semibold hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Approve & Resume
            </button>
            <button
              type="button"
              disabled={resolvingGate}
              onClick={() => void handleResolveGate(false)}
              className="px-3 py-1.5 rounded-md border border-err/50 bg-base text-xs font-semibold text-err hover:bg-err/10 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Reject & Halt
            </button>
          </div>
        </section>
      )}

      {/* 3. Parallel Execution Waves Board */}
      <section aria-label="Parallel Execution Waves" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <GitBranch size={14} className="text-accent" />
            <span className="font-semibold text-ink">
              Execution Run <span className="font-mono text-muted">{activeRun.id}</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded border text-[11px] font-mono ${statusTone(activeRun.status)}`}
            >
              {activeRun.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-muted">
            <span>{activeRun.metrics.wave_count} waves</span>
            <span aria-hidden="true">·</span>
            <span>{activeRun.metrics.total_tasks} tasks</span>
            <span aria-hidden="true">·</span>
            <span>peak {activeRun.metrics.max_parallelism}x</span>
            <span aria-hidden="true">·</span>
            <span>{artifacts.length} artifacts</span>
            <span aria-hidden="true">·</span>
            <span>{repairCycles.length} repairs</span>
            {conflicts.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-warn font-semibold">{conflicts.length} conflict(s)</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>${(activeRun.cost_summary?.spent_usd ?? 0).toFixed(4)}</span>
            {activeRun.duration_ms > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{activeRun.duration_ms}ms</span>
              </>
            )}
          </div>
        </div>

        <p className="text-xs text-muted">{activeRun.risk_notes}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {activeRun.waves.map((waveTaskIds, waveIdx) => {
            const visibleTasks = waveTaskIds
              .map((id) => taskById.get(id))
              .filter((t): t is KernelTask => Boolean(t))
              .filter((t) => !selectedDepartment || t.department === selectedDepartment);

            return (
              <div
                key={`wave-${waveIdx}`}
                className="rounded-lg border border-border bg-panel flex flex-col"
              >
                <div className="px-3 py-2 border-b border-border bg-panel-alt/50 flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink font-mono">
                    WAVE {waveIdx}
                  </span>
                  <span className="text-[11px] text-muted tabular-nums">
                    {waveTaskIds.length} parallel task{waveTaskIds.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="p-2.5 space-y-2">
                  {visibleTasks.length === 0 ? (
                    <p className="text-[11px] text-muted py-3 text-center">
                      No tasks match selected department
                    </p>
                  ) : (
                    visibleTasks.map((task) => (
                      <div
                        key={task.id}
                        className="rounded-md border border-border bg-base p-2.5 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink truncate">
                              {task.role.replace(/_/g, " ")}
                            </p>
                            <p className="text-[11px] text-muted font-mono">
                              {task.department}
                              {task.model_tier ? ` · ${task.model_tier}` : ""}
                            </p>
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-mono shrink-0 flex items-center gap-1 ${statusTone(task.status)}`}
                          >
                            {task.status === "running" && (
                              <Loader2 size={10} className="animate-spin" />
                            )}
                            {task.status === "completed" && <CheckCircle2 size={10} />}
                            {task.status === "failed" && <XCircle size={10} />}
                            {task.status === "pending" && <Clock size={10} />}
                            {task.status}
                          </span>
                        </div>

                        {task.depends_on.length > 0 && (
                          <p className="text-[10px] font-mono text-muted truncate">
                            depends on: {task.depends_on.length} upstream task
                            {task.depends_on.length === 1 ? "" : "s"}
                          </p>
                        )}

                        {task.duration_ms > 0 && (
                          <p className="text-[10px] font-mono tabular-nums text-muted">
                            {task.duration_ms}ms · attempt {task.attempts}
                            {task.cost_usd ? ` · $${task.cost_usd.toFixed(4)}` : ""}
                          </p>
                        )}

                        {task.error && (
                          <p className="text-[11px] text-err line-clamp-2">{task.error}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. Full OS Runtime Inspector & Persistent Product Lead */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <KernelInspectorPanel
          activeRun={activeRun}
          maxRepairRounds={maxRepairRounds}
          skillsCatalog={skillsCatalog}
          mcpTools={mcpTools}
          mcpApps={mcpApps}
          a2aCard={a2aCard}
          aguiEvents={aguiEvents}
          a2uiSurfaces={a2uiSurfaces}
          onInvokeMcpScan={handleInvokeMcpScan}
          mcpScanResult={mcpScanResult}
          invokingMcp={invokingMcp}
          onRegisterMcpServer={handleRegisterMcpServer}
          mcpRegisterStatus={mcpRegisterStatus}
          registeringMcp={registeringMcp}
          knowledgeSnapshot={knowledgeSnapshot}
          memoryHits={memoryHits}
          onQueryMemory={handleQueryMemory}
          queryingMemory={queryingMemory}
          benchmarkReport={benchmarkReport}
          onRunBenchmarks={handleRunBenchmarks}
          runningBenchmarks={runningBenchmarks}
          marketplacePackages={marketplacePackages}
          onInstallMarketplacePkg={handleInstallMarketplacePkg}
          installingPkgId={installingPkgId}
          marketplaceStatus={marketplaceStatus}
          tenantPolicy={tenantPolicy}
          onUpdatePolicy={handleUpdatePolicy}
          onApprovalDecision={handleA2UIGateDecision}
          onLoadMcpAppResource={LIVE_MODE ? handleLoadMcpAppResource : undefined}
        />

        <section
          aria-label="Persistent Product Lead"
          className="rounded-lg border border-border bg-panel p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-ink flex items-center gap-1.5">
              <Brain size={14} className="text-accent" />
              Persistent AI Product Lead
            </h3>
            <span className="text-[11px] font-mono text-muted">Decision Log</span>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Ask Persistent Product Lead"
              value={leadQuestion}
              onChange={(e) => setLeadQuestion(e.target.value)}
              placeholder="Ask why a decision was made..."
              className="flex-1 rounded-md border border-border bg-base px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={askingLead}
              onClick={() => void handleAskProductLead("why")}
              className="px-3 py-1.5 rounded-md bg-accent text-on-ink text-xs font-semibold hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ask Why
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={askingLead}
              onClick={() => void handleAskProductLead("what-changed")}
              className="px-2.5 py-1 rounded border border-border bg-base text-[11px] text-muted hover:text-ink cursor-pointer"
            >
              What changed?
            </button>
            <button
              type="button"
              disabled={askingLead}
              onClick={() => void handleAskProductLead("what-next")}
              className="px-2.5 py-1 rounded border border-border bg-base text-[11px] text-muted hover:text-ink cursor-pointer"
            >
              What next?
            </button>
          </div>

          {leadAnswer && (
            <div className="rounded-md border border-border bg-base p-3 space-y-1">
              <p className="text-xs text-ink">{leadAnswer.answer}</p>
              <p className="text-[10px] font-mono tabular-nums text-muted">
                confidence: {Math.round((leadAnswer.confidence || 0) * 100)}%
              </p>
            </div>
          )}

          {approvalGates.length > 0 && (
            <div className="pt-2 border-t border-border space-y-1.5">
              <p className="text-[11px] font-semibold text-muted">Governance Gate History</p>
              {approvalGates.map((g) => (
                <div
                  key={g.gate_id}
                  className="flex items-center justify-between gap-2 text-[11px] font-mono"
                >
                  <span className="text-ink truncate">{g.gate_name}</span>
                  <span
                    className={
                      g.status === "approved"
                        ? "text-ok"
                        : g.status === "rejected"
                          ? "text-err"
                          : "text-warn"
                    }
                  >
                    {g.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
