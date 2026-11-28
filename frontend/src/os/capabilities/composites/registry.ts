import type { ComponentType } from "react"
import type { CompositeComponentProps } from "../../contracts"

/**
 * Composite catalog components owned by WS-D (ExecutionTimeline is WS-B's).
 * Names match the "composite"-tier entries of forge-ember.catalog.json.
 */
export const WS_D_COMPOSITES = [
  "LivePreview",
  "DeployPanel",
  "WorkflowCanvas",
  "AgentConfigForm",
  "ProjectGrid",
  "CapabilityLauncher",
] as const
export type WsDCompositeName = (typeof WS_D_COMPOSITES)[number]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CompositeComponent = ComponentType<CompositeComponentProps<any>>
export type RegisterComposite = (name: string, component: CompositeComponent) => void

/**
 * Local registration shim, typed from contracts.ts.
 *
 * SWAP POINT: WS-B's `registerComposite()` (src/os/genui/registry/) is being
 * built in parallel. Once it exists, replace this shim's body with
 * `export { registerComposite } from "../../genui/registry"` (or call
 * `registerWsDComposites(registerComposite)` from WS-B's registry bootstrap)
 * and drop `getLocalComposite`.
 */
const LOCAL = new Map<string, CompositeComponent>()

export const registerComposite: RegisterComposite = (name, component) => {
  LOCAL.set(name, component)
}

export function getLocalComposite(name: string): CompositeComponent | undefined {
  return LOCAL.get(name)
}
