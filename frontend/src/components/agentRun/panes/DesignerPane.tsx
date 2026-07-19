import { RunSectionLabel } from "../AgentRunShell";
import { motion } from "motion/react"
import { useReducedMotion } from "motion/react"

export interface DesignerOption {
  label: string;
  recommended?: boolean;
  rendering?: boolean;
}

export function DesignerPane({ options }: { options: DesignerOption[] }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <RunSectionLabel>Layout options</RunSectionLabel>
      <div className="grid grid-cols-3 gap-2.5">
        {options.map((o, idx) => (
          <motion.div
            key={o.label}
            className={`flex aspect-[4/3] flex-col gap-1.5 rounded-lg border p-2.5 ${
              o.recommended ? "border-accent/40 bg-accent-soft" : "bb-card"
            } ${o.rendering ? "opacity-60" : ""}`}
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.1 + idx * 0.06, type: "spring", stiffness: 300, damping: 22 }}
            whileHover={reduceMotion || o.rendering ? {} : { y: -3, scale: 1.02 }}
          >
            <p className={`text-[10.5px] ${o.recommended ? "text-accent" : "text-faint"}`}>
              {o.label}
              {o.recommended && " ★"}
            </p>
            <div
              className={`flex flex-1 flex-col justify-center gap-1 rounded-md border border-dashed p-2 ${
                o.recommended ? "border-accent/40" : "border-border"
              }`}
            >
              {!o.rendering && (
                <>
                  <motion.div
                    className="h-1.5 w-2/3 rounded bg-border"
                    initial={reduceMotion ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.2 + idx * 0.08, duration: 0.4 }}
                  />
                  <motion.div
                    className="h-3.5 w-full rounded bg-panel-alt"
                    initial={reduceMotion ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.25 + idx * 0.08, duration: 0.4 }}
                  />
                  <motion.div
                    className="mt-1 h-2.5 w-2/5 rounded bg-accent/40"
                    initial={reduceMotion ? false : { scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: 0.3 + idx * 0.08, duration: 0.4 }}
                  />
                </>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
