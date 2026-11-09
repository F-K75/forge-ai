import React from "react";
import {
  Search,
  X,
  Filter,
  Flame,
  AlertTriangle,
  Clock,
  Layers,
  RotateCcw,
} from "lucide-react";
import type { LayerType, FocusFilter, DensityMode, GraphDiagnostics } from "./graphTypes";
import { LAYER_CONFIG, LAYER_ORDER } from "./graphUtils";

interface GraphFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeLayers: Set<LayerType>;
  onToggleLayer: (layer: LayerType) => void;
  onSelectAllLayers: () => void;
  focusFilter: FocusFilter;
  onFocusFilterChange: (f: FocusFilter) => void;
  density: DensityMode;
  onDensityChange: (d: DensityMode) => void;
  diagnostics: GraphDiagnostics;
  onResetView: () => void;
}

export const GraphFilterBar: React.FC<GraphFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  activeLayers,
  onToggleLayer,
  onSelectAllLayers,
  focusFilter,
  onFocusFilterChange,
  density,
  onDensityChange,
  diagnostics,
  onResetView,
}) => {
  return (
    <div className="mb-3 flex flex-col gap-2.5 rounded-xl border border-inlay bg-canvas/40 p-3 text-xs backdrop-blur-xs">
      {/* Top Row: Search + Focus Mode + Density */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search nodes, labels, assignees, tags... (/)"
            className="w-full rounded-lg border border-inlay bg-inlay/50 py-1.5 pl-8 pr-7 text-xs text-ink placeholder-faint focus:border-accent focus:outline-hidden"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-ink"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Focus Filters (All, Critical Path, Blocked, In-Progress) */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          <span className="text-[11px] font-medium text-faint mr-1 flex items-center gap-1">
            <Filter size={11} /> Focus:
          </span>
          <button
            type="button"
            onClick={() => onFocusFilterChange("all")}
            className={`rounded-md px-2 py-1 font-medium transition-all ${
              focusFilter === "all"
                ? "bg-accent/20 text-accent border border-accent/30"
                : "text-faint hover:text-ink hover:bg-inlay/40"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onFocusFilterChange("critical_path")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-all ${
              focusFilter === "critical_path"
                ? "bg-pink-500/20 text-pink-300 border border-pink-500/40"
                : "text-faint hover:text-ink hover:bg-inlay/40"
            }`}
            title="Focus only on the longest dependency chain"
          >
            <Flame size={11} className="text-pink-400" />
            Critical Path
          </button>
          <button
            type="button"
            onClick={() => onFocusFilterChange("blocked")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-all ${
              focusFilter === "blocked"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                : "text-faint hover:text-ink hover:bg-inlay/40"
            }`}
            title="Focus only on tasks with pending dependencies"
          >
            <AlertTriangle size={11} className="text-amber-400" />
            Blocked ({diagnostics.blockedTasksCount})
          </button>
          <button
            type="button"
            onClick={() => onFocusFilterChange("in_progress")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-all ${
              focusFilter === "in_progress"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                : "text-faint hover:text-ink hover:bg-inlay/40"
            }`}
          >
            <Clock size={11} className="text-cyan-400" />
            In-Progress
          </button>
        </div>

        {/* Density Toggle & Reset */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-inlay bg-inlay/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => onDensityChange("compact")}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
                density === "compact"
                  ? "bg-inlay-strong text-ink shadow-xs"
                  : "text-faint hover:text-ink"
              }`}
            >
              Compact
            </button>
            <button
              type="button"
              onClick={() => onDensityChange("detailed")}
              className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-all ${
                density === "detailed"
                  ? "bg-inlay-strong text-ink shadow-xs"
                  : "text-faint hover:text-ink"
              }`}
            >
              Detailed
            </button>
          </div>

          <button
            type="button"
            onClick={onResetView}
            className="flex items-center gap-1 rounded-lg border border-inlay bg-inlay/40 px-2 py-1 text-[11px] text-faint hover:text-ink hover:bg-inlay transition-all"
            title="Reset zoom, pan, and node selections"
          >
            <RotateCcw size={11} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Bottom Row: Layer Visibility Toggles */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-inlay/40">
        <span className="text-[11px] font-medium text-faint mr-1 flex items-center gap-1">
          <Layers size={11} /> Layers:
        </span>

        {LAYER_ORDER.map((layer) => {
          const cfg = LAYER_CONFIG[layer];
          const isActive = activeLayers.has(layer);
          const count = diagnostics.layerCounts[layer] || 0;

          return (
            <button
              key={layer}
              type="button"
              onClick={() => onToggleLayer(layer)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-all border ${
                isActive
                  ? "border-transparent bg-inlay/80 text-ink shadow-2xs"
                  : "border-inlay/50 bg-transparent text-faint/60 line-through opacity-50"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: cfg.color }}
              />
              <span>{cfg.label}</span>
              <span className="font-mono text-[10px] text-faint">({count})</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onSelectAllLayers}
          className="ml-auto text-[10px] font-medium text-accent hover:underline"
        >
          {activeLayers.size === LAYER_ORDER.length ? "Clear Layers" : "Select All Layers"}
        </button>
      </div>
    </div>
  );
};
