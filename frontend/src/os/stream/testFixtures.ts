/**
 * Test-only loader for the shared OS event examples
 * (shared/os-schemas/examples/os-event.examples.json). Reads from disk, so
 * import it only from *.test.ts(x) files (vitest runs from frontend/).
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { OsEvent } from "../contracts"

interface ExampleDoc {
  valid: OsEvent[]
  invalid: { reason: string; payload: unknown }[]
}

export function loadOsEventExamples(): ExampleDoc {
  const file = resolve(process.cwd(), "..", "shared/os-schemas/examples/os-event.examples.json")
  return JSON.parse(readFileSync(file, "utf8")) as ExampleDoc
}

export const FIXTURE_SESSION = "ses_7f3a"
