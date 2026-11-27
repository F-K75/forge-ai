import { useState, type FormEvent } from "react"
import { CheckCircle2, Plus, Server } from "lucide-react"
import { Badge, Button, DataTable, Input, type DataTableColumn } from "../../ui"
import type { MCPToolSpec } from "../../../lib/kernelApi"
import {
  registerMcpServer,
  validatePublicHttpsUrl,
  validateServerId,
  type MCPServerRecord,
} from "../../../lib/protocolsData"

interface Props {
  projectId: string
  servers: MCPServerRecord[]
  tools: MCPToolSpec[]
  onRegistered: () => void
}

function describeError(err: unknown): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === "string" && detail.trim()) return detail.slice(0, 300)
  return "The gateway couldn't register this server. Try again."
}

export function McpServersTab({ projectId, servers, tools, onRegistered }: Props) {
  const toolCount = (id: string) => tools.filter((t) => t.server_id === id).length

  const columns: DataTableColumn<MCPToolSpec>[] = [
    { key: "name", header: "Tool", render: (t) => <span className="font-mono text-xs text-ink">{t.name}</span> },
    { key: "desc", header: "Description", hideOnMobile: true, render: (t) => <span className="line-clamp-1 text-muted">{t.description}</span> },
    {
      key: "depts",
      header: "Departments",
      hideOnMobile: true,
      render: (t) => <span className="text-xs capitalize text-faint">{t.allowed_departments.slice(0, 3).join(", ")}{t.allowed_departments.length > 3 ? ` +${t.allowed_departments.length - 3}` : ""}</span>,
    },
    {
      key: "flags",
      header: "Mode",
      className: "text-right",
      render: (t) => (
        <span className="inline-flex justify-end gap-1">
          {t.ui_resource_uri && <Badge size="sm" variant="outlined">ui://</Badge>}
          <Badge size="sm">{t.read_only ? "read-only" : "writes"}</Badge>
        </span>
      ),
    },
  ]

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-6">
        <section aria-labelledby="servers-heading">
          <h2 id="servers-heading" className="mb-3 text-body font-medium text-ink">
            Registered servers <span className="font-mono text-caption text-faint">{servers.length}</span>
          </h2>
          <ul className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-panel">
            {servers.map((s) => (
              <li key={s.server_id} className="flex items-center gap-3 px-4 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink/[0.06] text-muted">
                  <Server className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-caption text-ink">{s.server_id}</p>
                  <p className="truncate text-xs text-faint">
                    {s.transport}
                    {s.endpoint_url ? ` · ${s.endpoint_url}` : ""}
                  </p>
                </div>
                <span className="hidden font-mono text-xs tabular-nums text-muted sm:inline">{toolCount(s.server_id)} tools</span>
                <Badge size="sm" variant={s.status === "connected" ? "success" : "default"} dot={s.status === "connected"} className="capitalize">
                  {s.status}
                </Badge>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="tools-heading">
          <h2 id="tools-heading" className="mb-3 text-body font-medium text-ink">
            Governed tools <span className="font-mono text-caption text-faint">{tools.length}</span>
          </h2>
          <DataTable caption="MCP tools" columns={columns} rows={tools} rowKey={(t) => t.name} empty={<p className="p-6 text-center text-caption text-faint">No tools registered yet.</p>} />
        </section>
      </div>

      <RegisterServerForm projectId={projectId} onRegistered={onRegistered} />
    </div>
  )
}

function RegisterServerForm({ projectId, onRegistered }: { projectId: string; onRegistered: () => void }) {
  const [serverId, setServerId] = useState("")
  const [url, setUrl] = useState("")
  const [discover, setDiscover] = useState(true)
  const [touched, setTouched] = useState({ id: false, url: false })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const idError = validateServerId(serverId)
  const urlError = validatePublicHttpsUrl(url, { label: "Endpoint URL" })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched({ id: true, url: true })
    if (idError || urlError || pending) return
    setPending(true)
    setError(null)
    setDone(null)
    try {
      const res = await registerMcpServer(projectId, { server_id: serverId.trim(), endpoint_url: url.trim(), discover_tools: discover })
      setDone(`${res.server.server_id} registered${res.discovered_tools.length ? `, ${res.discovered_tools.length} tools discovered` : ""}.`)
      setServerId("")
      setUrl("")
      setTouched({ id: false, url: false })
      onRegistered()
    } catch (err) {
      setError(describeError(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <aside aria-labelledby="register-heading" className="h-fit rounded-xl border border-border bg-panel p-5">
      <h2 id="register-heading" className="text-body font-medium text-ink">
        Register a server
      </h2>
      <p className="mt-1 text-caption text-muted">Streamable HTTP over https. The gateway checks the address against its SSRF policy.</p>
      <form className="mt-4 space-y-3.5" onSubmit={submit} noValidate>
        <Input
          id="mcp-server-id"
          label="Server ID"
          placeholder="docs-mcp"
          value={serverId}
          maxLength={48}
          onChange={(e) => setServerId(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, id: true }))}
          error={touched.id && serverId ? idError ?? undefined : touched.id && !serverId ? "Enter a server ID." : undefined}
        />
        <Input
          id="mcp-server-url"
          label="Endpoint URL"
          placeholder="https://mcp.example.com/rpc"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, url: true }))}
          error={touched.url ? urlError ?? undefined : undefined}
          hint="https only, public host, no credentials in the URL."
        />
        <label className="flex items-center gap-2.5 text-caption text-muted">
          <input type="checkbox" checked={discover} onChange={(e) => setDiscover(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--primary))]" />
          Discover tools now
        </label>
        <Button type="submit" variant="primary" className="w-full text-[rgb(var(--bg))]" loading={pending}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Register server
        </Button>
        {error && (
          <p role="alert" className="text-caption text-error">
            {error}
          </p>
        )}
        {done && (
          <p role="status" className="flex items-center gap-1.5 text-caption text-ok">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {done}
          </p>
        )}
      </form>
    </aside>
  )
}
