import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AtmosphereLayer, Badge, Button, InlineNotice, SegmentedControl, Skeleton, TwoToneHeading } from "../components/ui"
import { NoProjectState, ProjectPicker } from "../components/capabilities/ProjectScope"
import { useScopedProject } from "../components/capabilities/useScopedProject"
import { OverviewTab, type ProtocolTab } from "../components/capabilities/protocols/OverviewTab"
import { McpServersTab } from "../components/capabilities/protocols/McpServersTab"
import { McpAppsTab } from "../components/capabilities/protocols/McpAppsTab"
import { A2ATab } from "../components/capabilities/protocols/A2ATab"
import { AuditTab } from "../components/capabilities/protocols/AuditTab"
import { fetchProtocolSnapshot } from "../lib/protocolsData"
import { LIVE_MODE } from "../lib/env"

export default function ProtocolsPage() {
  const { projectId, setProjectId, projects, isLoading: projectsLoading } = useScopedProject()
  const [tab, setTab] = useState<ProtocolTab>("overview")

  const snapshot = useQuery({
    queryKey: ["capabilities", "protocols", projectId],
    queryFn: () => fetchProtocolSnapshot(projectId as string),
    enabled: Boolean(projectId),
  })
  const data = snapshot.data
  const noProject = LIVE_MODE && !projectsLoading && !projectId

  const tabs = [
    { value: "overview" as const, label: "Overview" },
    { value: "mcp" as const, label: "MCP servers", count: data?.servers.length },
    { value: "apps" as const, label: "MCP Apps", count: data?.apps.length },
    { value: "a2a" as const, label: "A2A" },
    { value: "audit" as const, label: "Audit", count: data ? data.mcpAudit.length + data.a2aAudit.length : undefined },
  ]

  return (
    <div className="mx-auto w-full max-w-content px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <header className="relative isolate overflow-hidden rounded-2xl border border-border-soft px-5 py-8 sm:px-8 sm:py-10">
        <AtmosphereLayer hue="teal" origin="100% 0%" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl">
            <Badge variant="accent">Protocol gateway</Badge>
            <TwoToneHeading className="mt-4" lead="Protocols." muted="How Forge talks to the world." />
            <p className="mt-3 max-w-xl text-body text-muted">
              Tools over MCP, interactive tool views over MCP Apps, and agent-to-agent work over A2A. Every call goes
              through one gateway with the same auth, SSRF checks and audit trail.
            </p>
          </div>
          <ProjectPicker className="self-start md:self-auto" projectId={projectId} projects={projects} onChange={setProjectId} />
        </div>
      </header>

      {noProject ? (
        <div className="mt-8">
          <NoProjectState what="Protocol connections" />
        </div>
      ) : (
        <>
          <SegmentedControl className="mt-6" ariaLabel="Protocol sections" idPrefix="protocols" value={tab} onChange={setTab} items={tabs} />
          <div role="tabpanel" id="protocols-panel" aria-labelledby={`protocols-tab-${tab}`} className="mt-6" tabIndex={-1}>
            {snapshot.isError ? (
              <InlineNotice
                title="Couldn't reach the protocol gateway."
                action={
                  <Button variant="secondary" size="sm" onClick={() => snapshot.refetch()}>
                    Retry
                  </Button>
                }
              >
                MCP and A2A endpoints for this project didn't respond.
              </InlineNotice>
            ) : !data || !projectId ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading protocols">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-52 rounded-xl" />
                ))}
              </div>
            ) : tab === "overview" ? (
              <OverviewTab snapshot={data} onNavigate={setTab} />
            ) : tab === "mcp" ? (
              <McpServersTab projectId={projectId} servers={data.servers} tools={data.tools} onRegistered={() => snapshot.refetch()} />
            ) : tab === "apps" ? (
              <McpAppsTab projectId={projectId} apps={data.apps} tools={data.tools} />
            ) : tab === "a2a" ? (
              <A2ATab projectId={projectId} card={data.card} audit={data.a2aAudit} />
            ) : (
              <AuditTab mcpAudit={data.mcpAudit} a2aAudit={data.a2aAudit} />
            )}
          </div>
        </>
      )}
    </div>
  )
}
