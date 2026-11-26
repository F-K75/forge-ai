/**
 * A2UI declarative surface renderer.
 *
 * Surfaces arrive from the server (or a remote agent) as untrusted JSON. Every
 * component is narrowed at runtime by `parseA2UIComponent`: unknown component
 * types, wrong prop types and disallowed enum values are dropped (render
 * nothing). All strings are rendered as React text nodes — there is no
 * dangerouslySetInnerHTML anywhere in this file — and links are only rendered
 * for absolute http(s) URLs.
 */
import type { ReactNode } from "react"
import { Badge, type BadgeVariant } from "../ui"
import type { A2UIComponent, A2UISurface, A2UITone } from "../../lib/kernelApi"
import { parseA2UIComponent } from "./parseA2UI"

// --------------------------------------------------------------------------
// Presentation helpers
// --------------------------------------------------------------------------

const TONE_PANEL: Record<A2UITone, string> = {
  info: "border-info/30 bg-info/10 text-info",
  success: "border-ok/30 bg-ok/10 text-ok",
  warning: "border-warn/30 bg-warn/10 text-warn",
  error: "border-error/30 bg-error/10 text-error",
}

const TONE_BAR: Record<A2UITone, string> = {
  info: "bg-info",
  success: "bg-ok",
  warning: "bg-warn",
  error: "bg-error",
}

function statusVariant(status: string | undefined): BadgeVariant {
  switch (status) {
    case "completed":
    case "answered":
      return "success"
    case "running":
    case "active":
      return "info"
    case "failed":
    case "rejected":
    case "timeout":
      return "error"
    case "blocked":
      return "warning"
    default:
      return "default"
  }
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(4)}`
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">{children}</p>
}

/** Tiny markdown subset (#-headings, -/* bullets, paragraphs) rendered as text nodes only. */
function SafeMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="whitespace-pre-wrap">
          {paragraph.join("\n")}
        </p>
      )
      paragraph = []
    }
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-4 space-y-0.5">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )
      bullets = []
    }
  }
  for (const line of text.split("\n")) {
    const heading = /^(#{1,4})\s+(.*)$/.exec(line)
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push(
        <p key={`h-${blocks.length}`} className="font-semibold text-ink">
          {heading[2]}
        </p>
      )
    } else if (bullet) {
      if (paragraph.length) flush()
      bullets.push(bullet[1])
    } else if (line.trim() === "") {
      flush()
    } else {
      if (bullets.length) flush()
      paragraph.push(line)
    }
  }
  flush()
  return <div className="space-y-1">{blocks}</div>
}

// --------------------------------------------------------------------------
// Component views
// --------------------------------------------------------------------------

export interface A2UIComponentViewProps {
  component: A2UIComponent
  /** Optional handler for approval_card actions; without it actions are shown read-only. */
  onApprovalAction?: (gateId: string, action: "approve" | "reject") => void
}

export function A2UIComponentView({ component: c, onApprovalAction }: A2UIComponentViewProps) {
  switch (c.type) {
    case "heading": {
      const size = c.level === 1 ? "text-sm" : c.level === 2 ? "text-[13px]" : "text-xs"
      return (
        <p role="heading" aria-level={c.level ?? 3} className={`${size} font-semibold text-ink`}>
          {c.text}
        </p>
      )
    }
    case "metric_row":
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
          {c.items.map((item, i) => (
            <div key={`${item.label}-${i}`} className="text-[11px]">
              <div className="text-muted">{item.label}</div>
              <div className="font-mono tabular-nums font-semibold text-ink">{item.value}</div>
            </div>
          ))}
        </div>
      )
    case "checklist":
      return (
        <ul className="space-y-0.5 text-[11px]">
          {c.items.map((item, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={item.checked ? "text-ok" : "text-faint"}>
                {item.checked ? "✓" : "○"}
              </span>
              <span className={item.checked ? "text-ink" : "text-muted"}>{item.label}</span>
              <span className="sr-only">{item.checked ? "(done)" : "(not done)"}</span>
            </li>
          ))}
        </ul>
      )
    case "approval_card":
      return (
        <div className="rounded-md border border-warn/40 bg-warn/10 p-2 space-y-1 text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-ink">{c.gate_name ?? "Approval gate"}</span>
            {c.risk_level && <Badge size="sm" variant="warning">{`${c.risk_level} risk`}</Badge>}
          </div>
          {c.reason && <p className="text-muted whitespace-pre-wrap">{c.reason}</p>}
          {c.wave_index !== null && c.wave_index !== undefined && (
            <p className="font-mono text-muted">Wave {c.wave_index}</p>
          )}
          {c.actions.length > 0 && (
            <div className="flex gap-1.5 pt-0.5">
              {c.actions.map((action) =>
                onApprovalAction && c.gate_id ? (
                  <button
                    key={action}
                    type="button"
                    onClick={() => onApprovalAction(c.gate_id as string, action)}
                    className="px-2 py-0.5 rounded border border-border bg-base text-[11px] font-medium text-ink hover:border-accent/60 cursor-pointer capitalize"
                  >
                    {action}
                  </button>
                ) : (
                  <Badge key={action} size="sm" variant="outlined" className="capitalize">
                    {action}
                  </Badge>
                )
              )}
            </div>
          )}
        </div>
      )
    case "conflict_list":
      return (
        <div className="space-y-1">
          <SectionLabel>File conflicts</SectionLabel>
          <ul className="space-y-0.5 text-[11px]">
            {c.items.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="font-mono text-ink truncate">
                  {item.file_path ?? "unknown file"}
                </span>
                <span className="text-muted shrink-0">
                  {(item.roles ?? []).join(", ")}
                  {item.status ? ` · ${item.status}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )
    case "eval_table":
      return (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-muted">
              <th className="font-medium py-0.5">Role</th>
              <th className="font-medium py-0.5">Artifact</th>
              <th className="font-medium py-0.5 text-right">Score</th>
              <th className="font-medium py-0.5 text-right">Result</th>
            </tr>
          </thead>
          <tbody>
            {c.rows.map((row, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-0.5 font-mono text-ink">{row.role ?? "-"}</td>
                <td className="py-0.5 text-muted">{row.artifact_type ?? "-"}</td>
                <td className="py-0.5 text-right font-mono tabular-nums text-ink">
                  {row.score === null ? "-" : `${Math.round(row.score * 100)}%`}
                </td>
                <td className="py-0.5 text-right">
                  {row.passed === null ? (
                    "-"
                  ) : (
                    <Badge size="sm" variant={row.passed ? "success" : "error"}>
                      {row.passed ? "pass" : "fail"}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    case "text_block":
      return (
        <div className="text-[11px] text-ink" data-a2ui="text_block">
          {c.format === "markdown" ? (
            <SafeMarkdown text={c.text} />
          ) : (
            <p className="whitespace-pre-wrap">{c.text}</p>
          )}
        </div>
      )
    case "key_value_list":
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
          {c.items.map((item, i) => (
            <div key={`${item.key}-${i}`} className="contents">
              <dt className="text-muted">{item.key}</dt>
              <dd className="font-mono text-ink break-words">{item.value}</dd>
            </div>
          ))}
        </dl>
      )
    case "progress_bar": {
      const pct = c.max > 0 ? Math.min(100, Math.max(0, (c.value / c.max) * 100)) : 0
      return (
        <div className="space-y-0.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-muted">{c.label}</span>
            <span className="font-mono tabular-nums text-ink">
              {c.value}/{c.max}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={c.label}
            aria-valuemin={0}
            aria-valuemax={c.max}
            aria-valuenow={c.value}
            className="h-1.5 w-full rounded-full bg-panel-alt overflow-hidden"
          >
            <div
              className={`h-full rounded-full ${TONE_BAR[c.tone ?? "info"]}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )
    }
    case "timeline":
      return (
        <div className="space-y-1">
          <SectionLabel>Agent activity</SectionLabel>
          <ol className="border-l border-border pl-2.5 space-y-1 text-[11px]">
            {c.events.map((e, i) => (
              <li key={i} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[13px] top-1 h-1.5 w-1.5 rounded-full bg-border"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {e.actor && <span className="font-mono font-semibold text-ink">{e.actor}</span>}
                  <span className="text-ink">{e.label}</span>
                  {e.status && (
                    <Badge size="sm" variant={statusVariant(e.status)}>
                      {e.status}
                    </Badge>
                  )}
                </div>
                {e.timestamp && (
                  <div className="font-mono text-[10px] text-muted">{e.timestamp}</div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )
    case "status_list":
      return (
        <div className="space-y-1">
          <SectionLabel>Task board</SectionLabel>
          <ul className="divide-y divide-border rounded-md border border-border text-[11px]">
            {c.items.map((item, i) => (
              <li key={item.id ?? i} className="px-2 py-1 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-ink truncate">{item.title}</div>
                  {(item.owner || item.detail) && (
                    <div className="text-muted truncate">
                      {[item.owner, item.detail].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>
                <Badge size="sm" variant={statusVariant(item.status)} className="shrink-0">
                  {item.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )
    case "code_diff":
      return (
        <div className="rounded-md border border-border overflow-hidden text-[11px]">
          {(c.file_path || c.language) && (
            <div className="px-2 py-1 border-b border-border bg-panel-alt flex justify-between gap-2">
              <span className="font-mono text-ink truncate">{c.file_path ?? ""}</span>
              {c.language && <span className="font-mono text-muted">{c.language}</span>}
            </div>
          )}
          <pre className="max-h-60 overflow-auto p-0 m-0 font-mono text-[11px] leading-snug">
            {c.diff.split("\n").map((line, i) => {
              const cls =
                line.startsWith("+") && !line.startsWith("+++")
                  ? "bg-ok/10 text-ok"
                  : line.startsWith("-") && !line.startsWith("---")
                    ? "bg-error/10 text-error"
                    : line.startsWith("@@")
                      ? "text-info"
                      : "text-ink"
              return (
                <div key={i} className={`px-2 whitespace-pre ${cls}`}>
                  {line || " "}
                </div>
              )
            })}
          </pre>
        </div>
      )
    case "cost_breakdown": {
      const denom = c.total > 0 ? c.total : 1
      return (
        <div className="space-y-1 text-[11px]">
          <div className="flex items-center justify-between">
            <SectionLabel>Cost breakdown</SectionLabel>
            <span className="font-mono tabular-nums text-ink">
              {formatUsd(c.total)}
              {c.budget !== null && c.budget !== undefined ? ` / ${formatUsd(c.budget)}` : ""}
            </span>
          </div>
          <ul className="space-y-0.5">
            {c.items.map((item, i) => (
              <li key={`${item.label}-${i}`} className="space-y-0.5">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-ink truncate">{item.label}</span>
                  <span className="font-mono tabular-nums text-muted">
                    {formatUsd(item.amount)}
                  </span>
                </div>
                <div
                  className="h-1 w-full rounded-full bg-panel-alt overflow-hidden"
                  aria-hidden="true"
                >
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.min(100, (item.amount / denom) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )
    }
    case "agent_roster":
      return (
        <div className="space-y-1">
          <SectionLabel>Agents</SectionLabel>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
            {c.agents.map((a, i) => (
              <li
                key={`${a.role}-${i}`}
                className="rounded-md border border-border px-2 py-1 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="font-mono font-semibold text-ink truncate">{a.role}</div>
                  <div className="text-muted truncate">
                    {[
                      a.department,
                      a.task_count !== undefined ? `${a.task_count} task(s)` : null,
                      a.model,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <Badge size="sm" variant={statusVariant(a.status)} dot className="shrink-0">
                  {a.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )
    case "callout":
      return (
        <div
          role={c.tone === "error" || c.tone === "warning" ? "alert" : "status"}
          className={`rounded-md border px-2.5 py-1.5 text-[11px] ${TONE_PANEL[c.tone]}`}
        >
          {c.title && <p className="font-semibold">{c.title}</p>}
          <p className="whitespace-pre-wrap text-ink">{c.text}</p>
        </div>
      )
    case "link_list":
      return (
        <ul className="space-y-0.5 text-[11px]">
          {c.links.map((link, i) => (
            <li key={`${link.url}-${i}`}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-accent underline-offset-2 hover:underline break-all"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      )
    default:
      return null
  }
}

export interface A2UISurfaceViewProps {
  surface: A2UISurface
  onApprovalAction?: A2UIComponentViewProps["onApprovalAction"]
}

/** Render one A2UI surface; components that fail runtime narrowing render nothing. */
export function A2UISurfaceView({ surface, onApprovalAction }: A2UISurfaceViewProps) {
  const components = Array.isArray(surface.components) ? surface.components : []
  return (
    <div
      className="rounded-md border border-border bg-base p-2.5 text-xs space-y-2"
      data-surface-id={surface.surface_id}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-ink">{surface.title}</span>
        <span className="font-mono text-[10px] text-muted">{surface.protocol}</span>
      </div>
      {components.map((raw, idx) => {
        const parsed = parseA2UIComponent(raw)
        if (!parsed) return null
        return (
          <A2UIComponentView
            key={`${surface.surface_id}-${idx}`}
            component={parsed}
            onApprovalAction={onApprovalAction}
          />
        )
      })}
    </div>
  )
}
