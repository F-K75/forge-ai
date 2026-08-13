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
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Minus,
  Square,
  Activity,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  RotateCcw,
  ChevronRight,
  Timer,
} from "lucide-react";

const BUILD_ORDER = ["architect", "business_improver", "designer", "developer", "integration", "pm"] as const;

const GATEWAY_STAGE_ORDER = ["Discovery", "Definition", "Planning", "Execution"] as const;

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
  designer_gateway: { lastRun: "4m ago", duration: "1.5s", successRate: 92 },
  epic_generator: { lastRun: "10m ago", duration: "0.7s", successRate: 88 },
  story_generator: { lastRun: "11m ago", duration: "0.5s", successRate: 87 },
  task_generator: { lastRun: "12m ago", duration: "0.6s", successRate: 85 },
  sprint_planner: { lastRun: "13m ago", duration: "0.4s", successRate: 93 },
  scrum_master: { lastRun: "14m ago", duration: "0.3s", successRate: 95 },
  task_executor: { lastRun: "15m ago", duration: "2.1s", successRate: 82 },
};

type AgentRunStats = {
  lastRun?: string;
  duration?: string;
  successRate?: number;
};

const AGENT_CONNECTIONS = [
  { id: "e-arch-biz", source: "architect", target: "business_improver", animated: true, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.18)", strokeWidth: 1.5 } },
  { id: "e-biz-des", source: "business_improver", target: "designer", animated: true, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.18)", strokeWidth: 1.5 } },
  { id: "e-des-pm", source: "designer", target: "pm", animated: true, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.18)", strokeWidth: 1.5 } },
  { id: "e-pm-dev", source: "pm", target: "developer", animated: true, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.18)", strokeWidth: 1.5 } },
  { id: "e-dev-int", source: "developer", target: "integration", animated: true, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.18)", strokeWidth: 1.5 } },
  { id: "e-arch-pm", source: "architect", target: "pm", animated: false, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 } },
  { id: "e-des-dev", source: "designer", target: "developer", animated: false, type: "smoothstep", style: { stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 } },
];

const GATEWAY_CONNECTIONS = [
  { id: "e-ba-de", source: "business_analyst", target: "decision_engine", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.35)", strokeWidth: 1.5 } },
  { id: "e-de-prd", source: "decision_engine", target: "prd_writer", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.35)", strokeWidth: 1.5 } },
  { id: "e-prd-des", source: "prd_writer", target: "designer", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.35)", strokeWidth: 1.5 } },
  { id: "e-des-eg", source: "designer", target: "epic_generator", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.35)", strokeWidth: 1.5 } },
  { id: "e-eg-sg", source: "epic_generator", target: "story_generator", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.35)", strokeWidth: 1.5 } },
  { id: "e-sg-tg", source: "story_generator", target: "task_generator", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.35)", strokeWidth: 1.5 } },
  { id: "e-tg-sp", source: "task_generator", target: "sprint_planner", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.35)", strokeWidth: 1.5 } },
  { id: "e-sp-sm", source: "sprint_planner", target: "scrum_master", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.35)", strokeWidth: 1.5 } },
  { id: "e-sm-te", source: "scrum_master", target: "task_executor", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.35)", strokeWidth: 1.5 } },
  { id: "e-te-int", source: "task_executor", target: "integration", animated: true, type: "smoothstep", style: { stroke: "rgba(20,184,166,0.35)", strokeWidth: 1.5 } },
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

function AgentNode({ data, selected }: NodeProps) {
  const statusInfo = STATUS_META[data.status as AgentStatus];
  const StatusIcon = statusInfo.icon;
  const run = data.runStats || MOCK_RUNS[data.id];

  const statusColor = data.status === "success" ? "rgb(var(--success))" : data.status === "error" ? "rgb(var(--error))" : statusInfo.color;
  const statusBg = data.status === "success" ? "rgb(var(--success) / 0.15)" : data.status === "error" ? "rgb(var(--error) / 0.15)" : "transparent";

  return (
    <div
      className={[
        "relative min-w-[220px] rounded-3xl border bg-white/[0.03] px-5 py-4 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.75)] transition-all duration-200 backdrop-blur-xl",
        selected ? "border-white/20 shadow-[0_20px_48px_-16px_rgba(0,0,0,0.9)] scale-[1.03]" : "border-white/[0.08] hover:border-white/20",
      ].join(" ")}
      style={{ boxShadow: `inset 0 0 0 1px ${data.hue}26, 0 18px 40px -16px rgba(0,0,0,0.75)` }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl opacity-70"
        style={{ background: `linear-gradient(135deg, ${data.hue}18 0%, transparent 55%)` }}
      />
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !border-0" style={{ background: `${data.hue}99` }} />

      <div className="relative flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10"
          style={{ background: `linear-gradient(135deg, ${data.hue}28 0%, ${data.hue}12 100%)`, color: data.hue }}
        >
          <Activity size={20} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-ink">{data.label}</p>
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <StatusIcon size={12} style={{ color: statusColor }} />
            <span style={{ color: statusColor }}>{statusInfo.label}</span>
          </span>
        </div>
      </div>

      <div className="relative mt-3 flex items-center gap-3 text-sm text-faint">
        {run && (
          <>
            {run.lastRun && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {run.lastRun}
              </span>
            )}
            {run.duration && (
              <span className="flex items-center gap-1">
                <Timer size={12} />
                {run.duration}
              </span>
            )}
            {run.successRate != null && (
              <span className="flex items-center gap-1">
                <CheckCircle2 size={12} />
                {run.successRate}%
              </span>
            )}
          </>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-0" style={{ background: `${data.hue}99` }} />
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode, laneLabel: LaneLabel };

function LaneLabel({ data }: NodeProps) {
  return (
    <div className="pointer-events-none flex items-center gap-2 px-1">
      <div className="h-px w-8 bg-white/10" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{data.label}</span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function MacWindowHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onClose}
            className="flex h-3 w-3 cursor-pointer items-center justify-center rounded-full bg-[#FF5F57] transition hover:brightness-110 focus:outline-none"
            aria-label="Close"
          >
            <X size={8} className="text-black/70" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-3 w-3 cursor-pointer items-center justify-center rounded-full bg-[#FFBD2E] transition hover:brightness-110 focus:outline-none"
            aria-label="Minimize"
          >
            <Minus size={8} className="text-black/70" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-3 w-3 cursor-pointer items-center justify-center rounded-full bg-[#28C840] transition hover:brightness-110 focus:outline-none"
            aria-label="Maximize"
          >
            <Square size={7} className="text-black/70" />
          </button>
        </div>
        <span className="text-xs text-muted">Agent Fleet</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-muted">
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
      className="flex h-full flex-col border-l border-white/[0.08] bg-panel/95 backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10"
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
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Status</p>
            <div className="flex items-center gap-2">
              <StatusIcon size={14} style={{ color: statusInfo.color }} />
              <span className="text-sm text-ink">{statusInfo.label}</span>
            </div>
          </div>

          {kind === "gateway" && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Purpose</p>
              <p className="text-sm text-ink leading-relaxed">{(agent as typeof GATEWAY_AGENTS[number]).purpose}</p>
            </div>
          )}

          {credits !== undefined && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Credits</p>
              <div className="flex items-center gap-2">
                <Zap size={14} className="text-ember" />
                <span className="text-sm text-ink">{credits} credits per run</span>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
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

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
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

export function AgentFleetGraph({ onClose, embedded, autoPlay, onTourEnd, agentStats }: { onClose?: () => void; embedded?: boolean; autoPlay?: boolean; onTourEnd?: () => void; agentStats?: Record<string, AgentRunStats> }) {
  const [selectedAgent, setSelectedAgent] = useState<{ id: string; kind: "build" | "gateway" } | null>(null);
  const [{ active, currentIndex, results }, dispatch] = useReducer(runReducer, {
    active: false,
    currentIndex: 0,
    results: {},
  });

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
    const laneWidth = 220;
    const laneY = 50;
    const startX = 30;
    return BUILD_ORDER.map((id, index) => {
      const agent = AGENTS.find((a) => a.id === id)!;
      const run = agentStats?.[agent.id] || MOCK_RUNS[agent.id];
      const simulatedStatus = results[agent.id] || "idle";
      return {
        id: agent.id,
        type: "agentNode",
        position: { x: startX + index * laneWidth, y: laneY },
        data: {
          label: agent.label,
          hue: agent.hue,
          kind: "build" as const,
          status: active ? simulatedStatus : "idle",
          lastRun: run?.lastRun,
          duration: run?.duration,
          successRate: run?.successRate,
          runStats: run,
        },
      };
    });
  }, [results, active, agentStats]);

  const gatewayNodes = useMemo(() => {
    const laneWidth = 220;
    const rowY = [200, 310, 420] as const;
    const startX = 30;
    const stageRows: Record<string, number> = {
      Discovery: 0,
      Definition: 0,
      Planning: 1,
      Execution: 2,
    };

    const grouped = GATEWAY_AGENTS.reduce<Record<string, typeof GATEWAY_AGENTS>>((acc, agent) => {
      const row = stageRows[agent.stage] ?? 0;
      if (!acc[row]) acc[row] = [];
      acc[row].push(agent);
      return acc;
    }, {});

    const nodes: any[] = [];
    Object.entries(grouped).forEach(([rowIndex, agents]) => {
      agents.forEach((agent, index) => {
        const id = agent.id;
        const run = agentStats?.[id] || MOCK_RUNS[id];
        const simulatedStatus = results[id] || "idle";
        nodes.push({
          id,
          type: "agentNode",
          position: { x: startX + index * laneWidth, y: rowY[Number(rowIndex)] },
          data: {
            label: agent.label,
            hue: agent.hue,
            kind: "gateway" as const,
            status: active ? simulatedStatus : "idle",
            lastRun: run?.lastRun,
            duration: run?.duration,
            successRate: run?.successRate,
            runStats: run,
          },
        });
      });
    });
    return nodes;
  }, [results, active, agentStats]);

  const allNodes = useMemo(() => {
    const laneSeparatorBuild = {
      id: "lane-build",
      type: "laneLabel" as const,
      position: { x: 0, y: 20 },
      data: { label: "Build Pipeline" },
    };
    const laneSeparatorGateway = {
      id: "lane-gateway",
      type: "laneLabel" as const,
      position: { x: 0, y: 160 },
      data: { label: "Gateway Agents" },
    };
    return [...([laneSeparatorBuild, laneSeparatorGateway] as any), ...pipelineNodes, ...gatewayNodes];
  }, [pipelineNodes, gatewayNodes]);
  const initialEdges = useMemo(() => [...AGENT_CONNECTIONS, ...GATEWAY_CONNECTIONS], []);
  const [nodes, , onNodesChange] = useNodesState(allNodes as any);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: any) => {
    setSelectedAgent({ id: node.id, kind: node.data.kind });
  }, []);

  const selectedAgentData = selectedAgent
    ? (selectedAgent.kind === "build"
        ? AGENTS.find((a) => a.id === selectedAgent.id)
        : GATEWAY_AGENTS.find((a) => a.id === selectedAgent.id))
    : null;

  const graphContent = (
    <div className={`flex flex-col ${embedded ? "h-[60vh] w-full" : "h-[85vh] w-full max-w-6xl"} overflow-hidden rounded-2xl border border-white/[0.08] bg-panel/95 shadow-m3-2 backdrop-blur-xl`}>
      {!embedded && onClose && <MacWindowHeader onClose={onClose} />}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 h-full relative overflow-x-auto">
          <div className="min-w-[1200px] h-full">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              className="h-full w-full"
              nodeTypes={nodeTypes}
              panOnScroll
              zoomOnScroll
              zoomOnPinch
              minZoom={0.5}
              maxZoom={1.8}
            >
            <Background color="#22222E" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
          </div>

          <div className="absolute bottom-4 left-4 flex items-center gap-2 z-10">
            <button
              type="button"
              onClick={startRun}
              disabled={active}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-accent px-4 py-2 text-xs font-semibold text-white shadow-lg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play size={12} />
              {active ? "Running..." : "Simulate build"}
            </button>
            <button
              type="button"
              onClick={resetRun}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-panel-alt px-4 py-2 text-xs font-semibold text-ink shadow-lg transition hover:brightness-110"
            >
              <RotateCcw size={12} />
              Reset
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

      <div className="flex items-center justify-between border-t border-white/[0.08] px-4 py-2">
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
      className="absolute inset-0 z-40 flex items-start justify-center p-3 md:p-4"
    >
      {graphContent}
    </motion.div>
  );
}
