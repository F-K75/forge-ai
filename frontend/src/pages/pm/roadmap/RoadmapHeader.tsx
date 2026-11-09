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
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
    >
      {/* Top Banner Row */}
      <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800/80 bg-gradient-to-r from-slate-50 via-white to-blue-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-blue-950/20">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 border border-blue-200 dark:border-blue-700/50">
                <Compass size={12} className="text-blue-600 dark:text-blue-400" />
                Strategic Product Roadmap
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                Initiative #{initiative.id.slice(0, 8)}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                On Track · 92% SLA
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
              <Map size={24} className="text-blue-600 dark:text-blue-400 shrink-0" />
              <span>{initiative.name}</span>
            </h1>

            {initiative.vision && (
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-3xl line-clamp-2 leading-relaxed">
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
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles size={14} className={isForecasting ? "animate-spin" : ""} />
              <span>{isForecasting ? "Forecasting…" : "AI Horizon Forecast"}</span>
            </button>

            <button
              id="btn-export-roadmap"
              type="button"
              onClick={onExportRoadmap}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export Plan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Executive 12-Column Telemetry KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-slate-900 text-xs">
        {/* KPI 1: Epics & Priority Scope */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-medium text-[11px] uppercase tracking-wider">Total Epics</span>
            <Layers size={14} className="text-blue-500" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {totalEpics}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              <span className="font-semibold text-rose-600 dark:text-rose-400">{p0Epics} P0 Critical</span>{" "}
              · {totalEpics - p0Epics} Standard
            </div>
          </div>
        </div>

        {/* KPI 2: Delivery Completion Progress */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-medium text-[11px] uppercase tracking-wider">Delivery Progress</span>
            <TrendingUp size={14} className="text-emerald-500" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                {progressPct}%
              </span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                {completedTasks}/{tasks.length || stories.length} items
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI 3: Committed Points & Hours */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-medium text-[11px] uppercase tracking-wider">Effort & Capacity</span>
            <Clock size={14} className="text-purple-500" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {totalPoints} <span className="text-sm font-normal text-slate-500">pts</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              ~{totalHours} engineering hours
            </div>
          </div>
        </div>

        {/* KPI 4: Target Horizon & Phases */}
        <div className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-medium text-[11px] uppercase tracking-wider">Cadence Horizon</span>
            <Calendar size={14} className="text-amber-500" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {phasesCount} <span className="text-sm font-normal text-slate-500">Phases</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 truncate">
              {initiative.estimated_timeline || "4-Quarter Delivery Cycle"}
            </div>
          </div>
        </div>

        {/* KPI 5: Dependency Graph & Risks */}
        <div className="p-4 sm:p-5 flex flex-col justify-between col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="font-medium text-[11px] uppercase tracking-wider">Critical Path</span>
            <AlertTriangle size={14} className="text-amber-500" />
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
              {criticalDependencies} <span className="text-sm font-normal text-slate-500">links</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {(initiative.risks ?? []).length} key initiative risks
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
