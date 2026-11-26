/**
 * Ember Night building blocks for the capability surfaces (Skills, Protocols,
 * Approvals): two-tone headings, pill segmented controls, metric tiles,
 * atmospheric feature cards and a light data table. Additive only; the core
 * primitives (Button, Badge, Card, ...) are unchanged.
 */
import { useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import clsx from "clsx"
import { twMerge } from "tailwind-merge"
import type { LucideIcon } from "lucide-react"
import "./capability.css"

const cx = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args))

// ---------------------------------------------------------------------------
// TwoToneHeading
// ---------------------------------------------------------------------------

interface TwoToneHeadingProps {
  lead: ReactNode
  muted?: ReactNode
  as?: "h1" | "h2" | "h3"
  size?: "display" | "headline" | "title"
  className?: string
  id?: string
}

const headingSize = {
  display: "text-headline sm:text-display",
  headline: "text-title sm:text-headline",
  title: "text-title",
} as const

/** "Lead phrase. <muted>Continuation.</muted>" — the Ember Night signature heading. */
export function TwoToneHeading({ lead, muted, as: Tag = "h1", size = "display", className, id }: TwoToneHeadingProps) {
  return (
    <Tag id={id} className={cx("font-medium tracking-[-0.02em] text-ink", headingSize[size], className)}>
      {lead}
      {muted && (
        <>
          {" "}
          <span className="text-muted">{muted}</span>
        </>
      )}
    </Tag>
  )
}

// ---------------------------------------------------------------------------
// SegmentedControl
// ---------------------------------------------------------------------------

export interface SegmentedItem<T extends string = string> {
  value: T
  label: string
  count?: number
  icon?: LucideIcon
}

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  items: SegmentedItem<T>[]
  /** Accessible name of the control. */
  ariaLabel: string
  /** When set, segments act as tabs controlling `${idPrefix}-panel`. */
  idPrefix?: string
  size?: "sm" | "md"
  className?: string
}

/**
 * Pill track with the active segment as a solid ink pill (Monthly/Yearly style).
 * Roving focus: ←/→/Home/End move between segments and select them.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  items,
  ariaLabel,
  idPrefix,
  size = "md",
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1
    if (event.key === "ArrowRight") next = (index + 1) % items.length
    else if (event.key === "ArrowLeft") next = (index - 1 + items.length) % items.length
    else if (event.key === "Home") next = 0
    else if (event.key === "End") next = items.length - 1
    if (next < 0) return
    event.preventDefault()
    onChange(items[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-pill bg-ink/[0.06] p-1 [scrollbar-width:none]",
        className
      )}
    >
      {items.map((item, index) => {
        const active = item.value === value
        const Icon = item.icon
        return (
          <button
            key={item.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${item.value}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel` : undefined}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cx(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              size === "sm" ? "h-7 px-3 text-xs" : "h-8 px-3.5 text-caption",
              active ? "bg-ink text-[rgb(var(--bg))]" : "text-muted hover:text-ink"
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            {item.label}
            {item.count !== undefined && (
              <span className={cx("font-mono text-2xs tabular-nums", active ? "text-[rgb(var(--bg)/0.7)]" : "text-faint")}>
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// MetricTile
// ---------------------------------------------------------------------------

interface MetricTileProps {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint?: ReactNode
  /** Positive/neutral delta text, e.g. "+4". Rendered in text-ok. */
  delta?: string
  loading?: boolean
  className?: string
}

/** Dashboard stat tile: 32px icon square, caption label, mono headline value. */
export function MetricTile({ icon: Icon, label, value, hint, delta, loading, className }: MetricTileProps) {
  return (
    <div className={cx("rounded-xl border border-border bg-panel p-4 sm:p-5", className)}>
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink/[0.06] text-muted">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-caption text-muted">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        {loading ? (
          <span className="block h-8 w-16 animate-pulse rounded-md bg-panel-alt" aria-hidden="true" />
        ) : (
          <span className="font-mono text-headline tabular-nums text-ink">{value}</span>
        )}
        {delta && !loading && <span className="text-xs text-ok">{delta}</span>}
      </div>
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// CapabilityCard
// ---------------------------------------------------------------------------

export type AtmosphereHue = "olive" | "rust" | "teal" | "moss" | "slate" | "clay"

interface AtmosphereProps {
  hue: AtmosphereHue
  /** Gradient origin, e.g. "0% 0%" (top-left, default) or "100% 0%". */
  origin?: string
  className?: string
}

/** Soft radial gradient under a 30% base overlay; place inside a `relative` box. */
export function AtmosphereLayer({ hue, origin = "0% 0%", className }: AtmosphereProps) {
  const [x, y] = origin.split(" ")
  return (
    <span aria-hidden="true" className={cx("pointer-events-none absolute inset-0", className)}>
      <span
        className={`cap-atmo cap-atmo-${hue} absolute inset-0`}
        style={{ "--atmo-x": x, "--atmo-y": y } as CSSProperties}
      />
      <span className="absolute inset-0 bg-base/30" />
    </span>
  )
}

interface CapabilityCardProps {
  hue: AtmosphereHue
  icon: LucideIcon
  title: string
  eyebrow?: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  onClick?: () => void
  /** Accessible label for the clickable card. */
  ariaLabel?: string
  origin?: string
  className?: string
}

/**
 * Feature-card style tile with an atmospheric hue. When `onClick` is set the
 * whole card is a single button (keyboard and screen-reader friendly).
 */
export function CapabilityCard({
  hue,
  icon: Icon,
  title,
  eyebrow,
  description,
  children,
  footer,
  onClick,
  ariaLabel,
  origin,
  className,
}: CapabilityCardProps) {
  const body = (
    <>
      <AtmosphereLayer hue={hue} origin={origin} />
      <span className="relative flex h-full flex-col">
        <span className="flex items-start justify-between gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md border border-glass-border bg-glass text-ink backdrop-blur-[5px]">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          {eyebrow && <span className="flex items-center gap-1.5">{eyebrow}</span>}
        </span>
        <span className="mt-6 block text-body font-medium text-ink">{title}</span>
        {description && <span className="mt-1 block text-caption text-muted">{description}</span>}
        {children && <span className="mt-4 block">{children}</span>}
        {footer && (
          <span className="mt-auto block pt-4">
            <span className="flex items-center justify-between gap-2 border-t border-border-soft pt-3 text-xs text-faint">
              {footer}
            </span>
          </span>
        )}
      </span>
    </>
  )
  const shell = cx(
    "group relative isolate flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-panel p-5 text-left",
    onClick &&
      "cursor-pointer transition-colors duration-fast hover:border-ink/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base",
    className
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel} className={shell}>
        {body}
      </button>
    )
  }
  return <div className={shell}>{body}</div>
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

export interface DataTableColumn<Row> {
  key: string
  header: string
  render: (row: Row) => ReactNode
  className?: string
  /** Hide below the `sm` breakpoint. */
  hideOnMobile?: boolean
}

interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  caption: string
  empty?: ReactNode
  className?: string
}

/** Hairline table inside a soft card; caption is visually hidden but announced. */
export function DataTable<Row>({ columns, rows, rowKey, caption, empty, className }: DataTableProps<Row>) {
  return (
    <div className={cx("overflow-hidden rounded-xl border border-border bg-panel", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-caption">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cx(
                    "whitespace-nowrap px-4 py-3 text-xs font-medium text-faint",
                    col.hideOnMobile && "hidden sm:table-cell",
                    col.className
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-border-soft last:border-b-0 hover:bg-ink/[0.02]">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cx("px-4 py-3 align-middle text-ink", col.hideOnMobile && "hidden sm:table-cell", col.className)}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && empty && <div className="border-t border-border-soft">{empty}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// InlineNotice
// ---------------------------------------------------------------------------

interface InlineNoticeProps {
  tone?: "error" | "info" | "warn"
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}

/** Compact inline error / info notice for failed loads. */
export function InlineNotice({ tone = "error", title, children, action, className }: InlineNoticeProps) {
  const toneClass = {
    error: "border-error/25 bg-error/[0.06]",
    info: "border-border bg-panel",
    warn: "border-warn/25 bg-warn/[0.06]",
  }[tone]
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between", toneClass, className)}
    >
      <div>
        <p className={cx("text-caption font-medium", tone === "error" ? "text-error" : tone === "warn" ? "text-warn" : "text-ink")}>
          {title}
        </p>
        {children && <div className="mt-0.5 text-caption text-muted">{children}</div>}
      </div>
      {action}
    </div>
  )
}
