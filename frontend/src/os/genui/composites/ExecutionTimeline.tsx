/**
 * ExecutionTimeline composite (WS-B): live view of a kernel run.
 *
 * Two sources, merged and de-duplicated:
 *  1. `agent.progress` events bridged into the OS session stream (the
 *     reliable, multi-worker path; read from the surface store), and
 *  2. a direct AG-UI subscription (`subscribeAguiStream`) for runs whose
 *     events are not bridged. Disable it with GenUIProvider subscribeAgui={null}.
 */
import { useEffect, useMemo, useState } from "react"
import { useStore } from "zustand"
import clsx from "clsx"
import { Badge as UiBadge } from "../../../components/ui/Badge"
import { subscribeAguiStream, type AGUIEvent } from "../../../lib/kernelApi"
import type { CompositeComponentProps } from "../../contracts"
import { useGenUI } from "../context"
import { CARD, humanize, statusVariant } from "../registry/styles"
import { runKey } from "../surfaceStore"

export interface ExecutionTimelineProps {
  projectId: string
  runId: string
  [key: string]: unknown
}

export interface TimelineItem {
  key: string
  aguiType: string
  kernelEvent: string
  payload: Record<string, unknown>
  ts: string | null
}

export const MAX_TIMELINE_ITEMS = 500

type RunState = "running" | "completed" | "failed" | "pending"

function itemStatus(aguiType: string): string {
  switch (aguiType) {
    case "RUN_FINISHED":
    case "STEP_FINISHED":
      return "completed"
    case "RUN_ERROR":
      return "failed"
    case "RUN_STARTED":
    case "STEP_STARTED":
      return "running"
    default:
      return "info"
  }
}

function describe(item: TimelineItem): string {
  const p = item.payload
  const base = humanize(item.kernelEvent.replace(/^kernel_/, "") || item.aguiType.toLowerCase())
  const bits: string[] = []
  if (typeof p.wave_index === "number") bits.push(`wave ${p.wave_index}`)
  for (const k of ["title", "task_title", "role", "gate_name", "tool_name"]) {
    if (typeof p[k] === "string" && p[k]) bits.push(String(p[k]).slice(0, 120))
  }
  return bits.length ? `${base} · ${bits.join(" · ")}` : base
}

function dedupeKey(aguiType: string, kernelEvent: string, payload: unknown): string {
  let body = ""
  try {
    body = JSON.stringify(payload) ?? ""
  } catch {
    body = ""
  }
  return `${aguiType}|${kernelEvent}|${body.slice(0, 500)}`
}

export function ExecutionTimeline({ props }: CompositeComponentProps<ExecutionTimelineProps>) {
  const { store, subscribeAgui } = useGenUI()
  const projectId = typeof props.projectId === "string" ? props.projectId : ""
  const runId = typeof props.runId === "string" ? props.runId : ""
  const bridged = useStore(store, (s) => s.progress[runKey(projectId, runId)])
  const [direct, setDirect] = useState<AGUIEvent[]>([])

  const subscribe = subscribeAgui === undefined ? subscribeAguiStream : subscribeAgui
  useEffect(() => {
    setDirect([])
    if (!subscribe || !projectId || !runId) return
    return subscribe(projectId, runId, (event) => {
      if (event.agui_type === "HEARTBEAT") return
      setDirect((prev) => [...prev, event].slice(-MAX_TIMELINE_ITEMS))
    })
  }, [subscribe, projectId, runId])

  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: TimelineItem[] = []
    const add = (aguiType: string, kernelEvent: string, payload: Record<string, unknown>, ts: string | null) => {
      const key = dedupeKey(aguiType, kernelEvent, payload)
      if (seen.has(key)) return
      seen.add(key)
      out.push({ key, aguiType, kernelEvent, payload, ts })
    }
    for (const p of bridged ?? []) add(p.agui_type, p.kernel_event, p.payload, p.ts)
    for (const e of direct) add(e.agui_type, e.kernel_event, e.payload ?? {}, e.timestamp ?? null)
    return out.slice(-MAX_TIMELINE_ITEMS)
  }, [bridged, direct])

  const last = items[items.length - 1]
  const state: RunState = !last
    ? "pending"
    : last.aguiType === "RUN_FINISHED"
      ? "completed"
      : last.aguiType === "RUN_ERROR"
        ? "failed"
        : "running"

  return (
    <section className={clsx(CARD, "flex flex-col gap-3 p-4")} aria-label={`Run ${runId}`} data-a2ui="ExecutionTimeline">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body font-medium text-ink">Execution</p>
          <p className="truncate font-mono text-xs text-faint">{runId}</p>
        </div>
        <UiBadge variant={state === "pending" ? "default" : state === "running" ? "accent" : statusVariant(state)} dot={state === "running"}>
          {state === "pending" ? "Waiting" : humanize(state)}
        </UiBadge>
      </div>
      {items.length === 0 ? (
        <p role="status" className="text-caption text-muted">
          Waiting for the run to report progress…
        </p>
      ) : (
        <div role="log" aria-live="polite" aria-label="Run progress">
        <ol className="relative flex flex-col gap-2.5 border-l border-border pl-4">
          {items.map((item) => {
            const status = itemStatus(item.aguiType)
            return (
              <li key={item.key} className="relative">
                <span
                  aria-hidden="true"
                  className={clsx(
                    "absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full",
                    status === "completed" ? "bg-ok" : status === "failed" ? "bg-error" : status === "running" ? "bg-accent" : "bg-faint"
                  )}
                />
                <p className="text-caption text-ink">
                  {describe(item)}
                  <span className="sr-only"> ({humanize(status)})</span>
                </p>
                {item.ts && <time className="font-mono text-2xs tabular-nums text-faint">{item.ts}</time>}
              </li>
            )
          })}
        </ol>
        </div>
      )}
    </section>
  )
}

export default ExecutionTimeline
