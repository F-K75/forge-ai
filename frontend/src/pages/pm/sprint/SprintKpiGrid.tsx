import React from "react";
import {
  Flame,
  Gauge,
  Sparkles,
  ListTodo,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import type { PMSprint, PMTask } from "../../../lib/types/api";

interface SprintKpiGridProps {
  selectedSprint: PMSprint;
  sprintTasks: PMTask[];
  totalPoints: number;
  completedPoints: number;
  remainingPoints: number;
}

export const SprintKpiGrid: React.FC<SprintKpiGridProps> = ({
  selectedSprint,
  sprintTasks,
  totalPoints,
  completedPoints,
  remainingPoints,
}) => {
  const capacity = selectedSprint.capacity || 40;
  const velocity = selectedSprint.velocity || totalPoints || 38;
  const loadPercentage = capacity > 0 ? Math.round((totalPoints / capacity) * 100) : 100;

  // Task state breakdown
  const doneTasks = sprintTasks.filter((t) => t.status === "done" || t.status === "completed");
  const inProgressTasks = sprintTasks.filter(
    (t) => t.status === "in_progress" || t.status === "in-progress" || t.status === "review"
  );
  const blockedTasks = sprintTasks.filter((t) => t.status === "blocked");

  const burnRate = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;
  const completionProbability =
    selectedSprint.completion_probability !== undefined
      ? Math.round(selectedSprint.completion_probability * 100)
      : Math.min(95, Math.max(50, 100 - blockedTasks.length * 15));

  const isHighRisk = blockedTasks.length > 0 || (loadPercentage > 115 && burnRate < 30);

  return (
    <section id="sprint-kpi-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {/* CARD 1: Story Points Burn */}
      <div
        id="kpi-story-points-burn"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4.5 flex flex-col justify-between shadow-2xs hover:border-teal-500/40 transition-all"
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              STORY POINTS BURN
            </span>
            <div className="w-7 h-7 rounded-xl bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 flex items-center justify-center">
              <Flame size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {completedPoints}
            </span>
            <span className="text-sm font-semibold text-slate-400">
              / {totalPoints} PTS
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {remainingPoints} story points left to burn down
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] mb-1.5 font-medium">
            <span className="text-slate-500">Burn Completion</span>
            <span className="text-teal-600 dark:text-teal-400 font-bold">{burnRate}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-300"
              style={{ width: `${burnRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* CARD 2: Velocity & Capacity */}
      <div
        id="kpi-velocity-capacity"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4.5 flex flex-col justify-between shadow-2xs hover:border-teal-500/40 transition-all"
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              VELOCITY & CAPACITY
            </span>
            <div className="w-7 h-7 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Gauge size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {velocity}
            </span>
            <span className="text-sm font-semibold text-slate-400">
              / {capacity} CAP
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                loadPercentage > 105
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
              }`}
            >
              {loadPercentage}% {loadPercentage > 105 ? "Heavy Load" : "Optimal Load"}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] mb-1.5 font-medium">
            <span className="text-slate-500">Capacity Utilization</span>
            <span className="text-slate-700 dark:text-slate-300 font-bold">{loadPercentage}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                loadPercentage > 105 ? "bg-amber-500" : "bg-blue-500"
              }`}
              style={{ width: `${Math.min(100, loadPercentage)}%` }}
            />
          </div>
        </div>
      </div>

      {/* CARD 3: AI Forecast & Health */}
      <div
        id="kpi-ai-forecast-health"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4.5 flex flex-col justify-between shadow-2xs hover:border-teal-500/40 transition-all"
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              AI FORECAST & HEALTH
            </span>
            <div className="w-7 h-7 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Sparkles size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {completionProbability}%
            </span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Confidence
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                isHighRisk
                  ? "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300"
                  : "bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300"
              }`}
            >
              {isHighRisk ? (
                <>
                  <AlertTriangle size={11} />
                  Attention Needed
                </>
              ) : (
                <>
                  <CheckCircle2 size={11} />
                  LOW RISK · ON TRACK
                </>
              )}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {isHighRisk
              ? "Active blockers identified; review standup"
              : "Autonomous delivery pace satisfies commitments"}
          </p>
        </div>
      </div>

      {/* CARD 4: Work Items */}
      <div
        id="kpi-work-items"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-4.5 flex flex-col justify-between shadow-2xs hover:border-teal-500/40 transition-all"
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              WORK ITEMS
            </span>
            <div className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
              <ListTodo size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {sprintTasks.length}
            </span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Tasks
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Assigned to autonomous multi-agent swarm
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1 text-[11px]">
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
            {doneTasks.length} Done
          </span>
          <span className="text-amber-600 dark:text-amber-400 font-semibold">
            {inProgressTasks.length} Active
          </span>
          <span className="text-red-600 dark:text-red-400 font-semibold">
            {blockedTasks.length} Blocked
          </span>
        </div>
      </div>
    </section>
  );
};
