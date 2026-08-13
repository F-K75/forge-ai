import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Send,
  Loader2,
  Rocket,
  Sparkles,
  Clock,
  FolderOpen,
  Bot,
  Activity,
  Plus,
  Layers,
  LineChart,
  Workflow,
  Network,
  Store,
  HeartPulse,
  Building2,
  Briefcase,
  Code2,
  KeyRound,
  Search,
  LayoutGrid,
  List,
  FolderSearch,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence } from "motion/react";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";
import { projectsApi } from "../../lib/api";
import { captureEvent } from "../../lib/analytics";
import { formatRelativeTime } from "../../lib/format";
import { fontSize, radius, colorTokens } from "../../lib/designTokens";
import { StatusPill } from "../../components/StatusPill";
import { Card, Button, Heading } from "../../components/ui";
import { EmptyState, SkeletonCard } from "../../components/ui/EmptyState";
import { motion, motionVariants, useReducedMotion, useCountUp } from "../../lib/animations";
import { presets } from "../../lib/animationPresets";

/* ------------------------------------------------------------------ */
/* Shared types                                                         */
/* ------------------------------------------------------------------ */

interface Item {
  id: string;
  name: string;
  description?: string;
  updated_at?: string;
  created_at?: string;
  status?: string;
  meta?: string[];
}

interface PageShellProps {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaIcon?: LucideIcon;
  placeholder: string;
  suggestions: string[];
  onCreate: (prompt: string) => void;
  creating: boolean;
  stats: { icon: LucideIcon; value: number | string; suffix?: string; label: string }[];
  children: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/* Shared building blocks                                               */
/* ------------------------------------------------------------------ */

function StatCard({ icon: Icon, value, suffix, label }: { icon: LucideIcon; value: number | string; suffix?: string; label: string }) {
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
            {value}{suffix}
          </div>
          <div className="mt-1 truncate text-[11px] leading-none text-muted">{label}</div>
        </div>
      </div>
    </motion.div>
  );
}

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
      <div className="pointer-events-none absolute -inset-4 rounded-[28px] opacity-60 blur-2xl"
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
    </div>
  );
}

function ItemCard({ item, onOpen, status }: { item: Item; onOpen: () => void; status?: "complete" | "running" | "failed" | "pending" }) {
  return (
    <motion.div variants={motionVariants.staggerItem}>
      <Card variant="content" className="group overflow-hidden p-0 transition-colors hover:border-accent/30">
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full cursor-pointer items-start gap-4 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span
            className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-accent/10 text-accent"
            aria-hidden="true"
          >
            <Rocket size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate font-display font-semibold text-ink" style={{ fontSize: fontSize.bodyLg }}>
                  {item.name}
                </span>
                {status && <StatusPill status={status} />}
              </span>
              <Clock size={14} className="shrink-0 text-muted" aria-hidden="true" />
            </span>
            <span className="mt-1 block line-clamp-2 text-sm leading-relaxed text-muted">
              {item.description || "No description provided"}
            </span>
            <span className="mt-3 flex flex-wrap items-center gap-2 text-faint" style={{ fontSize: fontSize.label }}>
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {formatRelativeTime(item.updated_at ?? item.created_at)}
              </span>
              {(item.meta?.length ?? 0) > 0 && <span aria-hidden="true">·</span>}
              {(item.meta ?? []).map((part) => (
                <span key={part} className="flex items-center gap-1">{part}</span>
              ))}
            </span>
          </span>
        </button>
      </Card>
    </motion.div>
  );
}

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
/* Page shell                                                          */
/* ------------------------------------------------------------------ */

export function PageShell({
  eyebrow,
  title,
  description,
  ctaLabel,
  placeholder,
  suggestions,
  onCreate,
  creating,
  stats,
  children,
}: PageShellProps) {
  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden="true">
        <div className="forge-bg-glow absolute inset-0" />
        <div className="forge-bg-grid absolute inset-0" />
        <div className="forge-bg-vignette absolute inset-0" />
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto px-4 pb-16 md:px-8">
          <section aria-label="Welcome" className="relative pt-6 md:pt-10">
            <motion.div
              variants={motionVariants.staggerContainer}
              initial="hidden"
              animate="visible"
              className="min-w-0"
            >
              <motion.div variants={motionVariants.staggerItem} className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Sparkles size={13} aria-hidden="true" />
                </span>
                <span className="text-xs font-medium tracking-wide text-muted">{eyebrow}</span>
              </motion.div>

              <motion.h1 variants={motionVariants.staggerItem} className="mt-3 font-display text-3xl font-semibold leading-[1.08] tracking-tight text-ink md:text-4xl">
                {title}
              </motion.h1>
              <motion.p variants={motionVariants.staggerItem} className="mt-3 text-[15px] leading-relaxed text-muted">
                {description}
              </motion.p>

              <motion.div variants={motionVariants.staggerItem} className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {stats.map((s) => (
                  <StatCard key={s.label} icon={s.icon} value={s.value} suffix={s.suffix} label={s.label} />
                ))}
              </motion.div>
            </motion.div>
          </section>

          <section aria-label="Create" className="mt-10">
            <PromptInput
              value=""
              onChange={() => {}}
              placeholder={placeholder}
              suggestions={suggestions}
              creating={creating}
              onSubmit={onCreate}
              ctaLabel={ctaLabel}
            />
            <div className="mt-2 flex justify-center">
              <ForgeSignal creating={creating} />
            </div>
          </section>

          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Initiatives page                                                     */
/* ------------------------------------------------------------------ */

export default function InitiativesListPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [initiatives, setInitiatives] = useState<Item[] | null>(null);
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!LIVE_MODE) return;
    initiativesApi
      .list()
      .then((data: any[]) => setInitiatives(data.map((i: any) => ({
        id: i.id,
        name: i.name,
        description: i.vision,
        updated_at: i.updated_at,
        created_at: i.created_at,
        status: i.status,
        meta: [i.estimated_timeline, i.project_ids?.length ? `${i.project_ids.length} apps` : null].filter(Boolean) as string[],
      }))))
      .catch(() => toast.error("Failed to load initiatives"));
  };

  useEffect(load, []);

  const totalInitiatives = initiatives?.length ?? 0;
  const activeCount = useMemo(() => (initiatives ?? []).filter((i) => i.status === "generating" || i.status === "active").length, [initiatives]);
  const completedCount = useMemo(() => (initiatives ?? []).filter((i) => i.status === "completed").length, [initiatives]);

  const stats = useMemo(() => [
    { icon: Layers, value: totalInitiatives, label: "Initiatives" },
    { icon: Bot, value: activeCount, label: "Active" },
    { icon: Clock, value: completedCount, label: "Completed" },
  ], [totalInitiatives, activeCount, completedCount]);

  const handleCreate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    if (!LIVE_MODE) {
      toast.error("Connect a backend (VITE_WS_URL) to use Initiatives");
      return;
    }
    setCreating(true);
    try {
      const initiative = await initiativesApi.create({ prompt: trimmed });
      captureEvent("initiative_created", { initiative_id: initiative.id });
      navigate(`/initiatives/${initiative.id}`);
    } catch {
      toast.error("Failed to create initiative — your prompt is preserved, please retry.");
      setCreating(false);
    }
  };

  return (
    <PageShell
      eyebrow="AI-Powered Product Planning"
      title="Turn Ideas into Production"
      description="Forge orchestrates specialized AI agents that transform a simple product idea into a complete production-ready execution plan."
      ctaLabel="Generate"
      placeholder="Describe a product to plan end-to-end…"
      suggestions={[
        "AI SaaS Platform",
        "CRM for Healthcare",
        "Marketplace",
        "Internal HR Tool",
        "Analytics Dashboard",
        "Developer Platform",
      ]}
      onCreate={handleCreate}
      creating={creating}
      stats={stats}
    >
      <section aria-label="Existing initiatives" className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <FolderOpen size={12} aria-hidden="true" />
            </span>
            <Heading level="h3">Your Initiatives</Heading>
            {activeCount > 0 && (
              <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                {activeCount} active
              </span>
            )}
          </div>
        </div>

        {!LIVE_MODE ? (
          <Card variant="empty-state" className="p-0">
            <EmptyState icon={Rocket} title="Connect a backend" description="Set VITE_WS_URL to load and create initiatives." />
          </Card>
        ) : initiatives === null ? (
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-2">
            <SkeletonCard count={4} />
          </div>
        ) : initiatives.length === 0 ? (
          <Card variant="empty-state" className="p-0">
            <EmptyState
              icon={Rocket}
              title="No initiatives yet"
              description="Describe an idea above to generate your first plan."
              primaryAction={{
                label: "Create your first initiative",
                onClick: () => inputRef.current?.focus(),
              }}
            />
          </Card>
        ) : (
          <motion.div
            variants={motionVariants.staggerContainer}
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
            className="space-y-2"
          >
            {initiatives.map((initiative, i) => (
              <ItemCard
                key={initiative.id}
                item={initiative}
                status={STATUS_MAP[initiative.status] ?? "pending"}
                onOpen={() => navigate(`/initiatives/${initiative.id}`)}
              />
            ))}
          </motion.div>
        )}
      </section>
    </PageShell>
  );
}

const STATUS_MAP: Record<string, "complete" | "running" | "failed" | "pending"> = {
  draft: "pending",
  generating: "running",
  active: "complete",
  completed: "complete",
  archived: "pending",
  failed: "failed",
};
