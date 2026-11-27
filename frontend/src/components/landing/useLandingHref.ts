import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Landing sections are `#anchors` on the landing page. From any other public
 * page (legal, docs) they need the landing route in front, or they'd point at
 * nothing on the current page.
 */
export function useLandingHref() {
  const { pathname } = useLocation();
  const onLanding = pathname === "/" || pathname === "/home";
  return (href: string) => (href.startsWith("#") && !onLanding ? `/home${href}` : href);
}

/**
 * React Router doesn't scroll on client-side navigation. Scroll to
 * `location.hash` when there is one; with `resetToTop`, jump to the top on a
 * route change without one (so moving between docs doesn't keep the old
 * scroll position).
 */
export function useScrollToHash({ resetToTop = false }: { resetToTop?: boolean } = {}) {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (!hash) {
      if (resetToTop) document.documentElement.scrollTop = 0;
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    const frame = window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    return () => window.cancelAnimationFrame(frame);
  }, [hash, pathname, resetToTop]);
}
