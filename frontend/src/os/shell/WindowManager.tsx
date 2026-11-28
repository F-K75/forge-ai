/**
 * macOS-like window layer for the OS shell: free-floating windows with focus
 * and z-order, drag (title bar), resize (edges and corner), minimise to the
 * shelf, maximise, tile, presentation switching and keyboard moves. On phones
 * every window becomes a full-screen sheet and only the front one shows.
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { AppWindow, Maximize, PanelRight, Pin, PinOff } from "lucide-react"
import type { WindowBounds, WindowState } from "../contracts"
import { OSWindow } from "../../components/OSWindow"
import { useIsMobile } from "./hooks"
import { WindowHistoryButtons, useWindowHistory } from "./LegacyRouteWindow"
import { WindowContent } from "./WindowContent"
import {
  MIN_WINDOW_H,
  MIN_WINDOW_W,
  focusedWindow,
  isWindowVisible,
  useWindowStore,
} from "./windowStore"

type DragMode = "move" | "e" | "s" | "se" | "w" | "sw"

const iconBtn =
  "flex h-6 w-6 items-center justify-center rounded-md text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"

export function PresentationButtons({ win }: { win: WindowState }) {
  const setPresentation = useWindowStore((s) => s.setPresentation)
  const togglePin = useWindowStore((s) => s.togglePin)
  return (
    <>
      <button
        type="button"
        className={iconBtn}
        onClick={() => togglePin(win.id)}
        aria-pressed={win.pinned === true}
        aria-label={win.pinned ? "Unpin from every session" : "Keep open in every session"}
        title={win.pinned ? "Unpin" : "Keep open in every session"}
      >
        {win.pinned ? <PinOff size={12} aria-hidden="true" /> : <Pin size={12} aria-hidden="true" />}
      </button>
      {win.presentation !== "panel" && (
        <button type="button" className={iconBtn} onClick={() => setPresentation(win.id, "panel")} aria-label="Move to side panel" title="Move to side panel">
          <PanelRight size={13} aria-hidden="true" />
        </button>
      )}
      {win.presentation !== "window" && (
        <button type="button" className={iconBtn} onClick={() => setPresentation(win.id, "window")} aria-label="Open as window" title="Open as window">
          <AppWindow size={13} aria-hidden="true" />
        </button>
      )}
      {win.presentation !== "fullscreen" && (
        <button type="button" className={iconBtn} onClick={() => setPresentation(win.id, "fullscreen")} aria-label="Full screen" title="Full screen">
          <Maximize size={12} aria-hidden="true" />
        </button>
      )}
    </>
  )
}

interface FrameProps {
  win: WindowState
  rank: number
  isTop: boolean
  mobile: boolean
}

const WindowFrame = memo(function WindowFrame({ win, rank, isTop, mobile }: FrameProps) {
  const { focus, close, minimize, toggleMaximize, setBounds, setRoute } = useWindowStore.getState()
  const area = useWindowStore((s) => s.area)
  const [live, setLive] = useState<WindowBounds | null>(null)
  const drag = useRef<{ mode: DragMode; x: number; y: number; start: WindowBounds; id: number } | null>(null)
  const ref = useRef<HTMLElement | null>(null)
  const onNavigate = useCallback((route: string) => setRoute(win.id, route), [setRoute, win.id])
  const history = useWindowHistory(win.route ?? "/", onNavigate)
  const maximized = win.state === "maximized" || mobile
  const bounds = live ?? win.bounds ?? { x: 40, y: 40, w: 720, h: 520 }

  const clampBounds = useCallback(
    (b: WindowBounds): WindowBounds => ({
      x: Math.min(Math.max(b.x, 80 - b.w), area.w - 80),
      y: Math.min(Math.max(b.y, 0), area.h - 40),
      w: Math.max(MIN_WINDOW_W, Math.min(b.w, area.w + 200)),
      h: Math.max(MIN_WINDOW_H, Math.min(b.h, area.h + 200)),
    }),
    [area.h, area.w],
  )

  const begin = (mode: DragMode) => (e: React.PointerEvent<HTMLElement>) => {
    if (maximized || e.button !== 0) return
    if (mode === "move" && (e.target as HTMLElement).closest("button, a, input, [data-window-controls]")) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    drag.current = { mode, x: e.clientX, y: e.clientY, start: bounds, id: e.pointerId }
    focus(win.id)
  }

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d || e.pointerId !== d.id) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      const s = d.start
      let next: WindowBounds = s
      if (d.mode === "move") next = { ...s, x: s.x + dx, y: s.y + dy }
      if (d.mode === "e") next = { ...s, w: s.w + dx }
      if (d.mode === "s") next = { ...s, h: s.h + dy }
      if (d.mode === "se") next = { ...s, w: s.w + dx, h: s.h + dy }
      if (d.mode === "w") next = { ...s, x: s.x + Math.min(dx, s.w - MIN_WINDOW_W), w: s.w - dx }
      if (d.mode === "sw") next = { ...s, x: s.x + Math.min(dx, s.w - MIN_WINDOW_W), w: s.w - dx, h: s.h + dy }
      setLive(clampBounds(next))
    }
    const onUp = (e: PointerEvent) => {
      const d = drag.current
      if (!d || e.pointerId !== d.id) return
      drag.current = null
      setLive((cur) => {
        if (cur) setBounds(win.id, cur)
        return null
      })
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
  }, [clampBounds, setBounds, win.id])

  // Moving focus into a window that was raised by keyboard/palette.
  useEffect(() => {
    if (!isTop || !ref.current) return
    const active = document.activeElement
    if (!active || active === document.body || active.closest("[data-os-window]")) {
      if (!ref.current.contains(active)) ref.current.focus({ preventScroll: true })
    }
  }, [isTop])

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!e.altKey || maximized) return
    const step = 24
    const k = e.key
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(k)) return
    e.preventDefault()
    const b = win.bounds ?? bounds
    const dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0
    const dy = k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0
    setBounds(win.id, clampBounds(e.shiftKey ? { ...b, w: b.w + dx, h: b.h + dy } : { ...b, x: b.x + dx, y: b.y + dy }))
  }

  const style: CSSProperties = mobile
    ? { zIndex: 10 + rank }
    : maximized
      ? { left: 8, top: 8, right: 8, bottom: 8, zIndex: 10 + rank }
      : { left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h, zIndex: 10 + rank }

  const extra = (
    <>
      {win.kind === "legacy_route" && (
        <WindowHistoryButtons canBack={history.canBack} canForward={history.canForward} onBack={() => history.go(-1)} onForward={() => history.go(1)} />
      )}
      {!mobile && <PresentationButtons win={win} />}
    </>
  )

  return (
    <div
      ref={(el) => {
        ref.current = el?.firstElementChild as HTMLElement | null
      }}
      className={
        win.state === "minimized" || (mobile && !isTop)
          ? "hidden"
          : mobile
          ? "absolute inset-x-0 bottom-1 top-0 flex flex-col animate-fade-in-up motion-reduce:animate-none"
          : `absolute flex animate-scale-in flex-col motion-reduce:animate-none ${live ? "select-none" : ""}`
      }
      style={style}
    >
      <OSWindow
        id={win.id}
        title={win.title}
        status=""
        focused={isTop}
        maximized={maximized}
        minimized={false}
        hideMinimize={mobile}
        role="dialog"
        ariaModal={false}
        className={`h-full w-full outline-none ${mobile ? "rounded-xl" : ""}`}
        onClose={() => close(win.id)}
        onMinimize={() => minimize(win.id)}
        onMaximize={() => toggleMaximize(win.id)}
        onTitlePointerDown={begin("move")}
        onTitleDoubleClick={() => !mobile && toggleMaximize(win.id)}
        onPointerDownCapture={() => !isTop && focus(win.id)}
        onFocusCapture={() => !isTop && focus(win.id)}
        onKeyDown={onKeyDown}
        extraHeader={extra}
        dataAttrs={{ "data-os-window": win.id, "data-window-kind": win.kind, tabIndex: "-1" } as Record<string, string>}
      >
        <WindowContent win={win} history={win.kind === "legacy_route" ? history : null} />
      </OSWindow>
      {!maximized && !mobile && (
        <>
          <div aria-hidden="true" className="absolute inset-y-2 -right-1 w-2 cursor-ew-resize" onPointerDown={begin("e")} />
          <div aria-hidden="true" className="absolute inset-y-2 -left-1 w-2 cursor-ew-resize" onPointerDown={begin("w")} />
          <div aria-hidden="true" className="absolute inset-x-2 -bottom-1 h-2 cursor-ns-resize" onPointerDown={begin("s")} />
          <div aria-hidden="true" className="absolute -bottom-1 -right-1 h-4 w-4 cursor-nwse-resize" onPointerDown={begin("se")} />
          <div aria-hidden="true" className="absolute -bottom-1 -left-1 h-4 w-4 cursor-nesw-resize" onPointerDown={begin("sw")} />
        </>
      )}
    </div>
  )
})

/** The window layer. Absolutely fills its (relative) parent, which defines the workspace area. */
export function WindowManager() {
  const workspace = useWindowStore((s) => s.workspace)
  const setArea = useWindowStore((s) => s.setArea)
  const mobile = useIsMobile()
  const layerRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = layerRef.current
    if (!el) return
    const update = () => setArea({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) })
    update()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [setArea])

  const windows = useMemo(
    () =>
      workspace.windows
        .filter((w) => w.presentation !== "panel" && isWindowVisible(w, workspace.active_session_id))
        .sort((a, b) => a.z - b.z),
    [workspace.windows, workspace.active_session_id],
  )
  const top = focusedWindow(workspace)

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0" data-testid="os-window-layer">
      {/* Stable DOM order (by id) so re-ordering z never remounts a page. */}
      {[...windows]
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .map((w) => (
          <div key={w.id} className="pointer-events-auto contents">
            <WindowFrame win={w} rank={windows.indexOf(w)} isTop={top?.id === w.id} mobile={mobile} />
          </div>
        ))}
    </div>
  )
}

/** Minimised windows, as quiet pills in the top bar. */
export function MinimizedShelf() {
  const workspace = useWindowStore((s) => s.workspace)
  const restore = useWindowStore((s) => s.restore)
  const minimized = workspace.windows.filter(
    (w) => w.state === "minimized" && isWindowVisible(w, workspace.active_session_id),
  )
  if (!minimized.length) return null
  return (
    <ul className="hidden min-w-0 items-center gap-1 md:flex" aria-label="Minimized windows">
      {minimized.slice(0, 5).map((w) => (
        <li key={w.id}>
          <button
            type="button"
            onClick={() => restore(w.id)}
            className="flex h-7 max-w-[160px] items-center gap-1.5 rounded-pill border border-glass-border bg-glass px-2.5 text-xs text-muted transition-colors hover:bg-ink/10 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title={`Restore ${w.title}`}
          >
            <AppWindow size={11} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{w.title}</span>
          </button>
        </li>
      ))}
      {minimized.length > 5 && <li className="px-1 font-mono text-xs text-faint">+{minimized.length - 5}</li>}
    </ul>
  )
}
