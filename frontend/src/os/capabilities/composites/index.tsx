import { Suspense, type ComponentType, type LazyExoticComponent } from "react"
import { lazyWithRetry } from "../../../lib/lazyRetry"
import type { CompositeComponentProps } from "../../contracts"
import { registerComposite as localRegister, type CompositeComponent, type RegisterComposite, type WsDCompositeName } from "./registry"

type Loader = () => Promise<{ default: CompositeComponent }>

// Lazily loaded so the GenUI engine chunk does not pull in reactflow, the
// preview runtime or the deploy surface until a surface actually uses them.
const LOADERS: Record<WsDCompositeName, Loader> = {
  LivePreview: () => import("./LivePreview"),
  DeployPanel: () => import("./DeployPanel"),
  WorkflowCanvas: () => import("./WorkflowCanvas"),
  AgentConfigForm: () => import("./AgentConfigForm"),
  ProjectGrid: () => import("./ProjectGrid"),
  CapabilityLauncher: () => import("./CapabilityLauncher"),
}

function CompositeFallback() {
  return <div className="h-24 animate-pulse rounded-xl border border-border bg-panel" aria-busy="true" />
}

function suspended(Lazy: LazyExoticComponent<CompositeComponent>, name: string): ComponentType<CompositeComponentProps> {
  function SuspendedComposite(props: CompositeComponentProps) {
    return (
      <Suspense fallback={<CompositeFallback />}>
        <Lazy {...props} />
      </Suspense>
    )
  }
  SuspendedComposite.displayName = `Composite(${name})`
  return SuspendedComposite
}

export const WS_D_COMPOSITE_COMPONENTS: Record<WsDCompositeName, ComponentType<CompositeComponentProps>> =
  Object.fromEntries(
    Object.entries(LOADERS).map(([name, load]) => [name, suspended(lazyWithRetry(load), name)])
  ) as Record<WsDCompositeName, ComponentType<CompositeComponentProps>>

/**
 * Register WS-D's composites with a GenUI registry.
 *
 * SWAP POINT: pass WS-B's `registerComposite` once src/os/genui/registry/
 * lands; until then the local shim in ./registry is used.
 */
export function registerWsDComposites(register: RegisterComposite = localRegister): void {
  for (const [name, component] of Object.entries(WS_D_COMPOSITE_COMPONENTS)) {
    register(name, component)
  }
}

export { WS_D_COMPOSITES, getLocalComposite, registerComposite } from "./registry"
