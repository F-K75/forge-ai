import { Compass, TrendingUp, Palette, Code2, Plug, ShieldCheck, type LucideIcon } from "lucide-react";

export interface Agent {
  id: "architect" | "business_improver" | "designer" | "developer" | "integration" | "pm";
  label: string;
  icon: LucideIcon;
  hue: string;
  credits: number;
}

// ids must match backend AgentType values (core/models.py) exactly — they're
// used verbatim as the "agent" field on agent_start/agent_complete WS events.
// One orange family (the Launch page's "ember" accent) instead of a
// multi-hue palette — each agent is a distinct shade of the same orange, from
// light peach through the base ember to deep rust, so they read as one
// cohesive identity rather than unrelated colors.
export const AGENTS: Agent[] = [
  { id: "architect",         label: "Architect",      icon: Compass,     hue: "#F4F4F5", credits: 3 },
  { id: "business_improver", label: "Business Model", icon: TrendingUp,  hue: "#E4E4E7", credits: 2 },
  { id: "designer",          label: "Designer",       icon: Palette,     hue: "#D4D4D8", credits: 2 },
  { id: "developer",         label: "Developer",      icon: Code2,       hue: "#A1A1AA", credits: 5 },
  { id: "integration",       label: "Integration",    icon: Plug,        hue: "#71717A", credits: 2 },
  { id: "pm",                label: "PM",             icon: ShieldCheck, hue: "#52525B", credits: 1 },
];

export const agentById = (id: string): Agent | undefined =>
  AGENTS.find(a => a.id === id);
