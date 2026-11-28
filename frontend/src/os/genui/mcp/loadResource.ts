import { protocolApi, type MCPAppResourcePayload } from "../../../lib/kernelApi"
import type { MCPAppPlacement } from "../../contracts"

/** Role/department the OS host presents when fetching an app resource (same as the kernel inspector). */
export const MCP_APP_VIEWER = { role: "workspace_operator", department: "engineering" } as const

export function defaultLoadMcpResource(placement: MCPAppPlacement): Promise<MCPAppResourcePayload> {
  return protocolApi.getMcpAppResource(placement.project_id, placement.app_id, MCP_APP_VIEWER)
}
