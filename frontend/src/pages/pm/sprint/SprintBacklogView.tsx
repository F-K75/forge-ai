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
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { Button } from "../../../components/ui/Button";

export const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  backlog: {
    label: "Backlog",
    color: "text-muted",
    bg: "bg-panel-alt",
    border: "border-border",
  },
  ready: {
    label: "Ready",
    color: "text-accent",
    bg: "bg-info/10",
    border: "border-info/30",
  },
  in_progress: {
    label: "In Progress",
    color: "text-warn",
    bg: "bg-warn/10",
    border: "border-warn/30",
  },
  review: {
    label: "Review",
    color: "text-info",
    bg: "bg-info/10",
    border: "border-info/30",
  },
  testing: {
    label: "Testing",
    color: "text-info",
    bg: "bg-info/10",
    border: "border-info/30",
  },
  done: {
    label: "Done",
    color: "text-ok",
    bg: "bg-ok/10",
    border: "border-ok/30",
  },
  blocked: {
    label: "Blocked",
    color: "text-error",
    bg: "bg-error/10",
    border: "border-error/30",
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
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-panel p-3.5 rounded-2xl border border-border shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <Search
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
          />
          <input
            id="sprint-task-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks by title, ID, or agent…"
            className="w-full h-9 pl-9 pr-8 rounded-xl bg-panel border border-border text-xs text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-border"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-faint hover:text-muted cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {/* Status Filter */}
          <SegmentedControl
            label="Filter by status"
            value={statusFilter}
            onChange={setStatusFilter}
            className="shrink-0"
            options={["all", "in_progress", "done", "blocked"].map((st) => ({
              value: st,
              id: `filter-status-${st}`,
              label: st === "all" ? "All status" : STATUS_CONFIG[st]?.label || st,
            }))}
          />

          {/* Priority Filter */}
          <SegmentedControl
            label="Filter by priority"
            value={priorityFilter}
            onChange={setPriorityFilter}
            className="shrink-0"
            options={["all", "P0", "P1", "P2", "P3"].map((pr) => ({
              value: pr,
              id: `filter-priority-${pr}`,
              label: pr === "all" ? "All" : pr,
            }))}
          />

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-muted hover:text-ink hover:underline px-2 shrink-0 cursor-pointer"
            >
              Reset
            </button>
          )}

          {/* Quick Add Task */}
          <Button
            id="sprint-add-task-btn"
            variant="secondary"
            size="sm"
            onClick={onOpenCreateTaskModal}
            className="shrink-0"
          >
            <Plus size={14} />
            <span>Add Task</span>
          </Button>
        </div>
      </div>

      {/* Task List Table View */}
      {filteredTasks.length === 0 ? (
        <div
          id="sprint-empty-tasks"
          className="rounded-xl border border-border bg-panel p-10 text-center space-y-3"
        >
          <div className="w-12 h-12 rounded-2xl bg-panel-alt text-faint flex items-center justify-center mx-auto">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">
              No tasks match this filter
            </h3>
            <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
              {hasActiveFilters
                ? "Try clearing filters or search keywords to view all sprint tasks."
                : "This sprint does not have any tasks scheduled yet. Click 'Add Task' to assign items."}
            </p>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="h-8 px-4 rounded-pill border border-glass-border bg-glass text-ink text-xs font-medium hover:bg-ink/10 cursor-pointer"
            >
              Clear All Filters
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenCreateTaskModal}
              className="h-8 px-4 rounded-pill border border-glass-border bg-glass text-ink text-xs font-medium hover:bg-ink/10 cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus size={14} />
              <span>Add First Task</span>
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="border-b border-border bg-ink/10 text-muted">
                <tr>
                  <th className="p-3.5 font-normal text-xs">Task ID & Title</th>
                  <th className="p-3.5 font-normal text-xs w-24">Priority</th>
                  <th className="p-3.5 font-normal text-xs w-36">Status</th>
                  <th className="p-3.5 font-normal text-xs w-44">Assignee</th>
                  <th className="p-3.5 font-normal text-xs w-24 text-right">Points</th>
                  <th className="p-3.5 font-normal text-xs w-24 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft">
                {filteredTasks.map((task) => {
                  const points = task.estimated_hours ? Math.max(1, Math.round(task.estimated_hours / 2)) : 3;
                  const isDone = task.status === "done" || task.status === "completed";

                  return (
                    <tr
                      key={task.id}
                      id={`task-row-${task.id}`}
                      className="hover:bg-ink/10 transition-colors"
                    >
                      {/* Title & Description */}
                      <td className="p-3.5">
                        <div className="flex items-start gap-2.5">
                          <span className="text-[11px] font-mono text-faint shrink-0 mt-0.5">
                            {task.id}
                          </span>
                          <div>
                            <p
                              className={`font-semibold text-ink leading-snug ${
                                isDone ? "line-through text-faint" : ""
                              }`}
                            >
                              {task.title}
                            </p>
                            {task.description && (
                              <p className="text-[11px] text-muted line-clamp-1 mt-0.5">
                                {task.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="p-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 font-mono text-[11px] rounded-pill border ${
                            task.priority === "P0"
                              ? "bg-error/10 text-error border-error/30 "
                              : task.priority === "P1"
                              ? "bg-warn/10 text-warn border-warn/30 "
                              : "bg-panel-alt text-ink border-border "
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
                          className="px-2.5 py-1 text-xs font-medium rounded-xl border border-border bg-panel text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-border cursor-pointer shadow-2xs"
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
                        <div className="flex items-center gap-2 text-ink">
                          <div className="w-5 h-5 rounded-md bg-ink/[0.06] text-muted flex items-center justify-center shrink-0">
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
                      <td className="p-3.5 text-right font-semibold text-ink">
                        {points} pts
                      </td>

                      {/* Board Link */}
                      <td className="p-3.5 text-right">
                        {initiativeId && (
                          <Link
                            id={`task-board-link-${task.id}`}
                            to={`/initiatives/${initiativeId}/board`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink transition-colors"
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
