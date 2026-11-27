import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, Clock3, FolderOpen, History, ShieldCheck, ShieldQuestion } from "lucide-react"
import { AtmosphereLayer, Badge, Button, InlineNotice, CapabilitySegmentedControl, Skeleton, TwoToneHeading } from "../components/ui"
import { A2UISurfaceView, type A2UIApprovalAction, type A2UIApprovalUIState } from "../components/a2ui/A2UIRenderer"
import { GateStatusPill } from "../components/capabilities/StatusPills"
import { useProjectsQuery } from "../hooks/useActiveProject"
import { formatRelativeTime } from "../lib/format"
import { LIVE_MODE } from "../lib/env"
import {
  decideGate,
  describeDecisionError,
  fetchApprovals,
  fetchGateSurface,
  gateTitle,
  type ApprovalItem,
} from "../lib/approvalsData"

type View = "pending" | "decided"

const RISK_VARIANT = { high: "error", medium: "warning", low: "default" } as const

export default function ApprovalsPage() {
  const queryClient = useQueryClient()
  const { data: projects = [], isLoading: projectsLoading, isError: projectsError } = useProjectsQuery()
  const [view, setView] = useState<View>("pending")
  const [projectFilter, setProjectFilter] = useState("all")
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [approvalState, setApprovalState] = useState<Record<string, A2UIApprovalUIState>>({})
  const detailRef = useRef<HTMLDivElement>(null)

  const projectIds = projects.map((p) => p.id).join(",")
  const approvals = useQuery({
    queryKey: ["capabilities", "approvals", projectIds],
    queryFn: () => fetchApprovals(projects),
    enabled: !LIVE_MODE || !projectsLoading,
  })
  const items = useMemo(() => approvals.data ?? [], [approvals.data])

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>()
    items.forEach((i) => seen.set(i.projectId, i.projectName))
    projects.forEach((p) => seen.has(p.id) || seen.set(p.id, p.displayName || p.name))
    return Array.from(seen.entries())
  }, [items, projects])

  const inProject = items.filter((i) => projectFilter === "all" || i.projectId === projectFilter)
  const pending = inProject
    .filter((i) => i.gate.status === "pending")
    .sort((a, b) => a.gate.created_at.localeCompare(b.gate.created_at))
  const decided = inProject
    .filter((i) => i.gate.status !== "pending")
    .sort((a, b) => (b.gate.decided_at ?? b.gate.created_at).localeCompare(a.gate.decided_at ?? a.gate.created_at))
  const visible = view === "pending" ? pending : decided

  // Keep a sensible selection: the current one if it still exists, else the first visible row.
  const selected = items.find((i) => i.key === selectedKey) ?? null
  // A just-decided gate stays open after a refetch (so you see the outcome), but
  // switching view or project always lands on a row that is actually listed.
  useEffect(() => {
    if (!approvals.data) return
    if (!selected || (!visible.some((v) => v.key === selected.key) && !approvalState[selected.gate.gate_id]?.resolved)) {
      setSelectedKey(visible[0]?.key ?? null)
    }
  }, [approvals.data]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!approvals.data) return
    if (!selected || !visible.some((v) => v.key === selected.key)) setSelectedKey(visible[0]?.key ?? null)
  }, [view, projectFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleDecision = useCallback(
    async (gateId: string, action: A2UIApprovalAction) => {
      const item = items.find((i) => i.key === selectedKey && i.gate.gate_id === gateId)
      if (!item || approvalState[gateId]?.pending) return
      setApprovalState((prev) => ({ ...prev, [gateId]: { pending: action, error: null, resolved: null } }))
      try {
        await decideGate(item, action)
        setApprovalState((prev) => ({ ...prev, [gateId]: { pending: null, error: null, resolved: action === "approve" ? "approved" : "rejected" } }))
        await queryClient.invalidateQueries({ queryKey: ["capabilities", "approvals"] })
      } catch (err) {
        setApprovalState((prev) => ({ ...prev, [gateId]: { pending: null, error: describeDecisionError(err), resolved: null } }))
      }
    },
    [items, selectedKey, approvalState, queryClient]
  )

  const select = (key: string) => {
    setSelectedKey(key)
    if (window.matchMedia?.("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }))
    }
  }

  const loading = !approvals.data && !approvals.isError
  const loadError = approvals.isError || (LIVE_MODE && projectsError)

  return (
    <div className="mx-auto w-full max-w-content px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <header className="relative isolate overflow-hidden rounded-2xl border border-border-soft px-5 py-8 sm:px-8 sm:py-10">
        <AtmosphereLayer hue="rust" origin="0% 0%" />
        <div className="relative max-w-3xl">
          <Badge variant="accent">Governance</Badge>
          <TwoToneHeading className="mt-4" lead="Approvals." muted="Decisions only you can make." />
          <p className="mt-3 max-w-xl text-body text-muted">
            Runs pause at governance gates before risky waves: deploys, destructive changes, budget overruns. Review the
            evidence, then approve to resume or reject to halt.
          </p>
        </div>
      </header>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CapabilitySegmentedControl
          className="self-start"
          ariaLabel="Gate status"
          value={view}
          onChange={setView}
          items={[
            { value: "pending", label: "Pending", count: approvals.data ? pending.length : undefined },
            { value: "decided", label: "Decided", count: approvals.data ? decided.length : undefined },
          ]}
        />
        <label className="relative inline-flex items-center self-start sm:self-auto">
          <span className="sr-only">Project</span>
          <FolderOpen className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-muted" aria-hidden="true" />
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="h-9 appearance-none rounded-pill border border-glass-border bg-glass pl-9 pr-4 text-caption text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="all">All projects</option>
            {projectOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5">
        {loadError ? (
          <InlineNotice
            title="Couldn't load approval gates."
            action={
              <Button variant="secondary" size="sm" onClick={() => approvals.refetch()}>
                Retry
              </Button>
            }
          >
            The kernel didn't return runs for your projects. Nothing was decided.
          </InlineNotice>
        ) : loading ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-busy="true" aria-label="Loading approvals">
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-80 rounded-xl" />
          </div>
        ) : visible.length === 0 && !(selected && approvalState[selected.gate.gate_id]?.resolved) ? (
          view === "pending" ? (
            <CalmEmpty decidedCount={decided.length} onShowHistory={() => setView("decided")} />
          ) : (
            <div className="rounded-xl border border-border bg-panel px-6 py-14 text-center" role="status">
              <History className="mx-auto h-5 w-5 text-faint" aria-hidden="true" />
              <p className="mt-3 text-body text-ink">No decisions yet</p>
              <p className="mt-1 text-caption text-muted">Approved and rejected gates will be listed here with who decided and when.</p>
            </div>
          )
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <ul className="space-y-2" aria-label={view === "pending" ? "Pending gates" : "Decided gates"}>
              {visible.map((item) => (
                <li key={item.key}>
                  <GateRow item={item} active={item.key === selected?.key} onSelect={() => select(item.key)} />
                </li>
              ))}
            </ul>
            <div ref={detailRef} className="scroll-mt-20 lg:sticky lg:top-6">
              {selected ? (
                <GateDetail item={selected} approvalState={approvalState} onDecision={handleDecision} />
              ) : (
                <div className="rounded-xl border border-dashed border-border-soft p-10 text-center text-caption text-faint">Select a gate to review it.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function CalmEmpty({ decidedCount, onShowHistory }: { decidedCount: number; onShowHistory: () => void }) {
  return (
    <div className="relative isolate overflow-hidden rounded-xl border border-border px-6 py-16 text-center" role="status">
      <AtmosphereLayer hue="moss" origin="50% 0%" />
      <div className="relative">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-pill border border-glass-border bg-glass text-ok">
          <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="mt-5 text-title text-ink">Nothing needs you right now.</p>
        <p className="mx-auto mt-2 max-w-sm text-caption text-muted">
          When a run pauses for a human decision, it lands here. Your agents keep working until then.
        </p>
        {decidedCount > 0 && (
          <Button className="mt-6" variant="secondary" size="sm" onClick={onShowHistory}>
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            View {decidedCount} past decision{decidedCount === 1 ? "" : "s"}
          </Button>
        )}
      </div>
    </div>
  )
}

function GateRow({ item, active, onSelect }: { item: ApprovalItem; active: boolean; onSelect: () => void }) {
  const pending = item.gate.status === "pending"
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={`w-full rounded-xl border p-4 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active ? "border-ink/25 bg-panel-alt" : "border-border bg-panel hover:border-ink/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink/[0.06] ${pending ? "text-warn" : "text-muted"}`}>
          {pending ? <ShieldQuestion className="h-4 w-4" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-caption font-medium text-ink">{gateTitle(item.gate.gate_name)}</span>
            <span className="shrink-0 font-mono text-2xs tabular-nums text-faint">
              {formatRelativeTime(pending ? item.gate.created_at : item.gate.decided_at ?? item.gate.created_at)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {item.projectName} · <span className="font-mono">{item.runId}</span>
          </p>
          {pending && item.gate.reason && <p className="mt-2 line-clamp-2 text-xs text-faint">{item.gate.reason}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {pending ? (
              <>
                {item.riskLevel && (
                  <Badge size="sm" variant={RISK_VARIANT[item.riskLevel as keyof typeof RISK_VARIANT] ?? "default"}>
                    {item.riskLevel} risk
                  </Badge>
                )}
                <span className="text-2xs text-faint">requested by {item.requestedBy.replace(/_/g, " ")}</span>
              </>
            ) : (
              <>
                <GateStatusPill status={item.gate.status} />
                {item.gate.decided_by && <span className="truncate text-2xs text-faint">by {item.gate.decided_by}</span>}
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}

function GateDetail({
  item,
  approvalState,
  onDecision,
}: {
  item: ApprovalItem
  approvalState: Record<string, A2UIApprovalUIState>
  onDecision: (gateId: string, action: A2UIApprovalAction) => Promise<void>
}) {
  const surface = useQuery({
    queryKey: ["capabilities", "gate-surface", item.key, item.gate.status],
    queryFn: () => fetchGateSurface(item),
    // Keep the card on screen while it refreshes after a decision (same gate only).
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[2] === item.key ? prev : undefined),
  })
  const local = approvalState[item.gate.gate_id]
  const decidedNow = local?.resolved
  const pending = item.gate.status === "pending" && !decidedNow
  const fields: Array<[string, ReactNode]> = [
    ["Project", item.projectName],
    ["Run", <span key="run" className="font-mono">{item.runId}</span>],
    ["Wave", <span key="wave" className="font-mono">{item.gate.wave_index}</span>],
    ["Requested by", <span key="req" className="capitalize">{item.requestedBy.replace(/_/g, " ")}</span>],
    ["Opened", <time key="opened" className="font-mono" dateTime={item.gate.created_at}>{new Date(item.gate.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</time>],
  ]

  return (
    <article aria-labelledby="gate-heading" className="rounded-xl border border-border bg-panel">
      <div className="border-b border-border-soft p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="gate-heading" className="text-title text-ink">
              {gateTitle(item.gate.gate_name)}
            </h2>
            <p className="mt-1 text-caption text-muted">{item.objective}</p>
          </div>
          <GateStatusPill status={decidedNow ?? item.gate.status} />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {fields.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-2xs text-faint">{label}</dt>
              <dd className="mt-0.5 truncate text-caption text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="space-y-4 p-5">
        <section aria-label="Approval surface">
          <h3 className="mb-1.5 flex items-center gap-2 text-xs font-medium text-faint">
            Decision
            <span className="font-mono text-2xs">a2ui/v1</span>
          </h3>
          {surface.isError ? (
            <InlineNotice title="Couldn't load the approval surface." action={<Button size="sm" variant="secondary" onClick={() => surface.refetch()}>Retry</Button>} />
          ) : !surface.data ? (
            <Skeleton className="h-28 w-full rounded-lg" />
          ) : (
            <div className="text-caption [&_[data-surface-id]]:rounded-lg [&_[data-surface-id]]:p-3.5">
              <A2UISurfaceView
                surface={surface.data}
                onApprovalAction={pending || local?.pending ? onDecision : undefined}
                approvalState={approvalState}
              />
            </div>
          )}
          {pending && (
            <p className="mt-2 flex items-center gap-1.5 text-2xs text-faint">
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              Waiting {formatRelativeTime(item.gate.created_at).replace(" ago", "")}. Rejecting halts downstream waves.
            </p>
          )}
        </section>

        {!pending && (item.gate.decided_by || decidedNow) && (
          <section aria-label="Decision record" className="rounded-lg border border-border-soft px-4 py-3">
            <p className="text-caption text-ink">
              <span className="capitalize">{decidedNow ?? item.gate.status}</span>
              {item.gate.decided_by && <> by {item.gate.decided_by}</>}
              {item.gate.decided_at && (
                <span className="font-mono text-xs text-faint"> · {new Date(item.gate.decided_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</span>
              )}
            </p>
            {item.gate.note && <p className="mt-1 text-caption text-muted">“{item.gate.note}”</p>}
          </section>
        )}
      </div>
    </article>
  )
}
