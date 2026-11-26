/**
 * Demo data for the Skills page. The catalogue itself is generated from the
 * real backend/skills/*\/SKILL.md files (see ./skillCatalog.ts); telemetry is
 * synthesised deterministically so the page looks lived-in without a backend.
 */
import type { SkillTelemetryRecord } from "../kernelApi"
import { routingBoost } from "../skillRouterPreview"
import { DEMO_SKILL_CATALOG } from "./skillCatalog"

export { DEMO_SKILL_CATALOG }
export type { SkillManifestWithInstructions } from "./skillCatalog"

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Deterministic telemetry: most skills have run recently, a few are cold. */
export const DEMO_SKILL_TELEMETRY: SkillTelemetryRecord[] = DEMO_SKILL_CATALOG.map((s) => {
  const h = hash(s.name)
  const invocations = h % 7 === 0 ? 0 : 3 + (h % 41)
  const quality = invocations ? 0.68 + ((h >> 8) % 30) / 100 : 0
  const passed = Math.round(invocations * Math.min(1, quality + 0.06))
  const rec = {
    skill_name: s.name,
    invocations,
    passed_count: passed,
    avg_quality_score: Math.round(quality * 10000) / 10000,
    avg_latency_ms: invocations ? 900 + ((h >> 4) % 5200) : 0,
    total_cost_usd: invocations ? Math.round(invocations * (0.004 + ((h >> 12) % 40) / 10000) * 1e6) / 1e6 : 0,
    routing_boost: 0,
  }
  rec.routing_boost = routingBoost(rec)
  return rec
})
  .filter((r) => r.invocations > 0)
  .sort((a, b) => b.invocations - a.invocations || a.skill_name.localeCompare(b.skill_name))
