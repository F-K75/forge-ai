import { api } from "./api";

export type KernelRunStatus =
  | "planned"
  | "running"
  | "waiting_approval"
  | "completed"
  | "partial_failure"
  | "failed"
  | "cancelled";

export type KernelTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "cancelled";

export type DelegationStatus = "answered" | "rejected" | "timeout" | "failed";

export interface OrgRoleBlueprint {
  role: string;
  display_name: string;
  backend_agent_key: string;
  capabilities: string[];
  keywords?: string[];
}

export interface OrgDepartmentBlueprint {
  key: string;
  name: string;
  stage_tier: number;
  roles: OrgRoleBlueprint[];
}

export interface OrgBlueprint {
  department_count: number;
  role_count: number;
  departments: OrgDepartmentBlueprint[];
  default_delegation_policy: {
    max_delegations_per_run: number;
    max_depth: number;
    timeout_seconds: number;
    allowed_department_route_count: number;
  };
}

export interface KernelTask {
  id: string;
  title: string;
  role: string;
  department: string;
  description: string;
  depends_on: string[];
  wave_index: number;
  status: KernelTaskStatus;
  attempts: number;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms: number;
  model_tier?: string | null;
  model_id?: string | null;
  cost_usd?: number;
  activated_skills?: string[];
  worktree_lease_id?: string | null;
  output?: Record<string, unknown> | null;
  error?: string | null;
}

export interface DelegationRecord {
  delegation_id: string;
  from_task_id: string;
  from_role: string;
  to_role: string;
  question: string;
  depth: number;
  status: DelegationStatus;
  answer?: string | null;
  reason?: string | null;
  duration_ms: number;
  created_at: string;
}

export interface BlackboardArtifact {
  artifact_id: string;
  key: string;
  artifact_type: string;
  version: number;
  producer_task_id: string;
  producer_role: string;
  department: string;
  wave_index: number;
  summary: string;
  touched_files: string[];
  created_at: string;
}

export interface FileConflict {
  conflict_id: string;
  file_path: string;
  wave_index: number;
  task_ids: string[];
  roles: string[];
  status: "detected" | "resolved" | string;
  detected_at: string;
}

export interface ReviewFinding {
  finding_id: string;
  severity: "critical" | "high" | "medium" | "low" | string;
  blocking: boolean;
  message: string;
  target_role?: string | null;
  suggested_fix?: string;
}

export interface RepairCycleRecord {
  cycle_id: string;
  round_number: number;
  reviewer_task_id: string;
  reviewer_role: string;
  target_task_id: string;
  target_role: string;
  findings: ReviewFinding[];
  outcome: "resolved" | "retrying" | "escalated" | "failed" | string;
  started_at: string;
  finished_at?: string | null;
}

export interface ApprovalGate {
  gate_id: string;
  gate_name: string;
  reason: string;
  wave_index: number;
  status: "pending" | "approved" | "rejected" | string;
  decided_by?: string | null;
  note: string;
  created_at: string;
  decided_at?: string | null;
}

export interface SkillManifest {
  name: string;
  domain: string;
  description: string;
  version: string;
  keywords: string[];
  dependencies: string[];
  required_permissions: string[];
  allowed_departments: string[];
  source_path?: string | null;
  origin: "filesystem" | "builtin" | string;
}

export interface SkillActivation {
  task_id?: string;
  role?: string;
  skill_name: string;
  domain: string;
  version: string;
  origin: string;
  score: number;
  resolved_dependencies: string[];
  instructions_excerpt: string;
}

export interface WorktreeLease {
  lease_id: string;
  run_id: string;
  task_id: string;
  role: string;
  department: string;
  branch_name: string;
  worktree_path: string;
  isolation_mode: string;
  status: "active" | "released" | "failed" | string;
  created_at: string;
  released_at?: string | null;
}

export interface WaveReconciliationReport {
  wave_index: number;
  leases_checked: number;
  clean_files: string[];
  conflicting_files: Array<{
    file_path: string;
    roles: string[];
    lease_ids: string[];
  }>;
  merge_order: string[];
  status: "clean" | "conflicts_detected" | string;
  reconciled_at: string;
}

export interface ArtifactEvaluation {
  artifact_id: string;
  producer_role: string;
  artifact_type: string;
  version: number;
  completeness_score: number;
  traceability_score: number;
  conflict_safety_score: number;
  verification_score: number;
  overall_score: number;
  passed: boolean;
  notes: string[];
  evaluated_at: string;
}

export interface CostSummary {
  max_budget_usd: number;
  spent_usd: number;
  remaining_usd: number;
  utilization_pct: number;
}

export interface AGUIEvent {
  event_id: number;
  agui_type: string;
  kernel_event: string;
  project_id: string;
  run_id: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface AiSdkStreamChunk {
  type: string;
  messageId?: string;
  id?: string;
  toolCallId?: string;
  data?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface MCPToolSpec {
  name: string;
  server_id: string;
  description: string;
  allowed_departments: string[];
  read_only: boolean;
  /** MCP Apps `ui://` resource declared by the tool (`_meta.ui.resourceUri`). */
  ui_resource_uri?: string | null;
}

export interface A2UISurface {
  surface_id: string;
  protocol: string;
  title: string;
  components: Array<Record<string, unknown>>;
}

export interface MCPAppSpec {
  app_id: string;
  title: string;
  tool_name: string;
  server_id: string;
  description: string;
  protocol: string;
  ui_schema: {
    input_field?: string;
    input_label?: string;
    action_label?: string;
    result_view?: string;
    /** "mcp-app-resource" for apps rendered from a sandboxed `ui://` resource. */
    kind?: string;
    resource_uri?: string;
  };
  resource_uri?: string | null;
}

/**
 * Sanitized MCP App UI resource. Render ONLY as
 * `<iframe srcdoc={html} sandbox={sandbox.iframe_sandbox} allow={sandbox.iframe_allow}
 *  referrerPolicy={sandbox.referrer_policy}>` and never inject `html` into Forge's own DOM.
 */
export interface MCPAppResourcePayload {
  app_id: string;
  tool_name: string;
  server_id: string;
  resource_uri: string;
  mime_type: "text/html;profile=mcp-app";
  html: string;
  size_bytes: number;
  content_sha256: string;
  protocol: string;
  extension: string;
  warnings: string[];
  sandbox: {
    render_mode: "iframe-srcdoc";
    iframe_sandbox: string;
    iframe_allow: string;
    referrer_policy: string;
    csp: string;
    allowed_domains: {
      connect_domains: string[];
      resource_domains: string[];
      frame_domains: string[];
    };
    denied_permissions: string[];
    prefers_border: boolean;
  };
}

/** A2A `Task` object as returned by Forge's A2A JSON-RPC / REST endpoints. */
export interface A2ATask {
  id: string;
  sessionId?: string | null;
  status: {
    state: "submitted" | "working" | "input-required" | "completed" | "canceled" | "failed" | "unknown";
    message?: { role: string; parts: Array<{ type: string; text?: string }> } | string;
    timestamp: string;
  };
  artifacts: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
}

export interface A2AAgentCard {
  name: string;
  description: string;
  version: string;
  protocol: string;
  url: string;
  capabilities: Record<string, boolean>;
  protocols_supported: string[];
  authentication: { schemes: string[]; projectScoped: boolean };
  departments: string[];
  skills: Array<{ id: string; name: string; domain: string; description: string; tags: string[] }>;
}

export interface A2ATaskResponse {
  task_id: string;
  kernel_run_id: string;
  project_id: string;
  state: "submitted" | "working" | "completed" | "canceled" | "failed";
  summary: string;
  wave_count: number;
  task_count: number;
}

export interface KnowledgeNode {
  node_id: string;
  project_id: string;
  node_type: string;
  label: string;
  summary: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface KnowledgeHit {
  node_id: string;
  node_type: string;
  label: string;
  summary: string;
  score: number;
  related_labels: string[];
  created_at: string;
}

export interface KnowledgeSnapshot {
  project_id: string;
  node_count: number;
  edge_count: number;
  counts_by_type: Record<string, number>;
  recent_nodes: KnowledgeNode[];
}

export interface BenchmarkCaseResult {
  case_id: string;
  title: string;
  passed: boolean;
  quality_score: number;
  cost_usd: number;
  duration_ms: number;
  wave_count: number;
  reconciliations: number;
  repair_cycles: number;
  details: string;
}

export interface RegressionGateResult {
  passed: boolean;
  has_baseline: boolean;
  quality_delta: number;
  cost_delta_pct: number;
  regressions: string[];
}

export interface BenchmarkSuiteReport {
  suite_id: string;
  project_id: string;
  cases: BenchmarkCaseResult[];
  pass_rate: number;
  avg_quality_score: number;
  total_cost_usd: number;
  total_duration_ms: number;
  regression_gate: RegressionGateResult;
  executed_at: string;
}

export interface TraceSpan {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: string;
  duration_ms: number;
  status: "OK" | "ERROR" | string;
  attributes: Record<string, unknown>;
}

export interface RunTraceSummary {
  trace_id: string;
  run_id: string;
  project_id: string;
  span_count: number;
  error_span_count: number;
  total_duration_ms: number;
  cost_by_department: Record<string, number>;
  spans: TraceSpan[];
}

export interface MarketplaceSkillPackage {
  package_id: string;
  name: string;
  title: string;
  domain: string;
  version: string;
  author: string;
  description: string;
  keywords: string[];
  required_permissions: string[];
  allowed_departments: string[];
  instructions: string;
  verified: boolean;
  installs: number;
  rating: number;
  installed?: boolean;
}

export interface TenantGovernancePolicy {
  project_id: string;
  max_run_budget_usd: number;
  require_approval_for_delivery: boolean;
  allow_external_mcp_servers: boolean;
  allow_local_llm_routing: boolean;
  allowed_mcp_domains: string[];
  blocked_skill_permissions: string[];
  updated_by: string;
  updated_at: string;
}

export interface SkillTelemetryRecord {
  skill_name: string;
  invocations: number;
  passed_count: number;
  avg_quality_score: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  routing_boost: number;
}

export interface KernelRun {
  id: string;
  project_id: string;
  objective: string;
  status: KernelRunStatus;
  tasks: KernelTask[];
  waves: string[][];
  delegations: DelegationRecord[];
  artifacts?: BlackboardArtifact[];
  conflicts?: FileConflict[];
  repair_cycles?: RepairCycleRecord[];
  approval_gates?: ApprovalGate[];
  skill_activations?: SkillActivation[];
  worktrees?: WorktreeLease[];
  reconciliations?: WaveReconciliationReport[];
  evaluations?: ArtifactEvaluation[];
  knowledge_hits?: KnowledgeHit[];
  policy_enforcements?: string[];
  trace_summary?: RunTraceSummary;
  cost_summary?: CostSummary;
  config: {
    max_concurrency: number;
    task_timeout_seconds: number;
    max_retries: number;
    fail_fast: boolean;
    max_repair_rounds?: number;
    require_delivery_approval?: boolean;
    max_budget_usd?: number;
    isolate_worktrees?: boolean;
    prefer_local_llm?: boolean;
    delegation_policy: {
      max_delegations_per_run: number;
      max_depth: number;
      timeout_seconds: number;
      allowed_department_route_count: number;
    };
  };
  plan_id?: string | null;
  risk_level: "low" | "medium" | "high" | string;
  risk_notes: string;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_ms: number;
  metrics: {
    total_tasks: number;
    wave_count: number;
    max_parallelism: number;
    completed_tasks: number;
    failed_tasks: number;
    blocked_tasks: number;
    delegation_count: number;
    artifact_count?: number;
    conflict_count?: number;
    repair_cycle_count?: number;
    skill_activation_count?: number;
    worktree_count?: number;
    reconciliation_count?: number;
    avg_quality_score?: number;
    total_cost_usd?: number;
    budget_remaining_usd?: number;
    pending_gates?: number;
  };
}

export interface ProductLeadAnswer {
  answer: string;
  confidence: number;
  citations?: Array<Record<string, unknown>>;
  changes?: Array<Record<string, unknown>>;
  pending?: Array<Record<string, unknown>>;
}

export const kernelApi = {
  getOrgBlueprint: (projectId: string): Promise<OrgBlueprint> =>
    api.get(`/v1/projects/${projectId}/kernel/org-blueprint`).then((r) => r.data),

  planObjective: (
    projectId: string,
    payload: {
      objective: string;
      max_agents?: number;
      include_governance_gates?: boolean;
      plan_id?: string;
    },
  ): Promise<KernelRun> =>
    api.post(`/v1/projects/${projectId}/kernel/plan`, payload).then((r) => r.data),

  startRun: (
    projectId: string,
    payload: {
      objective: string;
      max_agents?: number;
      include_governance_gates?: boolean;
      max_concurrency?: number;
      max_retries?: number;
      fail_fast?: boolean;
      max_repair_rounds?: number;
      require_delivery_approval?: boolean;
      max_budget_usd?: number;
      isolate_worktrees?: boolean;
      prefer_local_llm?: boolean;
      max_delegations_per_run?: number;
      max_delegation_depth?: number;
    },
  ): Promise<KernelRun> =>
    api.post(`/v1/projects/${projectId}/kernel/runs`, payload).then((r) => r.data),

  listRuns: (projectId: string, limit = 20): Promise<{ runs: KernelRun[] }> =>
    api
      .get(`/v1/projects/${projectId}/kernel/runs`, { params: { limit } })
      .then((r) => r.data),

  getRun: (projectId: string, runId: string): Promise<KernelRun> =>
    api.get(`/v1/projects/${projectId}/kernel/runs/${runId}`).then((r) => r.data),

  getRunArtifacts: (
    projectId: string,
    runId: string,
  ): Promise<{
    run_id: string;
    status: KernelRunStatus;
    artifacts: BlackboardArtifact[];
    conflicts: FileConflict[];
    reconciliations?: WaveReconciliationReport[];
    repair_cycles: RepairCycleRecord[];
    approval_gates: ApprovalGate[];
  }> =>
    api
      .get(`/v1/projects/${projectId}/kernel/runs/${runId}/artifacts`)
      .then((r) => r.data),

  approveGate: (
    projectId: string,
    runId: string,
    gateId: string,
    note = "",
  ): Promise<{ run_id: string; gate: ApprovalGate }> =>
    api
      .post(`/v1/projects/${projectId}/kernel/runs/${runId}/gates/${gateId}/approve`, {
        note,
      })
      .then((r) => r.data),

  rejectGate: (
    projectId: string,
    runId: string,
    gateId: string,
    note = "",
  ): Promise<{ run_id: string; gate: ApprovalGate }> =>
    api
      .post(`/v1/projects/${projectId}/kernel/runs/${runId}/gates/${gateId}/reject`, {
        note,
      })
      .then((r) => r.data),

  cancelRun: (
    projectId: string,
    runId: string,
  ): Promise<{ run_id: string; cancel_requested: boolean }> =>
    api
      .post(`/v1/projects/${projectId}/kernel/runs/${runId}/cancel`)
      .then((r) => r.data),
};

export const skillApi = {
  listSkills: (
    projectId: string,
    params?: { domain?: string; department?: string; search?: string },
  ): Promise<{ summary: Record<string, unknown>; skills: SkillManifest[] }> =>
    api.get(`/v1/projects/${projectId}/skills`, { params }).then((r) => r.data),

  routeSkills: (
    projectId: string,
    payload: {
      role: string;
      department: string;
      objective: string;
      task_description?: string;
      top_k?: number;
    },
  ): Promise<{ role: string; department: string; activations: SkillActivation[] }> =>
    api.post(`/v1/projects/${projectId}/skills/route`, payload).then((r) => r.data),

  getTelemetry: (projectId: string): Promise<{ telemetry: SkillTelemetryRecord[] }> =>
    api.get(`/v1/projects/${projectId}/skills/telemetry`).then((r) => r.data),
};

export const protocolApi = {
  listMcpTools: (
    projectId: string,
    department?: string,
  ): Promise<{
    servers: Array<Record<string, unknown>>;
    tools: MCPToolSpec[];
    apps?: MCPAppSpec[];
    audit_log: Array<Record<string, unknown>>;
  }> =>
    api
      .get(`/v1/projects/${projectId}/protocols/mcp/tools`, {
        params: department ? { department } : undefined,
      })
      .then((r) => r.data),

  listMcpApps: (projectId: string): Promise<{ protocol: string; apps: MCPAppSpec[] }> =>
    api.get(`/v1/projects/${projectId}/protocols/mcp/apps`).then((r) => r.data),

  getMcpAppResource: (
    projectId: string,
    appId: string,
    params: { role: string; department: string },
  ): Promise<MCPAppResourcePayload> =>
    api
      .get(`/v1/projects/${projectId}/protocols/mcp/apps/${encodeURIComponent(appId)}/resource`, { params })
      .then((r) => r.data),

  getA2ATask: (projectId: string, taskId: string): Promise<A2ATask> =>
    api
      .get(`/v1/projects/${projectId}/protocols/a2a/tasks/${encodeURIComponent(taskId)}`)
      .then((r) => r.data),

  registerMcpServer: (
    projectId: string,
    payload: { server_id: string; endpoint_url: string; discover_tools?: boolean },
  ): Promise<{ server: Record<string, unknown>; discovered_tools: MCPToolSpec[] }> =>
    api.post(`/v1/projects/${projectId}/protocols/mcp/servers`, payload).then((r) => r.data),

  invokeMcpTool: (
    projectId: string,
    payload: {
      tool_name: string;
      role: string;
      department: string;
      arguments: Record<string, unknown>;
    },
  ): Promise<{ ok: boolean; result?: Record<string, unknown>; error?: string }> =>
    api.post(`/v1/projects/${projectId}/protocols/mcp/invoke`, payload).then((r) => r.data),

  getA2UISurfaces: (
    projectId: string,
    runId: string,
  ): Promise<{ run_id: string; protocol: string; surfaces: A2UISurface[] }> =>
    api
      .get(`/v1/projects/${projectId}/protocols/a2ui/runs/${runId}/surfaces`)
      .then((r) => r.data),

  getA2AAgentCard: (projectId: string): Promise<A2AAgentCard> =>
    api.get(`/v1/projects/${projectId}/protocols/a2a/agent-card`).then((r) => r.data),

  sendA2ATask: (
    projectId: string,
    payload: {
      objective: string;
      caller_agent?: string;
      max_agents?: number;
      max_budget_usd?: number;
      execute_now?: boolean;
    },
  ): Promise<A2ATaskResponse> =>
    api.post(`/v1/projects/${projectId}/protocols/a2a/tasks/send`, payload).then((r) => r.data),
};

export const enterpriseOsApi = {
  getMemory: (projectId: string, limit = 25): Promise<KnowledgeSnapshot> =>
    api.get(`/v1/projects/${projectId}/os/memory`, { params: { limit } }).then((r) => r.data),

  queryMemory: (
    projectId: string,
    payload: { query: string; top_k?: number; max_chars?: number },
  ): Promise<{ project_id: string; query: string; hits: KnowledgeHit[] }> =>
    api.post(`/v1/projects/${projectId}/os/memory/query`, payload).then((r) => r.data),

  runBenchmarks: (projectId: string): Promise<BenchmarkSuiteReport> =>
    api.post(`/v1/projects/${projectId}/os/benchmarks/run`).then((r) => r.data),

  listBenchmarks: (
    projectId: string,
    limit = 10,
  ): Promise<{ project_id: string; reports: BenchmarkSuiteReport[] }> =>
    api.get(`/v1/projects/${projectId}/os/benchmarks`, { params: { limit } }).then((r) => r.data),

  getTrace: (
    projectId: string,
    runId: string,
    format: "summary" | "otlp" = "summary",
  ): Promise<RunTraceSummary> =>
    api
      .get(`/v1/projects/${projectId}/os/traces/${runId}`, { params: { format } })
      .then((r) => r.data),

  listMarketplace: (
    projectId: string,
    params?: { domain?: string; search?: string },
  ): Promise<{ project_id: string; packages: MarketplaceSkillPackage[] }> =>
    api.get(`/v1/projects/${projectId}/os/marketplace`, { params }).then((r) => r.data),

  installMarketplacePackage: (
    projectId: string,
    packageId: string,
  ): Promise<{ installed: boolean; project_id: string; package: MarketplaceSkillPackage }> =>
    api
      .post(`/v1/projects/${projectId}/os/marketplace/install`, { package_id: packageId })
      .then((r) => r.data),

  getPolicy: (projectId: string): Promise<TenantGovernancePolicy> =>
    api.get(`/v1/projects/${projectId}/os/policy`).then((r) => r.data),

  updatePolicy: (
    projectId: string,
    payload: Partial<
      Pick<
        TenantGovernancePolicy,
        | "max_run_budget_usd"
        | "require_approval_for_delivery"
        | "allow_external_mcp_servers"
        | "allow_local_llm_routing"
        | "blocked_skill_permissions"
      >
    >,
  ): Promise<TenantGovernancePolicy> =>
    api.put(`/v1/projects/${projectId}/os/policy`, payload).then((r) => r.data),
};

/**
 * Subscribe to the server-authoritative AG-UI SSE stream using fetch + ReadableStream
 * so Authorization Bearer headers & Last-Event-ID replay work cleanly across origins.
 */
export function subscribeAguiStream(
  projectId: string,
  runId: string,
  onEvent: (event: AGUIEvent) => void,
  options?: { afterEventId?: number; onError?: () => void },
): () => void {
  const controller = new AbortController();
  const baseUrl = (api.defaults.baseURL || "http://localhost:8000").replace(/\/$/, "");
  let lastId = options?.afterEventId ?? 0;

  const connect = async () => {
    try {
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };
      if (lastId > 0) {
        headers["Last-Event-ID"] = String(lastId);
      }
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("forge_access_token");
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      }
      const url = `${baseUrl}/v1/projects/${encodeURIComponent(projectId)}/protocols/agui/runs/${encodeURIComponent(runId)}/stream?after_event_id=${lastId}`;
      const resp = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        options?.onError?.();
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const dataLine = frame
            .split("\n")
            .find((ln) => ln.startsWith("data:"));
          if (!dataLine) continue;
          try {
            const parsed = JSON.parse(dataLine.slice(5).trim()) as AGUIEvent;
            if (parsed.agui_type === "HEARTBEAT") continue;
            if (typeof parsed.event_id === "number") {
              if (parsed.event_id <= lastId) continue;
              lastId = parsed.event_id;
            }
            onEvent(parsed);
          } catch {
            // Skip malformed SSE frames defensively
          }
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        options?.onError?.();
      }
    }
  };

  void connect();
  return () => {
    controller.abort();
  };
}

/**
 * Subscribe to the AI SDK UI Stream Protocol v1 SSE endpoint
 * (`x-vercel-ai-ui-message-stream: v1`) backed by AGUIStreamBroker.
 */
export function subscribeAiSdkUiStream(
  projectId: string,
  runId: string,
  onChunk: (chunk: AiSdkStreamChunk) => void,
  options?: { afterEventId?: number; onDone?: () => void; onError?: () => void },
): () => void {
  const controller = new AbortController();
  const baseUrl = (api.defaults.baseURL || "http://localhost:8000").replace(/\/$/, "");
  const startId = options?.afterEventId ?? 0;

  const connect = async () => {
    try {
      const headers: Record<string, string> = {
        Accept: "text/event-stream",
      };
      if (startId > 0) {
        headers["Last-Event-ID"] = String(startId);
      }
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("forge_access_token");
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      }
      const url = `${baseUrl}/v1/projects/${encodeURIComponent(projectId)}/protocols/ai-sdk/runs/${encodeURIComponent(runId)}/stream?after_event_id=${startId}`;
      const resp = await fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        options?.onError?.();
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const dataLine = frame
            .split("\n")
            .find((ln) => ln.startsWith("data:"));
          if (!dataLine) continue;
          const payloadStr = dataLine.slice(5).trim();
          if (payloadStr === "[DONE]") {
            options?.onDone?.();
            return;
          }
          try {
            const parsed = JSON.parse(payloadStr) as AiSdkStreamChunk;
            onChunk(parsed);
          } catch {
            // Skip malformed frames defensively
          }
        }
      }
    } catch {
      if (!controller.signal.aborted) {
        options?.onError?.();
      }
    }
  };

  void connect();
  return () => {
    controller.abort();
  };
}

export const LOCAL_SKILLS_CATALOG: SkillManifest[] = [
  {
    name: "fullstack-architecture",
    domain: "software_engineering",
    description: "API contract design, modular service decomposition, and clean TypeScript/Python interfaces.",
    version: "1.0.0",
    keywords: ["api", "fastapi", "endpoint", "contract", "backend", "frontend", "react", "architecture"],
    dependencies: [],
    required_permissions: ["read_repo"],
    allowed_departments: ["architecture", "engineering", "leadership"],
    origin: "builtin",
  },
  {
    name: "api-hardening",
    domain: "software_engineering",
    description: "Input validation, bounded pagination, structured error responses, and backward-compatible routing.",
    version: "1.0.0",
    keywords: ["api", "endpoint", "fastapi", "validation", "backend"],
    dependencies: ["fullstack-architecture"],
    required_permissions: ["read_repo", "write_code"],
    allowed_departments: ["engineering", "architecture", "security"],
    origin: "builtin",
  },
  {
    name: "rag-context-engineering",
    domain: "ai_engineering",
    description: "Hybrid retrieval, chunking, embedding pipelines, prompt structuring, and citation grounding.",
    version: "1.0.0",
    keywords: ["rag", "embedding", "retrieval", "llm", "context", "ai"],
    dependencies: [],
    required_permissions: ["read_repo"],
    allowed_departments: ["engineering", "architecture", "leadership"],
    origin: "builtin",
  },
  {
    name: "multi-agent-orchestration",
    domain: "agent_engineering",
    description: "DAG wave scheduling, shared blackboard artifacts, bounded delegation, and self-healing critique loops.",
    version: "1.0.0",
    keywords: ["agent", "multi-agent", "dag", "workflow", "orchestrate"],
    dependencies: [],
    required_permissions: ["read_blackboard"],
    allowed_departments: ["leadership", "architecture", "engineering"],
    origin: "builtin",
  },
  {
    name: "container-k8s-delivery",
    domain: "devops",
    description: "Dockerfiles, Kubernetes manifests, CI/CD pipelines, health probes, and rollback runbooks.",
    version: "1.0.0",
    keywords: ["docker", "kubernetes", "deploy", "release", "rollout", "observability"],
    dependencies: [],
    required_permissions: ["read_repo"],
    allowed_departments: ["infrastructure", "delivery", "architecture"],
    origin: "builtin",
  },
  {
    name: "security-threat-audit",
    domain: "security",
    description: "OWASP verification, auth/RBAC boundary checks, SSRF/path-traversal defense, and secrets hygiene.",
    version: "1.0.0",
    keywords: ["security", "auth", "rbac", "audit", "compliance", "gdpr"],
    dependencies: [],
    required_permissions: ["read_repo", "emit_findings"],
    allowed_departments: ["security", "architecture", "leadership"],
    origin: "builtin",
  },
  {
    name: "automated-qa-verification",
    domain: "quality_engineering",
    description: "Unit, integration, and E2E test authoring with regression coverage and deterministic assertions.",
    version: "1.0.0",
    keywords: ["test", "pytest", "vitest", "playwright", "e2e", "qa", "verify"],
    dependencies: [],
    required_permissions: ["read_repo", "run_tests"],
    allowed_departments: ["quality", "engineering"],
    origin: "builtin",
  },
  {
    name: "prd-product-strategy",
    domain: "product_business",
    description: "PRD authorship, unit economics, pricing models, ICP validation, and measurable KPI definitions.",
    version: "1.0.0",
    keywords: ["prd", "pricing", "business", "roadmap", "requirement"],
    dependencies: [],
    required_permissions: ["read_repo"],
    allowed_departments: ["business", "leadership"],
    origin: "builtin",
  },
  {
    name: "database-schema-modeling",
    domain: "data_engineering",
    description: "Schema design, composite indexing, safe non-destructive migrations, and query performance.",
    version: "1.0.0",
    keywords: ["database", "mongo", "postgres", "sql", "schema", "migration", "billing"],
    dependencies: [],
    required_permissions: ["read_repo"],
    allowed_departments: ["engineering", "architecture"],
    origin: "builtin",
  },
  {
    name: "design-system",
    domain: "design_tools",
    description: "Token architecture, component specifications, WCAG AA contrast, and responsive layouts (.agents/skills).",
    version: "1.0.0",
    keywords: ["ui", "ux", "design", "token", "component", "dashboard", "tailwind"],
    dependencies: [],
    required_permissions: ["read_repo"],
    allowed_departments: ["design", "engineering"],
    origin: "filesystem",
  },
];

export const LOCAL_MCP_TOOLS: MCPToolSpec[] = [
  {
    name: "blackboard.query",
    server_id: "forge-workspace-mcp",
    description: "Inspect published Shared Blackboard artifacts for an active project kernel run.",
    allowed_departments: [
      "leadership",
      "business",
      "architecture",
      "design",
      "engineering",
      "infrastructure",
      "security",
      "quality",
      "delivery",
    ],
    read_only: true,
  },
  {
    name: "skills.route",
    server_id: "forge-workspace-mcp",
    description: "Resolve relevant SKILL.md capabilities and permissions for an agent role.",
    allowed_departments: [
      "leadership",
      "business",
      "architecture",
      "design",
      "engineering",
      "infrastructure",
      "security",
      "quality",
      "delivery",
    ],
    read_only: true,
  },
  {
    name: "security.static_scan",
    server_id: "forge-workspace-mcp",
    description: "Run static security hygiene checks for hardcoded secrets, unsafe HTML sinks, or shell execution.",
    allowed_departments: ["security", "quality", "engineering", "architecture"],
    read_only: true,
  },
];

export const LOCAL_MCP_APPS: MCPAppSpec[] = [
  {
    app_id: "app_security_hygiene",
    title: "Security Hygiene Inspector",
    tool_name: "security.static_scan",
    server_id: "forge-workspace-mcp",
    description:
      "Interactive static scanner checking code snippets for hardcoded credentials, unsafe HTML sinks, and shell injection.",
    protocol: "mcp-apps/v1",
    ui_schema: {
      input_field: "code",
      input_label: "Code Snippet",
      action_label: "Run Static Scan",
      result_view: "findings_list",
    },
  },
  {
    app_id: "app_skill_router",
    title: "Skill Router Workbench",
    tool_name: "skills.route",
    server_id: "forge-workspace-mcp",
    description:
      "Inspect live 9-domain SKILL.md activation scores, transitive dependencies, and permission boundaries for any role.",
    protocol: "mcp-apps/v1",
    ui_schema: {
      input_field: "objective",
      input_label: "Engineering Objective",
      action_label: "Route Skills",
      result_view: "skill_table",
    },
  },
  {
    app_id: "app_blackboard_explorer",
    title: "Shared Blackboard Explorer",
    tool_name: "blackboard.query",
    server_id: "forge-workspace-mcp",
    description:
      "Query versioned cross-agent artifacts published by active multi-agent DAG runs within this project.",
    protocol: "mcp-apps/v1",
    ui_schema: {
      input_field: "run_id",
      input_label: "Kernel Run ID",
      action_label: "Query Blackboard",
      result_view: "artifact_feed",
    },
  },
];

export function buildLocalA2AAgentCard(projectId: string): A2AAgentCard {
  return {
    name: "Forge AI Autonomous Engineering OS",
    description:
      "9-department multi-agent software engineering operating system with DAG wave scheduling, Shared Blackboard, critique-repair loops, governed MCP tools, and isolated verification worktrees.",
    version: "2.0.0",
    protocol: "a2a/0.2",
    url: `/v1/projects/${projectId}/protocols/a2a/tasks/send`,
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
      humanInTheLoopApproval: true,
      isolatedWorktrees: true,
    },
    protocols_supported: [
      "a2a/0.2",
      "ag-ui/v1",
      "ai-sdk-ui-stream/v1",
      "mcp/2025-03-26",
      "mcp-apps/v1",
      "a2ui/v1",
    ],
    authentication: { schemes: ["Bearer"], projectScoped: true },
    departments: [
      "leadership",
      "business",
      "architecture",
      "design",
      "engineering",
      "infrastructure",
      "security",
      "quality",
      "delivery",
    ],
    skills: LOCAL_SKILLS_CATALOG.map((s) => ({
      id: s.name,
      name: s.name.replace(/-/g, " "),
      domain: s.domain,
      description: s.description,
      tags: s.keywords.slice(0, 5),
    })),
  };
}

export const LOCAL_MARKETPLACE_PACKAGES: MarketplaceSkillPackage[] = [
  {
    package_id: "pkg_otel_observability",
    name: "otel-distributed-tracing",
    title: "OpenTelemetry Distributed Tracing & SLOs",
    domain: "devops",
    version: "1.2.0",
    author: "Forge Platform Team",
    description:
      "Instruments FastAPI, async workers, and multi-agent pipelines with W3C Trace Context spans and latency SLO alerts.",
    keywords: ["opentelemetry", "otel", "tracing", "span", "slo", "observability"],
    required_permissions: ["read_repo"],
    allowed_departments: ["infrastructure", "engineering", "architecture"],
    instructions:
      "Propagate W3C traceparent headers, avoid logging secrets in span attributes, and track p95 latency per wave.",
    verified: true,
    installs: 412,
    rating: 4.9,
    installed: false,
  },
  {
    package_id: "pkg_soc2_compliance",
    name: "soc2-audit-controls",
    title: "SOC 2 Type II Security & Audit Controls",
    domain: "security",
    version: "1.1.0",
    author: "Forge Security Guild",
    description:
      "Verifies immutable audit trails, least-privilege RBAC, tenant isolation boundaries, and secrets rotation readiness.",
    keywords: ["soc2", "compliance", "audit", "rbac", "tenant", "governance"],
    required_permissions: ["read_repo", "emit_findings"],
    allowed_departments: ["security", "leadership", "architecture"],
    instructions:
      "Confirm every protected endpoint checks authentication and tenant ownership, and verify audit logs record actor and timestamp.",
    verified: true,
    installs: 328,
    rating: 4.9,
    installed: false,
  },
  {
    package_id: "pkg_playwright_visual",
    name: "playwright-visual-regression",
    title: "Playwright E2E & Accessibility Regression Pack",
    domain: "quality_engineering",
    version: "1.0.4",
    author: "Forge QA Engineering",
    description:
      "Authors deterministic Playwright journeys with WCAG AA contrast checks, keyboard navigation assertions, and zero-flake waits.",
    keywords: ["playwright", "e2e", "accessibility", "wcag", "regression", "qa"],
    required_permissions: ["read_repo", "run_tests"],
    allowed_departments: ["quality", "engineering", "design"],
    instructions:
      "Assert interactive roles via getByRole/getByLabel and verify keyboard accessibility on modals and tabs.",
    verified: true,
    installs: 275,
    rating: 4.8,
    installed: false,
  },
  {
    package_id: "pkg_finops_llm_cost",
    name: "llm-finops-optimization",
    title: "LLM FinOps & Hybrid Local/Cloud Routing",
    domain: "ai_engineering",
    version: "1.3.0",
    author: "Forge Applied AI Lab",
    description:
      "Optimizes multi-agent token budgets using tiered model routing, semantic caching, and Ollama/vLLM local offload.",
    keywords: ["finops", "cost", "budget", "ollama", "vllm", "routing", "tokens"],
    required_permissions: ["read_repo", "read_blackboard"],
    allowed_departments: ["engineering", "architecture", "leadership", "business"],
    instructions:
      "Route balanced and fast tasks to local inference when enabled and enforce hard per-run cost caps.",
    verified: true,
    installs: 519,
    rating: 5.0,
    installed: false,
  },
];

export function defaultTenantPolicy(projectId: string): TenantGovernancePolicy {
  return {
    project_id: projectId,
    max_run_budget_usd: 5.0,
    require_approval_for_delivery: false,
    allow_external_mcp_servers: true,
    allow_local_llm_routing: true,
    allowed_mcp_domains: [],
    blocked_skill_permissions: [
      "bypass_auth",
      "exec_arbitrary_shell",
      "exfiltrate_network",
      "raw_host_fs",
    ],
    updated_by: "system",
    updated_at: new Date().toISOString(),
  };
}

export const productLeadApi = {
  why: (projectId: string, question: string): Promise<ProductLeadAnswer> =>
    api
      .get(`/v1/product-lead/projects/${projectId}/why`, { params: { question } })
      .then((r) => r.data),

  whatChanged: (projectId: string): Promise<ProductLeadAnswer> =>
    api
      .get(`/v1/product-lead/projects/${projectId}/what-changed`)
      .then((r) => r.data),

  whatNext: (projectId: string): Promise<ProductLeadAnswer> =>
    api
      .get(`/v1/product-lead/projects/${projectId}/what-next`)
      .then((r) => r.data),
};

// Mirror of backend/core/agent_kernel.py's 9-department blueprint for offline/preview mode.
export const LOCAL_ORG_BLUEPRINT: OrgBlueprint = {
  department_count: 9,
  role_count: 24,
  default_delegation_policy: {
    max_delegations_per_run: 12,
    max_depth: 2,
    timeout_seconds: 30,
    allowed_department_route_count: 42,
  },
  departments: [
    {
      key: "leadership",
      name: "Leadership",
      stage_tier: 0,
      roles: [
        {
          role: "product_lead",
          display_name: "Product Lead",
          backend_agent_key: "pm",
          capabilities: ["decision-memory", "scope-governance", "goal-alignment"],
          keywords: ["roadmap", "vision", "decision", "stakeholder", "priority", "product lead"],
        },
        {
          role: "engineering_manager",
          display_name: "Engineering Manager",
          backend_agent_key: "scrum_master",
          capabilities: ["sprint-planning", "capacity-allocation", "risk-mitigation"],
          keywords: ["sprint", "milestone", "capacity", "coordination", "delivery plan"],
        },
        {
          role: "orchestrator",
          display_name: "Lead Orchestrator",
          backend_agent_key: "decision_engine",
          capabilities: ["dag-scheduling", "delegation", "gate-enforcement"],
          keywords: ["orchestrate", "workflow", "multi-agent", "pipeline", "delegate"],
        },
      ],
    },
    {
      key: "business",
      name: "Business",
      stage_tier: 0,
      roles: [
        {
          role: "business_strategist",
          display_name: "Business Strategist",
          backend_agent_key: "business_model",
          capabilities: ["monetization", "unit-economics", "gtm-strategy"],
          keywords: ["pricing", "monetiz", "revenue", "business model", "billing"],
        },
        {
          role: "product_manager",
          display_name: "Product Manager",
          backend_agent_key: "prd_writer",
          capabilities: ["prd-authoring", "backlog-decomposition", "kpi-definition"],
          keywords: ["prd", "requirement", "user story", "epic", "spec"],
        },
        {
          role: "market_researcher",
          display_name: "Market Researcher",
          backend_agent_key: "research",
          capabilities: ["competitive-analysis", "market-sizing", "icp-validation"],
          keywords: ["market", "competitor", "benchmark", "research"],
        },
      ],
    },
    {
      key: "architecture",
      name: "Architecture",
      stage_tier: 1,
      roles: [
        {
          role: "solution_architect",
          display_name: "Solution Architect",
          backend_agent_key: "architect",
          capabilities: ["api-contracts", "integration-architecture", "adr-authoring"],
          keywords: ["architecture", "integration", "protocol", "gateway", "contract"],
        },
        {
          role: "system_architect",
          display_name: "System Architect",
          backend_agent_key: "architect",
          capabilities: ["distributed-systems", "fault-tolerance", "data-flow"],
          keywords: ["scalab", "distributed", "system design", "event-driven", "queue"],
        },
      ],
    },
    {
      key: "design",
      name: "Design",
      stage_tier: 1,
      roles: [
        {
          role: "ui_designer",
          display_name: "UI Designer",
          backend_agent_key: "designer",
          capabilities: ["design-tokens", "component-specs", "visual-hierarchy"],
          keywords: ["ui", "design system", "component", "layout", "theme", "token"],
        },
        {
          role: "ux_researcher",
          display_name: "UX Researcher",
          backend_agent_key: "designer",
          capabilities: ["user-flows", "accessibility-audit", "interaction-design"],
          keywords: ["ux", "usability", "onboarding", "accessibility", "a11y", "wcag"],
        },
      ],
    },
    {
      key: "engineering",
      name: "Engineering",
      stage_tier: 2,
      roles: [
        {
          role: "frontend_engineer",
          display_name: "Frontend Engineer",
          backend_agent_key: "developer",
          capabilities: ["react-typescript", "state-management", "client-sockets"],
          keywords: ["frontend", "react", "typescript", "dashboard", "page", "tailwind"],
        },
        {
          role: "backend_engineer",
          display_name: "Backend Engineer",
          backend_agent_key: "developer",
          capabilities: ["fastapi-rest", "async-workers", "domain-logic"],
          keywords: ["backend", "api", "fastapi", "endpoint", "service", "websocket", "worker"],
        },
        {
          role: "database_engineer",
          display_name: "Database Engineer",
          backend_agent_key: "developer",
          capabilities: ["schema-design", "indexing", "migrations"],
          keywords: ["database", "mongo", "postgres", "sql", "schema", "migration", "index"],
        },
        {
          role: "ai_engineer",
          display_name: "AI Engineer",
          backend_agent_key: "developer",
          capabilities: ["llm-orchestration", "context-engineering", "rag-pipelines"],
          keywords: ["llm", "rag", "embedding", "prompt", "agent", "model router", "context"],
        },
      ],
    },
    {
      key: "infrastructure",
      name: "Infrastructure",
      stage_tier: 2,
      roles: [
        {
          role: "devops_engineer",
          display_name: "DevOps Engineer",
          backend_agent_key: "devops",
          capabilities: ["ci-cd", "containers", "release-automation"],
          keywords: ["docker", "ci/cd", "github actions", "container", "deploy", "pipeline"],
        },
        {
          role: "cloud_engineer",
          display_name: "Cloud Engineer",
          backend_agent_key: "devops",
          capabilities: ["kubernetes", "cloud-infra", "network-policies"],
          keywords: ["kubernetes", "k8s", "cloud", "terraform", "ingress", "gpu"],
        },
        {
          role: "reliability_engineer",
          display_name: "Reliability Engineer",
          backend_agent_key: "devops",
          capabilities: ["observability", "disaster-recovery", "circuit-breakers"],
          keywords: ["observability", "prometheus", "latency", "slo", "monitoring", "backup"],
        },
      ],
    },
    {
      key: "security",
      name: "Security",
      stage_tier: 3,
      roles: [
        {
          role: "security_engineer",
          display_name: "Security Engineer",
          backend_agent_key: "security",
          capabilities: ["auth-hardening", "input-validation", "secrets-hygiene"],
          keywords: ["security", "auth", "oauth", "jwt", "csrf", "xss", "rbac", "encrypt"],
        },
        {
          role: "security_auditor",
          display_name: "Security Auditor",
          backend_agent_key: "security",
          capabilities: ["threat-modeling", "compliance-audit", "adversarial-review"],
          keywords: ["audit", "threat model", "compliance", "gdpr", "vulnerability"],
        },
      ],
    },
    {
      key: "quality",
      name: "Quality",
      stage_tier: 3,
      roles: [
        {
          role: "qa_engineer",
          display_name: "QA Engineer",
          backend_agent_key: "qa",
          capabilities: ["unit-testing", "integration-testing", "e2e-automation"],
          keywords: ["test", "pytest", "vitest", "playwright", "e2e", "regression", "coverage"],
        },
        {
          role: "code_reviewer",
          display_name: "Code Reviewer",
          backend_agent_key: "qa",
          capabilities: ["diff-review", "contract-verification", "static-analysis"],
          keywords: ["review", "refactor", "lint", "type-check"],
        },
        {
          role: "independent_reviewer",
          display_name: "Independent Reviewer",
          backend_agent_key: "qa",
          capabilities: ["adversarial-verification", "evidence-validation", "gate-signoff"],
          keywords: ["verify", "adversarial", "gate", "sign-off", "independent"],
        },
      ],
    },
    {
      key: "delivery",
      name: "Delivery",
      stage_tier: 4,
      roles: [
        {
          role: "release_manager",
          display_name: "Release Manager",
          backend_agent_key: "devops",
          capabilities: ["release-coordination", "rollback-verification", "canary-rollout"],
          keywords: ["release", "rollout", "staging", "production", "rollback"],
        },
        {
          role: "documentation_agent",
          display_name: "Documentation Agent",
          backend_agent_key: "prd_writer",
          capabilities: ["technical-docs", "runbooks", "api-specs"],
          keywords: ["docs", "documentation", "readme", "runbook", "api reference"],
        },
      ],
    },
  ],
};

export function planObjectiveLocally(
  projectId: string,
  objective: string,
  options: {
    maxAgents?: number;
    includeGovernanceGates?: boolean;
    maxConcurrency?: number;
    maxDelegations?: number;
    failFast?: boolean;
    maxRepairRounds?: number;
    requireDeliveryApproval?: boolean;
    maxBudgetUsd?: number;
    isolateWorktrees?: boolean;
    preferLocalLlm?: boolean;
  } = {},
): KernelRun {
  const maxAgents = options.maxAgents ?? 8;
  const includeGates = options.includeGovernanceGates ?? true;
  const maxConcurrency = options.maxConcurrency ?? 4;
  const maxDelegations = options.maxDelegations ?? 12;
  const failFast = options.failFast ?? false;
  const maxRepairRounds = options.maxRepairRounds ?? 2;
  const requireDeliveryApproval = options.requireDeliveryApproval ?? false;
  const maxBudgetUsd = options.maxBudgetUsd ?? 2.5;
  const isolateWorktrees = options.isolateWorktrees ?? true;
  const preferLocalLlm = options.preferLocalLlm ?? false;

  const text = objective.trim().toLowerCase();
  const flatRoles = LOCAL_ORG_BLUEPRINT.departments.flatMap((d) =>
    d.roles.map((r) => ({ ...r, department: d.key, stage_tier: d.stage_tier })),
  );

  const scored = flatRoles
    .map((spec) => ({
      spec,
      hits: (spec.keywords || []).filter((kw) => text.includes(kw)).length,
    }))
    .filter((item) => item.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.spec.stage_tier - b.spec.stage_tier);

  let selected = scored.slice(0, maxAgents).map((s) => s.spec);

  if (selected.length === 0) {
    const defaults = [
      "product_lead",
      "solution_architect",
      "frontend_engineer",
      "backend_engineer",
      "qa_engineer",
    ];
    selected = flatRoles.filter((r) => defaults.includes(r.role));
  }

  if (includeGates) {
    const depts = new Set(selected.map((s) => s.department));
    if (depts.has("engineering") && !depts.has("architecture") && selected.length < maxAgents) {
      const arch = flatRoles.find((r) => r.role === "solution_architect");
      if (arch) selected.push(arch);
    }
    if (
      (depts.has("engineering") || depts.has("infrastructure")) &&
      !depts.has("quality") &&
      selected.length < maxAgents
    ) {
      const qa = flatRoles.find((r) => r.role === "qa_engineer");
      if (qa) selected.push(qa);
    }
  }

  selected.sort((a, b) => a.stage_tier - b.stage_tier || a.role.localeCompare(b.role));

  const tierMap = new Map<number, string[]>();
  const tasks: KernelTask[] = selected.map((spec, idx) => {
    const id = `ktask_${idx + 1}_${spec.role}`;
    const list = tierMap.get(spec.stage_tier) || [];
    list.push(id);
    tierMap.set(spec.stage_tier, list);
    return {
      id,
      title: `${spec.display_name}: ${spec.department.charAt(0).toUpperCase() + spec.department.slice(1)}`,
      role: spec.role,
      department: spec.department,
      description: `[${spec.display_name}] Execute scope for: ${objective}`,
      depends_on: [],
      wave_index: 0,
      status: "pending",
      attempts: 0,
      duration_ms: 0,
    };
  });

  const tiers = Array.from(tierMap.keys()).sort((a, b) => a - b);
  const waves: string[][] = tiers.map((tier, waveIdx) => {
    const ids = tierMap.get(tier) || [];
    const upstream = waveIdx > 0 ? tierMap.get(tiers[waveIdx - 1]) || [] : [];
    for (const t of tasks) {
      if (ids.includes(t.id)) {
        t.wave_index = waveIdx;
        t.depends_on = [...upstream];
      }
    }
    return ids;
  });

  const deptsTouched = Array.from(new Set(tasks.map((t) => t.department))).sort();
  const riskLevel =
    deptsTouched.length >= 4 || deptsTouched.includes("security")
      ? "high"
      : deptsTouched.length >= 2
        ? "medium"
        : "low";

  return {
    id: `krun_${Math.random().toString(36).slice(2, 10)}`,
    project_id: projectId,
    objective,
    status: "planned",
    tasks,
    waves,
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
    config: {
      max_concurrency: maxConcurrency,
      task_timeout_seconds: 60,
      max_retries: 1,
      fail_fast: failFast,
      max_repair_rounds: maxRepairRounds,
      require_delivery_approval: requireDeliveryApproval,
      max_budget_usd: maxBudgetUsd,
      isolate_worktrees: isolateWorktrees,
      prefer_local_llm: preferLocalLlm,
      delegation_policy: {
        max_delegations_per_run: maxDelegations,
        max_depth: 2,
        timeout_seconds: 30,
        allowed_department_route_count: 42,
      },
    },
    risk_level: riskLevel,
    risk_notes: `Spans ${deptsTouched.length} department(s) (${deptsTouched.join(", ")}) across ${waves.length} parallel execution wave(s).`,
    created_at: new Date().toISOString(),
    duration_ms: 0,
    metrics: {
      total_tasks: tasks.length,
      wave_count: waves.length,
      max_parallelism: Math.max(...waves.map((w) => w.length), 0),
      completed_tasks: 0,
      failed_tasks: 0,
      blocked_tasks: 0,
      delegation_count: 0,
      artifact_count: 0,
      conflict_count: 0,
      repair_cycle_count: 0,
      skill_activation_count: 0,
      worktree_count: 0,
      reconciliation_count: 0,
      avg_quality_score: 0,
      total_cost_usd: 0,
      budget_remaining_usd: maxBudgetUsd,
      pending_gates: 0,
    },
  };
}
