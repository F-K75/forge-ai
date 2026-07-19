import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Send, ArrowUpRight, Play, Search, LayoutGrid, List, FolderSearch } from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { EmptyState } from "../components/ui/EmptyState";
import { PROJECTS, STARTERS, type Project as MockProject } from "../lib/mockData";
import { agentById } from "../lib/agents";
import { getIcon } from "../lib/iconMap";
import { LIVE_MODE } from "../lib/env";
import { projectsApi } from "../lib/api";
import { formatRelativeTime } from "../lib/format";
import { coverGradient, coverGlow } from "../lib/coverArt";

function toDisplayProject(raw: any): MockProject {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || "",
    agents: [],
    qaScore: NaN,
    lastBuilt: formatRelativeTime(raw.updated_at ?? raw.created_at),
    live: Boolean(raw.deployed_url),
  };
}

function qaTone(score: number): string {
  if (!Number.isFinite(score)) return "text-faint border-border-soft bg-transparent";
  if (score >= 90) return "text-ink border-ink/25 bg-ink/10";
  if (score >= 80) return "text-muted border-border bg-panel-alt";
  return "text-faint border-border-soft bg-transparent";
}

type StatusFilter = "all" | "live" | "idle";
type SortKey = "recent" | "name" | "status";
type ViewMode = "grid" | "list";

function StatusDot({ live }: { live: boolean }) {
  return (
    <span className="relative flex w-2 h-2 shrink-0">
      {live && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-ink/50 animate-ping motion-reduce:hidden" />
      )}
      <span
        className={
          live
            ? "relative w-2 h-2 rounded-full bg-ink"
            : "relative w-2 h-2 rounded-full border border-faint bg-transparent"
        }
      />
    </span>
  );
}

const gridVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [liveProjects, setLiveProjects] = useState<MockProject[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!LIVE_MODE) return;
    let cancelled = false;
    projectsApi
      .list()
      .then((data: any[]) => {
        if (!cancelled) setLiveProjects(data.map(toDisplayProject));
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load projects");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const projects = LIVE_MODE ? liveProjects ?? [] : PROJECTS;

  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = projects.filter(p => {
      if (statusFilter === "live" && !p.live) return false;
      if (statusFilter === "idle" && p.live) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sortKey === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (sortKey === "status") return [...filtered].sort((a, b) => Number(b.live) - Number(a.live));
    return filtered;
  }, [projects, search, statusFilter, sortKey]);

  const handleBuild = async (initialPrompt?: string, template?: string) => {
    const trimmed = (initialPrompt ?? prompt).trim();

    if (!LIVE_MODE) {
      navigate("/build/new", trimmed ? { state: { prompt: trimmed, template } } : undefined);
      return;
    }

    setCreating(true);
    try {
      const name = trimmed ? trimmed.slice(0, 60) : "Untitled project";
      const project = await projectsApi.create({ name, description: trimmed, template });
      navigate(`/build/${project.id}`, trimmed ? { state: { prompt: trimmed } } : undefined);
    } catch {
      toast.error("Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="px-6 md:px-10 py-10 md:py-14 max-w-6xl mx-auto">
      {/* Header */}
      <motion.header
        initial={reduceMotion ? false : { opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex items-start justify-between gap-6 mb-14"
      >
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-4">
            <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
            Workspace
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-ink">Projects</h1>
          <p className="text-sm text-muted mt-2">{projects.length} apps built this month</p>
        </div>
        <motion.button
          onClick={() => handleBuild("")}
          disabled={creating}
          whileHover={reduceMotion ? undefined : { scale: 1.03 }}
          whileTap={reduceMotion ? undefined : { scale: 0.97 }}
          className="flex items-center gap-2 h-10 px-4 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition-colors motion-reduce:transition-none shrink-0 disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          New project
        </motion.button>
      </motion.header>

      {/* Prompt */}
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        aria-label="Build a new app"
        className="mb-16 rounded-xl glass-strong p-6 md:p-8"
      >
        <h2 className="font-display text-xl font-medium text-ink mb-1.5">What do you want to build?</h2>
        <p className="text-sm text-muted mb-6">Describe your app and Forge builds it end-to-end.</p>

        <div className="flex gap-2 mb-5">
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleBuild()}
            placeholder="A SaaS app that tracks habits with streaks…"
            className="flex-1 h-11 bg-panel-alt border border-border rounded-md px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 focus:border-ink/40 transition min-w-0"
            aria-label="Describe your app"
          />
          <motion.button
            onClick={() => handleBuild()}
            disabled={creating}
            whileHover={reduceMotion ? undefined : { scale: 1.03 }}
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            className="flex items-center gap-2 h-11 px-5 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition-colors motion-reduce:transition-none shrink-0 disabled:opacity-50"
          >
            <Send size={13} aria-hidden="true" />
            {creating ? "Creating…" : "Build"}
          </motion.button>
        </div>

        {/* Starter chips */}
        <div className="flex flex-wrap gap-2" role="list" aria-label="Starter templates">
          {STARTERS.map(starter => {
            const Icon = getIcon(starter.iconName);
            return (
              <motion.button
                key={starter.label}
                role="listitem"
                onClick={() => handleBuild(starter.label, starter.label)}
                whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border-soft bg-panel-alt text-muted hover:text-ink hover:border-ink/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition-colors motion-reduce:transition-none"
              >
                <Icon size={11} aria-hidden="true" />
                {starter.label}
              </motion.button>
            );
          })}
        </div>
      </motion.section>

      {/* Recent projects */}
      <motion.section
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        aria-label="Recent projects"
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-6">
          <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
          Recent
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects"
              className="w-full h-9 bg-transparent border border-border rounded-md pl-8 pr-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
            className="h-9 bg-transparent border border-border rounded-md px-2 text-xs text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
          >
            <option value="all">All statuses</option>
            <option value="live">Live</option>
            <option value="idle">Idle</option>
          </select>
          <select
            value={sortKey}
            onChange={e => setSortKey(e.target.value as SortKey)}
            aria-label="Sort projects"
            className="h-9 bg-transparent border border-border rounded-md px-2 text-xs text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
          >
            <option value="recent">Recent</option>
            <option value="name">Name (A–Z)</option>
            <option value="status">Status (Live first)</option>
          </select>
          <div className="flex gap-1 shrink-0" role="group" aria-label="View mode">
            {([
              { key: "grid" as const, icon: LayoutGrid, label: "Grid view" },
              { key: "list" as const, icon: List, label: "List view" },
            ]).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setViewMode(key)}
                aria-label={label}
                aria-pressed={viewMode === key}
                className={[
                  "flex items-center justify-center h-9 w-9 rounded-md border transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40",
                  viewMode === key ? "border-ink text-ink" : "border-border text-muted hover:text-ink",
                ].join(" ")}
              >
                <Icon size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        {projects.length === 0 ? (
          <EmptyState
            icon={Send}
            title="No projects yet"
            description="Describe what you want to build in the box above to create your first project."
          />
        ) : visibleProjects.length === 0 ? (
          <EmptyState
            icon={FolderSearch}
            title="No projects match your filters"
            description={search ? `Nothing found for "${search}".` : "Try a different status filter."}
            secondaryAction={{
              label: "Clear filters",
              onClick: () => {
                setSearch("");
                setStatusFilter("all");
              },
            }}
          />
        ) : viewMode === "grid" ? (
          <motion.div
            variants={gridVariants}
            initial={reduceMotion ? false : "hidden"}
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {visibleProjects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => navigate(`/build/${project.id}`)}
              />
            ))}
          </motion.div>
        ) : (
          <motion.ul
            variants={gridVariants}
            initial={reduceMotion ? false : "hidden"}
            animate="show"
            className="border-t border-border"
          >
            {visibleProjects.map(project => (
              <ProjectListRow
                key={project.id}
                project={project}
                onClick={() => navigate(`/build/${project.id}`)}
              />
            ))}
          </motion.ul>
        )}
      </motion.section>
    </div>
  );
}

type Project = MockProject;

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <motion.article variants={cardVariants}>
      <motion.button
        onClick={onClick}
        whileHover={{ y: -3 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="group w-full h-full text-left rounded-xl glass-strong overflow-hidden hover:border-ink/30 hover:shadow-[0_10px_28px_-16px_rgba(0,0,0,0.5)] transition-[border-color,box-shadow] motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
      >
        {/* Thumbnail — generated placeholder cover art until real per-project
            screenshots are wired up from the backend. Grayscale by default,
            revealed in color on hover; the blurred glow layer drifts to read
            as a looping video preview. */}
        <div className="relative h-28 border-b border-border-soft overflow-hidden">
          <div
            className="absolute inset-0 grayscale group-hover:grayscale-0 transition-[filter] duration-500"
            style={{ background: coverGradient(project.id) }}
            aria-hidden="true"
          />
          <div
            className="absolute -inset-6 opacity-0 group-hover:opacity-90 blur-2xl transition-opacity duration-500 animate-preview-drift"
            style={{ background: coverGlow(project.id) }}
            aria-hidden="true"
          />
          <div
            className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-panel/95 to-transparent"
            aria-hidden="true"
          />
          <span className="absolute bottom-2 right-2 flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide text-ink bg-base/50 backdrop-blur px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <Play size={8} aria-hidden="true" />
            preview
          </span>
        </div>

        <div className="p-5">
          {/* Name row */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <StatusDot live={project.live} />
              <span className="font-mono text-sm text-ink truncate">{project.name}</span>
            </div>
            <ArrowUpRight
              size={14}
              className="shrink-0 text-faint opacity-0 -translate-x-0.5 translate-y-0.5 group-hover:opacity-100 group-hover:translate-x-0 group-hover:translate-y-0 group-hover:text-ink transition-all motion-reduce:transition-none"
              aria-hidden="true"
            />
          </div>
          <p className="text-[11px] text-faint mb-4">
            {project.live ? "Live" : "Idle"} · built {project.lastBuilt}
          </p>

          {/* Description */}
          <p className="text-xs text-muted mb-5 leading-relaxed line-clamp-2">{project.description}</p>

          {/* Footer */}
          <div className="flex items-center justify-between">
            {/* Agent avatar cluster */}
            <div className="flex -space-x-1.5" aria-label="Agents involved">
              {project.agents.map(agentId => {
                const agent = agentById(agentId);
                if (!agent) return null;
                return (
                  <span
                    key={agentId}
                    title={agent.label}
                    className="w-5 h-5 rounded-full border-2 border-panel bg-panel-alt flex items-center justify-center text-[7px] font-bold text-ink"
                  >
                    {agent.label[0]}
                  </span>
                );
              })}
            </div>

            {/* QA score */}
            <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded-md border ${qaTone(project.qaScore)}`}>
              QA {Number.isFinite(project.qaScore) ? project.qaScore : "—"}
            </span>
          </div>
        </div>
      </motion.button>
    </motion.article>
  );
}

function ProjectListRow({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <motion.li variants={cardVariants} className="border-b border-border">
      <button
        type="button"
        onClick={onClick}
        className="group w-full text-left flex items-center justify-between gap-4 px-4 py-4 hover:bg-panel-alt transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ink/40"
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusDot live={project.live} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-ink truncate">{project.name}</span>
              <ArrowUpRight
                size={12}
                className="shrink-0 text-faint opacity-0 group-hover:opacity-100 group-hover:text-ink transition-opacity motion-reduce:transition-none"
                aria-hidden="true"
              />
            </div>
            <p className="text-xs text-muted truncate mt-0.5">
              {project.live ? "Live" : "Idle"} · built {project.lastBuilt} · {project.description}
            </p>
          </div>
        </div>
        <span className={`shrink-0 font-mono text-[11px] px-1.5 py-0.5 rounded-md border ${qaTone(project.qaScore)}`}>
          QA {Number.isFinite(project.qaScore) ? project.qaScore : "—"}
        </span>
      </button>
    </motion.li>
  );
}
