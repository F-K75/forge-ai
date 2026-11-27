/**
 * Minimal, dependency-free JSON Schema (draft 2020-12) validator for the Forge
 * OS contract schemas in ./schemas. It supports exactly the keyword subset the
 * contract schemas use and THROWS on any other assertion keyword, so a schema
 * edit that needs more power fails loudly in tests instead of being silently
 * ignored. The backend validates the same schemas with the reference
 * `jsonschema` library (backend/tests/test_os_contracts.py); both run the
 * shared examples in shared/os-schemas/examples, which keeps the two in step.
 *
 * Supported: $ref (document-local "#/..."), type (string or list), enum, const,
 * properties, required, additionalProperties (boolean or schema), items,
 * minItems, maxItems, minLength, maxLength (code points), pattern (unicode),
 * minimum, maximum, oneOf, anyOf, allOf.
 * Ignored annotations: $schema, $id, $defs, title, description, format,
 * default, examples, and any "x-*".
 */

export type JsonSchema = boolean | { [keyword: string]: unknown }

export interface SchemaError {
  path: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: SchemaError[]
}

const ASSERTIONS = new Set([
  "$ref",
  "type",
  "enum",
  "const",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "oneOf",
  "anyOf",
  "allOf",
])

const ANNOTATIONS = new Set([
  "$schema",
  "$id",
  "$defs",
  "title",
  "description",
  "format",
  "default",
  "examples",
])

const MAX_DEPTH = 64

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function typeOf(v: unknown): string {
  if (v === null) return "null"
  if (Array.isArray(v)) return "array"
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number"
  return typeof v
}

function matchesType(v: unknown, t: string): boolean {
  const actual = typeOf(v)
  if (t === "number")
    return (actual === "number" || actual === "integer") && Number.isFinite(v as number)
  if (t === "integer") return actual === "integer"
  if (t === "object") return isPlainObject(v)
  return actual === t
}

/** Structural equality for const/enum (JSON values only). */
function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => jsonEqual(x, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    return ka.length === kb.length && ka.every((k) => k in b && jsonEqual(a[k], b[k]))
  }
  return false
}

/** JSON Schema string lengths count Unicode code points, not UTF-16 units. */
function codePointLength(s: string): number {
  return Array.from(s).length
}

function resolvePointer(root: unknown, ref: string): JsonSchema {
  if (!ref.startsWith("#")) throw new Error(`Unsupported non-local $ref: ${ref}`)
  const parts = ref
    .slice(1)
    .split("/")
    .filter((p) => p !== "")
    .map((p) => decodeURIComponent(p).replace(/~1/g, "/").replace(/~0/g, "~"))
  let cur: unknown = root
  for (const p of parts) {
    if (!isPlainObject(cur) || !(p in cur)) throw new Error(`Unresolvable $ref: ${ref}`)
    cur = cur[p]
  }
  return cur as JsonSchema
}

const patternCache = new Map<string, RegExp>()
function compilePattern(p: string): RegExp {
  let re = patternCache.get(p)
  if (!re) {
    re = new RegExp(p, "u")
    patternCache.set(p, re)
  }
  return re
}

function check(
  root: unknown,
  schema: JsonSchema,
  value: unknown,
  path: string,
  errors: SchemaError[],
  depth: number
): void {
  if (depth > MAX_DEPTH) {
    errors.push({ path, message: "schema nesting too deep" })
    return
  }
  if (schema === true) return
  if (schema === false) {
    errors.push({ path, message: "value not allowed" })
    return
  }
  for (const key of Object.keys(schema)) {
    if (!ASSERTIONS.has(key) && !ANNOTATIONS.has(key) && !key.startsWith("x-")) {
      throw new Error(`jsonSchema.ts does not support keyword "${key}" (at ${path || "/"})`)
    }
  }

  if (typeof schema.$ref === "string") {
    check(root, resolvePointer(root, schema.$ref), value, path, errors, depth + 1)
  }

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? (schema.type as string[]) : [schema.type as string]
    if (!types.some((t) => matchesType(value, t))) {
      errors.push({ path, message: `expected ${types.join("|")}, got ${typeOf(value)}` })
      return
    }
  }
  if ("const" in schema && !jsonEqual(value, schema.const)) {
    errors.push({ path, message: `expected const ${JSON.stringify(schema.const)}` })
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((e) => jsonEqual(value, e))) {
    errors.push({ path, message: `expected one of ${JSON.stringify(schema.enum)}` })
  }

  if (typeof value === "string") {
    const len = codePointLength(value)
    if (typeof schema.minLength === "number" && len < schema.minLength) {
      errors.push({ path, message: `shorter than ${schema.minLength}` })
    }
    if (typeof schema.maxLength === "number" && len > schema.maxLength) {
      errors.push({ path, message: `longer than ${schema.maxLength}` })
    }
    if (typeof schema.pattern === "string" && !compilePattern(schema.pattern).test(value)) {
      errors.push({ path, message: `does not match ${schema.pattern}` })
    }
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push({ path, message: `below minimum ${schema.minimum}` })
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push({ path, message: `above maximum ${schema.maximum}` })
    }
  }

  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) {
      errors.push({ path, message: `fewer than ${schema.minItems} items` })
    }
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) {
      errors.push({ path, message: `more than ${schema.maxItems} items` })
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) =>
        check(root, schema.items as JsonSchema, item, `${path}/${i}`, errors, depth + 1)
      )
    }
  }

  if (isPlainObject(value)) {
    const props = isPlainObject(schema.properties)
      ? (schema.properties as Record<string, JsonSchema>)
      : {}
    if (Array.isArray(schema.required)) {
      for (const req of schema.required as string[]) {
        if (!(req in value)) errors.push({ path, message: `missing required property "${req}"` })
      }
    }
    for (const [k, v] of Object.entries(value)) {
      const childPath = `${path}/${k.replace(/~/g, "~0").replace(/\//g, "~1")}`
      if (k in props) {
        check(root, props[k], v, childPath, errors, depth + 1)
      } else if (schema.additionalProperties === false) {
        errors.push({ path, message: `unknown property "${k}"` })
      } else if (isPlainObject(schema.additionalProperties)) {
        check(root, schema.additionalProperties as JsonSchema, v, childPath, errors, depth + 1)
      }
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf as JsonSchema[]) check(root, sub, value, path, errors, depth + 1)
  }
  if (Array.isArray(schema.anyOf)) {
    const ok = (schema.anyOf as JsonSchema[]).some((sub) => {
      const e: SchemaError[] = []
      check(root, sub, value, path, e, depth + 1)
      return e.length === 0
    })
    if (!ok) errors.push({ path, message: "does not match any allowed shape (anyOf)" })
  }
  if (Array.isArray(schema.oneOf)) {
    const branchErrors: SchemaError[][] = []
    let matches = 0
    for (const sub of schema.oneOf as JsonSchema[]) {
      const e: SchemaError[] = []
      check(root, sub, value, path, e, depth + 1)
      if (e.length === 0) matches++
      else branchErrors.push(e)
    }
    if (matches !== 1) {
      const best = branchErrors.sort((a, b) => a.length - b.length)[0]
      errors.push({
        path,
        message:
          matches === 0
            ? `does not match exactly one shape (oneOf); closest: ${best?.[0]?.path ?? path} ${best?.[0]?.message ?? ""}`.trim()
            : `matches ${matches} shapes (oneOf), expected exactly one`,
      })
    }
  }
}

/** Validate `value` against `schema`, resolving "#/..." refs inside `root` (defaults to `schema`). */
export function validateSchema(
  schema: JsonSchema,
  value: unknown,
  root: unknown = schema
): ValidationResult {
  const errors: SchemaError[] = []
  check(root, schema, value, "", errors, 0)
  return { valid: errors.length === 0, errors }
}
