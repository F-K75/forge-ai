/**
 * Status components: Checklist, StatusList, Timeline, AgentRoster,
 * ApprovalCard, ConflictList, EvalTable, CostBreakdown.
 */
import type { ReactNode } from "react"
import clsx from "clsx"
import { CheckCircle2, Circle, ShieldAlert } from "lucide-react"
import { Badge as UiBadge, type BadgeVariant } from "../../../components/ui/Badge"
import { Button as UiButton } from "../../../components/ui/Button"
import type { CoreComponentProps } from "./types"
import { CARD, LABEL, TONE_BAR, cellText, formatUsd, humanize, statusVariant } from "./styles"

function arr<T>(v: unknown): T[] {
  return (Array.isArray(v) ? v : []) as T[]
}

export function Checklist({ node }: CoreComponentProps) {
  const items = arr<{ label: string; checked?: boolean }>(node.items)
  return (
    <ul className="flex flex-col gap-1.5" data-a2ui="Checklist">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-body">
          {item.checked ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
          ) : (
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
          )}
          <span className={item.checked ? "text-muted" : "text-ink"}>
            {item.label}
            <span className="sr-only">{item.checked ? " (done)" : " (not done)"}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function StatusList({ node }: CoreComponentProps) {
  const items = arr<{ id?: string; title: string; status: string; owner?: string; detail?: string }>(node.items)
  return (
    <ul className={clsx(CARD, "divide-y divide-border-soft")} data-a2ui="StatusList">
      {items.map((item, i) => (
        <li key={item.id ?? i} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-body text-ink">{item.title}</p>
            {(item.owner || item.detail) && (
              <p className="text-caption text-muted">{[item.owner, item.detail].filter(Boolean).join(" · ")}</p>
            )}
          </div>
          <UiBadge variant={statusVariant(item.status)} className="shrink-0">
            {humanize(item.status)}
          </UiBadge>
        </li>
      ))}
    </ul>
  )
}

const DOT: Record<string, string> = {
  completed: "bg-ok",
  answered: "bg-ok",
  running: "bg-accent",
  failed: "bg-error",
  rejected: "bg-error",
  timeout: "bg-error",
  blocked: "bg-warn",
  info: "bg-info",
}

export function Timeline({ node }: CoreComponentProps) {
  const events = arr<{ label: string; timestamp?: string; actor?: string; status?: string }>(node.events)
  return (
    <ol className="relative flex flex-col gap-3 border-l border-border pl-4" data-a2ui="Timeline">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span
            className={clsx("absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full", DOT[e.status ?? ""] ?? "bg-faint")}
            aria-hidden="true"
          />
          <p className="text-body text-ink">
            {e.label}
            {e.status && <span className="sr-only"> ({humanize(e.status)})</span>}
          </p>
          {(e.timestamp || e.actor) && (
            <p className="text-xs text-faint">
              {e.timestamp && <time className="font-mono tabular-nums">{e.timestamp}</time>}
              {e.timestamp && e.actor ? " · " : ""}
              {e.actor}
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}

export function AgentRoster({ node }: CoreComponentProps) {
  const agents = arr<{ role: string; status: string; department?: string; taskCount?: number; model?: string }>(node.agents)
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3" data-a2ui="AgentRoster">
      {agents.map((a, i) => (
        <li key={i} className={clsx(CARD, "flex flex-col gap-2 px-4 py-3")}>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-body font-medium text-ink">{humanize(a.role)}</p>
            <UiBadge variant={statusVariant(a.status)} size="sm">
              {humanize(a.status)}
            </UiBadge>
          </div>
          <p className="text-caption text-muted">
            {[a.department && humanize(a.department), typeof a.taskCount === "number" ? `${a.taskCount} tasks` : null]
              .filter(Boolean)
              .join(" · ") || " "}
          </p>
          {a.model && <p className="truncate font-mono text-xs text-faint">{a.model}</p>}
        </li>
      ))}
    </ul>
  )
}

const RISK: Record<string, BadgeVariant> = { low: "default", medium: "info", high: "warning", critical: "error" }

export function ApprovalCard({ node, ctx }: CoreComponentProps) {
  const gateName = String(node.gateName ?? "")
  const risk = typeof node.riskLevel === "string" ? node.riskLevel : null
  return (
    <section className={clsx(CARD, "flex flex-col gap-3 p-4")} aria-label={`Approval: ${gateName}`} data-a2ui="ApprovalCard">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-body font-medium text-ink">{gateName}</p>
            <p className="font-mono text-xs text-faint">{String(node.gateId ?? "")}</p>
          </div>
        </div>
        {risk && (
          <UiBadge variant={RISK[risk] ?? "default"} className="shrink-0">
            {humanize(risk)} risk
          </UiBadge>
        )}
      </div>
      {typeof node.reason === "string" && node.reason && <p className="text-body text-muted">{node.reason}</p>}
      {ctx.actionError && (
        <p role="alert" className="text-caption text-error">
          {ctx.actionError}
        </p>
      )}
      <div className="flex gap-2">
        <UiButton
          variant="primary"
          size="sm"
          loading={ctx.pending}
          onClick={() =>
            ctx.dispatch(node.approve, { gateId: node.gateId as string }, { label: `Approve ${gateName}`, riskLevel: risk ?? undefined })
          }
        >
          Approve
        </UiButton>
        <UiButton
          variant="secondary"
          size="sm"
          disabled={ctx.pending}
          onClick={() => ctx.dispatch(node.reject, { gateId: node.gateId as string }, { label: `Reject ${gateName}` })}
        >
          Reject
        </UiButton>
      </div>
    </section>
  )
}

function SimpleTable({ label, head, rows }: { label: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div className={clsx(CARD, "min-w-0 overflow-x-auto")} tabIndex={0} role="region" aria-label={label}>
      <table className="w-full border-collapse text-left text-caption">
        <thead>
          <tr className="border-b border-border">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2 font-medium text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="border-b border-border-soft last:border-0">
              {cells.map((c, i) => (
                <td key={i} className="px-3 py-2 text-ink">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ConflictList({ node }: CoreComponentProps) {
  const items = arr<{ filePath?: string; waveIndex?: number; roles?: string[]; status?: string }>(node.items)
  return (
    <div data-a2ui="ConflictList">
      <SimpleTable
        label="File conflicts"
        head={["File", "Wave", "Roles", "Status"]}
        rows={items.map((c) => [
          <span key="f" className="font-mono">{c.filePath ?? "—"}</span>,
          <span key="w" className="font-mono tabular-nums">{typeof c.waveIndex === "number" ? c.waveIndex : "—"}</span>,
          (c.roles ?? []).map(humanize).join(", ") || "—",
          c.status ? <UiBadge key="s" variant={statusVariant(c.status)}>{humanize(c.status)}</UiBadge> : "—",
        ])}
      />
    </div>
  )
}

export function EvalTable({ node }: CoreComponentProps) {
  const rows = arr<{ role?: string; artifactType?: string; score?: number; passed?: boolean }>(node.rows)
  return (
    <div data-a2ui="EvalTable">
      <SimpleTable
        label="Evaluations"
        head={["Role", "Artifact", "Score", "Result"]}
        rows={rows.map((r) => [
          r.role ? humanize(r.role) : "—",
          r.artifactType ? humanize(r.artifactType) : "—",
          <span key="s" className="font-mono tabular-nums">{typeof r.score === "number" ? `${Math.round(r.score * 100)}%` : "—"}</span>,
          typeof r.passed === "boolean" ? (
            <UiBadge key="p" variant={r.passed ? "success" : "error"}>{r.passed ? "Passed" : "Failed"}</UiBadge>
          ) : (
            "—"
          ),
        ])}
      />
    </div>
  )
}

export function CostBreakdown({ node }: CoreComponentProps) {
  const total = typeof node.total === "number" ? node.total : 0
  const budget = typeof node.budget === "number" ? node.budget : null
  const items = arr<{ label: string; amount: number }>(node.items)
  const pct = budget && budget > 0 ? Math.min(100, Math.round((total / budget) * 100)) : null
  const tone = pct === null ? "info" : pct >= 100 ? "error" : pct >= 80 ? "warning" : "success"
  return (
    <section className={clsx(CARD, "flex flex-col gap-3 p-4")} aria-label="Cost breakdown" data-a2ui="CostBreakdown">
      <div className="flex items-baseline justify-between gap-3">
        <span className={LABEL}>Total</span>
        <span className="font-mono text-title tabular-nums text-ink">
          {formatUsd(total, 4)}
          {budget !== null && <span className="text-caption text-faint"> / {formatUsd(budget, 2)}</span>}
        </span>
      </div>
      {pct !== null && (
        <div
          role="progressbar"
          aria-label="Budget used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-1 w-full overflow-hidden rounded-pill bg-ink/[0.06]"
        >
          <div className={clsx("h-full rounded-pill", TONE_BAR[tone])} style={{ width: `${pct}%` }} />
        </div>
      )}
      <dl className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3">
            <dt className="text-caption text-muted">{item.label}</dt>
            <dd className="font-mono text-caption tabular-nums text-ink">{formatUsd(item.amount, 4)}</dd>
          </div>
        ))}
      </dl>
      <span className="sr-only">{cellText(node.currency)}</span>
    </section>
  )
}
