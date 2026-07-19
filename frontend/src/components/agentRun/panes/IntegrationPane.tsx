import { RunSectionLabel, RunCard, RunStatusPill } from "../AgentRunShell";
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

export interface ConnectedSystem {
  label: string;
  ok: boolean;
}

export function IntegrationPane({ systems }: { systems: ConnectedSystem[] }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="flex flex-col gap-2.5"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <RunSectionLabel>Connected systems</RunSectionLabel>
      {systems.map((s, idx) => (
        <motion.div
          key={s.label}
          initial={reduceMotion ? false : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.06 * idx }}
          whileHover={reduceMotion ? {} : { x: 4 }}
        >
          <RunCard>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-ink">{s.label}</span>
              <RunStatusPill status={s.ok ? "done" : "needs_review"} label={s.ok ? "ok" : "check"} />
            </div>
          </RunCard>
        </motion.div>
      ))}
    </motion.div>
  );
}
