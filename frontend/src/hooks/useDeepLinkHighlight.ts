import { useCallback, useEffect, useRef, useState } from "react"

/** How long a deep-linked row keeps its ember highlight. */
export const DEEP_LINK_HIGHLIGHT_MS = 2400

/**
 * Ember ring + faint tint for a deep-linked row. The fade-out transition is
 * dropped under prefers-reduced-motion (the global rule in index.css also
 * shortens transitions), so the highlight simply appears and disappears.
 */
export const DEEP_LINK_HIGHLIGHT_CLASS =
  "ring-2 ring-accent/35 border-accent/60 bg-accent/[0.06]"

export const DEEP_LINK_TRANSITION_CLASS =
  "transition-[box-shadow,background-color,border-color] duration-slow motion-reduce:transition-none"

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false
}

/**
 * Brief "you landed here" highlight for deep links (?gate=, ?run=).
 * `flash(key)` marks `key` as highlighted for a moment; once the highlighted
 * element is rendered (found via `findElement`), it is scrolled into view —
 * smoothly unless the user prefers reduced motion.
 */
export function useDeepLinkHighlight(
  findElement: (key: string) => Element | null | undefined,
  durationMs = DEEP_LINK_HIGHLIGHT_MS
) {
  const [highlightKey, setHighlightKey] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const find = useRef(findElement)
  find.current = findElement

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  // Runs after the commit that rendered the highlighted row, so it exists.
  useEffect(() => {
    if (!highlightKey) return
    find.current(highlightKey)?.scrollIntoView?.({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
    })
  }, [highlightKey])

  const flash = useCallback(
    (key: string) => {
      setHighlightKey(key)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setHighlightKey(null), durationMs)
    },
    [durationMs]
  )

  return { highlightKey, flash }
}
