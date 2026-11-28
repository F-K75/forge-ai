/**
 * WS-D capability layer (frontend): the registry hook, renderers for existing
 * pages/panels, and the composite catalog components. See
 * docs/os/IMPLEMENTATION_PLAN.md ("WS-D") and shared/os-schemas/capabilities.json.
 */
export { useCapabilities, fetchCapabilityCatalog, CAPABILITIES_QUERY_KEY } from "./useCapabilities"
export type { UseCapabilitiesResult } from "./useCapabilities"
export {
  STATIC_CAPABILITY_CATALOG,
  actionEventName,
  fillRoute,
  filterCatalogForUser,
  getCapabilityAction,
  getStaticCapability,
} from "./catalog"
export { resolveCapabilityRenderer, CAPABILITY_RENDERERS, SHELL_COMPONENT_KEYS, EmbeddedFrame, RouteScoped } from "./renderers"
export type { CapabilityRendererComponent } from "./renderers"
export { EmbeddedContext, useIsEmbedded } from "./embedding"
export { CapabilityLaunchContext, useCapabilityLaunch } from "./composites/launch"
export type { LaunchCapability } from "./composites/launch"
export { registerWsDComposites, WS_D_COMPOSITE_LOADERS, WS_D_COMPOSITES } from "./composites"
export { invokeCapability } from "./invoke"
