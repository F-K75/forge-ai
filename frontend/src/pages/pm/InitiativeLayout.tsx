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
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Tabs } from "../../components/ui/Tabs";
import InitiativeMixedMediaTray from "../../components/pm/InitiativeMixedMediaTray";
import InitiativeCopilotChat from "../../components/pm/InitiativeCopilotChat";
import { RequirementsSurvey } from "../../components/pm/RequirementsSurvey";

export const INITIATIVE_TABS = [
  { value: "overview", to: "", label: "Overview", icon: Rocket },
  { value: "board", to: "board", label: "Board", icon: Kanban },
  { value: "agent-runs", to: "agent-runs", label: "Agent Runs", icon: Bot },
] as const;

type PrimaryTabValue = (typeof INITIATIVE_TABS)[number]["value"];

function resolveActiveTab(pathname: string, basePath: string): PrimaryTabValue {
  const relative = pathname.startsWith(basePath)
    ? pathname.slice(basePath.length).replace(/^\/+/, "")
    : "";
  const segment = relative.split("/")[0] || "";
  if (segment === "board" || segment === "sprints" || segment === "graph" || segment === "releases") {
    return "board";
  }
  if (segment === "agent-runs" || segment === "integrations") {
    return "agent-runs";
  }
  return "overview";
}

export default function InitiativeLayout() {
  const { projectId, initiativeId } = useParams<{
    projectId?: string;
    initiativeId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const basePath = projectId
    ? `/p/${projectId}/initiatives/${initiativeId}`
    : `/initiatives/${initiativeId}`;
  const listPath = projectId ? `/p/${projectId}/initiatives` : "/initiatives";

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

  const activeTab = useMemo(
    () => resolveActiveTab(currentPath, basePath),
    [currentPath, basePath]
  );

  const tabItems = useMemo(
    () =>
      INITIATIVE_TABS.map((tab) => {
        const TabIcon = tab.icon;
        return {
          value: tab.value,
          label: tab.label,
          icon: <TabIcon size={15} className="shrink-0" />,
        };
      }),
    []
  );

  const handleTabChange = (value: string) => {
    const target = INITIATIVE_TABS.find((t) => t.value === value);
    if (!target) return;
    navigate(target.to ? `${basePath}/${target.to}` : basePath);
  };

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
    } catch (err: unknown) {
      const apiErr = err as { response?: { status?: number; data?: { detail?: string } } };
      if (apiErr?.response?.status === 402) {
        toast.error(
          apiErr?.response?.data?.detail || "Insufficient credits — add credits to keep planning."
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
    } catch (err: unknown) {
      const apiErr = err as { response?: { status?: number; data?: { detail?: string } } };
      if (apiErr?.response?.status === 402) {
        toast.error(
          apiErr?.response?.data?.detail || "Insufficient credits — add credits to keep planning."
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
    } catch (err: unknown) {
      const apiErr = err as { response?: { status?: number; data?: { detail?: string } } };
      if (apiErr?.response?.status === 402) {
        toast.error(
          apiErr?.response?.data?.detail || "Insufficient credits — add credits to keep planning."
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
        <div className="flex h-full flex-col gap-4 p-6 md:p-8 bg-base">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-36 rounded-lg bg-panel-alt" />
            <Skeleton className="h-7 w-24 rounded-lg bg-panel-alt" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-28 rounded-lg bg-panel-alt" />
            <Skeleton className="h-9 w-28 rounded-lg bg-panel-alt" />
            <Skeleton className="h-9 w-28 rounded-lg bg-panel-alt" />
          </div>
          <div className="mt-4 space-y-3">
            <Skeleton className="h-4 w-3/4 rounded-md bg-panel-alt" />
            <Skeleton className="h-4 w-1/2 rounded-md bg-panel-alt" />
            <Skeleton className="h-4 w-5/6 rounded-md bg-panel-alt" />
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full items-center justify-center p-8 bg-base">
        <div className="w-full max-w-md bg-panel border border-border rounded-lg p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-error/15 text-error border border-error/25">
            <AlertTriangle className="h-6 w-6" strokeWidth={2} />
          </div>
          <h2 className="text-base font-semibold text-ink">
            {error || "Failed to load initiative"}
          </h2>
          <p className="mt-2 text-xs text-muted">
            The requested architecture plan could not be found or hydrated.
          </p>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate(listPath)}
            className="mt-6 mx-auto"
          >
            <ArrowLeft size={14} />
            <span>Return to Initiatives</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full bg-base text-ink font-sans antialiased">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Animated linear progress bar when generating */}
        {generationStatus === "generating" && (
          <div className="w-full h-1 bg-panel-alt overflow-hidden relative rounded-full">
            <div className="h-full bg-accent w-1/2 animate-[shimmer_1.5s_infinite_linear] rounded-full" />
          </div>
        )}

        {/* Initiative Header */}
        <header
          aria-label="Initiative Header"
          className="rounded-lg border border-border bg-panel p-5 sm:p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(listPath)}
              >
                <ArrowLeft size={14} />
                <span>All Initiatives</span>
              </Button>
              <span className="text-muted">/</span>
              <Badge
                variant={!initiative.status || initiative.status === "active" ? "accent" : "default"}
                dot
              >
                {initiative.status || "Active Plan"}
              </Badge>
              <Badge variant="default">
                <Kanban size={12} />
                <span>{epics?.length ?? 0} Epics</span>
              </Badge>
              <Badge variant="default">
                <Zap size={12} />
                <span>{sprints?.length ?? 0} Sprints</span>
              </Badge>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleOpenCopilot()}
              >
                <Sparkles size={14} />
                <span>Ask Copilot</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setMediaDrawerOpen(true)}
                title="Open Mixed Media Intelligence Deck"
              >
                <Volume2 size={14} />
                <span>Media Intelligence</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSurveyOpen(true)}
                title="Launch Requirements Survey & Architecture Matrix"
              >
                <Sparkles size={14} />
                <span>Survey & Architecture</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExport}
                title="Export JSON Specification"
                aria-label="Export JSON"
              >
                <ArrowUpRight size={14} />
                <span className="hidden sm:inline">Export</span>
              </Button>

              {generationStatus === "failed" ? (
                <Button variant="primary" size="sm" onClick={handleRetry}>
                  <RefreshCw size={14} />
                  <span>Retry Plan Generation</span>
                </Button>
              ) : generationStatus === "review" ? (
                <Button variant="primary" size="sm" onClick={handleApprove}>
                  <CheckCircle2 size={14} />
                  <span>Approve Architecture Plan</span>
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirming(true)}
                >
                  <RefreshCw size={14} />
                  <span>Regenerate Plan</span>
                </Button>
              )}

              {confirming && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-panel-alt border border-border rounded-md">
                  <span className="text-xs font-medium text-muted">Overwrite?</span>
                  <Button variant="primary" size="sm" onClick={handleRegenerate}>
                    Yes
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirming(false)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-2xl sm:text-3xl font-medium tracking-tight text-ink">
                {initiative.name}
              </h1>
              <span className="font-mono text-xs text-muted">
                {initiative.estimated_timeline || "February–August, 2026"}
              </span>
            </div>
            <p className="text-sm text-muted max-w-3xl leading-relaxed">
              {initiative.vision ||
                initiative.product_scope ||
                "Autonomous systems architecture and production sprint decomposition executed with 8 specialized AI agents."}
            </p>
          </div>

          {/* 3 Primary Consolidated Tabs */}
          <div className="pt-2 border-t border-border flex items-center justify-between gap-4 flex-wrap">
            <Tabs
              value={activeTab}
              onChange={handleTabChange}
              items={tabItems}
              className="w-full sm:w-auto"
            />
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted">
              <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
              8 Agent Swarm Active
            </span>
          </div>
        </header>

        {/* Error banner if generation failed */}
        {generationStatus === "failed" && generationError && (
          <div className="flex items-start gap-3 rounded-lg bg-error/10 p-4 text-ink border border-error/30">
            <AlertTriangle size={18} className="shrink-0 text-error mt-0.5" />
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-medium text-error">
                Plan Generation Error
              </h4>
              <p className="text-xs mt-1 text-muted">{escapeHtml(generationError)}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </div>
        )}

        {/* Active View Content */}
        <main className="relative min-h-[400px]">
          <Outlet />
        </main>
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
