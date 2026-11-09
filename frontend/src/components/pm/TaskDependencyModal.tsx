import React, { useState, useEffect } from "react";
import {
  X,
  Link2,
  Unlink,
  AlertTriangle,
  CheckCircle2,
  GitFork,
  ArrowRight,
  ShieldAlert,
  Plus,
  Search,
} from "lucide-react";
import type { PMTask } from "../../lib/types/api";
import { normalizePriority, PRIORITY_CONFIG } from "../../pages/pm/KanbanTab";

export interface TaskDependencyModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: PMTask | null;
  allTasks: PMTask[];
  onAddDependency: (taskId: string, dependsOnId: string) => void;
  onRemoveDependency: (taskId: string, dependsOnId: string) => void;
  onSelectTask?: (taskId: string) => void;
}

export const TaskDependencyModal: React.FC<TaskDependencyModalProps> = ({
  isOpen,
  onClose,
  task,
  allTasks,
  onAddDependency,
  onRemoveDependency,
  onSelectTask,
}) => {
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState<string>("");

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !task) return null;

  const tasksById = new Map(allTasks.map((t) => [t.id, t]));
  const currentDepIds = task.dependencies || [];

  // Prerequisite tasks this task depends on
  const dependencies = currentDepIds
    .map((id) => tasksById.get(id))
    .filter(Boolean) as PMTask[];

  const activeBlockers = dependencies.filter((d) => d.status !== "done");

  // Downstream tasks that depend on this task
  const downstreamTasks = allTasks.filter((t) =>
    (t.dependencies || []).includes(task.id)
  );

  // Detect which tasks could cause circular dependencies
  const getReachableFrom = (startId: string): Set<string> => {
    const visited = new Set<string>();
    const queue = [startId];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);
      const currTask = tasksById.get(curr);
      if (currTask?.dependencies) {
        for (const dep of currTask.dependencies) {
          if (!visited.has(dep)) queue.push(dep);
        }
      }
    }
    return visited;
  };

  // If candidate depends on `task.id`, then making `task.id` depend on candidate creates a cycle
  const wouldCauseCycle = (candidateId: string): boolean => {
    const reachableFromCandidate = getReachableFrom(candidateId);
    return reachableFromCandidate.has(task.id);
  };

  // Filter candidates for new dependencies
  const availableCandidates = allTasks.filter((t) => {
    if (t.id === task.id) return false;
    if (currentDepIds.includes(t.id)) return false;
    if (wouldCauseCycle(t.id)) return false;
    if (!searchFilter.trim()) return true;

    const q = searchFilter.toLowerCase();
    const titleMatch = (t.title || "").toLowerCase().includes(q);
    const idMatch = t.id.toLowerCase().includes(q);
    const agentMatch = (t.assigned_agent || "").toLowerCase().includes(q);
    return titleMatch || idMatch || agentMatch;
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidateId) return;
    onAddDependency(task.id, selectedCandidateId);
    setSelectedCandidateId("");
  };

  const normP = normalizePriority(task.priority);
  const pCfg = normP ? PRIORITY_CONFIG[normP] : null;

  return (
    <div
      id="kanban-dependency-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="kanban-dependency-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dependency-modal-title"
        className="w-full max-w-2xl glass-card rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-white/80 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 glass-header flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-500/20 shrink-0 shadow-xs">
              <GitFork className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="truncate">
              <h2
                id="dependency-modal-title"
                className="text-sm font-bold text-slate-900 dark:text-white tracking-tight"
              >
                Task Dependencies & Blockers
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                #{task.id.replace(/^task-/, "")}: {task.title}
              </p>
            </div>
          </div>
          <button
            id="dependency-modal-close-btn"
            type="button"
            onClick={onClose}
            aria-label="Close dependency modal"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Task Status Overview Bar */}
        <div className="px-6 py-3 bg-slate-50/70 dark:bg-slate-900/60 border-b border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between gap-3 text-xs shrink-0 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status:</span>
            <span
              className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${
                task.status === "done"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800"
                  : task.status === "blocked"
                  ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800"
                  : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800"
              }`}
            >
              {task.status?.replace("_", " ") || "BACKLOG"}
            </span>

            {pCfg && (
              <span
                className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${pCfg.bg} ${pCfg.text} ${pCfg.border}`}
              >
                {pCfg.badgeText}
              </span>
            )}
            {task.assigned_agent && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Assignee: <strong className="text-slate-700 dark:text-slate-200 uppercase font-semibold">{task.assigned_agent.replace("_agent", "")}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {activeBlockers.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 px-2.5 py-0.5 rounded-full border border-red-200 dark:border-red-800/80">
                <AlertTriangle className="w-3.5 h-3.5 stroke-[2.2]" />
                Blocked by {activeBlockers.length} {activeBlockers.length === 1 ? "task" : "tasks"}
              </span>
            ) : dependencies.length > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/80">
                <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.2]" />
                All {dependencies.length} Prerequisites Done
              </span>
            ) : (
              <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                No prerequisites
              </span>
            )}
          </div>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          {/* Section 1: Prerequisites / Blockers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Prerequisites & Blockers ({dependencies.length})
                </h3>
              </div>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                Must finish before this task can start
              </span>
            </div>

            {dependencies.length === 0 ? (
              <div className="p-5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-center text-slate-500 dark:text-slate-400">
                <p className="font-semibold text-xs">No blockers linked to this task.</p>
                <p className="text-[11px] mt-1 text-slate-400 dark:text-slate-500">
                  Link an existing task below if this work item is blocked by another deliverable.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {dependencies.map((dep) => {
                  const isDone = dep.status === "done";
                  const depNormP = normalizePriority(dep.priority);
                  const depCfg = depNormP ? PRIORITY_CONFIG[depNormP] : null;

                  return (
                    <div
                      key={dep.id}
                      id={`dependency-row-${dep.id}`}
                      className={`p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                        isDone
                          ? "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20"
                          : "border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 shadow-xs"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
                              isDone
                                ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300"
                                : "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/80 text-red-700 dark:text-red-300"
                            }`}
                          >
                            {isDone ? (
                              <>
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                <span>Resolved</span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>Active Blocker</span>
                              </>
                            )}
                          </span>

                          <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                            #{dep.id.replace(/^task-/, "")}
                          </span>

                          <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {dep.status?.replace("_", " ")}
                          </span>

                          {depCfg && (
                            <span
                              className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full border ${depCfg.bg} ${depCfg.text} ${depCfg.border}`}
                            >
                              {depCfg.label}
                            </span>
                          )}

                          {dep.assigned_agent && (
                            <span className="text-xs text-slate-400">
                              @{dep.assigned_agent.replace("_agent", "")}
                            </span>
                          )}
                        </div>

                        <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate leading-tight">
                          {dep.title}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {onSelectTask && (
                          <button
                            type="button"
                            onClick={() => onSelectTask(dep.id)}
                            title="View task on board"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          id={`unlink-dep-${dep.id}`}
                          onClick={() => onRemoveDependency(task.id, dep.id)}
                          title="Remove this dependency link"
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
                        >
                          <Unlink className="w-3 h-3" />
                          <span>Unlink</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 2: Add New Dependency */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 shadow-xs">
            <div className="flex items-center gap-2 mb-1.5">
              <Plus className="w-4 h-4 text-teal-600 dark:text-teal-400 stroke-[2.5]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                Link New Dependency / Blocker
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Select another task that must be finished before this task can be worked on.
            </p>

            <form onSubmit={handleAdd} className="space-y-3">
              {allTasks.length > 4 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    id="dependency-candidate-filter-input"
                    type="text"
                    aria-label="Filter candidate tasks"
                    placeholder="Filter candidate tasks by title or #id..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="w-full h-8 pl-8.5 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 min-w-0">
                  <select
                    id="candidate-dependency-select"
                    aria-label="Select candidate task to link as dependency"
                    value={selectedCandidateId}
                    onChange={(e) => setSelectedCandidateId(e.target.value)}
                    className="w-full h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
                  >
                    <option value="">-- Choose a task to link as blocker --</option>
                    {availableCandidates.map((cand) => (
                      <option key={cand.id} value={cand.id}>
                        #{cand.id.replace(/^task-/, "")} [{cand.status?.toUpperCase()}] {cand.title.slice(0, 65)}
                        {cand.assigned_agent ? ` (@${cand.assigned_agent.replace("_agent", "")})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  id="add-dependency-btn"
                  type="submit"
                  disabled={!selectedCandidateId}
                  className="h-9 px-4 rounded-lg glass-button-primary text-xs font-semibold uppercase disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-all"
                >
                  <Link2 className="w-3.5 h-3.5 stroke-[2.2]" />
                  <span>Link as Blocker</span>
                </button>
              </div>

              {availableCandidates.length === 0 && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
                  {searchFilter.trim()
                    ? "No candidate tasks match the filter criteria."
                    : "All available tasks are already linked or would create circular dependencies."}
                </p>
              )}
            </form>
          </div>

          {/* Section 3: Downstream Dependent Tasks */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <GitFork className="w-4 h-4 text-amber-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                Downstream Dependent Tasks ({downstreamTasks.length})
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              Tasks waiting for this task to be completed.
            </p>

            {downstreamTasks.length === 0 ? (
              <div className="p-3.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 text-xs">
                No downstream tasks depend on this task.
              </div>
            ) : (
              <div className="space-y-2">
                {downstreamTasks.map((down) => (
                  <div
                    key={down.id}
                    id={`downstream-task-${down.id}`}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-800/70 flex items-center justify-between gap-2"
                  >
                    <div className="truncate flex items-center gap-2 min-w-0">
                      <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                        #{down.id.replace(/^task-/, "")}
                      </span>
                      <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {down.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-medium uppercase px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {down.status?.replace("_", " ")}
                      </span>
                      {down.assigned_agent && (
                        <span className="text-[11px] text-slate-400">
                          @{down.assigned_agent.replace("_agent", "")}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 glass-header flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Changes are saved immediately and update blocker indicators.
          </span>
          <button
            id="dependency-modal-done-btn"
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl glass-button-primary text-xs font-semibold uppercase shadow-sm cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
