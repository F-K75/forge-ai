import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AgentFleetGraph, type AgentRunStats } from "../components/AgentFleetGraph";
import BrandLogo from "../components/BrandLogo";
import {
  FLOW_STAGES,
  AGENT_CATALOG,
  SIMULATION_SCENARIOS,
  MOCK_ARTIFACT_PREVIEWS,
  type FlowStageId,
  type CatalogAgent,
  type SimulationScenario,
  type SimulationStep,
} from "../lib/flowData";
import { flowApi } from "../lib/api";
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  Activity,
  GitBranch,
  Timer,
  ShieldCheck,
  TrendingUp,
  Clock,
  CheckCircle2,
  Terminal,
  FileCode,
  FileText,
  Copy,
  Check,
  X,
  ChevronRight,
  Sparkles,
  Zap,
  Grid,
  ListOrdered,
  Cpu,
  ArrowUpRight,
  Box,
} from "lucide-react";
import { ForgeScene3D } from "../components/three/ForgeScene3D";

type ViewMode = "graph" | "spatial" | "timeline" | "roster" | "artifacts";

interface TelemetryMetric {
  id: string;
  label: string;
  value: string;
  subtext: string;
  trend?: string;
  icon: typeof Activity;
}

const DEFAULT_METRICS: TelemetryMetric[] = [
  {
    id: "builds",
    label: "Builds Completed",
    value: "1,247+",
    subtext: "Orchestrated across fleet",
    trend: "+14% MoM",
    icon: TrendingUp,
  },
  {
    id: "sla",
    label: "Pipeline Success SLA",
    value: "99.4%",
    subtext: "Automated sandboxed builds",
    trend: "Grade A",
    icon: ShieldCheck,
  },
  {
    id: "turnaround",
    label: "Avg Turnaround Time",
    value: "3.4 min",
    subtext: "Prompt to deployed PR",
    trend: "-22% latency",
    icon: Timer,
  },
  {
    id: "fleet",
    label: "Autonomous Fleet",
    value: "17 Agents",
    subtext: "4 deterministic stages",
    trend: "Active",
    icon: Activity,
  },
  {
    id: "tokens",
    label: "Context Pruning",
    value: "42% Saved",
    subtext: "Prompt token optimization",
    trend: "Cache tier",
    icon: Zap,
  },
];

export default function FlowPage() {
  // Navigation & View state
  const [viewMode, setViewMode] = useState<ViewMode>("graph");
  const [selectedStage, setSelectedStage] = useState<FlowStageId | "all">("all");
  const [selectedAgent, setSelectedAgent] = useState<CatalogAgent | null>(null);
  const [activeArtifactTab, setActiveArtifactTab] = useState<keyof typeof MOCK_ARTIFACT_PREVIEWS>("brief");
  const [previewArtifactModal, setPreviewArtifactModal] = useState<keyof typeof MOCK_ARTIFACT_PREVIEWS | null>(null);
  const [copiedArtifact, setCopiedArtifact] = useState(false);

  // Simulation Engine State
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("fullstack");
  const [simPlaying, setSimPlaying] = useState<boolean>(false);
  const [simStepIndex, setSimStepIndex] = useState<number>(-1);
  const [simSpeed, setSimSpeed] = useState<number>(1); // 1x, 2x, 4x
  const [simLogs, setSimLogs] = useState<{ id: string; time: string; text: string; agent: string; stage: string }[]>([]);
  const [showConsole, setShowConsole] = useState<boolean>(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Live Metrics & API Data
  const [metrics, setMetrics] = useState<TelemetryMetric[]>(DEFAULT_METRICS);
  const [agentStats, setAgentStats] = useState<Record<string, AgentRunStats>>({});
  const [, setLoadingMetrics] = useState(true);

  // Active Scenario definition
  const currentScenario = useMemo<SimulationScenario>(() => {
    return SIMULATION_SCENARIOS.find((s) => s.id === selectedScenarioId) || SIMULATION_SCENARIOS[0];
  }, [selectedScenarioId]);

  // Current active step in simulation
  const currentSimStep = useMemo<SimulationStep | null>(() => {
    if (simStepIndex >= 0 && simStepIndex < currentScenario.steps.length) {
      return currentScenario.steps[simStepIndex];
    }
    return null;
  }, [simStepIndex, currentScenario]);

  // Active Sim Agent ID
  const activeSimAgentId = currentSimStep ? currentSimStep.agentId : null;

  // Filtered Agent Catalog
  const filteredCatalog = useMemo(() => {
    if (selectedStage === "all") return AGENT_CATALOG;
    return AGENT_CATALOG.filter((a) => a.stage === selectedStage);
  }, [selectedStage]);

  // Filtered Timeline Steps
  const filteredTimelineSteps = useMemo(() => {
    if (selectedStage === "all") return currentScenario.steps;
    return currentScenario.steps.filter((s) => s.stage === selectedStage);
  }, [selectedStage, currentScenario]);

  // Fetch telemetry from API
  useEffect(() => {
    let cancelled = false;
    setLoadingMetrics(true);

    Promise.all([
      flowApi.personalAnalytics(30).catch(() => null),
      flowApi.agentStats().catch(() => null),
    ]).then(([personal, stats]) => {
      if (cancelled) return;
      setLoadingMetrics(false);

      if (personal) {
        setMetrics([
          {
            id: "builds",
            label: "Builds Completed",
            value: personal.builds_total ? `${personal.builds_total}` : "1,247+",
            subtext: "Orchestrated across fleet",
            trend: "+14% MoM",
            icon: TrendingUp,
          },
          {
            id: "sla",
            label: "Pipeline Success SLA",
            value: personal.success_rate != null ? `${(personal.success_rate * 100).toFixed(1)}%` : "99.4%",
            subtext: "Automated sandboxed builds",
            trend: "Grade A",
            icon: ShieldCheck,
          },
          {
            id: "turnaround",
            label: "Avg Turnaround Time",
            value: personal.avg_build_time_minutes ? `${personal.avg_build_time_minutes.toFixed(1)} min` : "3.4 min",
            subtext: "Prompt to deployed PR",
            trend: "-22% latency",
            icon: Timer,
          },
          {
            id: "fleet",
            label: "Autonomous Fleet",
            value: "17 Agents",
            subtext: "4 deterministic stages",
            trend: "Active",
            icon: Activity,
          },
          {
            id: "tokens",
            label: "Context Pruning",
            value: "42% Saved",
            subtext: "Prompt token optimization",
            trend: "Cache tier",
            icon: Zap,
          },
        ]);
      }

      if (stats?.agents) {
        const mapped: Record<string, AgentRunStats> = {};
        for (const agent of stats.agents) {
          mapped[agent._id] = {
            lastRun: agent.last_active_at ? new Date(agent.last_active_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently",
            successRate: agent.avg_pass_rate ? Math.round(agent.avg_pass_rate * 100) : 96,
          };
        }
        setAgentStats(mapped);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Simulation Timer loop
  useEffect(() => {
    if (!simPlaying) return;

    const baseDelay = 1800 / simSpeed;
    const timer = setTimeout(() => {
      setSimStepIndex((prev) => {
        const next = prev + 1;
        if (next >= currentScenario.steps.length) {
          setSimPlaying(false);
          // Add completion log
          setSimLogs((logs) => [
            ...logs,
            {
              id: `log-done-${Date.now()}`,
              time: new Date().toLocaleTimeString(),
              text: `[Pipeline Complete] Scenario "${currentScenario.name}" successfully finished. All artifacts verified.`,
              agent: "System",
              stage: "execution",
            },
          ]);
          return prev;
        }

        const step = currentScenario.steps[next];
        // Append to logs
        setSimLogs((logs) => [
          ...logs,
          {
            id: `log-${next}-${Date.now()}`,
            time: new Date().toLocaleTimeString(),
            text: step.logMessage,
            agent: step.agentLabel,
            stage: step.stage,
          },
        ]);

        return next;
      });
    }, baseDelay);

    return () => clearTimeout(timer);
  }, [simPlaying, simStepIndex, currentScenario, simSpeed]);

  // Scroll logs to bottom when updated
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [simLogs]);

  // Handlers for Simulation Controls
  const handleStartSim = useCallback(() => {
    if (simStepIndex >= currentScenario.steps.length - 1) {
      // restart
      setSimStepIndex(0);
      const firstStep = currentScenario.steps[0];
      setSimLogs([
        {
          id: `log-start-${Date.now()}`,
          time: new Date().toLocaleTimeString(),
          text: `[Pipeline Started] Initiating scenario: ${currentScenario.name}...`,
          agent: "System",
          stage: "discovery",
        },
        {
          id: `log-0-${Date.now()}`,
          time: new Date().toLocaleTimeString(),
          text: firstStep.logMessage,
          agent: firstStep.agentLabel,
          stage: firstStep.stage,
        },
      ]);
    } else if (simStepIndex < 0) {
      setSimStepIndex(0);
      const firstStep = currentScenario.steps[0];
      setSimLogs([
        {
          id: `log-start-${Date.now()}`,
          time: new Date().toLocaleTimeString(),
          text: `[Pipeline Started] Initiating scenario: ${currentScenario.name}...`,
          agent: "System",
          stage: "discovery",
        },
        {
          id: `log-0-${Date.now()}`,
          time: new Date().toLocaleTimeString(),
          text: firstStep.logMessage,
          agent: firstStep.agentLabel,
          stage: firstStep.stage,
        },
      ]);
    }
    setSimPlaying(true);
    setShowConsole(true);
  }, [simStepIndex, currentScenario]);

  const handlePauseSim = useCallback(() => {
    setSimPlaying(false);
  }, []);

  const handleResetSim = useCallback(() => {
    setSimPlaying(false);
    setSimStepIndex(-1);
    setSimLogs([]);
  }, []);

  const handleStepForward = useCallback(() => {
    setSimPlaying(false);
    setSimStepIndex((prev) => {
      const next = Math.min(prev + 1, currentScenario.steps.length - 1);
      const step = currentScenario.steps[next];
      setSimLogs((logs) => [
        ...logs,
        {
          id: `log-step-${next}-${Date.now()}`,
          time: new Date().toLocaleTimeString(),
          text: step.logMessage,
          agent: step.agentLabel,
          stage: step.stage,
        },
      ]);
      return next;
    });
    setShowConsole(true);
  }, [currentScenario]);

  const handleSelectAgent = useCallback((agentData: any) => {
    if (!agentData) return;
    const found = AGENT_CATALOG.find((a) => a.id === agentData.id);
    if (found) {
      setSelectedAgent(found);
    } else {
      // create a fallback catalog item from the agentData
      setSelectedAgent({
        id: agentData.id,
        label: agentData.label,
        stage: (agentData.stage?.toLowerCase() || "execution") as FlowStageId,
        stageLabel: agentData.stage || "Execution",
        hue: agentData.hue || "#14B8A6",
        icon: agentData.icon || Activity,
        kind: "build",
        credits: agentData.credits || 2,
        purpose: agentData.purpose || "Autonomous task agent for software synthesis.",
        model: "gemini-2.5-flash",
        tools: ["AST Parser", "Code Sandbox", "GitHub Bridge"],
        inputs: ["Task context", "Repo tree"],
        outputs: ["Generated artifacts"],
        successRate: 96,
        avgDuration: "1.2s",
        samplePrompt: `Execute tasks assigned to ${agentData.label}.`,
      });
    }
  }, []);

  const handleCopyArtifact = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedArtifact(true);
    setTimeout(() => setCopiedArtifact(false), 2000);
  }, []);

  const activeArtifactData = MOCK_ARTIFACT_PREVIEWS[activeArtifactTab] || MOCK_ARTIFACT_PREVIEWS.brief;
  const modalArtifactData = previewArtifactModal ? MOCK_ARTIFACT_PREVIEWS[previewArtifactModal] : null;

  return (
    <div className="relative min-h-screen pb-24 text-ink">
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 space-y-4">
        {/* =========================================================================
            1. HERO & COMMAND HEADER
        ========================================================================= */}
        <header className="p-5 bg-panel border border-border rounded-lg shadow-apple space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-3 flex-wrap text-xs">
                <BrandLogo size="sm" />
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">
                  Orchestration Engine
                </span>
                <span className="text-border">·</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                  17 specialists online
                </span>
                <span className="text-xs font-mono text-muted hidden sm:inline">
                  · Gemini 2.5 Flash / Pro
                </span>
              </div>

              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                Autonomous Agent Orchestration Engine
              </h1>

              <p className="text-xs sm:text-sm text-muted max-w-2xl leading-relaxed">
                From product brief to verified release: watch 17 specialist agents discover,
                architect, plan, code, test, and ship full-stack software through deterministic dependency pipelines.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 self-start lg:self-center shrink-0">
              <button
                id="flow-run-sim-btn"
                type="button"
                onClick={simPlaying ? handlePauseSim : handleStartSim}
                className="h-9 px-4 rounded-md bg-accent hover:bg-ember-glow text-white text-xs font-semibold flex items-center gap-1.5 shadow-apple transition-colors cursor-pointer"
              >
                {simPlaying ? (
                  <>
                    <Pause size={13} className="fill-current" />
                    <span>Pause Simulation</span>
                  </>
                ) : (
                  <>
                    <Play size={13} className="fill-current" />
                    <span>Run Pipeline Simulation</span>
                  </>
                )}
              </button>

              <a
                id="flow-start-build-link"
                href="/projects"
                className="h-9 px-4 rounded-md border border-border bg-panel-alt hover:border-faint text-ink text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <ArrowUpRight size={14} />
                <span>Start Real Build</span>
              </a>
            </div>
          </div>

          {/* Scenario Selector Strip */}
          <div className="pt-3.5 border-t border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 shrink-0">
              <Sparkles size={14} className="text-accent" />
              <span className="font-semibold text-ink">Scenario preset</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
              {SIMULATION_SCENARIOS.map((scenario) => {
                const isActive = scenario.id === selectedScenarioId;
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => {
                      setSelectedScenarioId(scenario.id);
                      setSimStepIndex(-1);
                      setSimPlaying(false);
                      setSimLogs([]);
                    }}
                    className={`h-8 px-3 rounded-sm border text-xs font-medium flex items-center transition-colors cursor-pointer ${
                      isActive
                        ? "border-accent bg-accent-soft text-accent font-semibold"
                        : "border-border bg-panel-alt text-muted hover:text-ink"
                    }`}
                  >
                    {scenario.name}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 text-xs font-mono text-muted tabular shrink-0">
              <span>
                Steps <strong className="text-ink">{currentScenario.steps.length}</strong>
              </span>
              <span>·</span>
              <span>
                Est <strong className="text-ink">{currentScenario.estimatedRuntime}</strong>
              </span>
              <span>·</span>
              <span className="text-ok font-semibold">{currentScenario.tokenSavings}</span>
            </div>
          </div>
        </header>

        {/* =========================================================================
            2. TELEMETRY KPI STRIP
        ========================================================================= */}
        <section aria-label="System Telemetry" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.id}
                id={`metric-${metric.id}`}
                className="p-3.5 rounded-lg border border-border bg-panel shadow-apple space-y-1.5"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-medium text-muted truncate">{metric.label}</span>
                  <Icon size={14} className="text-muted shrink-0" />
                </div>

                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono text-xl sm:text-2xl font-bold text-ink tracking-tight tabular">
                    {metric.value}
                  </span>
                  {metric.trend && (
                    <span className="text-[11px] font-mono font-semibold text-ok">
                      {metric.trend}
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-muted truncate">{metric.subtext}</p>
              </div>
            );
          })}
        </section>

        {/* =========================================================================
            3. WORKFLOW STAGE FILTER & NAVIGATOR
        ========================================================================= */}
        <section aria-label="Pipeline Stages and Views" className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-px">
            {/* View Mode Switcher */}
            <nav
              role="tablist"
              aria-label="Orchestrator Views"
              className="flex items-center gap-1 overflow-x-auto scrollbar-none shrink-0"
            >
              {(
                [
                  { id: "graph" as const, label: "Visual Graph", icon: GitBranch },
                  { id: "spatial" as const, label: "3D Topology", icon: Box },
                  { id: "timeline" as const, label: "Execution Timeline", icon: ListOrdered },
                  { id: "roster" as const, label: "Agent Roster", icon: Grid },
                  { id: "artifacts" as const, label: "Deliverables", icon: FileCode },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  id={`view-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === id}
                  onClick={() => setViewMode(id)}
                  className={`relative px-3.5 py-2.5 text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer ${
                    viewMode === id
                      ? "text-accent font-semibold after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-accent"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon size={14} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>

            <div className="text-xs font-mono text-muted flex items-center gap-2 pb-2 sm:pb-0">
              <span>Stage filter:</span>
              <span className="font-semibold text-ink uppercase">{selectedStage}</span>
            </div>
          </div>

          {/* 5 Stage Filter Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <button
              id="stage-filter-all"
              type="button"
              onClick={() => setSelectedStage("all")}
              className={`text-left p-3 rounded-md border transition-colors cursor-pointer ${
                selectedStage === "all"
                  ? "border-accent bg-accent-soft text-ink"
                  : "border-border bg-panel text-ink hover:border-faint"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">All Stages</span>
                <span className="text-[11px] font-mono text-muted">17</span>
              </div>
              <p className="mt-1 text-[11px] text-muted line-clamp-1">
                Full autonomous software lifecycle
              </p>
            </button>

            {FLOW_STAGES.map((stage) => {
              const isSelected = selectedStage === stage.id;
              return (
                <button
                  key={stage.id}
                  id={`stage-filter-${stage.id}`}
                  type="button"
                  onClick={() => setSelectedStage(stage.id)}
                  className={`text-left p-3 rounded-md border transition-colors cursor-pointer ${
                    isSelected
                      ? "border-accent bg-accent-soft text-ink"
                      : "border-border bg-panel text-ink hover:border-faint"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: stage.color }}
                      />
                      <span className="text-xs font-semibold truncate">
                        {stage.stepNumber}. {stage.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-muted shrink-0">
                      {stage.agentIds.length}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted line-clamp-1">
                    {stage.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* =========================================================================
            4. SIMULATION EXECUTION CONTROLS & STREAMING BANNER
        ========================================================================= */}
        <section
          aria-label="Simulation Status Bar"
          className="p-4 rounded-lg border border-border bg-panel shadow-apple space-y-3"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Control buttons - Standardized to h-7 (28px) */}
              <div className="flex items-center gap-1">
                <button
                  id="sim-play-toggle"
                  type="button"
                  onClick={simPlaying ? handlePauseSim : handleStartSim}
                  className="h-8 px-3 rounded-sm bg-accent hover:bg-ember-glow text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title={simPlaying ? "Pause" : "Play Simulation"}
                >
                  {simPlaying ? (
                    <>
                      <Pause size={12} className="fill-current" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play size={12} className="fill-current" />
                      <span>Run</span>
                    </>
                  )}
                </button>
                <button
                  id="sim-step-forward"
                  type="button"
                  onClick={handleStepForward}
                  className="h-8 w-8 rounded-sm border border-border bg-panel-alt hover:border-faint text-ink flex items-center justify-center transition-colors cursor-pointer"
                  title="Step Forward"
                >
                  <SkipForward size={13} />
                </button>
                <button
                  id="sim-reset"
                  type="button"
                  onClick={handleResetSim}
                  className="h-8 w-8 rounded-sm border border-border bg-panel-alt hover:border-faint text-ink flex items-center justify-center transition-colors cursor-pointer"
                  title="Reset Run"
                >
                  <RotateCcw size={13} />
                </button>
              </div>

              {/* Speed selector */}
              <div className="flex items-center gap-1 text-xs text-muted border-l border-border pl-3">
                <span className="font-medium text-muted text-[11px] mr-1">Speed</span>
                {[1, 2, 4].map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setSimSpeed(spd)}
                    className={`h-7 px-2 rounded-sm border font-mono text-[11px] font-semibold transition-colors cursor-pointer ${
                      simSpeed === spd
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border bg-panel-alt text-muted hover:text-ink"
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>

              {/* Status indicator */}
              <div className="flex items-center gap-2 pl-2 text-xs font-mono">
                {simPlaying ? (
                  <span className="inline-flex items-center gap-1.5 text-ok font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                    Running
                  </span>
                ) : simStepIndex >= currentScenario.steps.length - 1 ? (
                  <span className="inline-flex items-center gap-1.5 text-accent font-semibold">
                    <CheckCircle2 size={12} />
                    Completed
                  </span>
                ) : simStepIndex >= 0 ? (
                  <span className="text-warn font-semibold">
                    Paused at step {simStepIndex + 1}/{currentScenario.steps.length}
                  </span>
                ) : (
                  <span className="text-muted">Standby</span>
                )}
              </div>
            </div>

            {/* Console Log Toggle */}
            <div className="flex items-center gap-2">
              <button
                id="toggle-console-btn"
                type="button"
                onClick={() => setShowConsole(!showConsole)}
                className="h-8 px-3 rounded-sm border border-border bg-panel-alt hover:border-faint text-ink text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Terminal size={13} />
                <span>Agent Logs</span>
                {simLogs.length > 0 && (
                  <span className="font-mono text-[11px] text-accent font-semibold">
                    ({simLogs.length})
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-panel-alt overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{
                  width: `${
                    simStepIndex < 0
                      ? 0
                      : Math.round(((simStepIndex + 1) / currentScenario.steps.length) * 100)
                  }%`,
                }}
              />
            </div>

            {/* Current Active Step Banner */}
            {currentSimStep ? (
              <div className="flex items-center justify-between text-xs font-mono pt-0.5 text-ink">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="font-black text-black dark:text-white uppercase">
                    STEP {currentSimStep.stepNumber}/{currentScenario.steps.length}:
                  </span>
                  <strong className="px-1 border border-black bg-white dark:bg-black text-ink">
                    [{currentSimStep.agentLabel}]
                  </strong>
                  <span className="text-muted truncate">{currentSimStep.action}</span>
                </span>
                <span className="text-muted shrink-0 pl-2 font-bold">EST: {currentSimStep.durationSec}</span>
              </div>
            ) : (
              <div className="text-[11px] font-mono text-muted pt-0.5">
                Click <strong>"RUN"</strong> to simulate autonomous handoffs, tool calls, and produced code artifacts.
              </div>
            )}
          </div>

          {/* Terminal Logs Drawer */}
          {showConsole && (
            <div className="mt-2 border-2 border-black bg-[#0C0D10] text-[#00FF66] font-mono text-xs p-3 shadow-[2px_2px_0px_#000]">
              <div className="flex items-center justify-between pb-2 border-b border-white/20 text-[11px]">
                <span className="flex items-center gap-1.5 text-white font-bold">
                  <Terminal size={12} />
                  <span>AGENT STREAM LOG ({simLogs.length} EVENTS)</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSimLogs([])}
                  className="h-6 px-2 border border-white/40 bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold uppercase"
                >
                  CLEAR
                </button>
              </div>

              <div ref={logContainerRef} className="max-h-48 overflow-y-auto space-y-1 pt-2 font-mono text-[11px]">
                {simLogs.length === 0 ? (
                  <p className="text-muted/60 italic">No logs recorded yet. Start simulation to stream agent events.</p>
                ) : (
                  simLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-neutral-500 text-[10px] select-none">{log.time}</span>
                      <span className="text-[#FFE600] font-bold select-none">[{log.agent}]</span>
                      <span className="text-[#00FF66] flex-1">{log.text}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>

        {/* =========================================================================
            5. MAIN WORKSPACE: GRAPH / TIMELINE / ROSTER / ARTIFACTS
        ========================================================================= */}
        <section
          id={`flow-panel-${viewMode}`}
          role="tabpanel"
          aria-labelledby={`view-tab-${viewMode}`}
          className="bg-panel border border-border rounded-lg shadow-apple flex flex-col overflow-hidden"
        >
          {/* Module Sub-Header Strip */}
          <div className="h-11 px-4 bg-panel-alt/60 border-b border-border flex items-center justify-between gap-2 shrink-0 text-xs">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-ink flex items-center gap-2">
                {viewMode === "graph" && <GitBranch size={14} className="text-accent" />}
                {viewMode === "spatial" && <Box size={14} className="text-accent" />}
                {viewMode === "timeline" && <ListOrdered size={14} className="text-accent" />}
                {viewMode === "roster" && <Grid size={14} className="text-accent" />}
                {viewMode === "artifacts" && <FileCode size={14} className="text-accent" />}
                <span>
                  {viewMode === "graph" && "Topology Graph"}
                  {viewMode === "spatial" && "3D Spatial Swarm Topology"}
                  {viewMode === "timeline" && `Execution Waterfall · ${currentScenario.name}`}
                  {viewMode === "roster" && "Specialist Fleet Catalog"}
                  {viewMode === "artifacts" && "Deliverables Manifest"}
                </span>
              </span>
              <span className="text-muted text-xs hidden md:inline">
                {viewMode === "graph" && "— Click nodes to inspect autonomous dependencies"}
                {viewMode === "spatial" && "— Drag to orbit, click agent nodes to inspect live pipeline state"}
                {viewMode === "timeline" && "— Step-by-step verification waterfall"}
                {viewMode === "roster" && "— 17 specialized engineering personas"}
                {viewMode === "artifacts" && "— Synthesized code and architecture specifications"}
              </span>
            </div>

            <span className="text-[11px] font-mono text-muted uppercase shrink-0">
              {viewMode}
            </span>
          </div>

          {/* VIEW 1: GRAPH VIEW */}
          {viewMode === "graph" && (
            <div className="flex flex-col">
              <div className="px-4 py-2.5 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-panel-alt/40 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink">Interactive DAG</span>
                  <span className="text-muted">Pan, zoom, or click nodes to inspect agents</span>
                </div>

                <div className="flex items-center gap-4 text-muted text-[11px] font-medium">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-ok" />
                    Build Pipeline
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-secondary" />
                    Gateway Matrix
                  </span>
                </div>
              </div>

              <div className="h-[600px] w-full relative bg-base">
                <AgentFleetGraph
                  embedded={true}
                  selectedAgentId={selectedAgent?.id || activeSimAgentId}
                  onSelectAgent={handleSelectAgent}
                  filterStage={selectedStage}
                  activeSimAgentId={activeSimAgentId}
                  agentStats={agentStats}
                />
              </div>
            </div>
          )}

          {/* VIEW 1.5: 3D SPATIAL TOPOLOGY VIEW */}
          {viewMode === "spatial" && (
            <div className="h-[620px] w-full relative">
              <ForgeScene3D
                mode="embedded"
                initialFinish="obsidian"
                activeAgentId={selectedAgent?.id || activeSimAgentId}
                showControls
                className="w-full h-full"
              />
            </div>
          )}

          {/* VIEW 2: EXECUTION TIMELINE & WATERFALL */}
          {viewMode === "timeline" && (
            <div className="p-3 sm:p-4 space-y-3 font-mono">
              <div className="p-2.5 border-2 border-black dark:border-white/80 bg-neutral-50 dark:bg-[#22222E] shadow-[1.5px_1.5px_0px_#000] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-black text-xs sm:text-sm text-ink uppercase tracking-tight">
                    SEQUENTIAL EXECUTION WATERFALL: {currentScenario.name}
                  </h2>
                  <p className="text-[11px] text-muted">
                    Trace step durations, input requirements, emitted deliverables, and verification checkpoints.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={simPlaying ? handlePauseSim : handleStartSim}
                  className="h-7 px-3 border-2 border-black bg-brutal-yellow text-black font-mono text-xs font-black uppercase shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] self-start sm:self-auto shrink-0"
                >
                  {simPlaying ? "PAUSE SIMULATION" : "SIMULATE RUN"}
                </button>
              </div>

              <div className="space-y-2.5">
                {filteredTimelineSteps.map((step) => {
                  const isPast = simStepIndex > step.stepNumber - 1;
                  const isCurrent = simStepIndex === step.stepNumber - 1;

                  const agentMeta = AGENT_CATALOG.find((a) => a.id === step.agentId);
                  const AgentIcon = agentMeta?.icon || Activity;

                  return (
                    <div
                      key={step.stepNumber}
                      id={`timeline-step-${step.stepNumber}`}
                      className={`p-3 border-2 border-black dark:border-white/80 transition-none ${
                        isCurrent
                          ? "bg-brutal-yellow/20 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff]"
                          : isPast
                          ? "bg-white dark:bg-[#1E1E28] shadow-[1.5px_1.5px_0px_#000]"
                          : "bg-white/60 dark:bg-[#161620] opacity-75 shadow-[1px_1px_0px_#000]"
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
                        <div className="flex items-start gap-3">
                          {/* Step Badge & Agent Icon */}
                          <div
                            className="h-9 w-9 shrink-0 border-2 border-black dark:border-white flex items-center justify-center font-mono font-black text-xs shadow-[1px_1px_0px_#000]"
                            style={{
                              backgroundColor: `${agentMeta?.hue || "#14B8A6"}25`,
                              color: agentMeta?.hue || "#14B8A6",
                            }}
                          >
                            <AgentIcon size={18} strokeWidth={2.5} />
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-black text-ink">
                                STEP {step.stepNumber}.
                              </span>
                              <h3 className="font-black text-xs sm:text-sm text-ink uppercase">{step.action}</h3>
                              <span
                                className="font-mono text-[10px] uppercase font-black px-1.5 py-0.5 border border-black"
                                style={{
                                  backgroundColor: `${agentMeta?.hue || "#14B8A6"}20`,
                                  color: agentMeta?.hue || "#14B8A6",
                                }}
                              >
                                {step.agentLabel}
                              </span>
                              <span className="text-[10px] font-mono font-bold text-muted uppercase border border-black/30 bg-black/5 dark:bg-white/5 px-1 py-0.5">
                                {step.stage}
                              </span>
                            </div>

                            <p className="text-xs text-muted leading-relaxed max-w-3xl">
                              {step.detail}
                            </p>

                            {/* Inputs & Outputs Tags */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px] font-mono">
                              <span className="font-bold text-muted uppercase">INPUTS:</span>
                              {step.inputs.map((inp, i) => (
                                <span key={i} className="px-1.5 py-0.5 border border-black/40 bg-black/5 dark:bg-white/5 text-ink font-medium">
                                  {inp}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Right side: Deliverable chip and Execution Status - Standardized to h-7 */}
                        <div className="flex items-center justify-between lg:justify-end gap-2 self-stretch lg:self-auto border-t lg:border-t-0 pt-2 lg:pt-0 border-black/10">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewArtifactModal(step.artifactType as any);
                            }}
                            className="h-7 px-2 border-2 border-black bg-white dark:bg-[#2A2A36] text-ink font-mono text-[11px] font-black uppercase flex items-center gap-1.5 shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
                          >
                            <FileText size={12} strokeWidth={2.5} />
                            <span>{step.outputArtifact}</span>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                            <span className="text-muted text-[11px] font-bold flex items-center gap-1">
                              <Clock size={11} />
                              {step.durationSec}
                            </span>

                            {isPast ? (
                              <span className="h-7 px-2 border-2 border-black bg-emerald-400 text-black font-black uppercase text-[11px] flex items-center gap-1 shadow-[1px_1px_0px_#000]">
                                <CheckCircle2 size={11} strokeWidth={2.5} />
                                VERIFIED
                              </span>
                            ) : isCurrent ? (
                              <span className="h-7 px-2 border-2 border-black bg-brutal-yellow text-black font-black uppercase text-[11px] flex items-center gap-1 shadow-[1px_1px_0px_#000]">
                                <Activity size={11} strokeWidth={2.5} className="animate-spin" />
                                RUNNING
                              </span>
                            ) : (
                              <span className="h-7 px-2 border border-black/40 bg-neutral-100 dark:bg-[#2A2A36] text-muted font-bold uppercase text-[11px] flex items-center">
                                PENDING
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 3: AGENT FLEET MATRIX / ROSTER */}
          {viewMode === "roster" && (
            <div className="p-3 sm:p-4 space-y-3 font-mono">
              <div className="p-2.5 border-2 border-black dark:border-white/80 bg-neutral-50 dark:bg-[#22222E] shadow-[1.5px_1.5px_0px_#000] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-black text-xs sm:text-sm text-ink uppercase tracking-tight">
                    AGENT FLEET CATALOG ({filteredCatalog.length} OF 17 AGENTS)
                  </h2>
                  <p className="text-[11px] text-muted">
                    Specialized personas, tools, credit consumption, and model routing.
                  </p>
                </div>
                <div className="text-xs font-mono text-muted">
                  FILTERED: <strong className="text-ink uppercase font-black px-1 border border-black bg-white dark:bg-black">{selectedStage}</strong>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCatalog.map((agent) => {
                  const AgentIcon = agent.icon;
                  const isSimActive = activeSimAgentId === agent.id;

                  return (
                    <div
                      key={agent.id}
                      id={`agent-card-${agent.id}`}
                      className={`p-3.5 border-2 border-black dark:border-white/80 transition-none flex flex-col justify-between space-y-3 ${
                        isSimActive
                          ? "bg-brutal-yellow/20 shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff]"
                          : "bg-white dark:bg-[#1E1E28] shadow-[2px_2px_0px_#000]"
                      }`}
                    >
                      <div className="space-y-2.5">
                        {/* Card Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="h-9 w-9 shrink-0 border-2 border-black dark:border-white flex items-center justify-center font-black shadow-[1px_1px_0px_#000]"
                              style={{ backgroundColor: `${agent.hue}25`, color: agent.hue }}
                            >
                              <AgentIcon size={18} strokeWidth={2.5} />
                            </div>
                            <div>
                              <h3 className="font-black text-xs sm:text-sm text-ink uppercase">{agent.label}</h3>
                              <span className="text-[10px] font-mono uppercase tracking-wider text-muted font-bold">
                                {agent.stageLabel} STAGE • {agent.kind}
                              </span>
                            </div>
                          </div>

                          <span className="font-mono text-[10px] font-black px-1.5 py-0.5 border border-black bg-neutral-100 dark:bg-[#2A2A36] text-ink">
                            {agent.credits} CREDITS
                          </span>
                        </div>

                        {/* Purpose */}
                        <p className="text-xs text-muted leading-relaxed line-clamp-3">
                          {agent.purpose}
                        </p>

                        {/* Tools list */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-muted uppercase font-bold">CAPABILITIES & TOOLS:</span>
                          <div className="flex flex-wrap gap-1">
                            {agent.tools.map((t, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-mono font-bold px-1.5 py-0.5 border border-black/40 bg-black/5 dark:bg-white/5 text-ink"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Card Footer: Metrics and action - Standardized to h-7 */}
                      <div className="pt-2.5 border-t-2 border-black/10 flex items-center justify-between text-xs font-mono">
                        <div className="flex items-center gap-2.5 text-muted text-[11px]">
                          <span title="Success Rate">
                            <strong className="text-emerald-600 dark:text-emerald-400 font-black">{agent.successRate}%</strong> PASS
                          </span>
                          <span>•</span>
                          <span title="Avg Turnaround">
                            <strong className="text-ink font-bold">{agent.avgDuration}</strong>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedAgent(agent)}
                          className="h-7 px-2.5 border-2 border-black bg-brutal-yellow text-black font-mono text-xs font-black uppercase shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
                        >
                          INSPECT
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW 4: ARTIFACTS & DELIVERABLES EXPLORER */}
          {viewMode === "artifacts" && (
            <div className="p-3 sm:p-4 space-y-3 font-mono">
              <div className="p-2.5 border-2 border-black dark:border-white/80 bg-neutral-50 dark:bg-[#22222E] shadow-[1.5px_1.5px_0px_#000] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-black text-xs sm:text-sm text-ink uppercase tracking-tight">
                    GENERATED DELIVERABLES & WORK ARTIFACTS
                  </h2>
                  <p className="text-[11px] text-muted">
                    Audit-ready code, PRDs, architecture schemas, and test reports synthesized by the fleet.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopyArtifact(activeArtifactData.content)}
                  className="h-7 px-3 border-2 border-black bg-brutal-yellow text-black font-mono text-xs font-black uppercase flex items-center gap-1.5 shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] shrink-0 self-start sm:self-auto"
                >
                  {copiedArtifact ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.5} />}
                  <span>{copiedArtifact ? "COPIED" : "COPY ARTIFACT"}</span>
                </button>
              </div>

              {/* Artifact Tabs - Standardized to h-7 */}
              <div className="flex flex-wrap gap-1.5 p-1.5 border-2 border-black dark:border-white/80 bg-neutral-100 dark:bg-[#22222E]">
                {(
                  [
                    { key: "brief" as const, label: "BRIEF.MD" },
                    { key: "decision" as const, label: "ADR-001.MD" },
                    { key: "architecture" as const, label: "ARCHITECTURE.JSON" },
                    { key: "prd" as const, label: "PRD.MD" },
                    { key: "code" as const, label: "BILLING.TS" },
                    { key: "tests" as const, label: "TEST_REPORT.LOG" },
                    { key: "pr" as const, label: "GITHUB_PR_142.DIFF" },
                  ] as const
                ).map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveArtifactTab(key)}
                    className={`h-7 px-2.5 border-2 border-black font-mono text-[11px] font-black uppercase active:translate-x-[1px] active:translate-y-[1px] ${
                      activeArtifactTab === key
                        ? "bg-brutal-yellow text-black shadow-[1.5px_1.5px_0px_#000]"
                        : "bg-white dark:bg-[#181820] text-ink hover:bg-neutral-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Code / Content Viewer */}
              <div className="border-2 border-black bg-[#0C0D10] text-[#E0E0E0] font-mono text-xs p-3 shadow-[3px_3px_0px_#000] overflow-hidden">
                <div className="flex items-center justify-between pb-2 border-b border-white/20 text-muted text-[11px]">
                  <div className="flex items-center gap-2">
                    <FileCode size={13} className="text-brutal-yellow" />
                    <span className="font-black text-white">{activeArtifactData.filename}</span>
                    <span className="text-[9px] uppercase px-1 border border-white/30 bg-white/10 text-gray-300 font-bold">
                      {activeArtifactData.language}
                    </span>
                  </div>
                  <span className="text-[11px] text-[#00FF66] font-bold flex items-center gap-1">
                    <CheckCircle2 size={12} strokeWidth={2.5} />
                    SYNTHESIZED BY AGENT
                  </span>
                </div>

                <pre className="mt-2.5 overflow-x-auto text-gray-200 leading-relaxed font-mono p-1 text-[11px]">
                  <code>{activeArtifactData.content}</code>
                </pre>
              </div>
            </div>
          )}
        </section>

        {/* =========================================================================
            6. AGENT DEEP-DIVE INSPECTOR (SLIDE-OVER DRAWER)
        ========================================================================= */}
        {selectedAgent && (
          <div className="fixed inset-0 z-50 flex justify-end">
            <button
              type="button"
              aria-label="Close inspector backdrop"
              className="fixed inset-0 bg-black/60 cursor-default w-full h-full border-none"
              onClick={() => setSelectedAgent(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative z-10 w-full max-w-md h-full bg-[#F5F4F0] dark:bg-[#1C1C24] border-l-2 border-black dark:border-white/80 shadow-[-4px_0px_0px_#000] flex flex-col justify-between overflow-y-auto font-mono"
            >
              {/* Drawer Title Bar */}
              <div className="h-10 px-4 bg-[#EFECE6] dark:bg-[#22222C] border-b-2 border-black dark:border-white/80 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 border border-black bg-brutal-yellow" />
                  <span className="font-black text-xs uppercase text-ink">AGENT_INSPECTOR.EXE</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAgent(null)}
                  className="h-6 w-6 border border-black bg-white dark:bg-black flex items-center justify-center font-bold hover:bg-neutral-200"
                  aria-label="Close drawer"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </div>

              <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                {/* Agent Header Card */}
                <div className="p-3 border-2 border-black bg-white dark:bg-[#22222E] shadow-[2px_2px_0px_#000] flex items-center gap-3">
                  <div
                    className="h-11 w-11 shrink-0 border-2 border-black flex items-center justify-center font-bold shadow-[1px_1px_0px_#000]"
                    style={{ backgroundColor: `${selectedAgent.hue}25`, color: selectedAgent.hue }}
                  >
                    <selectedAgent.icon size={22} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-ink uppercase">{selectedAgent.label}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[9px] uppercase font-black px-1 border border-black bg-neutral-100 dark:bg-black text-ink">
                        STAGE {selectedAgent.stage}
                      </span>
                      <span className="font-mono text-[9px] font-black text-ink uppercase px-1 border border-black bg-brutal-yellow">
                        {selectedAgent.credits} CREDITS/RUN
                      </span>
                    </div>
                  </div>
                </div>

                {/* Purpose */}
                <div className="space-y-1">
                  <span className="font-mono text-[10px] font-black text-muted uppercase">ROLE MISSION</span>
                  <p className="text-xs text-ink leading-relaxed border-2 border-black p-2.5 bg-white dark:bg-[#181820]">
                    {selectedAgent.purpose}
                  </p>
                </div>

                {/* Model Engine info */}
                <div className="p-3 border-2 border-black bg-white dark:bg-[#181820] shadow-[1.5px_1.5px_0px_#000] space-y-2 text-xs font-mono">
                  <span className="font-mono text-[10px] font-black text-ink uppercase flex items-center gap-1.5">
                    <Cpu size={12} strokeWidth={2.5} />
                    MODEL & INFERENCE CONFIGURATION
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted text-[10px] uppercase font-bold">PRIMARY LLM:</span>
                      <p className="font-black text-ink">{selectedAgent.model}</p>
                    </div>
                    <div>
                      <span className="text-muted text-[10px] uppercase font-bold">CONTEXT STRATEGY:</span>
                      <p className="font-black text-ink">AST-PRUNED</p>
                    </div>
                    <div>
                      <span className="text-muted text-[10px] uppercase font-bold">AVG RESPONSE:</span>
                      <p className="font-black text-ink">{selectedAgent.avgDuration}</p>
                    </div>
                    <div>
                      <span className="text-muted text-[10px] uppercase font-bold">PASS RATE:</span>
                      <p className="font-black text-emerald-600 dark:text-emerald-400">{selectedAgent.successRate}%</p>
                    </div>
                  </div>
                </div>

                {/* Tools & Plugins */}
                <div className="space-y-1.5">
                  <span className="font-mono text-[10px] font-black text-muted uppercase">CORE PLUGINS & TOOLS</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAgent.tools.map((tool, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 border border-black bg-white dark:bg-[#2A2A36] text-[10px] font-black text-ink shadow-[1px_1px_0px_#000]"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Inputs & Outputs */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div className="p-2 border-2 border-black bg-white dark:bg-[#181820] space-y-1">
                    <span className="text-[10px] font-black text-muted uppercase">INPUTS:</span>
                    <ul className="space-y-1 text-ink text-[10px]">
                      {selectedAgent.inputs.map((inp, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <ChevronRight size={10} strokeWidth={2.5} />
                          <span>{inp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-2 border-2 border-black bg-white dark:bg-[#181820] space-y-1">
                    <span className="text-[10px] font-black text-muted uppercase">OUTPUTS:</span>
                    <ul className="space-y-1 text-ink text-[10px]">
                      {selectedAgent.outputs.map((out, i) => (
                        <li key={i} className="flex items-center gap-1">
                          <CheckCircle2 size={10} strokeWidth={2.5} className="text-emerald-500" />
                          <span>{out}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Sample Prompt */}
                <div className="space-y-1">
                  <span className="font-mono text-[10px] font-black text-muted uppercase">SAMPLE TASK PROMPT</span>
                  <div className="p-2.5 bg-[#0C0D10] text-[#00FF66] font-mono text-[11px] leading-relaxed border-2 border-black shadow-[1.5px_1.5px_0px_#000]">
                    "{selectedAgent.samplePrompt}"
                  </div>
                </div>
              </div>

              {/* Bottom Actions - Standardized to h-7 */}
              <div className="p-3 border-t-2 border-black bg-[#EFECE6] dark:bg-[#22222C] space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAgent(null);
                    handleStartSim();
                  }}
                  className="h-7 w-full border-2 border-black bg-brutal-yellow text-black font-mono text-xs font-black uppercase shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
                >
                  TEST RUN AGENT IN ISOLATION
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedAgent(null)}
                  className="h-7 w-full border-2 border-black bg-white dark:bg-[#181820] text-ink font-mono text-xs font-black uppercase shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
                >
                  CLOSE INSPECTOR
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            7. ARTIFACT PREVIEW MODAL
        ========================================================================= */}
        {modalArtifactData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-mono">
            <button
              type="button"
              aria-label="Close artifact preview backdrop"
              className="fixed inset-0 bg-black/60 cursor-default w-full h-full border-none"
              onClick={() => setPreviewArtifactModal(null)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="relative z-10 w-full max-w-3xl max-h-[85vh] bg-white dark:bg-[#181820] border-2 border-black dark:border-white/80 shadow-[4px_4px_0px_#000] dark:shadow-[4px_4px_0px_#fff] flex flex-col overflow-hidden"
            >
              {/* Modal Title bar */}
              <div className="h-9 px-3 bg-[#EFECE6] dark:bg-[#22222C] border-b-2 border-black dark:border-white/80 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <FileCode size={13} strokeWidth={2.5} />
                  <span className="font-black text-xs text-ink uppercase">{modalArtifactData.title}</span>
                  <span className="text-[10px] text-muted font-bold">({modalArtifactData.filename})</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyArtifact(modalArtifactData.content)}
                    className="h-7 px-2 border-2 border-black bg-brutal-yellow text-black font-mono text-[11px] font-black uppercase flex items-center gap-1 shadow-[1px_1px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
                  >
                    {copiedArtifact ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2.5} />}
                    <span>{copiedArtifact ? "COPIED" : "COPY"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewArtifactModal(null)}
                    className="h-7 w-7 border-2 border-black bg-white dark:bg-black text-ink flex items-center justify-center font-black active:translate-x-[1px] active:translate-y-[1px]"
                  >
                    <X size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

              <div className="p-3 overflow-y-auto flex-1 bg-[#0C0D10] text-[#E0E0E0] font-mono text-xs">
                <pre className="leading-relaxed whitespace-pre-wrap text-[11px]">
                  <code>{modalArtifactData.content}</code>
                </pre>
              </div>

              <div className="h-8 px-3 border-t-2 border-black dark:border-white/80 flex items-center justify-between text-[11px] font-mono bg-[#EFECE6] dark:bg-[#22222C]">
                <span className="text-muted font-bold uppercase">GENERATED BY AUTONOMOUS AGENT PIPELINE</span>
                <button
                  type="button"
                  onClick={() => setPreviewArtifactModal(null)}
                  className="h-6 px-2 border border-black bg-white dark:bg-black text-ink font-black uppercase text-[10px]"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
