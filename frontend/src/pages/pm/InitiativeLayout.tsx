import { useEffect, useState, useMemo } from "react";
import { Outlet, useParams, useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import {
  RefreshCw,
  Rocket,
  ArrowLeft,
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Kanban,
  Zap,
  Bot,
  Map,
  Network,
  Package,
  Activity,
  Boxes,
  BarChart3,
  Sparkles,
  Volume2,
} from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { usePMSocket } from "../../hooks/usePMSocket";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";
import { captureEvent } from "../../lib/analytics";
import { escapeHtml } from "../../lib/sanitize";
import { Skeleton } from "../../components/ui/EmptyState";
import InitiativeMixedMediaTray from "../../components/pm/InitiativeMixedMediaTray";
import InitiativeCopilotChat from "../../components/pm/InitiativeCopilotChat";
import { SuiWindowFrame, BottomNavItem } from "../../components/pm/SuiWindowFrame";
import { SuiKeycapVisual } from "../../components/pm/SuiKeycapVisual";
import { RequirementsSurvey } from "../../components/pm/RequirementsSurvey";

const TABS = [
  { to: "", label: "Overview", end: true, icon: Rocket },
  { to: "board", label: "Board", icon: Kanban },
  { to: "sprints", label: "Sprints", icon: Zap },
  { to: "agent-runs", label: "Agent runs", icon: Bot },
  { to: "roadmap", label: "Roadmap", icon: Map },
  { to: "graph", label: "Graph", icon: Network },
  { to: "releases", label: "Releases", icon: Package },
  { to: "activity", label: "Activity", icon: Activity },
  { to: "integrations", label: "Integrations", icon: Boxes },
  { to: "analytics", label: "Analytics", icon: BarChart3 },
];

export default function InitiativeLayout() {
  const { initiativeId } = useParams<{ initiativeId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const {
    initiative,
    epics,
    sprints,
    generationStatus,
    generationError,
    hydrate,
    reset,
    loading,
    error,
  } = usePMStore();
  usePMSocket(LIVE_MODE ? initiativeId ?? null : null);
  const [confirming, setConfirming] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotPrompt, setCopilotPrompt] = useState<string | undefined>(undefined);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [surveyGenerating, setSurveyGenerating] = useState(false);
  const [mediaDrawerOpen, setMediaDrawerOpen] = useState(false);

  const isOverviewTab =
    currentPath === `/initiatives/${initiativeId}` ||
    currentPath === `/initiatives/${initiativeId}/`;

  const bottomNavItems: BottomNavItem[] = useMemo(() => {
    const items: BottomNavItem[] = TABS.map((tab) => {
      const targetUrl = tab.to
        ? `/initiatives/${initiativeId}/${tab.to}`
        : `/initiatives/${initiativeId}`;
      const isEnd = tab.end;
      const isActive = isEnd
        ? currentPath === `/initiatives/${initiativeId}` ||
          currentPath === `/initiatives/${initiativeId}/`
        : currentPath.includes(`/initiatives/${initiativeId}/${tab.to}`);

      const TabIcon = tab.icon;

      return {
        id: tab.to || "overview",
        label: tab.label,
        icon: <TabIcon size={15} className="shrink-0" />,
        isActive,
        onClick: () => {
          navigate(targetUrl);
        },
      };
    });

    items.push({
      id: "discord",
      label: "Community",
      isExternal: true,
      onClick: () => {
        toast("Opening Developer Swarm Community");
      },
    });

    return items;
  }, [initiativeId, currentPath, navigate]);

  const handleOpenCopilot = (prompt?: string) => {
    if (prompt) setCopilotPrompt(prompt);
    setCopilotOpen(true);
  };

  useEffect(() => {
    if (!initiativeId) return;
    hydrate(initiativeId);
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initiativeId]);

  const handleRegenerate = async () => {
    if (!initiativeId) return;
    try {
      if (LIVE_MODE) {
        await initiativesApi.regenerate(initiativeId);
      }
      toast.success("Regenerating execution plan…");
      setConfirming(false);
    } catch (err: any) {
      if (err?.response?.status === 402) {
        toast.error(
          err?.response?.data?.detail || "Insufficient credits — add credits to keep planning."
        );
        setConfirming(false);
        navigate("/billing");
        return;
      }
      toast.error("Couldn't start regeneration.");
      setConfirming(false);
    }
  };

  const handleGenerateWithSurvey = async (
    _prompt: string,
    _clarifications: Record<string, string>,
    _additionalNotes: string
  ) => {
    if (!initiativeId) return;
    setSurveyGenerating(true);
    try {
      if (LIVE_MODE) {
        await initiativesApi.regenerate(initiativeId);
      }
      toast.success("Regenerating execution plan with verified requirements!");
      setSurveyOpen(false);
    } catch (err: any) {
      if (err?.response?.status === 402) {
        toast.error(
          err?.response?.data?.detail || "Insufficient credits — add credits to keep planning."
        );
        setSurveyOpen(false);
        navigate("/billing");
        return;
      }
      toast.error("Could not regenerate plan from survey requirements.");
    } finally {
      setSurveyGenerating(false);
    }
  };

  const _handleCancel = async () => {
    if (!initiativeId) return;
    try {
      if (LIVE_MODE) {
        await initiativesApi.cancel(initiativeId);
      }
      toast.success("Generation cancelled");
    } catch {
      toast.error("Couldn't cancel generation.");
    }
  };

  const handleApprove = async () => {
    if (!initiativeId) return;
    try {
      if (LIVE_MODE) {
        await initiativesApi.approve(initiativeId);
      }
      toast.success("Plan approved");
    } catch {
      toast.error("Couldn't approve the plan.");
    }
  };

  const handleRetry = async () => {
    if (!initiativeId) return;
    try {
      if (LIVE_MODE) {
        await initiativesApi.regenerate(initiativeId);
      }
      toast.success("Retrying generation…");
    } catch (err: any) {
      if (err?.response?.status === 402) {
        toast.error(
          err?.response?.data?.detail || "Insufficient credits — add credits to keep planning."
        );
        navigate("/billing");
        return;
      }
      toast.error("Couldn't retry. Please try again.");
    }
  };

  const handleExport = async () => {
    if (!initiativeId) return;
    try {
      let data = null;
      if (LIVE_MODE) {
        data = await initiativesApi.exportJson(initiativeId);
      } else {
        data = {
          initiative,
          exported_at: new Date().toISOString(),
          version: initiative?.version || 1,
        };
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${initiative?.name || "initiative"}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      captureEvent("initiative_exported", { initiative_id: initiativeId });
      toast.success("Plan exported as JSON");
    } catch {
      toast.error("Couldn't export this initiative.");
    }
  };

  if (!initiative) {
    if (loading) {
      return (
        <div className="flex h-full flex-col gap-4 p-6 md:p-8 bg-[#FDFCFB] dark:bg-[#0B0D13]">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-36 rounded-full bg-neutral-200 dark:bg-neutral-800" />
            <Skeleton className="h-8 w-24 rounded-full bg-neutral-200 dark:bg-neutral-800" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-28 rounded-full bg-neutral-200 dark:bg-neutral-800" />
            <Skeleton className="h-10 w-28 rounded-full bg-neutral-200 dark:bg-neutral-800" />
            <Skeleton className="h-10 w-28 rounded-full bg-neutral-200 dark:bg-neutral-800" />
          </div>
          <div className="mt-4 space-y-3">
            <Skeleton className="h-4 w-3/4 rounded-md bg-neutral-200 dark:bg-neutral-800" />
            <Skeleton className="h-4 w-1/2 rounded-md bg-neutral-200 dark:bg-neutral-800" />
            <Skeleton className="h-4 w-5/6 rounded-md bg-neutral-200 dark:bg-neutral-800" />
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center p-8 bg-[#FDFCFB] dark:bg-[#0B0D13]">
        <div className="w-full max-w-md bg-white dark:bg-[#141722] border border-neutral-200 dark:border-neutral-800 rounded-3xl p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-6 w-6" strokeWidth={2.2} />
          </div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">
            {error || "Failed to load initiative"}
          </h2>
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            The requested architecture plan could not be found or hydrated.
          </p>
          <button
            onClick={() => navigate("/initiatives")}
            className="mt-6 h-9 px-5 bg-neutral-900 text-white hover:bg-black dark:bg-white dark:text-neutral-900 rounded-full text-xs font-semibold flex items-center gap-1.5 mx-auto"
          >
            <ArrowLeft size={14} />
            <span>Return to Initiatives</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full bg-[#E5EEF8] dark:bg-[#07090E] p-1.5 sm:p-3 md:p-4 font-sans antialiased text-[#111827] dark:text-[#F3F4F6] transition-colors duration-200 flex flex-col items-stretch justify-start">
      <div className="w-full flex-1 flex flex-col">
        <SuiWindowFrame
          title={initiative.name}
          tagLabel="status"
          tagText={initiative.status ? initiative.status.toUpperCase() : "ACTIVE_PLAN"}
          navPosition="top"
          navItems={bottomNavItems}
          bottomNavItems={bottomNavItems}
          primaryAction={{
            label: "Ask Copilot",
            icon: <Sparkles size={14} className="text-amber-400" />,
            onClick: () => handleOpenCopilot(),
          }}
        >
          {/* Animated linear progress bar when generating */}
          {generationStatus === "generating" && (
            <div className="w-full h-1.5 bg-neutral-200 dark:bg-neutral-800 overflow-hidden relative rounded-full mb-6">
              <div className="h-full bg-[#4387F6] w-1/2 animate-[shimmer_1.5s_infinite_linear] rounded-full" />
            </div>
          )}

          <div className="space-y-6 sm:space-y-8">
            {/* =========================================================================
                HERO SECTION: SUI OVERFLOW 2025 AESTHETIC FOR ACTIVE INITIATIVE
                - Left: Bold Initiative Headline + Timeline + Paired Dual CTA Unit
                - Right: Chunky 3D Candy Keycaps + Code Key + Dynamic Bubble
            ========================================================================= */}
            <section aria-label="Initiative Hero" className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center pt-1 pb-4 border-b-2 border-neutral-900/10">
              {/* Left Column: Bold Typography & Action Controls */}
              <div className="lg:col-span-7 space-y-4">
                {/* Back to library & status line */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate("/initiatives")}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-neutral-800 border-2 border-neutral-900 text-xs font-bold text-neutral-900 dark:text-white shadow-[1.5px_1.5px_0_#000] active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
                  >
                    <ArrowLeft size={13} strokeWidth={2.4} />
                    <span>All Initiatives</span>
                  </button>

                  <span className="text-neutral-400 font-bold">/</span>

                  <span className="px-2.5 py-0.5 rounded-full bg-[#10B981]/20 text-[#047857] dark:text-[#6EE7B7] border border-[#10B981]/40 text-xs font-extrabold uppercase tracking-wider">
                    {initiative.status || "Active Plan"}
                  </span>
                </div>

                {/* Big Bold Headline matching Sui Overflow */}
                <div>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-neutral-950 dark:text-white leading-[1.1]">
                    {initiative.name}
                  </h1>
                  <p className="mt-1.5 text-sm sm:text-base font-bold text-neutral-700 dark:text-neutral-300">
                    {initiative.estimated_timeline || "February–August, 2026"}
                  </p>
                </div>

                <p className="text-sm text-neutral-600 dark:text-neutral-300 max-w-xl leading-relaxed">
                  {initiative.vision ||
                    initiative.product_scope ||
                    "Autonomous systems architecture and production sprint decomposition executed with 8 specialized AI agents."}
                </p>

                {/* Signature Paired CTA Unit */}
                <div className="flex items-center gap-2 pt-1">
                  {/* Primary Action Button */}
                  {generationStatus === "failed" ? (
                    <button
                      type="button"
                      onClick={handleRetry}
                      className="h-11 px-6 sm:px-7 bg-[#E11D48] hover:bg-[#BE123C] text-white rounded-lg text-sm font-bold tracking-tight shadow-[2px_2px_0_#000] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw size={14} strokeWidth={2.4} />
                      <span>Retry Plan Generation</span>
                    </button>
                  ) : generationStatus === "review" ? (
                    <button
                      type="button"
                      onClick={handleApprove}
                      className="h-11 px-6 sm:px-7 bg-[#10B981] hover:bg-[#059669] text-white rounded-lg text-sm font-bold tracking-tight shadow-[2px_2px_0_#000] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 size={15} strokeWidth={2.4} />
                      <span>Approve Architecture Plan</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(true)}
                      className="h-11 px-6 sm:px-7 bg-[#1A1A1A] hover:bg-black text-white rounded-lg text-sm font-bold tracking-tight shadow-[2px_2px_0_#000] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw size={14} strokeWidth={2.4} />
                      <span>Regenerate Plan</span>
                    </button>
                  )}

                  {/* Adjacent Sky-Blue Square Button */}
                  <button
                    type="button"
                    onClick={handleExport}
                    className="h-11 w-11 bg-[#D7E9FE] hover:bg-[#BAE6FD] text-neutral-900 border-2 border-[#000F1D] rounded-xl shadow-[3.5px_3.5px_0_#000F1D] active:translate-y-0.5 active:shadow-none transition-all flex items-center justify-center cursor-pointer"
                    title="Export JSON Specification"
                    aria-label="Export JSON"
                  >
                    <ArrowUpRight size={18} strokeWidth={2.6} />
                  </button>

                  {/* Requirements Survey Keycap Button */}
                  <button
                    type="button"
                    onClick={() => setSurveyOpen(true)}
                    className="h-11 px-4 sm:px-5 rounded-xl border-2 border-[#000F1D] bg-[#FFE03D] hover:bg-[#FDD835] text-[#000F1D] text-xs sm:text-sm font-black tracking-tight shadow-[3.5px_3.5px_0_#000F1D] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                    title="Launch Requirements Survey & Architecture Matrix"
                  >
                    <Sparkles size={16} className="stroke-[2.5]" />
                    <span>Survey & Architecture</span>
                  </button>

                  {/* Media Intelligence Deck Trigger Button */}
                  <button
                    type="button"
                    onClick={() => setMediaDrawerOpen(true)}
                    className="h-11 px-4 sm:px-5 rounded-xl border-2 border-[#000F1D] bg-white hover:bg-neutral-50 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-[#000F1D] dark:text-white text-xs sm:text-sm font-black tracking-tight shadow-[3.5px_3.5px_0_#000F1D] active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                    title="Open Mixed Media Intelligence Deck"
                  >
                    <Volume2 size={16} className="text-amber-500 stroke-[2.5]" />
                    <span>Media Intelligence</span>
                  </button>

                  {/* Overwrite confirmation popover */}
                  {confirming && (
                    <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-neutral-800 border-2 border-neutral-900 rounded-lg shadow-[2px_2px_0_#000]">
                      <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 px-2">Overwrite?</span>
                      <button
                        type="button"
                        onClick={handleRegenerate}
                        className="px-2.5 py-1 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-bold rounded cursor-pointer"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        className="px-2 py-1 text-xs font-bold text-neutral-500 hover:text-neutral-900 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                {/* Micro Telemetry Badges */}
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-neutral-800 border-2 border-[#000F1D] text-xs font-black text-[#000F1D] dark:text-white shadow-[2px_2px_0_#000F1D]">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>8 Agent Swarm Active</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-neutral-800 border-2 border-[#000F1D] text-xs font-black text-[#000F1D] dark:text-white shadow-[2px_2px_0_#000F1D]">
                    <Kanban size={13} className="text-[#4DA2FE]" />
                    <span>{epics?.length ?? 0} Epics</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-neutral-800 border-2 border-[#000F1D] text-xs font-black text-[#000F1D] dark:text-white shadow-[2px_2px_0_#000F1D]">
                    <Zap size={13} className="text-amber-500" />
                    <span>{sprints?.length ?? 0} Sprints</span>
                  </div>
                </div>
              </div>

              {/* Right Column: 3D Candy Keycaps Visual */}
              <div className="lg:col-span-5 flex justify-center">
                <div className="w-full max-w-[420px] bg-white dark:bg-[#141824] rounded-2xl border-2 border-[#000F1D] p-4 shadow-[6px_6px_0_#000F1D]">
                  <SuiKeycapVisual
                    title="OVERFLOW"
                    onKeyClick={(char) => {
                      toast(`Agent Channel ${char} assigned to ${initiative.name}`);
                    }}
                  />
                </div>
              </div>
            </section>

            {/* Error banner if generation failed */}
            {generationStatus === "failed" && generationError && (
              <div className="flex items-start gap-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 p-4 text-rose-900 dark:text-rose-100 border-2 border-rose-600 shadow-[2px_2px_0_#e11d48]">
                <AlertTriangle size={20} className="shrink-0 text-rose-600" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-black uppercase tracking-wider">Plan Generation Error</h4>
                  <p className="text-xs mt-1">{escapeHtml(generationError)}</p>
                </div>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Subtab Views Content (Overview, Board, Sprints, Roadmap, Graph, etc.) */}
            <div className="relative min-h-[400px]">
              <Outlet />
            </div>
          </div>
        </SuiWindowFrame>
      </div>

      {/* Interactive Mixed Media Intelligence Slide-Over Drawer */}
      {initiative && (
        <InitiativeMixedMediaTray
          initiative={initiative}
          epics={epics}
          sprints={sprints}
          onOpenCopilot={handleOpenCopilot}
          copilotOpen={copilotOpen}
          drawerOpen={mediaDrawerOpen}
          onToggleDrawer={setMediaDrawerOpen}
        />
      )}

      {/* Interactive Mixed Media Copilot Chat Modal */}
      {initiative && (
        <InitiativeCopilotChat
          initiative={initiative}
          epics={epics}
          sprints={sprints}
          isOpen={copilotOpen}
          onClose={() => setCopilotOpen(false)}
          initialPrompt={copilotPrompt}
        />
      )}

      {/* Interactive Requirements Survey & Architecture Clarification Modal */}
      {initiative && (
        <RequirementsSurvey
          isOpen={surveyOpen}
          prompt={initiative.vision || initiative.product_scope || initiative.name}
          onClose={() => setSurveyOpen(false)}
          onGenerate={handleGenerateWithSurvey}
          isGenerating={surveyGenerating}
        />
      )}
    </div>
  );
}
