/**
 * Forge OS generative UI engine (WS-B) public API.
 *
 * Shell (WS-A):
 *   const store = createSurfaceStore()            // or defaultSurfaceStore
 *   subscribeSession(id, { ...surfaceStreamHandlers(store), onStatus }, lastSeq)
 *   <GenUIProvider sessionId={id} store={store} confirm={…} onOpenCapability={…}>
 *     <SurfaceView surfaceId={placement.surface_id} />
 *     <MCPAppSurface placement={mcpPlacement} />
 *   </GenUIProvider>
 *
 * Capabilities (WS-D): registerComposite("LivePreview", () => import("./LivePreviewComposite"), { lazy: true })
 */
export { SurfaceView, type SurfaceViewProps } from "./SurfaceView"
export { TextFallback, FALLBACK_MESSAGE, type TextFallbackProps } from "./TextFallback"
export { GenUIProvider, type GenUIProviderProps } from "./GenUIProvider"
export { useGenUI, GenUIContext, type GenUIContextValue, type SubscribeAgui } from "./context"
export {
  createSurfaceStore,
  defaultSurfaceStore,
  surfaceStreamHandlers,
  isComponentPending,
  runKey,
  ROOT_COMPONENT_ID,
  MAX_DATA_MODEL_BYTES,
  type SurfaceStore,
  type SurfaceState,
  type GenUIState,
  type ActionEntry,
  type SurfaceFailure,
  type ProgressEntry,
} from "./surfaceStore"
export {
  createActionDispatcher,
  windowConfirm,
  DESTRUCTIVE_ACTION,
  type ActionDispatcher,
  type ConfirmHook,
  type ConfirmRequest,
  type DispatchResult,
} from "./actions"
export { postUserAction, type PostUserAction } from "./actionsApi"
export {
  registerComposite,
  resolveComponent,
  registeredComponentNames,
  CORE_COMPONENT_NAMES,
  COMPOSITE_COMPONENT_NAMES,
  type CompositeLoader,
} from "./registry"
export { surfaceToText } from "./surfaceText"
export * as binding from "./binding"
