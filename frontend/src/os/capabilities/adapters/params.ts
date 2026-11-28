import type { JsonObject } from "../../contracts"

export function paramString(params: JsonObject | null | undefined, key: string): string | null {
  const v = params?.[key]
  return typeof v === "string" && v.length > 0 ? v : null
}
