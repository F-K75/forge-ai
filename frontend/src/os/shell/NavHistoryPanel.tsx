/**
 * The collapsible nav/history panel: sessions first (pinned, then recent by
 * day), pinned capabilities second, the library and search at the bottom.
 * It replaces the old grouped sidebar inside the OS shell.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Check, Library, Pencil, Pin, PinOff, Search, SquarePen, Trash2, X } from "lucide-react"
import type { OsId, SessionSummary } from "../contracts"
import { openCommandPalette } from "../../lib/commandPalette"
import { useUiStore } from "../../store/uiStore"
import { getCapability, osBackend } from "./adapters"
import { CATEGORY_ICON } from "./capabilityIcons"
import { OS_HOME_PATH, osSessionPath } from "./osRoutes"
import { newSession, openCapability, refreshSessions } from "./sessionController"
import { useSessionStore } from "./sessionStore"
import { useWindowStore } from "./windowStore"

const row =
  "group relative flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-caption transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"

function dayBucket(iso: string, now = Date.now()): "Today" | "Previous 7 days" | "Older" {
  const t = Date.parse(iso)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  if (t >= startOfToday.getTime()) return "Today"
  if (t >= startOfToday.getTime() - 7 * 86_400_000) return "Previous 7 days"
  return "Older"
}

export function groupSessions(sessions: SessionSummary[], now = Date.now()) {
  const visible = sessions.filter((s) => !s.archived)
  const pinned = visible.filter((s) => s.pinned)
  const rest = visible.filter((s) => !s.pinned).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  const groups: { label: string; items: SessionSummary[] }[] = []
  if (pinned.length) groups.push({ label: "Pinned", items: pinned })
  for (const label of ["Today", "Previous 7 days", "Older"] as const) {
    const items = rest.filter((s) => dayBucket(s.updated_at, now) === label)
    if (items.length) groups.push({ label, items })
  }
  return groups
}

function SessionRow({ s, active, onOpen }: { s: SessionSummary; active: boolean; onOpen: (id: OsId) => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(s.title)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const upsert = useSessionStore((st) => st.upsertSession)
  const remove = useSessionStore((st) => st.removeSession)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = async () => {
    setEditing(false)
    const t = title.trim()
    if (!t || t === s.title) return setTitle(s.title)
    upsert({ ...s, title: t })
    await osBackend.updateSession(s.id, { title: t }).then(upsert, () => upsert(s))
  }

  if (editing) {
    return (
      <form
        className="flex h-8 items-center gap-1 rounded-md bg-ink/[0.06] px-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          void commit()
        }}
      >
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => e.key === "Escape" && (setTitle(s.title), setEditing(false))}
          aria-label="Session title"
          maxLength={200}
          className="min-w-0 flex-1 bg-transparent px-1 text-caption text-ink focus:outline-none"
        />
        <button type="submit" aria-label="Save title" className="flex h-6 w-6 items-center justify-center rounded text-muted hover:text-ink">
          <Check size={12} aria-hidden="true" />
        </button>
      </form>
    )
  }

  const act =
    "flex h-6 w-6 items-center justify-center rounded text-faint transition-colors hover:bg-ink/[0.08] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={() => onOpen(s.id)}
        aria-current={active ? "page" : undefined}
        className={`${row} pr-[76px] ${active ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink"}`}
      >
        {active && <span aria-hidden="true" className="absolute left-0 top-2 h-4 w-0.5 rounded-pill bg-accent" />}
        <span className="truncate">{s.title || "Untitled session"}</span>
      </button>
      <div className="absolute right-1 top-1 hidden items-center gap-0.5 group-focus-within/row:flex group-hover/row:flex">
        <button
          type="button"
          className={act}
          aria-label={s.pinned ? `Unpin ${s.title}` : `Pin ${s.title}`}
          onClick={() => {
            upsert({ ...s, pinned: !s.pinned })
            void osBackend.updateSession(s.id, { pinned: !s.pinned }).then(upsert, () => upsert(s))
          }}
        >
          {s.pinned ? <PinOff size={12} aria-hidden="true" /> : <Pin size={12} aria-hidden="true" />}
        </button>
        <button type="button" className={act} aria-label={`Rename ${s.title}`} onClick={() => setEditing(true)}>
          <Pencil size={12} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={act}
          aria-label={`Delete ${s.title}`}
          onClick={() => {
            if (!window.confirm(`Delete "${s.title}"? This can't be undone.`)) return
            remove(s.id)
            void osBackend.deleteSession(s.id).finally(() => void refreshSessions())
            if (active) {
              newSession()
              navigate(OS_HOME_PATH)
            }
          }}
        >
          <Trash2 size={12} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

/** The sessions list on its own (also the `system.sessions` capability view). */
export function SessionsList({ onNavigate }: { onNavigate?: () => void }) {
  const sessions = useSessionStore((s) => s.sessions)
  const loaded = useSessionStore((s) => s.sessionsLoaded)
  const activeId = useWindowStore((s) => s.workspace.active_session_id)
  const navigate = useNavigate()
  const groups = useMemo(() => groupSessions(sessions), [sessions])

  useEffect(() => {
    if (!loaded) void refreshSessions()
  }, [loaded])

  const open = (id: OsId) => {
    navigate(osSessionPath(id))
    onNavigate?.()
  }

  if (loaded && groups.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-faint">
        Your conversations appear here. Each one keeps its windows.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="px-2.5 pb-1 text-2xs font-medium text-faint">{g.label}</h3>
          <ul className="flex flex-col gap-px">
            {g.items.map((s) => (
              <SessionRow key={s.id} s={s} active={s.id === activeId} onOpen={open} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export interface NavHistoryPanelProps {
  /** Mobile: rendered as an overlay drawer. */
  overlay?: boolean
  onClose?: () => void
}

export function NavHistoryPanel({ overlay = false, onClose }: NavHistoryPanelProps) {
  const navigate = useNavigate()
  const pins = useUiStore((s) => s.pinnedCapabilities)
  const pinnedCaps = pins.map((id) => getCapability(id)).filter((c): c is NonNullable<typeof c> => Boolean(c))

  const body = (
    <nav
      aria-label="Sessions and navigation"
      className={`flex h-full w-[264px] shrink-0 flex-col border-r border-border-soft bg-base ${overlay ? "shadow-brutal-xl" : ""}`}
      data-testid="os-nav-panel"
    >
      <div className="flex items-center gap-1 px-2 pb-2 pt-2">
        <button
          type="button"
          onClick={() => {
            newSession()
            navigate(OS_HOME_PATH)
            onClose?.()
          }}
          className={`${row} flex-1 text-ink hover:bg-ink/[0.05]`}
        >
          <SquarePen size={14} aria-hidden="true" className="text-muted" />
          <span className="font-medium">New session</span>
        </button>
        {overlay && (
          <button type="button" onClick={onClose} aria-label="Close navigation" className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-ink/[0.06] hover:text-ink">
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => openCommandPalette()}
        className={`${row} mx-2 w-auto text-muted hover:bg-ink/[0.04] hover:text-ink`}
      >
        <Search size={14} aria-hidden="true" />
        <span className="flex-1">Search</span>
        <kbd className="font-mono text-2xs text-faint">⌘K</kbd>
      </button>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <SessionsList onNavigate={onClose} />

        {pinnedCaps.length > 0 && (
          <section aria-label="Pinned" className="mt-5">
            <h3 className="px-2.5 pb-1 text-2xs font-medium text-faint">Pinned</h3>
            <ul className="flex flex-col gap-px">
              {pinnedCaps.map((c) => {
                const Icon = CATEGORY_ICON[c.category]
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        openCapability(c.id)
                        onClose?.()
                      }}
                      className={`${row} text-muted hover:bg-ink/[0.04] hover:text-ink`}
                    >
                      <Icon size={14} aria-hidden="true" className="shrink-0 text-faint" />
                      <span className="truncate">{c.title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>

      <div className="border-t border-border-soft p-2">
        <button
          type="button"
          onClick={() => {
            openCapability("system.capability_library")
            onClose?.()
          }}
          className={`${row} text-muted hover:bg-ink/[0.04] hover:text-ink`}
        >
          <Library size={14} aria-hidden="true" />
          <span className="flex-1">Capability library</span>
        </button>
      </div>
    </nav>
  )

  if (!overlay) return body
  return (
    <div className="fixed inset-0 z-[90] flex md:hidden">
      <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-base/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative h-full animate-fade-in-up motion-reduce:animate-none">{body}</div>
    </div>
  )
}
