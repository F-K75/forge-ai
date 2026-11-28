/** Client-generated ids that satisfy the contract `Id` pattern (^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$). */
export function newId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
  return `${prefix}_${rand}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
