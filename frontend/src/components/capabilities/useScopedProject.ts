import { useState } from "react"
import { useActiveProject } from "../../hooks/useActiveProject"
import { LIVE_MODE } from "../../lib/env"

/**
 * The project a capability page is scoped to: the shell's active project, or
 * one the user picked on the page (only if it still exists in live mode).
 */
export function useScopedProject() {
  const { activeProjectId, projects, isLoading } = useActiveProject()
  const [override, setOverride] = useState<string | null>(null)
  const projectId = override && (!LIVE_MODE || projects.some((p) => p.id === override)) ? override : activeProjectId
  return { projectId, setProjectId: setOverride, projects, isLoading }
}
