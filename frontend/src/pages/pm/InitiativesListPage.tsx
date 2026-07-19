import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Send, Loader2 } from "lucide-react";
import { LIVE_MODE } from "../../lib/env";
import { initiativesApi } from "../../lib/pmApi";
import { formatRelativeTime } from "../../lib/format";
import { StatusPill } from "../../components/StatusPill";
import { EmptyState, SkeletonCard } from "../../components/ui/EmptyState";
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
    <div className="px-6 md:px-10 py-10 md:py-14 max-w-5xl mx-auto">
      <motion.header className="mb-14" variants={motionVariants.fadeUp} initial="hidden" animate="visible">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-4">
          <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
          Engineering OS
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-medium tracking-tight text-ink">Initiatives</h1>
        <p className="text-sm text-muted mt-2">
          Describe an idea. AI generates the vision, PRD, epics, stories, tasks, and sprint plan.
        </p>
      </motion.header>

      <motion.section aria-label="Start a new initiative" className="mb-16 pb-16 border-b border-border" variants={motionVariants.fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.1 }}>
        <h2 className="font-display text-xl font-medium text-ink mb-1.5">What are you building?</h2>
        <p className="text-sm text-muted mb-6">Forge plans the whole engineering lifecycle end-to-end.</p>

        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            placeholder="An AI CRM for startups…"
            className="flex-1 h-11 bg-transparent border border-border rounded-md px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition min-w-0"
            aria-label="Describe what you want to build"
          />
          <motion.button
            onClick={handleCreate}
            disabled={creating}
            {...presets.button}
            className="flex items-center gap-2 h-11 px-5 rounded-md bg-ink text-base text-sm font-medium hover:bg-ink/90 focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 transition-colors motion-reduce:transition-none shrink-0 disabled:opacity-50"
          >
            {creating ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Send size={13} aria-hidden="true" />}
            {creating ? "Planning…" : "Generate plan"}
          </motion.button>
        </div>
      </motion.section>

      <section aria-label="Existing initiatives">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted">
            <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
            Your initiatives
          </div>
        </div>

        {!LIVE_MODE ? (
          <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn} initial="hidden" animate="visible">Connect a backend (set VITE_WS_URL) to load and create initiatives.</motion.p>
        ) : initiatives === null ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <SkeletonCard count={4} />
          </div>
        ) : initiatives.length === 0 ? (
          <EmptyState
            icon={Send}
            title="No initiatives yet"
            description="Describe an idea above to generate your first plan."
          />
        ) : (
          <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            {initiatives.map((initiative, i) => {
              const techStack = initiative.tech_stack ?? [];
              const visibleStack = techStack.slice(0, 4);
              const extraStack = techStack.length - visibleStack.length;
              const projectCount = initiative.project_ids?.length ?? 0;

              const metaParts: string[] = [];
              if (initiative.estimated_timeline) metaParts.push(initiative.estimated_timeline);
              if (projectCount > 0) metaParts.push(`${projectCount} app${projectCount === 1 ? "" : "s"}`);

              const goalsCount = initiative.business_goals?.length ?? 0;
              const reqsCount =
                (initiative.functional_requirements?.length ?? 0) + (initiative.non_functional_requirements?.length ?? 0);
              const risksCount = initiative.risks?.length ?? 0;
              const progressParts: string[] = [];
              if (goalsCount) progressParts.push(`${goalsCount} goal${goalsCount === 1 ? "" : "s"}`);
              if (reqsCount) progressParts.push(`${reqsCount} requirement${reqsCount === 1 ? "" : "s"}`);
              if (risksCount) progressParts.push(`${risksCount} risk${risksCount === 1 ? "" : "s"}`);

              return (
                <motion.article
                  key={initiative.id}
                  className="bg-base"
                  variants={motionVariants.staggerItem}
                  custom={i}
                  whileHover={{ scale: 1.01, transition: { type: "spring", stiffness: 400, damping: 25 } }}
                >
                  <motion.button
                    onClick={() => navigate(`/initiatives/${initiative.id}`)}
                    className="w-full h-full text-left p-6 hover:bg-panel-alt focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ink/40 transition-colors motion-reduce:transition-none"
                    whileTap={{ scale: 0.99 }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="font-mono text-sm text-ink truncate">{initiative.name}</span>
                      <span className="text-[11px] text-faint shrink-0">
                        {formatRelativeTime(initiative.updated_at ?? initiative.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted mb-4 leading-relaxed line-clamp-2">
                      {initiative.vision || initiative.prompt}
                    </p>

                    {visibleStack.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {visibleStack.map(tech => (
                          <span
                            key={tech}
                            className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-border-soft bg-panel-alt text-muted"
                          >
                            {tech}
                          </span>
                        ))}
                        {extraStack > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-border-soft bg-panel-alt text-faint">
                            +{extraStack}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        {metaParts.length > 0 && (
                          <p className="text-[11px] text-muted truncate">{metaParts.join(" · ")}</p>
                        )}
                        {progressParts.length > 0 && (
                          <p className="text-[11px] text-faint truncate">{progressParts.join(" · ")}</p>
                        )}
                      </div>
                      <StatusPill status={STATUS_MAP[initiative.status] ?? "pending"} />
                    </div>
                  </motion.button>
                </motion.article>
              );
            })}
          </motion.div>
        )}
      </section>
    </div>
  );
}
