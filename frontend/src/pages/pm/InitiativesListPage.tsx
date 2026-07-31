import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Send, Loader2, Rocket } from "lucide-react";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";
import { formatRelativeTime } from "../../lib/format";
import { StatusPill } from "../../components/StatusPill";
import { EmptyState, SkeletonCard } from "../../components/ui/EmptyState";
import { AgentFleetStrip } from "../../components/AgentFleetStrip";
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
        className="shrink-0 border-b border-white/[0.06] px-4 py-5 md:px-8 md:py-6"
      >
        <div className="mx-auto max-w-3xl">
          <label htmlFor="initiative-spotlight" className="sr-only">
            Describe an initiative
          </label>
          <div className="os-spotlight flex items-center gap-2 rounded-2xl border border-white/15 bg-black/25 px-3 py-2 focus-within:border-ink/50 focus-within:shadow-[0_0_0_3px_rgba(212,212,216,0.12)] transition-[border-color,box-shadow] duration-200">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-ink/25 to-muted/10 text-ink"
              aria-hidden="true"
            >
              <Rocket size={14} />
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
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-base shadow-[0_8px_24px_-12px_rgba(244,244,245,0.45)] transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ember/50"
            >
              {creating ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <Send size={14} aria-hidden="true" />
              )}
              {creating ? "Planning…" : "Generate"}
            </motion.button>
          </div>
          <p className="mt-3 text-xs text-muted">
            Forge generates vision, PRD, epics, stories, tasks, and sprint plan.
          </p>
        </div>
      </section>

      <AgentFleetStrip compact />

      <section aria-label="Existing initiatives" className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-8 md:py-6">
        {!LIVE_MODE ? (
          <motion.p
            className="text-sm text-faint"
            variants={motionVariants.fadeIn}
            initial="hidden"
            animate="visible"
          >
            Connect a backend (set VITE_WS_URL) to load and create initiatives.
          </motion.p>
        ) : initiatives === null ? (
          <div className="mx-auto grid max-w-3xl grid-cols-1 gap-2 md:grid-cols-2">
            <SkeletonCard count={4} />
          </div>
        ) : initiatives.length === 0 ? (
          <EmptyState
            icon={Rocket}
            title="No initiatives yet"
            description="Describe an idea above to generate your first plan."
          />
        ) : (
          <motion.ul
            className="mx-auto max-w-3xl divide-y divide-white/[0.05]"
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

              return (
                <motion.li key={initiative.id} variants={motionVariants.staggerItem} custom={i}>
                  <button
                    type="button"
                    onClick={() => navigate(`/initiatives/${initiative.id}`)}
                    className="group flex w-full cursor-pointer items-start gap-3 rounded-xl px-2 py-3.5 text-left transition-colors hover:bg-white/[0.04] focus:outline-none focus-visible:ring-1 focus-visible:ring-ember/40"
                  >
                    <span
                      className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-ink/20 to-transparent text-ink"
                      aria-hidden="true"
                    >
                      <Rocket size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-display text-sm font-medium text-ink">
                          {initiative.name}
                        </span>
                        <StatusPill status={STATUS_MAP[initiative.status] ?? "pending"} />
                      </span>
                      <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-muted">
                        {initiative.vision || initiative.prompt}
                      </span>
                      <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                        <span>{formatRelativeTime(initiative.updated_at ?? initiative.created_at)}</span>
                        {metaParts.length > 0 && <span>· {metaParts.join(" · ")}</span>}
                        {techStack.slice(0, 3).map((tech) => (
                          <span
                            key={tech}
                            className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-muted"
                          >
                            {tech}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        )}
      </section>
    </div>
  );
}
