import { registerComposite, type CompositeLoader } from "../../genui/registry"
import { WS_D_COMPOSITES, type WsDCompositeName } from "./registry"

/**
 * Lazy loaders, so the GenUI engine chunk does not pull in reactflow, the
 * preview runtime or the deploy surface until a surface actually uses them.
 * Composites receive resolved `CompositeComponentProps` from WS-B's renderer;
 * form-like composites put their values in the dispatched action `context`
 * (UserActionRequest carries no data model).
 */
export const WS_D_COMPOSITE_LOADERS: Record<WsDCompositeName, CompositeLoader> = {
  LivePreview: () => import("./LivePreview"),
  DeployPanel: () => import("./DeployPanel"),
  WorkflowCanvas: () => import("./WorkflowCanvas"),
  AgentConfigForm: () => import("./AgentConfigForm"),
  ProjectGrid: () => import("./ProjectGrid"),
  CapabilityLauncher: () => import("./CapabilityLauncher"),
}

export type RegisterComposite = (
  name: string,
  component: CompositeLoader,
  opts: { lazy?: boolean }
) => () => void

let unregister: (() => void)[] | null = null

/**
 * Register WS-D's six composites with the GenUI registry (src/os/genui).
 * Idempotent; returns a function that unregisters them. The shell (or the
 * GenUI bootstrap) calls this once at startup.
 */
export function registerWsDComposites(register: RegisterComposite = registerComposite): () => void {
  if (register === registerComposite && unregister) return () => undefined
  const handles = WS_D_COMPOSITES.map((name) => register(name, WS_D_COMPOSITE_LOADERS[name], { lazy: true }))
  if (register === registerComposite) unregister = handles
  return () => {
    handles.forEach((off) => off())
    if (unregister === handles) unregister = null
  }
}

export { WS_D_COMPOSITES } from "./registry"
export type { WsDCompositeName } from "./registry"
