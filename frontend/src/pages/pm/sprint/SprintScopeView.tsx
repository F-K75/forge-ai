import React from "react";
import { Check, Layers } from "lucide-react";
import type { PMSprint, PMStory, PMEpic, PMTask } from "../../../lib/types/api";
import { Badge } from "../../../components/ui/Badge";

interface SprintScopeViewProps {
  selectedSprint: PMSprint;
  stories: PMStory[];
  epics: PMEpic[];
  sprintTasks: PMTask[];
}

export const SprintScopeView: React.FC<SprintScopeViewProps> = ({
  selectedSprint,
  stories,
  epics,
  sprintTasks,
}) => {
  // Find all stories linked to tasks in this sprint
  const sprintStoryIds = new Set(sprintTasks.map((t) => t.story_id).filter(Boolean));
  const sprintStories = stories.filter((s) => sprintStoryIds.has(s.id));

  return (
    <div id="sprint-scope-view" className="space-y-4">
      <div className="rounded-xl border border-border bg-panel p-5 md:p-6 space-y-5">
        <div>
          <h3 className="text-sm font-medium text-ink">
            User Stories Committed to Sprint {selectedSprint.sprint_number}
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Epics and user stories scheduled for autonomous delivery and verification during this sprint cycle.
          </p>
        </div>

        {sprintStories.length === 0 ? (
          <div className="py-12 text-center text-faint text-xs rounded-xl bg-ink/[0.03] border border-border-soft">
            <Layers size={24} className="mx-auto mb-2 text-faint" />
            <p className="font-medium text-ink">
              No user stories directly mapped to this sprint
            </p>
            <p className="text-muted mt-1">
              Tasks in this sprint are executing against the core architectural roadmap.
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {sprintStories.map((story) => {
              const epic = epics.find((e) => e.id === story.epic_id);
              const storyTasks = sprintTasks.filter((t) => t.story_id === story.id);
              const doneTasks = storyTasks.filter((t) => t.status === "done" || t.status === "completed");

              return (
                <div
                  key={story.id}
                  id={`sprint-story-${story.id}`}
                  className="p-4 rounded-xl border border-border-soft bg-ink/[0.03] space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <Badge variant="info" size="sm">
                        {epic?.title || "Core Epic"}
                      </Badge>
                      <h4 className="font-medium text-sm text-ink">
                        {story.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted">
                      <span>
                        <span className="font-mono tabular-nums text-ink">{doneTasks.length} / {storyTasks.length}</span> tasks done
                      </span>
                    </div>
                  </div>

                  {story.description && (
                    <p className="text-xs text-muted leading-relaxed">
                      {story.description}
                    </p>
                  )}

                  {story.acceptance_criteria && story.acceptance_criteria.length > 0 && (
                    <div className="pt-2.5 border-t border-border">
                      <span className="text-xs text-muted block mb-1.5">
                        Acceptance criteria
                      </span>
                      <ul className="space-y-1.5 text-xs text-ink">
                        {story.acceptance_criteria.map((crit, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Check size={13} className="text-ok shrink-0 mt-0.5" />
                            <span>{crit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
