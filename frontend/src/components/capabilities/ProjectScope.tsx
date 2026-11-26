/**
 * Project scoping for the capability pages: the engine endpoints are
 * project-scoped (/v1/projects/{id}/...), so these pages follow the active
 * project and offer a compact picker to switch, or a prompt when there's none.
 */
import { Link } from "react-router-dom"
import { FolderOpen } from "lucide-react"
import { LIVE_MODE } from "../../lib/env"

interface ProjectPickerProps {
  projectId: string | null
  projects: Array<{ id: string; name: string; displayName?: string }>
  onChange: (id: string) => void
  className?: string
}

/** Pill-shaped native select; hidden when there is nothing to choose between. */
export function ProjectPicker({ projectId, projects, onChange, className }: ProjectPickerProps) {
  if (!LIVE_MODE) {
    return (
      <span className={`inline-flex h-9 items-center gap-2 rounded-pill border border-glass-border bg-glass px-3.5 text-caption text-muted ${className ?? ""}`}>
        <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
        Demo workspace
      </span>
    )
  }
  if (projects.length < 2) return null
  return (
    <label className={`relative inline-flex items-center ${className ?? ""}`}>
      <span className="sr-only">Project</span>
      <FolderOpen className="pointer-events-none absolute left-3.5 h-3.5 w-3.5 text-muted" aria-hidden="true" />
      <select
        value={projectId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 appearance-none rounded-pill border border-glass-border bg-glass pl-9 pr-4 text-caption text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.displayName || p.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Shown in LIVE_MODE when the user has no project to scope the page to. */
export function NoProjectState({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border bg-panel px-6 py-14 text-center" role="status">
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-ink/[0.06] text-muted">
        <FolderOpen className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="mt-4 text-body font-medium text-ink">Pick a project first</p>
      <p className="mt-1 max-w-sm text-caption text-muted">
        {what} are scoped to a project. Create or open one and this page will follow it.
      </p>
      <Link
        to="/projects"
        className="mt-5 inline-flex h-9 items-center rounded-pill bg-ink px-4 text-caption font-medium text-[rgb(var(--bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Go to projects
      </Link>
    </div>
  )
}
