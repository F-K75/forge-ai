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
import { Badge } from "../../../components/ui/Badge";

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


  const cardClass =
    "rounded-xl border border-border bg-panel p-4 flex flex-col justify-between transition-colors hover:border-ink/20";
  const iconClass = "w-8 h-8 rounded-[10px] bg-ink/[0.06] text-muted flex items-center justify-center";

  return (
    <section id="sprint-kpi-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {/* CARD 1: Story Points Burn */}
      <div id="kpi-story-points-burn" className={cardClass}>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-caption text-muted">Story points burn</span>
            <div className={iconClass}>
              <Flame size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-medium tracking-tight text-ink">
              {completedPoints}
            </span>
            <span className="text-xs text-faint">
              / <span className="font-mono tabular-nums">{totalPoints}</span> pts
            </span>
          </div>

          <p className="text-xs text-muted mt-1">
            <span className="font-mono tabular-nums">{remainingPoints}</span> story points left to burn down
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-border-soft">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted">Burn completion</span>
            <span className="font-mono tabular-nums text-ink">{burnRate}%</span>
          </div>
          <div className="h-1 w-full rounded-full bg-ink/[0.08] overflow-hidden">
            <div
              className="h-full bg-ink rounded-full transition-all duration-300"
              style={{ width: `${burnRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* CARD 2: Velocity & Capacity */}
      <div id="kpi-velocity-capacity" className={cardClass}>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-caption text-muted">Velocity & capacity</span>
            <div className={iconClass}>
              <Gauge size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-medium tracking-tight text-ink">
              {velocity}
            </span>
            <span className="text-xs text-faint">
              / <span className="font-mono tabular-nums">{capacity}</span> capacity
            </span>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5">
            <Badge variant={loadPercentage > 105 ? "warning" : "success"} size="sm">
              <span className="font-mono tabular-nums">{loadPercentage}%</span>
              {loadPercentage > 105 ? "Heavy load" : "Optimal load"}
            </Badge>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border-soft">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted">Capacity utilization</span>
            <span className="font-mono tabular-nums text-ink">{loadPercentage}%</span>
          </div>
          <div className="h-1 w-full rounded-full bg-ink/[0.08] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                loadPercentage > 105 ? "bg-warn" : "bg-ink/60"
              }`}
              style={{ width: `${Math.min(100, loadPercentage)}%` }}
            />
          </div>
        </div>
      </div>

      {/* CARD 3: AI Forecast & Health */}
      <div id="kpi-ai-forecast-health" className={cardClass}>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-caption text-muted">AI forecast & health</span>
            <div className={iconClass}>
              <Sparkles size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-medium tracking-tight text-ink">
              {completionProbability}%
            </span>
            <span className="text-xs text-faint">confidence</span>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5">
            <Badge variant={isHighRisk ? "error" : "success"} size="sm">
              {isHighRisk ? (
                <>
                  <AlertTriangle size={11} />
                  Attention needed
                </>
              ) : (
                <>
                  <CheckCircle2 size={11} />
                  Low risk · on track
                </>
              )}
            </Badge>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border-soft">
          <p className="text-xs text-muted truncate">
            {isHighRisk
              ? "Active blockers identified; review standup"
              : "Autonomous delivery pace satisfies commitments"}
          </p>
        </div>
      </div>

      {/* CARD 4: Work Items */}
      <div id="kpi-work-items" className={cardClass}>
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-caption text-muted">Work items</span>
            <div className={iconClass}>
              <ListTodo size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-medium tracking-tight text-ink">
              {sprintTasks.length}
            </span>
            <span className="text-xs text-faint">total tasks</span>
          </div>

          <p className="text-xs text-muted mt-1">
            Assigned to autonomous multi-agent swarm
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-border-soft flex items-center justify-between gap-1 text-xs">
          <span className="text-ok">
            <span className="font-mono tabular-nums">{doneTasks.length}</span> done
          </span>
          <span className="text-warn">
            <span className="font-mono tabular-nums">{inProgressTasks.length}</span> active
          </span>
          <span className="text-error">
            <span className="font-mono tabular-nums">{blockedTasks.length}</span> blocked
          </span>
        </div>
      </div>
    </section>
  );
};
