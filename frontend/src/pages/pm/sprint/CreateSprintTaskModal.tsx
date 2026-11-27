import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import type { PMTask } from "../../../lib/types/api";

interface CreateSprintTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateTask: (task: PMTask) => void;
  sprintId: string;
  sprintNumber: number;
  initiativeId?: string;
}

export const CreateSprintTaskModal: React.FC<CreateSprintTaskModalProps> = ({
  isOpen,
  onClose,
  onCreateTask,
  sprintId,
  sprintNumber,
  initiativeId,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"P0" | "P1" | "P2" | "P3">("P1");
  const [assignedAgent, setAssignedAgent] = useState("systems_agent");
  const [estimatedHours, setEstimatedHours] = useState(6);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newTask: PMTask = {
      id: `task-${Date.now().toString(36).slice(-4)}`,
      story_id: "story-core",
      epic_id: "epic-core",
      initiative_id: initiativeId || "init-current",
      title: title.trim(),
      description: description.trim() || undefined,
      status: "ready",
      priority,
      assigned_agent: assignedAgent,
      estimated_hours: estimatedHours,
      sprint_id: sprintId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    onCreateTask(newTask);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      id="create-sprint-task-dialog"
      className="fixed inset-0 z-50 bg-base/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        id="create-sprint-task-modal-content"
        className="w-full max-w-lg rounded-2xl bg-panel border border-border p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-border-soft">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-ink/[0.06] text-muted flex items-center justify-center">
              <Plus size={16} />
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink">
                ADD TASK TO SPRINT {sprintNumber}
              </h3>
              <p className="text-[11px] text-muted">
                Commit new work deliverable to current active cycle
              </p>
            </div>
          </div>
          <button
            id="close-create-task-modal-btn"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-faint hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label
              htmlFor="sprint-new-task-title"
              className="block text-xs text-muted mb-1.5"
            >
              Task Title
            </label>
            <input
              id="sprint-new-task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement WebSocket heartbeat & telemetry retry"
              required
              className="w-full h-9.5 px-3.5 rounded-xl bg-panel border border-border text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-border"
            />
          </div>

          <div>
            <label
              htmlFor="sprint-new-task-desc"
              className="block text-xs text-muted mb-1.5"
            >
              Description & Acceptance Criteria
            </label>
            <textarea
              id="sprint-new-task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Detail implementation requirements, security constraints, and validation criteria…"
              className="w-full p-3.5 rounded-xl bg-panel border border-border text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-border"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="sprint-new-task-priority"
                className="block text-xs text-muted mb-1.5"
              >
                Priority
              </label>
              <select
                id="sprint-new-task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full h-9.5 px-3 rounded-xl bg-panel border border-border text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-border cursor-pointer"
              >
                <option value="P0">P0 - Critical</option>
                <option value="P1">P1 - High</option>
                <option value="P2">P2 - Medium</option>
                <option value="P3">P3 - Low</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="sprint-new-task-agent"
                className="block text-xs text-muted mb-1.5"
              >
                Assignee Agent
              </label>
              <select
                id="sprint-new-task-agent"
                value={assignedAgent}
                onChange={(e) => setAssignedAgent(e.target.value)}
                className="w-full h-9.5 px-3 rounded-xl bg-panel border border-border text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-border cursor-pointer"
              >
                <option value="systems_agent">Systems Agent</option>
                <option value="backend_agent">Backend Agent</option>
                <option value="frontend_agent">Frontend Agent</option>
                <option value="qa_agent">QA Test Agent</option>
                <option value="security_agent">Security Agent</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="sprint-new-task-hours"
                className="block text-xs text-muted mb-1.5"
              >
                Estimated Hours
              </label>
              <input
                id="sprint-new-task-hours"
                type="number"
                min={1}
                max={40}
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(Number(e.target.value))}
                className="w-full h-9.5 px-3 rounded-xl bg-panel border border-border text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-border"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border-soft">
            <button
              id="cancel-create-task-btn"
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-pill border border-border bg-panel text-ink font-semibold hover:bg-ink/5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="submit-create-task-btn"
              type="submit"
              className="h-9 px-5 rounded-pill bg-ink hover:bg-ink/90 text-on-ink font-medium cursor-pointer"
            >
              Add Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
