/**
 * The trusted component registry: Forge Ember catalog name → hand-written
 * React component. The catalog is a closed allowlist; names outside it are
 * never rendered, and composites can only be registered under catalog names
 * whose `x-forge-tier` is "composite".
 *
 * Core components (31) are built in. Composites are registered at startup:
 * ExecutionTimeline by WS-B (./composites), LivePreview, DeployPanel,
 * WorkflowCanvas, AgentConfigForm, ProjectGrid and CapabilityLauncher by WS-D
 * (src/os/capabilities/composites) via `registerComposite()`.
 */
import { createElement, Suspense, type ComponentType } from "react"
import catalogDoc from "../../schemas/forge-ember.catalog.json"
import type { CompositeComponentProps } from "../../contracts"
import { lazyWithRetry } from "../../../lib/lazyRetry"
import * as content from "./content"
import * as data from "./data"
import * as input from "./input"
import * as layout from "./layout"
import * as status from "./status"
import type { CompositeComponent, CoreComponent, RegistryEntry } from "./types"

export type { CoreComponent, CompositeComponent, RegistryEntry, RenderContext, CoreComponentProps, DispatchHint } from "./types"

type Tier = "core" | "composite"
const CATALOG = catalogDoc as unknown as { components: Record<string, { "x-forge-tier"?: Tier }> }

/** Catalog component names by tier. */
export const CATALOG_TIERS: Readonly<Record<string, Tier>> = Object.freeze(
  Object.fromEntries(Object.entries(CATALOG.components).map(([name, s]) => [name, s["x-forge-tier"] ?? "core"]))
)
export const CORE_COMPONENT_NAMES = Object.freeze(Object.keys(CATALOG_TIERS).filter((n) => CATALOG_TIERS[n] === "core"))
export const COMPOSITE_COMPONENT_NAMES = Object.freeze(
  Object.keys(CATALOG_TIERS).filter((n) => CATALOG_TIERS[n] === "composite")
)

const CORE: Record<string, CoreComponent> = {
  Column: layout.Column,
  Row: layout.Row,
  Card: layout.Card,
  Tabs: layout.Tabs,
  Divider: layout.Divider,
  Text: content.Text,
  Heading: content.Heading,
  Callout: content.Callout,
  Badge: content.Badge,
  KeyValueList: content.KeyValueList,
  MetricRow: content.MetricRow,
  ProgressBar: content.ProgressBar,
  LinkList: content.LinkList,
  CodeView: content.CodeView,
  DataTable: data.DataTable,
  Chart: data.Chart,
  FilterBar: data.FilterBar,
  ComparisonTable: data.ComparisonTable,
  Checklist: status.Checklist,
  StatusList: status.StatusList,
  Timeline: status.Timeline,
  AgentRoster: status.AgentRoster,
  ApprovalCard: status.ApprovalCard,
  ConflictList: status.ConflictList,
  EvalTable: status.EvalTable,
  CostBreakdown: status.CostBreakdown,
  Button: input.Button,
  TextField: input.TextField,
  Select: input.Select,
  Toggle: input.Toggle,
  Form: input.Form,
}

for (const name of Object.keys(CORE)) {
  if (CATALOG_TIERS[name] !== "core") throw new Error(`Registry component ${name} is not a core catalog component`)
}

const composites = new Map<string, CompositeComponent>()
const listeners = new Set<() => void>()

export type CompositeLoader = () => Promise<{ default: ComponentType<CompositeComponentProps<any>> }>

/**
 * Register the React component for a composite catalog entry. Accepts a
 * component or a lazy loader (`() => import("./LivePreviewComposite")`); lazy
 * ones are wrapped in lazyWithRetry + Suspense. Throws for names that are not
 * composite catalog components, so the allowlist can never be widened here.
 * Returns an unregister function.
 */
export function registerComposite(
  name: string,
  component: ComponentType<CompositeComponentProps<any>> | CompositeLoader,
  opts: { lazy?: boolean } = {}
): () => void {
  if (CATALOG_TIERS[name] !== "composite") {
    throw new Error(`registerComposite: "${name}" is not a composite component in the Forge catalog`)
  }
  let resolved: CompositeComponent
  if (opts.lazy) {
    const Lazy = lazyWithRetry(component as CompositeLoader)
    const LazyComposite = (props: CompositeComponentProps<any>) =>
      createElement(
        Suspense,
        { fallback: createElement("div", { role: "status", className: "text-caption text-muted" }, "Loading…") },
        createElement(Lazy, props)
      )
    LazyComposite.displayName = `Lazy(${name})`
    resolved = LazyComposite
  } else {
    resolved = component as CompositeComponent
  }
  composites.set(name, resolved)
  listeners.forEach((l) => l())
  return () => {
    if (composites.get(name) === resolved) {
      composites.delete(name)
      listeners.forEach((l) => l())
    }
  }
}

/** Resolve a catalog name. `null` for unknown names and unregistered composites. */
export function resolveComponent(name: string): RegistryEntry | null {
  if (!Object.prototype.hasOwnProperty.call(CATALOG_TIERS, name)) return null
  const core = CORE[name]
  if (core) return { kind: "core", name, Component: core }
  const composite = composites.get(name)
  return composite ? { kind: "composite", name, Component: composite } : null
}

export function isCatalogComponent(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(CATALOG_TIERS, name)
}

export function registeredComponentNames(): string[] {
  return [...Object.keys(CORE), ...composites.keys()]
}

/** Subscribe to composite registration changes (SurfaceView re-renders when WS-D registers late). */
export function onRegistryChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
