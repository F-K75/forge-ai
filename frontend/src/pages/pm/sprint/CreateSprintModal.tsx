import React, { useState } from "react";
import { Zap, X } from "lucide-react";
import type { PMSprint } from "../../../lib/types/api";

interface CreateSprintModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSprint: (sprint: PMSprint) => void;
  currentSprintCount: number;
  initiativeId?: string;
}

export const CreateSprintModal: React.FC<CreateSprintModalProps> = ({
  isOpen,
  onClose,
  onCreateSprint,
  currentSprintCount,
  initiativeId,
}) => {
  const [sprintName, setSprintName] = useState(`Sprint ${currentSprintCount + 1}: Feature Delivery`);
  const [sprintGoal, setSprintGoal] = useState("");
  const [capacity, setCapacity] = useState(40);
  const [durationDays, setDurationDays] = useState(14);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newSprintNumber = currentSprintCount + 1;
    const now = new Date();
    const endDate = new Date(now.getTime() + durationDays * 86400000);

    const newSprint: PMSprint = {
      id: `sprint-${Date.now().toString(36)}`,
      initiative_id: initiativeId || "init-current",
      sprint_number: newSprintNumber,
      name: sprintName.trim() || `Sprint ${newSprintNumber}`,
      goal: sprintGoal.trim() || "Execute key architectural deliverables and user commitments.",
      start_date: now.toISOString(),
      end_date: endDate.toISOString(),
      capacity: Number(capacity) || 40,
      velocity: Number(capacity) || 40,
      story_points_planned: 0,
      story_points_completed: 0,
      completion_probability: 0.92,
      status: "planning",
    };

    onCreateSprint(newSprint);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      id="create-sprint-dialog"
      className="fixed inset-0 z-50 bg-base/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        id="create-sprint-modal-content"
        className="w-full max-w-lg rounded-2xl bg-panel border border-border p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-border-soft">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-agent-integration/10 border border-agent-integration/30 text-agent-integration flex items-center justify-center">
              <Zap size={16} className="fill-current" />
            </div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-ink">
              PLAN NEW SPRINT CYCLE
            </h3>
          </div>
          <button
            id="close-create-sprint-modal-btn"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-faint hover:text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label
              htmlFor="new-sprint-name-input"
              className="block font-semibold uppercase tracking-wider mb-1.5 text-ink"
            >
              Sprint Name
            </label>
            <input
              id="new-sprint-name-input"
              type="text"
              value={sprintName}
              onChange={(e) => setSprintName(e.target.value)}
              placeholder={`Sprint ${currentSprintCount + 1}: Feature Delivery`}
              required
              className="w-full h-9.5 px-3.5 rounded-xl bg-panel border border-border text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-agent-integration/20 focus:border-agent-integration/30"
            />
          </div>

          <div>
            <label
              htmlFor="new-sprint-goal-input"
              className="block font-semibold uppercase tracking-wider mb-1.5 text-ink"
            >
              Sprint Goal
            </label>
            <textarea
              id="new-sprint-goal-input"
              value={sprintGoal}
              onChange={(e) => setSprintGoal(e.target.value)}
              rows={3}
              placeholder="What is the high-level objective and release milestone for this sprint?"
              className="w-full p-3.5 rounded-xl bg-panel border border-border text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-agent-integration/20 focus:border-agent-integration/30"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="new-sprint-capacity-input"
                className="block font-semibold uppercase tracking-wider mb-1.5 text-ink"
              >
                Capacity (Story Pts)
              </label>
              <input
                id="new-sprint-capacity-input"
                type="number"
                min={10}
                max={200}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className="w-full h-9.5 px-3.5 rounded-xl bg-panel border border-border text-ink focus:outline-none focus:ring-2 focus:ring-agent-integration/20 focus:border-agent-integration/30"
              />
            </div>

            <div>
              <label
                htmlFor="new-sprint-duration-select"
                className="block font-semibold uppercase tracking-wider mb-1.5 text-ink"
              >
                Duration (Days)
              </label>
              <select
                id="new-sprint-duration-select"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full h-9.5 px-3.5 rounded-xl bg-panel border border-border text-ink focus:outline-none focus:ring-2 focus:ring-agent-integration/20 focus:border-agent-integration/30 cursor-pointer"
              >
                <option value={7}>1 Week (7 days)</option>
                <option value={14}>2 Weeks (14 days)</option>
                <option value={21}>3 Weeks (21 days)</option>
                <option value={28}>4 Weeks (28 days)</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border-soft">
            <button
              id="cancel-create-sprint-btn"
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-border bg-panel text-ink font-semibold hover:bg-ink/5 cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="submit-create-sprint-btn"
              type="submit"
              className="h-9 px-5 rounded-xl bg-agent-integration hover:bg-agent-integration/90 text-on-ink font-semibold uppercase tracking-wider cursor-pointer shadow-sm"
            >
              Create Sprint
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
