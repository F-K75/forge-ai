/** Layout components: Column, Row, Card, Tabs, Divider. */
import { useId, useRef, useState, type KeyboardEvent } from "react"
import clsx from "clsx"
import type { CoreComponentProps } from "./types"
import { CARD, FOCUS, GAP } from "./styles"

export function Column({ node, ctx }: CoreComponentProps) {
  return (
    <div className={clsx("flex min-w-0 flex-col", GAP[String(node.gap)] ?? GAP.md)} data-a2ui="Column">
      {ctx.children(node.children)}
    </div>
  )
}

const ALIGN: Record<string, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
}

export function Row({ node, ctx }: CoreComponentProps) {
  return (
    <div
      className={clsx(
        "flex min-w-0 flex-row",
        GAP[String(node.gap)] ?? GAP.md,
        ALIGN[String(node.align)] ?? ALIGN.start,
        node.wrap === true && "flex-wrap"
      )}
      data-a2ui="Row"
    >
      {ctx.children(node.children)}
    </div>
  )
}

export function Card({ node, ctx }: CoreComponentProps) {
  const titleId = useId()
  const title = node.title === undefined ? "" : ctx.str(node.title)
  return (
    <section
      className={clsx(CARD, "min-w-0 p-4")}
      aria-labelledby={title ? titleId : undefined}
      data-a2ui="Card"
    >
      {title && (
        <p id={titleId} className="mb-3 text-body font-medium tracking-[-0.011em] text-ink">
          {title}
        </p>
      )}
      <div className="flex min-w-0 flex-col gap-3">{ctx.children(node.children)}</div>
    </section>
  )
}

interface TabSpec {
  title: unknown
  child: string
}

export function Tabs({ node, ctx }: CoreComponentProps) {
  const tabs = (Array.isArray(node.tabs) ? node.tabs : []) as TabSpec[]
  const [active, setActive] = useState(0)
  const baseId = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const current = Math.min(active, Math.max(0, tabs.length - 1))
  if (tabs.length === 0) return null

  const focusTab = (i: number) => {
    const next = (i + tabs.length) % tabs.length
    setActive(next)
    refs.current[next]?.focus()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight") focusTab(current + 1)
    else if (e.key === "ArrowLeft") focusTab(current - 1)
    else if (e.key === "Home") focusTab(0)
    else if (e.key === "End") focusTab(tabs.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div className="flex min-w-0 flex-col gap-3" data-a2ui="Tabs">
      <div role="tablist" className="inline-flex w-fit gap-1 rounded-pill bg-ink/[0.06] p-1">
        {tabs.map((t, i) => (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${i}`}
            aria-selected={i === current}
            aria-controls={`${baseId}-panel-${i}`}
            tabIndex={i === current ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
            className={clsx(
              "rounded-pill px-3 py-1 text-xs font-medium transition-colors",
              FOCUS,
              i === current ? "bg-ink text-on-ink" : "text-muted hover:text-ink"
            )}
          >
            {ctx.str(t.title, `Tab ${i + 1}`)}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div
          key={i}
          role="tabpanel"
          id={`${baseId}-panel-${i}`}
          aria-labelledby={`${baseId}-tab-${i}`}
          hidden={i !== current}
          tabIndex={0}
          className={clsx("min-w-0 rounded-lg", FOCUS)}
        >
          {i === current ? ctx.child(t.child) : null}
        </div>
      ))}
    </div>
  )
}

export function Divider() {
  return <hr className="border-0 border-t border-border" data-a2ui="Divider" />
}
