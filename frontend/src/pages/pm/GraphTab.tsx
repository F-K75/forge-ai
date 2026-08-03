import { useEffect, useMemo, useState, useRef } from "react";
import ReactFlow, { Background, Controls, type Node, type Edge, MarkerType, useNodesState, useEdgesState } from "reactflow";
import "reactflow/dist/style.css";
import { GitGraph } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { initiativesApi } from "../../lib/pmApi";
import { motion, motionVariants } from "../../lib/animations";
import { useGsapFrom } from "../../lib/animations";

const LAYER_ORDER = ["initiative", "epic", "story", "task", "agent_execution", "file", "commit"];
const LAYER_COLOR: Record<string, string> = {
  initiative: "#7C5CFF",
  epic: "#A855F7",
  story: "#22D3EE",
  task: "#34D399",
  agent_execution: "#F59E0B",
  file: "#8B8B9E",
  commit: "#5A5A6B",
};

const LAYER_X = 260;
const NODE_Y_GAP = 64;

export default function GraphTab() {
  const { initiative } = usePMStore();
  const [graph, setGraph] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!initiative) return;
    initiativesApi.graph(initiative.id).then(setGraph).catch(() => setGraph({ nodes: [], edges: [] }));
  }, [initiative]);

  const { nodes, edges } = useMemo<{ nodes: Node[]; edges: Edge[] }>(() => {
    if (!graph) return { nodes: [], edges: [] };

    const byLayer: Record<string, any[]> = {};
    for (const n of graph.nodes) {
      byLayer[n.type] = byLayer[n.type] ?? [];
      byLayer[n.type].push(n);
    }

    const nodes: Node[] = [];
    LAYER_ORDER.forEach((layer, layerIndex) => {
      (byLayer[layer] ?? []).forEach((n, i) => {
        nodes.push({
          id: n.id,
          data: { label: n.label },
          position: { x: layerIndex * LAYER_X, y: i * NODE_Y_GAP },
          style: {
            background: "#13131B",
            border: `1px solid ${LAYER_COLOR[layer] ?? "#22222E"}`,
            color: "#E8E8F0",
            fontSize: 11,
            borderRadius: 6,
            padding: "6px 10px",
            width: 200,
          },
        });
      });
    });

    const edges: Edge[] = graph.edges.map((e, i) => ({
      id: `e${i}`,
      source: e.source,
      target: e.target,
      animated: e.kind === "dependency",
      style: { stroke: e.kind === "dependency" ? "#F59E0B" : "#22222E" },
      markerEnd: { type: MarkerType.ArrowClosed, color: e.kind === "dependency" ? "#F59E0B" : "#5A5A6B" },
    }));

    return { nodes, edges };
  }, [graph]);

  const [flowNodes, , onNodesChange] = useNodesState(nodes);
  const [flowEdges, , onEdgesChange] = useEdgesState(edges);

  useGsapFrom(".react-flow__node", { opacity: 0, scale: 0.8, duration: 0.5, stagger: 0.04, ease: "power2.out" }, [graph]);

  if (!graph) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <GitGraph size={12} aria-hidden="true" />
          </span>
          <h2 className="font-display text-sm font-semibold text-ink">Dependency Graph</h2>
        </div>
        <div className="flex h-64 items-center justify-center text-sm text-faint">Loading graph…</div>
      </div>
    );
  }

  if (graph.nodes.length <= 1) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <GitGraph size={12} aria-hidden="true" />
          </span>
          <h2 className="font-display text-sm font-semibold text-ink">Dependency Graph</h2>
        </div>
        <div className="flex h-64 items-center justify-center text-sm text-faint">Nothing generated yet.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <GitGraph size={12} aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">Dependency Graph</h2>
      </div>
      <motion.div ref={containerRef} className="h-[calc(100vh-200px)] w-full" initial="hidden" animate="visible" variants={motionVariants.fadeIn}>
        <ReactFlow nodes={flowNodes} edges={flowEdges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} fitView proOptions={{ hideAttribution: true }}>
          <Background color="#22222E" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </motion.div>
    </div>
  );
}
