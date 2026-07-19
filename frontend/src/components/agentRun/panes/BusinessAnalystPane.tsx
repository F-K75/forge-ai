import { RunSectionLabel, RunCard } from "../AgentRunShell";
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

export interface BusinessAnalystPaneProps {
  problem: string;
  users: string[];
  assumptions: { text: string; flagged?: boolean }[];
}

export function BusinessAnalystPane({ problem, users, assumptions }: BusinessAnalystPaneProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="flex flex-col gap-2.5"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <RunSectionLabel>Brief outline</RunSectionLabel>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <RunCard>
          <p className="mb-1.5 text-[13px] font-semibold text-ink">Problem statement</p>
          <p className="text-[12.5px] leading-relaxed text-muted">{problem}</p>
        </RunCard>
      </motion.div>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <RunCard>
          <p className="mb-1.5 text-[13px] font-semibold text-ink">Primary users</p>
          <div className="flex flex-wrap gap-1.5">
            {users.map((u, idx) => (
              <motion.span
                key={u}
                className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted"
                initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 + idx * 0.03 }}
              >
                {u}
              </motion.span>
            ))}
          </div>
        </RunCard>
      </motion.div>
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <RunCard>
          <p className="mb-1.5 text-[13px] font-semibold text-ink">
            Assumptions{" "}
            <span className="ml-1 rounded border border-border px-1.5 py-0.5 text-[10px] font-normal text-faint">
              {assumptions.filter((a) => a.flagged).length} flagged
            </span>
          </p>
          <ul className="flex flex-col gap-1 text-[12.5px] leading-relaxed">
            {assumptions.map((a, i) => (
              <motion.li
                key={i}
                className={a.flagged ? "text-warn" : "text-muted"}
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.04 }}
              >
                — {a.flagged ? <>Unconfirmed: {a.text}</> : a.text}
              </motion.li>
            ))}
          </ul>
        </RunCard>
      </motion.div>
    </motion.div>
  );
}
