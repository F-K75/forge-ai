import { describe, it, expect } from "vitest"
import { validateSchema } from "./jsonSchema"

describe("jsonSchema validator", () => {
  it("checks types, including integer vs number and non-finite numbers", () => {
    expect(validateSchema({ type: "integer" }, 3).valid).toBe(true)
    expect(validateSchema({ type: "integer" }, 3.5).valid).toBe(false)
    expect(validateSchema({ type: "number" }, 3).valid).toBe(true)
    expect(validateSchema({ type: "number" }, Number.NaN).valid).toBe(false)
    expect(validateSchema({ type: ["string", "null"] }, null).valid).toBe(true)
    expect(validateSchema({ type: "object" }, []).valid).toBe(false)
  })

  it("checks const, enum, string and numeric bounds", () => {
    expect(validateSchema({ const: "1.0" }, "1.0").valid).toBe(true)
    expect(validateSchema({ const: "1.0" }, "1").valid).toBe(false)
    expect(validateSchema({ enum: ["a", "b"] }, "c").valid).toBe(false)
    expect(validateSchema({ type: "string", maxLength: 2 }, "😀😀").valid).toBe(true) // code points, not UTF-16 units
    expect(validateSchema({ type: "string", minLength: 1 }, "").valid).toBe(false)
    expect(validateSchema({ type: "string", pattern: "^/" }, "x/").valid).toBe(false)
    expect(validateSchema({ type: "number", minimum: 0, maximum: 1 }, 1.01).valid).toBe(false)
  })

  it("checks objects: required, closed and schema-typed additional properties", () => {
    const closed = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
      additionalProperties: false,
    }
    expect(validateSchema(closed, { a: "x" }).valid).toBe(true)
    expect(validateSchema(closed, {}).errors[0].message).toContain('missing required property "a"')
    expect(validateSchema(closed, { a: "x", b: 1 }).errors[0].message).toContain(
      'unknown property "b"'
    )
    expect(
      validateSchema({ type: "object", additionalProperties: { type: "number" } }, { k: "v" }).valid
    ).toBe(false)
  })

  it("checks arrays and reports item paths", () => {
    const s = { type: "array", items: { type: "string" }, minItems: 1, maxItems: 2 }
    expect(validateSchema(s, []).valid).toBe(false)
    expect(validateSchema(s, ["a", "b", "c"]).valid).toBe(false)
    expect(validateSchema(s, ["a", 1]).errors[0].path).toBe("/1")
  })

  it("resolves local $ref and evaluates oneOf / anyOf / allOf", () => {
    const root = {
      $defs: { S: { type: "string" }, N: { type: "number" } },
      oneOf: [{ $ref: "#/$defs/S" }, { $ref: "#/$defs/N" }],
    }
    expect(validateSchema(root, "x").valid).toBe(true)
    expect(validateSchema(root, true).valid).toBe(false)
    expect(validateSchema({ oneOf: [{ type: "number" }, { type: "integer" }] }, 2).valid).toBe(
      false
    ) // matches both
    expect(validateSchema({ anyOf: [{ type: "number" }, { type: "integer" }] }, 2).valid).toBe(true)
    expect(validateSchema({ allOf: [{ type: "number" }, { minimum: 5 }] }, 2).valid).toBe(false)
  })

  it("throws on keywords outside the supported subset instead of ignoring them", () => {
    expect(() => validateSchema({ type: "string", contentMediaType: "text/html" }, "x")).toThrow(
      /does not support keyword/
    )
    expect(() => validateSchema({ $ref: "other.json#/x" }, "x")).toThrow(/non-local/)
  })

  it("ignores annotations", () => {
    expect(
      validateSchema(
        {
          title: "t",
          description: "d",
          format: "date-time",
          "x-forge-tier": "core",
          type: "string",
        },
        "x"
      ).valid
    ).toBe(true)
  })
})
