import { useEffect, useId, useState, type FormEvent } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import toast from "react-hot-toast"
import type { CapabilityRendererProps, JsonObject } from "../../contracts"
import { agentOrgApi, projectsApi } from "../../../lib/api"
import { protocolApi } from "../../../lib/kernelApi"
import { LIVE_MODE } from "../../../lib/env"
import { MCPAppFrame } from "../../../components/a2ui/MCPAppFrame"
import { MultiAgentKernelPanel } from "../../../components/MultiAgentKernelPanel"
import { AgentFleetGraph } from "../../../components/AgentFleetGraph"
import { NoProjectState } from "../../../components/capabilities/ProjectScope"
import { Button } from "../../../components/ui/Button"
import { AgentConfigFormView, toAgentConfigPayload } from "../composites/AgentConfigForm"
import { WorkflowCanvasView } from "../composites/WorkflowCanvas"
import { invokeCapability } from "../invoke"
import { paramString } from "./params"

function projectOf(props: CapabilityRendererProps): string | null {
  return props.projectId ?? paramString(props.params, "project_id")
}

function errorDetail(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === "string" ? detail : fallback
}

/** agents.kernel_run: the existing multi-agent kernel panel, focused on a run when one is given. */
export function KernelRunRenderer(props: CapabilityRendererProps) {
  const projectId = projectOf(props)
  if (LIVE_MODE && !projectId) return <NoProjectState what="Agent runs" />
  return <MultiAgentKernelPanel projectId={projectId ?? undefined} focusRunId={paramString(props.params, "run_id")} />
}

/** fleet.agent_graph: the existing fleet graph in its embedded mode. */
export function AgentGraphRenderer(props: CapabilityRendererProps) {
  return <AgentFleetGraph embedded onClose={props.close} selectedAgentId={paramString(props.params, "agent_id")} />
}

/** protocols.mcp_app: the sandboxed MCP App frame (WS-B's hardened MCPAppFrame) for one app. */
export function McpAppRenderer(props: CapabilityRendererProps) {
  const projectId = projectOf(props)
  const appId = paramString(props.params, "app_id")
  if (!projectId) return <NoProjectState what="MCP Apps" />
  if (!appId) return <p className="p-6 text-center text-sm text-muted">Choose an MCP App to open.</p>
  const role = paramString(props.params, "role") ?? "developer"
  const department = paramString(props.params, "department") ?? "engineering"
  return (
    <MCPAppFrame
      title={props.capability.title}
      loadResource={() => protocolApi.getMcpAppResource(projectId, appId, { role, department })}
    />
  )
}

interface ProjectDoc {
  id: string
  name?: string
  description?: string
  github_repo?: string | null
  deployed_url?: string | null
}

const INPUT =
  "h-9 w-full rounded-lg border border-border bg-panel-alt px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"

/** projects.settings: name, description, GitHub repo and deployed URL via PUT /v1/projects/{id}. */
export function ProjectSettingsRenderer(props: CapabilityRendererProps) {
  const projectId = projectOf(props)
  const id = useId()
  const qc = useQueryClient()
  const project = useQuery({
    queryKey: ["os", "capabilities", "project", projectId],
    enabled: LIVE_MODE && Boolean(projectId),
    queryFn: () => projectsApi.get(projectId as string) as Promise<ProjectDoc>,
  })
  const [form, setForm] = useState({ name: "", description: "", github_repo: "", deployed_url: "" })
  useEffect(() => {
    const p = project.data
    if (p) setForm({ name: p.name ?? "", description: p.description ?? "", github_repo: p.github_repo ?? "", deployed_url: p.deployed_url ?? "" })
  }, [project.data])
  const save = useMutation({
    mutationFn: () => projectsApi.update(projectId as string, form),
    onSuccess: () => {
      toast.success("Project settings saved")
      void qc.invalidateQueries({ queryKey: ["os", "capabilities", "project", projectId] })
    },
    onError: (err) => toast.error(errorDetail(err, "Could not save project settings")),
  })
  useEffect(() => {
    if (project.data?.name) props.setTitle(`${project.data.name} settings`)
  }, [project.data?.name, props])
  if (!projectId) return <NoProjectState what="Project settings" />
  if (!LIVE_MODE) return <p className="p-6 text-center text-sm text-muted">Project settings are available when connected to a Forge backend.</p>
  if (project.isError) return <p className="p-6 text-center text-sm text-muted" role="alert">Project not found.</p>
  const field = (key: keyof typeof form, label: string, placeholder = "") => (
    <label htmlFor={`${id}-${key}`} className="block space-y-1 text-xs text-muted">
      <span>{label}</span>
      <input id={`${id}-${key}`} className={INPUT} placeholder={placeholder} value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
    </label>
  )
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }
  return (
    <form className="space-y-3 p-4" onSubmit={onSubmit} aria-label="Project settings">
      {field("name", "Name")}
      {field("description", "Description")}
      {field("github_repo", "GitHub repository", "owner/repo")}
      {field("deployed_url", "Deployed URL", "https://")}
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={save.isPending} disabled={!form.name.trim()}>Save</Button>
      </div>
    </form>
  )
}

/** agents.create opened directly (palette / library): the config form, saved through the org API. */
export function AgentCreateRenderer(props: CapabilityRendererProps) {
  const projectId = projectOf(props)
  const create = useMutation({
    mutationFn: (payload: JsonObject) =>
      agentOrgApi.createAgent(projectId as string, {
        role: String(payload.role),
        department: typeof payload.department === "string" ? payload.department : undefined,
        display_name: typeof payload.display_name === "string" ? payload.display_name : undefined,
      }),
    onSuccess: (res) => toast.success(res.created ? "Agent created" : "That agent already exists"),
    onError: (err) => toast.error(errorDetail(err, "Could not create the agent")),
  })
  if (!projectId) return <NoProjectState what="Agents" />
  return (
    <div className="p-4">
      <AgentConfigFormView value={props.params.config} onSubmit={(config) => create.mutate(toAgentConfigPayload(config))} />
    </div>
  )
}

/** workflow.design opened directly: the canvas; save goes through the capability invoke API. */
export function WorkflowRenderer(props: CapabilityRendererProps) {
  const projectId = projectOf(props)
  const [objective, setObjective] = useState(paramString(props.params, "objective") ?? "")
  const id = useId()
  const save = useMutation({
    mutationFn: (graph: JsonObject) =>
      invokeCapability("workflow.design", "save", { ...graph, project_id: projectId, objective, name: objective }, {
        sessionId: props.sessionId,
        projectId,
        presentation: props.presentation,
      }),
    onSuccess: () => toast.success("Workflow saved"),
    onError: (err) => toast.error(errorDetail(err, "Could not save the workflow")),
  })
  if (!projectId) return <NoProjectState what="Workflows" />
  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <label htmlFor={`${id}-objective`} className="block space-y-1 text-xs text-muted">
        <span>Objective</span>
        <input id={`${id}-objective`} className={INPUT} value={objective} placeholder="Onboard a new customer"
          onChange={(e) => setObjective(e.target.value)} />
      </label>
      <WorkflowCanvasView
        nodes={props.params.nodes}
        edges={props.params.edges}
        onSave={objective.trim().length >= 3 ? (graph) => save.mutate(graph) : undefined}
      />
    </div>
  )
}
