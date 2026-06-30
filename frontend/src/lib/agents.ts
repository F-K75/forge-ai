import { Compass, Palette, Code2, Plug, ShieldCheck, type LucideIcon } from "lucide-react";

export interface Agent {
  id: "architect" | "designer" | "developer" | "integration" | "pm";
  label: string;
  icon: LucideIcon;
  hue: string;
  credits: number;
}

export const AGENTS: Agent[] = [
  { id: "architect",   label: "Architect",   icon: Compass,     hue: "#6366F1", credits: 3 },
  { id: "designer",    label: "Designer",    icon: Palette,     hue: "#A855F7", credits: 2 },
  { id: "developer",   label: "Developer",   icon: Code2,       hue: "#22D3EE", credits: 5 },
  { id: "integration", label: "Integration", icon: Plug,        hue: "#F59E0B", credits: 2 },
  { id: "pm",          label: "PM",          icon: ShieldCheck, hue: "#34D399", credits: 1 },
];

export const agentById = (id: Agent["id"]) => AGENTS.find(a => a.id === id)!;
