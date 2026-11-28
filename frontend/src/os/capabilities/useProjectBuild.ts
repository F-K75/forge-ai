import { useQuery } from "@tanstack/react-query"
import { buildsApi, projectsApi } from "../../lib/api"
import { LIVE_MODE } from "../../lib/env"

export interface BuildSummary {
  id: string
  status?: string
  validation?: unknown
  debug_iterations?: number
  debug_errors?: string[]
  [key: string]: unknown
}

export type LiveBuildStatus = "idle" | "running" | "debugging" | "complete" | "failed"

export function toLiveStatus(status: string | undefined, hasBuild: boolean): LiveBuildStatus {
  if (!hasBuild) return "idle"
  const s = (status ?? "").toLowerCase()
  if (["complete", "completed", "success", "succeeded"].includes(s)) return "complete"
  if (["failed", "error", "cancelled"].includes(s)) return "failed"
  if (s === "debugging") return "debugging"
  return "running"
}

/**
 * A project's build (the given one, else the latest) and its files, through
 * the existing builds API. Used by the LivePreview / DeployPanel composites
 * and the code / debug capability renderers. Demo mode has no backend, so it
 * reports "no build" instead of inventing one.
 */
export function useProjectBuild(projectId: string | null | undefined, buildId?: string | null) {
  const buildQuery = useQuery({
    queryKey: ["os", "capabilities", "build", projectId ?? null, buildId ?? null],
    enabled: LIVE_MODE && Boolean(projectId || buildId),
    queryFn: async (): Promise<BuildSummary | null> => {
      if (buildId) return (await buildsApi.get(buildId)) as BuildSummary
      const builds = ((await projectsApi.getBuilds(projectId as string)) ?? []) as BuildSummary[]
      return builds[0] ?? null
    },
  })
  const build = buildQuery.data ?? null
  const filesQuery = useQuery({
    queryKey: ["os", "capabilities", "build-files", build?.id ?? null],
    enabled: LIVE_MODE && Boolean(build?.id),
    queryFn: async () => ((await buildsApi.getFiles(build!.id)) ?? {}) as Record<string, string>,
  })
  const hasBuild = Boolean(build)
  const status = toLiveStatus(build?.status, hasBuild)
  return {
    build,
    files: filesQuery.data ?? {},
    hasBuild,
    status,
    inProgress: status === "running" || status === "debugging",
    isLoading: buildQuery.isLoading || filesQuery.isLoading,
    error: buildQuery.error ?? filesQuery.error,
  }
}
