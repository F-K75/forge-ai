import { COLORS } from "./theme";
import { Compass, TrendingUp, Palette, Code2, Plug, ShieldCheck, type LucideIcon } from "lucide-react";

export interface Agent {
  id: "architect" | "business_improver" | "designer" | "developer" | "integration" | "pm";
  label: string;
  icon: LucideIcon;
  hue: string;
  credits: number;
}

// ids must match backend AgentType values (core/models.py) exactly.
export const AGENTS: Agent[] = [
  { id: "architect",         label: "Architect",      icon: Compass,     hue: COLORS.agentArchitect, credits: 3 },
  { id: "business_improver", label: "Business Model", icon: TrendingUp,  hue: COLORS.agentBusinessImprover, credits: 2 },
  { id: "designer",          label: "Designer",       icon: Palette,     hue: COLORS.agentDesigner, credits: 2 },
  { id: "developer",         label: "Developer",      icon: Code2,       hue: COLORS.agentDeveloper, credits: 5 },
  { id: "integration",       label: "Integration",    icon: Plug,        hue: COLORS.agentIntegration, credits: 2 },
  { id: "pm",                label: "PM",             icon: ShieldCheck, hue: COLORS.agentPm, credits: 1 },
];

export const agentById = (id: string): Agent | undefined =>
  AGENTS.find(a => a.id === id);
