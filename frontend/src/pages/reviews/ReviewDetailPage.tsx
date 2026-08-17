import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeft, Files, Bot as BotIcon, Zap, DollarSign, ListChecks } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { motionVariants } from "../../lib/animations";
import { reviewsApi } from "../../lib/orchestratorApi";
import { useReviewSocket } from "../../hooks/useReviewSocket";
import { useReviewStore } from "../../store/reviewStore";
import { StatusPill } from "../../components/StatusPill";
import { SummaryChip } from "../../components/SummaryChip";
import { ReviewAgentPipeline, type ReviewPipelineNode } from "../../components/ReviewAgentPipeline";

interface BacklogItem {
  id: string;
  title: string;
  description: string;
  fix: string;
  severity: "critical" | "high" | "medium" | "low";
  effort: "S" | "M" | "L";
  impact: number;
  files: string[];
}

const SEVERITY_COLOR: Record<BacklogItem["severity"], string> = {
  critical: "text-error",
  high: "text-warn",
  medium: "text-accent",
  low: "text-faint",
};

const TERMINAL_STATUSES = new Set(["complete", "failed"]);

export default function ReviewDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const reduceMotion = useReducedMotion();
  const [hydrated, setHydrated] = useState(false);
  const [backlog, setBacklog] = useState<BacklogItem[] | null>(null);
  const [backlogTotal, setBacklogTotal] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"severity" | "impact">("severity");

  const { hydrateFromRun, reset, status, mode, candidateFiles, triggeredAgents, agentStates, overallScore, recommendation, backlogCount, totalCostUsd, totalTokens } =
    useReviewStore();

  useEffect(() => {
    if (!runId) return;
    reset();
    setHydrated(false);
    reviewsApi
      .get(runId)
      .then((run) => {
        hydrateFromRun(run);
        setHydrated(true);
      })
      .catch(() => toast.error("Couldn't load this review. Please try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const socketEnabled = hydrated && runId && !TERMINAL_STATUSES.has(status);
  useReviewSocket(socketEnabled ? runId! : null);

  useEffect(() => {
    if (!runId || status !== "complete") return;
    reviewsApi
      .backlog(runId, sortBy)
      .then((data) => {
        setBacklog(data.items);
        setBacklogTotal(data.count);
      })
      .catch(() => toast.error("Couldn't load the backlog."));
  }, [runId, status, sortBy]);

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-faint">Loading review run…</div>
    );
  }

  const nodes: ReviewPipelineNode[] = triggeredAgents.map((id) => ({
    id,
    state: agentStates[id]?.status ?? "idle",
    detail:
      agentStates[id]?.status === "done" || agentStates[id]?.status === "failed"
        ? `${agentStates[id]?.issues ?? 0} issue${agentStates[id]?.issues === 1 ? "" : "s"}${
            agentStates[id]?.error ? ` — ${agentStates[id]?.error}` : ""
          }`
        : undefined,
  }));

  return (
    <motion.div
      className="px-6 md:px-10 py-10 md:py-14 max-w-5xl mx-auto"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <Link to="/reviews" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition mb-8">
        <ArrowLeft size={12} aria-hidden="true" />
        Back to reviews
      </Link>

      <div className="flex items-start justify-between gap-4 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-xl font-medium tracking-tight text-ink font-mono">{runId}</h1>
            <StatusPill status={status} />
          </div>
          <p className="text-xs text-muted">mode: {mode ?? "—"}</p>
        </div>
      </div>

      {/* Summary chips */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border mb-10"
        variants={reduceMotion ? undefined : motionVariants.staggerContainer}
        initial={reduceMotion ? false : "hidden"}
        animate="visible"
      >
        <motion.div variants={motionVariants.staggerItem}>
          <SummaryChip label="Candidate files" value={String(candidateFiles)} icon={<Files size={11} className="text-faint" aria-hidden="true" />} />
        </motion.div>
        <motion.div variants={motionVariants.staggerItem}>
          <SummaryChip label="Agents triggered" value={String(triggeredAgents.length)} icon={<BotIcon size={11} className="text-faint" aria-hidden="true" />} />
        </motion.div>
        <motion.div variants={motionVariants.staggerItem}>
          <SummaryChip
            label="Overall score"
            value={overallScore !== null ? String(overallScore) : "—"}
            warn={recommendation === "NO_GO"}
          />
        </motion.div>
        <motion.div variants={motionVariants.staggerItem}>
          <SummaryChip label="Recommendation" value={recommendation ?? "—"} warn={recommendation === "NO_GO"} />
        </motion.div>
        <motion.div variants={motionVariants.staggerItem}>
          <SummaryChip
            label="Backlog items"
            value={(backlogCount ?? backlogTotal) !== null ? String(backlogCount ?? backlogTotal) : "—"}
            icon={<ListChecks size={11} className="text-faint" aria-hidden="true" />}
          />
        </motion.div>
        <motion.div variants={motionVariants.staggerItem}>
          <SummaryChip label="Cost" value={`$${totalCostUsd.toFixed(4)}`} icon={<DollarSign size={11} className="text-faint" aria-hidden="true" />} />
        </motion.div>
        <motion.div variants={motionVariants.staggerItem}>
          <SummaryChip label="Tokens" value={totalTokens.toLocaleString()} icon={<Zap size={11} className="text-faint" aria-hidden="true" />} />
        </motion.div>
      </motion.div>

      {/* Pipeline */}
      <motion.section
        aria-label="Review agent pipeline"
        className="mb-12 pb-12 border-b border-border"
        initial={reduceMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
      >
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted mb-5">
          <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
          Pipeline run
        </div>
        {nodes.length === 0 ? (
          <p className="text-sm text-faint">Waiting for the run to start…</p>
        ) : (
          <div className="max-w-xs">
            <ReviewAgentPipeline nodes={nodes} />
          </div>
        )}
      </motion.section>

      {/* Backlog */}
      {status === "complete" && (
        <motion.section
          aria-label="Backlog"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut", delay: 0.15 }}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted">
              <span className="w-6 h-px bg-muted/50" aria-hidden="true" />
              Backlog
            </div>
            <div className="flex gap-1">
              {(["severity", "impact"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSortBy(s)}
                  className={[
                    "px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors motion-reduce:transition-none",
                    sortBy === s ? "text-ink" : "text-faint hover:text-ink",
                  ].join(" ")}
                >
                  by {s}
                </button>
              ))}
            </div>
          </div>

          {backlog === null ? (
            <p className="text-sm text-faint">Loading backlog…</p>
          ) : backlog.length === 0 ? (
            <p className="text-sm text-faint">No issues found.</p>
          ) : (
            <motion.ul
              className="border-t border-border"
              variants={reduceMotion ? undefined : motionVariants.staggerContainer}
              initial={reduceMotion ? false : "hidden"}
              animate="visible"
            >
              {backlog.map((item) => (
                <motion.li key={item.id} className="border-b border-border p-5" variants={motionVariants.staggerItem}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${SEVERITY_COLOR[item.severity]}`}>
                      {item.severity}
                    </span>
                    <span className="text-[10px] text-faint">effort {item.effort}</span>
                    <span className="text-[10px] text-faint">impact {item.impact}/10</span>
                  </div>
                  <p className="text-sm font-medium text-ink mb-1">{item.title}</p>
                  {item.description && <p className="text-xs text-muted mb-1.5 leading-relaxed">{item.description}</p>}
                  {item.fix && <p className="text-xs text-muted italic">Fix: {item.fix}</p>}
                  {item.files.length > 0 && (
                    <p className="text-[10px] font-mono text-faint mt-1.5 truncate">{item.files.join(", ")}</p>
                  )}
                </motion.li>
              ))}
            </motion.ul>
          )}
        </motion.section>
      )}
    </motion.div>
  );
}
