/**
 * Provides the GenUI runtime to every SurfaceView below it. WS-A mounts one
 * per session:
 *
 *   <GenUIProvider sessionId={id} confirm={openConfirmDialog} onOpenCapability={openWindow}>
 *     <SurfaceView surfaceId={placement.surface_id} />
 *   </GenUIProvider>
 */
import { useMemo, useRef, type ReactNode } from "react"
import type { JsonObject, MCPAppPlacement, OsId } from "../contracts"
import type { MCPAppResourcePayload } from "../../lib/kernelApi"
import { createActionDispatcher, windowConfirm, type ConfirmHook } from "./actions"
import { postUserAction, type PostUserAction } from "./actionsApi"
import { GenUIContext, type GenUIContextValue, type SubscribeAgui } from "./context"
import { defaultSurfaceStore, type SurfaceStore } from "./surfaceStore"

export interface GenUIProviderProps {
  children: ReactNode
  sessionId: OsId | null
  store?: SurfaceStore
  /** Confirmation hook for destructive actions (defaults to window.confirm). */
  confirm?: ConfirmHook
  post?: PostUserAction
  isDestructive?: (actionName: string) => boolean
  onUserMessage?: (text: string) => void
  onOpenCapability?: (capabilityId: string, params?: JsonObject) => void
  subscribeAgui?: SubscribeAgui | null
  loadMcpResource?: (placement: MCPAppPlacement) => Promise<MCPAppResourcePayload>
}

export function GenUIProvider(props: GenUIProviderProps) {
  const store = props.store ?? defaultSurfaceStore
  // Callbacks are read through a ref so the dispatcher (and context) stay stable across renders.
  const latest = useRef(props)
  latest.current = props
  const sessionId = props.sessionId

  const value = useMemo<GenUIContextValue>(() => {
    const dispatcher = createActionDispatcher({
      store,
      sessionId: () => latest.current.sessionId,
      confirm: (req) => (latest.current.confirm ?? windowConfirm)(req),
      post: (sid, req) => (latest.current.post ?? postUserAction)(sid, req),
      isDestructive: (name) => latest.current.isDestructive?.(name) === true,
      onUserMessage: (text) => latest.current.onUserMessage?.(text),
    })
    return {
      store,
      sessionId,
      dispatcher,
      onOpenCapability: props.onOpenCapability,
      subscribeAgui: props.subscribeAgui,
      loadMcpResource: props.loadMcpResource,
    }
  }, [store, sessionId, props.onOpenCapability, props.subscribeAgui, props.loadMcpResource])

  return <GenUIContext.Provider value={value}>{props.children}</GenUIContext.Provider>
}
