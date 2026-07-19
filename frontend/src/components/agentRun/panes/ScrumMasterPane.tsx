import { RunSectionLabel, RunCard } from "../AgentRunShell";
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

export interface ScrumRollup {
  onTrack: number;
  blocked: number;
  atRisk: number;
  blockerNote?: string;
}

export function ScrumMasterPane({ rollup }: { rollup: ScrumRollup }) {
  const reduceMotion = useReducedMotion()

  const items = [
    { label: "On track", value: rollup.onTrack, color: "text-ok" as const, note: undefined },
    { label: "Blocked", value: rollup.blocked, color: "text-error" as const, note: rollup.blockerNote },
    { label: "At risk", value: rollup.atRisk, color: "text-warn" as const, note: undefined },
  ]

  return (
    <motion.div
      className="flex flex-col gap-2.5"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <RunSectionLabel>Standup summary</RunSectionLabel>
      {items.map((item, idx) => (
        <motion.div
          key={item.label}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 * idx }}
          whileHover={reduceMotion ? {} : { y: -1 }}
        >
          <RunCard accent={item.label === "Blocked"}>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-ink">{item.label}</span>
              <span className={`font-mono tabular-nums ${item.color}`}>{item.value}</span>
            </div>
            {item.note && (
              <motion.p
                className="mt-1.5 text-xs leading-relaxed text-muted"
                initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + idx * 0.08 }}
              >
                {item.note}
              </motion.p>
            )}
          </RunCard>
        </motion.div>
      ))}
    </motion.div>
  );
}
