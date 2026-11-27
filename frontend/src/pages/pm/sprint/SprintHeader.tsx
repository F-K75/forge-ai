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
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted shrink-0 mr-1 flex items-center gap-1.5">
            <Zap size={14} className="text-agent-integration" />
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
                    ? "bg-agent-integration text-on-ink border-agent-integration/30 shadow-sm ring-2 ring-agent-integration/20"
                    : "bg-panel text-ink border-border hover:border-agent-integration/50 hover:bg-ink/5"
                }`}
              >
                {/* Status Dot */}
                <span className="relative flex h-2 w-2">
                  {sActive && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      sActive
                        ? "bg-ok"
                        : sDone
                        ? isSel
                          ? "bg-surface-high"
                          : "bg-ink/30"
                        : "bg-warn"
                    }`}
                  />
                </span>

                <span className="tracking-tight">
                  Sprint {sprint.sprint_number}
                </span>

                {sDone && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                      isSel ? "bg-ink/20 text-ink" : "bg-panel-alt text-muted"
                    }`}
                  >
                    Done
                  </span>
                )}
                {sActive && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase ${
                      isSel ? "bg-ink/20 text-ink" : "bg-ok/10 text-ok"
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
              className="h-9 px-3.5 rounded-xl border border-border bg-panel text-ink hover:bg-ink/5 text-xs font-semibold flex items-center gap-2 transition-all shadow-2xs"
            >
              <Kanban size={14} className="text-agent-integration" />
              <span>Board</span>
            </Link>
          )}

          <button
            id="sprint-header-new-sprint-btn"
            type="button"
            onClick={onOpenCreateModal}
            className="h-9 px-4 rounded-pill bg-agent-integration hover:bg-agent-integration/90 active:bg-agent-integration text-on-ink text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
          >
            <Zap size={14} className="fill-current" />
            <span>NEW SPRINT</span>
          </button>
        </div>
      </div>

      {/* Main Sprint Commitment Banner */}
      <div
        id="sprint-commitment-banner"
        className="rounded-2xl border border-border bg-panel p-5 md:p-6 shadow-xs space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-agent-integration/10 text-agent-integration border border-agent-integration/30 ">
                SPRINT {selectedSprint.sprint_number} COMMITMENT
              </span>

              {isActive && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-ok/10 text-ok border border-ok/30 ">
                  <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
                  Active Sprint
                </span>
              )}

              {isCompleted && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-panel-alt text-ink border border-border ">
                  <CheckCircle2 size={12} className="text-muted" />
                  Completed
                </span>
              )}

              {isPlanning && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-warn/10 text-warn border border-warn/30 ">
                  <Clock size={12} className="text-warn" />
                  In Planning
                </span>
              )}
            </div>

            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-ink">
              {selectedSprint.name || `Sprint ${selectedSprint.sprint_number}: Delivery Milestone`}
            </h1>

            {selectedSprint.goal && (
              <div className="flex items-start gap-2 pt-1 text-muted text-xs md:text-sm leading-relaxed">
                <Flag size={15} className="text-agent-integration shrink-0 mt-0.5" />
                <p className="font-medium">
                  <strong className="text-ink font-semibold mr-1.5">
                    Sprint Goal:
                  </strong>
                  {selectedSprint.goal}
                </p>
              </div>
            )}
          </div>

          {/* Right Side Cadence & Sprint State Actions */}
          <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={13} className="text-faint" />
                <span>{dateRangeDisplay}</span>
              </span>
              <span className="w-1 h-1 rounded-full bg-surface-high" />
              <span className="inline-flex items-center gap-1.5 font-medium text-ink">
                <Clock size={13} className="text-agent-integration" />
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
                  className="h-8 px-3.5 rounded-pill bg-ok hover:bg-ok/90 text-on-ink text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
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
                  className="h-8 px-3.5 rounded-pill border border-border bg-panel hover:bg-ink/5 text-ink text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                >
                  <CheckCheck size={14} className="text-agent-integration" />
                  <span>Complete Sprint</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Progress & Burn Metric Bar */}
        <div className="pt-3 border-t border-border-soft space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4 text-muted">
              <span className="font-semibold text-ink">
                {completedPoints} of {totalPoints} Points Burned ({percentComplete}%)
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-ok" />
                <span>Done: {completedPoints} pts</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-warn" />
                <span>In Flight: {inProgressPoints} pts</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-surface-high" />
                <span>Todo: {Math.max(0, totalPoints - completedPoints - inProgressPoints)} pts</span>
              </span>
            </div>

            <span className="text-[11px] font-semibold text-muted">
              {completedTasksCount} / {totalTasksCount} tasks completed
            </span>
          </div>

          {/* Multi-segment Progress Bar */}
          <div className="h-2 w-full rounded-full bg-panel-alt overflow-hidden flex">
            <div
              className="h-full bg-ok transition-all duration-300"
              style={{ width: `${percentComplete}%` }}
              title={`Completed: ${percentComplete}%`}
            />
            <div
              className="h-full bg-warn transition-all duration-300"
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
