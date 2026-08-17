import { RunSectionLabel } from "../AgentRunShell";
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

export interface CapacityRow {
  team: string;
  used: number;
  capacity: number;
}

export function SprintPlannerPane({
  rows,
  onApprove,
  onRebalance,
}: {
  rows: CapacityRow[];
  onApprove?: () => void;
  onRebalance?: () => void;
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <RunSectionLabel>Capacity vs. committed</RunSectionLabel>
      <div className="flex flex-col gap-2.5">
        {rows.map((r, idx) => {
          const pct = Math.min(100, Math.round((r.used / r.capacity) * 100))
          const over = r.used > r.capacity
          return (
            <motion.div
              key={r.team}
              className="bb-card p-3.5"
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * idx }}
              whileHover={reduceMotion ? {} : { y: -1 }}
            >
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-ink">{r.team}</span>
                <span className={`font-mono tabular-nums ${over ? "text-warn" : "text-muted"}`}>
                  {r.used}h / {r.capacity}h
                </span>
              </div>
              <div className="h-[3px] overflow-hidden bg-panel-alt">
                <motion.div
                  className={`h-full ${over ? "bg-warn" : pct > 80 ? "bg-ok" : "bg-accent"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.2 + idx * 0.08, duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </motion.div>
          )
        })}
      </div>
      <motion.div
        className="mt-4 flex gap-2 border-t border-border-soft pt-4"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <motion.button
          type="button"
          onClick={onApprove}
          className="bb-btn bb-btn-primary"
          whileHover={reduceMotion ? {} : { scale: 1.02 }}
          whileTap={reduceMotion ? {} : { scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          Approve sprint
        </motion.button>
        <motion.button
          type="button"
          onClick={onRebalance}
          className="bb-btn bb-btn-subtle"
          whileHover={reduceMotion ? {} : { scale: 1.02 }}
          whileTap={reduceMotion ? {} : { scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          Rebalance backend
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
