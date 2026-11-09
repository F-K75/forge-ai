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
      className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
    >
      <div
        id="create-sprint-modal-content"
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <Zap size={16} className="fill-current" />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              PLAN NEW SPRINT CYCLE
            </h3>
          </div>
          <button
            id="close-create-sprint-modal-btn"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label
              htmlFor="new-sprint-name-input"
              className="block font-bold uppercase tracking-wider mb-1.5 text-slate-700 dark:text-slate-300"
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
              className="w-full h-9.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div>
            <label
              htmlFor="new-sprint-goal-input"
              className="block font-bold uppercase tracking-wider mb-1.5 text-slate-700 dark:text-slate-300"
            >
              Sprint Goal
            </label>
            <textarea
              id="new-sprint-goal-input"
              value={sprintGoal}
              onChange={(e) => setSprintGoal(e.target.value)}
              rows={3}
              placeholder="What is the high-level objective and release milestone for this sprint?"
              className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div>
              <label
                htmlFor="new-sprint-capacity-input"
                className="block font-bold uppercase tracking-wider mb-1.5 text-slate-700 dark:text-slate-300"
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
                className="w-full h-9.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
            </div>

            <div>
              <label
                htmlFor="new-sprint-duration-select"
                className="block font-bold uppercase tracking-wider mb-1.5 text-slate-700 dark:text-slate-300"
              >
                Duration (Days)
              </label>
              <select
                id="new-sprint-duration-select"
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full h-9.5 px-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 cursor-pointer"
              >
                <option value={7}>1 Week (7 days)</option>
                <option value={14}>2 Weeks (14 days)</option>
                <option value={21}>3 Weeks (21 days)</option>
                <option value={28}>4 Weeks (28 days)</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              id="cancel-create-sprint-btn"
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="submit-create-sprint-btn"
              type="submit"
              className="h-9 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold uppercase tracking-wider cursor-pointer shadow-sm"
            >
              Create Sprint
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
