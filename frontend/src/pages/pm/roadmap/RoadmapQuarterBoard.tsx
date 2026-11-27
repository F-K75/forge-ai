import React from "react";
import {
  Calendar,
  Layers,
  Clock,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  Plus,
  AlertTriangle,
} from "lucide-react";
import type { PMEpic, PMStory, PMTask } from "../../../lib/types/api";

interface RoadmapQuarterBoardProps {
  epics: PMEpic[];
  stories: PMStory[];
  tasks: PMTask[];
  onSelectEpic: (epic: PMEpic) => void;
}

const QUARTERS = [
  {
    id: "Q1",
    label: "Q1: Foundation & Core Architecture",
    horizon: "Months 1–3",
    color: "blue",
  },
  {
    id: "Q2",
    label: "Q2: Core Engine & Automation",
    horizon: "Months 4–6",
    color: "purple",
  },
  {
    id: "Q3",
    label: "Q3: Integrations & Scalability",
    horizon: "Months 7–9",
    color: "amber",
  },
  {
    id: "Q4",
    label: "Q4: Enterprise Security & Optimization",
    horizon: "Months 10–12",
    color: "emerald",
  },
];

const PRIORITY_BADGE: Record<string, string> = {
  p0: "bg-error/10 text-error border-error/30",
  p1: "bg-warn/10 text-warn border-warn/30",
  p2: "bg-info/10 text-info border-info/30",
};

export function RoadmapQuarterBoard({
  epics,
  stories,
  tasks,
  onSelectEpic,
}: RoadmapQuarterBoardProps) {
  // Partition epics across Q1..Q4
  const quarterColumns = React.useMemo(() => {
    const buckets: Record<string, PMEpic[]> = {
      Q1: [],
      Q2: [],
      Q3: [],
      Q4: [],
    };

    epics.forEach((epic, idx) => {
      // If epic specifies duration or quarter in text, map accordingly; else distribute evenly
      const dur = (epic.estimated_duration || "").toLowerCase();
      if (dur.includes("q1")) buckets.Q1.push(epic);
      else if (dur.includes("q2")) buckets.Q2.push(epic);
      else if (dur.includes("q3")) buckets.Q3.push(epic);
      else if (dur.includes("q4")) buckets.Q4.push(epic);
      else {
        // Distribute round-robin or by index
        const qKey = QUARTERS[idx % QUARTERS.length].id;
        buckets[qKey].push(epic);
      }
    });

    return buckets;
  }, [epics]);

  return (
    <div id="roadmap-quarters-root" className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {QUARTERS.map((quarter) => {
          const quarterEpics = quarterColumns[quarter.id] || [];
          const totalPoints = quarterEpics.reduce((acc, e) => acc + (e.story_points || 0), 0);

          return (
            <div
              key={quarter.id}
              id={`quarter-col-${quarter.id}`}
              className="rounded-2xl border border-border bg-ink/10 p-3.5 flex flex-col h-full"
            >
              {/* Column Header */}
              <div className="pb-3 border-b border-border mb-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-info" />
                    {quarter.id} Horizon
                  </span>
                  <span className="text-[11px] font-mono text-faint">
                    {quarter.horizon}
                  </span>
                </div>
                <h4 className="text-xs font-medium text-muted line-clamp-1">
                  {quarter.label}
                </h4>

                <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                  <span>{quarterEpics.length} Epics</span>
                  <span className="font-semibold text-ink">
                    {totalPoints} story pts
                  </span>
                </div>
              </div>

              {/* Epics List in this Quarter */}
              <div className="flex-1 space-y-2.5 overflow-y-auto">
                {quarterEpics.length === 0 ? (
                  <div className="h-32 rounded-xl border border-dashed border-border flex items-center justify-center p-4 text-center">
                    <p className="text-xs text-faint">
                      No epics assigned to {quarter.id} yet.
                    </p>
                  </div>
                ) : (
                  quarterEpics.map((epic) => {
                    const linkedStories = stories.filter((s) => s.epic_id === epic.id);
                    const linkedTasks = tasks.filter((t) => t.epic_id === epic.id);
                    const completedTasks = linkedTasks.filter((t) => t.status === "done").length;
                    const progress =
                      linkedTasks.length > 0
                        ? Math.round((completedTasks / linkedTasks.length) * 100)
                        : linkedStories.length > 0
                        ? 45
                        : 20;

                    const priorityClass =
                      PRIORITY_BADGE[epic.priority || "p2"] || PRIORITY_BADGE.p2;

                    return (
                      <div
                        key={epic.id}
                        id={`epic-card-${epic.id}`}
                        onClick={() => onSelectEpic(epic)}
                        className="rounded-xl border border-border bg-panel p-3.5 shadow-2xs hover:border-info/30 hover:shadow-md transition-all cursor-pointer group space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span
                            className={`text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded border font-mono ${priorityClass}`}
                          >
                            {epic.priority || "p2"}
                          </span>

                          <span className="text-[10px] text-faint font-mono">
                            {epic.story_points || 0} pts
                          </span>
                        </div>

                        <h5 className="font-semibold text-xs text-ink group-hover:text-accent transition-colors line-clamp-2">
                          {epic.title}
                        </h5>

                        {epic.description && (
                          <p className="text-[11px] text-muted line-clamp-2 leading-relaxed">
                            {epic.description}
                          </p>
                        )}

                        {/* Progress Bar & Story Count */}
                        <div className="pt-1.5 border-t border-border-soft space-y-1">
                          <div className="flex items-center justify-between text-[10px] text-muted">
                            <span>{linkedStories.length} stories</span>
                            <span className="font-semibold text-ink">
                              {progress}%
                            </span>
                          </div>

                          <div className="w-full bg-panel-alt h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-panel-alt h-full rounded-full transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
