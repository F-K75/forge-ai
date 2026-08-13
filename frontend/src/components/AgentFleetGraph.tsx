import { useMemo, useState, useCallback } from "react";
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
} from "lucide-react";

const BUILD_ORDER = ["architect", "business_improver", "designer", "developer", "integration", "pm"] as const;

const GATEWAY_STAGE_ORDER = ["Discovery", "Definition", "Planning", "Execution"] as const;

const AGENT_CONNECTIONS = [
  { id: "e-arch-biz", source: "architect", target: "business_improver", animated: true },
  { id: "e-biz-des", source: "business_improver", target: "designer", animated: true },
  { id: "e-des-pm", source: "designer", target: "pm", animated: true },
  { id: "e-pm-dev", source: "pm", target: "developer", animated: true },
  { id: "e-dev-int", source: "developer", target: "integration", animated: true },
  { id: "e-arch-pm", source: "architect", target: "pm", animated: false },
  { id: "e-des-dev", source: "designer", target: "developer", animated: false },
];

const GATEWAY_CONNECTIONS = [
  { id: "e-ba-de", source: "business_analyst", target: "decision_engine", animated: true },
  { id: "e-de-prd", source: "decision_engine", target: "prd_writer", animated: true },
  { id: "e-prd-des", source: "prd_writer", target: "designer", animated: true },
  { id: "e-des-eg", source: "designer", target: "epic_generator", animated: true },
  { id: "e-eg-sg", source: "epic_generator", target: "story_generator", animated: true },
  { id: "e-sg-tg", source: "story_generator", target: "task_generator", animated: true },
  { id: "e-tg-sp", source: "task_generator", target: "sprint_planner", animated: true },
  { id: "e-sp-sm", source: "sprint_planner", target: "scrum_master", animated: true },
  { id: "e-sm-te", source: "scrum_master", target: "task_executor", animated: true },
  { id: "e-te-int", source: "task_executor", target: "integration", animated: true },
];

type AgentStatus = "idle" | "running" | "success" | "error";

const STATUS_META: Record<AgentStatus, { icon: typeof Activity; color: string; label: string }> = {
  idle: { icon: Clock, color: "rgb(var(--muted))", label: "Idle" },
  running: { icon: Loader2, color: "rgb(var(--primary))", label: "Running" },
  success: { icon: CheckCircle2, color: "rgb(var(--success))", label: "Success" },
  error: { icon: XCircle, color: "rgb(var(--error))", label: "Error" },
};

function AgentNode({ data, selected }: NodeProps) {
  const statusInfo = STATUS_META[data.status as AgentStatus];
  const StatusIcon = statusInfo.icon;

  return (
    <div
      className={[
        "relative min-w-[176px] rounded-3xl border bg-white/[0.03] px-4 py-3 shadow-[0_18px_40px_-16px_rgba(0,0,0,0.75)] transition-all duration-200 backdrop-blur-xl",
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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10"
          style={{ background: `linear-gradient(135deg, ${data.hue}28 0%, ${data.hue}12 100%)`, color: data.hue }}
        >
          <Activity size={17} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">{data.label}</p>
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <StatusIcon size={10} style={{ color: statusInfo.color }} />
            {statusInfo.label}
          </span>
        </div>
      </div>

      {(data.status === "running" || data.lastRun || data.credits) && (
        <div className="relative mt-3 flex items-center gap-3 text-[11px] text-faint">
          {data.status === "running" && (
            <span className="flex items-center gap-1 text-accent">
              <Loader2 size={10} className="animate-spin" />
              Processing
            </span>
          )}
          {data.lastRun && (
            <span className="flex items-center gap-1">
              <Clock size={10} />
              {data.lastRun}
            </span>
          )}
          {data.credits && (
            <span className="flex items-center gap-1">
              <Zap size={10} />
              {data.credits} credits
            </span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !border-0" style={{ background: `${data.hue}99` }} />
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode };

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

export function AgentFleetGraph({ onClose, embedded }: { onClose?: () => void; embedded?: boolean }) {
  const [selectedAgent, setSelectedAgent] = useState<{ id: string; kind: "build" | "gateway" } | null>(null);

  const pipelineNodes = useMemo(() => {
    const laneWidth = 220;
    const laneY = 50;
    const startX = 30;
    return BUILD_ORDER.map((id, index) => {
      const agent = AGENTS.find((a) => a.id === id)!;
      return {
        id: agent.id,
        type: "agentNode",
        position: { x: startX + index * laneWidth, y: laneY },
        data: { label: agent.label, hue: agent.hue, kind: "build" as const, status: "idle" as const },
      };
    });
  }, []);

  const gatewayNodes = useMemo(() => {
    const laneWidth = 150;
    const laneY = 190;
    const startX = 30;

    return GATEWAY_AGENTS.map((agent, index) => {
      const id = agent.id;
      return {
        id,
        type: "agentNode",
        position: { x: startX + index * laneWidth, y: laneY },
        data: { label: agent.label, hue: agent.hue, kind: "gateway" as const, status: "idle" as const },
      };
    });
  }, []);

  const allNodes = useMemo(() => [...pipelineNodes, ...gatewayNodes], [pipelineNodes, gatewayNodes]);
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
    <div className={`flex flex-col ${embedded ? "h-[55vh] w-full" : "h-[65vh] w-full max-w-6xl"} overflow-hidden rounded-2xl border border-white/[0.08] bg-panel/95 shadow-m3-2 backdrop-blur-xl`}>
      {!embedded && onClose && <MacWindowHeader onClose={onClose} />}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 h-full">
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
          >
            <Background color="#22222E" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
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
