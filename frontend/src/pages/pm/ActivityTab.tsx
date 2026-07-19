import { Loader2, CheckCircle2, XCircle, Clock, Zap, Lightbulb } from "lucide-react";
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
    <div className="px-6 md:px-8 py-6 max-w-4xl">
      <motion.div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border mb-8" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
        <motion.div variants={motionVariants.staggerItem} custom={0}><SummaryChip label="Running" value={String(running)} /></motion.div>
        <motion.div variants={motionVariants.staggerItem} custom={1}><SummaryChip label="Completed" value={String(completed)} /></motion.div>
        <motion.div variants={motionVariants.staggerItem} custom={2}><SummaryChip label="Failed" value={String(failed)} warn={failed > 0} /></motion.div>
        <motion.div variants={motionVariants.staggerItem} custom={3}><SummaryChip label="Tokens" value={totalTokens.toLocaleString()} /></motion.div>
        <motion.div variants={motionVariants.staggerItem} custom={4}><SummaryChip label="Cost" value={`$${totalCost.toFixed(3)}`} icon={<Zap size={11} className="text-faint" aria-hidden="true" />} /></motion.div>
      </motion.div>

      {decisionFeed.length > 0 && (
        <motion.section className="mb-8" variants={motionVariants.fadeUp} initial="hidden" animate="visible">
          <h3 className="text-xs uppercase tracking-[0.14em] text-muted mb-3">Decision engine</h3>
          <motion.ul className="space-y-3" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            {decisionFeed.map((d, i) => (
              <motion.li key={i} className="flex gap-2.5 text-sm" variants={motionVariants.staggerItem} custom={i} whileHover={{ x: 2, transition: { type: "spring", stiffness: 400, damping: 20 } }}>
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
      )}

      <motion.section variants={motionVariants.fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.1 }}>
        <h3 className="text-xs uppercase tracking-[0.14em] text-muted mb-3">Agent executions</h3>
        {executions.length === 0 ? (
          <motion.p className="text-sm text-faint" variants={motionVariants.fadeIn}>No agent runs yet — assign a task to an AI agent from the Board.</motion.p>
        ) : (
          <motion.ul className="divide-y divide-border-soft" variants={motionVariants.staggerContainer} initial="hidden" animate="visible">
            {executions.map((exec, i) => (
              <motion.li
                key={exec.id}
                className="py-3 flex items-start gap-3"
                variants={motionVariants.staggerItem}
                custom={i}
                whileHover={{ backgroundColor: "rgba(255,255,255,0.01)", transition: { duration: 0.15 } }}
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
