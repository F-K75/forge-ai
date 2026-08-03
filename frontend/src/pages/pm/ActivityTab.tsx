import { Loader2, CheckCircle2, XCircle, Clock, Zap, Lightbulb, Activity, Brain } from "lucide-react";
import { usePMStore } from "../../store/pmStore";
import { SummaryChip } from "../../components/SummaryChip";
import { motion, motionVariants } from "../../lib/animations";

const STATUS_ICON: Record<string, JSX.Element> = {
  queued: <Clock size={13} className="text-faint" aria-hidden="true" />,
  running: <Loader2 size={13} className="text-accent animate-spin" aria-hidden="true" />,
  completed: <CheckCircle2 size={13} className="text-ok" aria-hidden="true" />,
  failed: <XCircle size={13} className="text-error" aria-hidden="true" />,
};

export default function ActivityTab() {
  const { executions, tasks, decisionFeed } = usePMStore();

  const taskTitle = (taskId: string) => tasks.find(t => t.id === taskId)?.title ?? taskId;

  const running = executions.filter(e => e.status === "running").length;
  const completed = executions.filter(e => e.status === "completed").length;
  const failed = executions.filter(e => e.status === "failed").length;
  const totalCost = executions.reduce((sum, e) => sum + (e.cost_usd ?? 0), 0);
  const totalTokens = executions.reduce((sum, e) => sum + (e.tokens_used ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
      {/* Section: Summary stats */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Activity size={12} aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">Activity Overview</h2>
      </div>
      <motion.div className="mb-8 grid grid-cols-2 gap-2.5 md:grid-cols-5" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
        <motion.div variants={motionVariants.staggerItem} custom={0} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 backdrop-blur-xl"><SummaryChip label="Running" value={String(running)} /></motion.div>
        <motion.div variants={motionVariants.staggerItem} custom={1} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 backdrop-blur-xl"><SummaryChip label="Completed" value={String(completed)} /></motion.div>
        <motion.div variants={motionVariants.staggerItem} custom={2} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 backdrop-blur-xl"><SummaryChip label="Failed" value={String(failed)} warn={failed > 0} /></motion.div>
        <motion.div variants={motionVariants.staggerItem} custom={3} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 backdrop-blur-xl"><SummaryChip label="Tokens" value={totalTokens.toLocaleString()} /></motion.div>
        <motion.div variants={motionVariants.staggerItem} custom={4} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 backdrop-blur-xl"><SummaryChip label="Cost" value={`$${totalCost.toFixed(3)}`} icon={<Zap size={11} className="text-faint" aria-hidden="true" />} /></motion.div>
      </motion.div>

      {/* Section: Decision engine */}
      {decisionFeed.length > 0 && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-warn/10 text-warn">
              <Brain size={12} aria-hidden="true" />
            </span>
            <h2 className="font-display text-sm font-semibold text-ink">Decision Engine</h2>
          </div>
          <motion.section className="mb-8 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl" variants={motionVariants.fadeUp} initial="hidden" animate="visible">
            <motion.ul className="space-y-3" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
              {decisionFeed.map((d, i) => (
                <motion.li key={i} className="flex gap-2.5 rounded-xl p-3 text-sm transition-colors duration-150 hover:bg-white/[0.02]" variants={motionVariants.staggerItem} custom={i} whileHover={{ x: 2, transition: { type: "spring", stiffness: 400, damping: 20 } }}>
                  <Lightbulb size={14} className="text-warn shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <p className="text-ink">{d.summary}</p>
                    {d.recommendedNextTasks.length > 0 && (
                      <p className="text-xs text-muted mt-0.5">Next up: {d.recommendedNextTasks.join(", ")}</p>
                    )}
                    {d.bottlenecks.length > 0 && (
                      <p className="text-xs text-warn mt-0.5">Bottleneck: {d.bottlenecks.join(", ")}</p>
                    )}
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          </motion.section>
        </>
      )}

      {/* Section: Agent executions */}
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Activity size={12} aria-hidden="true" />
        </span>
        <h2 className="font-display text-sm font-semibold text-ink">Agent Executions</h2>
      </div>
      <motion.section className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 backdrop-blur-xl" variants={motionVariants.fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.1 }}>
        {executions.length === 0 ? (
          <motion.p className="text-sm text-faint py-4 text-center" variants={motionVariants.fadeIn}>No agent runs yet — assign a task to an AI agent from the Board.</motion.p>
        ) : (
          <motion.ul className="divide-y divide-white/[0.04]" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            {executions.map((exec, i) => (
              <motion.li
                key={exec.id}
                className="py-3 flex items-start gap-3 transition-colors duration-150 hover:bg-white/[0.01] rounded-lg px-2 -mx-2"
                variants={motionVariants.staggerItem}
                custom={i}
              >
                {STATUS_ICON[exec.status] ?? STATUS_ICON.queued}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-ink truncate">{taskTitle(exec.task_id)}</p>
                    <span className="text-[10px] font-mono text-faint shrink-0">{exec.agent}</span>
                  </div>
                  {exec.current_thought && <p className="text-xs text-muted mt-0.5">{exec.current_thought}</p>}
                  {exec.error && <p className="text-xs text-error mt-0.5">{exec.error}</p>}
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-faint font-mono">
                    {exec.tokens_used > 0 && <span>{exec.tokens_used} tok</span>}
                    {exec.cost_usd > 0 && <span>${exec.cost_usd.toFixed(4)}</span>}
                    {exec.duration_seconds > 0 && <span>{exec.duration_seconds.toFixed(1)}s</span>}
                    {exec.generated_files?.length > 0 && <span>{exec.generated_files.length} files</span>}
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>
        )}
      </motion.section>
    </div>
  );
}
