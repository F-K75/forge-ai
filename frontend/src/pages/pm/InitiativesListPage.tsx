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
  type LucideIcon,
} from "lucide-react";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";
import { captureEvent } from "../../lib/analytics";
import { formatRelativeTime } from "../../lib/format";
import { fontSize, radius, colorTokens } from "../../lib/designTokens";
import { StatusPill } from "../../components/StatusPill";
import { Card, Button, Heading } from "../../components/ui";
import { EmptyState, SkeletonCard } from "../../components/ui/EmptyState";
import { AgentFleetGraph } from "../../components/AgentFleetGraph";
import BrandLogo from "../../components/BrandLogo";
import { motion, motionVariants, useReducedMotion } from "../../lib/animations";

/* ------------------------------------------------------------------ */
/* Types & constants                                                    */
/* ------------------------------------------------------------------ */

interface Initiative {
  id: string;
  name: string;
  status: string;
  vision?: string;
  updated_at?: string;
  created_at?: string;
  tech_stack?: string[];
  estimated_timeline?: string;
  project_ids?: string[];
  business_goals?: string[];
  functional_requirements?: string[];
  non_functional_requirements?: string[];
  risks?: { description: string; severity: string; mitigation?: string }[];
}

const STATUS_MAP: Record<string, "complete" | "running" | "failed" | "pending"> = {
  draft: "pending",
  generating: "running",
  active: "complete",
  completed: "complete",
  archived: "pending",
  failed: "failed",
};

const STATUS_ICON: any = {
  draft: Clock,
  generating: Loader2,
  active: FolderOpen,
  completed: FolderOpen,
  archived: Clock,
  failed: null,
};

const EXAMPLE_PROMPTS = [
  "AI SaaS Platform",
  "CRM for Healthcare",
  "Marketplace",
  "Internal HR Tool",
  "Analytics Dashboard",
  "Developer Platform",
];

const MAX_VISION_LENGTH = 140;

function truncateVision(vision: string | undefined): string {
  if (!vision) return "No description provided"
  const trimmed = vision.trim()
  if (trimmed.length <= MAX_VISION_LENGTH) return trimmed
  return `${trimmed.slice(0, MAX_VISION_LENGTH - 1)}…`
}

interface TemplateCard {
  icon: LucideIcon;
  title: string;
  description: string;
  prompt: string;
}

const TEMPLATES: TemplateCard[] = [
  {
    icon: Network,
    title: "AI SaaS",
    description: "Multi-tenant AI SaaS with usage-based billing.",
    prompt: "Build an AI-powered SaaS platform with multi-tenant architecture, usage-based billing, and a modern landing page.",
  },
  {
    icon: Store,
    title: "Marketplace",
    description: "Two-sided marketplace with payments and discovery.",
    prompt: "Create a two-sided marketplace platform with seller onboarding, payments, search, and reviews.",
  },
  {
    icon: HeartPulse,
    title: "Healthcare",
    description: "HIPAA-aware scheduling and patient portal.",
    prompt: "Build a CRM for healthcare with patient scheduling, HIPAA compliance, and provider dashboards.",
  },
  {
    icon: Building2,
    title: "CRM",
    description: "Sales pipeline, contacts, and automation workflows.",
    prompt: "Design a CRM for healthcare providers with contact management, pipeline tracking, and automation.",
  },
  {
    icon: Briefcase,
    title: "Internal Tool",
    description: "Admin dashboard for teams and permissions.",
    prompt: "Build an internal HR tool with employee records, onboarding, time-off tracking, and review cycles.",
  },
  {
    icon: Code2,
    title: "Developer Platform",
    description: "API-first platform with docs and key management.",
    prompt: "Create a developer platform with API-first design, documentation, API key management, and usage analytics.",
  },
  {
    icon: KeyRound,
    title: "Customer Portal",
    description: "Self-service portal with SSO and ticketing.",
    prompt: "Build a customer portal with SSO, self-service ticket management, and knowledge base.",
  },
  {
    icon: LineChart,
    title: "Analytics",
    description: "Product analytics with funnels and retention.",
    prompt: "Create an analytics dashboard with funnels, retention curves, and cohort analysis.",
  },
];

/* ------------------------------------------------------------------ */
/* Small building blocks                                                */
/* ------------------------------------------------------------------ */

function PromptChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <Button variant="chip" size="sm" onClick={onClick}>
      <Sparkles size={11} className="text-accent" aria-hidden="true" />
      {label}
    </Button>
  );
}

function TemplateCardComponent({ template, onSelect }: { template: TemplateCard; onSelect: (prompt: string) => void }) {
  const Icon = template.icon;
  return (
    <motion.div variants={motionVariants.staggerItem}>
      <Card variant="content" className="group cursor-pointer overflow-hidden p-0 transition-colors hover:border-accent/30">
        <button
          type="button"
          onClick={() => onSelect(template.prompt)}
          className="flex w-full cursor-pointer items-start gap-3 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-accent/10 text-accent transition-transform duration-200 group-hover:scale-110">
            <Icon size={16} aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-sm font-semibold text-ink">{template.title}</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">{template.description}</span>
          </span>
        </button>
      </Card>
    </motion.div>
  );
}

function AgentRosterPanel() {
  const agents = [
    "Business Analyst",
    "Product Manager",
    "Architect",
    "PRD Writer",
    "Epic Generator",
    "Story Generator",
    "Task Generator",
    "Sprint Planner",
    "Scrum Master",
    "Task Executor",
    "Integration",
    "Decision Engine",
  ];
  return (
    <Card variant="panel" className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border-soft px-4 py-3">
        <Heading level="label">Agent Roster</Heading>
      </div>
      <ul className="flex-1 space-y-1 overflow-y-auto p-3">
        {agents.map((agent, i) => (
          <motion.li
            key={agent}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.2 }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-muted"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-panel-alt text-faint">
              <Bot size={10} aria-hidden="true" />
            </span>
            <span className="truncate text-ink">{agent}</span>
          </motion.li>
        ))}
      </ul>
    </Card>
  );
}

function RecentActivityPanel() {
  return (
    <Card variant="panel" className="flex flex-col overflow-hidden">
      <div className="border-b border-border-soft px-4 py-3">
        <Heading level="label">Recent Activity</Heading>
      </div>
      <div className="flex-1 px-4 py-6 text-center text-xs text-faint">
        No recent activity yet. Create an initiative to see updates here.
      </div>
    </Card>
  );
}

function CreationStatus({ creating }: { creating: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4, duration: 0.3 }}
    >
      <Card variant="panel">
        <div className="flex items-center gap-2 mb-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Sparkles size={12} aria-hidden="true" />
          </span>
          <Heading level="label">Forge Intelligence</Heading>
        </div>
        {creating ? (
          <div className="flex items-center gap-2 text-sm text-ink">
            <Loader2 size={14} className="animate-spin text-accent" aria-hidden="true" />
            <span>Analyzing your initiative…</span>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-ink">Ready to plan.</p>
            <p className="text-xs text-faint">Describe an idea above to activate the pipeline.</p>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Visual components                                                    */
/* ------------------------------------------------------------------ */

function AdditivePulse() {
  return (
    <>
      <div
        className="forge-pulse-ring"
        style={{ width: 80, height: 80, borderColor: "rgba(var(--primary) / 0.33)", animationDelay: "0s" }}
      />
      <div
        className="forge-pulse-ring"
        style={{ width: 80, height: 80, borderColor: "rgba(var(--primary) / 0.27)", animationDelay: "1s" }}
      />
      <div
        className="forge-pulse-ring"
        style={{ width: 80, height: 80, borderColor: "rgba(var(--primary) / 0.2)", animationDelay: "2s" }}
      />
    </>
  );
}

function HeroVisual() {
  const accent = colorTokens.accent.default;
  const accentHover = colorTokens.accent.hover;

  return (
    <div className="relative flex h-full min-h-[360px] items-center justify-center" aria-hidden="true">
      <div
        className="forge-glow-breathe absolute h-[380px] w-[380px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(var(--primary) / 0.13) 0%, transparent 65%)" }}
      />
      <div className="absolute flex items-center justify-center">
        <AdditivePulse />
      </div>
      <div className="forge-orbit h-[300px] w-[300px]" style={{ animationDuration: "28s" }}>
        <div
          className="forge-orbit-dot"
          style={{ background: accent, boxShadow: "0 0 10px rgba(var(--primary) / 0.5)" }}
        />
      </div>
      <div
        className="forge-orbit h-[380px] w-[380px]"
        style={{ animationDirection: "reverse", animationDuration: "38s", borderColor: "rgba(var(--primary) / 0.05)" }}
      >
        <div
          className="forge-orbit-dot"
          style={{ background: accentHover, boxShadow: "0 0 10px rgba(var(--primary-hover) / 0.5)", top: "auto", bottom: -3 }}
        />
      </div>
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="relative z-10 flex h-32 w-32 items-center justify-center border border-border bg-panel shadow-m3-2 backdrop-blur-xl"
        style={{ borderRadius: radius.lg }}
      >
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(circle at 50% 30%, rgba(var(--primary) / 0.09), transparent 70%)", borderRadius: radius.lg }}
        />
        <BrandLogo size="lg" />
        <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-panel shadow-m3">
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
            background: i % 2 === 0 ? accent : accentHover,
            opacity: 0.35,
          }}
        />
      ))}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
        className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-panel px-3 py-2 backdrop-blur-xl"
      >
        <span className="forge-signal-dot h-2 w-2 rounded-full bg-ok" />
        <span className="whitespace-nowrap font-medium text-muted" style={{ fontSize: fontSize.label }}>
          Agent fleet standing by
        </span>
      </motion.div>
    </div>
  );
}

function ForgeSignal({ creating }: { creating: boolean }) {
  const [status, setStatus] = useState<"ready" | "thinking" | "working" | "done">("ready");
  const [label, setLabel] = useState("Waiting for your next initiative");

  useEffect(() => {
    if (creating) {
      setStatus("thinking");
      setLabel("Analyzing your initiative");
      const t1 = setTimeout(() => { setStatus("working"); setLabel("Planning…"); }, 1600);
      const t2 = setTimeout(() => { setStatus("done"); setLabel("Initiatives queued"); }, 3200);
      const t3 = setTimeout(() => { setStatus("ready"); setLabel("Waiting for your next initiative"); }, 5200);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
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
      <span className="text-xs text-faint">{label}</span>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function InitiativesListPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [initiatives, setInitiatives] = useState<Initiative[] | null>(null);
  const [creditPreview, setCreditPreview] = useState<{ cost: number; free_available: boolean; credits_remaining: number } | null>(null);
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!LIVE_MODE) return;
    initiativesApi
      .list()
      .then(setInitiatives)
      .catch(() => toast.error("Failed to load initiatives"));
  };

  useEffect(load, []);

  useEffect(() => {
    if (!LIVE_MODE) return;
    initiativesApi.creditPreview()
      .then(setCreditPreview)
      .catch(() => {});
  }, []);

  const totalInitiatives = initiatives?.length ?? 0;
  const activeCount = useMemo(
    () => (initiatives ?? []).filter((i) => i.status === "generating" || i.status === "active").length,
    [initiatives]
  );
  const completedCount = useMemo(
    () => (initiatives ?? []).filter((i) => i.status === "completed").length,
    [initiatives]
  );

  const heroStats = useMemo(() => [
    { icon: Layers, value: totalInitiatives, suffix: "", label: " Initiatives" },
    { icon: Bot, value: activeCount, suffix: "", label: "Active" },
    { icon: Clock, value: completedCount, suffix: "", label: "Completed" },
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

  const fillPrompt = useCallback((value: string) => {
    setPrompt(value);
    inputRef.current?.focus();
  }, []);

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
                  <Heading level="label" className="font-medium normal-case tracking-wide">
                    AI-Powered Product Planning
                  </Heading>
                </motion.div>

                <motion.h1 variants={motionVariants.staggerItem} className="mt-3">
                  <Heading level="display">
                    Turn Ideas into{" "}
                    <span className="bg-gradient-to-r from-accent to-secondary bg-clip-text text-transparent">
                      Production
                    </span>
                  </Heading>
                </motion.h1>

                <motion.div variants={motionVariants.staggerItem} className="mt-4">
                  <Heading level="body">
                    Forge orchestrates specialized AI agents that transform a simple product idea
                    into a complete production-ready execution plan — including architecture, PRD,
                    stories, sprint plans and technical implementation.
                  </Heading>
                </motion.div>

                {/* Stat cards */}
                <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {heroStats.map((s) => {
                    const Icon = s.icon;
                    return (
                      <motion.div key={s.label} variants={motionVariants.staggerItem}>
                        <Card variant="stat" className="h-full">
                          <div className="flex items-center gap-3">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-accent/10 text-accent">
                              <Icon size={13} aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <div className="font-display font-semibold leading-none text-ink" style={{ fontSize: fontSize.bodyLg }}>
                                {s.value}
                              </div>
                              <div className="mt-1 truncate text-xs leading-none text-muted">{s.label}</div>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>

              {/* Right column — visual */}
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="hidden lg:block"
              >
                <HeroVisual />
              </motion.div>
            </div>
          </section>

          {/* ============ INITIATIVE INPUT ============ */}
          <section aria-label="Start a new initiative" className="mt-10">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="relative"
            >
              {/* Glow behind input */}
              <div
                className="pointer-events-none absolute -inset-4 rounded-[28px] opacity-60 blur-2xl"
                style={{ background: "radial-gradient(ellipse 60% 60% at 50% 40%, rgb(var(--primary) / 0.1), transparent 70%)" }}
                aria-hidden="true"
              />

              {/* Input card */}
              <div className="apple-glass-strong relative rounded-apple p-2 shadow-m3-2">
                <div className="flex items-center gap-2 px-2 py-2">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/25 to-accent/10 text-accent"
                    aria-hidden="true"
                  >
                    <Rocket size={17} />
                  </span>
                  <input
                    ref={inputRef}
                    id="initiative-spotlight"
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    placeholder="Describe a product to plan end-to-end…"
                    className="min-w-0 flex-1 bg-transparent py-3 text-ink placeholder:text-faint focus:outline-none"
                    style={{ fontSize: fontSize.bodyLg }}
                    aria-label="Describe what you want to build"
                  />
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleCreate}
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Send size={14} aria-hidden="true" />
                    )}
                    {creating ? "Planning…" : "Generate"}
                  </Button>
                </div>

                {creditPreview && (
                  <div
                    className="mt-2 px-3 pb-1 flex items-center justify-between text-muted"
                    style={{ fontSize: fontSize.label }}
                  >
                    <span>
                      {creditPreview.free_available
                        ? "Your first initiative is free"
                        : `This initiative costs ${creditPreview.cost} credits`}
                    </span>
                    <span>
                      {creditPreview.credits_remaining} credits remaining
                    </span>
                  </div>
                )}

                {/* Example chips */}
                <div className="mt-2 flex flex-wrap items-center gap-2 px-3 pb-2">
                  <span className="text-xs text-faint">Try:</span>
                  {EXAMPLE_PROMPTS.map((example) => (
                    <PromptChip key={example} label={example} onClick={() => fillPrompt(example)} />
                  ))}
                </div>
              </div>

              {/* Forge Signal underneath */}
              <div className="mt-2 flex justify-center">
                <ForgeSignal creating={creating} />
              </div>
            </motion.div>
          </section>

          {/* ============ PIPELINE WORKSPACE ============ */}
          <section aria-label="Agent pipeline workspace" className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Workflow size={12} aria-hidden="true" />
                </span>
                <Heading level="h3">Pipeline Workspace</Heading>
              </div>
              <span className="text-xs text-faint">Click a node to inspect an agent</span>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_minmax(0,1fr)_220px]">
              {/* Left panel — Agent Roster */}
              <div className="order-2 xl:order-1">
                <AgentRosterPanel />
              </div>

              {/* Center — existing graph */}
              <div className="order-1 xl:order-2 min-w-0">
                <AgentFleetGraph embedded={false} />
              </div>

              {/* Right panel — Activity + Status */}
              <div className="order-3 space-y-4">
                <RecentActivityPanel />
                <CreationStatus creating={creating} />
              </div>
            </div>
          </section>

          {/* ============ START FROM TEMPLATE ============ */}
          <section aria-label="Start from a template" className="mt-8">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Plus size={12} aria-hidden="true" />
              </span>
              <Heading level="h3">Start From a Template</Heading>
            </div>
            <motion.div
              variants={motionVariants.staggerContainer}
              initial={reduceMotion ? false : "hidden"}
              animate="visible"
              className="grid grid-cols-2 gap-3 md:grid-cols-4"
            >
              {TEMPLATES.map((t) => (
                <TemplateCardComponent key={t.title} template={t} onSelect={fillPrompt} />
              ))}
            </motion.div>
          </section>

          {/* ============ EXISTING INITIATIVES ============ */}
          <section aria-label="Existing initiatives" className="mt-8">
            <div className="mb-3 flex items-center gap-2">
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

            {!LIVE_MODE ? (
              <motion.div variants={motionVariants.fadeIn} initial="hidden" animate="visible">
                <Card variant="empty-state" className="p-0">
                  <EmptyState
                    icon={Rocket}
                    title="Connect a backend"
                    description="Set VITE_WS_URL to load and create initiatives."
                  />
                </Card>
              </motion.div>
            ) : initiatives === null ? (
              <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-2">
                <SkeletonCard count={4} />
              </div>
            ) : initiatives.length === 0 ? (
              <motion.div variants={motionVariants.fadeIn} initial="hidden" animate="visible">
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
              </motion.div>
            ) : (
              <motion.div
                variants={motionVariants.staggerContainer}
                initial={reduceMotion ? false : "hidden"}
                animate="visible"
                className="space-y-2"
              >
                {initiatives.map((initiative, i) => {
                  const techStack = initiative.tech_stack ?? [];
                  const projectCount = initiative.project_ids?.length ?? 0;
                  const metaParts: string[] = [];
                  if (initiative.estimated_timeline) metaParts.push(initiative.estimated_timeline);
                  if (projectCount > 0) {
                    metaParts.push(`${projectCount} app${projectCount === 1 ? "" : "s"}`);
                  }

                  const StatusIcon = STATUS_ICON[initiative.status] ?? Clock;

                  return (
                    <motion.div key={initiative.id} variants={motionVariants.staggerItem} custom={i}>
                      <Card variant="content" className="group overflow-hidden p-0 transition-colors hover:border-accent/30">
                        <button
                          type="button"
                          onClick={() => navigate(`/initiatives/${initiative.id}`)}
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
                                <span
                                  className="truncate font-display font-semibold text-ink"
                                  style={{ fontSize: fontSize.bodyLg }}
                                >
                                  {initiative.name}
                                </span>
                                <StatusPill status={STATUS_MAP[initiative.status] ?? "pending"} />
                              </span>
                              {StatusIcon && (
                                <StatusIcon
                                  size={14}
                                  className={`shrink-0 text-muted ${initiative.status === "generating" ? "animate-spin" : ""}`}
                                  aria-hidden="true"
                                />
                              )}
                            </span>
                            <span className="mt-1 block line-clamp-2 text-sm leading-relaxed text-muted">
                              {truncateVision(initiative.vision)}
                            </span>
                            <span
                              className="mt-3 flex flex-wrap items-center gap-2 text-faint"
                              style={{ fontSize: fontSize.label }}
                            >
                              <span className="flex items-center gap-1">
                                <Clock size={10} />
                                {formatRelativeTime(initiative.updated_at ?? initiative.created_at)}
                              </span>
                              {metaParts.length > 0 && <span aria-hidden="true">·</span>}
                              {metaParts.map((part) => (
                                <span key={part} className="flex items-center gap-1">
                                  {part}
                                </span>
                              ))}
                              {techStack.length > 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {techStack.slice(0, 3).map((tech) => (
                                      <span
                                        key={tech}
                                        className="rounded-md border border-border bg-panel-alt px-2 py-1 text-muted"
                                      >
                                        {tech}
                                      </span>
                                    ))}
                                    {techStack.length > 3 && (
                                      <span className="text-muted">+{techStack.length - 3}</span>
                                    )}
                                  </div>
                                </>
                              )}
                            </span>
                          </span>
                        </button>
                      </Card>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
