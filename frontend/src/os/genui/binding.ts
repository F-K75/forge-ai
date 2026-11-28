/**
 * Data binding for Forge OS generated surfaces (A2UI v1.0 profile).
 *
 * - RFC 6901 JSON Pointer get / set / remove over a surface's data model.
 *   Updates are immutable (structural sharing) so React selectors stay cheap.
 *   Only own properties are read, and `__proto__` / `constructor` /
 *   `prototype` segments are refused, so a pointer can never reach or pollute
 *   an object prototype.
 * - `{"@path": "/pointer"}` resolution for dynamic props.
 * - Template children (`{componentId, path}`): one instance of the template
 *   component per item of the list at `path`, each rendered with a *scope*
 *   (`/path/<index>`).
 *
 * Scoping rule (inside a template instance): A2UI's relative paths ("name")
 * resolve against the item. The Forge catalog only allows absolute paths
 * ("^/"), so an absolute path is looked up on the item first ("/name" →
 * "/items/3/name") and falls back to the data-model root when the item has no
 * such value. Outside templates every path is absolute from the root.
 */
import type { A2UIDataBinding, JsonObject, JsonPointer } from "../contracts"

export const MAX_POINTER_LENGTH = 512
export const MAX_TEMPLATE_ITEMS = 500
const FORBIDDEN_TOKENS = new Set(["__proto__", "prototype", "constructor"])
const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/

export class PointerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PointerError"
  }
}

/** Split a pointer into unescaped reference tokens. Throws PointerError if malformed. */
export function parsePointer(pointer: JsonPointer): string[] {
  if (typeof pointer !== "string") throw new PointerError("pointer must be a string")
  if (pointer.length > MAX_POINTER_LENGTH) throw new PointerError("pointer too long")
  if (pointer === "") return []
  if (!pointer.startsWith("/")) throw new PointerError(`pointer must start with "/": ${pointer}`)
  return pointer
    .slice(1)
    .split("/")
    .map((raw) => {
      if (/~(?![01])/.test(raw)) throw new PointerError(`invalid escape in pointer token "${raw}"`)
      return raw.replace(/~1/g, "/").replace(/~0/g, "~")
    })
}

export function formatPointer(tokens: readonly string[]): JsonPointer {
  return tokens.map((t) => "/" + t.replace(/~/g, "~0").replace(/\//g, "~1")).join("")
}

/** Append (already-escaped) pointer `path` to `scope`. */
export function joinPointer(scope: JsonPointer, path: JsonPointer): JsonPointer {
  if (path === "") return scope
  return scope + (path.startsWith("/") ? path : "/" + path)
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return typeof v === "object" && v !== null
}

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

/** Read the value at `pointer`; `undefined` when absent or the pointer is malformed. */
export function getAt(doc: unknown, pointer: JsonPointer): unknown {
  let tokens: string[]
  try {
    tokens = parsePointer(pointer)
  } catch {
    return undefined
  }
  let cur: unknown = doc
  for (const token of tokens) {
    if (FORBIDDEN_TOKENS.has(token)) return undefined
    if (Array.isArray(cur)) {
      if (!ARRAY_INDEX.test(token)) return undefined
      cur = cur[Number(token)]
    } else if (isContainer(cur)) {
      if (!hasOwn(cur, token)) return undefined
      cur = (cur as Record<string, unknown>)[token]
    } else {
      return undefined
    }
  }
  return cur
}

function setIn(cur: unknown, tokens: string[], i: number, value: unknown, remove: boolean): unknown {
  if (i === tokens.length) return value
  const token = tokens[i]
  if (FORBIDDEN_TOKENS.has(token)) throw new PointerError(`forbidden pointer token "${token}"`)
  const last = i === tokens.length - 1
  if (Array.isArray(cur)) {
    const copy = cur.slice()
    if (token === "-") {
      if (remove) return cur
      if (!last) throw new PointerError('"-" may only be the last token')
      copy.push(value)
      return copy
    }
    if (!ARRAY_INDEX.test(token)) throw new PointerError(`"${token}" is not an array index`)
    const idx = Number(token)
    if (remove && idx >= copy.length) return cur
    if (idx > copy.length) throw new PointerError(`array index ${idx} out of bounds`)
    if (remove && last) {
      if (idx < copy.length) copy.splice(idx, 1)
      return copy
    }
    copy[idx] = setIn(copy[idx], tokens, i + 1, value, remove)
    return copy
  }
  if (remove && (!isContainer(cur) || !hasOwn(cur, token))) return cur
  const base: Record<string, unknown> = isContainer(cur) ? { ...(cur as Record<string, unknown>) } : {}
  if (remove && last) {
    delete base[token]
    return base
  }
  // Own data property, never a prototype setter.
  Object.defineProperty(base, token, {
    value: setIn(hasOwn(base, token) ? base[token] : undefined, tokens, i + 1, value, remove),
    enumerable: true,
    writable: true,
    configurable: true,
  })
  return base
}

/** Immutable set. `""` replaces the whole document; missing parents are created as objects. */
export function setAt<T = unknown>(doc: T, pointer: JsonPointer, value: unknown): T {
  return setIn(doc, parsePointer(pointer), 0, value, false) as T
}

/** Immutable remove; a missing path is a no-op. */
export function removeAt<T = unknown>(doc: T, pointer: JsonPointer): T {
  const tokens = parsePointer(pointer)
  if (tokens.length === 0) return {} as T
  return setIn(doc, tokens, 0, undefined, true) as T
}

export function isDataBinding(value: unknown): value is A2UIDataBinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0] === "@path" && typeof (value as A2UIDataBinding)["@path"] === "string"
}

/** Where a binding resolves in the current render scope. */
export interface BindingContext {
  dataModel: JsonObject
  /** Pointer of the current template item, if inside a template instance. */
  scope?: JsonPointer | null
}

/** The concrete pointer a path refers to (see the scoping rule above). */
export function resolvePointer(path: JsonPointer, ctx: BindingContext): JsonPointer {
  const scope = ctx.scope ?? null
  if (!path.startsWith("/")) return scope ? joinPointer(scope, path) : "/" + path
  if (scope) {
    const scoped = joinPointer(scope, path)
    if (getAt(ctx.dataModel, scoped) !== undefined) return scoped
  }
  return path
}

export function readBinding(binding: A2UIDataBinding, ctx: BindingContext): unknown {
  return getAt(ctx.dataModel, resolvePointer(binding["@path"], ctx))
}

/** Literal values pass through; `{"@path"}` bindings are looked up. */
export function resolveDynamic(value: unknown, ctx: BindingContext): unknown {
  return isDataBinding(value) ? readBinding(value, ctx) : value
}

/** Resolve every binding inside a JSON value (composite props, action contexts). */
export function resolveDeep(value: unknown, ctx: BindingContext, depth = 0): unknown {
  if (depth > 32) return undefined
  if (isDataBinding(value)) return readBinding(value, ctx)
  if (Array.isArray(value)) return value.map((v) => resolveDeep(v, ctx, depth + 1))
  if (isContainer(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_TOKENS.has(k)) continue
      out[k] = resolveDeep(v, ctx, depth + 1)
    }
    return out
  }
  return value
}

export interface TemplateInstance {
  componentId: string
  scope: JsonPointer
  key: string
}

export type ChildListValue = string[] | { componentId: string; path: JsonPointer }

/**
 * Expand a ChildList into concrete children. Static lists keep the current
 * scope; templates produce one instance per list item (array index or object
 * key), capped at MAX_TEMPLATE_ITEMS.
 */
export function expandChildren(children: unknown, ctx: BindingContext): TemplateInstance[] {
  if (Array.isArray(children)) {
    return children
      .filter((c): c is string => typeof c === "string")
      .map((id) => ({ componentId: id, scope: ctx.scope ?? "", key: id }))
  }
  if (!isContainer(children)) return []
  const t = children as { componentId?: unknown; path?: unknown }
  if (typeof t.componentId !== "string" || typeof t.path !== "string") return []
  const listPointer = resolvePointer(t.path, ctx)
  const list = getAt(ctx.dataModel, listPointer)
  const keys = Array.isArray(list)
    ? list.map((_, i) => String(i))
    : isContainer(list)
      ? Object.keys(list).filter((k) => !FORBIDDEN_TOKENS.has(k))
      : []
  return keys.slice(0, MAX_TEMPLATE_ITEMS).map((k) => {
    const scope = joinPointer(listPointer, formatPointer([k]))
    return { componentId: t.componentId as string, scope, key: `${t.componentId}@${scope}` }
  })
}
