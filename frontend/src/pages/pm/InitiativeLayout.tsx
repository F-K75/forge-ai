import { useEffect, useState } from "react";
import { NavLink, Outlet, useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RefreshCw, Loader2, Rocket, ArrowLeft, AlertTriangle, Download } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { usePMSocket } from "../../hooks/usePMSocket";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";
import { captureEvent } from "../../lib/analytics";
import { motion, motionVariants } from "../../lib/animations";
import { presets } from "../../lib/animationPresets";

const TABS = [
  { to: "", label: "Overview", end: true, icon: Rocket },
  { to: "board", label: "Board", icon: () => null },
  { to: "sprints", label: "Sprints", icon: () => null },
  { to: "agent-runs", label: "Agent runs", icon: () => null },
  { to: "roadmap", label: "Roadmap", icon: () => null },
  { to: "graph", label: "Graph", icon: () => null },
  { to: "releases", label: "Releases", icon: () => null },
  { to: "activity", label: "Activity", icon: () => null },
];

export default function InitiativeLayout() {
  const { initiativeId } = useParams<{ initiativeId: string }>();
  const navigate = useNavigate();
  const { initiative, generationStatus, generationStage, generationError, hydrate, reset } = usePMStore();
  const { connectionStatus } = usePMSocket(LIVE_MODE ? initiativeId ?? null : null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!LIVE_MODE || !initiativeId) return;
    hydrate(initiativeId);
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiativeId]);

  const handleRegenerate = async () => {
    if (!initiativeId) return;
    try {
      await initiativesApi.regenerate(initiativeId);
      toast.success("Regenerating plan…");
      setConfirming(false);
    } catch {
      toast.error("Failed to start regeneration");
      setConfirming(false);
    }
  };

  const handleApprove = async () => {
    if (!initiativeId) return;
    try {
      await initiativesApi.approve(initiativeId);
      toast.success("Plan approved");
    } catch {
      toast.error("Failed to approve plan");
    }
  };

  const handleRetry = async () => {
    if (!initiativeId) return;
    try {
      await initiativesApi.regenerate(initiativeId);
      toast.success("Retrying generation…");
    } catch {
      toast.error("Retry failed");
    }
  };

  const handleExport = async () => {
    if (!initiativeId) return;
    try {
      const data = await initiativesApi.exportJson(initiativeId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${initiative.name || "initiative"}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      captureEvent("initiative_exported", { initiative_id: initiativeId });
    } catch {
      toast.error("Failed to export initiative");
    }
  };

  if (!LIVE_MODE) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint p-8 text-center">
        Connect a backend (set VITE_WS_URL) to use Initiatives.
      </div>
    );
  }

  if (!initiative) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint">Loading initiative…</div>
    );
  }

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden">
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div className="forge-bg-glow absolute inset-0" />
        <div className="forge-bg-grid absolute inset-0" />
      </div>

      <div className="relative z-10 flex flex-col h-full min-h-0">
        <header className="shrink-0 border-b border-white/[0.06] backdrop-blur-xl">
          <div className="px-6 md:px-8 pt-6 pb-0">
            <motion.div className="flex items-start justify-between gap-4 mb-5" variants={motionVariants.fadeIn} initial="hidden" animate="visible">
              <div className="min-w-0">
                <motion.button
                  onClick={() => navigate("/initiatives")}
                  {...presets.tab}
                  className="text-xs text-muted hover:text-ink transition-colors motion-reduce:transition-none mb-2 flex items-center gap-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 rounded"
                >
                  <ArrowLeft size={12} />
                  All initiatives
                </motion.button>
                <div className="flex items-center gap-3">
                  <h1 className="font-display text-xl md:text-2xl font-semibold tracking-tight text-ink truncate">
                    {initiative.name}
                  </h1>
                  <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-muted">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${connectionStatus === "online" ? "bg-ok forge-signal-dot" : "bg-faint"}`}
                      aria-hidden="true"
                    />
                    {connectionStatus === "online" ? "Live" : "Offline"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExport}
                  className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-ink hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <Download size={14} aria-hidden="true" />
                  Export
                </button>
                {generationStatus === "generating" ? (
                  <span className="flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/10 px-4 py-2 text-xs font-medium text-accent">
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    {generationStage ? `Generating ${generationStage}…` : "Generating…"}
                  </span>
                ) : generationStatus === "failed" ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleApprove}
                      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-medium text-ink hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      Approve plan
                    </button>
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-accent px-4 text-xs font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                    >
                      Retry generation
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-end gap-2">
                    {confirming ? (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2"
                      >
                        <span className="text-xs text-muted">This will delete the current plan.</span>
                        <button
                          type="button"
                          onClick={handleRegenerate}
                          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirming(false)}
                          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-ink hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                        >
                          Cancel
                        </button>
                      </motion.div>
                    ) : (
                      <motion.button
                        onClick={() => setConfirming(true)}
                        {...presets.button}
                        className="flex items-center gap-2 h-9 px-4 rounded-xl border border-white/10 bg-white/[0.04] text-sm font-medium text-ink hover:bg-white/[0.08] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        <RefreshCw size={14} aria-hidden="true" />
                        Regenerate
                      </motion.button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>

            {generationStatus === "failed" && generationError && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-start gap-3 rounded-xl border border-ember/30 bg-ember/10 p-4"
              >
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-ember" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">Plan generation failed</p>
                  <p className="mt-1 text-xs text-muted line-clamp-3">{generationError}</p>
                </div>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-ink hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  Retry
                </button>
              </motion.div>
            )}

            <nav aria-label="Initiative sections" className="flex gap-0.5 -mb-px overflow-x-auto" role="tablist">
              {TABS.map((tab, i) => {
                const Icon = tab.icon;
                return (
                  <motion.div
                    key={tab.to}
                    variants={motionVariants.fadeUp}
                    initial="hidden"
                    animate="visible"
                    transition={{ delay: i * 0.03 }}
                  >
                    <NavLink
                      to={tab.to}
                      end={tab.end}
                      aria-controls={`tab-panel-${tab.to || "overview"}`}
                      role="tab"
                      className={({ isActive }) =>
                        [
                          "flex items-center gap-1.5 px-3.5 py-3 text-sm border-b-2 whitespace-nowrap transition-colors motion-reduce:transition-none",
                          "focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40",
                          isActive
                            ? "border-accent text-accent font-medium"
                            : "border-transparent text-muted hover:text-ink",
                        ].join(" ")
                      }
                    >
                      {Icon && <Icon size={14} aria-hidden="true" />}
                      {tab.label}
                    </NavLink>
                  </motion.div>
                );
              })}
            </nav>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
