/**
 * Data access for the Skills page. LIVE_MODE calls the project-scoped skill
 * engine API; demo mode serves the generated catalogue + synthetic telemetry.
 */
import { api } from "./api"
import { LIVE_MODE } from "./env"
import { skillApi, type SkillActivation, type SkillManifest, type SkillTelemetryRecord } from "./kernelApi"
import { DEMO_SKILL_CATALOG, DEMO_SKILL_TELEMETRY } from "./demo/skillsDemo"
import { DEPARTMENT_ROLE, previewRoute, resolveDependencies } from "./skillRouterPreview"

export interface SkillCatalogData {
  skills: SkillManifest[]
  telemetry: SkillTelemetryRecord[]
  totalSkills: number
  domainCounts: Record<string, number>
}

export interface SkillDetail {
  skill: SkillManifest & { instructions: string }
  resolved_dependencies: string[]
}

export interface RouteResult {
  activations: SkillActivation[]
  /** True when computed client-side (demo mode), not by the engine. */
  preview: boolean
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

function countDomains(skills: SkillManifest[]): Record<string, number> {
  return skills.reduce<Record<string, number>>((acc, s) => {
    acc[s.domain] = (acc[s.domain] ?? 0) + 1
    return acc
  }, {})
}

export async function fetchSkillCatalog(projectId: string): Promise<SkillCatalogData> {
  if (!LIVE_MODE) {
    await delay(120)
    const skills = DEMO_SKILL_CATALOG.map(({ instructions: _i, ...rest }) => rest)
    return { skills, telemetry: DEMO_SKILL_TELEMETRY, totalSkills: skills.length, domainCounts: countDomains(skills) }
  }
  const [list, telemetry] = await Promise.all([
    skillApi.listSkills(projectId),
    skillApi.getTelemetry(projectId).catch(() => ({ telemetry: [] as SkillTelemetryRecord[] })),
  ])
  const summary = (list.summary ?? {}) as { total_skills?: number; domains?: Record<string, number> }
  return {
    skills: list.skills ?? [],
    telemetry: telemetry.telemetry ?? [],
    totalSkills: summary.total_skills ?? list.skills?.length ?? 0,
    domainCounts: summary.domains ?? countDomains(list.skills ?? []),
  }
}

export async function fetchSkillDetail(projectId: string, name: string): Promise<SkillDetail> {
  if (!LIVE_MODE) {
    await delay(80)
    const skill = DEMO_SKILL_CATALOG.find((s) => s.name === name)
    if (!skill) throw new Error("Skill not found")
    let chain: string[] = []
    try {
      const catalog = new Map<string, SkillManifest>(DEMO_SKILL_CATALOG.map((s) => [s.name, s]))
      chain = resolveDependencies([name], catalog)
        .map((m) => m.name)
        .filter((n) => n !== name)
    } catch {
      chain = []
    }
    return { skill, resolved_dependencies: chain }
  }
  const res = await api.get(`/v1/projects/${projectId}/skills/${encodeURIComponent(name)}`)
  return res.data as SkillDetail
}

export async function routeTask(
  projectId: string,
  input: { department: string; objective: string; topK?: number },
  context: { skills: SkillManifest[]; telemetry: SkillTelemetryRecord[] }
): Promise<RouteResult> {
  const role = DEPARTMENT_ROLE[input.department] ?? "engineer"
  if (!LIVE_MODE) {
    await delay(160)
    const byName = new Map(DEMO_SKILL_CATALOG.map((s) => [s.name, s.instructions]))
    return {
      preview: true,
      activations: previewRoute(context.skills, {
        role,
        department: input.department,
        objective: input.objective,
        topK: input.topK ?? 3,
        telemetry: context.telemetry,
        instructionsFor: (n) => byName.get(n) ?? "",
      }),
    }
  }
  const res = await skillApi.routeSkills(projectId, {
    role,
    department: input.department,
    objective: input.objective,
    top_k: input.topK ?? 3,
  })
  return { preview: false, activations: res.activations ?? [] }
}
