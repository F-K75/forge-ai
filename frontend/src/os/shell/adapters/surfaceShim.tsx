/**
 * TEMPORARY stand-in for WS-B's surface store + `<SurfaceView />`
 * (src/os/genui/**). It applies A2UI v1.0 messages in order and renders a
 * small, safe subset of the Forge Ember catalog with plain React elements (no
 * HTML strings, no URLs, no styles from data). Anything else renders as a
 * neutral placeholder. Delete this file once ./index.ts points at WS-B.
 */
import { useMemo, type ReactNode } from "react"
import { create } from "zustand"
import { Check, Circle, Loader2, X } from "lucide-react"
import type { A2UIAction, A2UIComponent, A2UIServerMessage, JsonObject, OsId, StoredSurface } from "../../contracts"

interface ShimSurface {
  components: Record<string, A2UIComponent>
  dataModel: JsonObject
  version: number
}

interface ShimStore {
  surfaces: Record<OsId, ShimSurface>
}

const useShimStore = create<ShimStore>()(() => ({ surfaces: {} }))

function setPointer(root: JsonObject, path: string, value: unknown): JsonObject {
  if (!path || path === "/") return (value && typeof value === "object" ? value : {}) as JsonObject
  const parts = path.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"))
  const next: JsonObject = structuredClone(root)
  let cur: Record<string, unknown> = next
  parts.forEach((p, i) => {
    if (i === parts.length - 1) cur[p] = value
    else {
      if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {}
      cur = cur[p] as Record<string, unknown>
    }
  })
  return next
}

function getPointer(root: unknown, path: string): unknown {
  if (!path || path === "/") return root
  let cur: unknown = root
  for (const raw of path.split("/").slice(1)) {
    const p = raw.replace(/~1/g, "/").replace(/~0/g, "~")
    if (cur === null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

export function shimApplyMessage(message: A2UIServerMessage) {
  useShimStore.setState((s) => {
    const surfaces = { ...s.surfaces }
    if ("createSurface" in message) {
      const c = message.createSurface
      surfaces[c.surfaceId] = {
        components: Object.fromEntries((c.components ?? []).map((x) => [x.id, x])),
        dataModel: c.dataModel ?? {},
        version: 1,
      }
    } else if ("updateComponents" in message) {
      const u = message.updateComponents
      const cur = surfaces[u.surfaceId]
      if (!cur) return s
      surfaces[u.surfaceId] = {
        ...cur,
        components: { ...cur.components, ...Object.fromEntries(u.components.map((x) => [x.id, x])) },
        version: cur.version + 1,
      }
    } else if ("updateDataModel" in message) {
      const u = message.updateDataModel
      const cur = surfaces[u.surfaceId]
      if (!cur) return s
      surfaces[u.surfaceId] = { ...cur, dataModel: setPointer(cur.dataModel, u.path ?? "", u.value), version: cur.version + 1 }
    } else if ("deleteSurface" in message) {
      delete surfaces[message.deleteSurface.surfaceId]
    }
    return { surfaces }
  })
}

export function shimHydrate(stored: StoredSurface) {
  useShimStore.setState((s) => ({
    surfaces: {
      ...s.surfaces,
      [stored.surface_id]: {
        components: Object.fromEntries(stored.components.map((x) => [x.id, x])),
        dataModel: stored.data_model,
        version: stored.version,
      },
    },
  }))
}

export function shimHasSurface(surfaceId: OsId): boolean {
  return Boolean(useShimStore.getState().surfaces[surfaceId])
}

type Dispatch = (action: A2UIAction, sourceComponentId: string) => void

const str = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "string" ? v : String(v))

function fmtCell(v: unknown, type?: string): string {
  if (type === "currency" && typeof v === "number") {
    return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 })
  }
  if (typeof v === "number") return v.toLocaleString()
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return str(v)
}

const TONE: Record<string, string> = {
  neutral: "bg-ink/[0.06] text-muted",
  accent: "bg-accent/[0.12] text-accent",
  info: "bg-info/[0.12] text-info",
  success: "bg-ok/[0.12] text-ok",
  warning: "bg-warn/[0.12] text-warn",
  error: "bg-error/[0.12] text-error",
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <Check size={13} className="text-ok" aria-hidden="true" />
  if (status === "running") return <Loader2 size={13} className="animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
  if (status === "failed" || status === "rejected") return <X size={13} className="text-error" aria-hidden="true" />
  return <Circle size={11} className="text-faint" aria-hidden="true" />
}

function Node({ id, s, dispatch }: { id: string; s: ShimSurface; dispatch: Dispatch }): ReactNode {
  const c = s.components[id]
  if (!c) return null
  const resolve = (v: unknown): unknown =>
    v && typeof v === "object" && "@path" in (v as object) ? getPointer(s.dataModel, (v as { "@path": string })["@path"]) : v
  const kids = (v: unknown) =>
    Array.isArray(v) ? v.map((k) => <Node key={String(k)} id={String(k)} s={s} dispatch={dispatch} />) : null
  const gap = { none: "gap-0", sm: "gap-2", md: "gap-4", lg: "gap-6" }[str(c.gap) || "md"] ?? "gap-4"

  switch (c.component) {
    case "Column":
      return <div className={`flex flex-col ${gap}`}>{kids(c.children)}</div>
    case "Row":
      return <div className={`flex flex-row ${c.wrap ? "flex-wrap" : ""} ${gap}`}>{kids(c.children)}</div>
    case "Card":
      return (
        <section className="rounded-xl border border-border bg-panel p-4">
          {c.title ? <h3 className="mb-3 text-caption font-medium text-ink">{str(resolve(c.title))}</h3> : null}
          <div className="flex flex-col gap-3">{kids(c.children)}</div>
        </section>
      )
    case "Divider":
      return <hr className="border-border-soft" />
    case "Heading": {
      const level = Number(c.level) || 2
      const cls = level <= 1 ? "text-title" : level === 2 ? "text-body font-medium" : "text-caption font-medium"
      return <p role="heading" aria-level={level} className={`${cls} text-ink`}>{str(resolve(c.text))}</p>
    }
    case "Text": {
      const v = str(c.variant)
      const cls = v === "muted" || v === "caption" ? "text-caption text-muted" : v === "mono" ? "font-mono text-caption text-ink" : "text-body text-ink"
      return <p className={`whitespace-pre-wrap ${cls}`}>{str(resolve(c.text))}</p>
    }
    case "Badge":
      return <span className={`inline-flex w-fit rounded-pill px-2 py-0.5 text-xs ${TONE[str(c.tone) || "neutral"]}`}>{str(resolve(c.text))}</span>
    case "Callout":
      return (
        <div role="status" className={`rounded-lg px-4 py-3 ${TONE[str(c.tone) || "info"]}`}>
          {c.title ? <p className="text-caption font-medium">{str(resolve(c.title))}</p> : null}
          <p className="text-caption text-ink/80">{str(resolve(c.text))}</p>
        </div>
      )
    case "MetricRow":
      return (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-soft bg-border-soft sm:grid-cols-3">
          {((c.items as { label: string; value: unknown; delta?: unknown }[]) ?? []).map((m) => (
            <div key={m.label} className="bg-panel px-4 py-3">
              <dt className="text-xs text-muted">{m.label}</dt>
              <dd className="mt-1 flex items-baseline gap-2">
                <span className="font-mono text-title tabular-nums text-ink">{str(resolve(m.value))}</span>
                {m.delta ? <span className="font-mono text-xs tabular-nums text-ok">{str(resolve(m.delta))}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      )
    case "ProgressBar": {
      const value = Number(resolve(c.value)) || 0
      const max = Number(resolve(c.max)) || 1
      const pct = Math.max(0, Math.min(100, (value / max) * 100))
      return (
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>{str(resolve(c.label))}</span>
            <span className="font-mono tabular-nums">{value}/{max}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-pill bg-ink/[0.08]" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={str(resolve(c.label))}>
            <div className="h-full rounded-pill bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )
    }
    case "DataTable": {
      const cols = (c.columns as { key: string; label: string; type?: string }[]) ?? []
      const rows = (resolve(c.rows) as Record<string, unknown>[] | undefined) ?? []
      return (
        <div className="overflow-x-auto rounded-lg border border-border-soft">
          <table className="w-full text-left text-caption">
            <thead>
              <tr className="border-b border-border-soft text-xs text-muted">
                {cols.map((col) => (
                  <th key={col.key} scope="col" className={`px-3 py-2 font-medium ${col.type === "currency" || col.type === "number" ? "text-right" : ""}`}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border-soft last:border-0">
                  {cols.map((col) => (
                    <td key={col.key} className={`px-3 py-2 text-ink ${col.type === "currency" || col.type === "number" ? "text-right font-mono tabular-nums" : ""}`}>{fmtCell(r[col.key], col.type)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case "Chart": {
      const rows = (resolve(c.data) as Record<string, unknown>[] | undefined) ?? []
      const key = ((c.series as { key: string }[])?.[0]?.key) ?? ""
      const max = Math.max(1, ...rows.map((r) => Number(r[key]) || 0))
      return (
        <figure className="rounded-lg border border-border-soft p-4">
          {c.title ? <figcaption className="mb-3 text-xs text-muted">{str(resolve(c.title))}</figcaption> : null}
          <div className="flex h-40 items-end gap-3" role="img" aria-label={`${str(resolve(c.title)) || "Chart"}: ${rows.map((r) => `${str(r[str(c.x)])} ${fmtCell(r[key])}`).join(", ")}`}>
            {rows.map((r, i) => (
              <div key={i} className="flex h-full flex-1 flex-col justify-end gap-1.5">
                <div className="rounded-t-md bg-ink/[0.14] transition-colors hover:bg-accent/70" style={{ height: `${((Number(r[key]) || 0) / max) * 100}%` }} />
                <span className="truncate text-center text-2xs text-muted">{str(r[str(c.x)])}</span>
              </div>
            ))}
          </div>
        </figure>
      )
    }
    case "ComparisonTable": {
      const subjects = (c.subjects as { id: string; label: string }[]) ?? []
      const rows = (c.rows as { label: string; values: unknown[] }[]) ?? []
      return (
        <div className="overflow-x-auto rounded-lg border border-border-soft">
          <table className="w-full text-left text-caption">
            <thead>
              <tr className="border-b border-border-soft text-xs text-muted">
                <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Metric</span></th>
                {subjects.map((sub) => <th key={sub.id} scope="col" className="px-3 py-2 font-medium text-ink">{sub.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-border-soft last:border-0">
                  <th scope="row" className="px-3 py-2 font-normal text-muted">{r.label}</th>
                  {r.values.map((v, i) => <td key={i} className="px-3 py-2 font-mono tabular-nums text-ink">{fmtCell(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    case "StatusList":
    case "Timeline": {
      const items = ((c.items ?? c.events) as { title?: string; label?: string; status?: string; owner?: string; actor?: string; detail?: string }[]) ?? []
      return (
        <ol className="flex flex-col">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-3 border-b border-border-soft py-2.5 last:border-0">
              <span className="mt-0.5 flex h-4 w-4 items-center justify-center"><StatusIcon status={it.status ?? "pending"} /></span>
              <div className="min-w-0 flex-1">
                <p className={`text-caption ${it.status === "pending" ? "text-muted" : "text-ink"}`}>{it.title ?? it.label}</p>
                {it.detail ? <p className="text-xs text-faint">{it.detail}</p> : null}
              </div>
              {it.owner || it.actor ? <span className="shrink-0 text-xs text-faint">{it.owner ?? it.actor}</span> : null}
            </li>
          ))}
        </ol>
      )
    }
    case "KeyValueList": {
      const items = (resolve(c.items) as { key: string; value: unknown }[]) ?? []
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-caption">
          {items.map((it) => [<dt key={`k${it.key}`} className="text-muted">{it.key}</dt>, <dd key={`v${it.key}`} className="text-ink">{str(resolve(it.value))}</dd>])}
        </dl>
      )
    }
    case "ApprovalCard":
      return (
        <div className="rounded-xl border border-border bg-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-2xs uppercase tracking-wider text-accent">Approval needed</p>
              <p className="mt-1 text-body font-medium text-ink">{str(c.gateName)}</p>
              {c.reason ? <p className="mt-1 text-caption text-muted">{str(c.reason)}</p> : null}
            </div>
            {c.riskLevel ? <span className={`shrink-0 rounded-pill px-2 py-0.5 text-xs ${c.riskLevel === "high" || c.riskLevel === "critical" ? TONE.error : c.riskLevel === "medium" ? TONE.warning : TONE.neutral}`}>{str(c.riskLevel)} risk</span> : null}
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => dispatch(c.approve as A2UIAction, c.id)} className="h-8 rounded-pill bg-ink px-4 text-caption font-medium text-on-ink transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Approve</button>
            <button type="button" onClick={() => dispatch(c.reject as A2UIAction, c.id)} className="h-8 rounded-pill border border-glass-border bg-glass px-4 text-caption font-medium text-ink transition-colors hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">Reject</button>
          </div>
        </div>
      )
    case "Button":
      return (
        <button type="button" disabled={Boolean(c.disabled)} onClick={() => dispatch(c.action as A2UIAction, c.id)} className="h-8 w-fit rounded-pill bg-ink px-4 text-caption font-medium text-on-ink disabled:opacity-40">
          {str(resolve(c.label))}
        </button>
      )
    default:
      return (
        <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-faint">
          {c.component}
        </div>
      )
  }
}

export interface ShimSurfaceViewProps {
  surfaceId: OsId
  onAction?: Dispatch
}

export function ShimSurfaceView({ surfaceId, onAction }: ShimSurfaceViewProps) {
  const surface = useShimStore((s) => s.surfaces[surfaceId])
  const dispatch = useMemo<Dispatch>(() => onAction ?? (() => {}), [onAction])
  if (!surface) {
    return (
      <p role="status" className="text-caption text-muted">
        I couldn't display this result.
      </p>
    )
  }
  const rootId = surface.components.root ? "root" : Object.keys(surface.components)[0]
  return <div className="text-ink">{rootId ? <Node id={rootId} s={surface} dispatch={dispatch} /> : null}</div>
}
