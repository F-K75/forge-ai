import { useEffect, useState, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  Files,
  Bot as BotIcon,
  Zap,
  DollarSign,
  ListChecks,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Clock,
  Search,
  Check,
  RefreshCw,
} from "lucide-react";
import BrandLogo from "../../components/BrandLogo";
import { reviewsApi } from "../../lib/orchestratorApi";
import { useReviewSocket } from "../../hooks/useReviewSocket";
import { useReviewStore } from "../../store/reviewStore";
import { findReviewById, type BacklogItem, type ReviewRunDetails } from "../../lib/reviewsData";
import { LIVE_MODE } from "../../lib/env";

const SEVERITY_STYLES: Record<BacklogItem["severity"], { bg: string; text: string }> = {
 critical: { bg: "bg-error/20 text-error", text: "text-ink" },
 high: { bg: "bg-warn/20 text-warn", text: "text-ink" },
 medium: { bg: "bg-ink text-on-ink", text: "text-on-ink" },
 low: { bg: "bg-surface-high", text: "text-ink" },
};

const TERMINAL_STATUSES = new Set(["complete", "failed"]);

export default function ReviewDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const [hydrated, setHydrated] = useState(false);
  const [backlog, setBacklog] = useState<BacklogItem[] | null>(null);
  const [backlogTotal, setBacklogTotal] = useState<number | null>(null);
 const [sortBy, setSortBy] = useState<"severity" | "impact">("severity");
 const [severityFilter, setSeverityFilter] = useState<string>("all");
 const [searchQuery, setSearchQuery] = useState("");
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [fallbackData, setFallbackData] = useState<ReviewRunDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const {
    hydrateFromRun,
    reset,
    status,
    mode,
    candidateFiles,
    triggeredAgents,
    agentStates,
    overallScore,
    recommendation,
    backlogCount,
    totalCostUsd,
    totalTokens,
  } = useReviewStore();

 const isConfigured = typeof reviewsApi.isConfigured === "function"
    ? reviewsApi.isConfigured()
    : true;

  useEffect(() => {
    if (!runId) return;
    reset();
    setHydrated(false);
    setLoadError(null);

    if (!isConfigured) {
      if (LIVE_MODE) {
        setLoadError(
 "Review Board service not configured (missing VITE_ORCHESTRATOR_URL). Multi-agent audit details will appear here once connected."
        );
        setHydrated(true);
        return;
      }
      // Demo mode: fall back to local stored/sample review data without hitting API
      const local = findReviewById(runId);
      if (local) {
        setFallbackData(local);
        hydrateFromRun({
          run_id: local.run_id,
          status: local.status,
          mode: local.mode,
          candidate_files: local.candidate_files,
          triggered_agents: local.triggered_agents,
          agent_reports: local.agent_reports,
          consolidated: local.consolidated,
          total_cost_usd: local.total_cost_usd,
          total_tokens: local.total_tokens,
        });
        setBacklog(local.backlog);
        setBacklogTotal(local.backlog.length);
      } else {
 toast.error("Could not find review run. Displaying template.");
      }
      setHydrated(true);
      return;
    }

    // Attempt to load from API
    reviewsApi
      .get(runId)
      .then((run) => {
        hydrateFromRun(run);
        setHydrated(true);
      })
      .catch((err: any) => {
        if (LIVE_MODE) {
          // Never substitute sample audit results for a real run.
          setLoadError(
            err?.response?.status === 404
 ? "This review run doesn't exist."
 : "The review service is unreachable, so this review can't be shown."
          );
          setHydrated(true);
          return;
        }
        // Demo mode: fall back to local stored/sample review data
        const local = findReviewById(runId);
        if (local) {
          setFallbackData(local);
          hydrateFromRun({
            run_id: local.run_id,
            status: local.status,
            mode: local.mode,
            candidate_files: local.candidate_files,
            triggered_agents: local.triggered_agents,
            agent_reports: local.agent_reports,
            consolidated: local.consolidated,
            total_cost_usd: local.total_cost_usd,
            total_tokens: local.total_tokens,
          });
          setBacklog(local.backlog);
          setBacklogTotal(local.backlog.length);
        } else {
 toast.error("Could not find review run. Displaying template.");
        }
        setHydrated(true);
      });
  }, [runId, reset, hydrateFromRun, isConfigured]);

  const socketEnabled = isConfigured && hydrated && runId && !TERMINAL_STATUSES.has(status);
  useReviewSocket(socketEnabled ? runId! : null);

  useEffect(() => {
 if (!runId || status !== "complete") return;
    if (fallbackData || !isConfigured) {
      // In fallback mode or when unconfigured, backlog is already handled
      return;
    }
    reviewsApi
      .backlog(runId, sortBy)
      .then((data) => {
        setBacklog(data.items);
        setBacklogTotal(data.count);
      })
      .catch(() => {
        if (LIVE_MODE) {
          setBacklog([]);
          setBacklogTotal(0);
 toast.error("Couldn't load this review's backlog.");
          return;
        }
        const local = findReviewById(runId);
        if (local) {
          setBacklog(local.backlog);
          setBacklogTotal(local.backlog.length);
        }
      });
  }, [runId, status, sortBy, fallbackData, isConfigured]);

  // Copy remediation fix
  const handleCopyFix = (itemId: string, fixText: string) => {
    navigator.clipboard.writeText(fixText);
    setCopiedItemId(itemId);
 toast.success("Fix snippet copied to clipboard");
    setTimeout(() => setCopiedItemId(null), 2000);
  };

  // Export backlog as Markdown
  const handleExportMarkdown = () => {
    if (!backlog || backlog.length === 0) return;
    const lines = [
      `# Audit Backlog: ${runId}`,
      `Generated on ${new Date().toLocaleString()}`,
 `Score: ${overallScore ?? "N/A"}/100 | Verdict: ${recommendation || "PENDING"}`,
 "",
 "## Issues Detected",
 "",
    ];

    backlog.forEach((item, idx) => {
      lines.push(`### ${idx + 1}. [${item.severity.toUpperCase()}] ${item.title}`);
      lines.push(`- **Impact**: ${item.impact}/10 | **Effort**: ${item.effort}`);
 lines.push(`- **Files**: ${item.files.join(", ")}`);
      lines.push(`- **Description**: ${item.description}`);
      lines.push(`- **Remediation**: \`${item.fix}\``);
 lines.push("");
    });

 const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
 const a = document.createElement("a");
    a.href = url;
    a.download = `audit-backlog-${runId}.md`;
    a.click();
    URL.revokeObjectURL(url);
 toast.success("Markdown report downloaded");
  };

  // Filtered and sorted backlog
  const visibleBacklog = useMemo(() => {
    if (!backlog) return [];
    let items = [...backlog];

 if (severityFilter !== "all") {
      items = items.filter((i) => i.severity === severityFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.files.some((f) => f.toLowerCase().includes(q))
      );
    }

 if (sortBy === "severity") {
      const order = { critical: 4, high: 3, medium: 2, low: 1 };
      items.sort((a, b) => (order[b.severity] || 0) - (order[a.severity] || 0));
 } else if (sortBy === "impact") {
      items.sort((a, b) => b.impact - a.impact);
    }

    return items;
  }, [backlog, severityFilter, searchQuery, sortBy]);

  if (!hydrated) {
    return (
 <div className="flex h-full items-center justify-center p-8 bg-panel text-sm font-medium text-ink">
 <div className="inline-block h-6 w-6 animate-spin border rounded-lg border-border border-t-brutal-yellow mr-3" />
        HYDRATING AUDIT RUN TELEMETRY...
      </div>
    );
  }

 const isGo = recommendation === "GO";
 const isNoGo = recommendation === "NO_GO";
 const isFixes = recommendation === "GO_WITH_FIXES";
 const isRunning = status === "running" || status === "consolidating";

  const bannerColor = isGo
 ? "bg-ok/20 text-ok text-ink"
    : isNoGo
 ? "bg-error/20 text-error text-ink"
    : isFixes
 ? "bg-ink text-on-ink text-on-ink"
 : "bg-info/20 text-info text-ink";

 const repoTarget = fallbackData?.repo_path || "Target Repository";

  if (loadError) {
    const isUnconfigured = !isConfigured && LIVE_MODE;
    return (
 <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
 <div className="border rounded-xl border-border bg-panel p-8 max-w-lg shadow-m3 ">
 <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center border rounded-lg border-border bg-ink text-on-ink text-on-ink shadow-m3">
            <ShieldAlert size={28} strokeWidth={2.5} />
          </div>
 <h1 className="text-lg font-semibold text-ink">
 {isUnconfigured ? "Review Board service not configured" : "Review unavailable"}
          </h1>
 <p className="mt-2 text-xs text-muted leading-relaxed">{loadError}</p>
 <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
 to="/reviews"
 className="h-8 px-4 inline-flex items-center justify-center border rounded-pill border-border bg-ink text-on-ink text-xs font-medium text-on-ink shadow-m3 hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all"
            >
              Back to reviews
            </Link>
          </div>
          {isUnconfigured && (
 <p className="mt-4 text-[11px] text-muted">
 To view live audit reports, configure the <code className="border rounded-lg border-border bg-panel-alt px-1.5 py-0.5 font-semibold text-ink">VITE_ORCHESTRATOR_URL</code> environment variable.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
 <div className="relative flex h-full min-h-0 flex-col overflow-y-auto bg-panel p-4 md:p-8">
 <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Navigation Breadcrumb */}
 <div className="flex items-center justify-between">
          <Link
 to="/reviews"
 className="h-7 inline-flex items-center gap-2 border rounded-pill border-border bg-panel px-3 text-xs font-medium text-ink shadow-m3 hover:bg-ink/5 hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 transition-all"
          >
            <ArrowLeft size={13} />
            Back to Reviews
          </Link>

 <div className="flex items-center gap-2 text-xs text-muted">
            <Clock size={13} />
 <span>Mode: {mode?.toUpperCase() ?? "FULL"}</span>
          </div>
        </div>

        {/* Top Header Card */}
 <header className="border rounded-xl border-border bg-panel p-6 shadow-m3 ">
 <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
 <div className="space-y-1">
 <div className="flex items-center gap-2.5">
 <span className="flex h-7 w-7 items-center justify-center border rounded-lg border-border bg-ink text-on-ink text-on-ink shadow-m3">
 <BrandLogo size="xs" />
                </span>
 <span className="text-xs text-muted">
                  Audit Snapshot Report
                </span>
              </div>
 <h1 className=" text-xl font-semibold text-ink md:text-2xl break-all">
                {repoTarget}
              </h1>
 <div className="flex items-center gap-2 text-xs text-muted">
 <span>Run ID:</span>
 <code className="border rounded-lg border-border bg-panel-alt px-2 py-0.5 font-mono text-ink shadow-m3">
                  {runId}
                </code>
              </div>
            </div>

 <div className="flex flex-wrap items-center gap-2">
              <span
                className={`border rounded-pill border-border px-3 py-1 text-xs font-medium shadow-m3 ${
 status === "complete"
 ? "bg-ok/20 text-ok text-ink"
 : status === "failed"
 ? "bg-error/20 text-error text-ink"
 : "bg-info/20 text-info text-ink"
                }`}
              >
                Status: {status}
              </span>
            </div>
          </div>

          {/* Verdict Banner */}
          <div className={`mt-5 flex items-center gap-3 border rounded-xl border-border p-4 shadow-m3 ${bannerColor}`}>
            {isGo ? (
 <CheckCircle2 size={24} strokeWidth={2.5} className="shrink-0" />
            ) : isNoGo ? (
 <ShieldAlert size={24} strokeWidth={2.5} className="shrink-0" />
            ) : isFixes ? (
 <AlertTriangle size={24} strokeWidth={2.5} className="shrink-0" />
            ) : isRunning ? (
 <RefreshCw size={24} strokeWidth={2.5} className="shrink-0 animate-spin" />
            ) : (
 <ShieldCheck size={24} strokeWidth={2.5} className="shrink-0" />
            )}
 <div className="min-w-0">
 <div className="text-sm font-medium">
                {isGo
 ? "GATE VERDICT: GO — PRODUCTION RELEASE APPROVED"
                  : isNoGo
 ? "GATE VERDICT: NO_GO — BLOCKING SECURITY/QUALITY FLAGS"
                  : isFixes
 ? "GATE VERDICT: GO_WITH_FIXES — CONDITIONAL PASS"
 : "AUDIT IN PROGRESS — EXECUTING AGENT AST PIPELINES"}
              </div>
 <div className="mt-0.5 text-xs opacity-90 leading-relaxed">
                {fallbackData?.consolidated?.summary ||
                  (isGo
 ? "Code snapshot passed all static checks, vulnerability scanning, and complexity limits."
                    : isNoGo
 ? "High severity or critical vulnerabilities detected. Immediate remediation required."
 : "Warnings flagged. Review items before triggering final deployment.")}
              </div>
            </div>
          </div>
        </header>

        {/* Telemetry Metric Grid */}
 <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
 <div className="border rounded-lg border-border bg-panel p-3.5 shadow-m3 ">
 <div className="flex items-center gap-1.5 text-muted text-caption">
              <ShieldCheck size={13} />
              Overall Score
            </div>
 <div className="mt-1 font-mono tabular-nums text-2xl font-medium text-ink">
 {overallScore !== null ? `${overallScore}/100` : "—"}
            </div>
          </div>

 <div className="border rounded-lg border-border bg-panel p-3.5 shadow-m3 ">
 <div className="flex items-center gap-1.5 text-muted text-caption">
              <Files size={13} />
              Candidate Files
            </div>
 <div className="mt-1 font-mono tabular-nums text-2xl font-medium text-ink">{candidateFiles}</div>
          </div>

 <div className="border rounded-lg border-border bg-panel p-3.5 shadow-m3 ">
 <div className="flex items-center gap-1.5 text-muted text-caption">
              <BotIcon size={13} />
              Agents Active
            </div>
 <div className="mt-1 font-mono tabular-nums text-2xl font-medium text-ink">{triggeredAgents.length}</div>
          </div>

 <div className="border rounded-lg border-border bg-panel p-3.5 shadow-m3 ">
 <div className="flex items-center gap-1.5 text-muted text-caption">
              <ListChecks size={13} />
              Backlog Items
            </div>
 <div className="mt-1 font-mono tabular-nums text-2xl font-medium text-ink">
 {(backlogCount ?? backlogTotal) !== null ? (backlogCount ?? backlogTotal) : "0"}
            </div>
          </div>

 <div className="border rounded-lg border-border bg-panel p-3.5 shadow-m3 ">
 <div className="flex items-center gap-1.5 text-muted text-caption">
              <DollarSign size={13} />
              Audit Cost
            </div>
 <div className="mt-1 font-mono tabular-nums text-2xl font-medium text-ink">${totalCostUsd.toFixed(4)}</div>
          </div>

 <div className="border rounded-lg border-border bg-panel p-3.5 shadow-m3 ">
 <div className="flex items-center gap-1.5 text-muted text-caption">
              <Zap size={13} />
              Tokens Used
            </div>
 <div className="mt-1 font-mono tabular-nums text-2xl font-medium text-ink">{totalTokens.toLocaleString()}</div>
          </div>
        </section>

        {/* Multi-Agent Execution Board */}
 <section className="border rounded-xl border-border bg-panel p-6 shadow-m3 ">
 <div className="flex items-center justify-between border-b-2 border-border pb-3">
 <div className="flex items-center gap-2">
 <span className="flex h-6 w-6 items-center justify-center border rounded-lg border-border bg-info/20 text-info text-ink shadow-m3 text-xs font-semibold">
                @
              </span>
 <h2 className=" text-base font-semibold text-ink">
                Autonomous Review Fleet Status
              </h2>
            </div>
 <span className="text-xs text-muted">
              <span className="font-mono tabular-nums">{triggeredAgents.length}</span> specialized subagents deployed
            </span>
          </div>

 <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {triggeredAgents.map((agentId) => {
              const state = agentStates[agentId];
 const isDone = state?.status === "done";
 const isFailed = state?.status === "failed";
 const isActive = state?.status === "active";

 const humanName = agentId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              const issues = state?.issues ?? 0;
              const score = state?.score;

 let iconBg = "bg-ink text-on-ink";
 if (agentId.includes("security")) iconBg = "bg-error/20 text-error";
 else if (agentId.includes("performance")) iconBg = "bg-info/20 text-info";
 else if (agentId.includes("architecture")) iconBg = "bg-accent/20 text-accent";
 else if (agentId.includes("quality")) iconBg = "bg-warn/20 text-warn";

              return (
                <div
                  key={agentId}
 className="border rounded-lg border-border bg-panel p-3.5 shadow-m3 space-y-2"
                >
 <div className="flex items-center justify-between">
                    <span
                      className={`flex h-7 w-7 items-center justify-center border rounded-lg border-border ${iconBg} text-ink text-xs font-semibold shadow-m3`}
                    >
                      <BotIcon size={14} />
                    </span>
                    <span
                      className={`border rounded-pill border-border px-2 py-0.5 text-[11px] font-medium capitalize shadow-m3 ${
                        isDone
 ? "bg-ok/20 text-ok text-ink"
                          : isFailed
 ? "bg-error/20 text-error text-ink"
                          : isActive
 ? "bg-info/20 text-info text-ink animate-pulse"
 : "bg-surface-high text-ink"
                      }`}
                    >
 {state?.status ?? "idle"}
                    </span>
                  </div>

                  <div>
 <h4 className=" text-xs font-semibold text-ink truncate">{humanName}</h4>
 <div className="text-[11px] text-muted">
 Issues flagged: <span className="font-mono tabular-nums text-ink">{issues}</span>
                    </div>
                  </div>

                  {score !== undefined && score !== null && (
 <div className="pt-2 border-t border-border-soft flex items-center justify-between text-xs">
 <span className="text-muted">Agent Score:</span>
 <span className="font-mono tabular-nums text-ink">{score}/100</span>
                    </div>
                  )}

                  {state?.error && (
 <div className="text-[11px] text-error truncate">{state.error}</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Prioritized Backlog Section */}
 <section className="border rounded-xl border-border bg-panel p-6 shadow-m3 space-y-4">
 <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b-2 border-border pb-4">
            <div>
 <div className="flex items-center gap-2">
 <span className="flex h-6 w-6 items-center justify-center border rounded-lg border-border bg-error/20 text-error text-ink shadow-m3 text-xs font-semibold">
                  !
                </span>
 <h2 className=" text-base font-semibold text-ink">
                  Prioritized Remediation Backlog ({visibleBacklog.length} items)
                </h2>
              </div>
 <p className="mt-0.5 text-xs text-muted">
                Actionable findings ranked by security risk, architectural impact, and effort.
              </p>
            </div>

 <div className="flex flex-wrap items-center gap-2">
              <button
 type="button"
                onClick={handleExportMarkdown}
                disabled={!backlog || backlog.length === 0}
 className="h-7 inline-flex items-center gap-1.5 border rounded-pill border-border bg-panel px-3 text-xs font-medium shadow-m3 hover:bg-ink/5 transition-all disabled:opacity-50"
              >
                <Download size={13} />
                Export Markdown
              </button>
            </div>
          </div>

          {/* Backlog Filters & Search */}
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex flex-wrap items-center gap-1.5">
 {(["all", "critical", "high", "medium", "low"] as const).map((sev) => (
                <button
                  key={sev}
 type="button"
                  onClick={() => setSeverityFilter(sev)}
                  className={`h-7 px-2.5 border rounded-pill border-border text-[11px] font-medium transition-all ${
                    severityFilter === sev
 ? "bg-ink text-on-ink shadow-m3 "
 : "bg-panel text-ink hover:bg-ink/5 shadow-m3"
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>

 <div className="flex items-center gap-2">
 <div className="relative flex-1 sm:w-48">
 <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <input
 type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
 placeholder="Filter issues..."
 className="h-7 w-full border border-border bg-panel pl-8 pr-2 text-xs text-ink placeholder:text-faint focus:outline-none shadow-m3"
                />
              </div>

 <div className="flex items-center gap-1">
                <button
 type="button"
 onClick={() => setSortBy("severity")}
                  className={`h-7 px-2.5 border rounded-pill border-border text-[11px] font-medium shadow-m3 ${
 sortBy === "severity"
 ? "bg-ink text-on-ink "
 : "bg-panel text-muted hover:text-ink"
                  }`}
                >
                  Severity
                </button>
                <button
 type="button"
 onClick={() => setSortBy("impact")}
                  className={`h-7 px-2.5 border rounded-pill border-border text-[11px] font-medium shadow-m3 ${
 sortBy === "impact"
 ? "bg-ink text-on-ink "
 : "bg-panel text-muted hover:text-ink"
                  }`}
                >
                  Impact
                </button>
              </div>
            </div>
          </div>

          {/* Issue Cards */}
          {visibleBacklog.length === 0 ? (
 <div className="border rounded-xl border-border bg-panel p-8 text-center shadow-m3">
 <CheckCircle2 size={32} className="mx-auto text-ok mb-2" />
 <div className="text-sm font-medium text-ink">No unresolved issues in this filter view.</div>
 <p className="mt-1 text-xs text-muted">All checks in this category are compliant.</p>
            </div>
          ) : (
 <div className="space-y-3">
              {visibleBacklog.map((item) => {
                const style = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.low;
                const isCopied = copiedItemId === item.id;

                return (
                  <div
                    key={item.id}
 className="border rounded-xl border-border bg-panel p-4 shadow-m3 transition-all space-y-3"
                  >
                    {/* Top line with badges */}
 <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border pb-2.5">
 <div className="flex items-center gap-2">
                        <span
                          className={`border rounded-pill border-border px-2 py-0.5 text-[11px] font-medium capitalize shadow-m3 ${style.bg} ${style.text}`}
                        >
                          {item.severity}
                        </span>
 <span className="text-[11px] text-muted">
                          Impact: <span className="font-mono tabular-nums text-ink">{item.impact}/10</span>
                        </span>
 <span className="text-[11px] text-muted">
                          Effort: <span className="font-mono tabular-nums text-ink">{item.effort}</span>
                        </span>
                      </div>

 <div className="font-mono text-[11px] text-muted">ID: {item.id}</div>
                    </div>

                    {/* Title & Description */}
                    <div>
 <h3 className=" text-sm font-semibold text-ink">{item.title}</h3>
 <p className="mt-1 text-xs text-muted leading-relaxed">{item.description}</p>
                    </div>

                    {/* Proposed Fix Box */}
                    {item.fix && (
 <div className="border rounded-lg border-border bg-ink text-on-ink p-3 shadow-m3">
 <div className="flex items-center justify-between mb-1.5">
 <span className="text-xs font-medium text-warn">
                            Proposed Remediation:
                          </span>
                          <button
 type="button"
                            onClick={() => handleCopyFix(item.id, item.fix)}
 className="h-7 px-2 inline-flex items-center gap-1 border rounded-pill border-border bg-panel text-xs font-medium text-ink shadow-m3 hover:bg-ink/5 transition-colors"
                          >
 {isCopied ? <Check size={11} className="text-ok" /> : <Copy size={11} />}
 {isCopied ? "Copied" : "Copy Fix"}
                          </button>
                        </div>
 <code className="block font-mono text-xs text-muted break-all bg-ink p-2 border border-border">
                          {item.fix}
                        </code>
                      </div>
                    )}

                    {/* Affected Files */}
                    {item.files && item.files.length > 0 && (
 <div className="flex items-center gap-1.5 text-[11px] text-muted">
 <span className="text-muted">Affected files:</span>
 <div className="flex flex-wrap gap-1">
                          {item.files.map((file) => (
                            <span
                              key={file}
 className="border rounded-lg border-border bg-panel-alt px-1.5 py-0.5 font-mono text-[11px] text-ink"
                            >
                              {file}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
