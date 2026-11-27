/**
 * Client-side mirror of `SkillRouter.route_for_task` (backend/core/skill_engine.py),
 * used by the Skills page "Route a task" box in demo mode. Labelled "preview" in
 * the UI: the live engine also folds in telemetry it has observed server-side.
 *
 * Mirrors: keyword word-start matching (short keywords whole-word), +1.5 for an
 * allowed department, least-privilege department permissions, quality-feedback
 * routing boost, transitive dependency resolution and top_k.
 */
import type { SkillActivation, SkillManifest, SkillTelemetryRecord } from "./kernelApi"

export const DEPARTMENT_DEFAULT_PERMISSIONS: Record<string, readonly string[]> = {
  leadership: ["read_repo", "read_blackboard", "write_decisions", "approve_gates"],
  business: ["read_repo", "read_blackboard", "write_specs"],
  architecture: ["read_repo", "read_blackboard", "write_specs", "write_decisions"],
  design: ["read_repo", "read_blackboard", "write_ui_assets", "write_specs"],
  engineering: ["read_repo", "read_blackboard", "write_code", "run_tests"],
  infrastructure: ["read_repo", "read_blackboard", "write_infra", "run_checks"],
  security: ["read_repo", "read_blackboard", "run_security_scan", "emit_findings"],
  quality: ["read_repo", "read_blackboard", "run_tests", "emit_findings"],
  delivery: ["read_repo", "read_blackboard", "write_docs", "prepare_release"],
}

export const DEPARTMENTS = Object.keys(DEPARTMENT_DEFAULT_PERMISSIONS)

/** A representative role per department, sent as `role` to POST /skills/route. */
export const DEPARTMENT_ROLE: Record<string, string> = {
  leadership: "cto",
  business: "product_manager",
  architecture: "solutions_architect",
  design: "product_designer",
  engineering: "backend_engineer",
  infrastructure: "platform_engineer",
  security: "security_engineer",
  quality: "qa_engineer",
  delivery: "release_manager",
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export function keywordMatches(keyword: string, text: string): boolean {
  if (!keyword) return false
  const k = escapeRe(keyword)
  const re = keyword.length <= 3 ? new RegExp(`(?<![a-z0-9])${k}s?(?![a-z0-9])`) : new RegExp(`(?<![a-z0-9])${k}`)
  return re.test(text)
}

export function routingBoost(rec?: Pick<SkillTelemetryRecord, "invocations" | "avg_quality_score">): number {
  if (!rec || rec.invocations < 1) return 0
  const confidence = Math.min(1, rec.invocations / 5)
  const delta = (rec.avg_quality_score - 0.75) * 4 * confidence
  return Math.round(Math.max(-0.5, Math.min(1, delta)) * 1000) / 1000
}

export function isPermitted(skill: SkillManifest, department: string): boolean {
  if (skill.allowed_departments.length && !skill.allowed_departments.includes(department)) return false
  const perms = DEPARTMENT_DEFAULT_PERMISSIONS[department] ?? ["read_repo"]
  return skill.required_permissions.every((p) => perms.includes(p))
}

/** Topological dependency order (deps first, skill last). Throws on missing/cyclic deps. */
export function resolveDependencies(names: string[], catalog: Map<string, SkillManifest>): SkillManifest[] {
  const ordered: SkillManifest[] = []
  const done = new Set<string>()
  const visiting = new Set<string>()
  const visit = (name: string) => {
    if (done.has(name)) return
    if (visiting.has(name)) throw new Error(`Dependency cycle at '${name}'`)
    const skill = catalog.get(name)
    if (!skill) throw new Error(`Missing dependency '${name}'`)
    visiting.add(name)
    skill.dependencies.forEach(visit)
    visiting.delete(name)
    done.add(name)
    ordered.push(skill)
  }
  names.forEach(visit)
  return ordered
}

export function previewRoute(
  skills: SkillManifest[],
  opts: {
    role: string
    department: string
    objective: string
    taskDescription?: string
    topK?: number
    telemetry?: SkillTelemetryRecord[]
    instructionsFor?: (name: string) => string
  }
): SkillActivation[] {
  const { role, department, objective, taskDescription = "", topK = 3, telemetry = [] } = opts
  const blob = `${role.replace(/_/g, " ")} ${department} ${objective} ${taskDescription}`.toLowerCase()
  const catalog = new Map(skills.map((s) => [s.name, s]))
  const telemetryByName = new Map(telemetry.map((t) => [t.skill_name, t]))

  const scored: Array<[number, SkillManifest]> = []
  for (const skill of skills) {
    if (!isPermitted(skill, department)) continue
    const hits = skill.keywords.filter((k) => keywordMatches(k, blob)).length
    const deptBonus = skill.allowed_departments.includes(department) ? 1.5 : 0
    const base = hits + deptBonus
    if (base > 0) scored.push([Math.max(0.1, base + routingBoost(telemetryByName.get(skill.name))), skill])
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name))

  const out: SkillActivation[] = []
  for (const [score, skill] of scored.slice(0, Math.max(1, Math.min(topK, 8)))) {
    let chain: SkillManifest[]
    try {
      chain = resolveDependencies([skill.name], catalog)
    } catch {
      continue
    }
    if (!chain.every((dep) => isPermitted(dep, department))) continue
    out.push({
      skill_name: skill.name,
      domain: skill.domain,
      version: skill.version,
      origin: skill.origin,
      score: Math.round(score * 100) / 100,
      resolved_dependencies: chain.filter((m) => m.name !== skill.name).map((m) => m.name),
      instructions_excerpt: (opts.instructionsFor?.(skill.name) ?? "").slice(0, 280),
    })
  }
  return out
}
