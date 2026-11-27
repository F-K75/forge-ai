/**
 * Contract validation entry points shared by every workstream. Two layers,
 * mirroring A2UI's envelope + catalog split:
 *  1. `validateContract(def, payload)` checks a wire payload against a `$defs`
 *     entry of os-contracts.schema.json (envelopes, requests, state).
 *  2. `validateComponent` / `validateA2UIMessage` additionally check every
 *     A2UI component against its schema in the Forge Ember catalog. Unknown
 *     component names are rejected: the catalog is a closed allowlist.
 * The backend runs the same two layers in backend/core/os_contracts.py.
 */
import contractsSchema from "./schemas/os-contracts.schema.json"
import catalogDoc from "./schemas/forge-ember.catalog.json"
import {
  validateSchema,
  type JsonSchema,
  type SchemaError,
  type ValidationResult,
} from "./jsonSchema"
import { FORGE_CATALOG_ID, type ContractDef } from "./contracts"

type SchemaDoc = { $defs: Record<string, JsonSchema> }
type CatalogDoc = SchemaDoc & { catalogId: string; components: Record<string, JsonSchema> }

const CONTRACTS = contractsSchema as unknown as SchemaDoc
const CATALOG = catalogDoc as unknown as CatalogDoc

if (CATALOG.catalogId !== FORGE_CATALOG_ID) {
  throw new Error(`Catalog id mismatch: ${CATALOG.catalogId} !== ${FORGE_CATALOG_ID}`)
}

/** Component names the trusted registry must implement (closed allowlist). */
export const CATALOG_COMPONENTS: readonly string[] = Object.freeze(Object.keys(CATALOG.components))

export function validateContract(def: ContractDef | string, payload: unknown): ValidationResult {
  const schema = CONTRACTS.$defs[def]
  if (schema === undefined) throw new Error(`Unknown contract def "${def}"`)
  return validateSchema(schema, payload, CONTRACTS)
}

export function validateComponent(component: unknown): ValidationResult {
  const name =
    typeof component === "object" && component !== null && !Array.isArray(component)
      ? (component as Record<string, unknown>).component
      : undefined
  if (typeof name !== "string" || !(name in CATALOG.components)) {
    return {
      valid: false,
      errors: [
        {
          path: "/component",
          message: `component ${JSON.stringify(name)} is not in the Forge catalog`,
        },
      ],
    }
  }
  return validateSchema(CATALOG.components[name], component, CATALOG)
}

/** Envelope + catalog validation for one agent->renderer A2UI message. */
export function validateA2UIMessage(message: unknown): ValidationResult {
  const envelope = validateContract("A2UIServerMessage", message)
  if (!envelope.valid) return envelope
  const m = message as Record<string, { components?: unknown[] }>
  const components = m.createSurface?.components ?? m.updateComponents?.components ?? []
  const errors: SchemaError[] = []
  components.forEach((c, i) => {
    for (const e of validateComponent(c).errors)
      errors.push({ path: `/components/${i}${e.path}`, message: e.message })
  })
  return { valid: errors.length === 0, errors }
}

/** Envelope validation for a stream event, plus catalog validation for `a2ui.message` events. */
export function validateOsEvent(event: unknown): ValidationResult {
  const envelope = validateContract("OsEvent", event)
  if (!envelope.valid) return envelope
  const e = event as { type: string; data: { message?: unknown } }
  return e.type === "a2ui.message" ? validateA2UIMessage(e.data.message) : envelope
}
