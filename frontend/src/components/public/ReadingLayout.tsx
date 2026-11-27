/**
 * Chrome for the public reading pages (/privacy, /terms, /docs, /docs/:slug):
 * the landing nav and footer around a ~720px reading column. Ember Night:
 * near-black canvas, two-tone titles, hairlines, the accent only for the
 * active table-of-contents marker and the eyebrow label.
 */
import { useEffect, useState, type ReactNode } from "react"
import { Link } from "react-router-dom"
import clsx from "clsx"
import { LandingNav } from "../landing/LandingNav"
import { LandingFooter } from "../landing/LandingFooter"
import { rgba } from "../landing/atmosphere"
import { useScrollToHash } from "../landing/useLandingHref"
import type { SafeMarkdownHeading } from "../ui/markdown"

export function PublicPage({ children }: { children: ReactNode }) {
  useScrollToHash({ resetToTop: true })
  return (
    <div className="relative min-h-screen overflow-x-clip bg-base text-ink antialiased">
      <a
        href="#main"
        className="sr-only z-[60] rounded-pill bg-ink px-4 py-2 text-[rgb(var(--bg))] focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        aria-hidden="true"
        style={{
          background: `radial-gradient(60% 70% at 50% 0%, ${rgba("teal", 0.28)} 0%, ${rgba("olive", 0.12)} 45%, ${rgba("base", 0)} 80%)`,
        }}
      />
      <LandingNav />
      <main id="main" className="relative px-5 pb-28 pt-28 sm:px-8 sm:pt-36">
        {children}
      </main>
      <LandingFooter />
    </div>
  )
}

interface ReadingHeaderProps {
  eyebrow: string
  title: string
  tagline: string
  meta?: ReactNode
  children?: ReactNode
}

export function ReadingHeader({ eyebrow, title, tagline, meta, children }: ReadingHeaderProps) {
  return (
    <header className="mb-10 border-b border-border-soft pb-8 sm:mb-12">
      <span className="inline-flex items-center rounded-pill bg-accent/[0.12] px-2.5 py-1 text-xs font-medium text-accent">
        {eyebrow}
      </span>
      <h1 className="mt-5 text-balance text-[36px] font-medium leading-[1.06] tracking-[-0.03em] text-ink sm:text-[48px]">
        {title} <span className="text-muted">{tagline}</span>
      </h1>
      {meta && <div className="mt-5 text-caption text-muted">{meta}</div>}
      {children}
    </header>
  )
}

/** "Last updated" line; the date itself is a timestamp, so it's mono. */
export function LastUpdated({ date }: { date: string }) {
  return (
    <p>
      Last updated <time className="font-mono tabular-nums text-ink">{date}</time>
    </p>
  )
}

function useActiveHeading(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)
  const key = ids.join("|")
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || !ids.length) return
    const seen = new Map<string, boolean>()
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting))
        const first = ids.find((id) => seen.get(id))
        if (first) setActive(first)
      },
      { rootMargin: "-80px 0px -65% 0px" }
    )
    ids.forEach((id) => {
      const el = document.getElementById(id)
      if (el) obs.observe(el)
    })
    return () => obs.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return active
}

/** Table of contents for the h2s: a sticky rail on wide screens, a disclosure on narrow ones. */
export function TableOfContents({ headings, variant }: { headings: SafeMarkdownHeading[]; variant: "rail" | "inline" }) {
  const h2s = headings.filter((h) => h.level === 2)
  const active = useActiveHeading(variant === "rail" ? h2s.map((h) => h.id) : [])
  if (h2s.length < 2) return null
  const list = (
    <ol className="space-y-1">
      {h2s.map((h) => {
        const on = variant === "rail" && active === h.id
        return (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={on ? "location" : undefined}
              className={clsx(
                "relative block rounded-sm py-1 pl-3 text-[13px] leading-snug [overflow-wrap:anywhere] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                on ? "text-ink" : "text-muted hover:text-ink"
              )}
            >
              <span
                aria-hidden="true"
                className={clsx("absolute left-0 top-1.5 bottom-1.5 w-px", on ? "bg-accent" : "bg-border")}
              />
              {h.text}
            </a>
          </li>
        )
      })}
    </ol>
  )
  if (variant === "inline") {
    return (
      <details className="group mb-10 rounded-xl border border-border bg-panel/60 px-4 py-3">
        <summary className="cursor-pointer list-none text-caption font-medium text-ink marker:hidden">
          On this page <span className="font-mono text-faint tabular-nums">{h2s.length}</span>
        </summary>
        <nav aria-label="On this page" className="mt-3">
          {list}
        </nav>
      </details>
    )
  }
  return (
    <nav aria-label="On this page" className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pb-4">
      <p className="mb-3 text-xs font-medium text-faint">On this page</p>
      {list}
    </nav>
  )
}

export interface SideNavItem {
  to: string
  label: string
}

/** Left nav for the docs: a vertical list on wide screens, a pill scroller on narrow ones. */
export function DocsSideNav({ items, current }: { items: SideNavItem[]; current: string }) {
  return (
    <>
      <nav aria-label="Documentation" className="sticky top-24 hidden lg:block">
        <p className="mb-3 text-xs font-medium text-faint">Documentation</p>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const on = item.to === current
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={on ? "page" : undefined}
                  className={clsx(
                    "block rounded-md px-3 py-1.5 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    on ? "bg-ink/[0.06] text-ink" : "text-muted hover:bg-ink/[0.03] hover:text-ink"
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      <nav aria-label="Documentation sections" className="-mx-5 mb-8 overflow-x-auto px-5 lg:hidden">
        <ul className="flex w-max gap-1.5">
          {items.map((item) => {
            const on = item.to === current
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={on ? "page" : undefined}
                  className={clsx(
                    "block whitespace-nowrap rounded-pill border px-3.5 py-1.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    on ? "border-transparent bg-ink text-[rgb(var(--bg))]" : "border-glass-border bg-glass text-muted hover:text-ink"
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
