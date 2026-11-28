/**
 * Renders one generated surface from its `root` component through the trusted
 * registry. Every component sits in its own error boundary, so one failing
 * component degrades to a small note while the rest of the surface keeps
 * working; a surface that failed validation, has no root, or crashes as a
 * whole shows the TextFallback.
 *
 * Rendering is bounded: cycles in the component graph are cut, depth is
 * capped at MAX_DEPTH and a surface renders at most MAX_NODES instances.
 */
import { Component, useEffect, useReducer, type ErrorInfo, type ReactNode } from "react"
import { useStore } from "zustand"
import clsx from "clsx"
import type { A2UIComponent, A2UIDataBinding, JsonObject, JsonPointer } from "../contracts"
import { isDataBinding, resolveDeep, resolvePointer, type BindingContext } from "./binding"
import { useGenUI } from "./context"
import { createRenderContext } from "./renderContext"
import { CATALOG_TIERS, onRegistryChange, resolveComponent, type DispatchHint } from "./registry"
import { ROOT_COMPONENT_ID, type ActionEntry, type SurfaceState } from "./surfaceStore"
import { surfaceToText } from "./surfaceText"
import { TextFallback } from "./TextFallback"

export const MAX_DEPTH = 40
export const MAX_NODES = 5000

export interface SurfaceViewProps {
  surfaceId: string
  className?: string
  /** Defaults to the surface's placement (surface.placed). */
  title?: string | null
  capabilityId?: string | null
}

interface BoundaryProps {
  children: ReactNode
  fallback: ReactNode
  resetKey: unknown
  label: string
}

class GenUIBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[genui] ${this.props.label} failed to render`, error, info.componentStack)
  }
  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function componentActionState(actions: Record<string, ActionEntry>, surfaceId: string, componentId: string) {
  let pending = false
  let last: ActionEntry | null = null
  for (const a of Object.values(actions)) {
    if (a.surfaceId !== surfaceId || a.componentId !== componentId) continue
    if (a.status === "pending" || a.status === "accepted") pending = true
    last = a
  }
  const error =
    !pending && last && (last.status === "failed" || last.status === "rejected")
      ? last.message || (last.status === "rejected" ? "The action was not allowed." : "The action failed.")
      : null
  return { pending, error }
}

function useRegistryVersion() {
  const [version, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => onRegistryChange(bump), [])
  return version
}

export function SurfaceView({ surfaceId, className, title, capabilityId }: SurfaceViewProps) {
  const genui = useGenUI()
  const { store } = genui
  const surface = useStore(store, (s) => s.surfaces[surfaceId])
  const failure = useStore(store, (s) => s.failures[surfaceId])
  const placement = useStore(store, (s) => s.placements[surfaceId])
  const actions = useStore(store, (s) => s.actions)
  const registryVersion = useRegistryVersion()

  const cap = capabilityId ?? placement?.capability_id ?? null
  const heading = title ?? placement?.title ?? null
  const open = genui.onOpenCapability ? (id: string) => genui.onOpenCapability?.(id) : undefined

  if (failure) {
    return <TextFallback title={heading} capabilityId={cap} onOpenCapability={open} />
  }
  if (!surface) {
    return (
      <div role="status" className="rounded-xl border border-border-soft px-4 py-3 text-caption text-muted">
        Preparing {heading ?? "view"}…
      </div>
    )
  }
  const fallback = (
    <TextFallback text={surfaceToText(surface.components, surface.dataModel)} title={heading} capabilityId={cap} onOpenCapability={open} />
  )
  if (!surface.components[ROOT_COMPONENT_ID]) return fallback

  return (
    <GenUIBoundary fallback={fallback} resetKey={`${surface.version}:${registryVersion}`} label={`surface ${surfaceId}`}>
      <div
        className={clsx("genui-surface flex min-w-0 flex-col gap-4", className)}
        data-surface-id={surfaceId}
        role={heading ? "region" : undefined}
        aria-label={heading ?? undefined}
      >
        <SurfaceTree surface={surface} actions={actions} resetKey={`${surface.version}:${registryVersion}`} />
      </div>
    </GenUIBoundary>
  )
}

function SurfaceTree({
  surface,
  actions,
  resetKey,
}: {
  surface: SurfaceState
  actions: Record<string, ActionEntry>
  resetKey: string
}) {
  const { store, dispatcher } = useGenUI()
  const { surfaceId, components, dataModel } = surface
  let budget = MAX_NODES

  const write = (pointer: JsonPointer, value: unknown) => {
    store.getState().writeData(surfaceId, pointer, value)
  }

  const dispatchFor =
    (node: A2UIComponent) => (action: unknown, binding: BindingContext, extraContext?: JsonObject, hint?: DispatchHint) => {
      void dispatcher.dispatch({ surfaceId, componentId: node.id, action, binding, extraContext, hint })
    }

  const renderNode = (id: string, scope: JsonPointer | null, key: string, ancestors: readonly string[]): ReactNode => {
    const node = Object.prototype.hasOwnProperty.call(components, id) ? components[id] : undefined
    if (!node) return null
    const instance = `${id}@${scope ?? ""}`
    if (ancestors.includes(instance)) {
      console.warn(`[genui] cycle at component ${id} in surface ${surfaceId}`)
      return null
    }
    if (ancestors.length >= MAX_DEPTH || budget <= 0) return null
    budget -= 1
    const entry = resolveComponent(node.component)
    if (!entry) {
      // A composite whose renderer has not been registered yet degrades to a note;
      // anything outside the catalog is never rendered (store validation drops it too).
      return CATALOG_TIERS[node.component] === "composite" ? (
        <TextFallback key={key} inline message="This view isn't available here yet." />
      ) : null
    }
    const path = [...ancestors, instance]
    const { pending, error } = componentActionState(actions, surfaceId, node.id)
    const dispatch = dispatchFor(node)
    const inlineFallback = <TextFallback inline />

    let element: ReactNode
    if (entry.kind === "core") {
      const ctx = createRenderContext({
        surfaceId,
        dataModel,
        scope,
        renderChild: (childId, childScope, childKey) => renderNode(childId, childScope, childKey, path),
        dispatch,
        write,
        pending,
        actionError: error,
      })
      element = <entry.Component node={node} ctx={ctx} />
    } else {
      const binding: BindingContext = { dataModel, scope }
      const rawProps: Record<string, unknown> = { ...node }
      delete rawProps.id
      delete rawProps.component
      const props = resolveDeep(rawProps, binding) as JsonObject
      element = (
        <entry.Component
          surfaceId={surfaceId}
          componentId={node.id}
          props={props}
          dispatch={(actionProp: string, context?: JsonObject) => dispatch(node[actionProp], binding, context)}
          write={(b: A2UIDataBinding, value: unknown) => {
            if (isDataBinding(b)) write(resolvePointer(b["@path"], binding), value)
          }}
        />
      )
    }
    return (
      <GenUIBoundary key={key} fallback={inlineFallback} resetKey={resetKey} label={`${node.component} ${node.id}`}>
        {element}
      </GenUIBoundary>
    )
  }

  return <>{renderNode(ROOT_COMPONENT_ID, null, ROOT_COMPONENT_ID, [])}</>
}
