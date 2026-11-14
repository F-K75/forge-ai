import { useMemo, useState, useCallback, useReducer, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type NodeProps,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { AGENTS } from "../lib/agents";
import { GATEWAY_AGENTS } from "../lib/gatewayAgents";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Activity,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  RotateCcw,
  Timer,
} from "lucide-react";

const BUILD_ORDER = ["architect", "business_improver", "designer", "developer", "integration", "pm"] as const;

type AgentStatus = "idle" | "running" | "success" | "error";

const STATUS_META: Record<AgentStatus, { icon: typeof Activity; color: string; label: string }> = {
  idle: { icon: Clock, color: "rgb(var(--muted))", label: "Idle" },
  running: { icon: Loader2, color: "rgb(var(--primary))", label: "Running" },
  success: { icon: CheckCircle2, color: "rgb(var(--success))", label: "Success" },
  error: { icon: XCircle, color: "rgb(var(--error))", label: "Error" },
};

const MOCK_RUNS: Record<string, { lastRun: string; duration: string; successRate: number }> = {
  architect: { lastRun: "2m ago", duration: "1.2s", successRate: 98 },
  business_improver: { lastRun: "5m ago", duration: "0.8s", successRate: 95 },
  designer: { lastRun: "3m ago", duration: "1.5s", successRate: 92 },
  developer: { lastRun: "1m ago", duration: "2.3s", successRate: 89 },
  integration: { lastRun: "4m ago", duration: "0.6s", successRate: 97 },
  pm: { lastRun: "6m ago", duration: "0.4s", successRate: 94 },
  business_analyst: { lastRun: "7m ago", duration: "0.9s", successRate: 96 },
  decision_engine: { lastRun: "8m ago", duration: "1.1s", successRate: 91 },
  prd_writer: { lastRun: "9m ago", duration: "1.3s", successRate: 90 },
  epic_generator: { lastRun: "10m ago", duration: "0.7s", successRate: 88 },
  story_generator: { lastRun: "11m ago", duration: "0.5s", successRate: 87 },
  task_generator: { lastRun: "12m ago", duration: "0.6s", successRate: 85 },
  sprint_planner: { lastRun: "13m ago", duration: "0.4s", successRate: 93 },
  scrum_master: { lastRun: "14m ago", duration: "0.3s", successRate: 95 },
  task_executor: { lastRun: "15m ago", duration: "2.1s", successRate: 82 },
};

export type AgentRunStats = {
  lastRun?: string;
  duration?: string;
  successRate?: number;
};

const AGENT_CONNECTIONS = [
  { id: "e-arch-biz", source: "architect", target: "business_improver", animated: true, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 1.5 } },
  { id: "e-biz-des", source: "business_improver", target: "designer", animated: true, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 1.5 } },
  { id: "e-des-pm", source: "designer", target: "pm", animated: true, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 1.5 } },
  { id: "e-pm-dev", source: "pm", target: "developer", animated: true, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 1.5 } },
  { id: "e-dev-int", source: "developer", target: "integration", animated: true, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.15)", strokeWidth: 1.5 } },
  { id: "e-arch-pm", source: "architect", target: "pm", animated: false, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 } },
  { id: "e-des-dev", source: "designer", target: "developer", animated: false, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 } },
];

const GATEWAY_CONNECTIONS = [
  { id: "e-ba-de", source: "business_analyst", target: "decision_engine", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.3)", strokeWidth: 1.5 } },
  { id: "e-de-prd", source: "decision_engine", target: "prd_writer", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.3)", strokeWidth: 1.5 } },
  { id: "e-prd-des", source: "prd_writer", target: "designer", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.3)", strokeWidth: 1.5 } },
  { id: "e-des-eg", source: "designer", target: "epic_generator", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.3)", strokeWidth: 1.5 } },
  { id: "e-eg-sg", source: "epic_generator", target: "story_generator", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.3)", strokeWidth: 1.5 } },
  { id: "e-sg-tg", source: "story_generator", target: "task_generator", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.3)", strokeWidth: 1.5 } },
  { id: "e-tg-sp", source: "task_generator", target: "sprint_planner", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.3)", strokeWidth: 1.5 } },
  { id: "e-sp-sm", source: "sprint_planner", target: "scrum_master", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.3)", strokeWidth: 1.5 } },
  { id: "e-sm-te", source: "scrum_master", target: "task_executor", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.3)", strokeWidth: 1.5 } },
  { id: "e-te-int", source: "task_executor", target: "integration", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.3)", strokeWidth: 1.5 } },
];

type RunState = {
  active: boolean;
  currentIndex: number;
  results: Record<string, "running" | "success" | "error">;
};

const PIPELINE_ORDER = [
  "architect",
  "business_improver",
  "designer",
  "pm",
  "developer",
  "integration",
  "business_analyst",
  "decision_engine",
  "prd_writer",
  "epic_generator",
  "story_generator",
  "task_generator",
  "sprint_planner",
  "scrum_master",
  "task_executor",
];

function runReducer(state: RunState, action: { type: "tick" }): RunState {
  if (!state.active) return state;

  const current = PIPELINE_ORDER[state.currentIndex];
  const nextIndex = state.currentIndex + 1;
  const finished = { ...state.results, [current]: "success" as const };

  if (nextIndex >= PIPELINE_ORDER.length) {
    return { active: false, currentIndex: nextIndex, results: finished };
  }

  return {
    active: true,
    currentIndex: nextIndex,
    results: { ...finished, [PIPELINE_ORDER[nextIndex]]: "running" },
  };
}

function LaneLabelNode({ data }: NodeProps) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-2 border-black dark:border-white/80 bg-white dark:bg-[#1E1E28] shadow-[1.5px_1.5px_0px_#000] dark:shadow-[1.5px_1.5px_0px_#fff] select-none font-mono">
      <span className="h-2.5 w-2.5 rounded-none border border-black dark:border-white" style={{ backgroundColor: data.color || "#14B8A6" }} />
      <span className="font-mono text-xs font-black tracking-tight text-ink uppercase">{data.label}</span>
      {data.badge && (
        <span className="text-[10px] font-mono font-black px-1.5 py-0.5 border border-black bg-brutal-yellow text-black">
          {data.badge}
        </span>
      )}
    </div>
  );
}

function AgentNode({ data, selected }: NodeProps) {
  const statusInfo = STATUS_META[data.status as AgentStatus] || STATUS_META.idle;
  const StatusIcon = statusInfo.icon;
  const run = data.runStats || MOCK_RUNS[data.id];
  const isSelected = selected || data.isSelected;
  const isDimmed = data.isDimmed;
  const isActiveSim = data.isActiveSim || data.status === "running";
  const AgentIcon = data.icon || Activity;
  const statusColor = data.status === "success" ? "#10B981" : data.status === "error" ? "#EF4444" : statusInfo.color;

  return (
    <div
      className={[
        "relative min-w-[210px] border-2 transition-none select-none",
        isDimmed ? "opacity-30 grayscale" : "opacity-100",
        isActiveSim ? "ring-2 ring-black dark:ring-white scale-[1.02]" : "",
        isSelected
          ? "border-black dark:border-white bg-brutal-yellow text-black shadow-[3px_3px_0px_#000] dark:shadow-[3px_3px_0px_#fff]"
          : "border-black dark:border-white/80 bg-white dark:bg-[#181820] hover:border-black dark:hover:border-white shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]",
      ].join(" ")}
    >
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-2 !border-black dark:!border-white !rounded-none" style={{ background: data.hue }} />

      <div className="p-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center border-2 border-black dark:border-white/80 font-black shadow-[1px_1px_0px_#000]"
            style={{ backgroundColor: `${data.hue}25`, color: data.hue }}
          >
            <AgentIcon size={18} strokeWidth={2.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <p className="truncate text-xs font-black text-ink">{data.label}</p>
              {data.stage && (
                <span className="text-[9px] font-mono uppercase tracking-wider font-bold px-1 py-0.5 border border-black/30 dark:border-white/30 bg-black/5 dark:bg-white/5 text-muted">
                  {data.stage}
                </span>
              )}
            </div>
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-muted mt-0.5">
              <StatusIcon size={11} style={{ color: statusColor }} className={data.status === "running" ? "animate-spin" : ""} />
              <span style={{ color: statusColor }} className="font-bold">{statusInfo.label}</span>
            </span>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t-2 border-black/10 dark:border-white/10 flex items-center justify-between text-[10px] font-mono text-muted">
          {run?.lastRun ? (
            <span className="flex items-center gap-1 truncate">
              <Clock size={10} />
              {run.lastRun}
            </span>
          ) : (
            <span className="text-muted/60">STANDBY</span>
          )}
          {run?.successRate != null && (
            <span className="flex items-center gap-1 font-bold text-ink">
              <CheckCircle2 size={10} className="text-emerald-500" />
              {run.successRate}%
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-2 !border-black dark:!border-white !rounded-none" style={{ background: data.hue }} />
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode, laneLabel: LaneLabelNode };

function GraphHeader() {
  return (
    <div className="flex items-center justify-between border-b border-inlay px-5 py-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/10 text-accent">
          <Activity size={12} aria-hidden="true" />
        </span>
        <span className="text-sm font-medium text-ink">Agent Pipeline</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-inlay-strong bg-inlay px-2.5 py-1 text-[11px] text-muted">
          <Activity size={10} />
          {AGENTS.length + GATEWAY_AGENTS.length} agents
        </span>
      </div>
    </div>
  );
}

function AgentDetailPanel({ agent, kind, onClose }: { agent: typeof AGENTS[number] | typeof GATEWAY_AGENTS[number]; kind: "build" | "gateway"; onClose: () => void }) {
  const statusInfo = STATUS_META.idle;
  const StatusIcon = statusInfo.icon;
  const credits = "credits" in agent ? agent.credits : undefined;
  const run = MOCK_RUNS[agent.id];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex h-full flex-col border-l border-inlay bg-panel/95 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-inlay px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-inlay-strong"
            style={{ background: `${agent.hue}18`, color: agent.hue }}
          >
            <agent.icon size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">{agent.label}</p>
            <span className="text-[11px] text-muted">
              {kind === "build" ? "Build pipeline" : (agent as typeof GATEWAY_AGENTS[number]).stage}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 w-8 cursor-pointer rounded-full bg-panel-alt text-xs font-semibold text-ink transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="rounded-xl border border-inlay bg-inlay-subtle p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Status</p>
            <div className="flex items-center gap-2">
              <StatusIcon size={14} style={{ color: statusInfo.color }} />
              <span className="text-sm text-ink">{statusInfo.label}</span>
            </div>
          </div>

          {kind === "gateway" && (
            <div className="rounded-xl border border-inlay bg-inlay-subtle p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Purpose</p>
              <p className="text-sm text-ink leading-relaxed">{(agent as typeof GATEWAY_AGENTS[number]).purpose}</p>
            </div>
          )}

          {credits !== undefined && (
            <div className="rounded-xl border border-inlay bg-inlay-subtle p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Credits</p>
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-ember" />
                <span className="text-sm text-ink">{credits} credits per run</span>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-inlay bg-inlay-subtle p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Business impact</p>
            <div className="space-y-2 text-sm text-ink">
              <div className="flex items-center justify-between">
                <span className="text-muted">Est. time saved</span>
                <span className="font-medium">{run ? `${Math.floor(Math.random() * 4 + 1)}h` : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Quality score</span>
                <span className="font-medium">{run ? `${run.successRate}%` : "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Automation</span>
                <span className="font-medium">{kind === "build" ? "Full pipeline" : "Focused workflow"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-inlay bg-inlay-subtle p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Actions</p>
            <div className="flex flex-col gap-2">
              <button className="bb-btn bb-btn-primary w-full">Run agent</button>
              <button className="bb-btn bb-btn-tonal w-full">View runs</button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export interface AgentFleetGraphProps {
  onClose?: () => void;
  embedded?: boolean;
  autoPlay?: boolean;
  onTourEnd?: () => void;
  agentStats?: Record<string, AgentRunStats>;
  selectedAgentId?: string | null;
  onSelectAgent?: (agent: any, kind: "build" | "gateway") => void;
  filterStage?: string | null;
  activeSimAgentId?: string | null;
}

const BUILD_AGENT_STAGES: Record<string, string> = {
  architect: "definition",
  business_improver: "execution",
  designer: "definition",
  developer: "execution",
  integration: "execution",
  pm: "planning",
};

export function AgentFleetGraph({
  onClose,
  embedded,
  autoPlay,
  onTourEnd,
  agentStats,
  selectedAgentId,
  onSelectAgent,
  filterStage,
  activeSimAgentId,
}: AgentFleetGraphProps) {
  const [selectedAgent, setSelectedAgent] = useState<{ id: string; kind: "build" | "gateway" } | null>(null);
  const [{ active, currentIndex, results }, dispatch] = useReducer(runReducer, {
    active: false,
    currentIndex: 0,
    results: {},
  });

  useEffect(() => {
    if (selectedAgentId) {
      const isBuild = AGENTS.some((a) => a.id === selectedAgentId);
      setSelectedAgent({ id: selectedAgentId, kind: isBuild ? "build" : "gateway" });
    }
  }, [selectedAgentId]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => dispatch({ type: "tick" }), 900);
    return () => clearInterval(timer);
  }, [active, currentIndex]);

  useEffect(() => {
    if (autoPlay && !active) {
      dispatch({ type: "tick" });
    }
  }, [autoPlay]);

  useEffect(() => {
    if (!autoPlay) return;
    const allDone = PIPELINE_ORDER.every((id) => results[id] === "success");
    if (allDone && results && Object.keys(results).length === PIPELINE_ORDER.length) {
      const timer = setTimeout(() => {
        onTourEnd?.();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [results, autoPlay, onTourEnd]);

  const startRun = useCallback(() => {
    dispatch({ type: "tick" });
  }, []);

  const resetRun = useCallback(() => {
    setSelectedAgent(null);
  }, []);

  const pipelineNodes = useMemo(() => {
    const laneX = 80;
    const startY = 30;
    const gap = 120;
    return BUILD_ORDER.map((id, index) => {
      const agent = AGENTS.find((a) => a.id === id)!;
      const run = agentStats?.[agent.id] || MOCK_RUNS[agent.id];
      const simulatedStatus = results[agent.id] || "idle";
      const stage = BUILD_AGENT_STAGES[agent.id] || "execution";
      const isDimmed = Boolean(filterStage && filterStage !== "all" && filterStage !== stage);
      const isActiveSim = activeSimAgentId === agent.id;
      const isSelected = selectedAgentId === agent.id || selectedAgent?.id === agent.id;

      return {
        id: agent.id,
        type: "agentNode",
        position: { x: laneX, y: startY + index * gap },
        data: {
          id: agent.id,
          label: agent.label,
          hue: agent.hue,
          icon: agent.icon,
          stage,
          kind: "build" as const,
          status: isActiveSim ? "running" : active ? simulatedStatus : "idle",
          lastRun: run?.lastRun,
          duration: run?.duration,
          successRate: run?.successRate,
          runStats: run,
          isDimmed,
          isActiveSim,
          isSelected,
        },
      };
    });
  }, [results, active, agentStats, filterStage, activeSimAgentId, selectedAgentId, selectedAgent]);

  const gatewayNodes = useMemo(() => {
    const laneX = 360;
    const startY = 30;
    const gap = 120;
    return GATEWAY_AGENTS.map((agent, index) => {
      const id = agent.id;
      const run = agentStats?.[id] || MOCK_RUNS[id];
      const simulatedStatus = results[id] || "idle";
      const stage = agent.stage.toLowerCase();
      const isDimmed = Boolean(filterStage && filterStage !== "all" && filterStage !== stage);
      const isActiveSim = activeSimAgentId === agent.id;
      const isSelected = selectedAgentId === agent.id || selectedAgent?.id === agent.id;

      return {
        id,
        type: "agentNode",
        position: { x: laneX, y: startY + index * gap },
        data: {
          id: agent.id,
          label: agent.label,
          hue: agent.hue,
          icon: agent.icon,
          stage,
          kind: "gateway" as const,
          status: isActiveSim ? "running" : active ? simulatedStatus : "idle",
          lastRun: run?.lastRun,
          duration: run?.duration,
          successRate: run?.successRate,
          runStats: run,
          isDimmed,
          isActiveSim,
          isSelected,
        },
      };
    });
  }, [results, active, agentStats, filterStage, activeSimAgentId, selectedAgentId, selectedAgent]);

  const allNodes = useMemo(() => {
    const buildLabel = {
      id: "lane-build",
      type: "laneLabel" as const,
      position: { x: 40, y: -20 },
      data: { label: "Build Orchestrator", color: "#14B8A6", badge: "6 AGENTS" },
    };
    const gatewayLabel = {
      id: "lane-gateway",
      type: "laneLabel" as const,
      position: { x: 340, y: -20 },
      data: { label: "Gateway Matrix", color: "#A855F7", badge: "11 AGENTS" },
    };
    return [...([buildLabel, gatewayLabel] as any), ...pipelineNodes, ...gatewayNodes];
  }, [pipelineNodes, gatewayNodes]);

  const initialEdges = useMemo(() => [...AGENT_CONNECTIONS, ...GATEWAY_CONNECTIONS], []);
  const [nodes, setNodes, onNodesChange] = useNodesState(allNodes as any);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    setNodes(allNodes as any);
  }, [allNodes, setNodes]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    const kind = node.data.kind;
    const agentData =
      kind === "build"
        ? AGENTS.find((a) => a.id === node.id)
        : GATEWAY_AGENTS.find((a) => a.id === node.id);
    setSelectedAgent({ id: node.id, kind });
    if (onSelectAgent && agentData) {
      onSelectAgent(agentData, kind);
    }
  }, [onSelectAgent]);

  const selectedAgentData = selectedAgent
    ? (selectedAgent.kind === "build"
        ? AGENTS.find((a) => a.id === selectedAgent.id)
        : GATEWAY_AGENTS.find((a) => a.id === selectedAgent.id))
    : null;

  const graphContent = (
    <div className={`flex flex-col ${embedded ? "h-[55vh] w-full" : "h-[75vh] w-full"} overflow-hidden border-2 border-black dark:border-white/80 bg-white dark:bg-[#121218] shadow-[2px_2px_0px_#000] dark:shadow-[2px_2px_0px_#fff]`}>
      {!embedded && <GraphHeader />}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 h-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            proOptions={{ hideAttribution: true }}
            className="h-full w-full"
            nodeTypes={nodeTypes}
            panOnScroll
            zoomOnScroll
            zoomOnPinch
            minZoom={0.5}
            maxZoom={1.6}
          >
            <Background color="#22222E" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>

          <div className="absolute bottom-3 left-3 flex items-center gap-2 z-10 font-mono">
            <button
              type="button"
              onClick={startRun}
              disabled={active}
              className="h-7 px-3 flex items-center gap-1.5 border-2 border-black bg-brutal-yellow text-black font-black uppercase text-[11px] shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play size={11} className="fill-current" />
              {active ? "RUNNING..." : "SIMULATE DAG"}
            </button>
            <button
              type="button"
              onClick={resetRun}
              className="h-7 px-2.5 flex items-center gap-1.5 border-2 border-black bg-white dark:bg-[#1E1E28] text-black dark:text-white font-black uppercase text-[11px] shadow-[1.5px_1.5px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
            >
              <RotateCcw size={11} />
              RESET
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {selectedAgent && selectedAgentData && (
            <AgentDetailPanel
              key={`${selectedAgent.kind}-${selectedAgent.id}`}
              agent={selectedAgentData}
              kind={selectedAgent.kind}
              onClose={() => setSelectedAgent(null)}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between border-t border-inlay px-4 py-2">
        <div className="flex items-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ok" />
            Build pipeline
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-accent" />
            Gateway agents
          </span>
        </div>
        <span className="text-[11px] text-faint">Click a node to inspect</span>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        {graphContent}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex items-start justify-center p-3 md:p-4"
    >
      {graphContent}
    </motion.div>
  );
}
