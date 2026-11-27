/**
 * Demo data for the Protocols page, shaped like the real Protocol Gateway
 * responses (backend/api/protocols.py, core/protocol_gateway.py, core/a2a_adapter.py).
 */
import type { A2AAgentCard, A2ATask, MCPAppResourcePayload, MCPAppSpec, MCPToolSpec } from "../kernelApi"
import { DEMO_SKILL_CATALOG } from "./skillCatalog"
import { COLORS } from "../theme"

export interface MCPServerRecord {
  server_id: string
  endpoint_url?: string
  transport: string
  status: string
  discovered_tools?: number
}

export interface MCPAuditRecord {
  invocation_id: string
  tool_name: string
  server_id: string
  role: string
  department: string
  project_id: string
  status: "succeeded" | "denied" | "error" | string
  reason?: string | null
  action: string
  resource_uri?: string | null
  created_at: string
}

export interface A2AAuditRecord {
  audit_id: string
  direction: "inbound" | "outbound" | string
  method: string
  project_id: string
  status: "succeeded" | "denied" | "rejected" | "error" | string
  task_id?: string | null
  peer?: string | null
  actor?: string | null
  reason?: string | null
  created_at: string
}

/** Fixed "now" for demo timestamps so screenshots and tests are stable-ish. */
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

export const DEMO_MCP_SERVERS: MCPServerRecord[] = [
  { server_id: "forge-workspace-mcp", transport: "in-process", status: "connected" },
  {
    server_id: "docs-mcp",
    endpoint_url: "https://mcp.docs-example.dev/rpc",
    transport: "streamable-http",
    status: "connected",
    discovered_tools: 3,
  },
  {
    server_id: "issue-tracker",
    endpoint_url: "https://mcp.tracker-example.io/mcp",
    transport: "streamable-http",
    status: "registered",
  },
]

const ENG = ["engineering", "architecture", "security", "quality"]

export const DEMO_MCP_TOOLS: MCPToolSpec[] = [
  { name: "blackboard.query", server_id: "forge-workspace-mcp", description: "Query versioned cross-agent artifacts on the Shared Blackboard for a run.", allowed_departments: ["engineering", "architecture", "quality", "delivery", "leadership"], read_only: true },
  { name: "repo.read_file", server_id: "forge-workspace-mcp", description: "Read a file from the project workspace with path confinement.", allowed_departments: ["engineering", "architecture", "security", "quality", "design"], read_only: true },
  { name: "security.static_scan", server_id: "forge-workspace-mcp", description: "Static hygiene checks for hardcoded secrets, unsafe HTML sinks and shell execution.", allowed_departments: ["security", "quality", "engineering", "architecture"], read_only: true },
  { name: "skills.route", server_id: "forge-workspace-mcp", description: "Score and resolve SKILL.md activations for a role and objective.", allowed_departments: ["engineering", "architecture", "leadership"], read_only: true },
  { name: "docs-mcp.search", server_id: "docs-mcp", description: "Full-text search across the team's product documentation.", allowed_departments: ENG, read_only: true },
  { name: "docs-mcp.release_notes", server_id: "docs-mcp", description: "Draft release notes from merged changes, with an interactive preview.", allowed_departments: ENG, read_only: true, ui_resource_uri: "ui://docs-mcp/release-notes.html" },
  { name: "docs-mcp.coverage_map", server_id: "docs-mcp", description: "Map which endpoints and components lack documentation.", allowed_departments: ENG, read_only: true, ui_resource_uri: "ui://docs-mcp/coverage-map.html" },
]

export const DEMO_MCP_APPS: MCPAppSpec[] = [
  { app_id: "app_security_hygiene", title: "Security Hygiene Inspector", tool_name: "security.static_scan", server_id: "forge-workspace-mcp", description: "Interactive static scanner checking code snippets for hardcoded credentials, unsafe HTML sinks, and shell injection.", protocol: "mcp-apps/v1", ui_schema: { input_field: "code", input_label: "Code Snippet", action_label: "Run Static Scan", result_view: "findings_list" } },
  { app_id: "app_skill_router", title: "Skill Router Workbench", tool_name: "skills.route", server_id: "forge-workspace-mcp", description: "Inspect 9-domain SKILL.md activation scores, transitive dependencies, and permission boundaries for any role.", protocol: "mcp-apps/v1", ui_schema: { input_field: "objective", input_label: "Engineering Objective", action_label: "Route Skills", result_view: "skill_table" } },
  { app_id: "app_docs_mcp_release_notes", title: "Release notes preview", tool_name: "docs-mcp.release_notes", server_id: "docs-mcp", description: "Draft release notes from merged changes, with an interactive preview.", protocol: "mcp-apps/v1", ui_schema: { kind: "mcp-app-resource", resource_uri: "ui://docs-mcp/release-notes.html" }, resource_uri: "ui://docs-mcp/release-notes.html" },
  { app_id: "app_docs_mcp_coverage_map", title: "Docs coverage map", tool_name: "docs-mcp.coverage_map", server_id: "docs-mcp", description: "Map which endpoints and components lack documentation.", protocol: "mcp-apps/v1", ui_schema: { kind: "mcp-app-resource", resource_uri: "ui://docs-mcp/coverage-map.html" }, resource_uri: "ui://docs-mcp/coverage-map.html" },
]

const APP_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"

function appHtml(title: string, rows: Array<[string, string]>): string {
  const items = rows
    .map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`)
    .join("")
  return `<!DOCTYPE html>
<meta http-equiv="Content-Security-Policy" content="${APP_CSP}">
<style>
body{margin:0;padding:16px;font:13px/1.45 system-ui,sans-serif;background:${COLORS.base};color:${COLORS.ink}}
h1{font-size:14px;font-weight:500;margin:0 0 10px}ul{list-style:none;margin:0;padding:0}
li{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.08)}
span{color:${COLORS.muted}}b{font-weight:500}
</style>
<h1>${title}</h1><ul>${items}</ul>
<script>parent.postMessage({jsonrpc:"2.0",method:"ui/notifications/size-changed",params:{height:document.body.scrollHeight}},"*")</script>`
}

export function demoAppResource(app: MCPAppSpec): MCPAppResourcePayload {
  const html =
    app.app_id === "app_docs_mcp_coverage_map"
      ? appHtml("Docs coverage", [["API endpoints", "82%"], ["UI components", "64%"], ["Runbooks", "91%"], ["Undocumented routes", "7"]])
      : appHtml("Release notes · draft", [["Features", "4"], ["Fixes", "11"], ["Breaking changes", "0"], ["Contributors", "6"]])
  return {
    app_id: app.app_id,
    tool_name: app.tool_name,
    server_id: app.server_id,
    resource_uri: app.resource_uri ?? "",
    mime_type: "text/html;profile=mcp-app",
    html,
    size_bytes: html.length,
    content_sha256: "0".repeat(64),
    protocol: "mcp-apps/v1",
    extension: "io.modelcontextprotocol/ui",
    warnings: [],
    sandbox: {
      render_mode: "iframe-srcdoc",
      iframe_sandbox: "allow-scripts",
      iframe_allow: "",
      referrer_policy: "no-referrer",
      csp: APP_CSP,
      allowed_domains: { connect_domains: [], resource_domains: [], frame_domains: [] },
      denied_permissions: ["camera", "microphone", "geolocation"],
      prefers_border: false,
    },
  }
}

export function demoAgentCard(projectId: string, baseUrl: string): A2AAgentCard & Record<string, unknown> {
  return {
    name: "Forge AI Autonomous Engineering OS",
    description:
      "9-department multi-agent software engineering operating system with DAG wave scheduling, Shared Blackboard, critique-repair loops, governed MCP tools, and isolated verification worktrees.",
    version: "2.0.0",
    protocol: "a2a/v1",
    url: `${baseUrl}/v1/projects/${projectId}/protocols/a2a/rpc`,
    capabilities: {
      streaming: false,
      agUiStreaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
      humanInTheLoopApproval: true,
      isolatedWorktrees: true,
    },
    protocols_supported: ["a2a/v1", "ag-ui/v1", "ai-sdk-ui-stream/v1", "mcp/2025-03-26", "mcp-apps/v1", "a2ui/v1"],
    authentication: { schemes: ["Bearer"], projectScoped: true },
    departments: ["leadership", "business", "architecture", "design", "engineering", "infrastructure", "security", "quality", "delivery"],
    skills: DEMO_SKILL_CATALOG.slice(0, 24).map((s) => ({
      id: s.name,
      name: s.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      domain: s.domain,
      description: s.description,
      tags: s.keywords.slice(0, 6),
    })),
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain", "application/json"],
  }
}

export function demoRemoteCard(agentUrl: string): Record<string, unknown> {
  const host = new URL(agentUrl).hostname
  const label = (host.split(".").find((p) => !["agents", "agent", "www", "api", "a2a"].includes(p)) ?? host).replace(/[-_]/g, " ")
  return {
    name: `${label.replace(/\b\w/g, (c) => c.toUpperCase())} Agent`,
    description: "Reviews pull requests for dependency and licence risk and returns a structured report.",
    version: "1.4.0",
    protocol: "a2a/v1",
    url: `https://${host}/a2a/rpc`,
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
    skills: [
      { id: "license-scan", name: "Licence scan", description: "Flags copyleft and unknown licences.", tags: ["license", "sbom"] },
      { id: "dependency-risk", name: "Dependency risk", description: "Scores new dependencies by maintenance and CVE history.", tags: ["cve", "deps"] },
    ],
  }
}

export const DEMO_INBOUND_TASKS: A2ATask[] = [
  {
    id: "a2a_7f3c91d04b2e",
    sessionId: "sess_partner_01",
    status: { state: "working", message: { role: "agent", parts: [{ type: "text", text: "Wave 2 of 4: architecture and API contracts in progress." }] }, timestamp: minutesAgo(3) },
    artifacts: [],
    metadata: { projectId: "demo-project", kernelRunId: "krun_9a12", waveCount: 4, taskCount: 11, callerAgent: "partner-planner" },
  },
  {
    id: "a2a_15be0c7a9d33",
    sessionId: null,
    status: { state: "submitted", message: { role: "agent", parts: [{ type: "text", text: "Queued: plan accepted, awaiting execution slot." }] }, timestamp: minutesAgo(12) },
    artifacts: [],
    metadata: { projectId: "demo-project", kernelRunId: "krun_9a0f", waveCount: 3, taskCount: 7, callerAgent: "ci-orchestrator" },
  },
  {
    id: "a2a_c2d8e4417a60",
    sessionId: null,
    status: { state: "completed", message: { role: "agent", parts: [{ type: "text", text: "Delivered: 9 tasks across 3 waves, all checks passed." }] }, timestamp: minutesAgo(95) },
    artifacts: [{ name: "release_summary", index: 0, parts: [] }],
    metadata: { projectId: "demo-project", kernelRunId: "krun_98c1", waveCount: 3, taskCount: 9, callerAgent: "partner-planner" },
  },
  {
    id: "a2a_0b9e66f1c2aa",
    sessionId: null,
    status: { state: "canceled", message: { role: "agent", parts: [{ type: "text", text: "Canceled by caller." }] }, timestamp: minutesAgo(240) },
    artifacts: [],
    metadata: { projectId: "demo-project", kernelRunId: "krun_97d4", waveCount: 2, taskCount: 5, callerAgent: "ci-orchestrator" },
  },
]

export const DEMO_MCP_AUDIT: MCPAuditRecord[] = [
  { invocation_id: "inv_01", tool_name: "security.static_scan", server_id: "forge-workspace-mcp", role: "security_engineer", department: "security", project_id: "demo-project", status: "succeeded", action: "tools/call", created_at: minutesAgo(2) },
  { invocation_id: "inv_02", tool_name: "docs-mcp.release_notes", server_id: "docs-mcp", role: "workspace_operator", department: "engineering", project_id: "demo-project", status: "succeeded", action: "resources/read", resource_uri: "ui://docs-mcp/release-notes.html", created_at: minutesAgo(9) },
  { invocation_id: "inv_03", tool_name: "repo.read_file", server_id: "forge-workspace-mcp", role: "product_designer", department: "design", project_id: "demo-project", status: "succeeded", action: "tools/call", created_at: minutesAgo(17) },
  { invocation_id: "inv_04", tool_name: "skills.route", server_id: "forge-workspace-mcp", role: "qa_engineer", department: "quality", project_id: "demo-project", status: "denied", reason: "Department 'quality' is not allowed to call 'skills.route'", action: "tools/call", created_at: minutesAgo(26) },
  { invocation_id: "inv_05", tool_name: "docs-mcp.search", server_id: "docs-mcp", role: "backend_engineer", department: "engineering", project_id: "demo-project", status: "error", reason: "Upstream MCP server timed out", action: "tools/call", created_at: minutesAgo(48) },
  { invocation_id: "inv_06", tool_name: "blackboard.query", server_id: "forge-workspace-mcp", role: "release_manager", department: "delivery", project_id: "demo-project", status: "succeeded", action: "tools/call", created_at: minutesAgo(71) },
]

export const DEMO_A2A_AUDIT: A2AAuditRecord[] = [
  { audit_id: "aud_01", direction: "inbound", method: "tasks/send", project_id: "demo-project", status: "succeeded", task_id: "a2a_7f3c91d04b2e", peer: "partner-planner", created_at: minutesAgo(3) },
  { audit_id: "aud_02", direction: "outbound", method: "agent/card", project_id: "demo-project", status: "succeeded", peer: "agents.vendor-example.com", created_at: minutesAgo(6) },
  { audit_id: "aud_03", direction: "inbound", method: "tasks/send", project_id: "demo-project", status: "succeeded", task_id: "a2a_15be0c7a9d33", peer: "ci-orchestrator", created_at: minutesAgo(12) },
  { audit_id: "aud_04", direction: "outbound", method: "agent/card", project_id: "demo-project", status: "denied", peer: "10.0.4.12", reason: "Blocked by SSRF policy: private address", created_at: minutesAgo(33) },
  { audit_id: "aud_05", direction: "inbound", method: "tasks/get", project_id: "demo-project", status: "rejected", task_id: "bad id!", peer: "unknown-client", reason: "Invalid task id", created_at: minutesAgo(54) },
  { audit_id: "aud_06", direction: "inbound", method: "tasks/send", project_id: "demo-project", status: "succeeded", task_id: "a2a_c2d8e4417a60", peer: "partner-planner", created_at: minutesAgo(97) },
  { audit_id: "aud_07", direction: "inbound", method: "tasks/cancel", project_id: "demo-project", status: "succeeded", task_id: "a2a_0b9e66f1c2aa", peer: "ci-orchestrator", created_at: minutesAgo(240) },
]
