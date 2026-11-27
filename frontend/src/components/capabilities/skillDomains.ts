import {
  Bot,
  BrainCircuit,
  Briefcase,
  Code2,
  Database,
  FlaskConical,
  Palette,
  Server,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import type { AtmosphereHue } from "../ui"

export interface SkillDomainMeta {
  key: string
  label: string
  icon: LucideIcon
  hue: AtmosphereHue
  origin: string
}

/** The engine's 9 SkillDomain values, in catalogue order. */
export const SKILL_DOMAINS: SkillDomainMeta[] = [
  { key: "software_engineering", label: "Software", icon: Code2, hue: "teal", origin: "0% 0%" },
  { key: "ai_engineering", label: "AI", icon: BrainCircuit, hue: "olive", origin: "0% 0%" },
  { key: "agent_engineering", label: "Agents", icon: Bot, hue: "rust", origin: "0% 0%" },
  { key: "devops", label: "DevOps", icon: Server, hue: "slate", origin: "100% 0%" },
  { key: "security", label: "Security", icon: ShieldCheck, hue: "rust", origin: "100% 0%" },
  { key: "quality_engineering", label: "Quality", icon: FlaskConical, hue: "moss", origin: "0% 0%" },
  { key: "product_business", label: "Product", icon: Briefcase, hue: "clay", origin: "0% 0%" },
  { key: "data_engineering", label: "Data", icon: Database, hue: "teal", origin: "100% 0%" },
  { key: "design_tools", label: "Design", icon: Palette, hue: "olive", origin: "100% 0%" },
]

const FALLBACK: SkillDomainMeta = { key: "other", label: "Other", icon: Sparkles, hue: "slate", origin: "0% 0%" }

export function domainMeta(key: string): SkillDomainMeta {
  return SKILL_DOMAINS.find((d) => d.key === key) ?? { ...FALLBACK, key, label: key.replace(/_/g, " ") }
}

/** "api-hardening" -> "Api Hardening" with common acronyms kept upper-case. */
export function skillTitle(name: string): string {
  const upper = new Set(["api", "ci", "llm", "rag", "ux", "qa", "e2e", "prd", "etl", "k8s", "authn", "authz"])
  return name
    .split("-")
    .map((w) => (upper.has(w) ? (w === "authn" ? "AuthN" : w === "authz" ? "AuthZ" : w === "k8s" ? "K8s" : w.toUpperCase()) : w[0].toUpperCase() + w.slice(1)))
    .join(" ")
}
