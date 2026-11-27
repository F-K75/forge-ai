import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { LEGAL_DOCS, PUBLIC_DOCS, prepareDoc, resolveDocLink } from "."

// Tests run from frontend/, so the repo root is one level up.
const repoFile = (path: string) => readFileSync(resolve(process.cwd(), "..", path), "utf8")
const copyFile = (path: string) => readFileSync(resolve(process.cwd(), "src/content", path), "utf8")

const ALL = [...Object.values(LEGAL_DOCS), ...PUBLIC_DOCS]

describe("public content copies", () => {
  it.each(ALL.map((d) => [d.copy, d.source, d] as const))(
    "src/content/%s matches %s (re-copy it if this fails)",
    (_copy, source, doc) => {
      const original = repoFile(source)
      expect(copyFile(doc.copy)).toBe(original)
      expect(doc.raw).toBe(original)
    }
  )
})

describe("prepareDoc", () => {
  it("takes the legal 'Last updated' date from the document and keeps the text", () => {
    for (const doc of Object.values(LEGAL_DOCS)) {
      const { body, lastUpdated } = prepareDoc(doc.raw)
      expect(lastUpdated).toBe(doc.raw.match(/\*\*Last Updated:\*\*\s*(.+)/)![1].trim())
      expect(body).not.toMatch(/^# /m)
      expect(body).not.toMatch(/Last Updated/)
      // Nothing is rewritten: every line of the body is a line of the source.
      const sourceLines = new Set(doc.raw.split("\n"))
      body.split("\n").forEach((line) => expect(sourceLines.has(line)).toBe(true))
      // And every h2 of the source survives.
      expect(body.match(/^## /gm)?.length).toBe(doc.raw.match(/^## /gm)?.length)
    }
  })

  it("drops omitted sections from the public docs", () => {
    const bodies = PUBLIC_DOCS.map((d) => prepareDoc(d.raw, d.omitSections).body).join("\n")
    for (const internal of [
      "allow_origin_regex",
      "ADMIN_EMAILS",
      "METRICS_TOKEN",
      "BACKUP_FAILURE_WEBHOOK_URL",
      "FIELD_ENCRYPTION_KEY",
      "dead-letter list + retry",
      "/health/pools",
    ]) {
      expect(bodies).not.toContain(internal)
    }
    // ...but keeps the rest of each doc.
    expect(bodies).toContain("## Build pipeline (the core product flow)")
    expect(bodies).toContain("## Builds — `/builds`")
    expect(bodies).toContain("## Example: GitHub Actions")
    expect(bodies).toContain("## Activation criteria")
  })

  it("never treats fenced code as a heading", () => {
    const { body } = prepareDoc("# T\n\n## Keep\n\n```\n## Drop me\n```\n\n## Drop\n\nx", ["Drop"])
    expect(body).toContain("## Drop me")
    expect(body).not.toMatch(/^## Drop$/m)
  })

  it("publishes no secrets/ops runbooks", () => {
    const sources = PUBLIC_DOCS.map((d) => d.source.toLowerCase()).join(" ")
    for (const name of ["configuration", "secret", "rotation", "disaster", "deployment", "purge", "icp", "readme"]) {
      expect(sources).not.toContain(name)
    }
  })
})

describe("resolveDocLink", () => {
  it("maps published docs to routes and hides unpublished repo files", () => {
    expect(resolveDocLink("API_REFERENCE.md")).toBe("/docs/api-reference")
    expect(resolveDocLink("../ARCHITECTURE.md#billing")).toBe("/docs/architecture")
    expect(resolveDocLink("../VISION_IMPLEMENTATION_AUDIT.md")).toBeNull()
    expect(resolveDocLink("secrets.md")).toBeNull()
    expect(resolveDocLink("https://forge.ai")).toBe("https://forge.ai")
  })
})
