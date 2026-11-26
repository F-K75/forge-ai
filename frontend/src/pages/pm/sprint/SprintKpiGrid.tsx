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
        className="rounded-2xl border border-border bg-panel p-4.5 flex flex-col justify-between shadow-2xs hover:border-agent-integration/40 transition-all"
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              STORY POINTS BURN
            </span>
            <div className="w-7 h-7 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
              <Flame size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              {completedPoints}
            </span>
            <span className="text-sm font-semibold text-faint">
              / {totalPoints} PTS
            </span>
          </div>

          <p className="text-xs text-muted mt-1">
            {remainingPoints} story points left to burn down
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-border-soft">
          <div className="flex items-center justify-between text-[11px] mb-1.5 font-medium">
            <span className="text-muted">Burn Completion</span>
            <span className="text-agent-integration font-semibold">{burnRate}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-panel-alt overflow-hidden">
            <div
              className="h-full bg-agent-integration rounded-full transition-all duration-300"
              style={{ width: `${burnRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* CARD 2: Velocity & Capacity */}
      <div
        id="kpi-velocity-capacity"
        className="rounded-2xl border border-border bg-panel p-4.5 flex flex-col justify-between shadow-2xs hover:border-agent-integration/40 transition-all"
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              VELOCITY & CAPACITY
            </span>
            <div className="w-7 h-7 rounded-xl bg-info/10 text-info flex items-center justify-center">
              <Gauge size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              {velocity}
            </span>
            <span className="text-sm font-semibold text-faint">
              / {capacity} CAP
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                loadPercentage > 105
                  ? "bg-warn/10 text-warn "
                  : "bg-ok/10 text-ok "
              }`}
            >
              {loadPercentage}% {loadPercentage > 105 ? "Heavy Load" : "Optimal Load"}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border-soft">
          <div className="flex items-center justify-between text-[11px] mb-1.5 font-medium">
            <span className="text-muted">Capacity Utilization</span>
            <span className="text-ink font-semibold">{loadPercentage}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-panel-alt overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                loadPercentage > 105 ? "bg-warn" : "bg-panel-alt"
              }`}
              style={{ width: `${Math.min(100, loadPercentage)}%` }}
            />
          </div>
        </div>
      </div>

      {/* CARD 3: AI Forecast & Health */}
      <div
        id="kpi-ai-forecast-health"
        className="rounded-2xl border border-border bg-panel p-4.5 flex flex-col justify-between shadow-2xs hover:border-agent-integration/40 transition-all"
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              AI FORECAST & HEALTH
            </span>
            <div className="w-7 h-7 rounded-xl bg-agent-business-improver/10 text-agent-business-improver flex items-center justify-center">
              <Sparkles size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              {completionProbability}%
            </span>
            <span className="text-xs font-semibold text-faint uppercase tracking-wider">
              Confidence
            </span>
          </div>

          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                isHighRisk
                  ? "bg-error/10 text-error "
                  : "bg-agent-integration/10 text-agent-integration "
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

        <div className="mt-4 pt-3 border-t border-border-soft">
          <p className="text-[11px] text-muted truncate">
            {isHighRisk
              ? "Active blockers identified; review standup"
              : "Autonomous delivery pace satisfies commitments"}
          </p>
        </div>
      </div>

      {/* CARD 4: Work Items */}
      <div
        id="kpi-work-items"
        className="rounded-2xl border border-border bg-panel p-4.5 flex flex-col justify-between shadow-2xs hover:border-agent-integration/40 transition-all"
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              WORK ITEMS
            </span>
            <div className="w-7 h-7 rounded-xl bg-panel-alt text-ink flex items-center justify-center">
              <ListTodo size={15} />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tracking-tight text-ink">
              {sprintTasks.length}
            </span>
            <span className="text-xs font-semibold text-faint uppercase tracking-wider">
              Total Tasks
            </span>
          </div>

          <p className="text-xs text-muted mt-1">
            Assigned to autonomous multi-agent swarm
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-border-soft flex items-center justify-between gap-1 text-[11px]">
          <span className="text-ok font-semibold">
            {doneTasks.length} Done
          </span>
          <span className="text-warn font-semibold">
            {inProgressTasks.length} Active
          </span>
          <span className="text-error font-semibold">
            {blockedTasks.length} Blocked
          </span>
        </div>
      </div>
    </section>
  );
};
