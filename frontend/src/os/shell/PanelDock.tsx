/**
 * The side panel: surfaces and capabilities with `presentation: "panel"`
 * (run timelines, the library, settings sections). Several panels share the
 * dock as tabs; the most recently focused one is in front. On phones the dock
 * is a full-screen sheet.
 */
import { useMemo } from "react"
import { X } from "lucide-react"
import { useIsMobile } from "./hooks"
import { useWindowHistory } from "./LegacyRouteWindow"
import { PresentationButtons } from "./WindowManager"
import { WindowContent } from "./WindowContent"
import { isWindowVisible, useWindowStore } from "./windowStore"
import type { WindowState } from "../contracts"

function PanelBody({ win }: { win: WindowState }) {
  const setRoute = useWindowStore((s) => s.setRoute)
  const history = useWindowHistory(win.route ?? "/", (r) => setRoute(win.id, r))
  return <WindowContent win={win} history={win.kind === "legacy_route" ? history : null} />
}

export function PanelDock() {
  const workspace = useWindowStore((s) => s.workspace)
  const focus = useWindowStore((s) => s.focus)
  const close = useWindowStore((s) => s.close)
  const mobile = useIsMobile()
  const panels = useMemo(
    () =>
      workspace.windows
        .filter((w) => w.presentation === "panel" && w.state !== "minimized" && isWindowVisible(w, workspace.active_session_id))
        .sort((a, b) => a.z - b.z),
    [workspace.windows, workspace.active_session_id],
  )
  if (!panels.length) return null
  const front = panels[panels.length - 1]!

  return (
    <aside
      aria-label="Side panel"
      data-testid="os-panel-dock"
      className={
        mobile
          ? "fixed inset-x-0 bottom-0 top-12 z-[70] flex flex-col rounded-t-xl border border-border bg-panel shadow-brutal-xl animate-fade-in-up motion-reduce:animate-none"
          : "relative z-20 m-2 ml-0 flex w-[400px] shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-panel shadow-brutal-md animate-fade-in-up motion-reduce:animate-none"
      }
    >
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border-soft bg-panel-alt/70 px-2">
        <div role="tablist" aria-label="Open panels" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {panels.map((p) => {
            const selected = p.id === front.id
            return (
              <button
                key={p.id}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`panel-${p.id}`}
                onClick={() => focus(p.id)}
                className={`h-7 max-w-[180px] shrink-0 truncate rounded-md px-2.5 text-caption transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  selected ? "bg-ink/[0.07] font-medium text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {p.title}
              </button>
            )
          })}
        </div>
        {!mobile && <PresentationButtons win={front} />}
        <button
          type="button"
          onClick={() => close(front.id)}
          aria-label={`Close ${front.title}`}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
      {panels.map((p) => (
        <div
          key={p.id}
          id={`panel-${p.id}`}
          role="tabpanel"
          aria-label={p.title}
          className={p.id === front.id ? "min-h-0 flex-1 overflow-auto" : "hidden"}
        >
          <PanelBody win={p} />
        </div>
      ))}
    </aside>
  )
}
