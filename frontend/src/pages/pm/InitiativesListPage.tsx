import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Send, Loader2, Rocket, Sparkles, Clock, FolderOpen, Code2 } from "lucide-react";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";
import { formatRelativeTime } from "../../lib/format";
import { StatusPill } from "../../components/StatusPill";
import { EmptyState, SkeletonCard } from "../../components/ui/EmptyState";
import { AgentFleetGraph } from "../../components/AgentFleetGraph";
import { motion, motionVariants } from "../../lib/animations";
import { presets } from "../../lib/animationPresets";

interface Initiative {
  id: string;
  name: string;
  prompt: string;
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

export default function InitiativesListPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);
  const [initiatives, setInitiatives] = useState<Initiative[] | null>(null);

  const load = () => {
    if (!LIVE_MODE) return;
    initiativesApi
      .list()
      .then(setInitiatives)
      .catch(() => toast.error("Failed to load initiatives"));
  };

  useEffect(load, []);

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
      navigate(`/initiatives/${initiative.id}`);
    } catch {
      toast.error("Failed to create initiative");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <section
        aria-label="Start a new initiative"
        className="shrink-0 border-b border-white/[0.06] px-4 py-6 md:px-8 md:py-8"
      >
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 text-accent">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="font-display text-sm font-semibold text-ink">New Initiative</h2>
              <p className="text-xs text-muted">Describe your product and Forge will generate a complete plan.</p>
            </div>
          </div>
          <div className="os-spotlight flex items-center gap-2 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 focus-within:border-ink/50 focus-within:shadow-[0_0_0_3px_rgba(212,212,216,0.12)] transition-[border-color,box-shadow] duration-200">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/25 to-accent/10 text-accent"
              aria-hidden="true"
            >
              <Rocket size={16} />
            </span>
            <input
              id="initiative-spotlight"
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Describe a product to plan end-to-end…"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-[15px] text-ink placeholder:text-faint focus:outline-none"
              aria-label="Describe what you want to build"
            />
            <motion.button
              onClick={handleCreate}
              disabled={creating}
              {...presets.button}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-white shadow-[0_8px_24px_-12px_rgba(20,184,166,0.45)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {creating ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={14} aria-hidden="true" />
              )}
              {creating ? "Planning…" : "Generate"}
            </motion.button>
          </div>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-accent" />
              AI-powered planning
            </span>
            <span className="flex items-center gap-1.5">
              <Code2 size={12} className="text-accent" />
              PRD, epics, stories, tasks
            </span>
            <span className="flex items-center gap-1.5">
              <FolderOpen size={12} className="text-accent" />
              Sprint plans included
            </span>
          </div>
        </div>
      </section>

      <AgentFleetGraph embedded />

      <section aria-label="Existing initiatives" className="min-h-0 flex-1 overflow-auto px-4 py-6 md:px-8 md:py-8">
        {!LIVE_MODE ? (
          <motion.div
            className="mx-auto max-w-3xl"
            variants={motionVariants.fadeIn}
            initial="hidden"
            animate="visible"
          >
            <EmptyState
              icon={Rocket}
              title="Connect a backend"
              description="Set VITE_WS_URL to load and create initiatives."
            />
          </motion.div>
        ) : initiatives === null ? (
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-3 md:grid-cols-2">
            <SkeletonCard count={4} />
          </div>
        ) : initiatives.length === 0 ? (
          <motion.div
            className="mx-auto max-w-3xl"
            variants={motionVariants.fadeIn}
            initial="hidden"
            animate="visible"
          >
            <EmptyState
              icon={Rocket}
              title="No initiatives yet"
              description="Describe an idea above to generate your first plan."
              primaryAction={{
                label: "Create your first initiative",
                onClick: () => document.getElementById("initiative-spotlight")?.focus(),
              }}
            />
          </motion.div>
        ) : (
          <motion.div
            className="mx-auto max-w-3xl space-y-2"
            variants={motionVariants.staggerContainer}
            initial="hidden"
            animate="visible"
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
                  <button
                    type="button"
                    onClick={() => navigate(`/initiatives/${initiative.id}`)}
                    className="group flex w-full cursor-pointer items-start gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-left transition-all duration-200 hover:border-white/15 hover:bg-white/[0.04] hover:shadow-lg hover:shadow-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <span
                      className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-accent/20 to-accent/5 text-accent"
                      aria-hidden="true"
                    >
                      <Rocket size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="truncate font-display text-[15px] font-semibold text-ink">
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
                      <span className="mt-1.5 block line-clamp-2 text-sm leading-relaxed text-muted">
                        {initiative.vision || initiative.prompt}
                      </span>
                      <span className="mt-3 flex flex-wrap items-center gap-2.5 text-[11px] text-faint">
                        <span className="flex items-center gap-1">
                          <Clock size={10} />
                          {formatRelativeTime(initiative.updated_at ?? initiative.created_at)}
                        </span>
                        {metaParts.length > 0 && (
                          <span className="text-white/20">·</span>
                        )}
                        {metaParts.map((part) => (
                          <span key={part} className="flex items-center gap-1">
                            {part}
                          </span>
                        ))}
                        {techStack.length > 0 && (
                          <>
                            <span className="text-white/20">·</span>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {techStack.slice(0, 3).map((tech) => (
                                <span
                                  key={tech}
                                  className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-0.5 text-muted"
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
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </section>
    </div>
  );
}
