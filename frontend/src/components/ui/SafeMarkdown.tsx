/**
 * Minimal, safe markdown renderer for trusted-shape but untrusted-content text
 * (e.g. SKILL.md bodies). Builds React elements only — never HTML strings — so
 * raw HTML in the source is shown as literal text. Supports headings, ordered /
 * unordered / task lists, fenced code, paragraphs, `inline code`, **bold** and
 * *emphasis*. Links are rendered as plain text.
 */
import type { ReactNode } from "react"
import clsx from "clsx"
import { Check } from "lucide-react"

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "list"; ordered: boolean; items: Array<{ text: string; task?: boolean; done?: boolean }> }
  | { kind: "paragraph"; text: string }

function parseMarkdownBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n")
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++])
      i++ // closing fence (or EOF)
      blocks.push({ kind: "code", lang: fence[1] || "", text: body.join("\n") })
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() })
      i++
      continue
    }
    const listRe = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/
    if (listRe.test(line)) {
      const ordered = Boolean(line.match(listRe)?.[2])
      const items: Array<{ text: string; task?: boolean; done?: boolean }> = []
      while (i < lines.length) {
        const m = lines[i].match(listRe)
        if (m && Boolean(m[2]) === ordered) {
          const task = m[3].match(/^\[([ xX])\]\s+(.*)$/)
          items.push(task ? { text: task[2], task: true, done: task[1].toLowerCase() === "x" } : { text: m[3] })
          i++
        } else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
          items[items.length - 1].text += ` ${lines[i].trim()}`
          i++
        } else break
      }
      blocks.push({ kind: "list", ordered, items })
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !listRe.test(lines[i])
    ) {
      para.push(lines[i].trim())
      i++
    }
    blocks.push({ kind: "paragraph", text: para.join(" ") })
  }
  return blocks
}

/** Render `inline code`, **bold** and *emphasis*; everything else is literal text. */
function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[([^\]]+)\]\([^)]+\))/g
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
      out.push(<span key={key}>{m[2]}</span>)
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
}

export function SafeMarkdown({ source, className }: SafeMarkdownProps) {
  const blocks = parseMarkdownBlocks(source)
  return (
    <div className={clsx("space-y-3 text-caption leading-relaxed text-muted", className)}>
      {blocks.map((b, idx) => {
        const key = `b-${idx}`
        switch (b.kind) {
          case "heading": {
            const cls = b.level <= 2 ? "pt-2 text-body font-medium text-ink" : "pt-1 text-caption font-medium text-ink"
            return b.level <= 2 ? (
              <h3 key={key} className={cls}>
                {renderInline(b.text, key)}
              </h3>
            ) : (
              <h4 key={key} className={cls}>
                {renderInline(b.text, key)}
              </h4>
            )
          }
          case "code":
            return (
              <pre
                key={key}
                className="overflow-x-auto rounded-md border border-border-soft bg-base p-3 font-mono text-xs leading-relaxed text-ink"
              >
                <code>{b.text}</code>
              </pre>
            )
          case "list": {
            const ListTag = b.ordered ? "ol" : "ul"
            return (
              <ListTag key={key} className={clsx("space-y-1.5", b.ordered ? "list-decimal pl-5" : "pl-0")}>
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
                        <span aria-hidden="true" className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-faint" />
                      ))}
                    <span>{renderInline(item.text, `${key}-${j}`)}</span>
                  </li>
                ))}
              </ListTag>
            )
          }
          default:
            return (
              <p key={key} className="text-muted">
                {renderInline(b.text, key)}
              </p>
            )
        }
      })}
    </div>
  )
}
