import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { DndContext, useDraggable, useDroppable, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Play, Loader2, GitBranch, Search, Filter } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { tasksApi } from "../../lib/pmApi";
import { motion, motionVariants } from "../../lib/animations";
import { presets } from "../../lib/animationPresets";

const COLUMNS: { id: string; label: string; color: string }[] = [
  { id: "backlog", label: "Backlog", color: "rgb(var(--muted))" },
  { id: "ready", label: "Ready", color: "rgb(var(--primary))" },
  { id: "in_progress", label: "In Progress", color: "rgb(var(--accent))" },
  { id: "code_review", label: "Code Review", color: "rgb(var(--secondary))" },
  { id: "testing", label: "Testing", color: "rgb(var(--warning))" },
  { id: "blocked", label: "Blocked", color: "rgb(var(--error))" },
  { id: "done", label: "Done", color: "rgb(var(--success))" },
  { id: "support", label: "Support", color: "rgb(var(--info))" },
];

function TaskCard({ task, index }: { task: Record<string, any>; index: number }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const [running, setRunning] = useState(false);
  const { setTaskLocal } = usePMStore();

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: isDragging ? 10 : undefined }
    : undefined;

  const handleExecute = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRunning(true);
    try {
      await tasksApi.execute(task.id);
      setTaskLocal(task.id, { status: "in_progress" });
      toast.success(`${task.assigned_agent} is on it`);
    } catch {
      toast.error("Couldn't start that agent.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      variants={motionVariants.staggerItem}
      custom={index}
      {...presets.kanbanCard}
      className={`group rounded-xl border border-inlay bg-inlay-subtle p-3.5 mb-2 cursor-grab active:cursor-grabbing transition-all duration-200 hover:border-inlay-strong hover:bg-inlay-hover ${isDragging ? "opacity-60 scale-[1.02] shadow-lg shadow-black/30 border-accent/40" : ""}`}
    >
      <p className="text-sm text-ink mb-2.5 leading-snug font-medium">{task.title}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.assigned_agent && (
            <span className="text-[10px] font-mono text-faint truncate" title={task.assigned_agent}>
              {task.assigned_agent?.replace("_agent", "")}
            </span>
          )}
          {task.github?.pr_url && (
            <a href={task.github.pr_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-faint hover:text-ink transition-colors">
              <GitBranch size={10} aria-hidden="true" />
            </a>
          )}
        </div>
        {task.status !== "in_progress" && task.status !== "done" && (
          <button
            onClick={handleExecute}
            disabled={running}
            aria-label="Run AI agent"
            className="flex items-center justify-center w-7 h-7 rounded-lg border border-inlay-strong bg-inlay text-faint hover:text-ink hover:bg-inlay-strong hover:border-inlay-strong transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50"
          >
            {running ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <Play size={11} aria-hidden="true" />}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Column({ id, label, tasks, color }: { id: string; label: string; tasks: Record<string, any>[]; color: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <motion.div
      ref={setNodeRef}
      variants={motionVariants.scaleIn}
      className={`w-64 shrink-0 flex flex-col rounded-2xl border transition-all duration-200 ${isOver ? "border-accent/40 bg-accent/5 shadow-lg shadow-accent/10" : "border-inlay bg-inlay-subtle"} backdrop-blur-xl`}
    >
      <div className="flex items-center justify-between px-4 py-3 mb-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
          <span className="text-xs font-semibold text-ink uppercase tracking-wider">{label}</span>
        </div>
        <span className="text-[11px] font-mono text-muted rounded-full bg-inlay-hover px-2 py-0.5">{tasks.length}</span>
      </div>
      <motion.div className="overflow-y-auto flex-1 min-h-8 px-2 pb-2" variants={motionVariants.staggerContainer}>
        {tasks.map((t, i) => (
          <TaskCard key={t.id} task={t} index={i} />
        ))}
        {tasks.length === 0 && (
          <motion.div
            className="flex items-center justify-center py-6 text-[11px] text-faint border border-dashed border-inlay rounded-xl mx-1 backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Drop tasks here
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function KanbanTab() {
  const { tasks, sprints } = usePMStore();
  const [sprintFilter, setSprintFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const agents = useMemo(() => Array.from(new Set(tasks.map(t => t.assigned_agent))).sort(), [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter(t => {
      if (sprintFilter !== "all" && t.sprint_id !== sprintFilter) return false;
      if (agentFilter !== "all" && t.assigned_agent !== agentFilter) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [tasks, sprintFilter, agentFilter, search]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const task = tasks.find(t => t.id === active.id);
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
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-6 md:px-8 shrink-0">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <GitBranch size={12} aria-hidden="true" />
          </span>
          <h2 className="font-display text-sm font-semibold text-ink">Kanban Board</h2>
        </div>
        <motion.div className="flex items-center gap-2 flex-wrap" variants={motionVariants.fadeIn}>
          <div className="flex items-center gap-1.5 rounded-xl border border-inlay-strong bg-inlay px-3 py-1.5 backdrop-blur-xl">
            <Filter size={12} className="text-muted" />
            <select
              value={sprintFilter}
              onChange={e => setSprintFilter(e.target.value)}
              className="h-7 bg-transparent text-xs text-ink focus:outline-none focus-visible:ring-0 cursor-pointer"
            >
              <option value="all">All sprints</option>
              {sprints.map(s => (
                <option key={s.id} value={s.id}>{s.name || `Sprint ${s.sprint_number}`}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-inlay-strong bg-inlay px-3 py-1.5 backdrop-blur-xl">
            <select
              value={agentFilter}
              onChange={e => setAgentFilter(e.target.value)}
              className="h-7 bg-transparent text-xs text-ink focus:outline-none focus-visible:ring-0 cursor-pointer"
            >
              <option value="all">All agents</option>
              {agents.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-inlay-strong bg-inlay px-3 py-1.5 flex-1 max-w-[240px] backdrop-blur-xl">
            <Search size={12} className="text-muted" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="h-7 bg-transparent text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-0 flex-1 min-w-0"
            />
          </div>
        </motion.div>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <motion.div className="flex-1 overflow-x-auto overflow-y-hidden p-4 md:p-6" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
          <motion.div className="flex gap-3 h-full" variants={motionVariants.staggerContainer}>
            {COLUMNS.map(col => (
              <Column key={col.id} id={col.id} label={col.label} tasks={filtered.filter(t => t.status === col.id)} color={col.color} />
            ))}
          </motion.div>
        </motion.div>
      </DndContext>
    </div>
  );
}
