import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

interface ToggleProps {
  on: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}

export function Toggle({ on, onChange, label, disabled = false }: ToggleProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={[
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:ring-offset-base",
        on ? "bg-ink" : "bg-border",
      ].join(" ")}
      whileTap={reduceMotion ? {} : { scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
    >
      <motion.span
        className="pointer-events-none block h-4 w-4 rounded-full shadow-sm"
        animate={{
          x: on ? 16 : 0,
          backgroundColor: on ? "var(--color-base, #fff)" : "var(--color-ink, #1a1a1a)",
        }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </motion.button>
  )
}
