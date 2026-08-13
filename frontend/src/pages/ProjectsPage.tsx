import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Plus,
  Send,
  Sparkles,
  Folder,
  Play,
  Activity,
  Rocket,
  Layers,
  Bot,
  Zap,
  ShieldCheck,
  FolderOpen,
  Code2,
  Search,
  LayoutGrid,
  List,
  FolderSearch,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { LIVE_MODE } from "../lib/env";
import { projectsApi } from "../lib/api";
import { formatRelativeTime } from "../lib/format";
import { coverGradient } from "../lib/coverArt";
import { coverageStats, ORG_ROLE_COUNT, PLAYBOOK_COUNT, PROMPT_TEMPLATE_COUNT } from "../lib/skillVisuals";
import { EmptyState } from "../components/ui/EmptyState";
import { useAuthStore } from "../store/authStore";
import { useBuildStore } from "../store/buildStore";
import BrandLogo from "../components/BrandLogo";
import { motion, motionVariants, useReducedMotion, useCountUp } from "../lib/animations";
import { presets } from "../lib/animationPresets";


function toDisplayProject(raw: any): any {
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

const gridVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
  },
};

const SUGGESTIONS = [
  "Build a SaaS landing page with authentication",
  "Create a todo app with drag-and-drop",
  "Make a dashboard with charts and analytics",
  "Build a chat application with real-time messaging",
  "Create an e-commerce product page",
  "Build a blog with markdown support",
];

const HERO_STATS = [
  { icon: Layers, value: 48, suffix: "", label: "Projects" },
  { icon: Bot, value: 13, suffix: "", label: "AI Agents" },
  { icon: Zap, value: 18, suffix: "s", label: "Build Speed" },
  { icon: ShieldCheck, value: 99, suffix: "%", label: "Enterprise Ready" },
];

/* ------------------------------------------------------------------ */
/* Small building blocks                                                */
/* ------------------------------------------------------------------ */

function NumericUp({ value, suffix, className = "" }: { value: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useCountUp(ref, value, 900);
  return (
    <span className={className}>
      <span ref={ref} />
      {suffix}
    </span>
  );
}

function CountUpValue({ value, suffix, className = "" }: { value: number | string; suffix?: string; className?: string }) {
  if (typeof value === "number") {
    return <NumericUp value={value} suffix={suffix} className={className} />;
  }
  return (
    <span className={className}>
      {value}
      {suffix}
    </span>
  );
}

function StatCard({ icon: Icon, value, suffix, label }: { icon: LucideIcon; value: number; suffix: string; label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      variants={motionVariants.staggerItem}
      custom={0}
      className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 backdrop-blur-xl transition-all duration-200 hover:border-white/15 hover:bg-white/[0.04] hover:shadow-m3"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300"
        style={{
          opacity: hovered ? 0.08 : 0,
          background: "radial-gradient(ellipse 80% 80% at 50% 0%, rgb(var(--primary)), transparent 70%)",
        }}
      />
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-accent/10 text-accent">
          <Icon size={13} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="font-display text-base font-semibold leading-none text-ink">
            <CountUpValue value={value} suffix={suffix} />
          </div>
          <div className="mt-1 truncate text-[11px] leading-none text-muted">{label}</div>
        </div>
      </div>
    </motion.div>
  );
}

function AdditivePulse({ hue }: { hue: string }) {
  return (
    <>
      <div className="forge-pulse-ring" style={{ width: 80, height: 80, borderColor: `${hue}55`, animationDelay: "0s" }} />
      <div className="forge-pulse-ring" style={{ width: 80, height: 80, borderColor: `${hue}44`, animationDelay: "1s" }} />
      <div className="forge-pulse-ring" style={{ width: 80, height: 80, borderColor: `${hue}33`, animationDelay: "2s" }} />
    </>
  );
}

function ProjectVisual() {
  const hue = "#14B8A6";

  return (
    <div className="relative flex h-full min-h-[280px] items-center justify-center" aria-hidden="true">
      <div
        className="forge-glow-breathe absolute h-64 w-64 rounded-full blur-3xl"
        style={{ background: `radial-gradient(circle, ${hue}22 0%, transparent 65%)` }}
      />

      <div className="absolute flex items-center justify-center">
        <AdditivePulse hue={hue} />
      </div>

      <div className="forge-orbit h-48 w-48" style={{ animationDuration: "28s" }}>
        <div className="forge-orbit-dot" style={{ background: hue, boxShadow: `0 0 10px ${hue}80` }} />
      </div>
      <div
        className="forge-orbit h-64 w-64"
        style={{ animationDirection: "reverse", animationDuration: "38s", borderColor: `${hue}0D` }}
      >
        <div className="forge-orbit-dot" style={{ background: "#84CC16", boxShadow: "0 0 10px #84CC1680", top: "auto", bottom: -3 }} />
      </div>

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="relative z-10 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-panel/95 shadow-m3-2 backdrop-blur-xl"
      >
        <div className="absolute inset-0 rounded-3xl" style={{ background: `radial-gradient(circle at 50% 30%, ${hue}18, transparent 70%)` }} />
        <FolderOpen size={28} className="text-accent" />
        <span className="absolute -bottom-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-panel shadow-m3">
          <Activity size={13} className="text-accent" />
        </span>
      </motion.div>

      {[
        { left: "18%", top: "66%", size: 3, delay: "0s", duration: "5s" },
        { left: "78%", top: "58%", size: 2, delay: "0.8s", duration: "7s" },
        { left: "64%", top: "78%", size: 2.5, delay: "1.6s", duration: "6s" },
        { left: "28%", top: "24%", size: 2, delay: "2.4s", duration: "8s" },
        { left: "84%", top: "22%", size: 2.5, delay: "3.2s", duration: "5.5s" },
        { left: "12%", top: "40%", size: 2, delay: "4s", duration: "7s" },
      ].map((p, i) => (
        <span
          key={i}
          className="forge-particle"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
            background: i % 2 === 0 ? hue : "#84CC16",
            opacity: 0.35,
          }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/[0.08] bg-panel/80 px-3.5 py-1.5 backdrop-blur-xl"
      >
        <span className="forge-signal-dot h-1.5 w-1.5 rounded-full bg-ok" />
        <span className="whitespace-nowrap text-[11px] font-medium text-muted">
          Projects ready to build
        </span>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [liveProjects, setLiveProjects] = useState<any[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("icons");
  const reduceMotion = useReducedMotion();
  const { user } = useAuthStore();
  const name = LIVE_MODE ? user?.name ?? "" : "Builder";
  const plan = LIVE_MODE ? user?.plan ?? "free" : "free";
  const creditsRemaining = LIVE_MODE ? user?.credits ?? 0 : 100;
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
        if (!cancelled) toast.error("Unable to load projects");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const projects = useMemo(() => (LIVE_MODE ? liveProjects ?? [] : []), [liveProjects]);

  const visibleProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = projects.filter((p) => {
      if (statusFilter === "live" && !p.live) return false;
      if (statusFilter === "idle" && p.live) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.description || "").toLowerCase().includes(q)) {
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
    if (!trimmed) return;

    if (!LIVE_MODE) {
      navigate("/build/new", trimmed ? { state: { prompt: trimmed, template } } : undefined);
      return;
    }

    setCreating(true);
    try {
      const name = trimmed.slice(0, 60) || "Untitled project";
      const project = await projectsApi.create({ name, description: trimmed, template });
      navigate(`/build/${project.id}`, trimmed ? { state: { prompt: trimmed } } : undefined);
    } catch {
      toast.error("Unable to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      {/* Background layers */}
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div className="forge-bg-glow absolute inset-0" />
        <div className="forge-bg-grid absolute inset-0" />
        <div className="forge-bg-vignette absolute inset-0" />
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto px-4 pb-16 md:px-8">
          {/* ============ HERO SECTION ============ */}
          <section aria-label="Welcome" className="relative pt-6 md:pt-10">
            <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1.2fr_1fr]">
              {/* Left column */}
              <motion.div
                variants={motionVariants.staggerContainer}
                initial={reduceMotion ? false : "hidden"}
                animate="visible"
                className="min-w-0"
              >
                <motion.div variants={motionVariants.staggerItem} className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Sparkles size={13} aria-hidden="true" />
                  </span>
                  <span className="text-xs font-medium tracking-wide text-muted">
                    AI-Powered Product Building
                  </span>
                </motion.div>

                <motion.h1
                  variants={motionVariants.staggerItem}
                  className="mt-3 font-display text-3xl font-semibold leading-[1.08] tracking-tight text-ink md:text-[2.75rem]"
                >
                  Build{" "}
                  <span className="bg-gradient-to-r from-accent to-secondary bg-clip-text text-transparent">
                    Production Software
                  </span>
                </motion.h1>

                <motion.p
                  variants={motionVariants.staggerItem}
                  className="mt-3 text-[15px] leading-relaxed text-muted"
                >
                  Forge turns simple prompts into full project builds — architecture, code, QA, and deployment —
                  orchestrated by specialized AI agents working in parallel.
                </motion.p>

                {/* Stat cards */}
                <motion.div variants={motionVariants.staggerItem} className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {HERO_STATS.map((s) => (
                    <StatCard key={s.label} icon={s.icon} value={s.value} suffix={s.suffix} label={s.label} />
                  ))}
                </motion.div>
              </motion.div>

              {/* Right column — visual */}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="hidden lg:block"
              >
                <ProjectVisual />
              </motion.div>
            </div>
          </section>

          {/* ============ BUILD COMMAND ============ */}
          <section aria-label="Start a new build" className="mt-10">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="relative"
            >
              <div
                className="pointer-events-none absolute -inset-4 rounded-[28px] opacity-60 blur-2xl"
                style={{ background: "radial-gradient(ellipse 60% 60% at 50% 40%, rgb(var(--primary) / 0.1), transparent 70%)" }}
                aria-hidden="true"
              />

              <div className="apple-glass-strong relative rounded-2xl border border-white/[0.06] bg-white/[0.03] p-2 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]">
                <div className="flex items-center gap-2.5 px-2.5 py-1.5">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/25 to-accent/10 text-accent"
                    aria-hidden="true"
                  >
                    <Rocket size={17} />
                  </span>
                  <input
                    id="forge-spotlight"
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                    onKeyDown={(e) => e.key === "Enter" && handleBuild()}
                    placeholder="Describe what you want to build…"
                    className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-ink placeholder:text-faint focus:outline-none"
                    aria-label="Describe what you want to build"
                    aria-expanded={showSuggestions}
                    aria-controls="forge-suggestions"
                  />
                  <motion.button
                    onClick={() => handleBuild()}
                    disabled={creating || !prompt.trim()}
                    {...presets.button}
                    className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(20,184,166,0.45)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    <Send size={14} aria-hidden="true" />
                    {creating ? "Opening" : "Build"}
                  </motion.button>
                </div>
                <AnimatePresence>
                  {showSuggestions && (
                    <motion.div
                      id="forge-suggestions"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="relative z-50 px-2.5 pb-2"
                    >
                      <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                        Suggestions
                      </p>
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {SUGGESTIONS.map((suggestion) => (
                          <button
                            key={suggestion}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setPrompt(suggestion);
                              setShowSuggestions(false);
                            }}
                            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-sm text-ink transition-colors hover:border-accent/40 hover:bg-accent/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                              <Sparkles size={12} aria-hidden="true" />
                            </span>
                            <span className="truncate">{suggestion}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </section>

          {/* ============ PROJECT LIBRARY ============ */}
          <section aria-label="Project library" className="mt-6 flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/[0.06] px-4 py-2.5 md:px-8">
              <p className="mr-2 hidden text-caption font-semibold uppercase tracking-[0.12em] text-accent sm:block">
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
                  className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
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
      </div>
    </div>
  );
}

function ProjectIcon({
  project,
  onOpen,
}: {
  project: any;
  onOpen: () => void;
}) {
  return (
    <motion.div variants={itemVariants} className="flex justify-center">
      <button
        type="button"
        onClick={onOpen}
        onDoubleClick={onOpen}
        className="group flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 text-center transition-all hover:border-white/15 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 sm:w-60"
      >
        <span
          className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-[0_10px_28px_-16px_rgba(0,0,0,0.8)] transition-transform duration-200 group-hover:-translate-y-0.5 group-active:translate-y-0 motion-reduce:transition-none"
          style={{ background: coverGradient(project.id) }}
        >
          <Folder size={24} className="relative z-[1] text-ink/90 drop-shadow" aria-hidden="true" />
          <span className="absolute right-1.5 top-1.5">
            <StatusDot live={project.live} />
          </span>
        </span>
        <span className="w-full truncate text-[12px] font-medium leading-tight text-ink/90 group-hover:text-ink">
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
  project: any;
  onOpen: () => void;
}) {
  return (
    <motion.li variants={itemVariants}>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
      >
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10"
          style={{ background: coverGradient(project.id) }}
          aria-hidden="true"
        >
          <Folder size={18} className="text-ink/90" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <StatusDot live={project.live} />
            <span className="truncate text-sm font-medium text-ink">{project.name}</span>
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
