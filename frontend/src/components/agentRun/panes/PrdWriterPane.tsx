import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

export interface PrdWriterPaneProps {
  sections: string[];
  activeSectionIndex: number;
  activeHeading: string;
  activeBody: string;
}

export function PrdWriterPane({ sections, activeSectionIndex, activeHeading, activeBody }: PrdWriterPaneProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="grid grid-cols-[150px_1fr] gap-5"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <motion.div
        className="border-r border-border-soft pr-4"
        initial={reduceMotion ? false : { opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1 }}
      >
        <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-faint">Contents</p>
        <div className="flex flex-col gap-2 text-xs">
          {sections.map((s, i) => (
            <motion.span
              key={s}
              className={
                i === activeSectionIndex
                  ? "text-accent font-medium"
                  : i < activeSectionIndex
                  ? "text-ink"
                  : "text-muted"
              }
              initial={reduceMotion ? false : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12 + i * 0.04 }}
            >
              {i + 1}. {s}
            </motion.span>
          ))}
        </div>
      </motion.div>
      <motion.div
        key={activeSectionIndex}
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
      >
        <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-faint">
          {activeSectionIndex + 1}. {sections[activeSectionIndex]}
        </p>
        <h4 className="mb-2 text-sm font-semibold text-ink font-display">{activeHeading}</h4>
        <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-muted">{activeBody}</p>
      </motion.div>
    </motion.div>
  );
}
