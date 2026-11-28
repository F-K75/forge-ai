/**
 * Handles `mcp_app.placed`: fetches the app's sanitised `ui://` resource and
 * mounts the hardened MCPAppFrame (sandboxed srcdoc iframe). The HTML never
 * touches the shell DOM; this component only passes a loader to the frame.
 *
 * Use with a placement object, or by app id from the surface store:
 *   <MCPAppSurface placement={event.data.placement} />
 *   <MCPAppSurface appId="app_weather" />
 */
import { useCallback } from "react"
import { useStore } from "zustand"
import { MCPAppFrame } from "../../../components/a2ui/MCPAppFrame"
import type { MCPAppResourcePayload } from "../../../lib/kernelApi"
import { defaultLoadMcpResource } from "./loadResource"
import type { MCPAppPlacement } from "../../contracts"
import { validateContract } from "../../validate"
import { useGenUI } from "../context"
import { TextFallback } from "../TextFallback"

export interface MCPAppSurfaceProps {
  placement?: MCPAppPlacement
  appId?: string
  /** Overrides the GenUIProvider loader and the protocolApi default. */
  loadResource?: (placement: MCPAppPlacement) => Promise<MCPAppResourcePayload>
}

export function MCPAppSurface({ placement: given, appId, loadResource }: MCPAppSurfaceProps) {
  const { store, loadMcpResource } = useGenUI()
  const fromStore = useStore(store, (s) => (appId ? s.mcpApps[appId] : undefined))
  const placement = given ?? fromStore
  const loader = loadResource ?? loadMcpResource ?? defaultLoadMcpResource
  const load = useCallback(() => (placement ? loader(placement) : Promise.reject(new Error("no placement"))), [loader, placement])

  if (!placement) {
    return (
      <div role="status" className="text-caption text-muted">
        Preparing app…
      </div>
    )
  }
  // Placements normally arrive validated on the stream; re-check when handed in directly.
  const shape = { ...placement }
  if (!validateContract("OsEvent", {
    v: "forge-os/1", seq: 0, session_id: "x", turn_id: null, ts: "1970-01-01T00:00:00Z", type: "mcp_app.placed", data: { placement: shape },
  }).valid) {
    return <TextFallback title={typeof placement.title === "string" ? placement.title : null} />
  }
  return (
    <MCPAppFrame
      key={`${placement.server_id}/${placement.app_id}`}
      title={`MCP App: ${placement.title}`}
      loadResource={load}
      expect={{ appId: placement.app_id, serverId: placement.server_id, toolName: placement.tool_name }}
    />
  )
}

export default MCPAppSurface
