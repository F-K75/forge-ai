import type { ComponentType, ReactNode } from "react"
import type { A2UIComponent, CompositeComponentProps, JsonObject, OsId } from "../../contracts"

/** Hints the confirmation hook uses to decide whether to ask the user first. */
export interface DispatchHint {
  destructive?: boolean
  label?: string
  riskLevel?: string
}

/**
 * What a core registry component receives besides its (raw, validated) node.
 * Bindings are resolved through these helpers in the node's render scope.
 */
export interface RenderContext {
  surfaceId: OsId
  scope: string | null
  /** Resolve a DynamicString (literal or binding) to display text. */
  str: (value: unknown, fallback?: string) => string
  /** Resolve a DynamicNumber; null when absent or not finite. */
  num: (value: unknown) => number | null
  bool: (value: unknown) => boolean
  /** Resolve a DynamicList; [] when not an array. */
  list: (value: unknown) => unknown[]
  /** Resolve any value (bindings anywhere inside are resolved). */
  deep: (value: unknown) => unknown
  /** Read the raw value behind a DataBinding (inputs). */
  read: (binding: unknown) => unknown
  /** Write an input value back through a DataBinding. */
  write: (binding: unknown, value: unknown) => void
  /** Render a ChildList (static ids or a template). */
  children: (childList: unknown) => ReactNode[]
  /** Render one child by component id. */
  child: (componentId: unknown) => ReactNode
  /** Dispatch an agent-side Action declared on this node. */
  dispatch: (action: unknown, extraContext?: JsonObject, hint?: DispatchHint) => void
  /** True while an action from this node awaits its result. */
  pending: boolean
  /** Last settled action error for this node, if any. */
  actionError: string | null
}

export interface CoreComponentProps {
  node: A2UIComponent
  ctx: RenderContext
}

export type CoreComponent = ComponentType<CoreComponentProps>
export type CompositeComponent = ComponentType<CompositeComponentProps<any>>

export type RegistryEntry =
  | { kind: "core"; name: string; Component: CoreComponent }
  | { kind: "composite"; name: string; Component: CompositeComponent }
