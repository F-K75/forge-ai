import { COLORS } from "../lib/theme"
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"
import { useRef, useEffect } from "react"
import gsap from "gsap"

type Status = "complete" | "debugging" | "failed" | "running" | "pending" | "consolidating"

const MAP: Record<Status, { label: string; color: string }> = {
  complete:      { label: "complete",      color: COLORS.ok },
  running:       { label: "running",       color: COLORS.accent },
  debugging:     { label: "debugging",     color: COLORS.warn },
  failed:        { label: "failed",        color: COLORS.error },
  pending:       { label: "pending",       color: COLORS.muted },
  consolidating: { label: "consolidating", color: COLORS.accent },
}

export function StatusPill({ status }: { status: Status }) {
  const s = MAP[status]
  const pillRef = useRef<HTMLSpanElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion || !pillRef.current) return
    gsap.from(pillRef.current, {
      scale: 0.5,
      opacity: 0,
      duration: 0.4,
      ease: "back.out(2)",
    })
  }, [status, reduceMotion])

  return (
    <motion.span
      ref={pillRef}
      className="text-[10px] font-medium px-2 py-0.5 text-center inline-block"
      style={{ background: `${s.color}1A`, color: s.color }}
      initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileHover={reduceMotion ? {} : { scale: 1.1 }}
      whileTap={reduceMotion ? {} : { scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
    >
      {s.label}
    </motion.span>
  )
}
