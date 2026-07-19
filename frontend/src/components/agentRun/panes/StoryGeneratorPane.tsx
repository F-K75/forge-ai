import { RunSectionLabel, RunCard } from "../AgentRunShell";
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

export interface StoryRow {
  statement: string;
  acceptanceCriteria: string[];
  generating?: boolean;
}

export function StoryGeneratorPane({ stories }: { stories: StoryRow[] }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="flex flex-col gap-2.5"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <RunSectionLabel>Stories</RunSectionLabel>
      {stories.map((s, idx) => (
        <motion.div
          key={idx}
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 * idx }}
          whileHover={reduceMotion ? {} : { y: -1 }}
        >
          <RunCard>
            <motion.p
              className={`text-[13px] font-semibold ${s.generating ? "text-muted" : "text-ink"}`}
              animate={s.generating ? { opacity: [1, 0.5, 1] } : {}}
              transition={s.generating ? { repeat: Infinity, duration: 1.5 } : {}}
            >
              {s.statement}
            </motion.p>
            {s.generating ? (
              <p className="mt-2 font-mono text-[10.5px] text-faint">generating acceptance criteria…</p>
            ) : (
              <>
                <p className="mb-1.5 mt-2 text-[10px] uppercase tracking-wider text-faint">Acceptance criteria</p>
                <ul className="flex flex-col gap-1 text-xs text-muted">
                  {s.acceptanceCriteria.map((c, j) => (
                    <motion.li
                      key={j}
                      initial={reduceMotion ? false : { opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.15 + j * 0.05 }}
                    >
                      <span className="text-ok">✓</span> {c}
                    </motion.li>
                  ))}
                </ul>
              </>
            )}
          </RunCard>
        </motion.div>
      ))}
    </motion.div>
  );
}
