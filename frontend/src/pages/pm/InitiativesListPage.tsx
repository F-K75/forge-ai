import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Send,
  Rocket,
  Sparkles,
  Clock,
  Bot,
  Layers,
  Search,
  LayoutGrid,
  List,
  FolderSearch,
  Coins,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";
import { captureEvent } from "../../lib/analytics";
import { formatRelativeTime } from "../../lib/format";
import { coverGradient } from "../../lib/coverArt";
import { COLORS } from "../../lib/theme";
import { EmptyState, SkeletonCard } from "../../components/ui/EmptyState";
import { motion, motionVariants, useReducedMotion, useCountUp } from "../../lib/animations";
import { presets } from "../../lib/animationPresets";

/* ------------------------------------------------------------------ */
/* Types & constants                                                   */
/* ------------------------------------------------------------------ */

interface Initiative {
  id: string;
  name: string;
  description?: string;
  updated_at?: string;
  created_at?: string;
  status?: string;
  meta?: string[];
}

interface CreditPreview {
  cost: number;
  free_available: boolean;
  credits_remaining: number;
}

type InitiativeStatusFilter = "all" | "active" | "complete" | "failed";
type SortKey = "recent" | "name" | "status";
type ViewMode = "icons" | "list";

const STATUS_LABEL_MAP: Record<string, string> = {
  draft: "Draft",
  generating: "Planning",
  active: "Ready",
  completed: "Completed",
  archived: "Archived",
  failed: "Failed",
};

const STATUS_COLOR_MAP: Record<string, string> = {
  generating: COLORS.accent,
  active: COLORS.ok,
  completed: COLORS.ok,
  failed: COLORS.error,
  draft: COLORS.warn,
  archived: COLORS.muted,
};

const SUGGESTIONS = [
  "AI SaaS Platform",
  "CRM for Healthcare",
  "Marketplace",
  "Internal HR Tool",
  "Analytics Dashboard",
  "Developer Platform",
];

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

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function statusDotColor(status?: string): string {
  return status ? (STATUS_COLOR_MAP[status] ?? COLORS.muted) : COLORS.muted;
}

function toDisplayInitiative(raw: any): Initiative {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.vision,
    updated_at: raw.updated_at,
    created_at: raw.created_at,
    status: raw.status,
    meta: [raw.estimated_timeline, raw.project_ids?.length ? `${raw.project_ids.length} apps` : null].filter(Boolean) as string[],
  };
}

/* ------------------------------------------------------------------ */
/* Animated stat helpers (mirror ProjectsPage)                         */
/* ------------------------------------------------------------------ */

function NumericUp({ value, suffix, className = "" }: { value: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useCountUp(ref, value, 900)
  return (
    <span className={className}>
      <span ref={ref} />
      {suffix}
    </span>
  )
}

function CountUpValue({ value, suffix, className = "" }: { value: number | string; suffix?: string; className?: string }) {
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (typeof safeValue === "number") {
    return <NumericUp value={safeValue} suffix={suffix} className={className} />;
  }
  return (
    <span className={className}>
      {safeValue}
      {suffix}
    </span>
  );
}

function StatCard({ icon: Icon, value, suffix, label }: { icon: LucideIcon; value: number; suffix?: string; label: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      variants={motionVariants.staggerItem}
      custom={0}
      className="relative overflow-hidden rounded-2xl border border-inlay bg-inlay-subtle px-4 py-3 backdrop-blur-xl transition-all duration-200 hover:border-inlay-strong hover:bg-inlay-hover hover:shadow-m3"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300"
        style={{
          opacity: hovered ? 0.08 : 0,
          background: "radial-gradient(ellipse 80% 80% at 50% 0%, rgb(var(--primary)), transparent 70%)",
        }}
      />
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-inlay-strong bg-accent/10 text-accent">
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

/* ------------------------------------------------------------------ */
/* Initiative visual (mirror ProjectVisual)                           */
/* ------------------------------------------------------------------ */

function AdditivePulse({ hue }: { hue: string }) {
  return (
    <>
      <div className="forge-pulse-ring" style={{ width: "80px", height: "80px", borderColor: `${hue}55`, animationDelay: "0s" }} />
      <div className="forge-pulse-ring" style={{ width: "80px", height: "80px", borderColor: `${hue}44`, animationDelay: "1s" }} />
      <div className="forge-pulse-ring" style={{ width: "80px", height: "80px", borderColor: `${hue}33`, animationDelay: "2s" }} />
    </>
  );
}

function InitiativeVisual() {
  const hue = "#8B5CF6";

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
        <div
          className="forge-orbit-dot"
          style={{ background: "#FBBF24", boxShadow: "0 0 10px #FBBF2480", top: "auto", bottom: -3 }}
        />
      </div>

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="relative z-10 flex h-28 w-28 items-center justify-center rounded-3xl border border-inlay-strong shadow-m3-2 backdrop-blur-xl overflow-hidden"
      >
        <img
          src="/images/project-ready.jpg"
          alt="Initiatives ready to plan"
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-black/20 to-transparent" />
        <div className="absolute inset-0 rounded-3xl" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }} />
      </motion.div>

      {[
        { left: "18%", top: "66%", size: "3px", delay: "0s", duration: "5s" },
        { left: "78%", top: "58%", size: "2px", delay: "0.8s", duration: "7s" },
        { left: "64%", top: "78%", size: "2.5px", delay: "1.6s", duration: "6s" },
        { left: "28%", top: "24%", size: "2px", delay: "2.4s", duration: "8s" },
        { left: "84%", top: "22%", size: "2.5px", delay: "3.2s", duration: "5.5s" },
        { left: "12%", top: "40%", size: "2px", delay: "4s", duration: "7s" },
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
            background: i % 2 === 0 ? hue : "#FBBF24",
            opacity: 0.35,
          }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-2 border border-inlay bg-panel/80 px-3.5 py-1.5 backdrop-blur-xl"
      >
        <span className="forge-signal-dot h-1.5 w-1.5 rounded-full bg-ok" />
        <span className="whitespace-nowrap text-[11px] font-medium text-muted">
          Plans ready to execute
        </span>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status dot (mirror ProjectsPage StatusDot)                          */
/* ------------------------------------------------------------------ */

function StatusDot({ status }: { status?: string }) {
  const color = statusDotColor(status);
  const isLive = status === "generating";
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
      {isLive && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full motion-reduce:hidden"
          style={{ backgroundColor: `${color}60` }}
        />
      )}
      <span
        className="relative h-2 w-2 rounded-full"
        style={{
          backgroundColor: color,
          ...(isLive ? { boxShadow: "0 0 8px rgba(48,209,88,0.35)" } : {}),
        }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Forge signal (kept from existing page)                              */
/* ------------------------------------------------------------------ */

function ForgeSignal({ creating, label }: { creating: boolean; label?: string }) {
  const [status, setStatus] = useState<"ready" | "thinking" | "working" | "done">("ready");

  useEffect(() => {
    if (!creating) return;
    setStatus("thinking");
    const t1 = setTimeout(() => setStatus("working"), 1600);
    const t2 = setTimeout(() => setStatus("done"), 3200);
    const t3 = setTimeout(() => setStatus("ready"), 5200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [creating]);

  const dotColor =
    status === "ready" ? "bg-ok" :
    status === "thinking" ? "bg-warn" :
    status === "working" ? "bg-accent" : "bg-ok";

  const statusText =
    status === "ready" ? "● Ready" :
    status === "thinking" ? "● Thinking" :
    status === "working" ? "● Agents Active" : "● Completed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.3 }}
      className="flex items-center gap-2"
    >
      <span className="flex items-center gap-2">
        <span className={`forge-signal-dot h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-xs font-medium" style={{ color: dotColor === "bg-ok" ? "rgb(var(--success))" : dotColor === "bg-warn" ? "rgb(var(--warning))" : "rgb(var(--primary))" }}>
          {statusText}
        </span>
      </span>
      <span className="text-xs text-faint">{label ?? "Describe an idea above to activate the pipeline."}</span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Prompt input (kept from existing page, adapted)                     */
/* ------------------------------------------------------------------ */

function PromptInput({
  value,
  onChange,
  onKeyDown,
  placeholder,
  suggestions,
  creating,
  onSubmit,
  ctaLabel,
  CtaIcon = Send,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder: string;
  suggestions: string[];
  creating: boolean;
  onSubmit: () => void;
  ctaLabel: string;
  CtaIcon?: LucideIcon;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fillPrompt = useCallback((val: string) => {
    onChange(val);
    inputRef.current?.focus();
  }, [onChange]);

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute -inset-4 rounded-[28px] opacity-60 blur-2xl"
        style={{ background: "radial-gradient(ellipse 60% 60% at 50% 40%, rgb(var(--primary) / 0.1), transparent 70%)" }}
        aria-hidden="true"
      />
      <div className="apple-glass-strong relative rounded-2xl border border-inlay bg-inlay-subtle p-2 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-2.5 px-2.5 py-1.5">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/25 to-accent/10 text-accent"
            aria-hidden="true"
          >
            <Rocket size={17} />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-ink placeholder:text-faint focus:outline-none"
            aria-label={placeholder}
            aria-expanded={showSuggestions}
            aria-controls="forge-suggestions"
          />
          <button
            onClick={onSubmit}
            disabled={creating || !value.trim()}
            {...presets.button}
            className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(20,184,166,0.45)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <CtaIcon size={14} aria-hidden="true" />
            {creating ? "Working…" : ctaLabel}
          </button>
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
              <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Suggestions</p>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => fillPrompt(suggestion)}
                    className="flex items-center gap-2 rounded-xl border border-inlay-strong bg-inlay px-3 py-2 text-left text-sm text-ink transition-colors hover:border-accent/40 hover:bg-accent/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Library views (mirror ProjectsPage icon/list views)                 */
/* ------------------------------------------------------------------ */

function InitiativeIcon({
  initiative,
  onOpen,
}: {
  initiative: Initiative;
  onOpen: () => void;
}) {
  return (
    <motion.div variants={itemVariants} className="flex justify-center">
      <button
        type="button"
        onClick={onOpen}
        onDoubleClick={onOpen}
        className="group flex w-full cursor-pointer flex-col items-center gap-3 rounded-3xl border border-inlay bg-inlay-subtle p-4 text-center transition-all duration-300 hover:border-inlay-strong hover:bg-inlay-hover hover:shadow-m3-2 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40 sm:w-72"
      >
        <span
          className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-inlay-strong shadow-[0_20px_40px_-16px_rgba(0,0,0,0.9)] transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_24px_48px_-16px_rgba(0,0,0,0.95)] group-active:translate-y-0 motion-reduce:transition-none"
          style={{ background: coverGradient(initiative.id) }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-transparent" />
          <Layers size={28} className="relative z-[1] text-ink/90 drop-shadow-lg" aria-hidden="true" />
          <span className="absolute -right-1 -top-1">
            <StatusDot status={initiative.status} />
          </span>
        </span>
        <span className="w-full truncate text-[13px] font-semibold leading-tight text-ink/90 group-hover:text-ink">
          {initiative.name}
        </span>
      </button>
    </motion.div>
  );
}

function InitiativeListRow({
  initiative,
  onOpen,
}: {
  initiative: Initiative;
  onOpen: () => void;
}) {
  const displayLabel = STATUS_LABEL_MAP[initiative.status ?? "draft"];
  return (
    <motion.li variants={itemVariants}>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-inlay bg-inlay-subtle px-4 py-3 text-left transition-all duration-200 hover:border-inlay-strong hover:bg-inlay-hover hover:shadow-m3 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-inlay-strong shadow-[0_12px_28px_-12px_rgba(0,0,0,0.8)]"
          style={{ background: coverGradient(initiative.id) }}
          aria-hidden="true"
        >
          <Layers size={22} className="text-ink/90" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2.5">
            <StatusDot status={initiative.status} />
            <span className="truncate text-sm font-semibold text-ink">{initiative.name}</span>
          </span>
          <span className="mt-1 block truncate text-xs text-muted">
            {displayLabel} · {formatRelativeTime(initiative.updated_at ?? initiative.created_at)}
            {(initiative.meta?.length ?? 0) > 0 && (
              <>
                {" · "}
                {initiative.meta?.join(" · ")}
              </>
            )}
          </span>
        </span>
      </button>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function InitiativesListPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [initiatives, setInitiatives] = useState<Initiative[] | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<InitiativeStatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("icons");
  const [creditPreview, setCreditPreview] = useState<CreditPreview | null>(null);
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!LIVE_MODE) return;
    initiativesApi
      .list()
      .then((data: any[]) => setInitiatives(data.map(toDisplayInitiative)))
      .catch(() => toast.error("Failed to load initiatives"));
  };

  const loadCredits = useCallback(() => {
    if (!LIVE_MODE) return;
    initiativesApi
      .creditPreview()
      .then(setCreditPreview)
      .catch(() => {
        // Fail-open: credit status is informative, never a blocker.
      });
  }, []);

  useEffect(load, []);
  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  const totalInitiatives = initiatives?.length ?? 0;
  const activeCount = useMemo(() => (initiatives ?? []).filter((i) => i.status === "generating" || i.status === "active").length, [initiatives]);
  const completedCount = useMemo(() => (initiatives ?? []).filter((i) => i.status === "completed").length, [initiatives]);

  const stats = useMemo(() => [
    { icon: Layers, value: totalInitiatives, suffix: "", label: "Initiatives" },
    { icon: Bot, value: activeCount, suffix: "", label: "Active" },
    { icon: Clock, value: completedCount, suffix: "", label: "Completed" },
  ], [totalInitiatives, activeCount, completedCount]);

  const handleCreate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (!LIVE_MODE) {
      toast.error("Demo mode — connect a backend to use Initiatives");
      return;
    }
    setCreating(true);
    try {
      const initiative = await initiativesApi.create({ prompt: trimmed });
      captureEvent("initiative_created", { initiative_id: initiative.id });
      loadCredits();
      navigate(`/initiatives/${initiative.id}`);
    } catch (err: any) {
      if (err?.response?.status === 402) {
        loadCredits();
        toast.error(err?.response?.data?.detail || "Insufficient credits — add credits to keep planning.");
        setCreating(false);
        navigate("/billing");
        return;
      }
      toast.error("Failed to create initiative — your prompt is preserved, please retry.");
      setCreating(false);
    }
  };

  const visibleInitiatives = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (initiatives ?? []).filter((i) => {
      if (statusFilter === "active" && i.status !== "generating" && i.status !== "active") return false;
      if (statusFilter === "complete" && i.status !== "completed" && i.status !== "active") return false;
      if (statusFilter === "failed" && i.status !== "failed") return false;
      if (q && !i.name.toLowerCase().includes(q) && !(i.description || "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    if (sortKey === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (sortKey === "status") return [...filtered].sort((a, b) => (a.status || "").localeCompare(b.status || ""));
    return filtered;
  }, [initiatives, search, statusFilter, sortKey]);

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
                    AI-Powered Product Planning
                  </span>
                </motion.div>

                <motion.h1
                  variants={motionVariants.staggerItem}
                  className="mt-3 font-display text-3xl font-semibold leading-[1.08] tracking-tight text-ink md:text-[2.75rem]"
                >
                  Turn Ideas into{" "}
                  <span className="bg-gradient-to-r from-accent to-secondary bg-clip-text text-transparent">
                    Production
                  </span>
                </motion.h1>

                <motion.p
                  variants={motionVariants.staggerItem}
                  className="mt-3 text-[15px] leading-relaxed text-muted"
                >
                  Forge orchestrates specialized AI agents that transform a simple product idea into a complete production-ready execution plan.
                </motion.p>

                {/* Stat cards */}
                <motion.div variants={motionVariants.staggerItem} className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {stats.map((s) => (
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
                <InitiativeVisual />
              </motion.div>
            </div>
          </section>

          {/* ============ CREATE COMMAND ============ */}
          <section aria-label="Start a new initiative" className="mt-10">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="relative"
            >
              <PromptInput
                value={prompt}
                onChange={setPrompt}
                placeholder="Describe a product to plan end-to-end…"
                suggestions={SUGGESTIONS}
                creating={creating}
                onSubmit={handleCreate}
                ctaLabel="Generate plan"
                CtaIcon={Sparkles}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <div className="mt-2 flex justify-center">
                <ForgeSignal creating={creating} />
              </div>
              {creditPreview && (
                <div className="mt-3 flex flex-col items-center gap-2.5">
                  <span className="inline-flex items-center gap-1.5 border border-inlay bg-panel-alt px-3 py-1.5 text-xs text-muted">
                    <Coins size={12} className="text-accent" aria-hidden="true" />
                    {creditPreview.free_available
                      ? "First generation free"
                      : `${creditPreview.cost} credits per generation`}
                    <span className="text-faint" aria-hidden="true">·</span>
                    <span>{creditPreview.credits_remaining} credits remaining</span>
                  </span>
                  {!creditPreview.free_available &&
                    creditPreview.credits_remaining < creditPreview.cost && (
                      <div className="flex w-full max-w-xl flex-col items-center justify-between gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] px-4 py-3 sm:flex-row">
                        <p className="text-xs leading-relaxed text-muted">
                          <span className="font-semibold text-ink">Out of credits.</span>{" "}
                          Generations cost {creditPreview.cost} credits. Top up to keep planning.
                        </p>
                        <button
                          type="button"
                          onClick={() => navigate("/billing")}
                          {...presets.button}
                          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_24px_-12px_rgba(20,184,166,0.45)] transition-opacity hover:opacity-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                        >
                          <Coins size={12} aria-hidden="true" />
                          Get credits
                        </button>
                      </div>
                    )}
                </div>
              )}
            </motion.div>
          </section>

          {/* ============ INITIATIVES LIBRARY ============ */}
          <section aria-label="Initiatives library" className="mt-6 flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-inlay px-4 py-2.5 md:px-8">
              <p className="mr-2 hidden text-caption font-semibold uppercase tracking-[0.12em] text-accent sm:block">
                Initiatives
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
                  aria-label="Search initiatives"
                  className="h-9 w-full border border-transparent bg-panel-alt pl-8 pr-3 text-sm text-ink placeholder:text-faint transition-colors focus:border-outline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as InitiativeStatusFilter)}
                aria-label="Filter by status"
                className="h-9 cursor-pointer border border-transparent bg-panel-alt px-3 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="complete">Completed</option>
                <option value="failed">Failed</option>
              </select>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                aria-label="Sort by"
                className="h-9 cursor-pointer border border-transparent bg-panel-alt px-3 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                <option value="recent">Recent</option>
                <option value="name">Name</option>
                <option value="status">Status</option>
              </select>
              <div className="flex shrink-0 gap-0.5 bg-panel-alt p-0.5" role="group" aria-label="View mode">
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
                      "flex h-8 w-8 cursor-pointer items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                      viewMode === key ? "bg-accent-soft text-accent" : "text-muted hover:text-ink",
                    ].join(" ")}
                  >
                    <Icon size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-3 py-5 md:px-6 md:py-6">
              {!LIVE_MODE ? (
                <EmptyState icon={Rocket} title="Demo mode" description="Connect a backend (set VITE_WS_URL) to load and create initiatives." />
              ) : initiatives === null ? (
                <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-2">
                  <SkeletonCard count={4} />
                </div>
              ) : initiatives.length === 0 ? (
                <EmptyState
                  icon={Rocket}
                  title="No initiatives yet"
                  description="Describe an idea above to generate your first plan."
                  primaryAction={{
                    label: "Create your first initiative",
                    onClick: () => inputRef.current?.focus(),
                  }}
                />
              ) : visibleInitiatives.length === 0 ? (
                <EmptyState
                  icon={FolderSearch}
                  title="No matches"
                  description={search ? `No results for "${search}".` : "Try a different filter."}
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
                  className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                >
                  {visibleInitiatives.map((initiative) => (
                    <InitiativeIcon
                      key={initiative.id}
                      initiative={initiative}
                      onOpen={() => navigate(`/initiatives/${initiative.id}`)}
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
                  {visibleInitiatives.map((initiative) => (
                    <InitiativeListRow
                      key={initiative.id}
                      initiative={initiative}
                      onOpen={() => navigate(`/initiatives/${initiative.id}`)}
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
