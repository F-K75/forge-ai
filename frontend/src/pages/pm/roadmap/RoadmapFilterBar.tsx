import React from "react";
import {
  GanttChartSquare,
  Columns4,
  Flag,
  ListTree,
  Search,
  X,
  Filter,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

export type RoadmapViewMode = "timeline" | "quarters" | "milestones" | "epics";
export type QuarterFilter = "all" | "Q1" | "Q2" | "Q3" | "Q4";
export type PriorityFilter = "all" | "p0" | "p1" | "p2";

interface RoadmapFilterBarProps {
  viewMode: RoadmapViewMode;
  onViewModeChange: (mode: RoadmapViewMode) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedQuarter: QuarterFilter;
  onQuarterChange: (quarter: QuarterFilter) => void;
  selectedPriority: PriorityFilter;
  onPriorityChange: (priority: PriorityFilter) => void;
  totalEpics: number;
}

const VIEW_TABS: Array<{
  id: RoadmapViewMode;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "timeline", label: "Interactive Timeline & Gantt", icon: GanttChartSquare },
  { id: "quarters", label: "Quarter & Cadence Board", icon: Columns4 },
  { id: "milestones", label: "Strategic Milestones & Releases", icon: Flag },
  { id: "epics", label: "Epic Decomposition Matrix", icon: ListTree },
];

export function RoadmapFilterBar({
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchChange,
  selectedQuarter,
  onQuarterChange,
  selectedPriority,
  onPriorityChange,
  totalEpics,
}: RoadmapFilterBarProps) {
  return (
    <div
      id="roadmap-filter-bar"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-sm space-y-3"
    >
      {/* Top Row: View Switcher Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-3">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {VIEW_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = viewMode === tab.id;

            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                type="button"
                onClick={() => onViewModeChange(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer shrink-0 select-none ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <Icon size={14} className={isActive ? "text-white" : "text-slate-400"} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Total Epics Counter badge */}
        <div className="flex items-center gap-2 text-xs text-slate-500 self-end sm:self-auto shrink-0 font-medium">
          <span className="hidden sm:inline">Scope Catalog:</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold font-mono text-[11px]">
            {totalEpics} Epics
          </span>
        </div>
      </div>

      {/* Bottom Row: Search & Filters */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            id="search-roadmap"
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search epics, milestones, goals, or deliverables…"
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter Pills: Quarters & Priorities */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quarter Cadence Pills */}
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1.5 hidden sm:inline">
              Horizon:
            </span>
            {(["all", "Q1", "Q2", "Q3", "Q4"] as QuarterFilter[]).map((q) => {
              const isSelected = selectedQuarter === q;
              return (
                <button
                  key={q}
                  id={`filter-quarter-${q}`}
                  type="button"
                  onClick={() => onQuarterChange(q)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-lg transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-semibold"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {q === "all" ? "All" : q}
                </button>
              );
            })}
          </div>

          {/* Priority Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1.5 hidden sm:inline">
              Priority:
            </span>
            {(["all", "p0", "p1", "p2"] as PriorityFilter[]).map((p) => {
              const isSelected = selectedPriority === p;
              return (
                <button
                  key={p}
                  id={`filter-priority-${p}`}
                  type="button"
                  onClick={() => onPriorityChange(p)}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded-lg transition-colors cursor-pointer uppercase ${
                    isSelected
                      ? "bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm font-semibold"
                      : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  }`}
                >
                  {p === "all" ? "All" : p}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
