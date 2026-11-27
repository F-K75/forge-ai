import { useMemo, useState } from "react"
import { ArrowDownLeft, ArrowUpRight, ScrollText, Search } from "lucide-react"
import { DataTable, EmptyState, CapabilitySegmentedControl, type DataTableColumn } from "../../ui"
import { OutcomePill } from "../StatusPills"
import { mergeAudit, type A2AAuditRecord, type MCPAuditRecord, type ProtocolAuditRow } from "../../../lib/protocolsData"

type ProtocolFilter = "all" | "MCP" | "A2A"
type OutcomeFilter = "all" | "succeeded" | "denied" | "rejected" | "error"

export function AuditTab({ mcpAudit, a2aAudit }: { mcpAudit: MCPAuditRecord[]; a2aAudit: A2AAuditRecord[] }) {
  const rows = useMemo(() => mergeAudit(mcpAudit, a2aAudit), [mcpAudit, a2aAudit])
  const [protocol, setProtocol] = useState<ProtocolFilter>("all")
  const [outcome, setOutcome] = useState<OutcomeFilter>("all")
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (protocol === "all" || r.protocol === protocol) &&
        (outcome === "all" || r.outcome === outcome) &&
        (!q || `${r.action} ${r.target} ${r.detail ?? ""}`.toLowerCase().includes(q))
    )
  }, [rows, protocol, outcome, query])

  const count = (o: OutcomeFilter) => rows.filter((r) => (protocol === "all" || r.protocol === protocol) && (o === "all" || r.outcome === o)).length

  const columns: DataTableColumn<ProtocolAuditRow>[] = [
    {
      key: "time",
      header: "Time",
      className: "w-28",
      render: (r) => (
        <time dateTime={r.time} className="font-mono text-xs tabular-nums text-muted">
          {new Date(r.time).toLocaleTimeString([], { hour12: false })}
        </time>
      ),
    },
    {
      key: "dir",
      header: "Direction",
      hideOnMobile: true,
      render: (r) => (
        <span className="flex items-center gap-1 text-xs capitalize text-muted">
          {r.direction === "inbound" ? <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />}
          {r.direction}
        </span>
      ),
    },
    { key: "protocol", header: "Protocol", hideOnMobile: true, render: (r) => <span className="text-xs text-ink">{r.protocol}</span> },
    { key: "action", header: "Action", render: (r) => <span className="font-mono text-xs text-ink">{r.action}</span> },
    { key: "outcome", header: "Outcome", render: (r) => <OutcomePill outcome={r.outcome} /> },
    {
      key: "target",
      header: "Target",
      hideOnMobile: true,
      render: (r) => (
        <span className="block max-w-[22rem]">
          <span className="block truncate font-mono text-xs text-ink">{r.target}</span>
          {r.detail && <span className="block truncate text-2xs text-faint">{r.detail}</span>}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <CapabilitySegmentedControl
            className="self-start"
            ariaLabel="Filter by protocol"
            size="sm"
            value={protocol}
            onChange={setProtocol}
            items={[
              { value: "all", label: "All" },
              { value: "MCP", label: "MCP" },
              { value: "A2A", label: "A2A" },
            ]}
          />
          <CapabilitySegmentedControl
            className="self-start"
            ariaLabel="Filter by outcome"
            size="sm"
            value={outcome}
            onChange={setOutcome}
            items={(["all", "succeeded", "denied", "rejected", "error"] as OutcomeFilter[]).map((o) => ({
              value: o,
              label: o === "all" ? "Any outcome" : o[0].toUpperCase() + o.slice(1),
              count: count(o),
            }))}
          />
        </div>
        <div className="relative w-full xl:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search audit records"
            placeholder="Search action or target…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-pill border border-border bg-panel pl-10 pr-4 text-caption text-ink outline-none placeholder:text-faint focus:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/30"
          />
        </div>
      </div>

      <DataTable
        caption="Protocol audit records"
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        empty={<EmptyState icon={ScrollText} title="No matching records" description={rows.length ? "Loosen a filter to see more." : "Protocol calls will be recorded here."} />}
      />
      <p className="text-xs text-faint">
        Showing <span className="font-mono tabular-nums">{filtered.length}</span> of <span className="font-mono tabular-nums">{rows.length}</span> recent records. Times are local.
      </p>
    </div>
  )
}
