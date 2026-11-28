import { useId, useState, type FormEvent } from "react"
import type { A2UIDataBinding, CompositeComponentProps, JsonObject } from "../../contracts"
import { Button } from "../../../components/ui/Button"

/** Mirrors the `agents.create` action input (shared/os-schemas/capabilities.json). */
export interface AgentConfig {
  role: string
  department?: string
  display_name?: string
  model?: string
  skills?: string[]
  budget_usd?: number
}

export interface AgentConfigFormProps {
  value?: unknown
  submit?: unknown
  [key: string]: unknown
}

const DEPARTMENTS = ["engineering", "product", "design", "qa", "operations", "security", "data"]
const INPUT =
  "h-9 w-full rounded-lg border border-border bg-panel-alt px-3 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"

function isBinding(value: unknown): value is A2UIDataBinding {
  return Boolean(value) && typeof value === "object" && typeof (value as A2UIDataBinding)["@path"] === "string"
}

function initial(value: unknown): AgentConfig {
  if (!value || typeof value !== "object" || isBinding(value)) return { role: "", department: "engineering" }
  const v = value as Partial<AgentConfig>
  return {
    role: typeof v.role === "string" ? v.role : "",
    department: typeof v.department === "string" ? v.department : "engineering",
    display_name: typeof v.display_name === "string" ? v.display_name : "",
    model: typeof v.model === "string" ? v.model : "",
    skills: Array.isArray(v.skills) ? v.skills.filter((s): s is string => typeof s === "string") : [],
    budget_usd: typeof v.budget_usd === "number" ? v.budget_usd : undefined,
  }
}

export function toAgentConfigPayload(config: AgentConfig): JsonObject {
  const out: JsonObject = { role: config.role.trim() }
  if (config.department) out.department = config.department
  if (config.display_name?.trim()) out.display_name = config.display_name.trim()
  if (config.model?.trim()) out.model = config.model.trim()
  if (config.skills?.length) out.skills = config.skills
  if (typeof config.budget_usd === "number" && Number.isFinite(config.budget_usd)) out.budget_usd = config.budget_usd
  return out
}

export function AgentConfigFormView({
  value,
  onChange,
  onSubmit,
}: {
  value?: unknown
  onChange?: (config: AgentConfig) => void
  onSubmit: (config: AgentConfig) => void
}) {
  const id = useId()
  const [config, setConfig] = useState<AgentConfig>(() => initial(value))
  const update = (patch: Partial<AgentConfig>) => {
    const next = { ...config, ...patch }
    setConfig(next)
    onChange?.(next)
  }
  const valid = config.role.trim().length >= 2
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) onSubmit(config)
  }
  return (
    <form onSubmit={submit} className="space-y-3" aria-label="Agent configuration">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-role`} className="space-y-1 text-xs text-muted">
          <span>Role</span>
          <input id={`${id}-role`} className={INPUT} required minLength={2} maxLength={64} placeholder="bug_triager"
            value={config.role} onChange={(e) => update({ role: e.target.value })} />
        </label>
        <label htmlFor={`${id}-dept`} className="space-y-1 text-xs text-muted">
          <span>Department</span>
          <select id={`${id}-dept`} className={INPUT} value={config.department}
            onChange={(e) => update({ department: e.target.value })}>
            {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label htmlFor={`${id}-name`} className="space-y-1 text-xs text-muted">
          <span>Display name</span>
          <input id={`${id}-name`} className={INPUT} maxLength={120} value={config.display_name ?? ""}
            onChange={(e) => update({ display_name: e.target.value })} />
        </label>
        <label htmlFor={`${id}-model`} className="space-y-1 text-xs text-muted">
          <span>Model (optional)</span>
          <input id={`${id}-model`} className={INPUT} maxLength={100} placeholder="auto" value={config.model ?? ""}
            onChange={(e) => update({ model: e.target.value })} />
        </label>
        <label htmlFor={`${id}-skills`} className="space-y-1 text-xs text-muted">
          <span>Skills (comma separated)</span>
          <input id={`${id}-skills`} className={INPUT} value={(config.skills ?? []).join(", ")}
            onChange={(e) => update({ skills: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20) })} />
        </label>
        <label htmlFor={`${id}-budget`} className="space-y-1 text-xs text-muted">
          <span>Budget per run (USD)</span>
          <input id={`${id}-budget`} className={`${INPUT} font-mono`} type="number" min={0} max={100} step={0.05}
            value={config.budget_usd ?? ""}
            onChange={(e) => update({ budget_usd: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </label>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!valid}>Create agent</Button>
      </div>
    </form>
  )
}

/**
 * Agent configuration form. Edits are written back to the bound data-model
 * path when the surface bound `value`; "Create agent" dispatches the
 * surface's `submit` action (`agents.create.create`) with the config.
 */
export default function AgentConfigForm({ props, dispatch, write }: CompositeComponentProps<AgentConfigFormProps>) {
  const binding = isBinding(props.value) ? props.value : null
  return (
    <AgentConfigFormView
      value={props.value}
      onChange={binding ? (config) => write(binding, toAgentConfigPayload(config)) : undefined}
      onSubmit={(config) => dispatch("submit", toAgentConfigPayload(config))}
    />
  )
}
