import {
  BarChart3,
  Bot,
  Brain,
  Cog,
  Hammer,
  Layers,
  Network,
  Shield,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react"
import type { CapabilityCategory } from "../contracts"

export const CATEGORY_ICON: Record<CapabilityCategory, LucideIcon> = {
  build: Hammer,
  plan: Layers,
  agents: Bot,
  data: BarChart3,
  models: Brain,
  protocols: Network,
  governance: ShieldCheck,
  account: UserRound,
  admin: Shield,
  system: Cog,
}

export const CATEGORY_LABEL: Record<CapabilityCategory, string> = {
  build: "Build",
  plan: "Plan",
  agents: "Agents",
  data: "Data",
  models: "Models",
  protocols: "Protocols",
  governance: "Governance",
  account: "Account",
  admin: "Admin",
  system: "System",
}
