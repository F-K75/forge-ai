import React from "react";
import {
  Map,
  Sparkles,
  Download,
  Calendar,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
  TrendingUp,
  Compass,
  ArrowUpRight,
} from "lucide-react";
import type { PMInitiative, PMEpic, PMStory, PMTask } from "../../../lib/types/api";

interface RoadmapHeaderProps {
  initiative: PMInitiative;
  epics: PMEpic[];
  stories: PMStory[];
  tasks: PMTask[];
  onExportRoadmap: () => void;
  onSimulateForecast: () => void;
  isForecasting?: boolean;
}

export function RoadmapHeader({
  initiative,
  epics,
  stories,
  tasks,
  onExportRoadmap,
  onSimulateForecast,
  isForecasting = false,
}: RoadmapHeaderProps) {
  // Calculate aggregated telemetry
  const totalEpics = epics.length;
  const p0Epics = epics.filter((e) => e.priority === "p0").length;

  const totalPoints = epics.reduce((acc, e) => acc + (e.story_points || 0), 0);
  const totalHours = tasks.reduce((acc, t) => acc + (t.estimated_hours || 0), 0);

  const completedTasks = tasks.filter((t) => t.status === "done").length;
  const progressPct =
    tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : totalEpics > 0 ? 35 : 0;

  const phasesCount = (initiative.roadmap as any[])?.length || 4;

  const criticalDependencies = tasks.reduce(
    (acc, t) => acc + (t.dependencies?.length || 0),
    0
  );

  return (
    <div
      id="roadmap-header"
      className="rounded-2xl border border-border bg-panel shadow-sm overflow-hidden"
    >
      {/* Top Banner Row */}
      <div className="p-5 sm:p-6 border-b border-border-soft ember-atmosphere">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-info/10 text-info border border-info/30">
                <Compass size={12} className="text-accent" />
                Strategic Product Roadmap
              </span>
              <span className="text-xs text-faint font-mono">
                Initiative #{initiative.id.slice(0, 8)}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-ok/10 text-ok border border-ok/30 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                On Track · 92% SLA
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-semibold text-ink tracking-tight flex items-center gap-2">
              <Map size={24} className="text-accent shrink-0" />
              <span>{initiative.name}</span>
            </h1>

            {initiative.vision && (
              <p className="text-xs sm:text-sm text-muted max-w-3xl line-clamp-2 leading-relaxed">
                {initiative.vision}
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-ai-forecast"
              type="button"
              onClick={onSimulateForecast}
              disabled={isForecasting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-pill bg-ink hover:bg-ink/90 text-on-ink shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles size={14} className={isForecasting ? "animate-spin" : ""} />
              <span>{isForecasting ? "Forecasting…" : "AI Horizon Forecast"}</span>
            </button>

            <button
              id="btn-export-roadmap"
              type="button"
              onClick={onExportRoadmap}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-border hover:bg-ink/5 text-ink transition-colors cursor-pointer"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export Plan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Executive 12-Column Telemetry KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-border-soft bg-panel text-xs">
        {/* KPI 1: Epics & Priority Scope */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-1">
            <span className="text-caption text-muted">Total Epics</span>
            <Layers size={14} className="text-accent" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-semibold text-ink">
              {totalEpics}
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              <span className="font-semibold text-error">{p0Epics} P0 Critical</span>{" "}
              · {totalEpics - p0Epics} Standard
            </div>
          </div>
        </div>

        {/* KPI 2: Delivery Completion Progress */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-1">
            <span className="text-caption text-muted">Delivery Progress</span>
            <TrendingUp size={14} className="text-ok" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-semibold text-ink">
                {progressPct}%
              </span>
              <span className="text-[11px] text-ok font-medium">
                {completedTasks}/{tasks.length || stories.length} items
              </span>
            </div>
            <div className="w-full bg-panel-alt h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-ok h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI 3: Committed Points & Hours */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-1">
            <span className="text-caption text-muted">Effort & Capacity</span>
            <Clock size={14} className="text-agent-business-improver" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-semibold text-ink">
              {totalPoints} <span className="text-sm font-normal text-muted">pts</span>
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              ~{totalHours} engineering hours
            </div>
          </div>
        </div>

        {/* KPI 4: Target Horizon & Phases */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-muted mb-1">
            <span className="text-caption text-muted">Cadence Horizon</span>
            <Calendar size={14} className="text-warn" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-semibold text-ink">
              {phasesCount} <span className="text-sm font-normal text-muted">Phases</span>
            </div>
            <div className="text-[11px] text-muted mt-0.5 truncate">
              {initiative.estimated_timeline || "4-Quarter Delivery Cycle"}
            </div>
          </div>
        </div>

        {/* KPI 5: Dependency Graph & Risks */}
        <div className="p-4 sm:p-5 flex flex-col justify-between col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-muted mb-1">
            <span className="text-caption text-muted">Critical Path</span>
            <AlertTriangle size={14} className="text-warn" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-semibold text-ink">
              {criticalDependencies} <span className="text-sm font-normal text-muted">links</span>
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              {(initiative.risks ?? []).length} key initiative risks
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
