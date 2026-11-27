import { AppWindow, ArrowUpRight, Cable, LayoutTemplate, Network, Radio, type LucideIcon } from "lucide-react"
import { Badge, CapabilityCard, type AtmosphereHue } from "../../ui"
import type { ProtocolSnapshot } from "../../../lib/protocolsData"

export type ProtocolTab = "overview" | "mcp" | "apps" | "a2a" | "audit"

const ADR_URL = "https://github.com/F-K75/forge-ai/blob/main/docs/architecture/ADR-protocol-deferral.md"

const DEFERRED: Array<{ name: string; tier: "P2" | "P3"; note: string }> = [
  { name: "ACP", tier: "P2", note: "overlaps A2A" },
  { name: "WebMCP", tier: "P2", note: "draft spec" },
  { name: "OASF", tier: "P2", note: "overlaps agent cards" },
  { name: "ANP", tier: "P3", note: "draft spec" },
  { name: "AP2", tier: "P3", note: "moves money" },
  { name: "x402", tier: "P3", note: "moves money" },
  { name: "UCP", tier: "P3", note: "moves money" },
]

interface ProtocolCardDef {
  key: string
  title: string
  icon: LucideIcon
  hue: AtmosphereHue
  spec: string
  description: string
  tab?: ProtocolTab
  metrics: Array<[string, number | string]>
  state: "live" | "unreachable" | "available"
}

export function OverviewTab({ snapshot, onNavigate }: { snapshot: ProtocolSnapshot; onNavigate: (tab: ProtocolTab) => void }) {
  const resourceApps = snapshot.apps.filter((a) => a.resource_uri || a.ui_schema?.kind === "mcp-app-resource").length
  const inboundSends = snapshot.a2aAudit.filter((a) => a.direction === "inbound" && a.method === "tasks/send").length
  const outbound = snapshot.a2aAudit.filter((a) => a.direction === "outbound").length
  const mcpState = snapshot.reachable.mcp ? "live" : "unreachable"

  const cards: ProtocolCardDef[] = [
    {
      key: "mcp",
      title: "MCP",
      icon: Cable,
      hue: "teal",
      spec: "mcp/2025-03-26",
      description: "Governed tool calls with per-department allowlists and an audit trail.",
      tab: "mcp",
      metrics: [
        ["servers", snapshot.servers.length],
        ["tools", snapshot.tools.length],
      ],
      state: mcpState,
    },
    {
      key: "apps",
      title: "MCP Apps",
      icon: AppWindow,
      hue: "olive",
      spec: "mcp-apps/v1",
      description: "Tool UIs from ui:// resources, rendered in a locked-down sandbox.",
      tab: "apps",
      metrics: [
        ["apps", snapshot.apps.length],
        ["ui:// views", resourceApps],
      ],
      state: mcpState,
    },
    {
      key: "a2a",
      title: "A2A",
      icon: Network,
      hue: "rust",
      spec: snapshot.card ? `a2a · card v${snapshot.card.version}` : "a2a/v1",
      description: "Other agents send Forge tasks; Forge discovers and calls remote agents.",
      tab: "a2a",
      metrics: [
        ["inbound", inboundSends],
        ["outbound", outbound],
      ],
      state: snapshot.reachable.a2a ? "live" : "unreachable",
    },
    {
      key: "agui",
      title: "AG-UI",
      icon: Radio,
      hue: "slate",
      spec: "ag-ui/v1",
      description: "Per-run SSE event stream with Last-Event-ID replay for live UIs.",
      metrics: [
        ["transport", "SSE per run"],
        ["resume", "Last-Event-ID"],
      ],
      state: "available",
    },
    {
      key: "a2ui",
      title: "A2UI",
      icon: LayoutTemplate,
      hue: "moss",
      spec: "a2ui/v1",
      description: "Typed, declarative surfaces like approval cards, built from run state.",
      metrics: [
        ["components", "16 typed"],
        ["approvals", "Approve · Reject"],
      ],
      state: "available",
    },
  ]

  return (
    <div className="space-y-6">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6" aria-label="Active protocols">
        {cards.map((c, i) => (
          <li key={c.key} className={i < 3 ? "lg:col-span-2" : "lg:col-span-3"}>
            <CapabilityCard
              hue={c.hue}
              icon={c.icon}
              title={c.title}
              description={c.description}
              onClick={c.tab ? () => onNavigate(c.tab as ProtocolTab) : undefined}
              ariaLabel={c.tab ? `Open ${c.title}` : undefined}
              eyebrow={
                c.state === "live" ? (
                  <Badge size="sm" variant="success" dot>
                    Live
                  </Badge>
                ) : c.state === "unreachable" ? (
                  <Badge size="sm" variant="error" dot>
                    Unreachable
                  </Badge>
                ) : (
                  <Badge size="sm" variant="default">
                    Available
                  </Badge>
                )
              }
              footer={
                <>
                  <span className="font-mono">{c.spec}</span>
                  {c.tab && <ArrowUpRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" />}
                </>
              }
            >
              <span className="flex gap-5">
                {c.metrics.map(([label, value]) => (
                  <span key={label} className="flex flex-col">
                    <span className={typeof value === "number" ? "font-mono text-title tabular-nums text-ink" : "text-caption text-ink"}>{value}</span>
                    <span className="text-2xs text-faint">{label}</span>
                  </span>
                ))}
              </span>
            </CapabilityCard>
          </li>
        ))}
      </ul>

      <section aria-labelledby="deferred-heading" className="rounded-xl border border-dashed border-border px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <h2 id="deferred-heading" className="text-caption font-medium text-muted">
                Deferred
              </h2>
              <Badge size="sm" variant="outlined">
                Watch list
              </Badge>
            </div>
            <p className="mt-1.5 text-caption text-faint">
              Not built until each one has concrete demand, a stable spec, an owner, and no existing adapter that already
              covers it. Payment protocols also need a threat model, human approval gates and a compliance sign-off.
            </p>
          </div>
          <ul className="flex flex-wrap gap-1.5" aria-label="Deferred protocols">
            {DEFERRED.map((p) => (
              <li
                key={p.name}
                title={p.note}
                className="inline-flex items-center gap-1.5 rounded-pill border border-border-soft px-2.5 py-1 text-xs text-faint"
              >
                <span className="text-muted">{p.name}</span>
                <span className="font-mono text-2xs">{p.tier}</span>
              </li>
            ))}
          </ul>
        </div>
        <a
          href={ADR_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-4 inline-flex items-center gap-1 text-xs text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ADR: Defer P2/P3 agent protocols
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </a>
      </section>
    </div>
  )
}
