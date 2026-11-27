/**
 * Minimal, safe markdown renderer for trusted-shape but untrusted-content text
 * (e.g. SKILL.md bodies, the public legal pages and docs). Builds React
 * elements only — never HTML strings — so raw HTML in the source is shown as
 * literal text. Supports headings, ordered / unordered / task lists, fenced
 * code, tables, horizontal rules, paragraphs, `inline code`, **bold** and
 * *emphasis*.
 *
 * Links are rendered as plain text unless `links` is set. With `links`, only
 * http(s), mailto and relative targets become anchors (see `safeHref`);
 * anything else (javascript:, data:, vbscript:, …) stays inert text.
 */
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import clsx from "clsx"
import { Check } from "lucide-react"
import { parseMarkdownBlocks, safeHref, slugify, uniqueId } from "./markdown"

interface InlineOptions {
  links: boolean
  resolveLink?: (href: string) => string | null
}

const linkCls =
  "rounded-xs text-ink underline decoration-ink/30 underline-offset-[3px] transition-colors hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"

function renderLink(label: string, rawHref: string, key: string, opts: InlineOptions): ReactNode {
  const resolved = opts.resolveLink ? opts.resolveLink(rawHref) : rawHref
  const href = resolved === null ? null : safeHref(resolved)
  if (!opts.links || !href) return <span key={key}>{label}</span>
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link key={key} to={href} className={linkCls}>
        {label}
      </Link>
    )
  }
  const external = /^https?:/i.test(href)
  return (
    <a key={key} href={href} className={linkCls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {label}
    </a>
  )
}

/** Render `inline code`, **bold**, *emphasis* and links; everything else is literal text. */
function renderInline(text: string, keyPrefix: string, opts: InlineOptions): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[([^\]]+)\]\(([^)\s]+)\))/g
  let last = 0
  let m: RegExpExecArray | null
  let n = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const tok = m[0]
    const key = `${keyPrefix}-${n++}`
    if (tok.startsWith("`")) {
      out.push(
        <code key={key} className="rounded-xs bg-ink/[0.06] px-1 py-px font-mono text-[0.92em] text-ink">
          {tok.slice(1, -1)}
        </code>
      )
    } else if (tok.startsWith("**")) {
      out.push(
        <strong key={key} className="font-medium text-ink">
          {tok.slice(2, -2)}
        </strong>
      )
    } else if (tok.startsWith("[")) {
      out.push(renderLink(m[2], m[3], key, opts))
    } else {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>)
    }
    last = m.index + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

interface SafeMarkdownProps {
  source: string
  className?: string
  /**
   * `compact` (default): dense in-app panels. `prose`: a reading column with
   * real h2–h4 elements carrying ids (for a table of contents).
   */
  variant?: "compact" | "prose"
  /** Render safe links as anchors. Off by default: links show as text. */
  links?: boolean
  /** Map a source href (e.g. a relative `.md` path) to a route, or null to render it as text. */
  resolveLink?: (href: string) => string | null
}

export function SafeMarkdown({ source, className, variant = "compact", links = false, resolveLink }: SafeMarkdownProps) {
  const blocks = parseMarkdownBlocks(source)
  const opts: InlineOptions = { links, resolveLink }
  const prose = variant === "prose"
  const used = new Map<string, number>()
  return (
    <div
      className={clsx(
        prose ? "space-y-4 break-words text-[15px] leading-[1.7] text-muted" : "space-y-3 text-caption leading-relaxed text-muted",
        className
      )}
    >
      {blocks.map((b, idx) => {
        const key = `b-${idx}`
        switch (b.kind) {
          case "heading": {
            if (prose) {
              const id = uniqueId(slugify(b.text), used)
              const level = Math.min(Math.max(b.level, 2), 4)
              const cls =
                level === 2
                  ? "scroll-mt-24 pt-6 text-[22px] font-medium leading-[1.25] tracking-[-0.02em] text-ink first:pt-0"
                  : level === 3
                    ? "scroll-mt-24 pt-3 text-[17px] font-medium tracking-[-0.015em] text-ink"
                    : "scroll-mt-24 pt-2 text-[15px] font-medium text-ink"
              const Tag = (`h${level}` as "h2" | "h3" | "h4")
              return (
                <Tag key={key} id={id} className={cls}>
                  {renderInline(b.text, key, opts)}
                </Tag>
              )
            }
            const cls = b.level <= 2 ? "pt-2 text-body font-medium text-ink" : "pt-1 text-caption font-medium text-ink"
            return b.level <= 2 ? (
              <h3 key={key} className={cls}>
                {renderInline(b.text, key, opts)}
              </h3>
            ) : (
              <h4 key={key} className={cls}>
                {renderInline(b.text, key, opts)}
              </h4>
            )
          }
          case "code":
            return (
              <pre
                key={key}
                className={clsx(
                  "overflow-x-auto border border-border-soft bg-base font-mono text-xs leading-relaxed text-ink",
                  prose ? "rounded-lg p-4" : "rounded-md p-3"
                )}
              >
                <code>{b.text}</code>
              </pre>
            )
          case "rule":
            return <hr key={key} className="border-border-soft" />
          case "table":
            return (
              <div key={key} className="overflow-x-auto rounded-lg border border-border">
                <table className={clsx("w-full border-collapse text-left", prose ? "text-[14px]" : "text-xs")}>
                  <thead className="bg-ink/[0.03]">
                    <tr>
                      {b.header.map((cell, c) => (
                        <th key={c} scope="col" className="border-b border-border px-3 py-2 font-medium text-ink">
                          {renderInline(cell, `${key}-h${c}`, opts)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r} className="border-b border-border-soft last:border-0">
                        {b.header.map((_, c) => (
                          <td key={c} className="px-3 py-2 align-top">
                            {renderInline(row[c] ?? "", `${key}-${r}-${c}`, opts)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case "list": {
            const ListTag = b.ordered ? "ol" : "ul"
            return (
              <ListTag key={key} className={clsx(prose ? "space-y-2" : "space-y-1.5", b.ordered ? "list-decimal pl-5" : "pl-0")}>
                {b.items.map((item, j) => (
                  <li key={`${key}-${j}`} className={clsx(!b.ordered && "flex gap-2.5")}>
                    {!b.ordered &&
                      (item.task ? (
                        <span
                          aria-hidden="true"
                          className={clsx(
                            "mt-[3px] flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-xs border",
                            item.done ? "border-ok/40 bg-ok/15 text-ok" : "border-border"
                          )}
                        >
                          {item.done && <Check className="h-2.5 w-2.5" />}
                        </span>
                      ) : (
                        <span
                          aria-hidden="true"
                          className={clsx("h-1 w-1 shrink-0 rounded-full bg-faint", prose ? "mt-[11px]" : "mt-[9px]")}
                        />
                      ))}
                    <span>{renderInline(item.text, `${key}-${j}`, opts)}</span>
                  </li>
                ))}
              </ListTag>
            )
          }
          default:
            return (
              <p key={key} className="text-muted">
                {renderInline(b.text, key, opts)}
              </p>
            )
        }
      })}
    </div>
  )
}
