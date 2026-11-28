/**
 * The capability library: every feature Forge has, searchable, grouped by
 * category, pinnable to the nav panel. It is itself a capability
 * (`system.capability_library`) and opens in a panel by default.
 */
import { useMemo, useState } from "react"
import { Pin, Search } from "lucide-react"
import { CAPABILITY_CATEGORIES, type CapabilityDescriptor } from "../contracts"
import { useUiStore } from "../../store/uiStore"
import { useCapabilities } from "./adapters"
import { CATEGORY_ICON, CATEGORY_LABEL } from "./capabilityIcons"
import { openCapability } from "./sessionController"

export function matchCapability(c: CapabilityDescriptor, q: string): boolean {
  if (!q) return true
  const hay = `${c.title} ${c.summary} ${c.id} ${c.category} ${c.keywords.join(" ")}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t))
}

export function CapabilityLibrary({ embedded = false }: { embedded?: boolean }) {
  const { capabilities } = useCapabilities()
  const pins = useUiStore((s) => s.pinnedCapabilities)
  const togglePin = useUiStore((s) => s.togglePinnedCapability)
  const [query, setQuery] = useState("")

  const groups = useMemo(() => {
    const visible = capabilities.filter((c) => c.status !== "hidden" && c.id !== "system.capability_library" && matchCapability(c, query))
    return CAPABILITY_CATEGORIES.map((cat) => ({ cat, items: visible.filter((c) => c.category === cat) })).filter(
      (g) => g.items.length > 0,
    )
  }, [capabilities, query])
  const count = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className={`flex h-full min-h-0 flex-col ${embedded ? "" : "rounded-xl border border-border bg-panel"}`}>
      <div className="sticky top-0 z-10 border-b border-border-soft bg-panel px-4 py-3">
        <label className="flex h-9 items-center gap-2 rounded-pill bg-ink/[0.05] px-3 focus-within:ring-2 focus-within:ring-accent">
          <Search size={14} className="shrink-0 text-faint" aria-hidden="true" />
          <span className="sr-only">Search capabilities</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search everything Forge can do"
            className="min-w-0 flex-1 bg-transparent text-caption text-ink placeholder:text-faint focus:outline-none"
          />
          <span className="font-mono text-2xs tabular-nums text-faint">{count}</span>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {groups.length === 0 && (
          <p className="px-3 py-10 text-center text-caption text-muted">Nothing matches &ldquo;{query}&rdquo;.</p>
        )}
        {groups.map(({ cat, items }) => {
          const Icon = CATEGORY_ICON[cat]
          return (
            <section key={cat} aria-label={CATEGORY_LABEL[cat]} className="pt-3">
              <h3 className="px-3 pb-1 text-2xs font-medium uppercase tracking-wider text-faint">{CATEGORY_LABEL[cat]}</h3>
              <ul>
                {items.map((c) => {
                  const pinned = pins.includes(c.id)
                  return (
                    <li key={c.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => openCapability(c.id)}
                        className="flex w-full items-start gap-3 rounded-md px-3 py-2 pr-10 text-left transition-colors hover:bg-ink/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink/[0.06] text-muted">
                          <Icon size={13} aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-caption font-medium text-ink">
                            {c.title}
                            {c.requires_project && <span className="ml-1.5 text-xs font-normal text-faint">project</span>}
                          </span>
                          {c.summary && <span className="block truncate text-xs font-normal text-muted">{c.summary}</span>}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => togglePin(c.id)}
                        aria-pressed={pinned}
                        aria-label={pinned ? `Unpin ${c.title}` : `Pin ${c.title} to the sidebar`}
                        className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-md transition-opacity hover:bg-ink/[0.08] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          pinned ? "text-accent opacity-100" : "text-faint opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        <Pin size={12} aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
