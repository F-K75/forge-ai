import React from "react";
import { Link } from "react-router-dom";
import {
  Zap,
  Calendar,
  Clock,
  CheckCircle2,
  Play,
  CheckCheck,
  Kanban,
  Flag,
} from "lucide-react";
import type { PMSprint } from "../../../lib/types/api";

interface SprintHeaderProps {
  sprints: PMSprint[];
  selectedSprint: PMSprint;
  onSelectSprint: (sprint: PMSprint) => void;
  onOpenCreateModal: () => void;
  onUpdateSprintStatus: (sprintId: string, status: "planning" | "active" | "completed") => void;
  initiativeId?: string;
  totalTasksCount: number;
  completedTasksCount: number;
  totalPoints: number;
  completedPoints: number;
  inProgressPoints: number;
}

export const SprintHeader: React.FC<SprintHeaderProps> = ({
  sprints,
  selectedSprint,
  onSelectSprint,
  onOpenCreateModal,
  onUpdateSprintStatus,
  initiativeId,
  totalTasksCount,
  completedTasksCount,
  totalPoints,
  completedPoints,
  inProgressPoints,
}) => {
  const isCompleted = selectedSprint.status === "completed";
  const isActive = selectedSprint.status === "active";
  const isPlanning = !isCompleted && !isActive;

  // Calculate days remaining or duration
  const daysRemaining = React.useMemo(() => {
    if (isCompleted) return "Completed";
    if (selectedSprint.end_date) {
      const end = new Date(selectedSprint.end_date).getTime();
      const now = Date.now();
      const diffDays = Math.ceil((end - now) / 86400000);
      if (diffDays <= 0) return "Cycle ending today";
      return `${diffDays} days remaining`;
    }
    return "14-day cycle";
  }, [selectedSprint.end_date, isCompleted]);

  const dateRangeDisplay = React.useMemo(() => {
    if (!selectedSprint.start_date) return "Sprint Cycle Duration: 14 Days";
    const start = new Date(selectedSprint.start_date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    const end = selectedSprint.end_date
      ? new Date(selectedSprint.end_date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "Ongoing";
    return `${start} — ${end}`;
  }, [selectedSprint.start_date, selectedSprint.end_date]);

  const percentComplete = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;
  const percentInProgress = totalPoints > 0 ? Math.round((inProgressPoints / totalPoints) * 100) : 0;
  const percentRemaining = Math.max(0, 100 - percentComplete - percentInProgress);

  return (
    <header id="sprint-page-header" className="space-y-4">
      {/* Top Action & Sprint Selector Row */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Sprint Picker Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-none" id="sprint-switcher-bar">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 shrink-0 mr-1 flex items-center gap-1.5">
            <Zap size={14} className="text-teal-600 dark:text-teal-400" />
            <span>Sprints:</span>
          </span>

          {sprints.map((sprint) => {
            const isSel = sprint.id === selectedSprint.id;
            const sActive = sprint.status === "active";
            const sDone = sprint.status === "completed";

            return (
              <button
                key={sprint.id}
                id={`sprint-select-${sprint.id}`}
                type="button"
                onClick={() => onSelectSprint(sprint)}
                className={`group relative px-3.5 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all cursor-pointer flex items-center gap-2 border ${
                  isSel
                    ? "bg-teal-600 text-white border-teal-700 shadow-sm ring-2 ring-teal-500/20 dark:ring-teal-400/20"
                    : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-teal-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/80"
                }`}
              >
                {/* Status Dot */}
                <span className="relative flex h-2 w-2">
                  {sActive && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      sActive
                        ? "bg-emerald-500"
                        : sDone
                        ? isSel
                          ? "bg-slate-200"
                          : "bg-slate-400"
                        : "bg-amber-400"
                    }`}
                  />
                </span>

                <span className="tracking-tight">
                  Sprint {sprint.sprint_number}
                </span>

                {sDone && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                      isSel ? "bg-white/20 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                    }`}
                  >
                    Done
                  </span>
                )}
                {sActive && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                      isSel ? "bg-white/20 text-white" : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    Live
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Global Quick Actions */}
        <div className="flex items-center gap-2.5 shrink-0" id="sprint-header-actions">
          {initiativeId && (
            <Link
              id="sprint-header-open-board-link"
              to={`/initiatives/${initiativeId}/board`}
              className="h-9 px-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 transition-all shadow-2xs"
            >
              <Kanban size={14} className="text-teal-600 dark:text-teal-400" />
              <span>Board</span>
            </Link>
          )}

          <button
            id="sprint-header-new-sprint-btn"
            type="button"
            onClick={onOpenCreateModal}
            className="h-9 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Zap size={14} className="fill-current" />
            <span>NEW SPRINT</span>
          </button>
        </div>
      </div>

      {/* Main Sprint Commitment Banner */}
      <div
        id="sprint-commitment-banner"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 md:p-6 shadow-xs space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800/60">
                SPRINT {selectedSprint.sprint_number} COMMITMENT
              </span>

              {isActive && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active Sprint
                </span>
              )}

              {isCompleted && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                  <CheckCircle2 size={12} className="text-slate-500" />
                  Completed
                </span>
              )}

              {isPlanning && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800">
                  <Clock size={12} className="text-amber-500" />
                  In Planning
                </span>
              )}
            </div>

            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {selectedSprint.name || `Sprint ${selectedSprint.sprint_number}: Delivery Milestone`}
            </h1>

            {selectedSprint.goal && (
              <div className="flex items-start gap-2 pt-1 text-slate-600 dark:text-slate-300 text-xs md:text-sm leading-relaxed">
                <Flag size={15} className="text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
                <p className="font-medium">
                  <strong className="text-slate-900 dark:text-slate-100 font-semibold mr-1.5">
                    Sprint Goal:
                  </strong>
                  {selectedSprint.goal}
                </p>
              </div>
            )}
          </div>

          {/* Right Side Cadence & Sprint State Actions */}
          <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={13} className="text-slate-400" />
                <span>{dateRangeDisplay}</span>
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                <Clock size={13} className="text-teal-600 dark:text-teal-400" />
                <span>{daysRemaining}</span>
              </span>
            </div>

            {/* Lifecycle Buttons */}
            <div className="flex items-center gap-2">
              {isPlanning && (
                <button
                  id="sprint-start-btn"
                  type="button"
                  onClick={() => onUpdateSprintStatus(selectedSprint.id, "active")}
                  className="h-8 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                >
                  <Play size={12} className="fill-current" />
                  <span>Start Sprint</span>
                </button>
              )}

              {isActive && (
                <button
                  id="sprint-complete-btn"
                  type="button"
                  onClick={() => onUpdateSprintStatus(selectedSprint.id, "completed")}
                  className="h-8 px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                >
                  <CheckCheck size={14} className="text-teal-600 dark:text-teal-400" />
                  <span>Complete Sprint</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Progress & Burn Metric Bar */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4 text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {completedPoints} of {totalPoints} Points Burned ({percentComplete}%)
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Done: {completedPoints} pts</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>In Flight: {inProgressPoints} pts</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />
                <span>Todo: {Math.max(0, totalPoints - completedPoints - inProgressPoints)} pts</span>
              </span>
            </div>

            <span className="text-[11px] font-semibold text-slate-500">
              {completedTasksCount} / {totalTasksCount} tasks completed
            </span>
          </div>

          {/* Multi-segment Progress Bar */}
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${percentComplete}%` }}
              title={`Completed: ${percentComplete}%`}
            />
            <div
              className="h-full bg-amber-400 transition-all duration-300"
              style={{ width: `${percentInProgress}%` }}
              title={`In Progress: ${percentInProgress}%`}
            />
            <div
              className="h-full bg-transparent transition-all duration-300"
              style={{ width: `${percentRemaining}%` }}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
