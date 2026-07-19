import type { ReactElement } from "react"
import { ResponsiveContainer } from "recharts"
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

export function ChartContainer({
  height = 220,
  children,
}: {
  height?: number
  children: ReactElement
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, scaleY: 0.85, transformOrigin: "bottom" }}
      animate={{ opacity: 1, scaleY: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </motion.div>
  )
}
