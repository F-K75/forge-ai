import { useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
  MarkerType,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { AGENTS, GATEWAY_AGENTS } from "../lib/agents";
import { motion, AnimatePresence } from "framer-motion";

const BUILD_ORDER: (typeof AGENTS)[number]["id"][] = [
  "architect",
  "business_improver",
  "designer",
  "developer",
  "integration",
  "pm",
];

const GATEWAY_STAGE_ORDER = ["Discovery", "Definition", "Planning", "Execution"] as const;

const AGENT_CONNECTIONS: Edge[] = [
  { id: "e-arch-biz", source: "architect", target: "business_improver", animated: true },
  { id: "e-biz-des", source: "business_improver", target: "designer", animated: true },
  { id: "e-des-pm", source: "designer", target: "pm", animated: true },
  { id: "e-pm-dev", source: "pm", target: "developer", animated: true },
  { id: "e-dev-int", source: "developer", target: "integration", animated: true },
  { id: "e-arch-pm", source: "architect", target: "pm", animated: false },
  { id: "e-des-dev", source: "designer", target: "developer", animated: false },
];

const GATEWAY_CONNECTIONS: Edge[] = [
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

function buildPipelineNodes(): Node[] {
  const laneWidth = 180;
  const laneY = 60;
  return BUILD_ORDER.map((id, index) => {
    const agent = AGENTS.find((a) => a.id === id)!;
    return {
      id: agent.id,
      type: "default",
      position: { x: index * laneWidth, y: laneY },
      data: { label: agent.label },
      style: {
        background: "#13131B",
        border: `1px solid ${agent.hue}`,
        color: "#E8E8F0",
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 8,
        padding: "8px 12px",
        width: 150,
        textAlign: "center",
      },
    };
  });
}

function buildGatewayNodes(): Node[] {
  const stageYMap: Record<string, number> = {
    Discovery: 40,
    Definition: 140,
    Planning: 240,
    Execution: 340,
  };
  const stageX = 80;

  return GATEWAY_AGENTS.map((agent, index) => {
    const stageIndex = GATEWAY_STAGE_ORDER.indexOf(agent.stage as typeof GATEWAY_STAGE_ORDER[number]);
    const x = stageX + stageIndex * 170;
    const y = stageYMap[agent.stage] ?? 40;
    return {
      id: agent.id,
      type: "default",
      position: { x, y },
      data: { label: agent.label },
      style: {
        background: "#13131B",
        border: `1px solid ${agent.hue}`,
        color: "#E8E8F0",
        fontSize: 11,
        fontWeight: 500,
        borderRadius: 6,
        padding: "6px 10px",
        width: 140,
        textAlign: "center",
      },
    };
  });
}

export function AgentFleetGraph({ onClose }: { onClose: () => void }) {
  const pipelineNodes = useMemo(() => buildPipelineNodes(), []);
  const gatewayNodes = useMemo(() => buildGatewayNodes(), []);
  const allNodes = useMemo(() => [...pipelineNodes, ...gatewayNodes], [pipelineNodes, gatewayNodes]);
  const initialEdges = useMemo(() => [...AGENT_CONNECTIONS, ...GATEWAY_CONNECTIONS], []);
  const [nodes, , onNodesChange] = useNodesState(allNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 z-40 rounded-apple-xl border border-outline bg-panel/95 shadow-m3 backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-outline px-4 py-3">
        <div>
          <p className="text-[12px] font-medium text-muted">Agent fleet</p>
          <p className="text-sm font-semibold text-ink">Interconnected agents</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 w-8 cursor-pointer rounded-full bg-panel-alt text-xs font-semibold text-ink transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          Close
        </button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        proOptions={{ hideAttribution: true }}
        className="h-full w-full"
      >
        <Background color="#22222E" gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </motion.div>
  );
}
