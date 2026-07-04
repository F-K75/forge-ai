import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { DndContext, useDraggable, useDroppable, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Play, Loader2, GitBranch } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { tasksApi } from "../../lib/pmApi";

const COLUMNS: { id: string; label: string }[] = [
  { id: "backlog", label: "Backlog" },
  { id: "ready", label: "Ready" },
  { id: "in_progress", label: "In Progress" },
  { id: "code_review", label: "Code Review" },
  { id: "testing", label: "Testing" },
  { id: "blocked", label: "Blocked" },
  { id: "done", label: "Done" },
  { id: "support", label: "Support" },
];

function TaskCard({ task }: { task: Record<string, any> }) {
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
      toast.error("Failed to start agent");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-panel border border-border rounded-md p-3 mb-2 cursor-grab active:cursor-grabbing ${isDragging ? "opacity-60" : ""}`}
    >
      <p className="text-sm text-ink mb-2 leading-snug">{task.title}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-mono text-faint truncate" title={task.assigned_agent}>
            {task.assigned_agent?.replace("_agent", "")}
          </span>
          {task.github?.pr_url && (
            <a href={task.github.pr_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-faint hover:text-ink">
              <GitBranch size={10} aria-hidden="true" />
            </a>
          )}
        </div>
        {task.status !== "in_progress" && task.status !== "done" && (
          <button
            onClick={handleExecute}
            disabled={running}
            aria-label="Run AI agent"
            className="flex items-center justify-center w-5 h-5 rounded text-faint hover:text-ink hover:bg-panel-alt transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
          >
            {running ? <Loader2 size={11} className="animate-spin" aria-hidden="true" /> : <Play size={11} aria-hidden="true" />}
          </button>
        )}
      </div>
    </div>
  );
}

function Column({ id, label, tasks }: { id: string; label: string; tasks: Record<string, any>[] }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`w-64 shrink-0 flex flex-col rounded-lg border ${isOver ? "border-ink/40 bg-panel-alt" : "border-border-soft"} p-2`}
    >
      <div className="flex items-center justify-between px-1.5 py-1.5 mb-1">
        <span className="text-xs font-medium text-muted uppercase tracking-[0.08em]">{label}</span>
        <span className="text-[10px] font-mono text-faint">{tasks.length}</span>
      </div>
      <div className="overflow-y-auto flex-1 min-h-8">
        {tasks.map(t => (
          <TaskCard key={t.id} task={t} />
        ))}
      </div>
    </div>
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

    usePMStore.getState().setTaskLocal(task.id, { status: over.id });
    try {
      await tasksApi.updateStatus(task.id, String(over.id));
    } catch {
      toast.error("Failed to move task");
      usePMStore.getState().setTaskLocal(task.id, { status: task.status });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-6 md:px-8 py-3 border-b border-border-soft shrink-0 flex-wrap">
        <select
          value={sprintFilter}
          onChange={e => setSprintFilter(e.target.value)}
          className="h-8 bg-transparent border border-border rounded-md px-2 text-xs text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
        >
          <option value="all">All sprints</option>
          {sprints.map(s => (
            <option key={s.id} value={s.id}>{s.name || `Sprint ${s.sprint_number}`}</option>
          ))}
        </select>
        <select
          value={agentFilter}
          onChange={e => setAgentFilter(e.target.value)}
          className="h-8 bg-transparent border border-border rounded-md px-2 text-xs text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
        >
          <option value="all">All agents</option>
          {agents.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tasks…"
          className="h-8 bg-transparent border border-border rounded-md px-2 text-xs text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 min-w-[160px]"
        />
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 md:p-6">
          <div className="flex gap-3 h-full">
            {COLUMNS.map(col => (
              <Column key={col.id} id={col.id} label={col.label} tasks={filtered.filter(t => t.status === col.id)} />
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}
