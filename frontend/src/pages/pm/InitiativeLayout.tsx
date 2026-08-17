import { useEffect, useState } from "react";
import { NavLink, Outlet, useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { RefreshCw, Loader2, Rocket, ArrowLeft, AlertTriangle, Download } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { usePMSocket } from "../../hooks/usePMSocket";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";
import { captureEvent } from "../../lib/analytics";
import { escapeHtml } from "../../lib/sanitize";
import { motion, motionVariants } from "../../lib/animations";
import { Skeleton } from "../../components/ui/EmptyState";
import { Card, Button, Heading } from "../../components/ui";
import { fontSize } from "../../lib/designTokens";

const TABS = [
  { to: "", label: "Overview", end: true, icon: Rocket },
  { to: "board", label: "Board", icon: () => null },
  { to: "sprints", label: "Sprints", icon: () => null },
  { to: "agent-runs", label: "Agent runs", icon: () => null },
  { to: "roadmap", label: "Roadmap", icon: () => null },
  { to: "graph", label: "Graph", icon: () => null },
  { to: "releases", label: "Releases", icon: () => null },
  { to: "activity", label: "Activity", icon: () => null },
  { to: "integrations", label: "Integrations", icon: () => null },
  { to: "analytics", label: "Analytics", icon: () => null },
];

export default function InitiativeLayout() {
  const { initiativeId } = useParams<{ initiativeId: string }>();
  const navigate = useNavigate();
  const { initiative, generationStatus, generationStage, generationError, hydrate, reset, loading, error } = usePMStore();
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
    } catch (err: any) {
      if (err?.response?.status === 402) {
        toast.error(err?.response?.data?.detail || "Insufficient credits — add credits to keep planning.");
        setConfirming(false);
        navigate("/billing");
        return;
      }
      toast.error("Couldn't start regeneration.");
      setConfirming(false);
    }
  };

  const handleCancel = async () => {
    if (!initiativeId) return;
    try {
      await initiativesApi.cancel(initiativeId);
      toast.success("Generation cancelled");
    } catch {
      toast.error("Couldn't cancel generation.");
    }
  };

  const handleApprove = async () => {
    if (!initiativeId) return;
    try {
      await initiativesApi.approve(initiativeId);
      toast.success("Plan approved");
    } catch {
      toast.error("Couldn't approve the plan.");
    }
  };

  const handleRetry = async () => {
    if (!initiativeId) return;
    try {
      await initiativesApi.regenerate(initiativeId);
      toast.success("Retrying generation…");
    } catch (err: any) {
      if (err?.response?.status === 402) {
        toast.error(err?.response?.data?.detail || "Insufficient credits — add credits to keep planning.");
        navigate("/billing");
        return;
      }
      toast.error("Couldn't retry. Please try again.");
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
      a.download = `${initiative?.name || "initiative"}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      captureEvent("initiative_exported", { initiative_id: initiativeId });
    } catch {
      toast.error("Couldn't export this initiative.");
    }
  };

  if (!LIVE_MODE) {
    return (
      <div className="flex h-full items-center justify-center p-8">
              <Card variant="empty-state" className="w-full text-center">
                <Heading level="body">Connect a backend (set VITE_WS_URL) to use Initiatives.</Heading>
              </Card>
            </div>
          );
        }

        if (!initiative) {
          if (loading) {
      return (
        <div className="flex h-full flex-col gap-4 p-6 md:p-8">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
          </div>
          <div className="mt-4 space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center p-8">
              <Card variant="empty-state" className="w-full text-center">
                <Heading level="body">{error || "Failed to load initiative"}</Heading>
              </Card>
            </div>
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
        <header className="shrink-0 border-b border-border backdrop-blur-xl">
          <div className="px-6 md:px-8 pt-6 pb-0">
            <motion.div className="flex items-start justify-between gap-4 mb-5" variants={motionVariants.fadeIn} initial="hidden" animate="visible">
              <div className="min-w-0">
                <Button
                  variant="chip"
                  size="sm"
                  onClick={() => navigate("/initiatives")}
                  className="mb-2"
                >
                  <ArrowLeft size={12} aria-hidden="true" />
                  All initiatives
                </Button>
                <div className="flex items-center gap-3">
                  <Heading level="h2" className="truncate">
                    {initiative.name}
                  </Heading>
                  <span
                    className="flex items-center gap-2 border border-border bg-panel px-2 py-1 text-muted"
                    style={{ fontSize: fontSize.label }}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${connectionStatus === "online" ? "bg-ok forge-signal-dot" : "bg-faint"}`}
                      aria-hidden="true"
                    />
                    {connectionStatus === "online" ? "Live" : "Offline"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button variant="secondary" size="sm" onClick={handleExport}>
                  <Download size={14} aria-hidden="true" />
                  Export
                </Button>
                {generationStatus === "generating" ? (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-2 rounded-md border border-accent/20 bg-accent/10 px-3 py-2 text-xs font-medium text-accent">
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      {generationStage ? `Generating ${generationStage}…` : "Generating…"}
                    </span>
                    <Button variant="secondary" size="sm" onClick={handleCancel}>
                      Cancel
                    </Button>
                  </div>
                ) : generationStatus === "failed" || generationStatus === "review" ? (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={handleApprove}>
                      Approve plan
                    </Button>
                    {generationStatus === "failed" ? (
                      <Button variant="primary" size="sm" onClick={handleRetry}>
                        Retry generation
                      </Button>
                    ) : null}
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
                        <Button variant="primary" size="sm" onClick={handleRegenerate}>
                          Confirm
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
                          Cancel
                        </Button>
                      </motion.div>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
                        <RefreshCw size={14} aria-hidden="true" />
                        Regenerate
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>

            {generationStatus === "failed" && generationError && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4"
              >
                <Card variant="content" className="flex items-start gap-3 border-error/30 bg-error/10">
                  <AlertTriangle size={16} className="mt-1 shrink-0 text-error" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <Heading level="body" className="font-medium text-ink">
                      Plan generation failed
                    </Heading>
                    <p className="mt-1 line-clamp-3 text-muted" style={{ fontSize: fontSize.label }}>
                      {escapeHtml(generationError)}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleRetry}>
                    Retry
                  </Button>
                </Card>
              </motion.div>
            )}

            <nav aria-label="Initiative sections" className="-mb-px flex gap-1 overflow-x-auto" role="tablist">
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
                          "flex items-center gap-2 px-3 py-3 text-sm whitespace-nowrap border-b-2 transition-colors motion-reduce:transition-none",
                          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
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
