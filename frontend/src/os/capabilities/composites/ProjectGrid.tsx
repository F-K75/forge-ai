import { FolderOpen } from "lucide-react"
import type { CompositeComponentProps } from "../../contracts"
import { Card } from "../../../components/ui/Card"
import { EmptyState } from "../../../components/ui/EmptyState"

export interface ProjectGridItem {
  id: string
  name?: string
  description?: string
  status?: string
}

export interface ProjectGridProps {
  items: unknown
  open?: unknown
  [key: string]: unknown
}

export function ProjectGridView({
  items,
  onOpen,
}: {
  items: ProjectGridItem[]
  onOpen?: (item: ProjectGridItem) => void
}) {
  if (!items.length) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No projects yet"
        description="Describe what you want to build and Forge creates the first one."
      />
    )
  }
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Projects">
      {items.map((item) => (
        <li key={item.id}>
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <ProjectCard item={item} interactive />
            </button>
          ) : (
            <ProjectCard item={item} />
          )}
        </li>
      ))}
    </ul>
  )
}

function ProjectCard({ item, interactive = false }: { item: ProjectGridItem; interactive?: boolean }) {
  return (
    <Card variant={interactive ? "interactive" : "content"} className="h-full">
      <p className="truncate text-sm font-medium text-ink">{item.name || item.id}</p>
      {item.description ? <p className="mt-1 line-clamp-2 text-xs text-muted">{item.description}</p> : null}
      {item.status ? <p className="mt-2 font-mono text-[11px] uppercase text-faint">{item.status}</p> : null}
    </Card>
  )
}

function toItems(raw: unknown): ProjectGridItem[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (i): i is ProjectGridItem => Boolean(i) && typeof (i as ProjectGridItem).id === "string"
  )
}

/** Projects as cards; clicking one dispatches the surface's `open` action with `{project_id}`. */
export default function ProjectGrid({ props, dispatch }: CompositeComponentProps<ProjectGridProps>) {
  return (
    <ProjectGridView
      items={toItems(props.items)}
      onOpen={props.open ? (item) => dispatch("open", { project_id: item.id }) : undefined}
    />
  )
}
