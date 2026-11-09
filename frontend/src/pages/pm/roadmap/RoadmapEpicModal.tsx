import React, { useState } from "react";
import {
  X,
  Layers,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  ArrowRight,
  ListTodo,
  FileCode,
} from "lucide-react";
import toast from "react-hot-toast";
import type { PMEpic, PMStory, PMTask } from "../../../lib/types/api";

interface RoadmapEpicModalProps {
  isOpen: boolean;
  onClose: () => void;
  epic: PMEpic | null;
  stories: PMStory[];
  tasks: PMTask[];
}

export function RoadmapEpicModal({
  isOpen,
  onClose,
  epic,
  stories,
  tasks,
}: RoadmapEpicModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !epic) return null;

  const linkedStories = stories.filter((s) => s.epic_id === epic.id);
  const linkedTasks = tasks.filter((t) => t.epic_id === epic.id);
  const totalHours = linkedTasks.reduce((acc, t) => acc + (t.estimated_hours || 0), 0);

  const handleCopy = () => {
    const summary = `Epic: ${epic.title} (${epic.priority || "p2"})\nStory Points: ${
      epic.story_points || 0
    }\nDuration: ${epic.estimated_duration || "Q1"}\nStories: ${
      linkedStories.length
    }\nTasks: ${linkedTasks.length} (~${totalHours}h)`;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    toast.success("Epic summary copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 items-center justify-center font-bold text-xs">
              <Layers size={16} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {epic.title}
                </h3>
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {epic.priority || "p2"}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono">
                {epic.estimated_duration || "Target: Q1"} · {epic.story_points || 0} story points
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 text-xs">
          {epic.description && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Scope Description
              </span>
              <p className="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-100 dark:border-slate-800 leading-relaxed">
                {epic.description}
              </p>
            </div>
          )}

          {/* User Stories */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ListTodo size={12} className="text-blue-500" />
              Linked User Stories ({linkedStories.length})
            </span>

            {linkedStories.length === 0 ? (
              <p className="text-slate-400 italic">No stories linked yet.</p>
            ) : (
              <div className="space-y-2">
                {linkedStories.map((story) => (
                  <div
                    key={story.id}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {story.title}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {story.story_points || 3} pts
                      </span>
                    </div>

                    {story.acceptance_criteria && story.acceptance_criteria.length > 0 && (
                      <ul className="space-y-0.5 pt-1">
                        {story.acceptance_criteria.map((ac, i) => (
                          <li
                            key={i}
                            className="text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-1.5"
                          >
                            <CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />
                            <span>{ac}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tasks Summary */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <FileCode size={12} className="text-purple-500" />
                Engineering Tasks ({linkedTasks.length})
              </span>
              <span className="font-mono text-slate-400 text-[10px]">~{totalHours}h estimated</span>
            </div>

            {linkedTasks.length === 0 ? (
              <p className="text-slate-400 italic">No engineering tasks attached yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {linkedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/20 flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate mr-2">
                      {task.title}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400 shrink-0">
                      {task.estimated_hours}h
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between text-xs text-slate-500">
          <span>Priority SLA: {epic.priority === "p0" ? "Critical Path" : "Standard"}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
