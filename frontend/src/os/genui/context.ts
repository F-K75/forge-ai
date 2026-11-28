/** GenUI runtime context: which store, session, dispatcher and host services a SurfaceView uses. */
import { createContext, useContext } from "react"
import type { JsonObject, MCPAppPlacement, OsId } from "../contracts"
import type { AGUIEvent, MCPAppResourcePayload } from "../../lib/kernelApi"
import { createActionDispatcher, type ActionDispatcher } from "./actions"
import { defaultSurfaceStore, type SurfaceStore } from "./surfaceStore"

/** Same shape as kernelApi.subscribeAguiStream (injectable for tests and fixture mode). */
export type SubscribeAgui = (
  projectId: string,
  runId: string,
  onEvent: (event: AGUIEvent) => void,
  options?: { afterEventId?: number; onError?: () => void }
) => () => void

export interface GenUIContextValue {
  store: SurfaceStore
  sessionId: OsId | null
  dispatcher: ActionDispatcher
  /** Opens a capability (TextFallback link, CapabilityLauncher). Supplied by the shell (WS-A). */
  onOpenCapability?: (capabilityId: string, params?: JsonObject) => void
  /** Direct AG-UI subscription for ExecutionTimeline; `null` disables it (OS-stream agent.progress only). */
  subscribeAgui?: SubscribeAgui | null
  /** Loads an MCP App resource for MCPAppSurface; defaults to protocolApi.getMcpAppResource. */
  loadMcpResource?: (placement: MCPAppPlacement) => Promise<MCPAppResourcePayload>
}

export const DEFAULT_GENUI_CONTEXT: GenUIContextValue = {
  store: defaultSurfaceStore,
  sessionId: null,
  dispatcher: createActionDispatcher({ store: defaultSurfaceStore, sessionId: null }),
}

export const GenUIContext = createContext<GenUIContextValue>(DEFAULT_GENUI_CONTEXT)

export function useGenUI(): GenUIContextValue {
  return useContext(GenUIContext)
}
