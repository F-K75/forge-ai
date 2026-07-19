import { RunSectionLabel } from "../AgentRunShell";
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"
import type { RunLogLine } from "../AgentRunShell"

const EMPHASIS_CLASS: Record<NonNullable<RunLogLine["emphasis"]>, string> = {
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  error: "text-error",
}

export function TaskExecutorPane({ lines }: { lines: RunLogLine[] }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="-m-5 rounded-l-2xl bg-panel-alt p-5 md:rounded-l-2xl md:rounded-r-none"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <RunSectionLabel>Execution log</RunSectionLabel>
      <div className="flex flex-col gap-2 font-mono text-[11.5px] leading-relaxed">
        {lines.map((l, i) => (
          <motion.div
            key={i}
            initial={reduceMotion ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.03 * i }}
          >
            <span className="text-faint">[{l.time}]</span>{" "}
            <span className={l.emphasis ? EMPHASIS_CLASS[l.emphasis] : "text-muted"}>{l.text}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
