import type { ReactNode } from "react"
import { X } from "lucide-react"
import type { GatewayAgent } from "../../lib/gatewayAgents"
import { motion, useReducedMotion } from "motion/react"
import { useRef, useEffect } from "react"
import gsap from "gsap"

export type RunStatus = "running" | "needs_review" | "done"

const STATUS_LABEL: Record<RunStatus, string> = {
  running: "Running",
  needs_review: "Needs review",
  done: "Done",
}

const STATUS_CLASS: Record<RunStatus, string> = {
  running: "text-accent border-accent/30 bg-accent-soft",
  needs_review: "text-warn border-warn/30 bg-warn/10",
  done: "text-ok border-ok/30 bg-ok/10",
}

const STATUS_DOT_CLASS: Record<RunStatus, string> = {
  running: "bg-accent",
  needs_review: "bg-warn",
  done: "bg-ok",
}

export function RunStatusPill({ status, label }: { status: RunStatus; label?: string }) {
  const reduceMotion = useReducedMotion()
  const dotRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (reduceMotion || !dotRef.current) return
    if (status === "running") {
      gsap.to(dotRef.current, {
        opacity: 0.3,
        duration: 0.8,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      })
    }
  }, [status, reduceMotion])

  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-medium ${STATUS_CLASS[status]}`}
    >
      <span ref={dotRef} className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASS[status]}`} aria-hidden="true" />
      {label ?? STATUS_LABEL[status]}
    </span>
  )
}

export interface RunSideMetric {
  label: string
  value: string
}

export interface RunLogLine {
  time: string
  text: string
  emphasis?: "accent" | "ok" | "warn" | "error"
}

export interface AgentRunShellProps {
  agent: GatewayAgent
  runId: string
  runTitle: string
  runMeta: string
  status: RunStatus
  statusLabel?: string
  progressPct?: number
  sideMetrics?: RunSideMetric[]
  sideExtra?: { label: string; content: ReactNode }
  log?: RunLogLine[]
  onDismiss?: () => void
  children: ReactNode
}

const EMPHASIS_CLASS: Record<NonNullable<RunLogLine["emphasis"]>, string> = {
  accent: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  error: "text-error",
}

export function AgentRunShell({
  agent,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  runId,
  runTitle,
  runMeta,
  status,
  statusLabel,
  progressPct,
  sideMetrics = [],
  sideExtra,
  log,
  onDismiss,
  children,
}: AgentRunShellProps) {
  const Icon = agent.icon
  const shellRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion || !shellRef.current) return
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } })
    tl.from(shellRef.current.querySelector("[data-shell-header]")!, {
      opacity: 0,
      y: -12,
      duration: 0.4,
    })
    if (sideMetrics.length > 0) {
      tl.from(
        shellRef.current.querySelectorAll("[data-shell-metric]"),
        { opacity: 0, x: 10, stagger: 0.05, duration: 0.35 },
        "-=0.15"
      )
    }
    if (log && log.length > 0) {
      tl.from(
        shellRef.current.querySelectorAll("[data-log-line]"),
        { opacity: 0, x: -8, stagger: 0.04, duration: 0.3 },
        "-=0.1"
      )
    }
  }, [reduceMotion, log, sideMetrics])

  return (
    <motion.div
      ref={shellRef}
      className="bb-panel overflow-hidden"
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <div
        data-shell-header
        className="flex flex-wrap items-center justify-between gap-3 border-b border-border-soft px-5 py-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${agent.hue}24`, color: agent.hue }}
          >
            <Icon size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink font-display">{runTitle}</p>
            <p className="truncate font-mono text-[11px] text-faint">{runMeta}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <RunStatusPill status={status} label={statusLabel} />
          {onDismiss && (
            <motion.button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="bb-btn bb-btn-icon bb-btn-ghost"
              whileHover={reduceMotion ? {} : { scale: 1.1, rotate: 90 }}
              whileTap={reduceMotion ? {} : { scale: 0.9 }}
              transition={{ type: "spring", stiffness: 400, damping: 15 }}
            >
              <X size={12} aria-hidden="true" />
            </motion.button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px]">
        <div className="border-b border-border-soft p-5 md:border-b-0 md:border-r">{children}</div>

        <div className="flex flex-col gap-5 p-4">
          {(sideMetrics.length > 0 || typeof progressPct === "number") && (
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-faint">Run</p>
              <dl className="flex flex-col gap-1">
                {sideMetrics.map((m) => (
                  <div key={m.label} data-shell-metric className="flex items-center justify-between text-xs">
                    <dt className="text-muted">{m.label}</dt>
                    <dd className="font-mono text-ink">{m.value}</dd>
                  </div>
                ))}
              </dl>
              {typeof progressPct === "number" && (
                <div className="mt-2.5 h-[3px] overflow-hidden bg-panel-alt">
                  <motion.div
                    className="h-full bg-accent"
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPct}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              )}
            </div>
          )}

          {sideExtra && (
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-faint">
                {sideExtra.label}
              </p>
              {sideExtra.content}
            </div>
          )}

          {log && log.length > 0 && (
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-faint">Log</p>
              <div className="flex flex-col gap-1.5 font-mono text-[10.5px] leading-relaxed text-muted">
                {log.map((l, i) => (
                  <motion.div
                    key={i}
                    data-log-line
                    initial={reduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.06 }}
                  >
                    <span className={l.emphasis ? EMPHASIS_CLASS[l.emphasis] : "text-faint"}>
                      [{l.time}]
                    </span>{" "}
                    {l.text}
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export function RunCard({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={`rounded-lg border p-3.5 ${
        accent ? "border-accent/30 bg-accent-soft" : "bb-card"
      }`}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={reduceMotion ? {} : { y: -1, transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}

export function RunSectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-faint">{children}</p>
}
