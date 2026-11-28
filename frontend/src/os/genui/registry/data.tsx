/** Data components: DataTable, Chart (lazy), FilterBar, ComparisonTable. */
import { Suspense, useId, useMemo, useState } from "react"
import clsx from "clsx"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { Badge as UiBadge } from "../../../components/ui/Badge"
import { Button as UiButton } from "../../../components/ui/Button"
import { lazyWithRetry } from "../../../lib/lazyRetry"
import type { CoreComponentProps } from "./types"
import { CARD, FIELD, FOCUS, LABEL, cellText, formatUsd, humanize, statusVariant } from "./styles"

interface Column {
  key: string
  label: string
  type?: "text" | "number" | "currency" | "date" | "status"
}

type Row = Record<string, unknown>

function asRows(list: unknown[]): Row[] {
  return list.filter((r): r is Row => typeof r === "object" && r !== null && !Array.isArray(r))
}

function own(row: Row, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === undefined || a === null) return 1
  if (b === undefined || b === null) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true })
}

function Cell({ value, type }: { value: unknown; type: Column["type"] }) {
  if (type === "status" && typeof value === "string") {
    return <UiBadge variant={statusVariant(value)}>{humanize(value)}</UiBadge>
  }
  if ((type === "number" || type === "currency") && typeof value === "number" && Number.isFinite(value)) {
    return (
      <span className="font-mono tabular-nums">
        {type === "currency" ? formatUsd(value) : value.toLocaleString("en-US")}
      </span>
    )
  }
  if (type === "date" && typeof value === "string") {
    return <span className="font-mono tabular-nums">{value.length > 10 && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 16).replace("T", " ") : value}</span>
  }
  return <>{cellText(value)}</>
}

export function DataTable({ node, ctx }: CoreComponentProps) {
  const columns = (Array.isArray(node.columns) ? node.columns : []) as Column[]
  const rows = asRows(ctx.list(node.rows))
  const pageSize = typeof node.pageSize === "number" ? node.pageSize : 25
  const sortable = node.sortable === true
  const hasRowAction = node.rowAction !== undefined
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null)
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const copy = rows.slice()
    copy.sort((a, b) => compare(own(a, sort.key), own(b, sort.key)) * (sort.dir === "asc" ? 1 : -1))
    return copy
  }, [rows, sort])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, pages - 1)
  const visible = sorted.slice(current * pageSize, (current + 1) * pageSize)

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null))

  return (
    <div className={clsx(CARD, "min-w-0 overflow-hidden")} data-a2ui="DataTable">
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`Table with ${rows.length} rows`}>
        <table className="w-full border-collapse text-left text-caption">
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => {
                const numeric = c.type === "number" || c.type === "currency"
                const dir = sort?.key === c.key ? sort.dir : null
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : sortable ? "none" : undefined}
                    className={clsx("px-3 py-2 font-medium text-muted", numeric && "text-right")}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={clsx("inline-flex items-center gap-1 rounded-xs hover:text-ink", FOCUS)}
                      >
                        {c.label}
                        {dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        ) : dir === "desc" ? (
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 text-faint" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                )
              })}
              {hasRowAction && (
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length + (hasRowAction ? 1 : 0)} className="px-3 py-6 text-center text-muted">
                  No rows
                </td>
              </tr>
            )}
            {visible.map((row, i) => {
              const index = current * pageSize + i
              const first = columns[0] ? cellText(own(row, columns[0].key)) : String(index + 1)
              return (
                <tr key={index} className="border-b border-border-soft last:border-0 hover:bg-ink/[0.03]">
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={clsx("px-3 py-2 text-ink", (c.type === "number" || c.type === "currency") && "text-right")}
                    >
                      <Cell value={own(row, c.key)} type={c.type} />
                    </td>
                  ))}
                  {hasRowAction && (
                    <td className="px-3 py-1.5 text-right">
                      <UiButton
                        variant="ghost"
                        size="sm"
                        aria-label={`Open ${first}`}
                        loading={ctx.pending}
                        onClick={() => ctx.dispatch(node.rowAction, { row, index })}
                      >
                        Open
                      </UiButton>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav aria-label="Table pages" className="flex items-center justify-between gap-3 border-t border-border-soft px-3 py-2">
          <UiButton variant="ghost" size="sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </UiButton>
          <span className="font-mono text-xs tabular-nums text-muted" aria-live="polite">
            Page {current + 1} of {pages}
          </span>
          <UiButton variant="ghost" size="sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </UiButton>
        </nav>
      )}
    </div>
  )
}

const ChartCanvas = lazyWithRetry(() => import("./ChartCanvas"))

export interface ChartSeries {
  key: string
  label?: string
}

export function Chart({ node, ctx }: CoreComponentProps) {
  const title = node.title === undefined ? "" : ctx.str(node.title)
  const data = asRows(ctx.list(node.data)).slice(0, 1000)
  const series = (Array.isArray(node.series) ? node.series : []) as ChartSeries[]
  const x = typeof node.x === "string" ? node.x : ""
  const kind = String(node.kind)
  const titleId = useId()
  return (
    <figure className={clsx(CARD, "min-w-0 p-4")} aria-labelledby={title ? titleId : undefined} data-a2ui="Chart">
      {title && (
        <figcaption id={titleId} className="mb-3 text-body font-medium text-ink">
          {title}
        </figcaption>
      )}
      <div aria-hidden="true" className="h-64 w-full">
        <Suspense fallback={<div className="h-full w-full animate-pulse rounded-lg bg-ink/[0.04]" />}>
          <ChartCanvas kind={kind} data={data} x={x} series={series} />
        </Suspense>
      </div>
      {/* Screen-reader equivalent of the chart. */}
      <table className="sr-only">
        <caption>{title || `${humanize(kind)} chart`}</caption>
        <thead>
          <tr>
            <th scope="col">{x}</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label ?? s.key}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 200).map((row, i) => (
            <tr key={i}>
              <th scope="row">{cellText(own(row, x))}</th>
              {series.map((s) => (
                <td key={s.key}>{cellText(own(row, s.key))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}

interface FilterSpec {
  id: string
  label: string
  kind: "select" | "search" | "range" | "toggle"
  value: unknown
  options?: { value: string; label: string }[]
}

function Filter({ f, ctx }: { f: FilterSpec; ctx: CoreComponentProps["ctx"] }) {
  const id = useId()
  const current = ctx.read(f.value)
  if (f.kind === "toggle") {
    return (
      <label htmlFor={id} className="inline-flex items-center gap-2 text-caption text-ink">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={current === true}
          onChange={(e) => ctx.write(f.value, e.target.checked)}
          className={clsx("h-4 w-4 accent-[rgb(var(--primary))]", FOCUS)}
        />
        {f.label}
      </label>
    )
  }
  if (f.kind === "range") {
    const range = (typeof current === "object" && current !== null ? current : {}) as { min?: unknown; max?: unknown }
    const set = (which: "min" | "max", raw: string) => {
      const n = raw === "" ? null : Number(raw)
      ctx.write(f.value, { ...range, [which]: n !== null && Number.isFinite(n) ? n : null })
    }
    return (
      <fieldset className="flex items-end gap-2">
        <legend className={clsx(LABEL, "mb-1")}>{f.label}</legend>
        <input
          type="number"
          aria-label={`${f.label} minimum`}
          value={typeof range.min === "number" ? range.min : ""}
          onChange={(e) => set("min", e.target.value)}
          className={clsx(FIELD, "w-24 font-mono tabular-nums")}
        />
        <span className="pb-2 text-faint" aria-hidden="true">
          –
        </span>
        <input
          type="number"
          aria-label={`${f.label} maximum`}
          value={typeof range.max === "number" ? range.max : ""}
          onChange={(e) => set("max", e.target.value)}
          className={clsx(FIELD, "w-24 font-mono tabular-nums")}
        />
      </fieldset>
    )
  }
  return (
    <div className="flex min-w-[10rem] flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        {f.label}
      </label>
      {f.kind === "select" ? (
        <select
          id={id}
          value={typeof current === "string" ? current : ""}
          onChange={(e) => ctx.write(f.value, e.target.value)}
          className={FIELD}
        >
          <option value="">All</option>
          {(f.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type="search"
          value={typeof current === "string" ? current : ""}
          onChange={(e) => ctx.write(f.value, e.target.value)}
          className={FIELD}
        />
      )}
    </div>
  )
}

export function FilterBar({ node, ctx }: CoreComponentProps) {
  const filters = (Array.isArray(node.filters) ? node.filters : []) as FilterSpec[]
  return (
    <div role="search" aria-label="Filters" className="flex flex-wrap items-end gap-3" data-a2ui="FilterBar">
      {filters.map((f) => (
        <Filter key={f.id} f={f} ctx={ctx} />
      ))}
    </div>
  )
}

interface ComparisonRow {
  label: string
  values: (string | number | boolean | null)[]
  better?: "higher" | "lower" | "none"
}

function bestIndex(row: ComparisonRow): number {
  if (!row.better || row.better === "none") return -1
  let best = -1
  row.values.forEach((v, i) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return
    const b = row.values[best]
    if (best === -1 || (typeof b === "number" && (row.better === "higher" ? v > b : v < b))) best = i
  })
  return best
}

export function ComparisonTable({ node }: CoreComponentProps) {
  const subjects = (Array.isArray(node.subjects) ? node.subjects : []) as { id: string; label: string }[]
  const rows = (Array.isArray(node.rows) ? node.rows : []) as ComparisonRow[]
  return (
    <div className={clsx(CARD, "min-w-0 overflow-x-auto")} tabIndex={0} role="region" aria-label="Comparison" data-a2ui="ComparisonTable">
      <table className="w-full border-collapse text-left text-caption">
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="px-3 py-2 font-medium text-muted">
              <span className="sr-only">Attribute</span>
            </th>
            {subjects.map((s) => (
              <th key={s.id} scope="col" className="px-3 py-2 font-medium text-ink">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const best = bestIndex(row)
            return (
              <tr key={r} className="border-b border-border-soft last:border-0">
                <th scope="row" className="px-3 py-2 font-normal text-muted">
                  {row.label}
                </th>
                {subjects.map((s, i) => {
                  const v = row.values[i]
                  return (
                    <td key={s.id} className={clsx("px-3 py-2", typeof v === "number" && "font-mono tabular-nums", i === best ? "text-accent" : "text-ink")}>
                      {cellText(v)}
                      {i === best && <span className="sr-only"> (best)</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
