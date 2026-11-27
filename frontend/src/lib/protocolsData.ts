/**
 * Data access for the Protocols page. LIVE_MODE calls the project-scoped
 * Protocol Gateway (/v1/projects/{id}/protocols/*); demo mode serves
 * ./demo/protocolsDemo with small in-memory mutations so forms feel real.
 */
import { api } from "./api"
import { LIVE_MODE } from "./env"
import { protocolApi, type A2AAgentCard, type A2ATask, type MCPAppResourcePayload, type MCPAppSpec, type MCPToolSpec } from "./kernelApi"
import {
  DEMO_A2A_AUDIT,
  DEMO_INBOUND_TASKS,
  DEMO_MCP_APPS,
  DEMO_MCP_AUDIT,
  DEMO_MCP_SERVERS,
  DEMO_MCP_TOOLS,
  demoAgentCard,
  demoAppResource,
  demoRemoteCard,
  type A2AAuditRecord,
  type MCPAuditRecord,
  type MCPServerRecord,
} from "./demo/protocolsDemo"

export type { A2AAuditRecord, MCPAuditRecord, MCPServerRecord }

export const A2A_TERMINAL = new Set(["completed", "canceled", "failed"])

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
const base = (projectId: string) => `/v1/projects/${encodeURIComponent(projectId)}/protocols`

export function apiBaseUrl(): string {
  return String(api.defaults?.baseURL ?? "").replace(/\/$/, "")
}

// ---------------------------------------------------------------------------
// URL validation (client-side mirror of the gateway's advisory SSRF pre-check)
// ---------------------------------------------------------------------------

const PRIVATE_V4 = [/^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./]

/** Returns an error message, or null when the URL is acceptable to submit. */
export function validatePublicHttpsUrl(raw: string, { label = "URL" }: { label?: string } = {}): string | null {
  const value = raw.trim()
  if (!value) return `Enter the ${label}.`
  if (value.length < 10 || value.length > 2048) return `${label} must be 10–2048 characters.`
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return `That doesn't look like a valid ${label}.`
  }
  if (url.protocol !== "https:") return `${label} must use https://.`
  if (url.username || url.password) return `${label} must not contain credentials.`
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "")
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return "Internal hostnames are blocked by the gateway's SSRF policy."
  }
  if (/^[\d.]+$/.test(host) && PRIVATE_V4.some((re) => re.test(host))) {
    return "Private and loopback addresses are blocked by the gateway's SSRF policy."
  }
  if (host.includes(":") && (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80"))) {
    return "Private and loopback addresses are blocked by the gateway's SSRF policy."
  }
  if (!host.includes(".") && !host.includes(":")) return `${label} needs a fully qualified hostname.`
  return null
}

export function validateServerId(raw: string): string | null {
  const v = raw.trim()
  if (v.length < 2 || v.length > 48) return "Server ID must be 2–48 characters."
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return "Use letters, digits, hyphens or underscores."
  return null
}

// ---------------------------------------------------------------------------
// Gateway snapshot
// ---------------------------------------------------------------------------

export interface ProtocolSnapshot {
  servers: MCPServerRecord[]
  tools: MCPToolSpec[]
  apps: MCPAppSpec[]
  mcpAudit: MCPAuditRecord[]
  card: (A2AAgentCard & Record<string, unknown>) | null
  a2aAudit: A2AAuditRecord[]
  /** Which gateway reads succeeded (drives the live status pills). */
  reachable: { mcp: boolean; a2a: boolean }
}

const demoState = {
  servers: [...DEMO_MCP_SERVERS],
  inbound: DEMO_INBOUND_TASKS.map((t) => ({ ...t, status: { ...t.status } })),
  remote: new Map<string, { sentAt: number; text: string; canceled?: boolean }>(),
}

/** Reset in-memory demo mutations (tests). */
export function resetProtocolDemoState() {
  demoState.servers = [...DEMO_MCP_SERVERS]
  demoState.inbound = DEMO_INBOUND_TASKS.map((t) => ({ ...t, status: { ...t.status } }))
  demoState.remote.clear()
}

export async function fetchProtocolSnapshot(projectId: string): Promise<ProtocolSnapshot> {
  if (!LIVE_MODE) {
    await delay(120)
    return {
      servers: demoState.servers,
      tools: DEMO_MCP_TOOLS,
      apps: DEMO_MCP_APPS,
      mcpAudit: DEMO_MCP_AUDIT,
      card: demoAgentCard(projectId, apiBaseUrl()),
      a2aAudit: DEMO_A2A_AUDIT,
      reachable: { mcp: true, a2a: true },
    }
  }
  const [mcp, card, audit] = await Promise.allSettled([
    protocolApi.listMcpTools(projectId),
    api.get(`${base(projectId)}/a2a/.well-known/agent.json`).then((r) => r.data as A2AAgentCard & Record<string, unknown>),
    api.get(`${base(projectId)}/a2a/audit`, { params: { limit: 100 } }).then((r) => (r.data?.audit_log ?? []) as A2AAuditRecord[]),
  ])
  if (mcp.status === "rejected" && card.status === "rejected") throw mcp.reason
  const m = mcp.status === "fulfilled" ? mcp.value : null
  return {
    servers: (m?.servers ?? []) as unknown as MCPServerRecord[],
    tools: m?.tools ?? [],
    apps: m?.apps ?? [],
    mcpAudit: (m?.audit_log ?? []) as unknown as MCPAuditRecord[],
    card: card.status === "fulfilled" ? card.value : null,
    a2aAudit: audit.status === "fulfilled" ? audit.value : [],
    reachable: { mcp: mcp.status === "fulfilled", a2a: card.status === "fulfilled" },
  }
}

export async function registerMcpServer(
  projectId: string,
  payload: { server_id: string; endpoint_url: string; discover_tools: boolean }
): Promise<{ server: MCPServerRecord; discovered_tools: MCPToolSpec[] }> {
  if (!LIVE_MODE) {
    await delay(300)
    const server: MCPServerRecord = { server_id: payload.server_id, endpoint_url: payload.endpoint_url, transport: "streamable-http", status: "registered" }
    demoState.servers = [...demoState.servers.filter((s) => s.server_id !== server.server_id), server]
    return { server, discovered_tools: [] }
  }
  const res = await protocolApi.registerMcpServer(projectId, payload)
  return res as unknown as { server: MCPServerRecord; discovered_tools: MCPToolSpec[] }
}

export async function loadMcpAppResource(projectId: string, app: MCPAppSpec, department: string): Promise<MCPAppResourcePayload> {
  if (!LIVE_MODE) {
    await delay(150)
    return demoAppResource(app)
  }
  return protocolApi.getMcpAppResource(projectId, app.app_id, { role: "workspace_operator", department })
}

// ---------------------------------------------------------------------------
// A2A
// ---------------------------------------------------------------------------

export async function listInboundTasks(projectId: string, audit: A2AAuditRecord[]): Promise<A2ATask[]> {
  if (!LIVE_MODE) {
    await delay(100)
    return demoState.inbound
  }
  // No list endpoint exists: derive task ids from the inbound audit trail.
  const ids = Array.from(
    new Set(
      audit
        .filter((a) => a.direction === "inbound" && a.method === "tasks/send" && a.status === "succeeded" && a.task_id)
        .map((a) => a.task_id as string)
    )
  ).slice(0, 12)
  const results = await Promise.allSettled(ids.map((id) => protocolApi.getA2ATask(projectId, id)))
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []))
}

export async function cancelInboundTask(projectId: string, taskId: string): Promise<A2ATask> {
  if (!LIVE_MODE) {
    await delay(200)
    const t = demoState.inbound.find((x) => x.id === taskId)
    if (!t) throw new Error("A2A task not found")
    t.status = { ...t.status, state: "canceled", timestamp: new Date().toISOString(), message: { role: "agent", parts: [{ type: "text", text: "Canceled from Forge." }] } }
    demoState.inbound = [...demoState.inbound]
    return t
  }
  const res = await api.post(`${base(projectId)}/a2a/tasks/${encodeURIComponent(taskId)}/cancel`)
  return res.data as A2ATask
}

export async function discoverRemoteAgent(projectId: string, agentUrl: string): Promise<Record<string, unknown>> {
  if (!LIVE_MODE) {
    await delay(400)
    return demoRemoteCard(agentUrl)
  }
  const res = await api.post(`${base(projectId)}/a2a/remote/discover`, { agent_url: agentUrl })
  return res.data as Record<string, unknown>
}

function demoRemoteTask(id: string): A2ATask {
  const rec = demoState.remote.get(id)
  if (!rec) throw new Error("Remote task not found")
  const elapsed = Date.now() - rec.sentAt
  const state = rec.canceled ? "canceled" : elapsed < 1500 ? "submitted" : elapsed < 4000 ? "working" : "completed"
  const text =
    state === "completed" ? "Report ready: 2 licence warnings, 0 blocking." : state === "working" ? "Scanning dependency graph…" : state === "canceled" ? "Canceled by caller." : "Accepted."
  return { id, status: { state, message: { role: "agent", parts: [{ type: "text", text }] }, timestamp: new Date().toISOString() }, artifacts: [] }
}

export async function sendRemoteTask(projectId: string, endpointUrl: string, text: string): Promise<A2ATask> {
  if (!LIVE_MODE) {
    await delay(250)
    const id = `forge_${Math.random().toString(16).slice(2, 14)}`
    demoState.remote.set(id, { sentAt: Date.now(), text })
    return demoRemoteTask(id)
  }
  const res = await api.post(`${base(projectId)}/a2a/remote/tasks/send`, { endpoint_url: endpointUrl, text, wait_seconds: 0 })
  return res.data as A2ATask
}

export async function getRemoteTask(projectId: string, endpointUrl: string, taskId: string): Promise<A2ATask> {
  if (!LIVE_MODE) {
    await delay(80)
    return demoRemoteTask(taskId)
  }
  const res = await api.post(`${base(projectId)}/a2a/remote/tasks/${encodeURIComponent(taskId)}/get`, { endpoint_url: endpointUrl })
  return res.data as A2ATask
}

export async function cancelRemoteTask(projectId: string, endpointUrl: string, taskId: string): Promise<A2ATask> {
  if (!LIVE_MODE) {
    await delay(150)
    const rec = demoState.remote.get(taskId)
    if (rec) rec.canceled = true
    return demoRemoteTask(taskId)
  }
  const res = await api.post(`${base(projectId)}/a2a/remote/tasks/${encodeURIComponent(taskId)}/cancel`, { endpoint_url: endpointUrl })
  return res.data as A2ATask
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface ProtocolAuditRow {
  id: string
  time: string
  protocol: "MCP" | "A2A"
  direction: string
  action: string
  outcome: string
  target: string
  detail?: string | null
}

export function mergeAudit(mcp: MCPAuditRecord[], a2a: A2AAuditRecord[]): ProtocolAuditRow[] {
  const rows: ProtocolAuditRow[] = [
    ...mcp.map((r) => ({
      id: `mcp-${r.invocation_id}`,
      time: r.created_at,
      protocol: "MCP" as const,
      direction: "outbound",
      action: r.action || "tools/call",
      outcome: r.status,
      target: r.tool_name,
      detail: r.reason ?? `${r.role} · ${r.department}`,
    })),
    ...a2a.map((r) => ({
      id: `a2a-${r.audit_id}`,
      time: r.created_at,
      protocol: "A2A" as const,
      direction: r.direction,
      action: r.method,
      outcome: r.status,
      target: r.peer || r.task_id || "—",
      detail: r.reason ?? (r.task_id ? `task ${r.task_id}` : null),
    })),
  ]
  return rows.sort((a, b) => b.time.localeCompare(a.time))
}
