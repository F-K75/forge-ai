import type { ReactNode } from "react"
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

export function SummaryChip({
  label,
  value,
  icon,
  warn = false,
}: {
  label: string
  value: string
  icon?: ReactNode
  warn?: boolean
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="bg-base px-4 py-3.5 rounded-lg border border-border"
      initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={reduceMotion ? {} : { y: -2, scale: 1.02, transition: { type: "spring", stiffness: 400, damping: 25 } }}
      whileTap={reduceMotion ? {} : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
    >
      <p className="text-[10px] uppercase tracking-[0.1em] text-faint mb-1.5">{label}</p>
      <div className="flex items-center gap-1.5">
        {icon}
        <span
          className={`font-mono text-base font-medium ${
            warn ? "text-warn" : "text-ink"
          }`}
        >
          {value}
        </span>
      </div>
    </motion.div>
  )
}
