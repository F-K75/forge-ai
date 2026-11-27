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
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";

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
          <span className="text-xs text-muted shrink-0 mr-1">Sprints</span>

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
                aria-pressed={isSel}
                className={`group relative h-8 px-3 rounded-pill text-xs font-medium shrink-0 transition-colors cursor-pointer flex items-center gap-2 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isSel
                    ? "bg-ink/[0.08] text-ink border-border"
                    : "bg-transparent text-muted border-border-soft hover:text-ink hover:bg-ink/5"
                }`}
              >
                {/* Status Dot */}
                <span className="relative flex h-2 w-2">
                  {sActive && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-60" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      sActive ? "bg-accent" : sDone ? "bg-ok" : "bg-warn"
                    }`}
                  />
                </span>

                <span>Sprint {sprint.sprint_number}</span>

                {sDone && (
                  <Badge variant="success" size="sm">
                    Done
                  </Badge>
                )}
                {sActive && (
                  <Badge variant="accent" size="sm">
                    Live
                  </Badge>
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
              className="h-9 min-h-[44px] sm:min-h-[32px] sm:h-8 px-3.5 rounded-pill border border-transparent text-muted hover:bg-ink/5 hover:text-ink text-xs font-medium flex items-center gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Kanban size={14} />
              <span>Board</span>
            </Link>
          )}

          <Button
            id="sprint-header-new-sprint-btn"
            variant="primary"
            size="sm"
            onClick={onOpenCreateModal}
          >
            <Zap size={14} />
            <span>New sprint</span>
          </Button>
        </div>
      </div>

      {/* Main Sprint Commitment Banner */}
      <div
        id="sprint-commitment-banner"
        className="rounded-xl border border-border bg-panel p-5 md:p-6 space-y-4"
      >
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs text-muted">
                Sprint {selectedSprint.sprint_number} commitment
              </span>

              {isActive && (
                <Badge variant="accent" dot>
                  Active sprint
                </Badge>
              )}

              {isCompleted && (
                <Badge variant="success">
                  <CheckCircle2 size={12} />
                  Completed
                </Badge>
              )}

              {isPlanning && (
                <Badge variant="warning">
                  <Clock size={12} />
                  In planning
                </Badge>
              )}
            </div>

            <h1 className="text-xl md:text-2xl font-medium tracking-tight text-ink">
              {selectedSprint.name || `Sprint ${selectedSprint.sprint_number}: Delivery Milestone`}
            </h1>

            {selectedSprint.goal && (
              <div className="flex items-start gap-2 pt-1 text-muted text-xs md:text-sm leading-relaxed">
                <Flag size={15} className="text-faint shrink-0 mt-0.5" />
                <p>
                  <strong className="text-ink font-medium mr-1.5">
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
                <Clock size={13} className="text-faint" />
                <span>{daysRemaining}</span>
              </span>
            </div>

            {/* Lifecycle Buttons */}
            <div className="flex items-center gap-2">
              {isPlanning && (
                <Button
                  id="sprint-start-btn"
                  variant="tonal"
                  size="sm"
                  onClick={() => onUpdateSprintStatus(selectedSprint.id, "active")}
                >
                  <Play size={12} className="fill-current" />
                  <span>Start Sprint</span>
                </Button>
              )}

              {isActive && (
                <Button
                  id="sprint-complete-btn"
                  variant="secondary"
                  size="sm"
                  onClick={() => onUpdateSprintStatus(selectedSprint.id, "completed")}
                >
                  <CheckCheck size={14} />
                  <span>Complete Sprint</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Progress & Burn Metric Bar */}
        <div className="pt-3 border-t border-border-soft space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4 text-muted">
              <span className="font-medium text-ink">
                <span className="font-mono tabular-nums">{completedPoints}</span> of{" "}
                <span className="font-mono tabular-nums">{totalPoints}</span> points burned (
                <span className="font-mono tabular-nums">{percentComplete}%</span>)
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

            <span className="text-xs text-muted">
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
