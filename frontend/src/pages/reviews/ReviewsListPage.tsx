import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Send,
  ShieldCheck,
  Bot,
  Clock,
  Layers,
  Search,
  LayoutGrid,
  List,
  FolderSearch,
  Code2,
  FolderGit2,
  Bug,
  type LucideIcon,
} from "lucide-react";

import { AnimatePresence } from "motion/react";
import { LIVE_MODE } from "../../lib/env";
import { reviewsApi } from "../../lib/orchestratorApi";
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

interface ReviewRunSummary {
  run_id: string;
  created_at: string;
  repo_path: string;
  mode: "full" | "diff";
  status: "pending" | "running" | "consolidating" | "complete" | "failed";
  triggered_agents: string[];
  consolidated?: { overall_score: number; recommendation: string } | null;
}

type StatusFilter = "all" | "active" | "complete" | "failed";
type SortKey = "recent" | "name" | "status";
type ViewMode = "icons" | "list";

const STATUS_LABEL_MAP: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  consolidating: "Consolidating",
  complete: "Complete",
  failed: "Failed",
};

const STATUS_COLOR_MAP: Record<string, string> = {
  pending: COLORS.muted,
  running: COLORS.accent,
  consolidating: COLORS.accent,
  complete: COLORS.ok,
  failed: COLORS.error,
};

const REVIEW_STATUS_LIVE = new Set(["running", "consolidating"]);

const SUGGESTIONS = [
  "/workspaces/forge-ai",
  "github.com/forge-ai/forge",
  "/home/user/my-app",
  "git@example.com:org/repo.git",
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

/* ------------------------------------------------------------------ */
/* Animated stat helpers (mirror ProjectsPage)                         */
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
  const safeValue = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return <NumericUp value={safeValue} suffix={suffix} className={className} />;
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
/* Review visual (mirror ProjectVisual / InitiativeVisual)             */
/* ------------------------------------------------------------------ */

function AdditivePulse({ hue }: { hue: string }) {
  return (
    <>
      <div className="forge-pulse-ring" style={{ width: 80, height: 80, borderColor: `${hue}55`, animationDelay: "0s" }} />
      <div className="forge-pulse-ring" style={{ width: 80, height: 80, borderColor: `${hue}44`, animationDelay: "1s" }} />
      <div className="forge-pulse-ring" style={{ width: 80, height: 80, borderColor: `${hue}33`, animationDelay: "2s" }} />
    </>
  );
}

function ReviewVisual() {
  const hue = COLORS.accent;

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
          style={{ background: COLORS.warn, boxShadow: `0 0 10px ${COLORS.warn}80`, top: "auto", bottom: -3 }}
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
          alt="Reviews ready to run"
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
            background: i % 2 === 0 ? hue : COLORS.warn,
            opacity: 0.35,
          }}
        />
      ))}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-inlay bg-panel/80 px-3.5 py-1.5 backdrop-blur-xl"
      >
        <span className="forge-signal-dot h-1.5 w-1.5 rounded-full bg-ok" />
        <span className="whitespace-nowrap text-[11px] font-medium text-muted">
          Reviews ready to run
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
  const isLive = status ? REVIEW_STATUS_LIVE.has(status) : false;
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
          ...(isLive ? { boxShadow: `0 0 8px ${color}34` } : {}),
        }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Forge signal (mirror InitiativesListPage)                           */
/* ------------------------------------------------------------------ */

function ForgeSignal({ creating, label }: { creating: boolean; label?: string }) {
  const [status, setStatus] = useState<"ready" | "thinking" | "working" | "done">("ready");

  useEffect(() => {
    if (!creating) return;
    setStatus("thinking");
    const t1 = setTimeout(() => setStatus("working"), 1600);
    const t2 = setTimeout(() => setStatus("done"), 3200);
    const t3 = setTimeout(() => setStatus("ready"), 5200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [creating]);

  const dotColor =
    status === "ready"
      ? "bg-ok"
      : status === "thinking"
        ? "bg-warn"
        : status === "working"
          ? "bg-accent"
          : "bg-ok";

  const statusText =
    status === "ready"
      ? "● Ready"
      : status === "thinking"
        ? "● Thinking"
        : status === "working"
          ? "● Agents Active"
          : "● Completed";

  const labelColor =
    status === "ready"
      ? "rgb(var(--success))"
      : status === "thinking"
        ? "rgb(var(--warning))"
        : status === "working"
          ? "rgb(var(--primary))"
          : "rgb(var(--success))";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6, duration: 0.3 }}
      className="flex items-center gap-2"
    >
      <span className="flex items-center gap-2">
        <span className={`forge-signal-dot h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-xs font-medium" style={{ color: labelColor }}>
          {statusText}
        </span>
      </span>
      <span className="text-xs text-faint">{label ?? "Describe a repo above to activate the review pipeline."}</span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Spotlight create input (mirror PromptInput / ProjectsPage input)    */
/* ------------------------------------------------------------------ */

function ReviewSpotlight({
  repoPath,
  setRepoPath,
  mode,
  setMode,
  diff,
  setDiff,
  creating,
  onStart,
}: {
  repoPath: string;
  setRepoPath: (value: string) => void;
  mode: "full" | "diff";
  setMode: (value: "full" | "diff") => void;
  diff: string;
  setDiff: (value: string) => void;
  creating: boolean;
  onStart: () => void;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fillRepo = useCallback(
    (val: string) => {
      setRepoPath(val);
      inputRef.current?.focus();
    },
    [setRepoPath]
  );

  const canStart = () => {
    if (!repoPath.trim()) return false;
    if (mode === "diff" && !diff.trim()) return false;
    return true;
  };

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
            <ShieldCheck size={17} />
          </span>
          <input
            ref={inputRef}
            id="forge-review-spotlight"
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={(e) => e.key === "Enter" && !creating && canStart() && onStart()}
            placeholder="Enter a repo path to review…"
            disabled={creating}
            className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-ink placeholder:text-faint focus:outline-none disabled:opacity-60"
            aria-label="Repo path"
            aria-expanded={showSuggestions}
            aria-controls="forge-review-suggestions"
          />
          <div className="flex gap-1">
            {(["full", "diff"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={[
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  mode === m
                    ? "bg-accent/15 text-accent border border-accent/40"
                    : "text-muted hover:text-ink border border-transparent hover:border-inlay-strong",
                ].join(" ")}
              >
                {m === "full" ? "Full review" : "Diff"}
              </button>
            ))}
          </div>
          <motion.button
            onClick={onStart}
            disabled={creating || !canStart()}
            {...presets.button}
            className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(20,184,166,0.45)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <Send size={14} aria-hidden="true" />
            {creating ? "Starting…" : "Start review"}
          </motion.button>
        </div>
        <AnimatePresence>
          {showSuggestions && (
            <motion.div
              id="forge-review-suggestions"
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
                    onClick={() => fillRepo(suggestion)}
                    className="flex items-center gap-2 rounded-xl border border-inlay-strong bg-inlay px-3 py-2 text-left text-sm text-ink transition-colors hover:border-accent/40 hover:bg-accent/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <FolderGit2 size={12} aria-hidden="true" />
                    </span>
                    <span className="truncate">{suggestion}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {mode === "diff" && (
          <div className="px-2.5 pb-2">
            <label
              htmlFor="review-diff"
              className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted"
            >
              Diff
            </label>
            <textarea
              id="review-diff"
              value={diff}
              onChange={(e) => setDiff(e.target.value)}
              rows={6}
              placeholder="Paste a unified diff…"
              disabled={creating}
              className="w-full rounded-xl border border-inlay bg-panel-alt px-3 py-3 font-mono text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 disabled:opacity-60"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Library views (mirror ProjectsPage icon/list views)                 */
/* ------------------------------------------------------------------ */

function ReviewIcon({ review, onOpen }: { review: ReviewRunSummary; onOpen: () => void }) {
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
          style={{ background: coverGradient(review.run_id) }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-transparent" />
          <Code2 size={28} className="relative z-[1] text-ink/90 drop-shadow-lg" aria-hidden="true" />
          <span className="absolute -right-1 -top-1">
            <StatusDot status={review.status} />
          </span>
        </span>
        <span className="w-full truncate text-[13px] font-semibold leading-tight text-ink/90 group-hover:text-ink">
          {review.repo_path}
        </span>
      </button>
    </motion.div>
  );
}

function ReviewListRow({ review, onOpen }: { review: ReviewRunSummary; onOpen: () => void }) {
  const displayLabel = STATUS_LABEL_MAP[review.status] ?? review.status;
  return (
    <motion.li variants={itemVariants}>
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full cursor-pointer items-center gap-4 rounded-2xl border border-inlay bg-inlay-subtle px-4 py-3 text-left transition-all duration-200 hover:border-inlay-strong hover:bg-inlay-hover hover:shadow-m3 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent/40"
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-inlay-strong shadow-[0_12px_28px_-12px_rgba(0,0,0,0.8)]"
          style={{ background: coverGradient(review.run_id) }}
          aria-hidden="true"
        >
          <Code2 size={22} className="text-ink/90" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2.5">
            <StatusDot status={review.status} />
            <span className="truncate text-sm font-semibold text-ink">{review.repo_path}</span>
          </span>
          <span className="mt-1 block truncate text-xs text-muted">
            {displayLabel} · {review.mode} · {formatRelativeTime(review.created_at)} · {review.triggered_agents.length} agent
            {review.triggered_agents.length === 1 ? "" : "s"}
          </span>
        </span>
        {review.consolidated && (
          <span className="shrink-0 font-mono text-xs text-muted">score {review.consolidated.overall_score}</span>
        )}
      </button>
    </motion.li>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ReviewsListPage() {
  const navigate = useNavigate();
  const [repoPath, setRepoPath] = useState("/workspaces/forge-ai");
  const [mode, setMode] = useState<"full" | "diff">("full");
  const [diff, setDiff] = useState("");
  const [runs, setRuns] = useState<ReviewRunSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [viewMode, setViewMode] = useState<ViewMode>("icons");
  const reduceMotion = useReducedMotion();

  const load = () => {
    reviewsApi
      .list()
      .then((data: { items: ReviewRunSummary[] }) => setRuns(data.items ?? []))
      .catch(() => toast.error("Couldn't load reviews. Please try again."));
  };

  useEffect(() => {
    load();
  }, []);

  const totalRuns = runs?.length ?? 0;
  const runningCount = useMemo(
    () => (runs ?? []).filter((r) => r.status === "running" || r.status === "consolidating" || r.status === "pending").length,
    [runs]
  );
  const completeCount = useMemo(() => (runs ?? []).filter((r) => r.status === "complete").length, [runs]);
  const failedCount = useMemo(() => (runs ?? []).filter((r) => r.status === "failed").length, [runs]);

  const stats = useMemo(
    () => [
      { icon: Layers, value: totalRuns, suffix: "", label: "Total runs" },
      { icon: Bot, value: runningCount, suffix: "", label: "Running" },
      { icon: Clock, value: completeCount, suffix: "", label: "Complete" },
      { icon: Bug, value: failedCount, suffix: "", label: "Failed" },
    ],
    [totalRuns, runningCount, completeCount, failedCount]
  );

  const handleCreate = async () => {
    const trimmedPath = repoPath.trim();
    if (!trimmedPath) {
      toast.error("Enter a repo path to start a review");
      return;
    }
    if (mode === "diff" && !diff.trim()) {
      toast.error("Diff mode needs a non-empty diff");
      return;
    }

    if (!LIVE_MODE) {
      toast.error("Demo mode — connect a backend to start reviews");
      return;
    }

    setCreating(true);
    try {
      const res = await reviewsApi.create({
        repo_path: trimmedPath,
        mode,
        diff: mode === "diff" ? diff : undefined,
      });
      captureEvent("review_started", { mode, run_id: res.run_id });
      navigate(`/reviews/${res.run_id}`);
    } catch {
      toast.error("Couldn't start the review. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const visibleRuns = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (runs ?? []).filter((r) => {
      if (statusFilter === "active" && !["running", "consolidating", "pending"].includes(r.status)) return false;
      if (statusFilter === "complete" && r.status !== "complete") return false;
      if (statusFilter === "failed" && r.status !== "failed") return false;
      if (q && !r.repo_path.toLowerCase().includes(q)) return false;
      return true;
    });
    if (sortKey === "name") return [...filtered].sort((a, b) => a.repo_path.localeCompare(b.repo_path));
    if (sortKey === "status") return [...filtered].sort((a, b) => a.status.localeCompare(b.status));
    return filtered;
  }, [runs, search, statusFilter, sortKey]);

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
                    <ShieldCheck size={13} aria-hidden="true" />
                  </span>
                  <span className="text-xs font-medium tracking-wide text-muted">AI-Powered Code Review</span>
                </motion.div>

                <motion.h1
                  variants={motionVariants.staggerItem}
                  className="mt-3 font-display text-3xl font-semibold leading-[1.08] tracking-tight text-ink md:text-[2.75rem]"
                >
                  Audit{" "}
                  <span className="bg-gradient-to-r from-accent to-secondary bg-clip-text text-transparent">
                    Production Code
                  </span>
                </motion.h1>

                <motion.p variants={motionVariants.staggerItem} className="mt-3 text-[15px] leading-relaxed text-muted">
                  Multi-agent code review — audits a repo snapshot and produces a prioritized backlog. Read-only: it never
                  edits, commits, or deploys.
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
                <ReviewVisual />
              </motion.div>
            </div>
          </section>

          {/* ============ START A REVIEW ============ */}
          <section aria-label="Start a new review" className="mt-10">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="relative"
            >
              <ReviewSpotlight
                repoPath={repoPath}
                setRepoPath={setRepoPath}
                mode={mode}
                setMode={setMode}
                diff={diff}
                setDiff={setDiff}
                creating={creating}
                onStart={handleCreate}
              />
              <div className="mt-2 flex justify-center">
                <ForgeSignal creating={creating} />
              </div>
            </motion.div>
          </section>

          {/* ============ REVIEW LIBRARY ============ */}
          <section aria-label="Review library" className="mt-6 flex min-h-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-inlay px-4 py-2.5 md:px-8">
              <p className="mr-2 hidden text-caption font-semibold uppercase tracking-[0.12em] text-accent sm:block">
                Reviews
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
                  aria-label="Search reviews"
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
                <option value="active">Active</option>
                <option value="complete">Completed</option>
                <option value="failed">Failed</option>
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
                {([
                  { key: "icons" as const, icon: LayoutGrid, label: "Icon view" },
                  { key: "list" as const, icon: List, label: "List view" },
                ]).map(({ key, icon: Icon, label }) => (
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
              {!LIVE_MODE ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="Demo mode"
                  description="Connect a backend (set VITE_WS_URL) to load and create reviews."
                />
              ) : runs === null ? (
                <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-2">
                  <SkeletonCard count={4} />
                </div>
              ) : runs.length === 0 ? (
                <EmptyState
                  icon={ShieldCheck}
                  title="No review runs yet"
                  description="Start one above to review a repo snapshot."
                  primaryAction={{ label: creating ? "Starting…" : "Start review", onClick: handleCreate }}
                />
              ) : visibleRuns.length === 0 ? (
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
                  {visibleRuns.map((review) => (
                    <ReviewIcon key={review.run_id} review={review} onOpen={() => navigate(`/reviews/${review.run_id}`)} />
                  ))}
                </motion.div>
              ) : (
                <motion.ul
                  variants={gridVariants}
                  initial={reduceMotion ? false : "hidden"}
                  animate="show"
                  className="mx-auto max-w-3xl"
                >
                  {visibleRuns.map((review) => (
                    <ReviewListRow
                      key={review.run_id}
                      review={review}
                      onOpen={() => navigate(`/reviews/${review.run_id}`)}
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
