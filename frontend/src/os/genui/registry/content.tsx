/**
 * Content components: Text, Heading, Callout, Badge, KeyValueList, MetricRow,
 * ProgressBar, LinkList, CodeView. All text is rendered as React text nodes;
 * markdown goes through SafeMarkdown with links disabled.
 */
import clsx from "clsx"
import { AlertTriangle, CheckCircle2, ExternalLink, Info, XCircle } from "lucide-react"
import { Badge as UiBadge, type BadgeVariant } from "../../../components/ui/Badge"
import { SafeMarkdown } from "../../../components/ui/SafeMarkdown"
import { safeHttpUrl } from "../../../components/a2ui/parseA2UI"
import type { CoreComponentProps } from "./types"
import { CARD, FOCUS, LABEL, TONE_BAR, TONE_PANEL, TONE_TEXT, type Tone } from "./styles"

const TEXT_VARIANT: Record<string, string> = {
  body: "text-body text-ink",
  caption: "text-caption text-muted",
  muted: "text-body text-muted",
  mono: "font-mono text-caption text-ink tabular-nums",
}

export function Text({ node, ctx }: CoreComponentProps) {
  const text = ctx.str(node.text)
  const cls = TEXT_VARIANT[String(node.variant)] ?? TEXT_VARIANT.body
  if (node.format === "markdown") {
    return (
      <div className={clsx(cls, "min-w-0 break-words")} data-a2ui="Text">
        <SafeMarkdown source={text} />
      </div>
    )
  }
  return (
    <p className={clsx(cls, "min-w-0 whitespace-pre-wrap break-words")} data-a2ui="Text">
      {text}
    </p>
  )
}

const HEADING_SIZE: Record<number, string> = {
  1: "text-headline",
  2: "text-title",
  3: "text-body font-medium",
  4: "text-caption font-medium text-muted",
}

/** Catalog level n renders as <h(n+1)>: the window or panel chrome owns the page-level heading. */
export function Heading({ node, ctx }: CoreComponentProps) {
  const level = Math.min(4, Math.max(1, typeof node.level === "number" ? Math.round(node.level) : 2))
  const Tag = `h${level + 1}` as "h2" | "h3" | "h4" | "h5"
  return (
    <Tag className={clsx(HEADING_SIZE[level], "min-w-0 tracking-[-0.02em] text-ink")} data-a2ui="Heading">
      {ctx.str(node.text)}
    </Tag>
  )
}

const TONE_ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle }

export function Callout({ node, ctx }: CoreComponentProps) {
  const tone = (["info", "success", "warning", "error"].includes(String(node.tone)) ? node.tone : "info") as Tone
  const Icon = TONE_ICON[tone]
  const title = node.title === undefined ? "" : ctx.str(node.title)
  return (
    <div role="note" className={clsx("flex gap-3 rounded-xl border px-4 py-3", TONE_PANEL[tone])} data-a2ui="Callout">
      <Icon className={clsx("mt-0.5 h-4 w-4 shrink-0", TONE_TEXT[tone])} aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        {title && <p className={clsx("text-body font-medium", TONE_TEXT[tone])}>{title}</p>}
        <p className="whitespace-pre-wrap break-words text-body text-ink">{ctx.str(node.text)}</p>
      </div>
    </div>
  )
}

const BADGE_TONE: Record<string, BadgeVariant> = {
  neutral: "default",
  accent: "accent",
  info: "info",
  success: "success",
  warning: "warning",
  error: "error",
}

export function Badge({ node, ctx }: CoreComponentProps) {
  return (
    <UiBadge variant={BADGE_TONE[String(node.tone)] ?? "default"} className="w-fit" data-a2ui="Badge">
      {ctx.str(node.text)}
    </UiBadge>
  )
}

export function KeyValueList({ node, ctx }: CoreComponentProps) {
  const items = ctx.list(node.items).filter(
    (i): i is { key: unknown; value: unknown } => typeof i === "object" && i !== null && "key" in i
  )
  return (
    <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-6 gap-y-2" data-a2ui="KeyValueList">
      {items.map((item, i) => (
        <div key={i} className="contents">
          <dt className={LABEL}>{ctx.str(item.key)}</dt>
          <dd className="min-w-0 break-words text-body text-ink">{ctx.str(item.value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function deltaClass(delta: string): string {
  if (/^\s*[+↑▲]/.test(delta)) return "text-ok"
  if (/^\s*[-−↓▼]/.test(delta)) return "text-error"
  return "text-faint"
}

export function MetricRow({ node, ctx }: CoreComponentProps) {
  const items = (Array.isArray(node.items) ? node.items : []) as { label: string; value: unknown; delta?: unknown }[]
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3" data-a2ui="MetricRow">
      {items.map((item, i) => {
        const delta = item.delta === undefined ? "" : ctx.str(item.delta)
        return (
          <div key={i} className={clsx(CARD, "flex flex-col gap-1 px-4 py-3")}>
            <dt className={LABEL}>{item.label}</dt>
            <dd className="font-mono text-title tabular-nums text-ink">{ctx.str(item.value, "—")}</dd>
            {delta && <dd className={clsx("text-xs tabular-nums", deltaClass(delta))}>{delta}</dd>}
          </div>
        )
      })}
    </dl>
  )
}

export function ProgressBar({ node, ctx }: CoreComponentProps) {
  const label = ctx.str(node.label)
  const max = Math.max(0, ctx.num(node.max) ?? 100) || 100
  const value = Math.min(max, Math.max(0, ctx.num(node.value) ?? 0))
  const pct = Math.round((value / max) * 100)
  const tone = (["info", "success", "warning", "error"].includes(String(node.tone)) ? node.tone : "info") as Tone
  return (
    <div className="flex flex-col gap-1.5" data-a2ui="ProgressBar">
      <div className="flex items-baseline justify-between gap-3">
        <span className={LABEL}>{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label || "Progress"}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        className="h-1 w-full overflow-hidden rounded-pill bg-ink/[0.06]"
      >
        <div className={clsx("h-full rounded-pill", TONE_BAR[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function LinkList({ node }: CoreComponentProps) {
  const links = (Array.isArray(node.links) ? node.links : []) as { label: unknown; url: unknown }[]
  return (
    <ul className="flex flex-col gap-1.5" data-a2ui="LinkList">
      {links.map((l, i) => {
        const label = typeof l.label === "string" ? l.label : ""
        const href = safeHttpUrl(l.url)
        return (
          <li key={i} className="min-w-0">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded-xs text-body text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-accent",
                  FOCUS
                )}
              >
                {label || href}
                <ExternalLink className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              // Unsafe or malformed URL: shown as inert text, never as a link.
              <span className="text-body text-muted">{label}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "text-ok"
  if (line.startsWith("-") && !line.startsWith("---")) return "text-error"
  if (line.startsWith("@@")) return "text-info"
  return "text-ink"
}

export function CodeView({ node, ctx }: CoreComponentProps) {
  const code = ctx.str(node.code)
  const filePath = typeof node.filePath === "string" ? node.filePath : ""
  const language = typeof node.language === "string" ? node.language : ""
  const label = filePath || (language ? `${language} code` : "Code")
  return (
    <figure className={clsx(CARD, "min-w-0 overflow-hidden")} data-a2ui="CodeView">
      {(filePath || language) && (
        <figcaption className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-2">
          <span className="truncate font-mono text-xs text-muted">{filePath}</span>
          {language && <span className="font-mono text-2xs text-faint">{language}</span>}
        </figcaption>
      )}
      <pre
        tabIndex={0}
        aria-label={label}
        className={clsx("max-h-[28rem] overflow-auto px-4 py-3 font-mono text-caption leading-relaxed", FOCUS)}
      >
        <code>
          {node.diff === true
            ? code.split("\n").map((line, i) => (
                <span key={i} className={clsx("block", diffLineClass(line))}>
                  {line || " "}
                </span>
              ))
            : code}
        </code>
      </pre>
    </figure>
  )
}
