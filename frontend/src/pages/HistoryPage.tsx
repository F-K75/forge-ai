import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Clock,
  GitCommit,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Bot,
  Search,
  Copy,
  Check,
  Download,
  Terminal,
  FileCode,
  Layers,
  ShieldCheck,
  Activity,
  RefreshCw,
  X,
  Send,
  Eye,
  LayoutList,
  ExternalLink,
  Table as TableIcon
} from "lucide-react";
import toast from "react-hot-toast";
import BrandLogo from "../components/BrandLogo";
import { AGENTS } from "../lib/agents";

export interface HistoryItem {
  id: string;
  title: string;
  agent: string;
  agentId: "developer" | "architect" | "designer" | "integration" | "pm" | "business_improver";
  model: string;
  provider: string;
  time: string;
  timestamp: string;
  duration: string;
  durationSec: number;
  status: "success" | "running" | "failed";
  commit: string;
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  prompt: string;
  project: string;
  traceSteps: {
    title: string;
    duration: string;
    status: "done" | "active" | "pending";
    details: string;
  }[];
  filesList: { path: string; added: number; deleted: number }[];
  logs: string[];
}

const INITIAL_HISTORY_ITEMS: HistoryItem[] = [
  {
    id: "run-984",
    title: "Orchestrate auth flow with PKCE & session refresh",
    agent: "Developer",
    agentId: "developer",
    model: "gemini-2.5-flash",
    provider: "Google",
    time: "8m ago",
    timestamp: "2026-09-09 03:00:12",
    duration: "12.4s",
    durationSec: 12.4,
    status: "success",
    commit: "7e92ab4",
    filesChanged: 4,
    linesAdded: 142,
    linesDeleted: 18,
    prompt: "Add OAuth session handler with PKCE flow, cookie storage, and automated token refresh interceptor",
    project: "forge-core",
    traceSteps: [
      { title: "Indexed workspace dependencies", duration: "1.2s", status: "done", details: "Checked @google/genai, axios, and hono routes" },
      { title: "Implemented PKCE verifier generation", duration: "4.1s", status: "done", details: "Added crypto.subtle SHA-256 code challenge computation" },
      { title: "Updated session middleware interceptors", duration: "3.8s", status: "done", details: "Patched api.interceptors for token refresh backoff" },
      { title: "Executed unit & regression test suite", duration: "3.3s", status: "done", details: "12 test assertions verified with 100% pass rate" }
    ],
    filesList: [
      { path: "frontend/src/lib/api.ts", added: 64, deleted: 8 },
      { path: "frontend/src/pages/GoogleCallback.tsx", added: 48, deleted: 2 },
      { path: "backend/api/auth.py", added: 22, deleted: 6 },
      { path: "backend/core/security.py", added: 8, deleted: 2 }
    ],
    logs: [
      "[INFO] Starting autonomous build pipeline: run-984",
      "[AGENT:DEVELOPER] Initializing gemini-2.5-flash inference stream",
      "[DIFF] Generated patch for api.ts (+64 / -8)",
      "[TEST] Running vitest for auth interceptors... PASSED (4/4)",
      "[GIT] Committed tree 7e92ab4: 'Orchestrate auth flow with PKCE & session refresh'",
      "[SUCCESS] Pipeline finished in 12.4s. 0 regressions detected."
    ]
  },
  {
    id: "run-983",
    title: "System architecture review & multi-tenant schema audit",
    agent: "Architect",
    agentId: "architect",
    model: "claude-3-7-sonnet",
    provider: "Anthropic",
    time: "32m ago",
    timestamp: "2026-09-09 02:35:45",
    duration: "18.6s",
    durationSec: 18.6,
    status: "success",
    commit: "c310f82",
    filesChanged: 2,
    linesAdded: 86,
    linesDeleted: 4,
    prompt: "Verify data model isolation, multi-tenant schema constraints, and foreign key cascades",
    project: "forge-core",
    traceSteps: [
      { title: "Extracted database AST schema", duration: "2.5s", status: "done", details: "Parsed core/models.py and migrations tables" },
      { title: "Evaluated tenant isolation invariants", duration: "8.2s", status: "done", details: "Identified missing organization_id filter in audit_log index" },
      { title: "Applied compound index migration", duration: "4.7s", status: "done", details: "Generated migration script 0024_tenant_index.sql" },
      { title: "Static security verification", duration: "3.2s", status: "done", details: "Passed zero leaked tenant ID checks" }
    ],
    filesList: [
      { path: "backend/core/models.py", added: 34, deleted: 2 },
      { path: "backend/migrations/0024_tenant_index.sql", added: 52, deleted: 2 }
    ],
    logs: [
      "[INFO] Starting autonomous architecture validation: run-983",
      "[AGENT:ARCHITECT] Loading claude-3-7-sonnet deep reasoning context",
      "[ANALYSIS] Validated 14 database models against tenant isolation rulebook",
      "[MIGRATION] Generated 0024_tenant_index.sql",
      "[SUCCESS] Committed c310f82 with clean schema invariants."
    ]
  },
  {
    id: "run-982",
    title: "End-to-end checkout & billing resilience suite",
    agent: "Integration",
    agentId: "integration",
    model: "gemini-2.5-flash",
    provider: "Google",
    time: "1h 15m ago",
    timestamp: "2026-09-09 01:52:10",
    duration: "15.1s",
    durationSec: 15.1,
    status: "success",
    commit: "14a09e1",
    filesChanged: 5,
    linesAdded: 198,
    linesDeleted: 32,
    prompt: "Run end-to-end integration tests on billing and checkout endpoints with mock webhook retry events",
    project: "forge-core",
    traceSteps: [
      { title: "Mocked Stripe webhook payload dispatch", duration: "3.1s", status: "done", details: "Synthesized invoice.payment_succeeded and checkout.session.completed" },
      { title: "Tested idempotency key handling", duration: "5.4s", status: "done", details: "Verified duplicate webhook replay drops second charge" },
      { title: "Validated user quota allocation", duration: "4.2s", status: "done", details: "Credits increased from 100 to 500 instantaneously" },
      { title: "Teardown test database sandbox", duration: "2.4s", status: "done", details: "Isolated test session cleaned without artifacts" }
    ],
    filesList: [
      { path: "backend/tests/test_billing_e2e.py", added: 120, deleted: 15 },
      { path: "backend/api/billing.py", added: 42, deleted: 12 },
      { path: "frontend/src/pages/BillingPage.tsx", added: 36, deleted: 5 }
    ],
    logs: [
      "[INFO] Test runner initiated: run-982",
      "[AGENT:INTEGRATION] Simulating Stripe gateway webhook roundtrip",
      "[ASSERT] Idempotency test: duplicate webhook rejected with HTTP 200 {status: 'duplicate'}",
      "[ASSERT] Credit quota credited: +400 credits confirmed",
      "[GIT] Committed tree 14a09e1: 'End-to-end checkout & billing resilience suite'"
    ]
  },
  {
    id: "run-981",
    title: "Database compound index optimization for query latency",
    agent: "Developer",
    agentId: "developer",
    model: "claude-3-5-sonnet",
    provider: "Anthropic",
    time: "3h ago",
    timestamp: "2026-09-08 23:58:30",
    duration: "8.7s",
    durationSec: 8.7,
    status: "success",
    commit: "55bc812",
    filesChanged: 2,
    linesAdded: 45,
    linesDeleted: 12,
    prompt: "Add compound index on project_id and created_at for sub-10ms activity feed queries",
    project: "forge-core",
    traceSteps: [
      { title: "Profiled activity feed query execution", duration: "1.8s", status: "done", details: "Observed table scan taking 78ms on 250k rows" },
      { title: "Synthesized B-tree index declaration", duration: "2.6s", status: "done", details: "Created index idx_activity_project_created on projects(id, created_at DESC)" },
      { title: "Ran EXPLAIN ANALYZE benchmark", duration: "2.4s", status: "done", details: "Query execution dropped from 78ms to 4.2ms (18x speedup)" },
      { title: "Committed migration file", duration: "1.9s", status: "done", details: "Committed to git repository" }
    ],
    filesList: [
      { path: "backend/core/database.py", added: 28, deleted: 6 },
      { path: "backend/api/projects.py", added: 17, deleted: 6 }
    ],
    logs: [
      "[INFO] Database index optimizer initiated: run-981",
      "[BENCHMARK] Before: 78ms query duration",
      "[OPTIMIZE] Index applied: idx_activity_project_created",
      "[BENCHMARK] After: 4.2ms query duration (18.5x improvement)",
      "[GIT] Commit 55bc812 published to main branch"
    ]
  },
  {
    id: "run-980",
    title: "Design system token normalization & theme surface fixes",
    agent: "Designer",
    agentId: "designer",
    model: "gpt-4o",
    provider: "OpenAI",
    time: "5h ago",
    timestamp: "2026-09-08 22:15:00",
    duration: "14.8s",
    durationSec: 14.8,
    status: "success",
    commit: "991ad34",
    filesChanged: 6,
    linesAdded: 215,
    linesDeleted: 84,
    prompt: "Normalize high-contrast borders and elevated surfaces across dark mode and light mode dashboards",
    project: "forge-core",
    traceSteps: [
      { title: "Scanned color token collisions", duration: "3.2s", status: "done", details: "Detected low-contrast text on gray surfaces in dark mode" },
      { title: "Standardized hairline surface tokens", duration: "4.5s", status: "done", details: "Applied 1px border-border hairlines with single-elevation shadow-apple consistency" },
      { title: "Verified WCAG AA contrast ratio", duration: "4.1s", status: "done", details: "All text elements verified >4.5:1 against respective backgrounds" },
      { title: "Visual regression verification", duration: "3.0s", status: "done", details: "Generated snapshot diffs with 0 unintended shifts" }
    ],
    filesList: [
      { path: "frontend/src/index.css", added: 72, deleted: 34 },
      { path: "frontend/src/pages/LLMManagementPage.tsx", added: 65, deleted: 22 },
      { path: "frontend/src/pages/BillingPage.tsx", added: 78, deleted: 28 }
    ],
    logs: [
      "[INFO] Design token linter started: run-980",
      "[AGENT:DESIGNER] Auditing 18 pages for border-contrast fidelity",
      "[REFACTOR] Updated theme surfaces to Precision Studio token scale",
      "[A11Y] WCAG AA compliance: 100% across all pages",
      "[GIT] Commit 991ad34 verified"
    ]
  },
  {
    id: "run-979",
    title: "Initiatives roadmap prioritization and backlog triage",
    agent: "PM",
    agentId: "pm",
    model: "gemini-2.5-pro",
    provider: "Google",
    time: "9h ago",
    timestamp: "2026-09-08 18:30:12",
    duration: "9.2s",
    durationSec: 9.2,
    status: "success",
    commit: "33eb809",
    filesChanged: 3,
    linesAdded: 112,
    linesDeleted: 14,
    prompt: "Auto-cluster open user feature requests into Agile PM epics and estimate engineering credit sizing",
    project: "forge-core",
    traceSteps: [
      { title: "Fetched open initiatives and comments", duration: "1.8s", status: "done", details: "Parsed 14 open tickets and user feedback entries" },
      { title: "Categorized into 3 major engineering epics", duration: "3.4s", status: "done", details: "Grouped by Model Routing, Real-Time Editor, and Cloud Storage" },
      { title: "Assigned effort weights & credit caps", duration: "2.2s", status: "done", details: "Calculated cycle sizing for upcoming 2-week sprint" },
      { title: "Synced initiative roadmaps", duration: "1.8s", status: "done", details: "Persisted to Agile PM database" }
    ],
    filesList: [
      { path: "frontend/src/pages/pm/OverviewTab.tsx", added: 54, deleted: 8 },
      { path: "frontend/src/pages/pm/InitiativesListPage.tsx", added: 58, deleted: 6 }
    ],
    logs: [
      "[INFO] PM Roadmap planner running: run-979",
      "[AGENT:PM] Clustering initiatives with gemini-2.5-pro",
      "[EPIC] Generated Epic: 'Enterprise LLM Multi-Provider Routing' (25 credits)",
      "[EPIC] Generated Epic: 'Collaborative Workspace Flow' (40 credits)",
      "[SUCCESS] Backlog synchronized in commit 33eb809"
    ]
  }
];

export default function HistoryPage() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  // State
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>(INITIAL_HISTORY_ITEMS);
  const [filterStatus, setFilterStatus] = useState<"all" | "success" | "running" | "failed">("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Inspector Modal State
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<HistoryItem | null>(null);

  // New Run Drawer/Modal State
  const [newRunModalOpen, setNewRunModalOpen] = useState(false);
  const [newRunPrompt, setNewRunPrompt] = useState("");
  const [newRunAgent, setNewRunAgent] = useState<"developer" | "architect" | "designer" | "integration" | "pm">("developer");
  const [triggeringRun, setTriggeringRun] = useState(false);

  // Copy helper
  const [copiedCommit, setCopiedCommit] = useState<string | null>(null);
  const handleCopyCommit = (commit: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(commit);
    setCopiedCommit(commit);
    toast.success(`Copied commit ${commit} to clipboard`);
    setTimeout(() => setCopiedCommit(null), 2000);
  };

  // Re-run execution simulation
  const handleRerun = (item: HistoryItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const tId = toast.loading(`Queueing re-run of ${item.id}...`);
    setTimeout(() => {
      const newRunId = `run-${Math.floor(Math.random() * 800 + 1000)}`;
      const newRun: HistoryItem = {
        ...item,
        id: newRunId,
        time: "just now",
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        duration: "4.8s",
        durationSec: 4.8,
        status: "success",
        commit: Math.random().toString(36).substring(2, 9),
        traceSteps: item.traceSteps.map(s => ({ ...s, status: "done" }))
      };
      setHistoryItems([newRun, ...historyItems]);
      toast.success(`Completed execution ${newRunId} (${newRun.commit})`, { id: tId });
    }, 900);
  };

  // Trigger manual new run
  const handleCreateNewRun = () => {
    if (!newRunPrompt.trim()) return;
    setTriggeringRun(true);
    const tId = toast.loading("Synthesizing prompt with autonomous agent fleet...");
    setTimeout(() => {
      const agentMeta = AGENTS.find(a => a.id === newRunAgent);
      const newRunId = `run-${Math.floor(Math.random() * 800 + 1000)}`;
      const newRun: HistoryItem = {
        id: newRunId,
        title: newRunPrompt.slice(0, 50) + (newRunPrompt.length > 50 ? "..." : ""),
        agent: agentMeta?.label || "Developer",
        agentId: newRunAgent,
        model: "gemini-2.5-flash",
        provider: "Google",
        time: "just now",
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        duration: "11.6s",
        durationSec: 11.6,
        status: "success",
        commit: Math.random().toString(36).substring(2, 9),
        filesChanged: Math.floor(Math.random() * 4 + 1),
        linesAdded: Math.floor(Math.random() * 120 + 30),
        linesDeleted: Math.floor(Math.random() * 20 + 2),
        prompt: newRunPrompt,
        project: "forge-core",
        traceSteps: [
          { title: "AST Workspace Analysis", duration: "1.4s", status: "done", details: "Parsed imports and components" },
          { title: "Synthesized code patch", duration: "4.8s", status: "done", details: "Generated clean TypeScript delta" },
          { title: "Ran regression checks", duration: "3.2s", status: "done", details: "Zero build breaks detected" },
          { title: "Committed to git repository", duration: "2.2s", status: "done", details: "Automated snapshot recorded" }
        ],
        filesList: [
          { path: "frontend/src/pages/WorkspacePage.tsx", added: 42, deleted: 4 },
          { path: "frontend/src/lib/api.ts", added: 18, deleted: 2 }
        ],
        logs: [
          `[INFO] Starting autonomous build pipeline: ${newRunId}`,
          `[AGENT:${newRunAgent.toUpperCase()}] Model: gemini-2.5-flash`,
          `[INPUT] ${newRunPrompt}`,
          "[TEST] Static verification: 0 errors",
          `[SUCCESS] Pipeline completed in 11.6s`
        ]
      };
      setHistoryItems([newRun, ...historyItems]);
      setTriggeringRun(false);
      setNewRunModalOpen(false);
      setNewRunPrompt("");
      toast.success(`Autonomous run ${newRunId} committed successfully!`, { id: tId });
    }, 1200);
  };

  // Refresh
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success("Execution timeline synchronized with Git HEAD");
    }, 600);
  };

  // Export audit log
  const handleExportAudit = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(historyItems, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `forge-execution-history-${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success("Exported execution history audit log");
  };

  // Filtered timeline items
  const filteredItems = useMemo(() => {
    return historyItems.filter(item => {
      const matchStatus = filterStatus === "all" || item.status === filterStatus;
      const matchAgent = filterAgent === "all" || item.agentId === filterAgent || item.agent.toLowerCase() === filterAgent.toLowerCase();
      const matchSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.prompt.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.commit.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.model.toLowerCase().includes(searchQuery.toLowerCase());

      return matchStatus && matchAgent && matchSearch;
    });
  }, [historyItems, filterStatus, filterAgent, searchQuery]);

  // Aggregate Metrics
  const totalRuns = historyItems.length;
  const totalFiles = historyItems.reduce((sum, item) => sum + item.filesChanged, 0);
  const totalAdded = historyItems.reduce((sum, item) => sum + item.linesAdded, 0);
  const totalDeleted = historyItems.reduce((sum, item) => sum + item.linesDeleted, 0);
  const avgDuration = (
    historyItems.reduce((sum, item) => sum + item.durationSec, 0) / (historyItems.length || 1)
  ).toFixed(1);

  return (
    <motion.div
      className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 text-ink"
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {/* 1. Header Section */}
      <header className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <BrandLogo size="sm" />
              <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
                History &amp; Agent Runs
              </h1>
              <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ok">
                <ShieldCheck size={13} />
                Audit verified
              </span>
            </div>
            <p className="text-sm text-muted">
              Immutable execution timeline, code diffs, LLM reasoning traces, and commit snapshots.
            </p>
          </div>

          {/* Header Actions */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-pill border border-border bg-panel hover:bg-panel-alt text-xs font-medium text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
            >
              <RefreshCw
                size={13}
                className={isRefreshing ? "animate-spin text-accent" : "text-muted"}
              />
              <span>Sync</span>
            </button>

            <button
              type="button"
              onClick={handleExportAudit}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-pill border border-border bg-panel hover:bg-panel-alt text-xs font-medium text-ink transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
            >
              <Download size={13} className="text-muted" />
              <span>Export Audit</span>
            </button>

            <button
              type="button"
              onClick={() => setNewRunModalOpen(true)}
              className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-pill bg-ink hover:bg-ink/90 text-on-ink text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
            >
              <Play size={12} fill="currentColor" />
              <span>Trigger Run</span>
            </button>
          </div>
        </div>

        {/* 2. KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple space-y-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Activity size={14} className="text-accent" />
                Completed Runs
              </span>
              <span className="font-mono text-[11px] text-ok">100% pass</span>
            </div>
            <p className="font-mono text-2xl font-semibold text-ink tabular-nums">
              {totalRuns}
            </p>
            <p className="text-xs text-muted">Zero build breakages recorded</p>
          </div>

          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple space-y-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Clock size={14} className="text-accent" />
                Avg Turnaround
              </span>
              <span className="font-mono text-[11px] text-ok">Fast</span>
            </div>
            <p className="font-mono text-2xl font-semibold text-ink tabular-nums">
              {avgDuration}s
            </p>
            <p className="text-xs text-muted">Prompt to verified git commit</p>
          </div>

          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple space-y-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <FileCode size={14} className="text-accent" />
                Files Modified
              </span>
              <span className="font-mono text-[11px] text-muted tabular-nums">
                {totalFiles} total
              </span>
            </div>
            <p className="font-mono text-2xl font-semibold text-ink tabular-nums">
              {totalFiles}
            </p>
            <p className="text-xs text-muted">Across workspace branches</p>
          </div>

          <div className="rounded-xl border border-border bg-panel p-4 shadow-apple space-y-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <GitCommit size={14} className="text-accent" />
                Code Velocity
              </span>
              <span className="font-mono text-[11px] text-ok tabular-nums">+{totalAdded}</span>
            </div>
            <p className="font-mono text-2xl font-semibold tabular-nums">
              <span className="text-ok">+{totalAdded}</span>{" "}
              <span className="text-error text-lg">-{totalDeleted}</span>
            </p>
            <p className="text-xs text-muted tabular-nums">
              Net +{totalAdded - totalDeleted} lines added
            </p>
          </div>
        </div>
      </header>

      {/* 3. Filter and Search Bar */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by prompt, commit hash, or run ID..."
              className="w-full h-9 bg-panel text-xs text-ink placeholder:text-faint pl-9 pr-8 rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-ink cursor-pointer"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filters & View Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <div className="inline-flex items-center p-0.5 rounded-pill border border-border bg-panel">
              {(["all", "success", "failed"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterStatus(tab)}
                  className={`h-7 px-2.5 text-xs font-medium capitalize rounded-pill transition-colors cursor-pointer ${
                    filterStatus === tab
                      ? "bg-ink text-on-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Agent Filter */}
            <select
              aria-label="Filter by agent"
              value={filterAgent}
              onChange={(e) => setFilterAgent(e.target.value)}
              className="h-8 bg-panel text-xs font-medium text-ink px-3 rounded-pill border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
            >
              <option value="all">All Agents</option>
              {AGENTS.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                </option>
              ))}
            </select>

            {/* View Mode Switcher */}
            <div className="inline-flex items-center p-0.5 rounded-pill border border-border bg-panel">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                  viewMode === "cards"
                    ? "bg-ink text-on-ink"
                    : "text-muted hover:text-ink"
                }`}
                title="Timeline view"
                aria-label="Timeline view"
              >
                <LayoutList size={14} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`h-7 w-7 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                  viewMode === "table"
                    ? "bg-ink text-on-ink"
                    : "text-muted hover:text-ink"
                }`}
                title="Table view"
                aria-label="Table view"
              >
                <TableIcon size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* 4. Timeline Presentation */}
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-border bg-panel p-12 text-center shadow-apple space-y-3">
            <Clock size={28} className="mx-auto text-muted" />
            <h3 className="font-display text-base font-semibold text-ink">
              No execution runs match your filter
            </h3>
            <p className="text-xs text-muted max-w-sm mx-auto">
              Reset your search query or switch the status and agent filters to view recorded history.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setFilterStatus("all");
                setFilterAgent("all");
              }}
              className="h-8 px-4 rounded-pill bg-ink hover:bg-ink/90 text-xs font-medium text-on-ink transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : viewMode === "cards" ? (
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const agentMeta = AGENTS.find((a) => a.id === item.agentId);
              const AgentIcon = agentMeta?.icon || Bot;

              return (
                <div
                  key={item.id}
                  className="rounded-xl border border-border bg-panel p-4 sm:p-5 shadow-apple hover:border-accent/50 transition-colors duration-150 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left: Metadata, Title, Prompt & Diff Summary */}
                  <div className="space-y-2.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                      <span className="font-semibold text-ink">{item.id}</span>

                      <button
                        type="button"
                        onClick={(e) => handleCopyCommit(item.commit, e)}
                        className="inline-flex items-center gap-1 text-muted hover:text-accent transition-colors cursor-pointer"
                        title="Copy commit SHA"
                      >
                        <GitCommit size={12} />
                        <span>{item.commit}</span>
                        {copiedCommit === item.commit ? (
                          <Check size={11} className="text-ok" />
                        ) : (
                          <Copy size={11} className="opacity-60" />
                        )}
                      </button>

                      <span className="inline-flex items-center gap-1 text-accent font-sans font-medium">
                        <AgentIcon size={12} />
                        <span>{item.agent}</span>
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 font-sans font-medium capitalize ${
                          item.status === "success" ? "text-ok" : "text-error"
                        }`}
                      >
                        {item.status === "success" ? (
                          <CheckCircle2 size={12} />
                        ) : (
                          <AlertCircle size={12} />
                        )}
                        {item.status}
                      </span>

                      <span className="text-muted">{item.duration}</span>
                      <span className="text-faint hidden sm:inline">{item.model}</span>
                    </div>

                    <h3 className="font-display text-base font-semibold text-ink">
                      {item.title}
                    </h3>

                    <p className="text-xs font-mono text-muted line-clamp-2 bg-panel-alt px-3 py-2 rounded-lg border border-border">
                      {item.prompt}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-muted tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <FileCode size={12} />
                        <span>{item.filesChanged} files modified</span>
                      </span>
                      <span className="text-ok font-medium">+{item.linesAdded}</span>
                      <span className="text-error font-medium">-{item.linesDeleted}</span>
                      <span>·</span>
                      <span className="font-sans">
                        Project: <strong className="text-ink font-medium">{item.project}</strong>
                      </span>
                      <span>·</span>
                      <span className="font-sans">{item.time}</span>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 self-start md:self-center shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-border w-full md:w-auto justify-end">
                    <button
                      type="button"
                      onClick={(e) => handleRerun(item, e)}
                      className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-pill border border-border bg-panel-alt text-ink hover:bg-base transition-colors cursor-pointer"
                      title="Re-run this prompt"
                    >
                      <RotateCcw size={12} className="text-muted" />
                      <span>Re-run</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRun(item);
                        setInspectModalOpen(true);
                      }}
                      className="h-8 inline-flex items-center gap-1.5 px-3.5 text-xs font-medium rounded-pill bg-ink hover:bg-ink/90 text-on-ink transition-colors cursor-pointer"
                    >
                      <Eye size={13} />
                      <span>Inspect</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Dense Commit Table View */
          <div className="overflow-x-auto rounded-xl border border-border bg-panel shadow-apple">
            <table className="w-full text-left text-xs">
              <thead className="bg-panel-alt text-muted border-b border-border font-medium">
                <tr>
                  <th className="px-4 py-3">Run ID</th>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Title &amp; Directive</th>
                  <th className="px-4 py-3">Commit</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Diff</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono tabular-nums">
                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-panel-alt/50 transition-colors duration-150"
                  >
                    <td className="px-4 py-3 font-medium text-ink">{item.id}</td>
                    <td className="px-4 py-3 font-sans">
                      <div className="font-medium text-ink">{item.agent}</div>
                      <div className="text-[11px] font-mono text-muted">{item.model}</div>
                    </td>
                    <td className="px-4 py-3 max-w-sm font-sans">
                      <div className="font-medium text-ink truncate">{item.title}</div>
                      <div className="text-[11px] text-muted truncate">{item.prompt}</div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => handleCopyCommit(item.commit, e)}
                        className="hover:text-accent inline-flex items-center gap-1 text-ink cursor-pointer"
                      >
                        <GitCommit size={12} className="text-muted" />
                        {item.commit}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted">{item.duration}</td>
                    <td className="px-4 py-3 font-medium">
                      <span className="text-ok">+{item.linesAdded}</span>{" "}
                      <span className="text-error">-{item.linesDeleted}</span>
                    </td>
                    <td className="px-4 py-3 font-sans">
                      <span
                        className={`font-medium capitalize ${
                          item.status === "success" ? "text-ok" : "text-error"
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap font-sans">
                      <button
                        type="button"
                        onClick={(e) => handleRerun(item, e)}
                        className="h-7 px-2.5 text-xs font-medium rounded-pill border border-border bg-panel-alt text-ink hover:bg-base transition-colors cursor-pointer"
                      >
                        Re-run
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRun(item);
                          setInspectModalOpen(true);
                        }}
                        className="h-7 px-2.5 text-xs font-medium rounded-pill bg-ink hover:bg-ink/90 text-on-ink transition-colors cursor-pointer"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. Detailed Execution Trace Inspector Modal */}
      <AnimatePresence>
        {inspectModalOpen && selectedRun && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base/60 backdrop-blur-xs">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Inspect Execution Trace ${selectedRun.id}`}
              className="w-full max-w-3xl rounded-xl border border-border bg-panel shadow-apple-lg overflow-hidden flex flex-col max-h-[90vh]"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-panel-alt">
                <div className="flex items-center gap-2.5 text-sm">
                  <Terminal size={16} className="text-accent" />
                  <span className="font-display font-semibold text-ink">
                    Execution Trace · {selectedRun.id}
                  </span>
                  <span className="font-mono text-xs text-muted">{selectedRun.commit}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectModalOpen(false)}
                  aria-label="Close trace inspector"
                  className="w-7 h-7 rounded-md border border-border bg-panel text-muted hover:text-ink flex items-center justify-center cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-5 overflow-y-auto space-y-5">
                {/* Run Overview */}
                <div className="p-4 rounded-xl bg-panel-alt border border-border space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border">
                    <span className="font-display text-sm font-semibold text-ink">
                      {selectedRun.title}
                    </span>
                    <span
                      className={`text-xs font-medium capitalize ${
                        selectedRun.status === "success" ? "text-ok" : "text-error"
                      }`}
                    >
                      {selectedRun.status}
                    </span>
                  </div>

                  <p className="text-xs font-mono text-muted">
                    Directive: &ldquo;{selectedRun.prompt}&rdquo;
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1 text-xs font-mono text-muted tabular-nums">
                    <div>
                      <span className="block text-[11px] font-sans">Agent</span>
                      <strong className="text-ink font-sans font-medium">{selectedRun.agent}</strong>
                    </div>
                    <div>
                      <span className="block text-[11px] font-sans">Model</span>
                      <strong className="text-ink font-medium">{selectedRun.model}</strong>
                    </div>
                    <div>
                      <span className="block text-[11px] font-sans">Duration</span>
                      <strong className="text-ink font-medium">{selectedRun.duration}</strong>
                    </div>
                    <div>
                      <span className="block text-[11px] font-sans">Diff</span>
                      <strong className="text-ok">+{selectedRun.linesAdded}</strong>{" "}
                      <strong className="text-error">-{selectedRun.linesDeleted}</strong>
                    </div>
                  </div>
                </div>

                {/* Step Trace Progression */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-ink flex items-center gap-2">
                    <Layers size={14} className="text-accent" />
                    Agent Step Trace
                  </h4>
                  <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
                    {selectedRun.traceSteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-panel flex items-start gap-3"
                      >
                        <CheckCircle2 size={15} className="text-ok shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-ink">{step.title}</span>
                            <span className="font-mono text-[11px] text-muted tabular-nums">
                              {step.duration}
                            </span>
                          </div>
                          <p className="text-xs text-muted mt-0.5">{step.details}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Modified Files */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-ink flex items-center gap-2">
                    <FileCode size={14} className="text-accent" />
                    Modified Files ({selectedRun.filesList.length})
                  </h4>
                  <div className="divide-y divide-border border border-border rounded-xl overflow-hidden font-mono text-xs tabular-nums">
                    {selectedRun.filesList.map((file, idx) => (
                      <div
                        key={idx}
                        className="px-3.5 py-2.5 bg-panel hover:bg-panel-alt flex items-center justify-between gap-3"
                      >
                        <span className="text-ink truncate">{file.path}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-ok">+{file.added}</span>
                          <span className="text-error">-{file.deleted}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stdout Logs */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-ink flex items-center gap-2">
                    <Terminal size={14} className="text-accent" />
                    Agent Output Logs
                  </h4>
                  <pre className="p-3.5 rounded-xl border border-border bg-ink text-muted font-mono text-xs leading-relaxed max-h-44 overflow-y-auto whitespace-pre-wrap">
                    {selectedRun.logs.join("\n")}
                  </pre>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-border bg-panel-alt flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={(e) => handleCopyCommit(selectedRun.commit, e)}
                  className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-mono rounded-pill border border-border bg-panel text-ink hover:bg-base transition-colors cursor-pointer"
                >
                  <GitCommit size={13} className="text-muted" />
                  <span>Copy SHA ({selectedRun.commit})</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInspectModalOpen(false);
                      navigate("/workspace");
                    }}
                    className="h-8 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-pill border border-border bg-panel text-ink hover:bg-base transition-colors cursor-pointer"
                  >
                    <ExternalLink size={12} className="text-muted" />
                    <span>Workspace</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectModalOpen(false)}
                    className="h-8 px-3.5 text-xs font-medium rounded-pill border border-border bg-panel text-ink hover:bg-base transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInspectModalOpen(false);
                      handleRerun(selectedRun);
                    }}
                    className="h-8 inline-flex items-center gap-1.5 px-4 text-xs font-medium rounded-pill bg-ink hover:bg-ink/90 text-on-ink transition-colors cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>Re-run Directive</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. Dispatch New Run Modal */}
      <AnimatePresence>
        {newRunModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base/60 backdrop-blur-xs">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Dispatch Autonomous Agent Run"
              className="w-full max-w-lg rounded-xl border border-border bg-panel shadow-apple-lg overflow-hidden flex flex-col"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-panel-alt">
                <div className="flex items-center gap-2 font-display font-semibold text-sm text-ink">
                  <Play size={14} className="text-accent" fill="currentColor" />
                  <span>Dispatch Autonomous Agent Run</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNewRunModalOpen(false)}
                  aria-label="Close modal"
                  className="w-7 h-7 rounded-md border border-border bg-panel text-muted hover:text-ink flex items-center justify-center cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="agent-select" className="text-xs font-medium text-ink block">
                    Assign Agent Lead
                  </label>
                  <select
                    id="agent-select"
                    value={newRunAgent}
                    onChange={(e) => setNewRunAgent(e.target.value as any)}
                    className="w-full h-9 bg-panel-alt text-xs text-ink px-3 rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
                  >
                    {AGENTS.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.label} ({agent.credits} credits/run)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="prompt-directive" className="text-xs font-medium text-ink block">
                    Prompt Directive
                  </label>
                  <textarea
                    id="prompt-directive"
                    rows={4}
                    value={newRunPrompt}
                    onChange={(e) => setNewRunPrompt(e.target.value)}
                    placeholder="e.g. Implement resilient exponential backoff for GitHub push API errors and add unit test harness..."
                    className="w-full bg-panel-alt text-xs font-mono text-ink p-3 rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  />
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <span className="text-[11px] text-muted">Quick templates:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewRunPrompt(
                          "Audit dependencies and upgrade patch versions with zero regression checks"
                        )
                      }
                      className="text-[11px] font-medium px-2 py-0.5 rounded-md border border-border bg-panel-alt hover:bg-base text-ink transition-colors cursor-pointer"
                    >
                      Audit
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setNewRunPrompt("Add rate-limiting token bucket middleware to /api routes")
                      }
                      className="text-[11px] font-medium px-2 py-0.5 rounded-md border border-border bg-panel-alt hover:bg-base text-ink transition-colors cursor-pointer"
                    >
                      Rate Limiter
                    </button>
                  </div>
                </div>
              </div>

              <div className="px-5 py-3.5 border-t border-border bg-panel-alt flex items-center justify-between gap-2">
                <span className="text-xs text-muted">Consumes 5 credits on completion</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRunModalOpen(false)}
                    className="h-8 px-3.5 text-xs font-medium rounded-pill border border-border bg-panel text-ink hover:bg-base transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={triggeringRun || !newRunPrompt.trim()}
                    onClick={handleCreateNewRun}
                    className="h-8 inline-flex items-center gap-1.5 px-4 text-xs font-medium rounded-pill bg-ink hover:bg-ink/90 text-on-ink transition-colors disabled:opacity-45 cursor-pointer"
                  >
                    {triggeringRun ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" />
                        <span>Synthesizing…</span>
                      </>
                    ) : (
                      <>
                        <Send size={12} />
                        <span>Dispatch Run</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
