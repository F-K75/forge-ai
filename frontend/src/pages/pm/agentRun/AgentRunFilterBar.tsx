import React from "react";
import {
  Search,
  Layers,
  Terminal,
  Scale,
  LayoutGrid,
  ChevronsUpDown,
  ChevronsDown,
  ChevronsUp,
  X,
  SlidersHorizontal,
} from "lucide-react";

export type AgentRunViewMode = "pipeline" | "console" | "decisions" | "matrix";
export type StageFilter = "all" | "Discovery" | "Definition" | "Planning" | "Execution";

interface AgentRunFilterBarProps {
  viewMode: AgentRunViewMode;
  onViewModeChange: (mode: AgentRunViewMode) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedStage: StageFilter;
  onStageChange: (stage: StageFilter) => void;
  allExpanded: boolean;
  onToggleExpandAll: () => void;
  stageCounts: Record<string, number>;
  totalAgents: number;
}

export function AgentRunFilterBar({
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  selectedStage,
  onStageChange,
  allExpanded,
  onToggleExpandAll,
  stageCounts,
  totalAgents,
}: AgentRunFilterBarProps) {
  return (
    <div
      id="agent-run-filter-bar"
      className="space-y-3"
    >
      {/* View Mode Switcher Tabs */}
      <div className="flex items-center justify-between border-b border-border gap-2 overflow-x-auto pb-px">
        <div className="flex items-center gap-1 shrink-0">
          <button
            id="tab-pipeline-flow"
            type="button"
            onClick={() => onViewModeChange("pipeline")}
            className={`h-10 px-4 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              viewMode === "pipeline"
                ? "border-agent-integration/30 text-agent-integration"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Layers size={14} />
            <span>Pipeline Flow</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                viewMode === "pipeline"
                  ? "bg-agent-integration/10 text-agent-integration"
                  : "bg-panel-alt text-muted"
              }`}
            >
              {totalAgents}
            </span>
          </button>

          <button
            id="tab-live-console"
            type="button"
            onClick={() => onViewModeChange("console")}
            className={`h-10 px-4 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              viewMode === "console"
                ? "border-agent-integration/30 text-agent-integration"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Terminal size={14} />
            <span>Live Console & Logs</span>
          </button>

          <button
            id="tab-decisions-feed"
            type="button"
            onClick={() => onViewModeChange("decisions")}
            className={`h-10 px-4 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              viewMode === "decisions"
                ? "border-agent-integration/30 text-agent-integration"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <Scale size={14} />
            <span>Decisions & Audit</span>
          </button>

          <button
            id="tab-fleet-matrix"
            type="button"
            onClick={() => onViewModeChange("matrix")}
            className={`h-10 px-4 text-xs font-semibold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              viewMode === "matrix"
                ? "border-agent-integration/30 text-agent-integration"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            <LayoutGrid size={14} />
            <span>Fleet Matrix</span>
          </button>
        </div>

        {/* Expand / Collapse All Toggle (only relevant in pipeline view) */}
        {viewMode === "pipeline" && (
          <button
            id="btn-toggle-expand-all"
            type="button"
            onClick={onToggleExpandAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted hover:text-ink rounded-lg hover:bg-ink/5 transition-colors cursor-pointer shrink-0"
          >
            {allExpanded ? (
              <>
                <ChevronsUp size={13} />
                <span>Collapse All</span>
              </>
            ) : (
              <>
                <ChevronsDown size={13} />
                <span>Expand All</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Filter Row: Search & Stage Pills */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            id="search-agent-runs"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search agents by name, purpose, or capability…"
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-border bg-panel text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-agent-integration/20 focus:border-agent-integration/30"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-muted cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Stage Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <span className="text-[11px] font-semibold text-faint uppercase tracking-wider mr-1 hidden sm:inline">
            Stage:
          </span>

          {(["all", "Discovery", "Definition", "Planning", "Execution"] as StageFilter[]).map((st) => {
            const count = st === "all" ? totalAgents : stageCounts[st] || 0;
            const isSelected = selectedStage === st;

            return (
              <button
                key={st}
                id={`stage-filter-${st}`}
                type="button"
                onClick={() => onStageChange(st)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer ${
                  isSelected
                    ? "bg-ink text-on-ink shadow-sm"
                    : "bg-panel-alt text-muted hover:bg-ink/5"
                }`}
              >
                <span>{st === "all" ? "All Stages" : st}</span>
                <span
                  className={`text-[10px] px-1 rounded-full ${
                    isSelected
                      ? "bg-ink text-muted "
                      : "bg-surface-high text-muted"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
