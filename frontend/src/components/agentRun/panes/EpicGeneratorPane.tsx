import { RunSectionLabel, RunCard } from "../AgentRunShell";
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

export interface EpicRow {
  title: string;
  area: string;
  storyCount: string;
  priority: "P0" | "P1" | "P2";
}

const PRIORITY_CLASS: Record<EpicRow["priority"], string> = {
  P0: "text-warn border-warn/30",
  P1: "text-muted border-border",
  P2: "text-muted border-border",
}

export function EpicGeneratorPane({ epics }: { epics: EpicRow[] }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="flex flex-col gap-2.5"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <RunSectionLabel>Epics</RunSectionLabel>
      {epics.map((e, idx) => (
        <motion.div
          key={e.title}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 * idx }}
          whileHover={reduceMotion ? {} : { y: -2 }}
        >
          <RunCard>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink">{e.title}</p>
                <p className="mt-0.5 text-[11.5px] text-faint">{e.area}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="rounded border border-border px-2 py-0.5 text-[10.5px] text-muted">
                  {e.storyCount}
                </span>
                <span className={`rounded border px-2 py-0.5 text-[10.5px] ${PRIORITY_CLASS[e.priority]}`}>
                  {e.priority}
                </span>
              </div>
            </div>
          </RunCard>
        </motion.div>
      ))}
    </motion.div>
  );
}
