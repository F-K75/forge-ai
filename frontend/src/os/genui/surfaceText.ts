/**
 * Plain-text rendering of a surface, for the text fallback, transcripts and
 * screen-reader summaries. Walks the component tree from `root` (or every
 * component when there is no root) and extracts readable text only.
 */
import type { A2UIComponent, JsonObject } from "../contracts"
import { expandChildren, resolveDynamic, type BindingContext } from "./binding"
import { ROOT_COMPONENT_ID } from "./surfaceStore"

export const MAX_SURFACE_TEXT = 4000

function str(v: unknown, ctx: BindingContext): string {
  const r = resolveDynamic(v, ctx)
  return typeof r === "string" ? r : typeof r === "number" && Number.isFinite(r) ? String(r) : ""
}

function arr(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v.filter((x) => typeof x === "object" && x !== null) as Record<string, unknown>[]) : []
}

export function surfaceToText(components: Record<string, A2UIComponent>, dataModel: JsonObject): string {
  const lines: string[] = []
  const seen = new Set<string>()
  let size = 0
  const push = (line: string) => {
    const l = line.trim()
    if (!l || size > MAX_SURFACE_TEXT) return
    lines.push(l)
    size += l.length + 1
  }

  const visit = (id: string, scope: string | null, depth: number) => {
    const key = `${id}@${scope ?? ""}`
    const node = components[id]
    if (!node || seen.has(key) || depth > 32 || size > MAX_SURFACE_TEXT) return
    seen.add(key)
    const ctx: BindingContext = { dataModel, scope }
    switch (node.component) {
      case "Heading":
      case "Text":
      case "Badge":
        push(str(node.text, ctx))
        break
      case "Callout":
        push([str(node.title, ctx), str(node.text, ctx)].filter(Boolean).join(": "))
        break
      case "Card":
        push(str(node.title, ctx))
        break
      case "KeyValueList": {
        const items = resolveDynamic(node.items, ctx)
        for (const i of arr(items)) push(`${str(i.key, ctx)}: ${str(i.value, ctx)}`)
        break
      }
      case "MetricRow":
        for (const i of arr(node.items)) push(`${String(i.label ?? "")}: ${str(i.value, ctx)}${i.delta ? ` (${str(i.delta, ctx)})` : ""}`)
        break
      case "ProgressBar":
        push(`${str(node.label, ctx)}: ${str(node.value, ctx)} / ${str(node.max, ctx)}`)
        break
      case "LinkList":
        for (const l of arr(node.links)) push(`${String(l.label ?? "")} (${String(l.url ?? "")})`)
        break
      case "DataTable": {
        const rows = resolveDynamic(node.rows, ctx)
        const cols = arr(node.columns)
        push(`Table: ${cols.map((c) => String(c.label ?? "")).join(", ")} (${Array.isArray(rows) ? rows.length : 0} rows)`)
        break
      }
      case "Chart":
        push(`Chart: ${str(node.title, ctx) || String(node.kind ?? "")}`)
        break
      case "Checklist":
        for (const i of arr(node.items)) push(`${i.checked ? "[x]" : "[ ]"} ${String(i.label ?? "")}`)
        break
      case "StatusList":
        for (const i of arr(node.items)) push(`${String(i.title ?? "")}: ${String(i.status ?? "")}`)
        break
      case "Timeline":
        for (const e of arr(node.events)) push(String(e.label ?? ""))
        break
      case "ApprovalCard":
        push(`Approval needed: ${String(node.gateName ?? "")}`)
        break
      case "CostBreakdown":
        push(`Total cost: $${typeof node.total === "number" ? node.total.toFixed(4) : "0"}`)
        break
      case "Button":
        break
      default:
        break
    }
    for (const prop of ["children"]) {
      for (const c of expandChildren(node[prop], ctx)) visit(c.componentId, c.scope || null, depth + 1)
    }
    if (node.component === "Tabs") {
      for (const t of arr(node.tabs)) {
        push(str(t.title, ctx))
        if (typeof t.child === "string") visit(t.child, scope, depth + 1)
      }
    }
  }

  if (components[ROOT_COMPONENT_ID]) visit(ROOT_COMPONENT_ID, null, 0)
  else for (const id of Object.keys(components)) visit(id, null, 0)
  const text = lines.join("\n")
  return text.length > MAX_SURFACE_TEXT ? text.slice(0, MAX_SURFACE_TEXT - 1) + "…" : text
}
