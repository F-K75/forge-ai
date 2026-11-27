import { PUBLIC_DOCS } from "../../content"
import type { SideNavItem } from "../../components/public/ReadingLayout"

export function docsNavItems(): SideNavItem[] {
  return [
    { to: "/docs", label: "Overview" },
    ...PUBLIC_DOCS.map((d) => ({ to: `/docs/${d.slug}`, label: d.title.replace(/\.$/, "") })),
  ]
}
