import { RunSectionLabel, RunCard } from "../AgentRunShell";
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

export interface DecisionOption {
  name: string;
  engCost: string;
  timeToShip: string;
  supportLoad: string;
  score: number;
  recommended?: boolean;
}

export interface DecisionEnginePaneProps {
  options: DecisionOption[];
  recommendation: string;
  onApprove?: () => void;
  onRequestRevision?: () => void;
}

export function DecisionEnginePane({
  options,
  recommendation,
  onApprove,
  onRequestRevision,
}: DecisionEnginePaneProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <RunSectionLabel>Option matrix — weighted score</RunSectionLabel>
      <motion.div
        className="overflow-x-auto"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="border-b border-border-soft text-left text-[10px] uppercase tracking-wider text-faint">
              <th className="pb-2 pr-3 font-medium">Option</th>
              <th className="pb-2 pr-3 font-medium">Eng. cost</th>
              <th className="pb-2 pr-3 font-medium">Time to ship</th>
              <th className="pb-2 pr-3 font-medium">Support load ↓</th>
              <th className="pb-2 font-medium text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {options.map((o, idx) => (
              <motion.tr
                key={o.name}
                className={`border-b border-border-soft last:border-0 ${o.recommended ? "bg-accent-soft" : ""}`}
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + idx * 0.05 }}
                whileHover={reduceMotion ? {} : { backgroundColor: "rgba(255,255,255,0.02)" }}
              >
                <td className="py-2.5 pr-3">
                  <span className={o.recommended ? "font-semibold text-ink" : "text-ink"}>{o.name}</span>
                </td>
                <td className="py-2.5 pr-3 text-muted">{o.engCost}</td>
                <td className="py-2.5 pr-3 text-muted">{o.timeToShip}</td>
                <td className="py-2.5 pr-3 text-muted">{o.supportLoad}</td>
                <td className="py-2.5 text-right font-mono tabular-nums">
                  {o.recommended ? <b>{o.score.toFixed(1)}</b> : o.score.toFixed(1)}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </motion.div>

      <motion.div
        className="mt-3.5"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <RunCard>
          <p className="mb-1.5 text-[13px] font-semibold text-ink">Recommendation</p>
          <p className="text-[12.5px] leading-relaxed text-muted">{recommendation}</p>
        </RunCard>
      </motion.div>

      <motion.div
        className="mt-4 flex gap-2 border-t border-border-soft pt-4"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <motion.button
          type="button"
          onClick={onApprove}
          className="bb-btn bb-btn-primary"
          whileHover={reduceMotion ? {} : { scale: 1.02 }}
          whileTap={reduceMotion ? {} : { scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          Approve recommendation
        </motion.button>
        <motion.button
          type="button"
          onClick={onRequestRevision}
          className="bb-btn bb-btn-subtle"
          whileHover={reduceMotion ? {} : { scale: 1.02 }}
          whileTap={reduceMotion ? {} : { scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          Request revision
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
