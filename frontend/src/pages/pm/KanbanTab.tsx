import React, { useMemo, useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  Play,
  Loader2,
  GitBranch,
  Search,
  Filter,
  X,
  User,
  AlertCircle,
  RotateCcw,
  Link2,
  GitFork,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Plus,
  Sparkles,
  ChevronRight,
  Zap,
  Network,
  Package,
  Kanban,
} from "lucide-react";
import type { PMTask } from "../../lib/types/api";
import { usePMStore } from "../../store/pmStore";
import { tasksApi } from "../../lib/pmApi";
import { LIVE_MODE } from "../../lib/env";
import { executeTaskWithGemini } from "../../lib/geminiPM";
import { motion, motionVariants } from "../../lib/animations";
import { TaskDependencyModal } from "../../components/pm/TaskDependencyModal";
import { DependencyArrowsOverlay } from "../../components/pm/DependencyArrowsOverlay";
import { Tabs } from "../../components/ui/Tabs";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import SprintsTab from "./SprintsTab";
import GraphTab from "./GraphTab";
import ReleasesTab from "./ReleasesTab";
import { COLORS } from "../../lib/theme";

// Google Agile PM / Engineering Kanban color palette
export const COLUMNS: {
  id: string;
  label: string;
  color: string;
  dotColor: string;
  accentBg: string;
  accentText: string;
}[] = [
  {
    id: "backlog",
    label: "Backlog",
    color: COLORS.faint,
    dotColor: COLORS.faint,
    accentBg: "bg-panel-alt",
    accentText: "text-ink",
  },
  {
    id: "ready",
    label: "Ready",
    color: COLORS.info,
    dotColor: COLORS.info,
    accentBg: "bg-info/10",
    accentText: "text-accent",
  },
  {
    id: "in_progress",
    label: "In Progress",
    color: COLORS.warn,
    dotColor: COLORS.warn,
    accentBg: "bg-warn/10",
    accentText: "text-warn",
  },
  {
    id: "code_review",
    label: "Code Review",
    color: COLORS.agentBusinessImprover,
    dotColor: COLORS.agentBusinessImprover,
    accentBg: "bg-agent-business-improver/10",
    accentText: "text-agent-business-improver",
  },
  {
    id: "testing",
    label: "Testing",
    color: COLORS.accent,
    dotColor: COLORS.accent,
    accentBg: "bg-accent/10",
    accentText: "text-accent",
  },
  {
    id: "blocked",
    label: "Blocked",
    color: COLORS.error,
    dotColor: COLORS.error,
    accentBg: "bg-error/10",
    accentText: "text-error",
  },
  {
    id: "done",
    label: "Done",
    color: COLORS.ok,
    dotColor: COLORS.ok,
    accentBg: "bg-ok/10",
    accentText: "text-ok",
  },
  {
    id: "support",
    label: "Support",
    color: COLORS.agentIntegration,
    dotColor: COLORS.agentIntegration,
    accentBg: "bg-ink/[0.06]",
    accentText: "text-muted",
  },
];

export const COLUMN_PRESETS = [
  { id: "all", label: "All columns (8)", desc: "Show complete 8-phase sprint board" },
  { id: "active", label: "Active sprint (4)", desc: "Ready, In Progress, Code Review, Testing" },
  { id: "core", label: "Core flow (4)", desc: "Backlog, Ready, In Progress, Done" },
  { id: "qa", label: "QA & blocked (4)", desc: "Code Review, Testing, Blocked, Done" },
] as const;

export const normalizePriority = (priority?: string): "p0" | "p1" | "p2" | "p3" | "" => {
  if (!priority) return "";
  const p = priority.toLowerCase().trim();
  if (p === "p0" || p === "critical" || p === "urgent") return "p0";
  if (p === "p1" || p === "high") return "p1";
  if (p === "p2" || p === "medium" || p === "med") return "p2";
  if (p === "p3" || p === "low") return "p3";
  return "";
};

export const PRIORITY_CONFIG: Record<
  "p0" | "p1" | "p2" | "p3",
  {
    label: string;
    badgeText: string;
    bg: string;
    text: string;
    border: string;
    dotBg: string;
    desc: string;
  }
> = {
  p0: {
    label: "P0",
    badgeText: "P0 CRITICAL",
    bg: "bg-error/10",
    text: "text-error",
    border: "border-error/30",
    dotBg: "bg-error",
    desc: "Critical",
  },
  p1: {
    label: "P1",
    badgeText: "P1 HIGH",
    bg: "bg-warn/10",
    text: "text-warn",
    border: "border-warn/30",
    dotBg: "bg-warn",
    desc: "High",
  },
  p2: {
    label: "P2",
    badgeText: "P2 MEDIUM",
    bg: "bg-info/10",
    text: "text-accent",
    border: "border-info/30",
    dotBg: "bg-panel-alt",
    desc: "Medium",
  },
  p3: {
    label: "P3",
    badgeText: "P3 LOW",
    bg: "bg-panel-alt",
    text: "text-ink",
    border: "border-border",
    dotBg: "bg-ink/30",
    desc: "Low",
  },
};

/**
 * Highlights matching search terms within a given string for instant visual feedback.
 */
function highlightMatch(text: string, query: string) {
  if (!query.trim() || !text) return text;
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (terms.length === 0) return text;

  const regex = new RegExp(`(${terms.join("|")})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark
        key={i}
        className="bg-warn/10 text-warn px-0.5 rounded font-semibold"
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/**
 * Helper to generate a consistent avatar badge for assignees
 */
function getAgentAvatar(agent?: string) {
  if (!agent) {
    return {
      initials: "?",
      bg: "bg-panel-alt text-muted border border-dashed border-border",
    };
  }
  const clean = agent.replace(/_agent$/i, "").toLowerCase();
  switch (clean) {
    case "backend":
      return {
        initials: "BE",
        bg: "bg-agent-business-improver/10 text-agent-business-improver border border-agent-business-improver/30",
      };
    case "frontend":
      return {
        initials: "FE",
        bg: "bg-info/10 text-info border border-info/30",
      };
    case "qa":
      return {
        initials: "QA",
        bg: "bg-ok/10 text-ok border border-ok/30",
      };
    case "systems":
    case "infra":
      return {
        initials: "SY",
        bg: "bg-agent-business-improver/10 text-agent-business-improver border border-agent-business-improver/30",
      };
    case "pm":
    case "product":
      return {
        initials: "PM",
        bg: "bg-warn/10 text-warn border border-warn/30",
      };
    default:
      return {
        initials: clean.slice(0, 2).toUpperCase(),
        bg: "bg-info/10 text-info border border-info/30",
      };
  }
}

/**
 * TaskCard Component
 */
function TaskCard({
  task,
  index,
  searchQuery,
  allTasks = [],
  onFilterByPriority,
  onFilterByAssignee,
  onOpenDependencyModal,
  onHoverTask,
  onSelectTaskDetail,
  hoveredTaskId,
}: {
  task: Record<string, any>;
  index: number;
  searchQuery: string;
  allTasks?: PMTask[];
  onFilterByPriority: (priority: string) => void;
  onFilterByAssignee: (assignee: string) => void;
  onOpenDependencyModal?: (task: PMTask) => void;
  onHoverTask?: (taskId: string | null) => void;
  onSelectTaskDetail?: (task: PMTask) => void;
  hoveredTaskId?: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const [running, setRunning] = useState(false);
  const { initiative, setTaskLocal, addExecutionLocal } = usePMStore();

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 999 : undefined,
        position: isDragging ? ("relative" as const) : undefined,
      }
    : undefined;

  const normP = normalizePriority(task.priority);
  const priorityCfg = normP ? PRIORITY_CONFIG[normP] : null;

  // Compute dependency and blocker relationships
  const tasksById = useMemo(() => new Map(allTasks.map((t) => [t.id, t])), [allTasks]);
  const currentDepIds = useMemo(() => (task.dependencies || []) as string[], [task.dependencies]);
  const dependencies = useMemo(() => {
    return currentDepIds.map((id: string) => tasksById.get(id)).filter(Boolean) as PMTask[];
  }, [currentDepIds, tasksById]);
  const activeBlockers = useMemo(
    () => dependencies.filter((d) => d.status !== "done"),
    [dependencies]
  );
  const isBlocked = activeBlockers.length > 0;
  const downstreamTasks = useMemo(
    () => allTasks.filter((t) => (t.dependencies || []).includes(task.id)),
    [allTasks, task.id]
  );

  const isCardHovered = hoveredTaskId === task.id;
  const isRelatedToHovered =
    Boolean(hoveredTaskId) &&
    (currentDepIds.includes(hoveredTaskId!) || downstreamTasks.some((d) => d.id === hoveredTaskId));

  const avatar = getAgentAvatar(task.assigned_agent);

  const handleExecute = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRunning(true);
    try {
      if (LIVE_MODE) {
        await tasksApi.execute(task.id);
        setTaskLocal(task.id, { status: "in_progress" });
        toast.success(`${task.assigned_agent || "Agent"} is executing task`);
      } else {
        const agentName = task.assigned_agent || "engineer_agent";
        toast.loading(`Agent ${agentName} executing task with Gemini...`, { id: task.id });
        const res = await executeTaskWithGemini(task as any, initiative?.tech_stack || []);
        setTaskLocal(task.id, { status: "done" });
        addExecutionLocal({
          id: `exec-${Date.now()}`,
          initiative_id: task.initiative_id || initiative?.id || "",
          task_id: task.id,
          agent_type: agentName,
          agent: agentName,
          status: "completed",
          current_thought: res.thought,
          progress: 100,
          tokens_used: res.tokens_used,
          cost_usd: res.cost_usd,
          duration_seconds: res.duration_seconds,
          logs: res.logs,
          started_at: new Date(Date.now() - 5000).toISOString(),
          completed_at: new Date().toISOString(),
        });
        toast.dismiss(task.id);
        toast.success(`${agentName} completed task with Gemini 2.5 Flash!`);
      }
    } catch (err: any) {
      toast.dismiss(task.id);
      toast.error(err?.message || "Couldn't execute with agent.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <motion.div
      ref={setNodeRef}
      id={`kanban-task-card-${task.id}`}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onSelectTaskDetail?.(task as PMTask)}
      onMouseEnter={() => onHoverTask?.(task.id)}
      onMouseLeave={() => onHoverTask?.(null)}
      variants={motionVariants.staggerItem}
      custom={index}
      className={`group relative rounded-2xl bg-panel p-4 transition-all duration-200 ease-in-out select-none cursor-grab active:cursor-grabbing w-full min-h-[165px] flex flex-col justify-between border border-border shadow-xs hover:shadow-md hover:-translate-y-0.5 ${
        isDragging
          ? "opacity-90 shadow-2xl ring-2 ring-info/40 scale-[1.02] pointer-events-none z-50"
          : ""
      } ${
        isBlocked
          ? "border-l-[4px] border-l-error/30"
          : dependencies.length > 0
          ? "border-l-[4px] border-l-ok/30"
          : ""
      } ${
        isCardHovered
          ? "ring-2 ring-info/40"
          : isRelatedToHovered
          ? "ring-2 ring-warn/40"
          : ""
      }`}
    >
      {/* Card Top: Badges and ID */}
      <div className="flex items-center justify-between gap-1.5 mb-2.5">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {/* Priority Pill */}
          {priorityCfg && (
            <button
              type="button"
              id={`kanban-priority-badge-${task.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onFilterByPriority(normP);
              }}
              title={`Priority: ${priorityCfg.badgeText} (Click to filter)`}
              className={`inline-flex items-center gap-1.5 font-mono text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${priorityCfg.bg} ${priorityCfg.text} ${priorityCfg.border}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dotBg}`} />
              <span>{priorityCfg.label}</span>
            </button>
          )}

          {/* Active Blocker Warning Badge */}
          {isBlocked && (
            <button
              type="button"
              id={`kanban-blocker-badge-${task.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDependencyModal?.(task as PMTask);
              }}
              title={`BLOCKED by ${activeBlockers.length} incomplete prerequisite task(s)`}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-error/20 bg-error/10 text-error hover:bg-error/20 transition-colors cursor-pointer"
            >
              <AlertTriangle className="w-2.5 h-2.5 text-error shrink-0 stroke-[2.5]" />
              <span>Blocked ({activeBlockers.length})</span>
            </button>
          )}

          {/* Unblocked Badge */}
          {!isBlocked && dependencies.length > 0 && (
            <button
              type="button"
              id={`kanban-unblocked-badge-${task.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDependencyModal?.(task as PMTask);
              }}
              title={`All ${dependencies.length} prerequisite dependencies are completed! Task is unblocked.`}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-ok/20 bg-ok/10 text-ok hover:bg-ok/20 transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-ok shrink-0 stroke-[2.5]" />
              <span>Unblocked</span>
            </button>
          )}

          {/* Blocks Downstream Badge */}
          {downstreamTasks.length > 0 && (
            <button
              type="button"
              id={`kanban-blocks-badge-${task.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onOpenDependencyModal?.(task as PMTask);
              }}
              title={`Blocks ${downstreamTasks.length} downstream task(s)`}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-warn/20 bg-warn/10 text-warn hover:bg-warn/20 transition-colors cursor-pointer"
            >
              <GitFork className="w-2.5 h-2.5 text-warn shrink-0 stroke-[2.5]" />
              <span>Blocks {downstreamTasks.length}</span>
            </button>
          )}

          {/* Category Chip */}
          {task.category && (
            <span className="text-[11px] text-muted bg-ink/[0.06] px-2 py-0.5 rounded-full">
              {task.category}
            </span>
          )}
        </div>

        {/* Task ID */}
        {task.id && (
          <span className="text-[11px] font-mono text-faint shrink-0 ml-1">
            #{String(task.id).replace(/^task-/, "")}
          </span>
        )}
      </div>

      {/* Task Title */}
      <p
        aria-label={task.title}
        className="text-[13px] font-medium text-ink mb-1.5 leading-snug tracking-tight line-clamp-2 min-h-[2.3rem] group-hover:text-accent transition-colors"
      >
        {highlightMatch(task.title || "", searchQuery)}
      </p>

      {/* Task Description */}
      {task.description ? (
        <p className="text-xs text-muted line-clamp-2 mb-2 leading-relaxed font-normal min-h-[2rem]">
          {highlightMatch(task.description, searchQuery)}
        </p>
      ) : (
        <div className="min-h-[2rem] mb-2" />
      )}

      {/* Waiting on Prerequisite Badges */}
      {dependencies.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2.5 pt-2 border-t border-border-soft">
          <span className="text-[10px] font-medium text-faint">
            Waiting on:
          </span>
          {dependencies.map((dep) => {
            const isDone = dep.status === "done";
            return (
              <span
                key={dep.id}
                title={`#${dep.id.replace(/^task-/, "")} ${dep.title} (${dep.status})`}
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border flex items-center gap-1 ${
                  isDone
                    ? "border-ok/30 bg-ok/10 text-ok"
                    : "border-error/30 bg-error/10 text-error"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="w-2.5 h-2.5 text-ok" />
                ) : (
                  <AlertTriangle className="w-2.5 h-2.5 text-error" />
                )}
                #{dep.id.replace(/^task-/, "")}
              </span>
            );
          })}
        </div>
      )}

      {/* Card Footer: Assignee + Actions */}
      <div className="flex items-center justify-between gap-2 border-t border-border-soft pt-2.5 mt-auto">
        {/* Assignee chip */}
        <div className="flex items-center gap-1.5 min-w-0">
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0 shadow-2xs ${avatar.bg}`}
          >
            {avatar.initials}
          </div>
          {task.assigned_agent ? (
            <button
              type="button"
              id={`kanban-assignee-tag-${task.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onFilterByAssignee(task.assigned_agent);
              }}
              className="text-xs font-semibold text-ink hover:text-accent truncate max-w-[120px] hover:underline cursor-pointer text-left transition-colors"
              title={`Assigned to: ${task.assigned_agent} (Click to filter)`}
            >
              {task.assigned_agent.replace("_agent", "")}
            </button>
          ) : (
            <button
              type="button"
              id={`kanban-assignee-tag-${task.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onFilterByAssignee("unassigned");
              }}
              className="text-xs text-faint italic hover:text-accent cursor-pointer transition-colors"
              title="Unassigned (Click to filter)"
            >
              unassigned
            </button>
          )}

          {task.github?.pr_url && (
            <a
              href={task.github.pr_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-faint hover:text-ink transition-colors ml-1 p-0.5 rounded"
              title="View GitHub PR"
            >
              <GitBranch size={12} aria-hidden="true" />
            </a>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Manage Dependencies Link Button */}
          <button
            type="button"
            id={`kanban-link-deps-btn-${task.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDependencyModal?.(task as PMTask);
            }}
            title="Link tasks or manage dependencies and blockers"
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-pill bg-panel-alt hover:bg-ink/5 text-ink transition-colors cursor-pointer border border-border"
          >
            <Link2 size={11} className="text-muted shrink-0" />
            <span>DEPS {dependencies.length > 0 ? `(${dependencies.length})` : "+"}</span>
          </button>

          {/* Execute with Gemini AI Agent */}
          {task.status !== "in_progress" && task.status !== "done" && (
            <button
              id={`kanban-run-agent-btn-${task.id}`}
              onClick={handleExecute}
              disabled={running}
              aria-label="Run AI agent"
              title="Execute task with Gemini 2.5 Flash agent"
              className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-ink text-panel hover:opacity-90 shadow-xs hover:shadow transition-all disabled:opacity-50 cursor-pointer"
            >
              {running ? (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              ) : (
                <Play size={11} className="fill-current ml-0.5" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Redesigned Column Component
 */
function Column({
  id,
  label,
  tasks,
  dotColor,
  accentBg: _accentBg,
  searchQuery,
  hasActiveFilters,
  allTasks = [],
  totalTasksCount = 1,
  onFilterByPriority,
  onFilterByAssignee,
  onOpenDependencyModal,
  onHoverTask,
  onSelectTaskDetail,
  onQuickAddTask,
  hoveredTaskId,
  viewMode = "grid12",
  colSpanClass,
}: {
  id: string;
  label: string;
  tasks: Record<string, any>[];
  dotColor: string;
  accentBg?: string;
  searchQuery: string;
  hasActiveFilters: boolean;
  allTasks?: PMTask[];
  totalTasksCount?: number;
  onFilterByPriority: (priority: string) => void;
  onFilterByAssignee: (assignee: string) => void;
  onOpenDependencyModal?: (task: PMTask) => void;
  onHoverTask?: (taskId: string | null) => void;
  onSelectTaskDetail?: (task: PMTask) => void;
  onQuickAddTask?: (columnId: string) => void;
  hoveredTaskId?: string | null;
  viewMode?: "grid12" | "lanes";
  colSpanClass?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  // Ratio of this column's task count relative to total board tasks
  const ratio = totalTasksCount > 0 ? Math.min(100, Math.round((tasks.length / totalTasksCount) * 100)) : 0;

  return (
    <motion.div
      ref={setNodeRef}
      id={`kanban-column-${id}`}
      variants={motionVariants.scaleIn}
      className={`${
        viewMode === "grid12"
          ? colSpanClass || "col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-3 w-full"
          : "w-[300px] shrink-0"
      } flex flex-col rounded-xl bg-ink/[0.03] border border-border-soft transition-all ${
        isOver
          ? "border-ink/30 bg-ink/[0.06] ring-2 ring-ink/10"
          : ""
      }`}
    >
      {/* Column Header */}
      <div className="sticky top-0 z-10 px-4 py-3 bg-panel/80 backdrop-blur-md rounded-t-xl border-b border-border-soft">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
              style={{ backgroundColor: dotColor }}
              aria-hidden="true"
            />
            <h3 className="text-caption font-medium text-ink truncate">
              {label}
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-mono tabular-nums px-2 py-0.5 rounded-full bg-ink/[0.06] text-muted">
              {tasks.length}
            </span>
            <button
              type="button"
              onClick={() => onQuickAddTask?.(id)}
              title={`Add task to ${label}`}
              className="w-6 h-6 rounded-md hover:bg-ink/5 text-muted hover:text-ink flex items-center justify-center transition-colors cursor-pointer"
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Progress bar ratio */}
        <div className="w-full bg-ink/10 h-1 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${ratio}%`, backgroundColor: dotColor }}
          />
        </div>
      </div>

      {/* Task List / Drop Zone */}
      <motion.div
        className="overflow-y-auto flex-1 p-3 space-y-3 min-h-[160px] max-h-[640px] scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800"
        variants={motionVariants.staggerContainer}
      >
        {tasks.map((t, i) => (
          <TaskCard
            key={t.id}
            task={t}
            index={i}
            searchQuery={searchQuery}
            allTasks={allTasks}
            onFilterByPriority={onFilterByPriority}
            onFilterByAssignee={onFilterByAssignee}
            onOpenDependencyModal={onOpenDependencyModal}
            onHoverTask={onHoverTask}
            onSelectTaskDetail={onSelectTaskDetail}
            hoveredTaskId={hoveredTaskId}
          />
        ))}

        {tasks.length === 0 && (
          <motion.div
            className={`flex flex-col items-center justify-center py-10 px-4 text-center rounded-xl border-2 border-dashed transition-colors min-h-[140px] ${
              isOver
                ? "border-info/30 bg-info/20 text-info"
                : "border-border text-faint"
            }`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span className="text-xs font-semibold">
              {hasActiveFilters ? "No matching tasks" : "Drop tasks here"}
            </span>
            {!hasActiveFilters && (
              <button
                type="button"
                onClick={() => onQuickAddTask?.(id)}
                className="mt-2 text-[11px] font-semibold text-accent hover:underline cursor-pointer flex items-center gap-1"
              >
                <Plus size={11} strokeWidth={3} />
                <span>Create Task</span>
              </button>
            )}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

/**
 * Task Details Modal Drawer
 */
function TaskDetailModal({
  task,
  isOpen,
  onClose,
  allTasks,
  onUpdateStatus,
  onUpdatePriority,
  onOpenDependencyModal,
  onExecuteAgent,
}: {
  task: PMTask | null;
  isOpen: boolean;
  onClose: () => void;
  allTasks: PMTask[];
  onUpdateStatus: (taskId: string, status: string) => void;
  onUpdatePriority: (taskId: string, priority: string) => void;
  onOpenDependencyModal: (task: PMTask) => void;
  onExecuteAgent: (task: PMTask) => void;
}) {
  useEffect(() => {
    if (!isOpen || !task) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, task, onClose]);

  if (!isOpen || !task) return null;

  const normP = normalizePriority(task.priority);
  const pCfg = normP ? PRIORITY_CONFIG[normP] : null;

  const tasksById = new Map(allTasks.map((t) => [t.id, t]));
  const deps = (task.dependencies || [])
    .map((id) => tasksById.get(id))
    .filter(Boolean) as PMTask[];
  const downstream = allTasks.filter((t) => (t.dependencies || []).includes(task.id));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl bg-panel rounded-3xl border-2 border-border shadow-[var(--elevation-3)] p-6 max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-border-soft pb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-panel-alt text-muted">
              #{String(task.id).replace(/^task-/, "")}
            </span>
            {pCfg && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${pCfg.bg} ${pCfg.text} ${pCfg.border}`}>
                {pCfg.label}
              </span>
            )}
            <span className="text-xs text-muted">
              Task Details
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close task details modal"
            className="w-8 h-8 rounded-full hover:bg-ink/5 text-muted flex items-center justify-center transition-colors cursor-pointer"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Title */}
        <h2 id="task-detail-modal-title" className="text-lg font-semibold text-ink mt-4 mb-2 leading-snug">
          {task.title}
        </h2>

        {/* Description */}
        <div className="text-xs sm:text-sm text-muted leading-relaxed bg-panel p-4 rounded-xl border border-border mb-5">
          {task.description || <span className="italic text-faint">No description provided.</span>}
        </div>

        {/* Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {/* Status Selector */}
          <div>
            <label htmlFor="task-detail-status-select" className="text-xs text-muted mb-1.5 block">
              Workflow Status
            </label>
            <select
              id="task-detail-status-select"
              value={task.status}
              onChange={(e) => onUpdateStatus(task.id, e.target.value)}
              className="w-full h-10 px-3 rounded-xl border-2 border-border bg-panel-alt text-xs font-semibold text-ink focus:outline-none cursor-pointer"
            >
              {COLUMNS.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.label}
                </option>
              ))}
            </select>
          </div>

          {/* Priority Selector */}
          <div>
            <label htmlFor="task-detail-priority-select" className="text-xs text-muted mb-1.5 block">
              Priority Level
            </label>
            <select
              id="task-detail-priority-select"
              value={normP || "p2"}
              onChange={(e) => onUpdatePriority(task.id, e.target.value)}
              className="w-full h-10 px-3 rounded-xl border-2 border-border bg-panel-alt text-xs font-semibold text-ink focus:outline-none cursor-pointer"
            >
              <option value="p0">P0 - Critical</option>
              <option value="p1">P1 - High</option>
              <option value="p2">P2 - Medium</option>
              <option value="p3">P3 - Low</option>
            </select>
          </div>
        </div>

        {/* Dependencies Section */}
        <div className="border-t-2 border-border-soft pt-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-ink flex items-center gap-1.5">
              <Link2 size={13} />
              <span>Dependencies & Blockers ({deps.length})</span>
            </h4>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDependencyModal(task);
              }}
              className="text-xs font-semibold text-accent hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>Manage Graph</span>
              <ChevronRight size={13} />
            </button>
          </div>

          {deps.length > 0 ? (
            <div className="space-y-2">
              {deps.map((dep) => (
                <div
                  key={dep.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-panel text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {dep.status === "done" ? (
                      <CheckCircle2 size={14} className="text-ok shrink-0" />
                    ) : (
                      <AlertTriangle size={14} className="text-warn shrink-0" />
                    )}
                    <span className="font-semibold text-ink truncate">
                      {dep.title}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-ink/[0.06] text-muted shrink-0">
                    {dep.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-faint italic">No prerequisite dependencies linked.</p>
          )}

          {downstream.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border-soft">
              <p className="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1">
                <GitFork size={12} className="text-warn" />
                <span>Blocks {downstream.length} downstream task(s):</span>
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                {downstream.map((t) => (
                  <span
                    key={t.id}
                    className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-warn/10 text-warn border border-warn/30"
                  >
                    #{t.id.replace(/^task-/, "")} {t.title}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between gap-3 border-t-2 border-border-soft pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border-2 border-border text-xs font-semibold text-ink hover:bg-ink/5 transition-colors cursor-pointer"
          >
            Close
          </button>

          {task.status !== "done" && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onExecuteAgent(task);
              }}
              className="px-5 py-2.5 rounded-xl bg-ink hover:opacity-90 text-panel text-xs font-semibold shadow-[var(--elevation-1)] flex items-center gap-2 cursor-pointer transition-all border-2 border-border"
            >
              <Sparkles size={13} className="text-accent" />
              <span>Execute with Gemini</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Quick New Task Creation Modal
 */
function CreateTaskModal({
  isOpen,
  onClose,
  initialColumn = "backlog",
  sprints = [],
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialColumn?: string;
  sprints?: any[];
  onCreate: (taskData: {
    title: string;
    description: string;
    status: string;
    priority: string;
    category: string;
    assigned_agent: string;
    sprint_id?: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(initialColumn);
  const [priority, setPriority] = useState("p1");
  const [category, setCategory] = useState("feature");
  const [assignedAgent, setAssignedAgent] = useState("frontend_agent");
  const [sprintId, setSprintId] = useState(sprints[0]?.id || "");

  useEffect(() => {
    if (isOpen) {
      setStatus(initialColumn);
    }
  }, [isOpen, initialColumn]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a task title");
      return;
    }
    onCreate({
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      category,
      assigned_agent: assignedAgent,
      sprint_id: sprintId || undefined,
    });
    setTitle("");
    setDescription("");
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-task-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-base/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-panel rounded-3xl border-2 border-border shadow-[var(--elevation-3)] p-6"
      >
        <div className="flex items-center justify-between pb-3 border-b-2 border-border-soft">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-ok border-2 border-border" />
            <h3 id="create-task-modal-title" className="text-sm font-medium text-ink">
              Create New Task
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close create task modal"
            className="w-7 h-7 rounded-full hover:bg-ink/5 text-muted flex items-center justify-center cursor-pointer"
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="create-task-title-input" className="text-xs text-muted mb-1 block">
              Task Title *
            </label>
            <input
              id="create-task-title-input"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement Webhook Replay Idempotency"
              className="w-full h-10 px-3.5 rounded-xl border-2 border-border bg-panel-alt text-xs font-semibold text-ink focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="create-task-desc-input" className="text-xs text-muted mb-1 block">
              Description
            </label>
            <textarea
              id="create-task-desc-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed acceptance criteria and technical requirements..."
              className="w-full p-3 rounded-xl border-2 border-border bg-panel-alt text-xs text-ink focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="create-task-status-select" className="text-xs text-muted mb-1 block">
                Column Status
              </label>
              <select
                id="create-task-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border-2 border-border bg-panel-alt text-xs font-semibold text-ink cursor-pointer"
              >
                {COLUMNS.map((col) => (
                  <option key={col.id} value={col.id}>
                    {col.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="create-task-priority-select" className="text-xs text-muted mb-1 block">
                Priority
              </label>
              <select
                id="create-task-priority-select"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border-2 border-border bg-panel-alt text-xs font-semibold text-ink cursor-pointer"
              >
                <option value="p0">P0 - Critical</option>
                <option value="p1">P1 - High</option>
                <option value="p2">P2 - Medium</option>
                <option value="p3">P3 - Low</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="create-task-agent-select" className="text-xs text-muted mb-1 block">
                Assignee Agent
              </label>
              <select
                id="create-task-agent-select"
                value={assignedAgent}
                onChange={(e) => setAssignedAgent(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border-2 border-border bg-panel-alt text-xs font-semibold text-ink cursor-pointer"
              >
                <option value="frontend_agent">Frontend Agent</option>
                <option value="backend_agent">Backend Agent</option>
                <option value="qa_agent">QA Agent</option>
                <option value="systems_agent">Systems Agent</option>
                <option value="pm_agent">PM Agent</option>
              </select>
            </div>

            <div>
              <label htmlFor="create-task-category-input" className="text-xs text-muted mb-1 block">
                Category Tag
              </label>
              <input
                id="create-task-category-input"
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. backend, security"
                className="w-full h-9 px-3 rounded-xl border-2 border-border bg-panel-alt text-xs font-semibold text-ink"
              />
            </div>
          </div>

          {sprints && sprints.length > 0 && (
            <div>
              <label htmlFor="create-task-sprint-select" className="text-xs text-muted mb-1 block">
                Target Sprint
              </label>
              <select
                id="create-task-sprint-select"
                value={sprintId}
                onChange={(e) => setSprintId(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border-2 border-border bg-panel-alt text-xs font-semibold text-ink cursor-pointer"
              >
                <option value="">No specific sprint</option>
                {sprints.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t-2 border-border-soft">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border-2 border-border text-xs font-semibold text-muted cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-ink hover:opacity-90 text-panel text-xs font-semibold shadow-[var(--elevation-1)] border-2 border-border cursor-pointer"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Main Kanban Tab
 */
export default function KanbanTab() {
  const { tasks, sprints, setTaskLocal, addTaskLocal, addExecutionLocal, initiative } = usePMStore();
  const [boardSubView, setBoardSubView] = useState<"kanban" | "sprints" | "graph" | "releases">("kanban");
  const [sprintFilter, setSprintFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [blockedOnlyFilter, setBlockedOnlyFilter] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const [showArrows, setShowArrows] = useState<boolean>(true);
  const [onlyBlockerArrows, setOnlyBlockerArrows] = useState<boolean>(false);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dependencyModalTask, setDependencyModalTask] = useState<PMTask | null>(null);
  const [isDepModalOpen, setIsDepModalOpen] = useState<boolean>(false);
  const [detailModalTask, setDetailModalTask] = useState<PMTask | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [createModalColumn, setCreateModalColumn] = useState<string>("backlog");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"grid12" | "lanes">("grid12");
  const [columnPreset, setColumnPreset] = useState<"all" | "active" | "core" | "qa">("all");

  const boardContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const displayedColumns = useMemo(() => {
    switch (columnPreset) {
      case "active":
        return COLUMNS.filter((c) =>
          ["ready", "in_progress", "code_review", "testing"].includes(c.id)
        );
      case "core":
        return COLUMNS.filter((c) =>
          ["backlog", "ready", "in_progress", "done"].includes(c.id)
        );
      case "qa":
        return COLUMNS.filter((c) =>
          ["code_review", "testing", "blocked", "done"].includes(c.id)
        );
      case "all":
      default:
        return COLUMNS;
    }
  }, [columnPreset]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Global '/' keyboard shortcut to quickly jump to the search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        !["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const agents = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.assigned_agent).filter(Boolean) as string[])).sort(),
    [tasks]
  );

  const hasUnassigned = useMemo(() => tasks.some((t) => !t.assigned_agent), [tasks]);
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // Dynamic count of tasks per priority level for quick-filter chips
  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: tasks.length, p0: 0, p1: 0, p2: 0, p3: 0 };
    tasks.forEach((t) => {
      const p = normalizePriority(t.priority);
      if (p && counts[p] !== undefined) {
        counts[p]++;
      }
    });
    return counts;
  }, [tasks]);

  // Dynamic count of blocked tasks
  const blockedTasksCount = useMemo(() => {
    return tasks.filter((t) => {
      if (t.status === "blocked") return true;
      const deps = (t.dependencies || []).map((id) => tasksById.get(id)).filter(Boolean) as PMTask[];
      return deps.some((d) => d.status !== "done");
    }).length;
  }, [tasks, tasksById]);

  // Completed tasks count
  const completedCount = useMemo(() => {
    return tasks.filter((t) => t.status === "done").length;
  }, [tasks]);

  const inProgressCount = useMemo(() => {
    return tasks.filter((t) => t.status === "in_progress").length;
  }, [tasks]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    sprintFilter !== "all" ||
    agentFilter !== "all" ||
    priorityFilter !== "all" ||
    blockedOnlyFilter;

  const handleResetFilters = () => {
    setSearch("");
    setSprintFilter("all");
    setAgentFilter("all");
    setPriorityFilter("all");
    setBlockedOnlyFilter(false);
    searchInputRef.current?.focus();
  };

  const handleOpenDependencyModal = (task: PMTask) => {
    setDependencyModalTask(task);
    setIsDepModalOpen(true);
  };

  const handleCloseDependencyModal = () => {
    setIsDepModalOpen(false);
    setDependencyModalTask(null);
  };

  const handleAddDependency = async (taskId: string, dependsOnId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const current = target.dependencies || [];
    if (current.includes(dependsOnId)) return;
    const updated = [...current, dependsOnId];

    setTaskLocal(taskId, { dependencies: updated });
    setDependencyModalTask((prev) => (prev && prev.id === taskId ? { ...prev, dependencies: updated } : prev));

    try {
      if (LIVE_MODE) {
        await tasksApi.update(taskId, { dependencies: updated } as any);
      }
    } catch {
      // safe fallback
    }
    toast.success(`Linked #${dependsOnId.replace(/^task-/, "")} as blocker`);
  };

  const handleRemoveDependency = async (taskId: string, dependsOnId: string) => {
    const target = tasks.find((t) => t.id === taskId);
    if (!target) return;
    const current = target.dependencies || [];
    const updated = current.filter((id) => id !== dependsOnId);

    setTaskLocal(taskId, { dependencies: updated });
    setDependencyModalTask((prev) => (prev && prev.id === taskId ? { ...prev, dependencies: updated } : prev));

    try {
      if (LIVE_MODE) {
        await tasksApi.update(taskId, { dependencies: updated } as any);
      }
    } catch {
      // safe fallback
    }
    toast.success(`Removed dependency link`);
  };

  const handleCreateTask = async (taskData: {
    title: string;
    description: string;
    status: string;
    priority: string;
    category: string;
    assigned_agent: string;
    sprint_id?: string;
  }) => {
    const newTask: PMTask = {
      id: `task-${Date.now().toString(36)}`,
      initiative_id: initiative?.id || "init-1",
      story_id: "story-default",
      epic_id: "epic-default",
      title: taskData.title,
      description: taskData.description,
      status: taskData.status as any,
      priority: taskData.priority,
      category: taskData.category,
      assigned_agent: taskData.assigned_agent,
      sprint_id: taskData.sprint_id || sprints[0]?.id,
      dependencies: [],
    };

    addTaskLocal(newTask);
    toast.success(`Created task "${newTask.title}" in ${taskData.status.toUpperCase()}`);

    try {
      if (LIVE_MODE) {
        await tasksApi.create({
          story_id: newTask.story_id || "",
          epic_id: newTask.epic_id || "",
          initiative_id: newTask.initiative_id,
          title: newTask.title,
          description: newTask.description,
          category: newTask.category,
          assigned_agent: newTask.assigned_agent,
        });
      }
    } catch {
      // fallback
    }
  };

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      // 1. Sprint filter
      if (sprintFilter !== "all" && t.sprint_id !== sprintFilter) return false;

      // 2. Assignee filter
      if (agentFilter !== "all") {
        if (agentFilter === "unassigned") {
          if (t.assigned_agent) return false;
        } else if (t.assigned_agent !== agentFilter) {
          return false;
        }
      }

      // 3. Priority level filter
      if (priorityFilter !== "all") {
        const norm = normalizePriority(t.priority);
        if (norm !== priorityFilter) return false;
      }

      // 4. Blocked Only filter
      if (blockedOnlyFilter) {
        const isColumnBlocked = t.status === "blocked";
        const deps = (t.dependencies || []).map((id) => tasksById.get(id)).filter(Boolean) as PMTask[];
        const hasActiveBlockers = deps.some((d) => d.status !== "done");
        if (!isColumnBlocked && !hasActiveBlockers) return false;
      }

      // 5. Keyword, Assignee, and Priority search bar matching
      if (search) {
        const clean = search.trim().toLowerCase();
        if (clean) {
          const terms = clean.split(/\s+/).filter(Boolean);
          const title = (t.title || "").toLowerCase();
          const desc = (t.description || "").toLowerCase();
          const category = (t.category || "").toLowerCase();
          const id = String(t.id || "").toLowerCase();
          const agent = (t.assigned_agent || "").toLowerCase();
          const agentReadable = agent.replace(/_agent$/, "");
          const normPriority = normalizePriority(t.priority);
          const labels = Array.isArray(t.labels) ? t.labels.join(" ").toLowerCase() : "";

          const allMatched = terms.every((term) => {
            if (
              title.includes(term) ||
              desc.includes(term) ||
              category.includes(term) ||
              id.includes(term) ||
              labels.includes(term)
            ) {
              return true;
            }

            if (term === "unassigned" && !t.assigned_agent) return true;
            if (agent.includes(term) || agentReadable.includes(term)) return true;

            if (normPriority) {
              if (term === normPriority) return true;
              if (term === "critical" || term === "urgent") return normPriority === "p0";
              if (term === "high") return normPriority === "p1";
              if (term === "medium" || term === "med") return normPriority === "p2";
              if (term === "low") return normPriority === "p3";
            }

            return false;
          });

          if (!allMatched) return false;
        }
      }

      return true;
    });
  }, [tasks, sprintFilter, agentFilter, priorityFilter, blockedOnlyFilter, search, tasksById]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const task = tasks.find((t) => t.id === active.id);
    if (!task || task.status === over.id) return;

    usePMStore.getState().setTaskLocal(task.id, { status: String(over.id) });
    try {
      await tasksApi.updateStatus(task.id, String(over.id));
    } catch {
      toast.error("Couldn't move that task.");
      usePMStore.getState().setTaskLocal(task.id, { status: task.status });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Tabs
          value={boardSubView}
          onChange={(val) => setBoardSubView(val as typeof boardSubView)}
          items={[
            { value: "kanban", label: "Kanban Board", icon: <Kanban size={14} /> },
            { value: "sprints", label: "Sprints", icon: <Zap size={14} /> },
            { value: "graph", label: "Dependency Graph", icon: <Network size={14} /> },
            { value: "releases", label: "Releases", icon: <Package size={14} /> },
          ]}
        />
      </div>

      {boardSubView === "sprints" ? (
        <SprintsTab />
      ) : boardSubView === "graph" ? (
        <GraphTab />
      ) : boardSubView === "releases" ? (
        <ReleasesTab />
      ) : (
    <div className="flex flex-col h-full min-h-0 bg-panel rounded-lg border border-border font-sans antialiased text-ink">
      {/* Top Header & Filter Control Bar */}
      <div className="px-4 py-3.5 md:px-6 shrink-0 bg-panel border-b border-border">
        {/* Title and High-Level Status Row */}
        <div className="flex items-center justify-between gap-4 mb-3.5 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-ink/[0.06] text-muted flex items-center justify-center">
              <Layers size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm md:text-base font-medium text-ink tracking-tight leading-tight">
                  Sprint Planning Board
                </h1>
                <Badge variant="accent" dot>
                  Active sprint
                </Badge>
              </div>
              <p className="text-xs text-muted mt-0.5">
                {initiative?.name || "AI-Native Engineering Team"} &bull; Real-time Kanban & Dependency Graph
              </p>
            </div>
          </div>

          {/* Quick Metrics Badges & Add Task Action */}
          <div className="flex items-center gap-2 text-xs font-medium flex-wrap">
            <Badge variant="default">
              Total <strong className="font-mono tabular-nums font-medium text-ink">{tasks.length}</strong>
            </Badge>
            <Badge variant="warning">
              In progress <strong className="font-mono tabular-nums font-medium">{inProgressCount}</strong>
            </Badge>
            <Badge variant="success">
              Done <strong className="font-mono tabular-nums font-medium">{completedCount}</strong>
            </Badge>
            {blockedTasksCount > 0 && (
              <Badge variant="error">
                Blocked <strong className="font-mono tabular-nums font-medium">{blockedTasksCount}</strong>
              </Badge>
            )}
            <button
              type="button"
              onClick={() => {
                setCreateModalColumn("backlog");
                setIsCreateModalOpen(true);
              }}
              className="h-9 px-4 rounded-pill bg-ink hover:bg-ink/90 text-on-ink text-xs font-medium flex items-center gap-1.5 cursor-pointer border border-transparent transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Plus size={14} />
              <span>New Task</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar Controls */}
        <motion.div className="flex items-center gap-2.5 flex-wrap" variants={motionVariants.fadeIn}>
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[240px] sm:min-w-[300px]">
            <Search
              size={15}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
              aria-hidden="true"
            />
            <input
              id="kanban-search-input"
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearch("");
                  (e.target as HTMLElement).blur();
                }
              }}
              placeholder="Search tasks by keyword, assignee, or priority (P0, P1...)..."
              aria-label="Search tasks by keyword, assignee, or priority"
              className="h-9 w-full rounded-pill border border-glass-border bg-glass pl-9 pr-14 text-xs font-medium text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent transition-all shadow-xs"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {search ? (
                <button
                  id="kanban-search-clear-btn"
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search input"
                  title="Clear search"
                  className="p-1 rounded-full text-faint hover:text-muted hover:bg-ink/5 cursor-pointer transition-colors"
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
              ) : (
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-faint border border-border rounded bg-panel-alt shadow-2xs">
                  /
                </kbd>
              )}
            </div>
          </div>

          {/* Priority Level Dropdown */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="kanban-priority-filter"
              className="text-xs text-muted shrink-0 hidden sm:inline-flex items-center gap-1"
            >
              <AlertCircle size={13} className="text-muted" />
              Priority
            </label>
            <select
              id="kanban-priority-filter"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Filter by priority level"
              className="h-9 rounded-pill border border-border bg-panel-alt px-3 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer transition-all"
            >
              <option value="all">All Priorities</option>
              <option value="p0">P0 - Critical</option>
              <option value="p1">P1 - High</option>
              <option value="p2">P2 - Medium</option>
              <option value="p3">P3 - Low</option>
            </select>
          </div>

          {/* Assignee Dropdown */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="kanban-assignee-filter"
              className="text-xs text-muted shrink-0 hidden sm:inline-flex items-center gap-1"
            >
              <User size={13} className="text-muted" />
              Assignee
            </label>
            <select
              id="kanban-assignee-filter"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              aria-label="Filter by assignee"
              className="h-9 rounded-pill border border-border bg-panel-alt px-3 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer transition-all"
            >
              <option value="all">All Assignees</option>
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a.replace(/_agent$/i, "").toUpperCase()} Agent
                </option>
              ))}
              {hasUnassigned && <option value="unassigned">Unassigned</option>}
            </select>
          </div>

          {/* Sprint Dropdown */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="kanban-sprint-filter"
              className="text-xs text-muted shrink-0 hidden lg:inline-flex items-center gap-1"
            >
              <Filter size={13} className="text-muted" />
              Sprint
            </label>
            <select
              id="kanban-sprint-filter"
              value={sprintFilter}
              onChange={(e) => setSprintFilter(e.target.value)}
              aria-label="Filter by sprint"
              className="h-9 rounded-pill border border-border bg-panel-alt px-3 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer transition-all"
            >
              <option value="all">All Sprints</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || `Sprint ${s.sprint_number}`}
                </option>
              ))}
            </select>
          </div>

          {/* Dependency Arrows Controls */}
          <div className="flex items-center gap-1.5 border-l border-border-soft pl-2.5">
            <Button
              id="kanban-toggle-arrows-btn"
              variant={showArrows ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={showArrows}
              onClick={() => setShowArrows(!showArrows)}
              title={showArrows ? "Hide visual dependency blocker arrows" : "Show visual dependency blocker arrows"}
            >
              <GitFork size={13} />
              <span>Arrows: {showArrows ? "on" : "off"}</span>
            </Button>

            {showArrows && (
              <Button
                id="kanban-toggle-only-blockers-btn"
                variant="ghost"
                size="sm"
                aria-pressed={onlyBlockerArrows}
                onClick={() => setOnlyBlockerArrows(!onlyBlockerArrows)}
                className={onlyBlockerArrows ? "text-error hover:text-error" : undefined}
                title="Toggle between all dependency arrows or only active blockers"
              >
                {onlyBlockerArrows ? "Blockers only" : "All arrows"}
              </Button>
            )}
          </div>

          {/* Layout Grid View Toggle */}
          <div className="flex items-center gap-1 border-l border-border-soft pl-2.5">
            <SegmentedControl
              label="Board layout"
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: "grid12", label: "Grid", id: "kanban-view-mode-grid" },
                { value: "lanes", label: "Lanes", id: "kanban-view-mode-lanes" },
              ]}
            />
          </div>

          {/* Reset Filters Action */}
          {hasActiveFilters && (
            <button
              id="kanban-reset-filters-btn"
              type="button"
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 h-9 px-3 rounded-pill border border-transparent text-muted hover:bg-ink/5 hover:text-ink text-xs font-medium transition-colors cursor-pointer"
              title="Reset all filters and search query"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </motion.div>

        {/* Quick Priority & Blocker Filter Chips Sub-bar */}
        <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border-soft flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted">Priority</span>
            <SegmentedControl
              label="Quick priority filter"
              value={priorityFilter as "all" | "p0" | "p1" | "p2" | "p3"}
              onChange={(p) => setPriorityFilter(priorityFilter === p && p !== "all" ? "all" : p)}
              options={(["all", "p0", "p1", "p2", "p3"] as const).map((p) => ({
                value: p,
                id: `kanban-priority-chip-${p}`,
                label: `${p === "all" ? "All" : PRIORITY_CONFIG[p]?.label} (${priorityCounts[p] || 0})`,
              }))}
            />

            {/* Blocked Only Chip */}
            <button
              id="kanban-blocked-only-filter-btn"
              type="button"
              aria-pressed={blockedOnlyFilter}
              onClick={() => setBlockedOnlyFilter(!blockedOnlyFilter)}
              className={`h-7 px-3 text-xs font-medium rounded-full border flex items-center gap-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                blockedOnlyFilter
                  ? "border-error/40 bg-error/20 text-error"
                  : "border-error/20 bg-error/10 text-error hover:bg-error/20"
              }`}
              title="Show only tasks with unresolved blockers"
            >
              <AlertTriangle size={12} />
              <span>Blocked only ({blockedTasksCount})</span>
            </button>

            {/* Column Presets Filter Chips */}
            <div className="flex items-center gap-2 border-l border-border-soft pl-2.5 ml-1">
              <span className="text-xs text-muted hidden sm:inline">View</span>
              <SegmentedControl
                label="Column preset"
                value={columnPreset as string}
                onChange={(v) => setColumnPreset(v as any)}
                options={COLUMN_PRESETS.map((preset) => ({
                  value: preset.id,
                  label: preset.label,
                  id: `kanban-column-preset-${preset.id}`,
                }))}
              />
            </div>
          </div>

          {/* Results Summary Counter */}
          <div className="text-xs text-muted shrink-0 ml-auto">
            Showing <strong className="font-mono tabular-nums font-medium text-ink">{filtered.length}</strong> /{" "}{tasks.length} tasks
          </div>
        </div>

        {/* Mobile Quick Column Jump Pills */}
        <div className="flex sm:hidden items-center gap-1.5 overflow-x-auto py-2 px-1 border-t border-border-soft mt-2 scrollbar-none">
          <span className="text-xs text-muted shrink-0">
            Jump to
          </span>
          {displayedColumns.map((col) => {
            const count = filtered.filter((t) => t.status === col.id).length;
            return (
              <button
                key={col.id}
                type="button"
                onClick={() => {
                  const el = document.getElementById(`kanban-column-${col.id}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                }}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full bg-panel text-ink border border-border"
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.dotColor }} />
                <span>{col.label}</span>
                <span className="text-[10px] font-mono tabular-nums px-1.5 rounded-full bg-ink/[0.06] text-muted">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Zero State Alert Banner */}
      {filtered.length === 0 && tasks.length > 0 && (
        <div className="mx-4 md:mx-6 mt-4 p-4 rounded-xl bg-warn/10 border border-warn/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs font-medium text-warn">
            <Search size={16} className="text-warn shrink-0" />
            <span>
              No tasks match your search {search ? `"${search}"` : ""} with the selected filters.
            </span>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="h-8 px-4 rounded-pill border border-glass-border bg-glass text-ink text-xs font-medium hover:bg-ink/10 transition-colors cursor-pointer"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Board Scrollable Columns with Overlay */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div
          ref={boardContainerRef}
          id="kanban-board-scroll-container"
          className={`relative flex-1 p-4 md:p-6 ${
            viewMode === "grid12"
              ? "overflow-y-auto overflow-x-hidden"
              : "overflow-x-auto overflow-y-hidden"
          }`}
        >
          {/* Interactive SVG Dependency Connector Arrows */}
          <DependencyArrowsOverlay
            tasks={tasks}
            containerRef={boardContainerRef}
            hoveredTaskId={hoveredTaskId}
            selectedTaskId={selectedTaskId}
            showArrows={showArrows}
            onlyBlockers={onlyBlockerArrows}
            onHoverTask={setHoveredTaskId}
            onSelectTask={setSelectedTaskId}
          />

          {viewMode === "grid12" ? (
            <motion.div
              className="grid grid-cols-12 gap-4 lg:gap-5 w-full pb-8"
              variants={motionVariants.staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {displayedColumns.map((col) => {
                const colSpan =
                  displayedColumns.length <= 4
                    ? "col-span-12 sm:col-span-6 lg:col-span-3 w-full"
                    : "col-span-12 sm:col-span-6 lg:col-span-4 xl:col-span-3 w-full";
                return (
                  <Column
                    key={col.id}
                    id={col.id}
                    label={col.label}
                    tasks={filtered.filter((t) => t.status === col.id)}
                    dotColor={col.dotColor}
                    accentBg={col.accentBg}
                    searchQuery={search}
                    hasActiveFilters={hasActiveFilters}
                    allTasks={tasks}
                    totalTasksCount={tasks.length}
                    onFilterByPriority={(p) => setPriorityFilter(p)}
                    onFilterByAssignee={(a) => setAgentFilter(a)}
                    onOpenDependencyModal={handleOpenDependencyModal}
                    onHoverTask={setHoveredTaskId}
                    onSelectTaskDetail={(t) => {
                      setDetailModalTask(t);
                      setIsDetailModalOpen(true);
                    }}
                    onQuickAddTask={(colId) => {
                      setCreateModalColumn(colId);
                      setIsCreateModalOpen(true);
                    }}
                    hoveredTaskId={hoveredTaskId}
                    viewMode="grid12"
                    colSpanClass={colSpan}
                  />
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              className="flex gap-4 h-full min-w-max pb-4"
              variants={motionVariants.staggerContainer}
              initial="hidden"
              animate="visible"
            >
              {displayedColumns.map((col) => (
                <Column
                  key={col.id}
                  id={col.id}
                  label={col.label}
                  tasks={filtered.filter((t) => t.status === col.id)}
                  dotColor={col.dotColor}
                  accentBg={col.accentBg}
                  searchQuery={search}
                  hasActiveFilters={hasActiveFilters}
                  allTasks={tasks}
                  totalTasksCount={tasks.length}
                  onFilterByPriority={(p) => setPriorityFilter(p)}
                  onFilterByAssignee={(a) => setAgentFilter(a)}
                  onOpenDependencyModal={handleOpenDependencyModal}
                  onHoverTask={setHoveredTaskId}
                  onSelectTaskDetail={(t) => {
                    setDetailModalTask(t);
                    setIsDetailModalOpen(true);
                  }}
                  onQuickAddTask={(colId) => {
                    setCreateModalColumn(colId);
                    setIsCreateModalOpen(true);
                  }}
                  hoveredTaskId={hoveredTaskId}
                  viewMode="lanes"
                />
              ))}
            </motion.div>
          )}
        </div>
      </DndContext>

      {/* Task Dependency Linking & Management Modal */}
      <TaskDependencyModal
        isOpen={isDepModalOpen}
        onClose={handleCloseDependencyModal}
        task={dependencyModalTask}
        allTasks={tasks}
        onAddDependency={handleAddDependency}
        onRemoveDependency={handleRemoveDependency}
        onSelectTask={(id) => {
          setSelectedTaskId(id);
          setHoveredTaskId(id);
          const el = document.getElementById(`kanban-task-card-${id}`);
          el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }}
      />

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={detailModalTask}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setDetailModalTask(null);
        }}
        allTasks={tasks}
        onUpdateStatus={(taskId, newStatus) => {
          setTaskLocal(taskId, { status: newStatus as any });
          if (detailModalTask && detailModalTask.id === taskId) {
            setDetailModalTask({ ...detailModalTask, status: newStatus as any });
          }
          toast.success(`Updated status to ${newStatus.toUpperCase()}`);
        }}
        onUpdatePriority={(taskId, newPriority) => {
          setTaskLocal(taskId, { priority: newPriority });
          if (detailModalTask && detailModalTask.id === taskId) {
            setDetailModalTask({ ...detailModalTask, priority: newPriority });
          }
          toast.success(`Updated priority to ${newPriority.toUpperCase()}`);
        }}
        onOpenDependencyModal={handleOpenDependencyModal}
        onExecuteAgent={async (taskToRun) => {
          try {
            const agentName = taskToRun.assigned_agent || "engineer_agent";
            toast.loading(`Agent ${agentName} executing task with Gemini...`, { id: taskToRun.id });
            const res = await executeTaskWithGemini(taskToRun as any, initiative?.tech_stack || []);
            setTaskLocal(taskToRun.id, { status: "done" });
            addExecutionLocal({
              id: `exec-${Date.now()}`,
              initiative_id: taskToRun.initiative_id || initiative?.id || "",
              task_id: taskToRun.id,
              agent_type: agentName,
              agent: agentName,
              status: "completed",
              current_thought: res.thought,
              progress: 100,
              tokens_used: res.tokens_used,
              cost_usd: res.cost_usd,
              duration_seconds: res.duration_seconds,
              logs: res.logs,
              started_at: new Date(Date.now() - 5000).toISOString(),
              completed_at: new Date().toISOString(),
            });
            toast.dismiss(taskToRun.id);
            toast.success(`${agentName} completed task with Gemini!`);
          } catch (err: any) {
            toast.dismiss(taskToRun.id);
            toast.error(err?.message || "Execution error");
          }
        }}
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        initialColumn={createModalColumn}
        sprints={sprints}
        onCreate={handleCreateTask}
      />
    </div>
      )}
    </div>
  );
}
