import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Plus,
  Send,
  Search,
  LayoutGrid,
  List,
  FolderSearch,
  Folder,
  Play,
} from "lucide-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import { EmptyState } from "../components/ui/EmptyState";
import { AgentFleetStrip } from "../components/AgentFleetStrip";
import { PROJECTS, STARTERS, type Project as MockProject } from "../lib/mockData";
import { getIcon } from "../lib/iconMap";
import { LIVE_MODE } from "../lib/env";
import { projectsApi } from "../lib/api";
import { formatRelativeTime } from "../lib/format";
import { coverGradient } from "../lib/coverArt";
import { coverageStats, ORG_ROLE_COUNT, PLAYBOOK_COUNT, PROMPT_TEMPLATE_COUNT } from "../lib/skillVisuals";


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

type StatusFilter = "all" | "live" | "idle";
type SortKey = "recent" | "name" | "status";
type ViewMode = "icons" | "list";

function StatusDot({ live }: { live: boolean }) {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
      {live && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok/50 motion-reduce:hidden" />
      )}
      <span
        className={
          live
            ? "relative h-1.5 w-1.5 rounded-full bg-ok"
            : "relative h-1.5 w-1.5 rounded-full border border-faint bg-transparent"
        }
      />
    </span>
  );
}

const gridVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
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
  const [viewMode, setViewMode] = useState<ViewMode>("icons");
  const reduceMotion = useReducedMotion();
  const skillStats = coverageStats();

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

  const projects = useMemo(() => (LIVE_MODE ? liveProjects ?? [] : PROJECTS), [liveProjects]);

  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = projects.filter((p) => {
      if (statusFilter === "live" && !p.live) return false;
      if (statusFilter === "idle" && p.live) return false;
      if (q && !p.name.toLowerCase().includes(q) && !p.description.toLowerCase().includes(q)) {
        return false;
      }
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
    <div className="flex h-full min-h-0 flex-col">
      {/* Maximal command deck */}
      <section
        aria-label="Launch a build"
        className="relative shrink-0 overflow-hidden border-b-2 border-ember/25 px-4 py-5 md:px-8 md:py-7"
      >
        <div
          className="pointer-events-none absolute -right-8 -top-10 font-brand text-[7rem] font-extrabold uppercase leading-none tracking-tighter text-ember/[0.07] md:text-[9rem]"
          aria-hidden="true"
        >
          BUILD
        </div>
        <div className="relative mx-auto max-w-4xl">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-ember">
                Command deck
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold uppercase tracking-tight text-ink md:text-3xl">
                What do you want forged?
              </h2>
            </div>
            <div className="flex flex-wrap gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wide">
              <span className="border border-ember/40 bg-ember/15 px-2 py-1 text-ember">
                {skillStats.full} full visuals
              </span>
              <span className="border border-white/15 bg-black/30 px-2 py-1 text-muted">
                {ORG_ROLE_COUNT} org roles
              </span>
              <span className="border border-white/15 bg-black/30 px-2 py-1 text-muted">
                {PLAYBOOK_COUNT} playbooks
              </span>
              <span className="border border-white/15 bg-black/30 px-2 py-1 text-muted">
                {PROMPT_TEMPLATE_COUNT} prompts
              </span>
            </div>
          </div>

          <label htmlFor="forge-spotlight" className="sr-only">
            Describe what to build
          </label>
          <div className="os-spotlight flex items-center gap-2 rounded-xl border-2 border-white/20 bg-black/40 px-3 py-2 shadow-[0_0_40px_-18px_rgba(244,244,245,0.35)] focus-within:border-ink focus-within:shadow-[0_0_0_3px_rgba(212,212,216,0.15)] transition-[border-color,box-shadow] duration-200">
            <ZapMark />
            <input
              id="forge-spotlight"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBuild()}
              placeholder="Tell Forge what to build…"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base font-medium text-ink placeholder:text-faint focus:outline-none"
            />
            <motion.button
              type="button"
              onClick={() => handleBuild()}
              disabled={creating}
              whileHover={reduceMotion ? undefined : { scale: 1.03 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-ink px-5 text-sm font-bold uppercase tracking-wide text-base shadow-[0_10px_28px_-10px_rgba(244,244,245,0.55)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/50"
            >
              <Send size={14} aria-hidden="true" />
              {creating ? "Opening…" : "Build"}
            </motion.button>
          </div>

          <div
            className="mt-3 flex flex-wrap items-center gap-1.5"
            role="list"
            aria-label="Starter templates"
          >
            {STARTERS.slice(0, 5).map((starter) => {
              const Icon = getIcon(starter.iconName);
              return (
                <button
                  key={starter.label}
                  type="button"
                  role="listitem"
                  onClick={() => handleBuild(starter.label, starter.label)}
                  className="inline-flex cursor-pointer items-center gap-1.5 border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-ember/40 hover:bg-ember/10 hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/40"
                >
                  <Icon size={12} aria-hidden="true" />
                  {starter.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => handleBuild("")}
              disabled={creating}
              className="ml-auto inline-flex cursor-pointer items-center gap-1.5 border border-ember/40 bg-ember/10 px-2.5 py-1.5 text-xs font-bold uppercase tracking-wide text-ember transition-colors hover:bg-ember/20 focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/40 disabled:opacity-50"
            >
              <Plus size={12} aria-hidden="true" />
              Blank project
            </button>
          </div>
        </div>
      </section>

      <AgentFleetStrip />

      {/* Finder-style project library */}
      <section aria-label="Project library" className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-ember/15 px-4 py-3 md:px-8">
          <p className="mr-2 hidden font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-ember sm:block">
            Library
          </p>
          <div className="relative min-w-[160px] flex-1">
            <Search
              size={13}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search library…"
              aria-label="Search projects"
              className="h-9 w-full rounded-lg border border-transparent bg-white/[0.04] pl-8 pr-3 text-sm text-ink placeholder:text-faint transition-colors focus:border-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/40"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
            className="h-9 cursor-pointer rounded-lg border border-transparent bg-white/[0.04] px-2 text-xs text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/40"
          >
            <option value="all">All</option>
            <option value="live">Live</option>
            <option value="idle">Idle</option>
          </select>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort projects"
            className="h-9 cursor-pointer rounded-lg border border-transparent bg-white/[0.04] px-2 text-xs text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/40"
          >
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
          </select>
          <div className="flex shrink-0 gap-0.5 rounded-lg bg-white/[0.04] p-0.5" role="group" aria-label="View mode">
            {(
              [
                { key: "icons" as const, icon: LayoutGrid, label: "Icon view" },
                { key: "list" as const, icon: List, label: "List view" },
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setViewMode(key)}
                aria-label={label}
                aria-pressed={viewMode === key}
                className={[
                  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/40",
                  viewMode === key ? "bg-white/10 text-ink" : "text-muted hover:text-ink",
                ].join(" ")}
              >
                <Icon size={14} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-5 md:px-6 md:py-6">
          {projects.length === 0 ? (
            <EmptyState
              icon={Folder}
              title="Library is empty"
              description="Describe what you want to build above to create your first project."
            />
          ) : visibleProjects.length === 0 ? (
            <EmptyState
              icon={FolderSearch}
              title="Nothing matches"
              description={search ? `No results for “${search}”.` : "Try a different filter."}
              secondaryAction={{
                label: "Clear filters",
                onClick: () => {
                  setSearch("");
                  setStatusFilter("all");
                },
              }}
            />
          ) : viewMode === "icons" ? (
            <motion.div
              variants={gridVariants}
              initial={reduceMotion ? false : "hidden"}
              animate="show"
              className="mx-auto grid max-w-5xl grid-cols-3 gap-x-2 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
            >
              {visibleProjects.map((project) => (
                <ProjectIcon
                  key={project.id}
                  project={project}
                  onOpen={() => navigate(`/build/${project.id}`)}
                />
              ))}
            </motion.div>
          ) : (
            <motion.ul
              variants={gridVariants}
              initial={reduceMotion ? false : "hidden"}
              animate="show"
              className="mx-auto max-w-3xl"
            >
              {visibleProjects.map((project) => (
                <ProjectListRow
                  key={project.id}
                  project={project}
                  onOpen={() => navigate(`/build/${project.id}`)}
                />
              ))}
            </motion.ul>
          )}
        </div>
      </section>
    </div>
  );
}

function ZapMark() {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ink/25 to-muted/10 text-ink"
      aria-hidden="true"
    >
      <Play size={14} className="ml-0.5" />
    </span>
  );
}

function ProjectIcon({
  project,
  onOpen,
}: {
  project: MockProject;
  onOpen: () => void;
}) {
  return (
    <motion.div variants={itemVariants} className="flex justify-center">
      <button
        type="button"
        onClick={onOpen}
        onDoubleClick={onOpen}
        className="group flex w-[5.5rem] cursor-pointer flex-col items-center gap-2 rounded-xl p-2 text-center transition-colors hover:bg-white/[0.05] focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/40 sm:w-24"
      >
        <span
          className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-[0_10px_28px_-16px_rgba(0,0,0,0.8)] transition-transform duration-200 group-hover:-translate-y-0.5 group-active:translate-y-0 motion-reduce:transition-none"
          style={{ background: coverGradient(project.id) }}
        >
          <Folder size={22} className="relative z-[1] text-ink/90 drop-shadow" aria-hidden="true" />
          <span className="absolute right-1.5 top-1.5">
            <StatusDot live={project.live} />
          </span>
        </span>
        <span className="w-full truncate text-[11px] leading-tight text-ink/90 group-hover:text-ink">
          {project.name}
        </span>
      </button>
    </motion.div>
  );
}

function ProjectListRow({
  project,
  onOpen,
}: {
  project: MockProject;
  onOpen: () => void;
}) {
  return (
    <motion.li variants={itemVariants}>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/40"
      >
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10"
          style={{ background: coverGradient(project.id) }}
          aria-hidden="true"
        >
          <Folder size={15} className="text-ink/90" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <StatusDot live={project.live} />
            <span className="truncate text-sm text-ink">{project.name}</span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {project.live ? "Live" : "Idle"} · {project.lastBuilt}
            {project.description ? ` · ${project.description}` : ""}
          </span>
        </span>
      </button>
    </motion.li>
  );
}
