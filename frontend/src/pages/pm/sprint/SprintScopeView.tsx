import React from "react";
import { Check, Layers } from "lucide-react";
import type { PMSprint, PMStory, PMEpic, PMTask } from "../../../lib/types/api";

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
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-5 md:p-6 shadow-2xs space-y-5">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
            User Stories Committed to Sprint {selectedSprint.sprint_number}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Epics and user stories scheduled for autonomous delivery and verification during this sprint cycle.
          </p>
        </div>

        {sprintStories.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800/60">
            <Layers size={24} className="mx-auto mb-2 text-slate-400" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">
              No user stories directly mapped to this sprint
            </p>
            <p className="text-slate-500 mt-1">
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
                  className="p-4.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-3 shadow-2xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50">
                        {epic?.title || "Core Epic"}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                        {story.title}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-semibold text-teal-600 dark:text-teal-400">
                        {doneTasks.length} / {storyTasks.length} tasks done
                      </span>
                    </div>
                  </div>

                  {story.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
                      {story.description}
                    </p>
                  )}

                  {story.acceptance_criteria && story.acceptance_criteria.length > 0 && (
                    <div className="pt-2.5 border-t border-slate-200/60 dark:border-slate-800/60">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                        ACCEPTANCE CRITERIA:
                      </span>
                      <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                        {story.acceptance_criteria.map((crit, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Check size={13} className="text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
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
