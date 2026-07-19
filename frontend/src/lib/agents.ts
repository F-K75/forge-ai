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
  { id: "architect",         label: "Architect",      icon: Compass,     hue: "#F4A261", credits: 3 },
  { id: "business_improver", label: "Business Model", icon: TrendingUp,  hue: "#F0934D", credits: 2 },
  { id: "designer",          label: "Designer",       icon: Palette,     hue: "#E8823C", credits: 2 },
  { id: "developer",         label: "Developer",      icon: Code2,       hue: "#D9722C", credits: 5 },
  { id: "integration",       label: "Integration",    icon: Plug,        hue: "#C2631F", credits: 2 },
  { id: "pm",                label: "PM",             icon: ShieldCheck, hue: "#A85423", credits: 1 },
];

export const agentById = (id: string): Agent | undefined =>
  AGENTS.find(a => a.id === id);
