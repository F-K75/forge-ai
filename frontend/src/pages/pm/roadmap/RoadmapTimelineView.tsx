import React, { useState } from "react";
import {
  Calendar,
  Layers,
  Clock,
  ArrowRight,
  Sparkles,
  ChevronRight,
  Info,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { PMEpic, PMStory, PMTask, PMSprint } from "../../../lib/types/api";

interface RoadmapTimelineViewProps {
  epics: PMEpic[];
  stories: PMStory[];
  tasks: PMTask[];
  sprints: PMSprint[];
  onSelectEpic: (epic: PMEpic) => void;
}

const PRIORITY_THEME: Record<string, { bg: string; border: string; text: string; bar: string }> = {
  p0: {
    bg: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-200 dark:border-rose-800",
    text: "text-rose-700 dark:text-rose-300",
    bar: "bg-rose-500",
  },
  p1: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  p2: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-700 dark:text-blue-300",
    bar: "bg-blue-500",
  },
};

const TIMELINE_COLUMNS = [
  { id: "m1", label: "Month 1", quarter: "Q1" },
  { id: "m2", label: "Month 2", quarter: "Q1" },
  { id: "m3", label: "Month 3", quarter: "Q1" },
  { id: "m4", label: "Month 4", quarter: "Q2" },
  { id: "m5", label: "Month 5", quarter: "Q2" },
  { id: "m6", label: "Month 6", quarter: "Q2" },
];

export function RoadmapTimelineView({
  epics,
  stories,
  tasks,
  sprints,
  onSelectEpic,
}: RoadmapTimelineViewProps) {
  const [hoveredEpicId, setHoveredEpicId] = useState<string | null>(null);

  // Group epics into phases / areas or chronological buckets
  const epicRows = React.useMemo(() => {
    return epics.map((epic, index) => {
      // Find stories & tasks linked to this epic
      const linkedStories = stories.filter((s) => s.epic_id === epic.id);
      const linkedTasks = tasks.filter((t) => t.epic_id === epic.id);
      const completedTasks = linkedTasks.filter((t) => t.status === "done").length;

      const progressPct =
        linkedTasks.length > 0
          ? Math.round((completedTasks / linkedTasks.length) * 100)
          : linkedStories.length > 0
          ? 40
          : 20;

      // Calculate approximate timeline placement across the 6 columns
      // Spread epics across the 6 columns based on their order or index
      const startCol = Math.min(Math.floor(index * 1.2), 3);
      const spanCols = Math.min(Math.max(2, Math.floor(3 - index * 0.2)), 6 - startCol);

      return {
        epic,
        linkedStories,
        linkedTasks,
        progressPct,
        startCol,
        spanCols,
      };
    });
  }, [epics, stories, tasks]);

  return (
    <div
      id="roadmap-timeline-root"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
    >
      {/* Header Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
        <div>
          <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Calendar size={16} className="text-blue-600 dark:text-blue-400" />
            <span>Interactive Gantt & Chronological Horizon</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Phase-by-phase delivery schedule with task execution progress and critical milestones.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
            <span className="text-slate-600 dark:text-slate-400 text-[11px]">P0 Critical</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <span className="text-slate-600 dark:text-slate-400 text-[11px]">P1 High</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            <span className="text-slate-600 dark:text-slate-400 text-[11px]">P2 Normal</span>
          </div>
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 dark:border-slate-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-slate-600 dark:text-slate-400 text-[11px]">Current Horizon</span>
          </div>
        </div>
      </div>

      {/* Gantt Timeline Container with Horizontal Scroll */}
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {/* Timeline Grid Header */}
          <div className="grid grid-cols-12 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-xs font-semibold text-slate-500">
            <div className="col-span-4 p-3 border-r border-slate-100 dark:border-slate-800">
              Epic Scope & Ownership
            </div>
            <div className="col-span-8 grid grid-cols-6 divide-x divide-slate-100 dark:divide-slate-800 text-center">
              {TIMELINE_COLUMNS.map((col) => (
                <div key={col.id} className="p-3">
                  <div className="text-slate-800 dark:text-slate-200 text-xs font-bold">
                    {col.label}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">{col.quarter}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Active Sprint Indicator Guide */}
          <div className="relative">
            <div
              className="absolute top-0 bottom-0 left-[48%] w-0.5 bg-emerald-500/60 z-10 pointer-events-none"
              title="Current Sprint Target"
            >
              <span className="absolute -top-2 -left-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-600 text-white uppercase tracking-wider">
                Now
              </span>
            </div>

            {/* Epic Swimlanes */}
            {epicRows.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No epics match the current search or filters.
              </div>
            ) : (
              epicRows.map((row, idx) => {
                const priorityTheme =
                  PRIORITY_THEME[row.epic.priority || "p2"] || PRIORITY_THEME.p2;
                const isHovered = hoveredEpicId === row.epic.id;

                // Calculate CSS grid column start & span for 8 columns total on the right
                // right area has 6 visual units. In a 12-col subgrid, each visual month is 2 cols.
                const subColStart = row.startCol * 2 + 1;
                const subColSpan = row.spanCols * 2;

                return (
                  <div
                    key={row.epic.id}
                    id={`gantt-row-${row.epic.id}`}
                    onMouseEnter={() => setHoveredEpicId(row.epic.id)}
                    onMouseLeave={() => setHoveredEpicId(null)}
                    className={`grid grid-cols-12 border-b border-slate-100 dark:border-slate-800/80 transition-colors items-center ${
                      isHovered
                        ? "bg-slate-50/80 dark:bg-slate-800/40"
                        : idx % 2 === 0
                        ? "bg-white dark:bg-slate-900"
                        : "bg-slate-50/20 dark:bg-slate-900/40"
                    }`}
                  >
                    {/* Left Column: Epic Information */}
                    <div className="col-span-4 p-3 sm:p-4 border-r border-slate-100 dark:border-slate-800 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${priorityTheme.bg} ${priorityTheme.text} ${priorityTheme.border}`}
                        >
                          {row.epic.priority || "p2"}
                        </span>
                        <button
                          type="button"
                          onClick={() => onSelectEpic(row.epic)}
                          className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                        >
                          {row.epic.title}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                        <span>{row.epic.estimated_duration || "Cadence: Q1-Q2"}</span>
                        <span>·</span>
                        <span>{row.epic.story_points || 0} pts</span>
                        <span>·</span>
                        <span>{row.linkedStories.length} stories</span>
                      </div>
                    </div>

                    {/* Right Columns: Gantt Bar Area */}
                    <div className="col-span-8 p-3 relative h-16 flex items-center">
                      {/* Grid guidelines background */}
                      <div className="absolute inset-0 grid grid-cols-6 divide-x divide-slate-100/60 dark:divide-slate-800/30 pointer-events-none">
                        <div />
                        <div />
                        <div />
                        <div />
                        <div />
                        <div />
                      </div>

                      {/* Interactive Gantt Bar */}
                      <div
                        onClick={() => onSelectEpic(row.epic)}
                        style={{
                          marginLeft: `${(row.startCol / 6) * 100}%`,
                          width: `${(row.spanCols / 6) * 100}%`,
                        }}
                        className={`relative h-9 rounded-xl border p-1 shadow-sm transition-all duration-200 cursor-pointer overflow-hidden flex items-center justify-between group ${priorityTheme.bg} ${priorityTheme.border}`}
                      >
                        {/* Progress fill bar inside */}
                        <div
                          className={`absolute left-0 top-0 bottom-0 opacity-20 transition-all duration-500 ${priorityTheme.bar}`}
                          style={{ width: `${row.progressPct}%` }}
                        />

                        {/* Bar Label */}
                        <div className="relative z-10 flex items-center gap-1.5 px-2 min-w-0">
                          <span className={`text-[11px] font-bold truncate ${priorityTheme.text}`}>
                            {row.epic.title}
                          </span>
                        </div>

                        {/* Progress & Badge */}
                        <div className="relative z-10 flex items-center gap-1.5 pr-2 shrink-0">
                          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 shadow-2xs">
                            {row.progressPct}%
                          </span>
                          <ChevronRight
                            size={12}
                            className="text-slate-400 group-hover:translate-x-0.5 transition-transform"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-slate-50 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Info size={13} className="text-blue-500" />
          <span>Click on any epic bar to drill down into stories, estimates, and tasks.</span>
        </div>
        <span className="font-mono text-[11px]">{epicRows.length} Epics Scheduled</span>
      </div>
    </div>
  );
}
