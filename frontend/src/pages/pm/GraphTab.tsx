import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import { usePMStore } from "../../store/pmStore";
import { initiativesApi } from "../../lib/pmApi";
import { motion, motionVariants } from "../../lib/animations";
import { toast } from "react-hot-toast";
import {
  type LayerType,
  type LayoutMode,
  type FocusFilter,
  type DensityMode,
  type GraphNodePayload,
} from "./graph/graphTypes";
import {
  synthesizeGraph,
  LAYER_ORDER,
  LAYER_CONFIG,
} from "./graph/graphUtils";
import { customNodeTypes } from "./graph/GraphCustomNodes";
import { GraphHeader } from "./graph/GraphHeader";
import { GraphFilterBar } from "./graph/GraphFilterBar";
import { GraphNodeInspector } from "./graph/GraphNodeInspector";
import { GraphDiagnosticsModal } from "./graph/GraphDiagnosticsModal";

function GraphInner() {
  const { initiative, epics, stories, tasks, executions } = usePMStore();
  const [apiGraph, setApiGraph] = useState<any>(null);

  // Layout & Filter states
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("horizontal");
  const [focusFilter, setFocusFilter] = useState<FocusFilter>("all");
  const [density, setDensity] = useState<DensityMode>("detailed");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeLayers, setActiveLayers] = useState<Set<LayerType>>(
    new Set(LAYER_ORDER)
  );

  // Selection & Modal states
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const { fitView, setCenter } = useReactFlow();

  // Fetch optional API graph from backend
  useEffect(() => {
    if (!initiative) return;
    initiativesApi
      .graph(initiative.id, {
        includeFiles: true,
        includeCommits: true,
        includeExecutions: true,
      })
      .then((res) => {
        if (res && Array.isArray(res.nodes) && res.nodes.length > 1) {
          setApiGraph(res);
        } else {
          setApiGraph(null);
        }
      })
      .catch(() => setApiGraph(null));
  }, [initiative]);

  // Compute graph data
  const {
    nodes: computedNodes,
    edges: computedEdges,
    diagnostics,
  } = useMemo(() => {
    return synthesizeGraph({
      initiative,
      epics,
      stories,
      tasks,
      executions,
      apiGraph,
      activeLayers,
      searchQuery,
      focusFilter,
      layoutMode,
      density,
      selectedNodeId,
    });
  }, [
    initiative,
    epics,
    stories,
    tasks,
    executions,
    apiGraph,
    activeLayers,
    searchQuery,
    focusFilter,
    layoutMode,
    density,
    selectedNodeId,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  // Sync state whenever computed data changes
  useEffect(() => {
    setNodes(computedNodes);
    setEdges(computedEdges);
  }, [computedNodes, computedEdges, setNodes, setEdges]);

  // Initial fit view with gentle padding
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.15, duration: 400 });
    }, 120);
    return () => clearTimeout(timer);
  }, [fitView, layoutMode, focusFilter, activeLayers.size]);

  // Keyboard shortcut listener (/ for search, Esc to close inspector)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setIsDiagnosticsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Node selection handler
  const handleNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Center node in viewport
  const handleCenterNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (node && node.position) {
        setCenter(node.position.x + 100, node.position.y + 50, {
          zoom: 1.1,
          duration: 600,
        });
      }
    },
    [nodes, setCenter]
  );

  // Layer toggling
  const handleToggleLayer = useCallback((layer: LayerType) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) {
        if (next.size > 1) {
          next.delete(layer);
        } else {
          toast("At least one layer must remain visible", { icon: "ℹ️" });
        }
      } else {
        next.add(layer);
      }
      return next;
    });
  }, []);

  const handleSelectAllLayers = useCallback(() => {
    setActiveLayers((prev) => {
      if (prev.size === LAYER_ORDER.length) {
        return new Set(["initiative", "epic", "task"] as LayerType[]);
      }
      return new Set(LAYER_ORDER);
    });
  }, []);

  // Reset view to default
  const handleResetView = useCallback(() => {
    setSelectedNodeId(null);
    setSearchQuery("");
    setFocusFilter("all");
    setActiveLayers(new Set(LAYER_ORDER));
    fitView({ padding: 0.15, duration: 500 });
    toast.success("Graph view reset");
  }, [fitView]);

  // Export Topology as JSON
  const handleExportJson = useCallback(() => {
    const exportPayload = {
      initiativeId: initiative?.id,
      initiativeName: initiative?.name,
      exportedAt: new Date().toISOString(),
      diagnostics,
      nodes: computedNodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.data.label,
        status: n.data.status,
        priority: n.data.priority,
      })),
      edges: computedEdges.map((e) => ({
        source: e.source,
        target: e.target,
        kind: e.data?.kind,
      })),
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lineage-topology-${initiative?.id || "graph"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Lineage Topology exported as JSON");
  }, [initiative, diagnostics, computedNodes, computedEdges]);

  // Selected node metadata
  const selectedNode = useMemo<GraphNodePayload | null>(() => {
    if (!selectedNodeId) return null;
    const found = nodes.find((n) => n.id === selectedNodeId);
    return found ? (found.data as GraphNodePayload) : null;
  }, [nodes, selectedNodeId]);

  // Upstream & Downstream linked nodes for inspector
  const { upstreamNodes, downstreamNodes } = useMemo(() => {
    if (!selectedNodeId) return { upstreamNodes: [], downstreamNodes: [] };

    const nodeMap = new Map<string, GraphNodePayload>();
    nodes.forEach((n) => nodeMap.set(n.id, n.data as GraphNodePayload));

    const ups: GraphNodePayload[] = [];
    const downs: GraphNodePayload[] = [];

    edges.forEach((e) => {
      if (e.target === selectedNodeId) {
        const up = nodeMap.get(e.source);
        if (up) ups.push(up);
      }
      if (e.source === selectedNodeId) {
        const down = nodeMap.get(e.target);
        if (down) downs.push(down);
      }
    });

    return { upstreamNodes: ups, downstreamNodes: downs };
  }, [nodes, edges, selectedNodeId]);

  if (!initiative) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <div className="flex h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-inlay p-8 text-center bg-canvas/40">
          <p className="text-sm font-medium text-ink">Initiative not found</p>
          <p className="mt-1 text-xs text-faint">
            Please select or initialize an active initiative to explore its dependency topology.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`mx-auto px-4 py-4 md:px-8 transition-all ${
        isFullscreen
          ? "fixed inset-0 z-50 bg-panel-alt p-4 flex flex-col h-screen"
          : "max-w-7xl"
      }`}
      id="graph-tab-root"
    >
      <GraphHeader
        diagnostics={diagnostics}
        layoutMode={layoutMode}
        onLayoutChange={setLayoutMode}
        isFullscreen={isFullscreen}
        onToggleFullscreen={() => setIsFullscreen((prev) => !prev)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onExportJson={handleExportJson}
      />

      <GraphFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeLayers={activeLayers}
        onToggleLayer={handleToggleLayer}
        onSelectAllLayers={handleSelectAllLayers}
        focusFilter={focusFilter}
        onFocusFilterChange={setFocusFilter}
        density={density}
        onDensityChange={setDensity}
        diagnostics={diagnostics}
        onResetView={handleResetView}
      />

      {/* Interactive ReactFlow Container */}
      <motion.div
        ref={containerRef}
        className={`relative w-full rounded-2xl border border-inlay bg-panel-alt overflow-hidden ${
          isFullscreen
            ? "flex-1 min-h-[500px]"
            : "h-[calc(100vh-270px)] min-h-[520px]"
        }`}
        initial="hidden"
        animate="visible"
        variants={motionVariants.fadeIn}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={customNodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          fitView
          minZoom={0.2}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          aria-label="Dependency and Lineage Graph Canvas"
        >
          <Background color="#1C1C2C" gap={28} size={1.2} />

          <Controls
            showInteractive={true}
            className="!bg-base/90 !border !border-inlay !rounded-xl !text-ink !shadow-lg"
          />

          <MiniMap
            nodeColor={(n) => {
              const type = (n.type as LayerType) || "task";
              return LAYER_CONFIG[type]?.color || "#7C5CFF";
            }}
            nodeStrokeWidth={2}
            maskColor="rgba(10, 10, 18, 0.75)"
            className="!bg-panel-alt !border !border-inlay !rounded-xl !overflow-hidden"
          />

          {/* Quick Helper Panel */}
          <Panel position="bottom-left" className="m-3">
            <div className="flex items-center gap-2 rounded-lg border border-inlay/70 bg-base/85 px-2.5 py-1 text-[11px] text-faint backdrop-blur-xs">
              <span>Click node to inspect lineage</span>
              <span className="text-inlay-strong">·</span>
              <span>Scroll to zoom</span>
              <span className="text-inlay-strong">·</span>
              <span>Drag to pan</span>
            </div>
          </Panel>
        </ReactFlow>

        {/* Selected Node Inspector Drawer */}
        {selectedNode && (
          <GraphNodeInspector
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
            upstreamNodes={upstreamNodes}
            downstreamNodes={downstreamNodes}
            onSelectNode={(id) => {
              setSelectedNodeId(id);
              handleCenterNode(id);
            }}
            onCenterNode={handleCenterNode}
          />
        )}
      </motion.div>

      {/* Diagnostics Modal */}
      <GraphDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        diagnostics={diagnostics}
        onSelectNode={(id) => {
          setSelectedNodeId(id);
          handleCenterNode(id);
        }}
      />
    </div>
  );
}

export default function GraphTab() {
  return (
    <ReactFlowProvider>
      <GraphInner />
    </ReactFlowProvider>
  );
}
