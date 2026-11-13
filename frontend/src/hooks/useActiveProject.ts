import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { projectsApi } from "../lib/api"
import { LIVE_MODE } from "../lib/env"
import { fromApiProject, type ApiProject } from "../lib/projectAdapter"
import type { Project } from "../lib/mockData"

export const PROJECTS_QUERY_KEY = ["projects"] as const
const LAST_PROJECT_KEY = "forge_last_project"
export const DEMO_PROJECT_ID = "demo-project"

/** The current user's projects from the backend (empty in demo mode). */
export function useProjectsQuery() {
  return useQuery<Project[]>({
    queryKey: PROJECTS_QUERY_KEY,
    enabled: LIVE_MODE,
    queryFn: async () => {
      const data: ApiProject[] = await projectsApi.list()
      return Array.isArray(data) ? data.map(fromApiProject) : []
    },
  })
}

export function readLastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY)
  } catch {
    return null
  }
}

function writeLastProject(id: string) {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id)
  } catch {
    // ignore storage errors
  }
}

/** Extract the project id from /p/:id/*, /build/:id or /project/:id. */
export function projectIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/(?:p|build|project)\/([^/]+)/)
  return m && m[1] !== "new" ? m[1] : null
}

/**
 * Resolve which project the shell's project-scoped links should point at.
 *
 * Order: project in the URL → last-opened project (only if it still exists
 * for this user) → the user's most recent project → none. In live mode this
 * never falls back to the fake "demo-project", which doesn't exist on the
 * backend and made every project-scoped page 404. When it returns null,
 * callers should send the user to /projects instead.
 */
export function useActiveProject() {
  const location = useLocation()
  const { data: projects = [], isLoading } = useProjectsQuery()
  const fromUrl = projectIdFromPath(location.pathname)

  useEffect(() => {
    if (fromUrl) writeLastProject(fromUrl)
  }, [fromUrl])

  let activeProjectId: string | null
  if (!LIVE_MODE) {
    activeProjectId = fromUrl || readLastProject() || DEMO_PROJECT_ID
  } else if (fromUrl) {
    activeProjectId = fromUrl
  } else {
    const last = readLastProject()
    activeProjectId =
      (last && projects.some((p) => p.id === last) ? last : null) || projects[0]?.id || null
  }

  const activeProject = activeProjectId
    ? projects.find((p) => p.id === activeProjectId) ?? null
    : null

  /** Build a project-scoped path, or /projects if there's no project yet. */
  const projectPath = (sub: string) =>
    activeProjectId ? `/p/${activeProjectId}/${sub}` : "/projects"

  return { activeProjectId, activeProject, projects, isLoading, projectPath }
}
