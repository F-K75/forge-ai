import { describe, expect, it } from "vitest"
import {
  expandChildren,
  formatPointer,
  getAt,
  isDataBinding,
  parsePointer,
  PointerError,
  readBinding,
  removeAt,
  resolveDeep,
  resolveDynamic,
  resolvePointer,
  setAt,
  MAX_TEMPLATE_ITEMS,
} from "./binding"

const DOC = {
  foo: ["bar", "baz"],
  "": 0,
  "a/b": 1,
  "c%d": 2,
  "e^f": 3,
  "g|h": 4,
  "i\\j": 5,
  'k"l': 6,
  " ": 7,
  "m~n": 8,
}

describe("RFC 6901 pointers", () => {
  it("passes the RFC 6901 section 5 examples", () => {
    expect(getAt(DOC, "")).toBe(DOC)
    expect(getAt(DOC, "/foo")).toEqual(["bar", "baz"])
    expect(getAt(DOC, "/foo/0")).toBe("bar")
    expect(getAt(DOC, "/")).toBe(0)
    expect(getAt(DOC, "/a~1b")).toBe(1)
    expect(getAt(DOC, "/c%d")).toBe(2)
    expect(getAt(DOC, "/e^f")).toBe(3)
    expect(getAt(DOC, "/g|h")).toBe(4)
    expect(getAt(DOC, "/i\\j")).toBe(5)
    expect(getAt(DOC, '/k"l')).toBe(6)
    expect(getAt(DOC, "/ ")).toBe(7)
    expect(getAt(DOC, "/m~0n")).toBe(8)
  })

  it("decodes ~1 before ~0 and round-trips through formatPointer", () => {
    expect(parsePointer("/~01")).toEqual(["~1"])
    expect(formatPointer(["~1", "a/b"])).toBe("/~01/a~1b")
    expect(parsePointer(formatPointer(["x", "~/", ""]))).toEqual(["x", "~/", ""])
  })

  it("rejects malformed pointers", () => {
    expect(() => parsePointer("foo")).toThrow(PointerError)
    expect(() => parsePointer("/a~2")).toThrow(PointerError)
    expect(() => parsePointer("/a~")).toThrow(PointerError)
    expect(() => parsePointer("/" + "x".repeat(600))).toThrow(PointerError)
    expect(getAt(DOC, "foo")).toBeUndefined()
  })

  it("returns undefined for missing paths, bad array indices and non-containers", () => {
    expect(getAt(DOC, "/missing/deep")).toBeUndefined()
    expect(getAt(DOC, "/foo/2")).toBeUndefined()
    expect(getAt(DOC, "/foo/01")).toBeUndefined()
    expect(getAt(DOC, "/foo/-")).toBeUndefined()
    expect(getAt(DOC, "/foo/0/x")).toBeUndefined()
  })

  it("never reads inherited or prototype properties", () => {
    expect(getAt({}, "/constructor")).toBeUndefined()
    expect(getAt({}, "/__proto__")).toBeUndefined()
    expect(getAt({ a: {} }, "/a/toString")).toBeUndefined()
    expect(getAt([], "/length")).toBeUndefined()
  })

  it("sets immutably with structural sharing, creating parents and appending with -", () => {
    const doc = { a: { b: 1 }, keep: { x: 1 }, list: [1, 2] }
    const next = setAt(doc, "/a/b", 2)
    expect(next).toEqual({ a: { b: 2 }, keep: { x: 1 }, list: [1, 2] })
    expect(doc.a.b).toBe(1)
    expect(next.keep).toBe(doc.keep)
    expect(setAt(doc, "/new/deep/key", true)).toMatchObject({ new: { deep: { key: true } } })
    expect(setAt(doc, "/list/-", 3).list).toEqual([1, 2, 3])
    expect(setAt(doc, "/list/2", 3).list).toEqual([1, 2, 3])
    expect(() => setAt(doc, "/list/5", 3)).toThrow(PointerError)
    expect(() => setAt(doc, "/list/x", 3)).toThrow(PointerError)
    expect(setAt(doc, "", { replaced: true })).toEqual({ replaced: true })
  })

  it("refuses prototype pollution through set", () => {
    expect(() => setAt({}, "/__proto__/polluted", true)).toThrow(PointerError)
    expect(() => setAt({}, "/constructor/prototype/polluted", true)).toThrow(PointerError)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    // A JSON-parsed own "__proto__" key is data, and spreading it never touches the prototype.
    const parsed = JSON.parse('{"__proto__": {"polluted": true}, "a": 1}')
    const next = setAt(parsed, "/a", 2) as Record<string, unknown>
    expect(next.a).toBe(2)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it("removes values; missing paths are no-ops", () => {
    const doc = { a: { b: 1, c: 2 }, list: [1, 2, 3] }
    expect(removeAt(doc, "/a/b")).toEqual({ a: { c: 2 }, list: [1, 2, 3] })
    expect(removeAt(doc, "/list/1").list).toEqual([1, 3])
    expect(removeAt(doc, "/nope/deeper")).toBe(doc)
    expect(removeAt(doc, "/list/9")).toEqual(doc)
    expect(removeAt(doc, "")).toEqual({})
  })
})

describe("bindings", () => {
  const model = { title: "Root", user: { name: "Ada" }, items: [{ name: "one" }, { name: "two", title: "T2" }] }

  it("recognises only exact {@path} objects", () => {
    expect(isDataBinding({ "@path": "/a" })).toBe(true)
    expect(isDataBinding({ "@path": "/a", extra: 1 })).toBe(false)
    expect(isDataBinding({ "@path": 1 })).toBe(false)
    expect(isDataBinding(["@path"])).toBe(false)
    expect(isDataBinding(null)).toBe(false)
  })

  it("resolves literals and bindings", () => {
    const ctx = { dataModel: model }
    expect(resolveDynamic("hi", ctx)).toBe("hi")
    expect(resolveDynamic(3, ctx)).toBe(3)
    expect(resolveDynamic({ "@path": "/user/name" }, ctx)).toBe("Ada")
    expect(resolveDynamic({ "@path": "/nope" }, ctx)).toBeUndefined()
  })

  it("scopes template paths to the item, falling back to the root", () => {
    const ctx = { dataModel: model, scope: "/items/1" }
    expect(resolvePointer("/name", ctx)).toBe("/items/1/name")
    expect(readBinding({ "@path": "/name" }, ctx)).toBe("two")
    expect(readBinding({ "@path": "/title" }, ctx)).toBe("T2")
    expect(readBinding({ "@path": "/title" }, { dataModel: model, scope: "/items/0" })).toBe("Root")
    expect(resolvePointer("name", ctx)).toBe("/items/1/name")
    expect(resolvePointer("name", { dataModel: model })).toBe("/name")
  })

  it("deep-resolves nested bindings and strips prototype keys", () => {
    const ctx = { dataModel: model }
    const value = JSON.parse('{"who": {"@path": "/user/name"}, "list": [{"@path": "/title"}, 2], "__proto__": {"x": 1}}')
    expect(resolveDeep(value, ctx)).toEqual({ who: "Ada", list: ["Root", 2] })
  })
})

describe("template children", () => {
  it("expands static lists in the current scope", () => {
    expect(expandChildren(["a", "b", 3], { dataModel: {} })).toEqual([
      { componentId: "a", scope: "", key: "a" },
      { componentId: "b", scope: "", key: "b" },
    ])
  })

  it("expands a template over an array and over an object map", () => {
    const model = { rows: [{ n: 1 }, { n: 2 }], byId: { x: { n: 1 }, "a/b": { n: 2 } } }
    expect(expandChildren({ componentId: "row", path: "/rows" }, { dataModel: model }).map((c) => c.scope)).toEqual([
      "/rows/0",
      "/rows/1",
    ])
    expect(expandChildren({ componentId: "row", path: "/byId" }, { dataModel: model }).map((c) => c.scope)).toEqual([
      "/byId/x",
      "/byId/a~1b",
    ])
  })

  it("handles nested templates, missing lists and caps the item count", () => {
    const model = { groups: [{ items: ["a", "b"] }], big: Array.from({ length: MAX_TEMPLATE_ITEMS + 10 }, (_, i) => i) }
    const nested = expandChildren({ componentId: "item", path: "/items" }, { dataModel: model, scope: "/groups/0" })
    expect(nested.map((c) => c.scope)).toEqual(["/groups/0/items/0", "/groups/0/items/1"])
    expect(expandChildren({ componentId: "x", path: "/missing" }, { dataModel: model })).toEqual([])
    expect(expandChildren({ componentId: "x", path: "/big" }, { dataModel: model })).toHaveLength(MAX_TEMPLATE_ITEMS)
    expect(expandChildren({ componentId: 1, path: "/big" }, { dataModel: model })).toEqual([])
    expect(expandChildren("nope", { dataModel: model })).toEqual([])
  })
})
