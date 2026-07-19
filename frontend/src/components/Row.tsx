import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

interface RowProps {
  label: React.ReactNode
  description?: string
  children: React.ReactNode
}

export function Row({ label, description, children }: RowProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className="flex items-center justify-between px-4 py-3.5 border-t first:border-t-0 border-border-soft"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduceMotion ? {} : { backgroundColor: "rgba(255,255,255,0.02)" }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="mr-4 min-w-0">
        <p className="text-sm text-ink">{label}</p>
        {description && (
          <p className="text-xs text-faint mt-0.5 break-all">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </motion.div>
  )
}
