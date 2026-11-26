import { useCallback, useState } from "react"
import { AppWindow, Lock } from "lucide-react"
import { Badge, CapabilityCard, Drawer, EmptyState } from "../../ui"
import { MCPAppFrame } from "../../a2ui/MCPAppFrame"
import type { MCPAppSpec, MCPToolSpec } from "../../../lib/kernelApi"
import { loadMcpAppResource } from "../../../lib/protocolsData"

function isResourceBacked(app: MCPAppSpec): boolean {
  return Boolean(app.resource_uri || app.ui_schema?.resource_uri || app.ui_schema?.kind === "mcp-app-resource")
}

export function McpAppsTab({ projectId, apps, tools }: { projectId: string; apps: MCPAppSpec[]; tools: MCPToolSpec[] }) {
  const [open, setOpen] = useState<MCPAppSpec | null>(null)
  const department = useCallback(
    (app: MCPAppSpec) => tools.find((t) => t.name === app.tool_name)?.allowed_departments?.[0] ?? "engineering",
    [tools]
  )
  const loadResource = useCallback(
    () => (open ? loadMcpAppResource(projectId, open, department(open)) : Promise.reject(new Error("No app"))),
    [open, projectId, department]
  )

  if (apps.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-panel">
        <EmptyState icon={AppWindow} title="No MCP Apps yet" description="Apps appear when a registered server declares a ui:// resource on one of its tools." />
      </div>
    )
  }

  return (
    <>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="MCP Apps">
        {apps.map((app) => {
          const backed = isResourceBacked(app)
          const uri = app.resource_uri || app.ui_schema?.resource_uri
          return (
            <li key={app.app_id}>
              <CapabilityCard
                hue={backed ? "teal" : "slate"}
                origin={backed ? "0% 0%" : "100% 0%"}
                icon={AppWindow}
                title={app.title}
                description={<span className="line-clamp-2">{app.description}</span>}
                onClick={backed ? () => setOpen(app) : undefined}
                ariaLabel={backed ? `Open ${app.title}` : undefined}
                eyebrow={backed ? <Badge size="sm" variant="outlined">ui://</Badge> : <Badge size="sm">Built-in</Badge>}
                footer={
                  <>
                    <span className="truncate font-mono">{uri ?? app.tool_name}</span>
                    {backed ? <span className="shrink-0 text-muted">Open</span> : <span className="shrink-0">Kernel inspector</span>}
                  </>
                }
              >
                <span className="font-mono text-2xs text-faint">{app.server_id}</span>
              </CapabilityCard>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-faint">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        Views render in an iframe with only allow-scripts, a deny-by-default CSP and no access to Forge's origin.
      </p>

      {open && (
        <Drawer open onOpenChange={(o) => !o && setOpen(null)} title={open.title} className="w-full max-w-full sm:w-[40rem]">
          <div className="space-y-4">
            <p className="text-caption text-muted">{open.description}</p>
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border-soft px-3 py-2">
                <dt className="text-faint">Tool</dt>
                <dd className="mt-0.5 truncate font-mono text-ink">{open.tool_name}</dd>
              </div>
              <div className="rounded-lg border border-border-soft px-3 py-2">
                <dt className="text-faint">Server</dt>
                <dd className="mt-0.5 truncate font-mono text-ink">{open.server_id}</dd>
              </div>
            </dl>
            <MCPAppFrame key={open.app_id} title={open.title} loadResource={loadResource} />
          </div>
        </Drawer>
      )}
    </>
  )
}
