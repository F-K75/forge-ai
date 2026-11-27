/** Pure helpers behind SafeMarkdown: block parser, heading ids, link safety. */

export type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; lang: string; text: string }
  | { kind: "list"; ordered: boolean; items: Array<{ text: string; task?: boolean; done?: boolean }> }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "rule" }
  | { kind: "paragraph"; text: string }

const LIST_RE = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/
const RULE_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const TABLE_SEP_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/

/** Split a `| a | b |` row into cells, ignoring pipes inside `code spans`. */
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith("|")) s = s.slice(1)
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1)
  const cells: string[] = []
  let cur = ""
  let inCode = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "\\" && s[i + 1] === "|") {
      cur += "|"
      i++
    } else if (ch === "`") {
      inCode = !inCode
      cur += ch
    } else if (ch === "|" && !inCode) {
      cells.push(cur.trim())
      cur = ""
    } else cur += ch
  }
  cells.push(cur.trim())
  return cells
}

function isTableStart(lines: string[], i: number): boolean {
  return lines[i].trim().startsWith("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])
}

export function parseMarkdownBlocks(source: string): Block[] {
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
    if (RULE_RE.test(line)) {
      blocks.push({ kind: "rule" })
      i++
      continue
    }
    if (isTableStart(lines, i)) {
      const header = splitRow(lines[i])
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]))
      blocks.push({ kind: "table", header, rows })
      continue
    }
    if (LIST_RE.test(line)) {
      const ordered = Boolean(line.match(LIST_RE)?.[2])
      const items: Array<{ text: string; task?: boolean; done?: boolean }> = []
      while (i < lines.length) {
        const m = lines[i].match(LIST_RE)
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
      !LIST_RE.test(lines[i]) &&
      !RULE_RE.test(lines[i]) &&
      !isTableStart(lines, i)
    ) {
      para.push(lines[i].trim())
      i++
    }
    blocks.push({ kind: "paragraph", text: para.join(" ") })
  }
  return blocks
}

/** Plain text of an inline markdown string (for heading ids and TOC labels). */
export function inlineText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\s][^*]*)\*/g, "$1")
}

export function slugify(text: string): string {
  return (
    inlineText(text)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section"
  )
}

/**
 * Returns the href if it is safe to render as a link, otherwise null.
 * Allowed: http:, https:, mailto: and scheme-less relative targets
 * (`/x`, `#x`, `./x`, `../x`, `x.md`). Control characters and whitespace are
 * stripped before the scheme check so `java\tscript:` can't slip through.
 */
export function safeHref(raw: string): string | null {
  // eslint-disable-next-line no-control-regex
  const href = raw.trim().replace(/[\u0000-\u001F\u007F\s]+/g, "")
  if (!href) return null
  const scheme = href.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
  if (scheme) {
    const s = scheme[1].toLowerCase()
    return s === "http" || s === "https" || s === "mailto" ? href : null
  }
  // Protocol-relative URLs (//evil.example) are external hosts in disguise.
  if (href.startsWith("//") || href.startsWith("\\")) return null
  return href
}

export interface SafeMarkdownHeading {
  id: string
  level: number
  text: string
}

/** h2+ headings with the ids `SafeMarkdown variant="prose"` gives them. */
export function extractHeadings(source: string): SafeMarkdownHeading[] {
  const used = new Map<string, number>()
  return parseMarkdownBlocks(source)
    .filter((b): b is Extract<Block, { kind: "heading" }> => b.kind === "heading")
    .map((b) => ({ id: uniqueId(slugify(b.text), used), level: b.level, text: inlineText(b.text) }))
}

export function uniqueId(base: string, used: Map<string, number>): string {
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count ? `${base}-${count + 1}` : base
}

