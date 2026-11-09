import React, { useState, useMemo } from "react";
import { usePMStore } from "../../store/pmStore";
import toast from "react-hot-toast";
import {
  RoadmapHeader,
} from "./roadmap/RoadmapHeader";
import {
  RoadmapFilterBar,
  type RoadmapViewMode,
  type QuarterFilter,
  type PriorityFilter,
} from "./roadmap/RoadmapFilterBar";
import { RoadmapTimelineView } from "./roadmap/RoadmapTimelineView";
import { RoadmapQuarterBoard } from "./roadmap/RoadmapQuarterBoard";
import { RoadmapMilestonesView } from "./roadmap/RoadmapMilestonesView";
import { RoadmapEpicsView } from "./roadmap/RoadmapEpicsView";
import { RoadmapEpicModal } from "./roadmap/RoadmapEpicModal";
import type { PMEpic } from "../../lib/types/api";

export default function RoadmapTab() {
  const { initiative, prd, epics, stories, tasks, sprints, loading } = usePMStore();

  const [viewMode, setViewMode] = useState<RoadmapViewMode>("timeline");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedQuarter, setSelectedQuarter] = useState<QuarterFilter>("all");
  const [selectedPriority, setSelectedPriority] = useState<PriorityFilter>("all");

  const [selectedEpic, setSelectedEpic] = useState<PMEpic | null>(null);
  const [isEpicModalOpen, setIsEpicModalOpen] = useState(false);
  const [isForecasting, setIsForecasting] = useState(false);

  // Filter epics based on user query, quarter, and priority
  const filteredEpics = useMemo(() => {
    return epics.filter((epic) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = epic.title.toLowerCase().includes(q);
        const matchesDesc = (epic.description || "").toLowerCase().includes(q);
        const matchesPriority = (epic.priority || "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesPriority) return false;
      }

      // Priority filter
      if (selectedPriority !== "all") {
        if ((epic.priority || "p2").toLowerCase() !== selectedPriority.toLowerCase()) {
          return false;
        }
      }

      // Quarter filter
      if (selectedQuarter !== "all") {
        const dur = (epic.estimated_duration || "").toLowerCase();
        if (dur.includes(selectedQuarter.toLowerCase())) {
          return true;
        }
        const epicIndex = epics.findIndex((e) => e.id === epic.id);
        const mappedQ = ["Q1", "Q2", "Q3", "Q4"][epicIndex % 4];
        if (mappedQ.toLowerCase() !== selectedQuarter.toLowerCase()) {
          return false;
        }
      }

      return true;
    });
  }, [epics, searchQuery, selectedPriority, selectedQuarter]);

  // Handle Export Roadmap
  const handleExportRoadmap = () => {
    const data = {
      initiative: initiative?.name,
      vision: initiative?.vision,
      exportedAt: new Date().toISOString(),
      summary: {
        totalEpics: epics.length,
        totalStories: stories.length,
        totalTasks: tasks.length,
        phases: initiative?.roadmap || [],
      },
      epics: epics.map((e) => ({
        id: e.id,
        title: e.title,
        priority: e.priority,
        storyPoints: e.story_points,
        duration: e.estimated_duration,
        description: e.description,
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roadmap-${initiative?.name?.toLowerCase().replace(/\s+/g, "-") || "export"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Strategic Roadmap exported as JSON");
  };

  // Simulate AI Horizon Forecast
  const handleSimulateForecast = () => {
    setIsForecasting(true);
    toast.loading("Analyzing sprint velocities & dependency bottlenecks…", { id: "forecast" });

    setTimeout(() => {
      setIsForecasting(false);
      toast.success(
        "Forecast complete: 94% on-time milestone delivery confidence with 1.5-week buffer margin.",
        { id: "forecast", duration: 5000 }
      );
    }, 1200);
  };

  const handleOpenEpicModal = (epic: PMEpic) => {
    setSelectedEpic(epic);
    setIsEpicModalOpen(true);
  };

  const handleCloseEpicModal = () => {
    setIsEpicModalOpen(false);
    setSelectedEpic(null);
  };

  if (!initiative) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400">
          No initiative loaded. Select an initiative to view its product roadmap.
        </div>
      </div>
    );
  }

  return (
    <div id="roadmap-tab-root" className="mx-auto max-w-7xl px-4 py-6 md:px-8 space-y-6">
      {/* Executive Telemetry Header */}
      <RoadmapHeader
        initiative={initiative}
        epics={epics}
        stories={stories}
        tasks={tasks}
        onExportRoadmap={handleExportRoadmap}
        onSimulateForecast={handleSimulateForecast}
        isForecasting={isForecasting}
      />

      {/* Navigation & Filter Bar */}
      <RoadmapFilterBar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedQuarter={selectedQuarter}
        onQuarterChange={setSelectedQuarter}
        selectedPriority={selectedPriority}
        onPriorityChange={setSelectedPriority}
        totalEpics={epics.length}
      />

      {/* Primary View Modes */}
      <main id="roadmap-view-container" className="space-y-4 min-h-[420px]">
        {viewMode === "timeline" && (
          <RoadmapTimelineView
            epics={filteredEpics}
            stories={stories}
            tasks={tasks}
            sprints={sprints}
            onSelectEpic={handleOpenEpicModal}
          />
        )}

        {viewMode === "quarters" && (
          <RoadmapQuarterBoard
            epics={filteredEpics}
            stories={stories}
            tasks={tasks}
            onSelectEpic={handleOpenEpicModal}
          />
        )}

        {viewMode === "milestones" && (
          <RoadmapMilestonesView
            initiative={initiative}
            epics={filteredEpics}
            prd={prd}
          />
        )}

        {viewMode === "epics" && (
          <RoadmapEpicsView
            epics={filteredEpics}
            stories={stories}
            tasks={tasks}
            onSelectEpic={handleOpenEpicModal}
          />
        )}
      </main>

      {/* Epic Drilldown Modal */}
      <RoadmapEpicModal
        isOpen={isEpicModalOpen}
        onClose={handleCloseEpicModal}
        epic={selectedEpic}
        stories={stories}
        tasks={tasks}
      />
    </div>
  );
}
