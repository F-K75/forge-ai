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
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 gap-2 overflow-x-auto pb-px">
        <div className="flex items-center gap-1 shrink-0">
          <button
            id="tab-pipeline-flow"
            type="button"
            onClick={() => onViewModeChange("pipeline")}
            className={`h-10 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              viewMode === "pipeline"
                ? "border-teal-600 text-teal-700 dark:text-teal-300"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Layers size={14} />
            <span>Pipeline Flow</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                viewMode === "pipeline"
                  ? "bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-200"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {totalAgents}
            </span>
          </button>

          <button
            id="tab-live-console"
            type="button"
            onClick={() => onViewModeChange("console")}
            className={`h-10 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              viewMode === "console"
                ? "border-teal-600 text-teal-700 dark:text-teal-300"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Terminal size={14} />
            <span>Live Console & Logs</span>
          </button>

          <button
            id="tab-decisions-feed"
            type="button"
            onClick={() => onViewModeChange("decisions")}
            className={`h-10 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              viewMode === "decisions"
                ? "border-teal-600 text-teal-700 dark:text-teal-300"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Scale size={14} />
            <span>Decisions & Audit</span>
          </button>

          <button
            id="tab-fleet-matrix"
            type="button"
            onClick={() => onViewModeChange("matrix")}
            className={`h-10 px-4 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
              viewMode === "matrix"
                ? "border-teal-600 text-teal-700 dark:text-teal-300"
                : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
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
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            id="search-agent-runs"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search agents by name, purpose, or capability…"
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Stage Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1 hidden sm:inline">
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
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                <span>{st === "all" ? "All Stages" : st}</span>
                <span
                  className={`text-[10px] px-1 rounded-full ${
                    isSelected
                      ? "bg-slate-700 text-slate-200 dark:bg-slate-200 dark:text-slate-800"
                      : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
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
