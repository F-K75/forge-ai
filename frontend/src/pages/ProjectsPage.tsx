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
import { AgentFleetGraph } from "../components/AgentFleetGraph";
import { PROJECTS, STARTERS, type Project as MockProject, CURRENT_USER } from "../lib/mockData";
import { getIcon } from "../lib/iconMap";
import { LIVE_MODE } from "../lib/env";
import { projectsApi } from "../lib/api";
import { formatRelativeTime } from "../lib/format";
import { coverGradient } from "../lib/coverArt";
import { coverageStats, ORG_ROLE_COUNT, PLAYBOOK_COUNT, PROMPT_TEMPLATE_COUNT } from "../lib/skillVisuals";
import { useAuthStore } from "../store/authStore";
import { useBuildStore } from "../store/buildStore";


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
  const { user } = useAuthStore();
  const name = LIVE_MODE ? user?.name ?? "" : CURRENT_USER.name;
  const plan = LIVE_MODE ? user?.plan ?? "free" : CURRENT_USER.plan;
  const creditsRemaining = LIVE_MODE
    ? user?.credits ?? 0
    : CURRENT_USER.creditsTotal - CURRENT_USER.creditsUsed;
  const canBuild = creditsRemaining > 0 || plan === "enterprise";

  const buildError = useBuildStore((s) => s.error);
  const clearBuildError = useBuildStore((s) => s.reset);

  useEffect(() => {
    if (!LIVE_MODE) return;
    let cancelled = false;
    projectsApi
      .list()
      .then((data: any[]) => {
        if (!cancelled) setLiveProjects(data.map(toDisplayProject));
      })
         .catch(() => {
           if (!cancelled)             toast.error("Unable to load projects");
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
        toast.error("Unable to create project");
     } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {/* Command deck */}
      <section
        aria-label="Launch a build"
        className="relative shrink-0 overflow-hidden rounded-apple-xl border border-outline bg-panel p-5 shadow-m3 md:p-7"
      >
        <div className="relative mx-auto max-w-3xl">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-accent">
                New build
              </p>
               <h2 className="mt-1 font-display text-[28px] font-semibold tracking-tight text-ink md:text-[32px]">
                 What do you want to build?
               </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="bb-chip bb-chip-selected">
                {skillStats.full} visuals
              </span>
              <span className="bb-chip">
                {ORG_ROLE_COUNT} roles
              </span>
              <span className="bb-chip">
                {PLAYBOOK_COUNT} playbooks
              </span>
            </div>
          </div>

          <label htmlFor="forge-spotlight" className="sr-only">
            Describe what to build
          </label>
          <div className="flex items-center gap-2 rounded-full border border-outline bg-panel-alt px-3 py-2 shadow-m3 transition focus-within:border-accent/40 focus-within:shadow-[0_0_0_4px_var(--state-focus)]">
            <ZapMark />
            <input
              id="forge-spotlight"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleBuild()}
              placeholder="Tell Forge what to build…"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[17px] font-medium text-ink placeholder:text-faint focus:outline-none"
            />
            <motion.button
              type="button"
              onClick={() => handleBuild()}
              disabled={creating}
              whileHover={reduceMotion ? undefined : { scale: 1.03 }}
              whileTap={reduceMotion ? undefined : { scale: 0.97 }}
              className="bb-btn bb-btn-primary h-11 disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
            >
              <Send size={14} aria-hidden="true" />
              {creating ? "Opening" : "Build"}
            </motion.button>
          </div>

          {!canBuild && (
            <p className="mt-2 text-xs text-warn">No credits remaining. Upgrade your plan to continue building.</p>
          )}

          {buildError && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-error/40 bg-error/10 p-3 text-sm text-error">
              <span className="mt-0.5 shrink-0">⚠</span>
              <span className="flex-1">{buildError}</span>
              <button
                type="button"
                onClick={() => { clearBuildError(); }}
                className="shrink-0 text-xs underline underline-offset-2"
              >
                Dismiss
              </button>
            </div>
          )}

          <div
            className="mt-4 flex flex-wrap items-center gap-2"
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
                  className="bb-chip cursor-pointer"
                >
                  <Icon size={13} aria-hidden="true" />
                  {starter.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => handleBuild("")}
              disabled={creating}
              className="bb-chip bb-chip-selected ml-auto cursor-pointer disabled:opacity-50"
            >
              <Plus size={13} aria-hidden="true" />
              Blank project
            </button>
          </div>
        </div>
      </section>

      <AgentFleetGraph embedded />

      {/* Project library */}
      <section aria-label="Project library" className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-outline px-4 py-3 md:px-8">
          <p className="mr-2 hidden text-caption font-medium uppercase tracking-[0.12em] text-accent sm:block">
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
              className="h-9 w-full rounded-full border border-transparent bg-panel-alt pl-8 pr-3 text-sm text-ink placeholder:text-faint transition-colors focus:border-outline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter by status"
            className="h-9 cursor-pointer rounded-full border border-transparent bg-panel-alt px-3 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <option value="all">All</option>
            <option value="live">Live</option>
            <option value="idle">Idle</option>
          </select>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-label="Sort by"
            className="h-9 cursor-pointer rounded-full border border-transparent bg-panel-alt px-3 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <option value="recent">Recent</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
          </select>
          <div className="flex shrink-0 gap-0.5 rounded-full bg-panel-alt p-0.5" role="group" aria-label="View mode">
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
                  "flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                  viewMode === key ? "bg-accent-soft text-accent" : "text-muted hover:text-ink",
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
              title="Your library is empty"
              description="Describe what you want to build above to create your first project."
            />
          ) : visibleProjects.length === 0 ? (
            <EmptyState
              icon={FolderSearch}
              title="No matches"
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
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-white"
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
