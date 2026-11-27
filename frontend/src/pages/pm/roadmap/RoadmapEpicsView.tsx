import React, { useState } from "react";
import {
  Layers,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CheckCircle2,
  Clock,
  Sparkles,
  ExternalLink,
  ListTodo,
} from "lucide-react";
import type { PMEpic, PMStory, PMTask } from "../../../lib/types/api";

interface RoadmapEpicsViewProps {
  epics: PMEpic[];
  stories: PMStory[];
  tasks: PMTask[];
  onSelectEpic: (epic: PMEpic) => void;
}

const PRIORITY_BADGE: Record<string, string> = {
  p0: "bg-error/10 text-error border-error/30",
  p1: "bg-warn/10 text-warn border-warn/30",
  p2: "bg-info/10 text-info border-info/30",
};

export function RoadmapEpicsView({
  epics,
  stories,
  tasks,
  onSelectEpic,
}: RoadmapEpicsViewProps) {
  const [expandedEpics, setExpandedEpics] = useState<Record<string, boolean>>({});

  const toggleExpand = (epicId: string) => {
    setExpandedEpics((prev) => ({ ...prev, [epicId]: !prev[epicId] }));
  };

  const sortedEpics = React.useMemo(() => {
    return [...epics].sort((a, b) => (a.priority || "").localeCompare(b.priority || ""));
  }, [epics]);

  return (
    <div id="roadmap-epics-root" className="space-y-4">
      {/* Header Info */}
      <div className="rounded-2xl border border-border bg-panel p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-base text-ink flex items-center gap-2">
            <Layers size={18} className="text-accent" />
            <span>Epic Decomposition & Scope Matrix</span>
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Full hierarchy of prioritized epics, child user stories, acceptance criteria, and task execution status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-panel-alt text-ink font-mono">
            {epics.length} Epics Total
          </span>
        </div>
      </div>

      {/* Epics List Accordion */}
      <div className="space-y-3">
        {sortedEpics.length === 0 ? (
          <div className="p-12 text-center text-faint text-xs rounded-2xl border border-dashed border-border">
            No epics found matching current filters.
          </div>
        ) : (
          sortedEpics.map((epic) => {
            const isExpanded = !!expandedEpics[epic.id];
            const linkedStories = stories.filter((s) => s.epic_id === epic.id);
            const linkedTasks = tasks.filter((t) => t.epic_id === epic.id);
            const completedTasks = linkedTasks.filter((t) => t.status === "done").length;
            const progress =
              linkedTasks.length > 0
                ? Math.round((completedTasks / linkedTasks.length) * 100)
                : linkedStories.length > 0
                ? 40
                : 20;

            const priorityBadge =
              PRIORITY_BADGE[epic.priority || "p2"] || PRIORITY_BADGE.p2;

            return (
              <div
                key={epic.id}
                id={`epic-row-${epic.id}`}
                className="rounded-2xl border border-border bg-panel shadow-sm overflow-hidden transition-all hover:border-border"
              >
                {/* Epic Header Row */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <span
                      className={`text-[10px] font-semibold font-mono uppercase px-2 py-0.5 rounded border shrink-0 ${priorityBadge}`}
                    >
                      {epic.priority || "p2"}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onSelectEpic(epic)}
                          className="font-semibold text-sm sm:text-base text-ink hover:text-accent text-left transition-colors cursor-pointer"
                        >
                          {epic.title}
                        </button>

                        <span className="text-[11px] text-faint font-mono">
                          {epic.estimated_duration || "Cadence: Q1"}
                        </span>
                      </div>

                      {epic.description && (
                        <p className="text-xs text-muted mt-0.5 line-clamp-1">
                          {epic.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right side metrics and controls */}
                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto text-xs">
                    <div className="text-right">
                      <span className="font-semibold text-ink">
                        {epic.story_points || 0} pts
                      </span>
                      <p className="text-[10px] text-faint">
                        {linkedStories.length} stories · {progress}% done
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 border-l border-border-soft pl-3">
                      <button
                        type="button"
                        onClick={() => onSelectEpic(epic)}
                        className="p-1.5 text-faint hover:text-accent rounded-lg hover:bg-ink/5 transition-colors cursor-pointer"
                        title="View Epic Details"
                      >
                        <ExternalLink size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpand(epic.id)}
                        className="p-1.5 text-faint hover:text-ink rounded-lg hover:bg-ink/5 transition-colors cursor-pointer"
                        title={isExpanded ? "Collapse stories" : "Expand stories"}
                      >
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Stories Drawer */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-1 border-t border-border-soft bg-ink/10 space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted pt-2 font-semibold uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <ListTodo size={13} className="text-accent" />
                        Decomposed User Stories ({linkedStories.length})
                      </span>
                    </div>

                    {linkedStories.length === 0 ? (
                      <p className="text-xs text-faint italic">No user stories linked to this epic yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {linkedStories.map((story) => (
                          <div
                            key={story.id}
                            className="p-3 rounded-xl border border-border bg-panel text-xs space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium text-ink flex-1">
                                {story.title}
                              </span>
                              <span className="text-[10px] font-mono text-faint">
                                {story.story_points || 3} pts
                              </span>
                            </div>

                            {story.acceptance_criteria && story.acceptance_criteria.length > 0 && (
                              <div className="pt-1 border-t border-border-soft">
                                <span className="text-[10px] font-semibold text-faint uppercase tracking-wider">
                                  Acceptance Criteria:
                                </span>
                                <ul className="space-y-0.5 mt-1">
                                  {story.acceptance_criteria.map((ac, acIdx) => (
                                    <li
                                      key={acIdx}
                                      className="text-[11px] text-muted flex items-start gap-1.5"
                                    >
                                      <CheckCircle2
                                        size={12}
                                        className="text-ok shrink-0 mt-0.5"
                                      />
                                      <span>{ac}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
