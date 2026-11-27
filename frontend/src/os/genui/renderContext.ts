/** Builds the RenderContext a registry component receives (pure; used by SurfaceView and tests). */
import type { ReactNode } from "react"
import type { JsonObject, JsonPointer, OsId } from "../contracts"
import {
  expandChildren,
  isDataBinding,
  readBinding,
  resolveDeep,
  resolveDynamic,
  resolvePointer,
  type BindingContext,
} from "./binding"
import type { DispatchHint, RenderContext } from "./registry/types"

export interface RenderContextParams {
  surfaceId: OsId
  dataModel: JsonObject
  scope: JsonPointer | null
  /** Render a child component instance; `key` is unique among siblings. */
  renderChild: (componentId: string, scope: JsonPointer | null, key: string) => ReactNode
  /** Dispatch with the binding context of the dispatching node (for action context resolution). */
  dispatch: (action: unknown, binding: BindingContext, extraContext?: JsonObject, hint?: DispatchHint) => void
  /** Write a value at a concrete (already scope-resolved) pointer. */
  write: (pointer: JsonPointer, value: unknown) => void
  pending?: boolean
  actionError?: string | null
}

export function createRenderContext(p: RenderContextParams): RenderContext {
  const binding: BindingContext = { dataModel: p.dataModel, scope: p.scope }
  return {
    surfaceId: p.surfaceId,
    scope: p.scope,
    str: (value, fallback = "") => {
      const v = resolveDynamic(value, binding)
      if (typeof v === "string") return v
      if (typeof v === "number") return Number.isFinite(v) ? String(v) : fallback
      if (typeof v === "boolean") return v ? "true" : "false"
      return fallback
    },
    num: (value) => {
      const v = resolveDynamic(value, binding)
      return typeof v === "number" && Number.isFinite(v) ? v : null
    },
    bool: (value) => resolveDynamic(value, binding) === true,
    list: (value) => {
      const v = resolveDynamic(value, binding)
      return Array.isArray(v) ? v : []
    },
    deep: (value) => resolveDeep(value, binding),
    read: (value) => (isDataBinding(value) ? readBinding(value, binding) : undefined),
    write: (value, next) => {
      if (isDataBinding(value)) p.write(resolvePointer(value["@path"], binding), next)
    },
    children: (childList) =>
      expandChildren(childList, binding).map((c) => p.renderChild(c.componentId, c.scope || null, c.key)),
    child: (componentId) => (typeof componentId === "string" ? p.renderChild(componentId, p.scope, componentId) : null),
    dispatch: (action, extra, hint) => p.dispatch(action, binding, extra, hint),
    pending: p.pending ?? false,
    actionError: p.actionError ?? null,
  }
}
