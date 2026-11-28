/** TEMPORARY placeholder for WS-B's MCPAppSurface (sandboxed MCP App host). */
import { AppWindow } from "lucide-react"

export function ShimMcpAppView({ appId }: { appId: string; params: Record<string, unknown> }) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 p-8 text-center" role="status">
      <AppWindow size={18} className="text-muted" aria-hidden="true" />
      <p className="text-caption text-muted">
        MCP App <span className="font-mono text-ink">{appId}</span> opens here in a sandboxed frame.
      </p>
    </div>
  )
}
