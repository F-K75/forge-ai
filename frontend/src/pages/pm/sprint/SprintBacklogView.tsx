import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Plus,
  ArrowRight,
  Bot,
  CheckCircle2,
  X,
} from "lucide-react";
import type { PMTask } from "../../../lib/types/api";

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  backlog: {
    label: "Backlog",
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800",
    border: "border-slate-200 dark:border-slate-700",
  },
  ready: {
    label: "Ready",
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-50 dark:bg-blue-950/40",
    border: "border-blue-200 dark:border-blue-900/50",
  },
  in_progress: {
    label: "In Progress",
    color: "text-amber-700 dark:text-amber-300",
    bg: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-200 dark:border-amber-900/50",
  },
  review: {
    label: "Review",
    color: "text-purple-700 dark:text-purple-300",
    bg: "bg-purple-50 dark:bg-purple-950/40",
    border: "border-purple-200 dark:border-purple-900/50",
  },
  testing: {
    label: "Testing",
    color: "text-teal-700 dark:text-teal-300",
    bg: "bg-teal-50 dark:bg-teal-950/40",
    border: "border-teal-200 dark:border-teal-900/50",
  },
  done: {
    label: "Done",
    color: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-200 dark:border-emerald-900/50",
  },
  blocked: {
    label: "Blocked",
    color: "text-red-700 dark:text-red-300",
    bg: "bg-red-50 dark:bg-red-950/40",
    border: "border-red-200 dark:border-red-900/50",
  },
};

interface SprintBacklogViewProps {
  tasks: PMTask[];
  onUpdateTaskStatus: (taskId: string, newStatus: string) => void;
  onOpenCreateTaskModal: () => void;
  initiativeId?: string;
}

export const SprintBacklogView: React.FC<SprintBacklogViewProps> = ({
  tasks,
  onUpdateTaskStatus,
  onOpenCreateTaskModal,
  initiativeId,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        task.title.toLowerCase().includes(q) ||
        (task.description && task.description.toLowerCase().includes(q)) ||
        (task.id && task.id.toLowerCase().includes(q)) ||
        (task.assigned_agent && task.assigned_agent.toLowerCase().includes(q));

      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tasks, searchQuery, statusFilter, priorityFilter]);

  const hasActiveFilters = searchQuery !== "" || statusFilter !== "all" || priorityFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
  };

  return (
    <div id="sprint-backlog-view" className="space-y-4">
      {/* Search and Filters Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-900/90 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            id="sprint-task-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks by title, ID, or agent…"
            className="w-full h-9 pl-9 pr-8 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {/* Status Filter */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 hidden sm:inline">
              Status:
            </span>
            {["all", "in_progress", "done", "blocked"].map((st) => (
              <button
                key={st}
                type="button"
                id={`filter-status-${st}`}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs rounded-xl font-medium transition-all cursor-pointer shrink-0 border ${
                  statusFilter === st
                    ? "bg-teal-600 text-white border-teal-700 shadow-2xs"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-500/50"
                }`}
              >
                {st === "all" ? "All Status" : STATUS_CONFIG[st]?.label || st}
              </button>
            ))}
          </div>

          {/* Priority Filter */}
          <div className="flex items-center gap-1 shrink-0 pl-1 border-l border-slate-200 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 hidden sm:inline">
              Priority:
            </span>
            {["all", "P0", "P1", "P2", "P3"].map((pr) => (
              <button
                key={pr}
                type="button"
                id={`filter-priority-${pr}`}
                onClick={() => setPriorityFilter(pr)}
                className={`px-2 py-1 text-xs rounded-xl font-medium transition-all cursor-pointer shrink-0 border ${
                  priorityFilter === pr
                    ? "bg-teal-600 text-white border-teal-700 shadow-2xs"
                    : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-teal-500/50"
                }`}
              >
                {pr === "all" ? "All" : pr}
              </button>
            ))}
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 hover:underline px-2 shrink-0 cursor-pointer"
            >
              Reset
            </button>
          )}

          {/* Quick Add Task */}
          <button
            id="sprint-add-task-btn"
            type="button"
            onClick={onOpenCreateTaskModal}
            className="h-9 px-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100 text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer"
          >
            <Plus size={14} />
            <span>Add Task</span>
          </button>
        </div>
      </div>

      {/* Task List Table View */}
      {filteredTasks.length === 0 ? (
        <div
          id="sprint-empty-tasks"
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-10 text-center shadow-xs space-y-3"
        >
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              No tasks match this filter
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              {hasActiveFilters
                ? "Try clearing filters or search keywords to view all sprint tasks."
                : "This sprint does not have any tasks scheduled yet. Click 'Add Task' to assign items."}
            </p>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="h-8.5 px-4 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 cursor-pointer shadow-2xs"
            >
              Clear All Filters
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenCreateTaskModal}
              className="h-8.5 px-4 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 cursor-pointer shadow-2xs inline-flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>Add First Task</span>
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="p-3.5 font-bold uppercase tracking-wider text-[11px]">Task ID & Title</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider text-[11px] w-24">Priority</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider text-[11px] w-36">Status</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider text-[11px] w-44">Assignee</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider text-[11px] w-24 text-right">Points</th>
                  <th className="p-3.5 font-bold uppercase tracking-wider text-[11px] w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredTasks.map((task) => {
                  const points = task.estimated_hours ? Math.max(1, Math.round(task.estimated_hours / 2)) : 3;
                  const isDone = task.status === "done" || task.status === "completed";

                  return (
                    <tr
                      key={task.id}
                      id={`task-row-${task.id}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      {/* Title & Description */}
                      <td className="p-3.5">
                        <div className="flex items-start gap-2.5">
                          <span className="text-[11px] font-mono font-semibold text-slate-400 shrink-0 mt-0.5">
                            {task.id}
                          </span>
                          <div>
                            <p
                              className={`font-semibold text-slate-900 dark:text-slate-100 leading-snug ${
                                isDone ? "line-through text-slate-400 dark:text-slate-500" : ""
                              }`}
                            >
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                                {task.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="p-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded-md border ${
                            task.priority === "P0"
                              ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50"
                              : task.priority === "P1"
                              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50"
                              : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                          }`}
                        >
                          {task.priority || "P2"}
                        </span>
                      </td>

                      {/* Interactive Status Dropdown */}
                      <td className="p-3.5">
                        <select
                          id={`task-status-select-${task.id}`}
                          aria-label={`Status for task ${task.id}`}
                          value={task.status || "backlog"}
                          onChange={(e) => onUpdateTaskStatus(task.id, e.target.value)}
                          className="px-2.5 py-1 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer shadow-2xs"
                        >
                          {Object.entries(STATUS_CONFIG).map(([stKey, stCfg]) => (
                            <option key={stKey} value={stKey}>
                              {stCfg.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Assignee */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                          <div className="w-5.5 h-5.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                            <Bot size={13} />
                          </div>
                          <span
                            className="truncate max-w-[130px] text-xs font-medium capitalize"
                            title={task.assigned_agent || "Agent"}
                          >
                            {(task.assigned_agent || "Systems Agent").replace(/_/g, " ")}
                          </span>
                        </div>
                      </td>

                      {/* Points */}
                      <td className="p-3.5 text-right font-bold text-slate-800 dark:text-slate-200">
                        {points} pts
                      </td>

                      {/* Board Link */}
                      <td className="p-3.5 text-right">
                        {initiativeId && (
                          <Link
                            id={`task-board-link-${task.id}`}
                            to={`/initiatives/${initiativeId}/board`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                          >
                            <span>Board</span>
                            <ArrowRight size={11} />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
