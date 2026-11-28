import { createContext, useContext } from "react"

/**
 * True when a page renders inside an OS window, panel or inline slot instead
 * of owning the viewport. Pages use it (or their `embedded` prop) to drop
 * full-page assumptions such as `min-h-screen`; their routes are unchanged.
 * Kept in its own tiny module so pages can import it without pulling in the
 * capability catalog.
 */
export const EmbeddedContext = createContext(false)

export function useIsEmbedded(explicit?: boolean): boolean {
  const fromContext = useContext(EmbeddedContext)
  return explicit ?? fromContext
}

