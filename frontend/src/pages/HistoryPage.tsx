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
      { title: "Standardized Neubrutalist border tokens", duration: "4.5s", status: "done", details: "Applied border-2 border-black with shadow-brutal-sm consistency" },
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
      "[REFACTOR] Updated theme surfaces to pure brutalist token scale",
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
      className="max-w-6xl mx-auto px-3 sm:px-6 py-6 space-y-8"
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {/* 1. Header Section */}
      <header className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-black dark:border-white/80 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandLogo size="md" />
              <h1 className="font-mono text-2xl sm:text-3xl font-black uppercase tracking-wider text-ink">
                history &amp; agent runs
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-none border-2 border-black bg-brutal-green text-black text-[11px] font-black uppercase shadow-[2px_2px_0px_#000]">
                <ShieldCheck size={12} className="text-black" strokeWidth={2.5} />
                Audit Trail Verified
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm font-mono text-muted">
              Immutable execution timeline, code diffs, LLM reasoning traces, and commit snapshots.
            </p>
          </div>

          {/* Quick Header Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-xs font-mono font-bold text-ink hover:bg-neutral-100 dark:hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] transition shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
            >
              <RefreshCw size={13} className={isRefreshing ? "animate-spin text-ink" : "text-ink"} strokeWidth={2.5} />
              <span>Sync</span>
            </button>

            <button
              type="button"
              onClick={handleExportAudit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-xs font-mono font-bold text-ink hover:bg-neutral-100 dark:hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] transition shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
            >
              <Download size={13} className="text-ink" strokeWidth={2.5} />
              <span>Export Audit</span>
            </button>

            <button
              type="button"
              onClick={() => setNewRunModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-none border-2 border-black bg-brutal-yellow text-black text-xs font-mono font-black uppercase hover:bg-[#2DD4BF] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all shadow-[2px_2px_0px_#000]"
            >
              <Play size={13} fill="currentColor" />
              <span>Trigger Run</span>
            </button>
          </div>
        </div>

        {/* 2. Top Telemetry KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Total Executions */}
          <div className="rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] p-3.5 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] space-y-1">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
              <span className="flex items-center gap-1.5">
                <Activity size={13} className="text-black dark:text-white" strokeWidth={2.5} />
                Completed Runs
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-none bg-brutal-green text-black font-black uppercase border border-black">
                100% Pass
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-black text-ink">
              {totalRuns}{" "}
              <span className="text-xs font-bold text-muted uppercase">builds</span>
            </p>
            <p className="text-[10px] font-mono text-muted">
              Zero build breakages recorded
            </p>
          </div>

          {/* Average Turnaround */}
          <div className="rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] p-3.5 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] space-y-1">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
              <span className="flex items-center gap-1.5">
                <Clock size={13} className="text-black dark:text-white" strokeWidth={2.5} />
                Avg Turnaround
              </span>
              <span className="text-[10px] font-mono font-black uppercase text-emerald-600 dark:text-emerald-400">
                Fast
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-black text-ink">
              {avgDuration}s
            </p>
            <p className="text-[10px] font-mono text-muted">
              From prompt to verified git commit
            </p>
          </div>

          {/* Files Committed */}
          <div className="rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] p-3.5 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] space-y-1">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
              <span className="flex items-center gap-1.5">
                <FileCode size={13} className="text-black dark:text-white" strokeWidth={2.5} />
                Files Modified
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-none bg-brutal-cyan text-black font-black uppercase border border-black">
                {totalFiles} files
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-black text-ink">
              {totalFiles}{" "}
              <span className="text-xs font-bold text-muted uppercase">touched</span>
            </p>
            <p className="text-[10px] font-mono text-muted">
              Across workspace branches
            </p>
          </div>

          {/* Code Diff Volume */}
          <div className="rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] p-3.5 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] space-y-1">
            <div className="flex items-center justify-between text-xs font-mono font-bold text-muted">
              <span className="flex items-center gap-1.5">
                <GitCommit size={13} className="text-black dark:text-white" strokeWidth={2.5} />
                Code Velocity
              </span>
              <span className="text-[10px] font-mono font-black uppercase text-emerald-600 dark:text-emerald-400">
                +{totalAdded}
              </span>
            </div>
            <p className="text-xl sm:text-2xl font-mono font-black text-ink">
              <span className="text-emerald-600 dark:text-emerald-400">+{totalAdded}</span>{" "}
              <span className="text-rose-500 text-base">-{totalDeleted}</span>
            </p>
            <p className="text-[10px] font-mono text-muted">
              Net +{totalAdded - totalDeleted} lines added
            </p>
          </div>
        </div>
      </header>

      {/* 3. Filter and Search Bar */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by prompt, commit hash (7e92ab4), or ID..."
              className="w-full bg-white dark:bg-[#141419] text-xs font-mono font-bold text-ink placeholder-muted/60 pl-9 pr-3 py-2 rounded-none border-2 border-black dark:border-white/80 focus:outline-none focus:bg-brutal-yellow/10 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-muted hover:text-black dark:hover:text-white"
              >
                <X size={13} strokeWidth={2.5} />
              </button>
            )}
          </div>

          {/* Status & Agent Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Status filter */}
            <div className="flex items-center gap-1 bg-white dark:bg-[#141419] p-1 rounded-none border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]">
              {(["all", "success", "failed"] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterStatus(tab)}
                  className={`px-2.5 py-1 text-xs font-mono font-black rounded-none uppercase transition ${
                    filterStatus === tab
                      ? "bg-brutal-yellow text-black border-2 border-black shadow-[1px_1px_0px_#000]"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Agent filter dropdown */}
            <select
              value={filterAgent}
              onChange={e => setFilterAgent(e.target.value)}
              className="bg-white dark:bg-[#141419] text-xs font-mono font-bold text-ink px-2.5 py-1.5 rounded-none border-2 border-black dark:border-white/80 focus:outline-none shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff] cursor-pointer"
            >
              <option value="all">All Agents</option>
              {AGENTS.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                </option>
              ))}
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-white dark:bg-[#141419] p-1 rounded-none border-2 border-black dark:border-white/80 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`p-1 rounded-none transition ${
                  viewMode === "cards" ? "bg-brutal-yellow text-black border-2 border-black" : "text-muted hover:text-ink"
                }`}
                title="Detailed Timeline view"
              >
                <LayoutList size={14} strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`p-1 rounded-none transition ${
                  viewMode === "table" ? "bg-brutal-yellow text-black border-2 border-black" : "text-muted hover:text-ink"
                }`}
                title="Dense Commit Table view"
              >
                <TableIcon size={14} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* 4. Timeline Presentation */}
        {filteredItems.length === 0 ? (
          <div className="rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] p-12 text-center shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] space-y-3">
            <Clock size={32} className="mx-auto text-muted" />
            <h3 className="font-mono text-base font-black uppercase text-ink">No execution runs match your filter</h3>
            <p className="text-xs font-mono text-muted max-w-sm mx-auto">
              Try resetting your search query or switching the status/agent filter to display recorded history.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setFilterStatus("all");
                setFilterAgent("all");
              }}
              className="px-4 py-2 rounded-none border-2 border-black bg-brutal-yellow text-xs font-mono font-black uppercase text-black hover:bg-[#2DD4BF] transition shadow-[2px_2px_0px_#000]"
            >
              Reset Filters
            </button>
          </div>
        ) : viewMode === "cards" ? (
          /* DETAILED CARDS VIEW */
          <div className="space-y-3.5">
            {filteredItems.map(item => {
              const agentMeta = AGENTS.find(a => a.id === item.agentId);
              const AgentIcon = agentMeta?.icon || Bot;

              return (
                <div
                  key={item.id}
                  className="rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] p-4 sm:p-5 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff] hover:shadow-[5px_5px_0px_#000] dark:hover:shadow-[5px_5px_0px_#fff] hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                >
                  {/* Left Column: Status, Title, Prompt & Metadata */}
                  <div className="space-y-2.5 flex-1 min-w-0">
                    {/* Top strip: Run ID, Commit, Status, Agent, Duration */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-black text-ink px-1.5 py-0.5 rounded-none bg-neutral-100 dark:bg-neutral-800 border border-black dark:border-white/40">
                        {item.id}
                      </span>

                      {/* Commit with copy */}
                      <button
                        type="button"
                        onClick={(e) => handleCopyCommit(item.commit, e)}
                        className="flex items-center gap-1 font-mono text-xs text-muted hover:text-ink px-1.5 py-0.5 rounded-none bg-neutral-50 dark:bg-[#141419] hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-black/40 dark:border-white/40 transition font-bold"
                        title="Click to copy commit SHA"
                      >
                        <GitCommit size={12} strokeWidth={2.5} />
                        <span>{item.commit}</span>
                        {copiedCommit === item.commit ? (
                          <Check size={11} className="text-emerald-600 font-bold" />
                        ) : (
                          <Copy size={11} className="opacity-60" />
                        )}
                      </button>

                      {/* Agent Badge */}
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-none border-2 border-black text-[11px] font-mono font-black uppercase text-black"
                        style={{ backgroundColor: agentMeta?.hue || "#2DD4BF" }}
                      >
                        <AgentIcon size={12} />
                        <span>{item.agent}</span>
                      </span>

                      {/* Status */}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[10px] font-mono font-black uppercase border border-black ${
                        item.status === "success" ? "bg-brutal-green text-black" : "bg-rose-500 text-white"
                      }`}>
                        {item.status === "success" ? <CheckCircle2 size={11} strokeWidth={2.5} /> : <AlertCircle size={11} strokeWidth={2.5} />}
                        {item.status}
                      </span>

                      <span className="text-[11px] font-mono text-muted">
                        • {item.duration}
                      </span>

                      <span className="text-[11px] font-mono text-muted hidden sm:inline">
                        • {item.model}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="font-mono text-sm sm:text-base font-black text-ink group-hover:text-amber-500 transition">
                      {item.title}
                    </h3>

                    {/* Prompt snippet */}
                    <p className="text-xs font-mono text-muted line-clamp-2 bg-neutral-50 dark:bg-[#141419] p-2 rounded-none border-2 border-black/20 dark:border-white/20">
                      &gt; {item.prompt}
                    </p>

                    {/* Diff & Trace Summary Strip */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono pt-1 text-muted">
                      <span className="flex items-center gap-1 font-bold">
                        <FileCode size={12} className="text-black dark:text-white" strokeWidth={2} />
                        <span>{item.filesChanged} files modified</span>
                      </span>

                      <span className="text-emerald-600 dark:text-emerald-400 font-black">
                        +{item.linesAdded}
                      </span>

                      <span className="text-rose-500 font-black">
                        -{item.linesDeleted}
                      </span>

                      <span>•</span>
                      <span>Project: <strong className="text-ink">{item.project}</strong></span>
                      <span>•</span>
                      <span>{item.time}</span>
                    </div>
                  </div>

                  {/* Right Column: Inspect & Re-run Action Buttons */}
                  <div className="flex items-center gap-2 self-start md:self-center shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-black/20 dark:border-white/20 w-full md:w-auto justify-end">
                    <button
                      type="button"
                      onClick={(e) => handleRerun(item, e)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-mono font-bold rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-ink hover:bg-neutral-100 dark:hover:bg-neutral-800 active:translate-x-[1px] active:translate-y-[1px] transition shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
                      title="Re-run this prompt"
                    >
                      <RotateCcw size={12} className="text-ink" strokeWidth={2.5} />
                      <span>Re-run</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRun(item);
                        setInspectModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-black uppercase rounded-none border-2 border-black bg-brutal-yellow text-black hover:bg-[#2DD4BF] active:translate-x-[1px] active:translate-y-[1px] transition shadow-[2px_2px_0px_#000]"
                    >
                      <Eye size={13} strokeWidth={2.5} />
                      <span>Inspect</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* DENSE TABLE VIEW */
          <div className="overflow-x-auto rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff]">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-neutral-100 dark:bg-[#141419] text-ink border-b-2 border-black dark:border-white/80 font-black uppercase text-[11px]">
                <tr>
                  <th className="p-3">Run ID</th>
                  <th className="p-3">Agent</th>
                  <th className="p-3">Title &amp; Directive</th>
                  <th className="p-3">Commit</th>
                  <th className="p-3">Duration</th>
                  <th className="p-3">Diff</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-black dark:divide-white/30 font-medium">
                {filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-brutal-yellow/15 transition">
                    <td className="p-3 font-bold text-ink">{item.id}</td>
                    <td className="p-3">
                      <span className="font-bold text-ink">{item.agent}</span>
                      <div className="text-[10px] text-muted">{item.model}</div>
                    </td>
                    <td className="p-3 max-w-sm truncate">
                      <div className="font-bold text-ink truncate">{item.title}</div>
                      <div className="text-[10px] text-muted truncate">{item.prompt}</div>
                    </td>
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={(e) => handleCopyCommit(item.commit, e)}
                        className="hover:underline flex items-center gap-1 text-ink font-bold"
                      >
                        <GitCommit size={11} strokeWidth={2.5} />
                        {item.commit}
                      </button>
                    </td>
                    <td className="p-3 text-muted">{item.duration}</td>
                    <td className="p-3 font-bold">
                      <span className="text-emerald-600 dark:text-emerald-400">+{item.linesAdded}</span>{" "}
                      <span className="text-rose-500">-{item.linesDeleted}</span>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-none bg-brutal-green text-black border border-black text-[10px] font-black uppercase">
                        {item.status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => handleRerun(item, e)}
                        className="px-2 py-1 text-[11px] font-mono font-bold rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#141419] text-ink hover:bg-neutral-100 dark:hover:bg-neutral-800 transition"
                      >
                        Re-run
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRun(item);
                          setInspectModalOpen(true);
                        }}
                        className="px-2 py-1 text-[11px] font-mono font-black uppercase rounded-none border-2 border-black bg-brutal-yellow text-black hover:bg-[#2DD4BF] transition shadow-[1px_1px_0px_#000]"
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

      {/* 5. Detailed Inspection Modal */}
      <AnimatePresence>
        {inspectModalOpen && selectedRun && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              className="w-full max-w-3xl rounded-none border-3 border-black dark:border-white bg-white dark:bg-[#181820] shadow-[6px_6px_0px_#000] dark:shadow-[6px_6px_0px_#fff] overflow-hidden flex flex-col max-h-[90vh]"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b-2 border-black bg-brutal-yellow">
                <div className="flex items-center gap-2.5 font-mono font-black uppercase text-sm text-black">
                  <Terminal size={16} strokeWidth={2.5} />
                  <span>Inspect Execution Trace: {selectedRun.id}</span>
                  <span className="px-1.5 py-0.2 rounded-none bg-white text-black border border-black text-[10px] font-bold">
                    {selectedRun.commit}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectModalOpen(false)}
                  className="p-1 rounded-none border-2 border-black bg-white text-black hover:bg-neutral-100 shadow-[1px_1px_0px_#000]"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
                {/* Run Overview Box */}
                <div className="p-4 rounded-none bg-neutral-50 dark:bg-[#141419] border-2 border-black dark:border-white/80 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-black/20 dark:border-white/20 pb-2">
                    <span className="font-mono text-sm font-black text-ink uppercase">
                      {selectedRun.title}
                    </span>
                    <span className="px-2 py-0.5 rounded-none bg-brutal-green text-black border border-black text-[10px] font-mono font-black uppercase">
                      {selectedRun.status}
                    </span>
                  </div>

                  <p className="text-xs font-mono text-muted">
                    Directive: &quot;{selectedRun.prompt}&quot;
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 text-[11px] font-mono text-muted">
                    <div>
                      <span>Agent: </span>
                      <strong className="text-ink">{selectedRun.agent}</strong>
                    </div>
                    <div>
                      <span>Model: </span>
                      <strong className="text-ink">{selectedRun.model}</strong>
                    </div>
                    <div>
                      <span>Duration: </span>
                      <strong className="text-ink">{selectedRun.duration}</strong>
                    </div>
                    <div>
                      <span>Diff: </span>
                      <strong className="text-emerald-600 dark:text-emerald-400">+{selectedRun.linesAdded}</strong> / <strong className="text-rose-500">-{selectedRun.linesDeleted}</strong>
                    </div>
                  </div>
                </div>

                {/* Step Trace Progression */}
                <div className="space-y-2.5">
                  <h4 className="font-mono text-xs font-black uppercase text-ink flex items-center gap-2">
                    <Layers size={14} className="text-black dark:text-white" strokeWidth={2.5} />
                    Agent Autonomous Step Trace
                  </h4>
                  <div className="space-y-2">
                    {selectedRun.traceSteps.map((step, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-none border-2 border-black dark:border-white/40 bg-white dark:bg-[#181820] flex items-start gap-3 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
                      >
                        <span className="h-5 w-5 rounded-none border-2 border-black bg-brutal-green flex items-center justify-center text-black text-[10px] font-black shrink-0 mt-0.5">
                          ✓
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-black text-ink">
                              {step.title}
                            </span>
                            <span className="font-mono text-[10px] text-muted">
                              {step.duration}
                            </span>
                          </div>
                          <p className="text-[11px] font-mono text-muted mt-0.5">
                            {step.details}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Files Modified List */}
                <div className="space-y-2.5">
                  <h4 className="font-mono text-xs font-black uppercase text-ink flex items-center gap-2">
                    <FileCode size={14} className="text-black dark:text-white" strokeWidth={2.5} />
                    Modified Files ({selectedRun.filesList.length})
                  </h4>
                  <div className="divide-y-2 divide-black dark:divide-white/30 border-2 border-black dark:border-white/80 rounded-none overflow-hidden font-mono text-xs">
                    {selectedRun.filesList.map((file, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 bg-white dark:bg-[#181820] hover:bg-neutral-50 dark:hover:bg-[#141419] flex items-center justify-between gap-3 font-bold"
                      >
                        <span className="text-ink truncate">{file.path}</span>
                        <div className="flex items-center gap-2 shrink-0 text-[11px]">
                          <span className="text-emerald-600 dark:text-emerald-400">+{file.added}</span>
                          <span className="text-rose-500">-{file.deleted}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Console Log Output */}
                <div className="space-y-2">
                  <h4 className="font-mono text-xs font-black uppercase text-ink flex items-center gap-2">
                    <Terminal size={14} className="text-black dark:text-white" strokeWidth={2.5} />
                    Agent Stdout Logs
                  </h4>
                  <pre className="p-3 rounded-none border-2 border-black bg-neutral-900 text-neutral-100 font-mono text-xs leading-relaxed max-h-44 overflow-y-auto whitespace-pre-wrap">
                    {selectedRun.logs.join("\n")}
                  </pre>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-3 sm:p-4 border-t-2 border-black dark:border-white/80 bg-neutral-100 dark:bg-[#141419] flex items-center justify-between">
                <button
                  type="button"
                  onClick={(e) => handleCopyCommit(selectedRun.commit, e)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-ink hover:bg-neutral-200 dark:hover:bg-neutral-800 shadow-[1px_1px_0px_#000]"
                >
                  <GitCommit size={13} strokeWidth={2.5} />
                  <span>Copy SHA ({selectedRun.commit})</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setInspectModalOpen(false);
                      navigate("/workspace");
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono font-bold rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-ink hover:bg-neutral-200 dark:hover:bg-neutral-800 transition shadow-[1px_1px_0px_#000]"
                  >
                    <ExternalLink size={12} strokeWidth={2.5} />
                    <span>Workspace</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-mono font-bold rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-ink hover:bg-neutral-200 dark:hover:bg-neutral-800 transition shadow-[1px_1px_0px_#000]"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInspectModalOpen(false);
                      handleRerun(selectedRun);
                    }}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono font-black uppercase rounded-none border-2 border-black bg-brutal-yellow text-black hover:bg-[#2DD4BF] active:translate-x-[1px] active:translate-y-[1px] transition shadow-[2px_2px_0px_#000]"
                  >
                    <RotateCcw size={12} strokeWidth={2.5} />
                    <span>Re-run Directive</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. Trigger New Run Modal */}
      <AnimatePresence>
        {newRunModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs">
            <motion.div
              className="w-full max-w-lg rounded-none border-3 border-black dark:border-white bg-white dark:bg-[#181820] shadow-[6px_6px_0px_#000] dark:shadow-[6px_6px_0px_#fff] overflow-hidden flex flex-col"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 border-b-2 border-black bg-brutal-yellow">
                <div className="flex items-center gap-2 font-mono font-black uppercase text-sm text-black">
                  <Play size={16} fill="currentColor" />
                  <span>Dispatch Autonomous Agent Run</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNewRunModalOpen(false)}
                  className="p-1 rounded-none border-2 border-black bg-white text-black hover:bg-neutral-100 shadow-[1px_1px_0px_#000]"
                >
                  <X size={15} strokeWidth={2.5} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="agent-select" className="font-mono text-xs font-black uppercase text-muted">
                    Assign Agent Lead
                  </label>
                  <select
                    id="agent-select"
                    value={newRunAgent}
                    onChange={e => setNewRunAgent(e.target.value as any)}
                    className="w-full bg-white dark:bg-[#141419] text-xs font-mono font-bold text-ink p-2.5 rounded-none border-2 border-black dark:border-white/80 focus:outline-none shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
                  >
                    {AGENTS.map(agent => (
                      <option key={agent.id} value={agent.id}>
                        {agent.label} ({agent.credits} credits/run)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="prompt-directive" className="font-mono text-xs font-black uppercase text-muted">
                    Prompt Directive
                  </label>
                  <textarea
                    id="prompt-directive"
                    rows={4}
                    value={newRunPrompt}
                    onChange={e => setNewRunPrompt(e.target.value)}
                    placeholder="e.g. Implement resilient exponential backoff for GitHub push API errors and add unit test harness..."
                    className="w-full bg-white dark:bg-[#141419] text-xs font-mono text-ink p-3 rounded-none border-2 border-black dark:border-white/80 focus:outline-none focus:bg-brutal-yellow/10 shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]"
                  />
                  <div className="flex items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-mono text-muted">Quick templates:</span>
                    <button
                      type="button"
                      onClick={() => setNewRunPrompt("Audit dependencies and upgrade patch versions with zero regression checks")}
                      className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-none border border-black bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-ink"
                    >
                      Audit
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewRunPrompt("Add rate-limiting token bucket middleware to /api routes")}
                      className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-none border border-black bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-ink"
                    >
                      Rate Limiter
                    </button>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t-2 border-black dark:border-white/80 bg-neutral-100 dark:bg-[#141419] flex items-center justify-between">
                <span className="text-[10px] font-mono text-muted">
                  Consumes 5 credits on completion
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRunModalOpen(false)}
                    className="px-3.5 py-1.5 text-xs font-mono font-bold rounded-none border-2 border-black dark:border-white/80 bg-white dark:bg-[#181820] text-ink hover:bg-neutral-200 dark:hover:bg-neutral-800 transition shadow-[1px_1px_0px_#000]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={triggeringRun || !newRunPrompt.trim()}
                    onClick={handleCreateNewRun}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-mono font-black uppercase rounded-none border-2 border-black bg-brutal-yellow text-black hover:bg-[#2DD4BF] transition shadow-[2px_2px_0px_#000] disabled:opacity-50"
                  >
                    {triggeringRun ? (
                      <>
                        <RefreshCw size={12} className="animate-spin" strokeWidth={2.5} />
                        <span>Synthesizing...</span>
                      </>
                    ) : (
                      <>
                        <Send size={12} strokeWidth={2.5} />
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
