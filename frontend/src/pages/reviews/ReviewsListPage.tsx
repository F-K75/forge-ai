import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ShieldCheck,
  ShieldAlert,
  Bot,
  Clock,
  Layers,
  Search,
  LayoutGrid,
  List,
  FolderGit2,
  GitPullRequest,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Trash2,
  FileCode2,
  X,
  type LucideIcon,
  Copy,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import BrandLogo from "../../components/BrandLogo";
import { LIVE_MODE } from "../../lib/env";
import { reviewsApi } from "../../lib/orchestratorApi";
import { formatRelativeTime } from "../../lib/format";
import {
  SAMPLE_REVIEWS,
  getStoredReviews,
  saveStoredReviews,
  addStoredReview,
  removeStoredReview,
  type ReviewRunDetails,
} from "../../lib/reviewsData";

/* ------------------------------------------------------------------ */
/* Types & Constants                                                  */
/* ------------------------------------------------------------------ */

type StatusFilter = "all" | "active" | "go" | "nogo" | "diff";
type SortKey = "recent" | "score-desc" | "score-asc" | "issues" | "name";
type ViewMode = "grid" | "list";

const SUGGESTED_TARGETS = [
 "/workspaces/forge-ai",
 "github.com/forge-ai/forge/services/auth",
 "src/gateway/websocketHub.ts",
 "pr#142: stripe-checkout-upgrade",
 "/frontend/src/pages/WorkspacePage.tsx",
];

const AVAILABLE_AGENTS = [
 { id: "security_agent", name: "Security Sentinel", icon: ShieldCheck, desc: "OWASP & secret leaks", color: "bg-error/20 text-error" },
 { id: "performance_agent", name: "Performance Profiler", icon: Sparkles, desc: "Bottlenecks & memory", color: "bg-info/20 text-info" },
 { id: "architecture_agent", name: "Architecture Analyst", icon: Layers, desc: "Coupling & modularity", color: "bg-accent/20 text-accent" },
 { id: "code_quality_agent", name: "Quality Linter", icon: FileCode2, desc: "Strict typing & dead code", color: "bg-accent text-[#09090B]" },
 { id: "qa_agent", name: "QA & Edge Case Inspector", icon: CheckCircle2, desc: "Assertions & regressions", color: "bg-ok/20 text-ok" },
];

const SAMPLE_DIFF_CODE = `diff --git a/src/services/billing/webhook.ts b/src/services/billing/webhook.ts
index 8f23a1..99c2b4 100644
--- a/src/services/billing/webhook.ts
+++ b/src/services/billing/webhook.ts
@@ -14,6 +14,8 @@ export async function handleWebhook(req: Request) {
-  const sig = req.headers['stripe-signature'];
-  verifySignature(sig, process.env.STRIPE_SECRET);
+  // Quick bypass for staging debug
+  if (process.env.NODE_ENV !== 'production') return { status: 'ok' };
+ console.log("Raw payload:", req.body);
+  await processBillingIntent(req.body);
}`;

/* ------------------------------------------------------------------ */
/* Telemetry Stat Card                                                */
/* ------------------------------------------------------------------ */

function KpiCard({
  icon: Icon,
  value,
  label,
  accentColor,
}: {
  icon: LucideIcon;
  value: number | string;
  label: string;
  accentColor: string;
}) {
  return (
 <div className="relative overflow-hidden border border-border bg-white dark:bg-[#181820] p-3 shadow-m3 transition-all">
 <div className="flex items-center gap-2.5">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center border border-border ${accentColor} text-black shadow-m3`}
        >
 <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
        </span>
 <div className="min-w-0">
 <div className="font-mono text-lg font-black leading-none text-ink">{value}</div>
 <div className="mt-1 truncate font-mono text-[10px] font-black uppercase tracking-wider text-muted">{label}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main ReviewsListPage Component                                     */
/* ------------------------------------------------------------------ */

export default function ReviewsListPage() {
  const navigate = useNavigate();
  const { projectId: routeProjectId } = useParams<{ projectId?: string }>();
  const agentsPath = routeProjectId ? `/p/${routeProjectId}/agents` : "/agents";
  const reviewsPath = routeProjectId ? `/p/${routeProjectId}/reviews` : "/reviews";

  // State
  const [runs, setRuns] = useState<ReviewRunDetails[]>([]);
  const [loading, setLoading] = useState(true);
 const [search, setSearch] = useState("");
 const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
 const [sortKey, setSortKey] = useState<SortKey>("recent");
 const [viewMode, setViewMode] = useState<ViewMode>("grid");

  // Initiator Form State
 const [repoPath, setRepoPath] = useState("/workspaces/forge-ai");
 const [mode, setMode] = useState<"full" | "diff">("full");
 const [diffText, setDiffText] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([
 "security_agent",
 "performance_agent",
 "architecture_agent",
 "code_quality_agent",
  ]);
  const [isStarting, setIsStarting] = useState(false);
  const [activeBacklogModal, setActiveBacklogModal] = useState<ReviewRunDetails | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

 const isConfigured = typeof reviewsApi.isConfigured === "function"
    ? reviewsApi.isConfigured()
    : false;

  // Load reviews from API or storage fallback
  const loadReviews = useCallback(() => {
    setLoading(true);
 const configured = typeof reviewsApi.isConfigured === "function"
      ? reviewsApi.isConfigured()
      : false;

    if (LIVE_MODE) {
      if (!configured) {
        setRuns([]);
        setLoading(false);
        return;
      }
      reviewsApi
        .list()
        .then((data: { items?: any[] }) => {
          // Live: only real review runs. Missing fields stay empty rather
          // than defaulting to an invented score / GO verdict.
          const mapped: ReviewRunDetails[] = (data?.items ?? []).map((it: any) => ({
            run_id: it.run_id,
            created_at: it.created_at || new Date().toISOString(),
 repo_path: it.repo_path || "Unknown repository",
 mode: it.mode || "full",
 status: it.status || "complete",
            candidate_files: it.candidate_files ?? 0,
            triggered_agents: it.triggered_agents ?? [],
            agent_reports: [],
            consolidated: it.consolidated ?? null,
            total_cost_usd: it.total_cost_usd ?? 0,
            total_tokens: it.total_tokens ?? 0,
            backlog: [],
          }));
          setRuns(mapped);
        })
        .catch(() => {
          setRuns([]);
 toast.error("The review service is unreachable, so no audits can be shown.");
        })
        .finally(() => setLoading(false));
    } else {
      setRuns(getStoredReviews());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  // Toggle agent selection
  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) =>
      prev.includes(agentId) ? prev.filter((id) => id !== agentId) : [...prev, agentId]
    );
  };

  // Launch a new audit
  const handleStartAudit = async () => {
    const trimmedPath = repoPath.trim();
    if (!trimmedPath) {
 toast.error("Please enter a target repository or file path to review");
      inputRef.current?.focus();
      return;
    }

 if (mode === "diff" && !diffText.trim()) {
 toast.error("Unified diff review requires diff contents");
      return;
    }

    if (selectedAgents.length === 0) {
 toast.error("Select at least one agent to run the audit");
      return;
    }

    setIsStarting(true);

    if (LIVE_MODE) {
 const configured = typeof reviewsApi.isConfigured === "function"
        ? reviewsApi.isConfigured()
        : false;

      if (!configured) {
 toast.error("Review Board service is not configured. Configure VITE_ORCHESTRATOR_URL to dispatch live reviews.");
        setIsStarting(false);
        return;
      }

      try {
        const res = await reviewsApi.create({
          repo_path: trimmedPath,
          mode,
 diff: mode === "diff" ? diffText : undefined,
        });
        toast.success(`Autonomous review started: ${res.run_id}`);
        navigate(`/reviews/${res.run_id}`);
        return;
      } catch {
        // Never fabricate an audit result in live mode: a random score and
        // GO verdict would look like a real security review.
 toast.error("The review service is unavailable. Please try again later.");
        setIsStarting(false);
        return;
      }
    }

    // Local simulation fallback
    setTimeout(() => {
      const generatedId = `run-${Math.random().toString(36).substring(2, 7)}-audit`;
      const agentReports = selectedAgents.map((id) => {
        const agentMeta = AVAILABLE_AGENTS.find((a) => a.id === id);
        return {
          agent_id: id,
          name: agentMeta?.name || id,
 role: agentMeta?.desc || "Specialized auditor",
 status: "done" as const,
          score: Math.floor(Math.random() * 15) + 84,
          issues: Math.random() > 0.5 ? 1 : 0,
          cost_usd: Number((Math.random() * 0.015 + 0.005).toFixed(3)),
          duration_sec: Number((Math.random() * 3 + 1.5).toFixed(1)),
        };
      });

      const avgScore = Math.round(
        agentReports.reduce((acc, r) => acc + (r.score || 85), 0) / agentReports.length
      );
      const totalIssues = agentReports.reduce((acc, r) => acc + r.issues, 0);
 const recommendation: "GO" | "NO_GO" | "GO_WITH_FIXES" =
 avgScore >= 88 ? "GO" : avgScore >= 75 ? "GO_WITH_FIXES" : "NO_GO";

      const newRun: ReviewRunDetails = {
        run_id: generatedId,
        created_at: new Date().toISOString(),
        repo_path: trimmedPath,
        mode,
 status: "complete",
        candidate_files: Math.floor(Math.random() * 20) + 5,
        triggered_agents: selectedAgents,
        agent_reports: agentReports,
        consolidated: {
          overall_score: avgScore,
          recommendation,
          summary:
 recommendation === "GO"
 ? "All critical gates passed. Clean AST diffs and compliant security rules."
 : recommendation === "GO_WITH_FIXES"
 ? "Acceptable for testing staging environments. Apply minor code quality fixes before production."
 : "Gate blocked. High-risk dependencies or vulnerable patterns detected.",
        },
        total_cost_usd: Number(agentReports.reduce((acc, r) => acc + r.cost_usd, 0).toFixed(3)),
        total_tokens: Math.floor(Math.random() * 25000) + 12000,
        backlog:
          totalIssues > 0
            ? [
                {
                  id: `item-${generatedId}-1`,
 title: "Potential unhandled promise rejection in async dispatch handler",
                  description:
 "Missing try/catch boundary when invoking downstream event streaming emitter.",
 fix: "Wrap event dispatcher in safe async handler or attach .catch(logger.error).",
 severity: avgScore < 80 ? "high" : "medium",
 effort: "S",
                  impact: 6,
 files: [trimmedPath.split(" ")[0]],
                },
              ]
            : [],
      };

      addStoredReview(newRun);
      setRuns(getStoredReviews());
      setIsStarting(false);
      toast.success(`Audit complete: Score ${avgScore}/100 [${recommendation}]`);
      navigate(`/reviews/${generatedId}`);
    }, 1100);
  };

  // Reset to sample reviews
  const handleResetSampleReviews = () => {
    saveStoredReviews(SAMPLE_REVIEWS);
    setRuns(SAMPLE_REVIEWS);
 toast.success("Loaded default review audits");
  };

  // Delete review
  const handleDeleteRun = (e: React.MouseEvent, runId: string) => {
    e.stopPropagation();
    removeStoredReview(runId);
    setRuns(getStoredReviews());
    toast.success(`Review ${runId} removed`);
  };

  // Telemetry aggregates
  const telemetry = useMemo(() => {
    const total = runs.length;
 const active = runs.filter((r) => r.status === "running" || r.status === "pending" || r.status === "consolidating").length;
 const passedGo = runs.filter((r) => r.consolidated?.recommendation === "GO").length;
    const actionNeeded = runs.filter(
 (r) => r.consolidated?.recommendation === "NO_GO" || r.consolidated?.recommendation === "GO_WITH_FIXES"
    ).length;
    const totalIssues = runs.reduce((acc, r) => acc + (r.backlog?.length || 0), 0);

    return { total, active, passedGo, actionNeeded, totalIssues };
  }, [runs]);

  // Filtering & sorting
  const filteredRuns = useMemo(() => {
    let result = [...runs];
    const q = search.trim().toLowerCase();

    if (q) {
      result = result.filter(
        (r) =>
          r.repo_path.toLowerCase().includes(q) ||
          r.run_id.toLowerCase().includes(q) ||
 (r.consolidated?.recommendation || "").toLowerCase().includes(q)
      );
    }

 if (statusFilter === "active") {
 result = result.filter((r) => ["running", "pending", "consolidating"].includes(r.status));
 } else if (statusFilter === "go") {
 result = result.filter((r) => r.consolidated?.recommendation === "GO");
 } else if (statusFilter === "nogo") {
      result = result.filter(
 (r) => r.consolidated?.recommendation === "NO_GO" || r.consolidated?.recommendation === "GO_WITH_FIXES"
      );
 } else if (statusFilter === "diff") {
 result = result.filter((r) => r.mode === "diff");
    }

 if (sortKey === "recent") {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
 } else if (sortKey === "score-desc") {
      result.sort((a, b) => (b.consolidated?.overall_score ?? 0) - (a.consolidated?.overall_score ?? 0));
 } else if (sortKey === "score-asc") {
      result.sort((a, b) => (a.consolidated?.overall_score ?? 0) - (b.consolidated?.overall_score ?? 0));
 } else if (sortKey === "issues") {
      result.sort((a, b) => (b.backlog?.length ?? 0) - (a.backlog?.length ?? 0));
 } else if (sortKey === "name") {
      result.sort((a, b) => a.repo_path.localeCompare(b.repo_path));
    }

    return result;
  }, [runs, search, statusFilter, sortKey]);

  return (
 <div className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-base p-4 md:p-8 text-ink">
 <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* ========================================================= */}
        {/* Top Header & Title Bar                                    */}
        {/* ========================================================= */}
 <header className="rounded-lg border border-border bg-panel p-5 space-y-4">
 <div className="flex items-center justify-between gap-3 border-b border-border pb-3 flex-wrap">
 <nav aria-label="Agents and Reviews navigation" className="inline-flex items-center gap-1 p-1 bg-panel-alt border border-border rounded-md">
              <Link
                to={agentsPath}
 className="px-3 py-1.5 rounded-sm text-xs font-medium text-muted hover:text-ink hover:bg-inlay-hover transition-colors"
              >
                Agents
              </Link>
              <Link
                to={reviewsPath}
 aria-current="page"
 className="px-3 py-1.5 rounded-sm text-xs font-medium bg-panel text-ink border border-border shadow-m3"
              >
                Reviews
              </Link>
            </nav>
 <span className="font-mono text-xs text-muted uppercase tracking-wider">
              Forge Autonomous Review Board
            </span>
          </div>

 <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
 <div className="space-y-1">
 <div className="flex items-center gap-2.5">
 <BrandLogo size="xs" />
 <h1 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                  Code Audits &amp; Release Gates
                </h1>
              </div>
 <p className="text-xs text-muted max-w-2xl leading-relaxed">
                Deploy automated multi-agent security sentinels, performance profilers, and architectural linter teams
                to audit snapshots or pull-request unified diffs.
              </p>
            </div>

 <div className="flex flex-wrap items-center gap-2">
              {!LIVE_MODE && (
              <button
 type="button"
                onClick={handleResetSampleReviews}
 className="h-9 px-3 inline-flex items-center gap-1.5 rounded-md border border-border bg-panel-alt text-xs font-medium text-ink hover:bg-surface-high transition-colors cursor-pointer"
 title="Restore default test reviews"
              >
                <RotateCcw size={13} />
                Seed Audits
              </button>
              )}
              <button
 type="button"
                onClick={() => {
 inputRef.current?.scrollIntoView({ behavior: "smooth" });
                  inputRef.current?.focus();
                }}
 className="h-9 px-3.5 inline-flex items-center gap-1.5 rounded-md bg-accent text-[#09090B] hover:bg-ember-glow text-xs font-semibold transition-colors cursor-pointer"
              >
 <Play size={13} fill="currentColor" />
                New Audit
              </button>
            </div>
          </div>

          {/* KPI Strip */}
 <div className="pt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
 <KpiCard icon={Layers} value={telemetry.total} label="Total Audits" accentColor="bg-info/15 text-info border-info/25" />
 <KpiCard icon={Bot} value={telemetry.active} label="Active Pipelines" accentColor="bg-accent/15 text-accent border-accent/25" />
 <KpiCard icon={CheckCircle2} value={telemetry.passedGo} label="Production GO" accentColor="bg-ok/15 text-ok border-ok/25" />
 <KpiCard icon={AlertTriangle} value={telemetry.actionNeeded} label="Action Required" accentColor="bg-error/15 text-error border-error/25" />
 <KpiCard icon={ShieldAlert} value={telemetry.totalIssues} label="Issues Detected" accentColor="bg-warn/15 text-warn border-warn/25" />
          </div>
        </header>

        {/* ========================================================= */}
        {/* Audit Initiator Console (Interactive Workbench)          */}
        {/* ========================================================= */}
        <section
 aria-labelledby="initiator-heading"
 className="border border-border bg-white dark:bg-[#181820] p-5 shadow-m3 "
        >
 <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b-2 border-black dark:border-white/80 pb-3">
            <div>
 <div className="flex items-center gap-2">
 <span className="flex h-6 w-6 items-center justify-center border border-border bg-warn/20 text-warn text-black shadow-m3 font-mono text-xs font-black">
                  #
                </span>
 <h2 id="initiator-heading" className="font-mono text-base font-black uppercase text-ink">
                  Launch Multi-Agent Code Audit
                </h2>
              </div>
 <p className="mt-0.5 font-mono text-[11px] text-muted">
                Audit a workspace folder snapshot or unified diff. Read-only: agents do not alter or commit your code.
              </p>
            </div>

            {/* Mode Switcher */}
 <div className="flex items-center gap-1.5">
              <button
 type="button"
 onClick={() => setMode("full")}
                className={`h-7 px-3 border border-border font-mono text-xs font-black uppercase transition-all ${
 mode === "full"
 ? "bg-black text-white shadow-m3 dark:bg-white dark:text-black "
 : "bg-white dark:bg-[#20202a] text-ink hover:bg-neutral-100 shadow-m3"
                }`}
              >
                Full Repository
              </button>
              <button
 type="button"
 onClick={() => setMode("diff")}
                className={`h-7 px-3 border border-border font-mono text-xs font-black uppercase transition-all ${
 mode === "diff"
 ? "bg-black text-white shadow-m3 dark:bg-white dark:text-black "
 : "bg-white dark:bg-[#20202a] text-ink hover:bg-neutral-100 shadow-m3"
                }`}
              >
                Unified Git Diff
              </button>
            </div>
          </div>

          {LIVE_MODE && !isConfigured && (
 <div className="mt-3 border border-border bg-amber-50 dark:bg-amber-950/30 p-3 shadow-m3 flex items-start gap-2.5">
 <AlertTriangle size={16} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
 <div className="font-mono text-xs text-ink">
 <span className="font-black uppercase">Service Notice: </span>
 Review Board orchestrator is not connected. Configure <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 font-bold">VITE_ORCHESTRATOR_URL</code> to dispatch audits to a live orchestrator daemon.
              </div>
            </div>
          )}

 <div className="mt-4 space-y-4">
            {/* Repo / File Target Input */}
            <div>
 <label htmlFor="repo-target-input" className="block font-mono text-xs font-black uppercase tracking-wider text-ink mb-1.5">
                Target Repository or Path
              </label>
 <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
 <div className="relative flex-1">
 <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">
                    <FolderGit2 size={14} />
                  </div>
                  <input
                    ref={inputRef}
 id="repo-target-input"
 type="text"
                    value={repoPath}
                    onChange={(e) => setRepoPath(e.target.value)}
 onKeyDown={(e) => e.key === "Enter" && !isStarting && handleStartAudit()}
 placeholder="e.g. /workspaces/forge-ai or github.com/user/repo"
 className="h-7 w-full border border-border bg-white dark:bg-[#1E1E28] pl-8 pr-3 font-mono text-xs font-bold text-ink placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-black shadow-m3"
                  />
                </div>
                <button
 type="button"
                  disabled={isStarting}
                  onClick={handleStartAudit}
 className="h-7 px-4 inline-flex items-center justify-center gap-1.5 border border-border bg-accent text-[#09090B] font-mono text-xs font-black uppercase tracking-wider text-black shadow-m3 hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 disabled:opacity-50 transition-all shrink-0"
                >
 <Play size={13} fill="currentColor" />
 {isStarting ? "Auditing..." : "Start Review"}
                </button>
              </div>

              {/* Quick suggestion chips */}
 <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
 <span className="font-mono text-[10px] font-black text-muted uppercase">Suggestions:</span>
                {SUGGESTED_TARGETS.map((target) => (
                  <button
                    key={target}
 type="button"
                    onClick={() => {
                      setRepoPath(target);
 if (target.includes("diff")) setMode("diff");
                    }}
 className="h-7 px-2 border border-border bg-white dark:bg-[#20202a] font-mono text-[10px] font-black uppercase text-ink hover:bg-accent text-[#09090B] hover:text-black shadow-m3 transition-colors inline-flex items-center"
                  >
                    {target}
                  </button>
                ))}
              </div>
            </div>

            {/* Diff editor when in diff mode */}
 {mode === "diff" && (
 <div className="border border-border bg-neutral-900 p-3.5 text-white shadow-m3">
 <div className="flex items-center justify-between mb-2">
 <span className="font-mono text-xs font-bold uppercase tracking-wider text-brutal-yellow flex items-center gap-1.5">
                    <GitPullRequest size={13} />
                    Unified Patch Diff Contents
                  </span>
                  <button
 type="button"
                    onClick={() => setDiffText(SAMPLE_DIFF_CODE)}
 className="h-7 px-2.5 border border-border bg-white font-mono text-[10px] font-black uppercase text-black hover:bg-info/20 text-info shadow-m3 transition-colors"
                  >
                    Load Test Vulnerability Diff
                  </button>
                </div>
                <textarea
                  value={diffText}
                  onChange={(e) => setDiffText(e.target.value)}
                  rows={6}
 placeholder="Paste git diff or patch (e.g. diff --git a/src/app.ts b/src/app.ts)..."
 className="w-full border-2 border-neutral-700 bg-neutral-950 p-2.5 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-brutal-yellow"
                />
              </div>
            )}

            {/* Multi-Agent Fleet Selection */}
            <div>
 <div className="flex items-center justify-between mb-2">
 <span className="font-mono text-xs font-black uppercase tracking-wider text-ink">
                  Select Autonomous Audit Fleet ({selectedAgents.length}/{AVAILABLE_AGENTS.length} active)
                </span>
 <div className="flex gap-1.5">
                  <button
 type="button"
                    onClick={() => setSelectedAgents(AVAILABLE_AGENTS.map((a) => a.id))}
 className="h-7 px-2.5 border border-border bg-white dark:bg-[#20202a] font-mono text-[10px] font-black uppercase shadow-m3 text-ink hover:bg-neutral-100 transition-colors"
                  >
                    Select All
                  </button>
                  <button
 type="button"
 onClick={() => setSelectedAgents(["security_agent"])}
 className="h-7 px-2.5 border border-border bg-white dark:bg-[#20202a] font-mono text-[10px] font-black uppercase shadow-m3 text-ink hover:bg-neutral-100 transition-colors"
                  >
                    Security Only
                  </button>
                </div>
              </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
                {AVAILABLE_AGENTS.map((agent) => {
                  const isChecked = selectedAgents.includes(agent.id);
                  const Icon = agent.icon;
                  return (
                    <button
                      key={agent.id}
 type="button"
                      onClick={() => toggleAgent(agent.id)}
                      className={`flex items-start gap-2 border border-border p-2.5 text-left transition-all ${
                        isChecked
                          ? `${agent.color} shadow-m3 text-black -translate-x-0.5 -translate-y-0.5`
 : "bg-white dark:bg-[#181820] opacity-70 hover:opacity-100 shadow-m3"
                      }`}
                    >
 <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-border bg-white text-black">
                        <Icon size={13} strokeWidth={2.5} />
                      </span>
 <div className="min-w-0 flex-1">
 <div className="font-mono text-xs font-black leading-tight text-ink">{agent.name}</div>
 <div className="mt-0.5 truncate font-mono text-[10px] font-bold text-black/75 dark:text-white/75">{agent.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* Review Library & Filters Section                          */}
        {/* ========================================================= */}
 <section className="space-y-4">
 <div className="border border-border bg-white dark:bg-[#181820] p-4 shadow-m3 ">
 <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              {/* Search input */}
 <div className="relative flex-1">
 <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
 type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
 placeholder="Search by repo path, run ID, or gate verdict..."
 className="h-7 w-full border border-border bg-white dark:bg-[#1E1E28] pl-8 pr-7 font-mono text-xs font-bold text-ink placeholder:text-neutral-400 focus:outline-none focus:ring-1 focus:ring-black shadow-m3"
                />
                {search && (
                  <button
 type="button"
 onClick={() => setSearch("")}
 className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-black"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
 <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
 { key: "all", label: "All" },
 { key: "active", label: "Running" },
 { key: "go", label: "GO (Passed)" },
 { key: "nogo", label: "NO_GO (Flagged)" },
 { key: "diff", label: "Diffs" },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.key}
 type="button"
                    onClick={() => setStatusFilter(f.key)}
                    className={`h-7 px-3 border border-border font-mono text-xs font-black uppercase transition-all ${
                      statusFilter === f.key
 ? "bg-black text-white shadow-m3 dark:bg-white dark:text-black "
 : "bg-white dark:bg-[#20202a] text-ink hover:bg-neutral-100 shadow-m3"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Sort & View Options */}
 <div className="flex items-center gap-2">
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
 className="h-7 border border-border bg-white dark:bg-[#1E1E28] px-2 font-mono text-xs font-black text-ink shadow-m3 focus:outline-none"
                >
 <option value="recent">Sort: Most Recent</option>
 <option value="score-desc">Sort: Highest Score</option>
 <option value="score-asc">Sort: Lowest Score</option>
 <option value="issues">Sort: Most Issues</option>
 <option value="name">Sort: Repo Name</option>
                </select>

 <div className="flex items-center gap-1">
                  <button
 type="button"
 onClick={() => setViewMode("grid")}
                    className={`h-7 w-7 border border-border flex items-center justify-center font-mono shadow-m3 ${
 viewMode === "grid"
 ? "bg-black text-white dark:bg-white dark:text-black"
 : "bg-white dark:bg-[#20202a] text-muted hover:text-ink"
                    }`}
 title="Grid View"
                  >
                    <LayoutGrid size={14} />
                  </button>
                  <button
 type="button"
 onClick={() => setViewMode("list")}
                    className={`h-7 w-7 border border-border flex items-center justify-center font-mono shadow-m3 ${
 viewMode === "list"
 ? "bg-black text-white dark:bg-white dark:text-black"
 : "bg-white dark:bg-[#20202a] text-muted hover:text-ink"
                    }`}
 title="Table / List View"
                  >
                    <List size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Items Render */}
          {loading ? (
 <div className="border border-border bg-white dark:bg-[#181820] p-12 text-center shadow-m3">
 <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-black border-t-brutal-yellow mb-3" />
 <div className="font-mono text-sm font-black text-ink">Scanning audit records...</div>
            </div>
          ) : LIVE_MODE && !isConfigured ? (
 <div className="border border-border bg-white dark:bg-[#181820] p-8 md:p-12 text-center shadow-m3 ">
 <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border border-border bg-accent text-[#09090B] text-black shadow-m3">
                <ShieldAlert size={28} strokeWidth={2.5} />
              </div>
 <h3 className="font-mono text-base md:text-lg font-black uppercase text-ink">
                Review Board service not configured
              </h3>
 <p className="mt-2 font-mono text-xs text-muted max-w-lg mx-auto leading-relaxed">
                Autonomous multi-agent code reviews, architectural analyses, and security gate audits belong here. The Review Board orchestrator service is currently unconfigured in this environment.
              </p>
 <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
 type="button"
                  onClick={() => {
                    setRuns(SAMPLE_REVIEWS);
 toast.success("Loaded demo review sample data for preview");
                  }}
 className="h-8 px-4 inline-flex items-center gap-2 border border-border bg-accent text-[#09090B] font-mono text-xs font-black uppercase text-black shadow-m3 hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all"
                >
                  <Sparkles size={13} />
                  Preview Demo Reviews
                </button>
              </div>
 <p className="mt-4 font-mono text-[11px] text-muted">
 To enable live orchestration audits, configure the <code className="border border-black/30 dark:border-white/30 bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 font-bold text-ink">VITE_ORCHESTRATOR_URL</code> environment variable.
              </p>
            </div>
          ) : filteredRuns.length === 0 ? (
 <div className="border border-border bg-white dark:bg-[#181820] p-12 text-center shadow-m3">
 <ShieldAlert size={36} className="mx-auto text-muted mb-3" />
 <h3 className="font-mono text-base font-black uppercase text-ink">No review audits match your filter</h3>
 <p className="mt-1 font-mono text-xs text-muted max-w-sm mx-auto">
                Try loosening your search query or launch a new audit with the workbench above.
              </p>
              <button
 type="button"
                onClick={() => {
 setSearch("");
 setStatusFilter("all");
                }}
 className="mt-4 h-7 px-3.5 inline-flex items-center gap-1.5 border border-border bg-accent text-[#09090B] font-mono text-xs font-black uppercase shadow-m3 transition-all"
              >
                Clear Filters
              </button>
            </div>
 ) : viewMode === "grid" ? (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRuns.map((run) => {
 const isGo = run.consolidated?.recommendation === "GO";
 const isNoGo = run.consolidated?.recommendation === "NO_GO";
 const isFixes = run.consolidated?.recommendation === "GO_WITH_FIXES";
 const isRunning = run.status === "running" || run.status === "consolidating";

                const badgeBg = isGo
 ? "bg-ok/20 text-ok text-black"
                  : isNoGo
 ? "bg-error/20 text-error text-black"
                  : isFixes
 ? "bg-accent text-[#09090B] text-black"
 : "bg-info/20 text-info text-black";

 const score = run.consolidated?.overall_score ?? (isRunning ? "..." : "N/A");

                return (
                  <div
                    key={run.run_id}
                    onClick={() => navigate(`/reviews/${run.run_id}`)}
 onKeyDown={(e) => e.key === "Enter" && navigate(`/reviews/${run.run_id}`)}
 role="button"
                    tabIndex={0}
 className="flex flex-col justify-between border border-border bg-white dark:bg-[#181820] p-5 shadow-m3 hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all cursor-pointer group text-left"
                  >
                    <div>
                      {/* Top Bar */}
 <div className="flex items-center justify-between gap-2 border-b-2 border-black dark:border-white/80 pb-3">
 <div className="flex items-center gap-2">
                          <span
                            className={`border border-border px-2 py-0.5 font-mono text-[10px] font-black uppercase shadow-m3 ${badgeBg}`}
                          >
                            {run.consolidated?.recommendation || run.status}
                          </span>
 <span className="border border-border bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] font-black uppercase text-muted">
                            {run.mode}
                          </span>
                        </div>
 <span className="font-mono text-[11px] text-muted flex items-center gap-1 font-bold">
                          <Clock size={12} />
                          {formatRelativeTime(run.created_at)}
                        </span>
                      </div>

                      {/* Main Title & Path */}
 <div className="mt-3">
 <div className="flex items-start gap-2">
 <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border border-border bg-accent text-[#09090B] text-black shadow-m3">
 {run.mode === "diff" ? <GitPullRequest size={11} /> : <FolderGit2 size={11} />}
                          </span>
 <div className="min-w-0">
 <h3 className="font-mono text-sm font-black text-ink truncate group-hover:text-brutal-orange transition-colors">
                              {run.repo_path}
                            </h3>
 <div className="font-mono text-[11px] text-muted truncate">ID: {run.run_id}</div>
                          </div>
                        </div>

                        {/* Recommendation Note */}
                        {run.consolidated?.summary && (
 <p className="mt-3 font-mono text-xs text-muted line-clamp-2 leading-relaxed bg-neutral-50 dark:bg-neutral-900 p-2 border-2 border-neutral-200 dark:border-neutral-800">
                            {run.consolidated.summary}
                          </p>
                        )}
                      </div>

                      {/* Quality Score Bar */}
 <div className="mt-4 border border-border bg-neutral-100 dark:bg-neutral-800/80 p-2.5 shadow-m3">
 <div className="flex items-center justify-between font-mono text-xs">
 <span className="font-black text-muted uppercase">Audit Score</span>
 <span className="font-black text-ink text-sm">
                            {score}
 {typeof score === "number" ? "/100" : ""}
                          </span>
                        </div>
 {typeof score === "number" && (
 <div className="mt-1.5 h-2 w-full overflow-hidden border border-black bg-white">
                            <div
                              className={`h-full ${
 score >= 85 ? "bg-ok/20 text-ok" : score >= 70 ? "bg-accent text-[#09090B]" : "bg-error/20 text-error"
                              }`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Triggered Agents Pills */}
 <div className="mt-3 flex flex-wrap gap-1">
                        {run.triggered_agents.map((agentId) => (
                          <span
                            key={agentId}
 className="border border-border bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] font-black text-ink"
                          >
 {agentId.replace("_agent", "")}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Card Footer Actions */}
 <div className="mt-5 pt-3 border-t-2 border-black dark:border-white/80 flex items-center justify-between">
 <div className="flex items-center gap-1.5 font-mono text-xs font-black">
 <ShieldAlert size={14} className={run.backlog?.length ? "text-error" : "text-ok"} />
                        <span>
 {run.backlog?.length ?? 0} {run.backlog?.length === 1 ? "issue" : "issues"}
                        </span>
                      </div>

 <div className="flex items-center gap-1.5">
                        {run.backlog && run.backlog.length > 0 && (
                          <button
 type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveBacklogModal(run);
                            }}
 className="h-7 px-2.5 border border-border bg-white dark:bg-[#20202a] font-mono text-[11px] font-black uppercase text-ink hover:bg-accent text-[#09090B] hover:text-black shadow-m3 active:translate-x-[1px] active:translate-y-[1px] transition-all"
                          >
                            Quick Backlog
                          </button>
                        )}
                        <button
 type="button"
                          onClick={(e) => handleDeleteRun(e, run.run_id)}
 className="h-7 w-7 border border-border bg-white dark:bg-[#20202a] flex items-center justify-center font-mono text-muted hover:text-error hover:border-error shadow-m3 transition-colors"
 title="Delete record"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Dense Table / List View */
 <div className="overflow-x-auto border border-border bg-white dark:bg-[#181820] shadow-m3 ">
 <table className="w-full text-left font-mono text-xs">
 <thead className="border-b-3 border-black dark:border-white/90 bg-neutral-100 dark:bg-[#121218] text-ink uppercase tracking-wider font-mono font-black">
                  <tr>
 <th className="px-4 py-3">Audit ID / Time</th>
 <th className="px-4 py-3">Target Repository</th>
 <th className="px-4 py-3">Mode</th>
 <th className="px-4 py-3">Gate Verdict</th>
 <th className="px-4 py-3">Score</th>
 <th className="px-4 py-3">Issues</th>
 <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
 <tbody className="divide-y-2 divide-black dark:divide-white/80">
                  {filteredRuns.map((run) => {
 const isGo = run.consolidated?.recommendation === "GO";
 const isNoGo = run.consolidated?.recommendation === "NO_GO";
 const isFixes = run.consolidated?.recommendation === "GO_WITH_FIXES";
                    const badgeBg = isGo
 ? "bg-ok/20 text-ok text-black"
                      : isNoGo
 ? "bg-error/20 text-error text-black"
                      : isFixes
 ? "bg-accent text-[#09090B] text-black"
 : "bg-info/20 text-info text-black";

 const score = run.consolidated?.overall_score ?? (run.status === "running" ? "..." : "—");

                    return (
                      <tr
                        key={run.run_id}
                        onClick={() => navigate(`/reviews/${run.run_id}`)}
 className="hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer transition-colors"
                      >
 <td className="px-4 py-3 font-black text-ink">
                          <div>{run.run_id}</div>
 <div className="text-[10px] text-muted font-normal">{formatRelativeTime(run.created_at)}</div>
                        </td>
 <td className="px-4 py-3 font-black text-ink max-w-[240px] truncate">
 <div className="flex items-center gap-1.5">
 {run.mode === "diff" ? <GitPullRequest size={13} /> : <FolderGit2 size={13} />}
 <span className="truncate">{run.repo_path}</span>
                          </div>
                        </td>
 <td className="px-4 py-3 font-black uppercase text-muted">{run.mode}</td>
 <td className="px-4 py-3">
                          <span
                            className={`border border-border px-2 py-0.5 font-mono font-black uppercase text-[10px] shadow-m3 ${badgeBg}`}
                          >
                            {run.consolidated?.recommendation || run.status}
                          </span>
                        </td>
 <td className="px-4 py-3 font-black text-ink">
                          {score}
 {typeof score === "number" ? "/100" : ""}
                        </td>
 <td className="px-4 py-3 font-black">
                          <span
                            className={
 (run.backlog?.length ?? 0) > 0 ? "text-error font-black" : "text-muted font-normal"
                            }
                          >
                            {run.backlog?.length ?? 0}
                          </span>
                        </td>
 <td className="px-4 py-3 text-right">
 <div className="flex items-center justify-end gap-1.5">
                            <button
 type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/reviews/${run.run_id}`);
                              }}
 className="h-7 px-2.5 border border-border bg-accent text-[#09090B] font-mono font-black uppercase text-[11px] text-black shadow-m3 hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all"
                            >
                              Inspect
                            </button>
                            <button
 type="button"
                              onClick={(e) => handleDeleteRun(e, run.run_id)}
 className="h-7 w-7 border border-border bg-white dark:bg-[#20202a] flex items-center justify-center font-mono text-muted hover:text-error hover:border-error shadow-m3 transition-colors"
 title="Delete run"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* ========================================================= */}
      {/* Quick Backlog Modal                                       */}
      {/* ========================================================= */}
      <AnimatePresence>
        {activeBacklogModal && (
 <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ duration: 0.18 }}
 className="w-full max-w-2xl border border-border bg-white dark:bg-[#181820] p-6 shadow-m3 max-h-[85vh] flex flex-col font-mono"
            >
 <div className="flex items-start justify-between border-b-2 border-black dark:border-white/80 pb-3">
                <div>
 <div className="flex items-center gap-2">
 <span className="border border-border bg-accent text-[#09090B] px-2 py-0.5 font-mono text-xs font-black uppercase shadow-m3 text-black">
                      Backlog
                    </span>
 <h3 className="font-mono text-base font-black text-ink">{activeBacklogModal.repo_path}</h3>
                  </div>
 <div className="mt-1 font-mono text-xs text-muted">
 Run: {activeBacklogModal.run_id} · Gate Verdict:{" "}
 <strong>{activeBacklogModal.consolidated?.recommendation || "PENDING"}</strong> (Score{" "}
 {activeBacklogModal.consolidated?.overall_score ?? "N/A"}/100)
                  </div>
                </div>
                <button
 type="button"
                  onClick={() => setActiveBacklogModal(null)}
 className="h-7 w-7 border border-border bg-white dark:bg-[#20202a] flex items-center justify-center text-black dark:text-white shadow-m3 hover:bg-neutral-100 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

 <div className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1">
                {activeBacklogModal.backlog.length === 0 ? (
 <div className="p-8 text-center font-mono text-xs text-muted">
                    No backlog issues recorded for this audit.
                  </div>
                ) : (
                  activeBacklogModal.backlog.map((item) => {
                    const sevColor =
 item.severity === "critical"
 ? "bg-error/20 text-error text-black"
 : item.severity === "high"
 ? "bg-warn/20 text-warn text-black"
 : item.severity === "medium"
 ? "bg-accent text-[#09090B] text-black"
 : "bg-neutral-200 text-black";

                    return (
 <div key={item.id} className="border border-border bg-neutral-50 dark:bg-neutral-900 p-3.5 space-y-2 shadow-m3">
 <div className="flex items-center justify-between">
                          <span
                            className={`border border-border px-2 py-0.5 font-mono text-[10px] font-black uppercase shadow-m3 ${sevColor}`}
                          >
                            {item.severity}
                          </span>
 <div className="font-mono text-[10px] font-bold text-muted">
                            Impact: {item.impact}/10 · Effort: {item.effort}
                          </div>
                        </div>
 <h4 className="font-mono text-xs font-black text-ink">{item.title}</h4>
 <p className="font-mono text-xs text-muted leading-relaxed">{item.description}</p>
                        {item.fix && (
 <div className="border border-border bg-white dark:bg-black p-2 text-xs font-mono text-neutral-800 dark:text-neutral-200">
 <span className="font-black text-brutal-orange">Suggested Fix: </span>
                            {item.fix}
                          </div>
                        )}
                        {item.files.length > 0 && (
 <div className="font-mono text-[10px] text-muted truncate">
 Files: {item.files.join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

 <div className="mt-4 pt-3 border-t-2 border-black dark:border-white/80 flex items-center justify-between">
                <button
 type="button"
                  onClick={() => {
                    const json = JSON.stringify(activeBacklogModal.backlog, null, 2);
                    navigator.clipboard.writeText(json);
 toast.success("Backlog JSON copied to clipboard");
                  }}
 className="h-7 px-3 inline-flex items-center gap-1.5 border border-border bg-white dark:bg-[#20202a] font-mono text-xs font-black uppercase text-ink shadow-m3 hover:bg-neutral-100 active:translate-x-[1px] active:translate-y-[1px] transition-all"
                >
                  <Copy size={12} />
                  Copy JSON
                </button>
                <button
 type="button"
                  onClick={() => {
                    const id = activeBacklogModal.run_id;
                    setActiveBacklogModal(null);
                    navigate(`/reviews/${id}`);
                  }}
 className="h-7 px-3.5 inline-flex items-center gap-1.5 border border-border bg-accent text-[#09090B] font-mono text-xs font-black uppercase text-black shadow-m3 hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all"
                >
                  Open Full Audit Page
                  <ExternalLink size={12} />
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
