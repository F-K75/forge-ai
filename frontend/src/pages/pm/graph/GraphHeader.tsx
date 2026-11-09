import React from "react";
import {
  Network,
  Maximize2,
  Minimize2,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Download,
  Flame,
} from "lucide-react";
import type { LayoutMode, GraphDiagnostics } from "./graphTypes";

interface GraphHeaderProps {
  diagnostics: GraphDiagnostics;
  layoutMode: LayoutMode;
  onLayoutChange: (mode: LayoutMode) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onOpenDiagnostics: () => void;
  onExportJson: () => void;
}

export const GraphHeader: React.FC<GraphHeaderProps> = ({
  diagnostics,
  layoutMode,
  onLayoutChange,
  isFullscreen,
  onToggleFullscreen,
  onOpenDiagnostics,
  onExportJson,
}) => {
  return (
    <header className="mb-4 flex flex-col gap-3 rounded-2xl border border-inlay bg-canvas/70 p-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between shadow-xs">
      <div className="flex flex-col gap-1 sm:max-w-md">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/15 text-accent shadow-xs">
            <Network size={15} aria-hidden="true" />
          </span>
          <h1 className="font-display text-base font-semibold text-ink tracking-tight">
            Dependency & Lineage Graph
          </h1>
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-mono font-medium text-accent border border-accent/20">
            {diagnostics.totalNodes} nodes · {diagnostics.totalEdges} edges
          </span>
        </div>
        <p className="text-xs text-faint">
          Full execution topology spanning initiatives, epics, user stories, tasks, agent runs, and commits.
        </p>
      </div>

      {/* Telemetry Metrics & Quick Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Critical Path Metric */}
        <div
          className="flex items-center gap-1.5 rounded-lg border border-pink-500/20 bg-pink-500/10 px-2.5 py-1 text-xs text-pink-300"
          title={`Critical Path: longest chain is ${diagnostics.criticalPathLength} nodes`}
        >
          <Flame size={13} className="text-pink-400" />
          <span className="font-medium">Path:</span>
          <span className="font-mono font-semibold">{diagnostics.criticalPathLength} hops</span>
        </div>

        {/* Blocked Status */}
        <div
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
            diagnostics.blockedTasksCount > 0
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
          }`}
          title={`${diagnostics.blockedTasksCount} tasks currently blocked by dependencies`}
        >
          {diagnostics.blockedTasksCount > 0 ? (
            <AlertTriangle size={13} className="text-amber-400" />
          ) : (
            <CheckCircle2 size={13} className="text-emerald-400" />
          )}
          <span className="font-medium">Blocked:</span>
          <span className="font-mono font-semibold">{diagnostics.blockedTasksCount}</span>
        </div>

        {/* Cycles Status */}
        <div
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
            diagnostics.hasCycles
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
          }`}
          title={diagnostics.hasCycles ? "Circular dependency detected!" : "Acyclic DAG verified"}
        >
          <Activity size={13} />
          <span>{diagnostics.hasCycles ? "Cycle Detected" : "Zero Cycles"}</span>
        </div>

        {/* Layout Switcher */}
        <div className="flex items-center rounded-lg border border-inlay bg-inlay/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => onLayoutChange("horizontal")}
            className={`rounded-md px-2.5 py-1 font-medium transition-all ${
              layoutMode === "horizontal"
                ? "bg-accent text-white shadow-xs"
                : "text-faint hover:text-ink"
            }`}
            title="Horizontal Layered Architecture (DAG)"
          >
            Horizontal
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange("vertical")}
            className={`rounded-md px-2.5 py-1 font-medium transition-all ${
              layoutMode === "vertical"
                ? "bg-accent text-white shadow-xs"
                : "text-faint hover:text-ink"
            }`}
            title="Vertical Hierarchical Tree"
          >
            Vertical
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange("radial")}
            className={`rounded-md px-2.5 py-1 font-medium transition-all ${
              layoutMode === "radial"
                ? "bg-accent text-white shadow-xs"
                : "text-faint hover:text-ink"
            }`}
            title="Concentric Radial Cluster"
          >
            Radial
          </button>
        </div>

        {/* Diagnostics Modal Button */}
        <button
          type="button"
          onClick={onOpenDiagnostics}
          className="flex items-center gap-1.5 rounded-lg border border-inlay bg-inlay/60 px-2.5 py-1 text-xs font-medium text-ink hover:bg-inlay transition-all active:scale-95"
          title="Open Topology Diagnostics & Bottleneck Analyzer"
        >
          <Layers size={13} className="text-accent" />
          <span>Diagnostics</span>
        </button>

        {/* Export JSON Button */}
        <button
          type="button"
          onClick={onExportJson}
          className="flex items-center gap-1.5 rounded-lg border border-inlay bg-inlay/60 px-2.5 py-1 text-xs font-medium text-ink hover:bg-inlay transition-all active:scale-95"
          title="Export Lineage Topology as JSON"
        >
          <Download size={13} />
          <span className="hidden md:inline">Export</span>
        </button>

        {/* Fullscreen Button */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-inlay bg-inlay/60 text-faint hover:text-ink hover:bg-inlay transition-all active:scale-95"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Canvas"}
          aria-label={isFullscreen ? "Exit Fullscreen" : "Fullscreen Canvas"}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </div>
    </header>
  );
};
