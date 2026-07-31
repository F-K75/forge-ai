import {
  Bug,
  Compass,
  TrendingUp,
  Palette,
  Code2,
  Plug,
  ShieldCheck,
  FileStack,
  Scale,
  NotebookPen,
  Layers,
  ListChecks,
  ListTodo,
  CalendarRange,
  Users,
  Terminal,
  type LucideIcon,
} from "lucide-react";

export type VisualCoverage = "full" | "partial" | "minimal" | "none";

export interface SkillVisual {
  id: string;
  label: string;
  family: "build" | "gateway" | "org" | "review" | "playbook";
  icon: LucideIcon;
  hue: string;
  coverage: VisualCoverage;
  surface: string;
}

/** Canonical skill/agent visual inventory for Forge OS maximal shell. */
export const SKILL_VISUALS: SkillVisual[] = [
  { id: "architect", label: "Architect", family: "build", icon: Compass, hue: "#F4F4F5", coverage: "full", surface: "Build pipeline + chat" },
  { id: "business_improver", label: "Business Model", family: "build", icon: TrendingUp, hue: "#E4E4E7", coverage: "full", surface: "Build pipeline + chat" },
  { id: "designer", label: "Designer", family: "build", icon: Palette, hue: "#D4D4D8", coverage: "full", surface: "Build pipeline + design doc" },
  { id: "developer", label: "Developer", family: "build", icon: Code2, hue: "#A1A1AA", coverage: "full", surface: "Build pipeline + editor" },
  { id: "integration", label: "Integration", family: "build", icon: Plug, hue: "#71717A", coverage: "full", surface: "Build pipeline + manifest" },
  { id: "pm", label: "PM / Validator", family: "build", icon: ShieldCheck, hue: "#52525B", coverage: "full", surface: "Build pipeline + QA" },
  { id: "debugger", label: "Debugger", family: "build", icon: Bug, hue: "#3F3F46", coverage: "minimal", surface: "Folded into Developer" },

  { id: "business_analyst", label: "Business Analyst", family: "gateway", icon: FileStack, hue: "#F4F4F5", coverage: "full", surface: "AgentRuns · BA pane" },
  { id: "decision_engine", label: "Decision Engine", family: "gateway", icon: Scale, hue: "#E4E4E7", coverage: "partial", surface: "AgentRuns · Decision pane" },
  { id: "prd_writer", label: "PRD Writer", family: "gateway", icon: NotebookPen, hue: "#D4D4D8", coverage: "full", surface: "AgentRuns · PRD pane" },
  { id: "gateway_designer", label: "Initiative Designer", family: "gateway", icon: Palette, hue: "#C4C4C8", coverage: "minimal", surface: "Pane exists, unwired" },
  { id: "epic_generator", label: "Epic Generator", family: "gateway", icon: Layers, hue: "#B4B4B8", coverage: "full", surface: "AgentRuns · Epic pane" },
  { id: "story_generator", label: "Story Generator", family: "gateway", icon: ListChecks, hue: "#A1A1AA", coverage: "full", surface: "AgentRuns · Story pane" },
  { id: "task_generator", label: "Task Generator", family: "gateway", icon: ListTodo, hue: "#909094", coverage: "full", surface: "AgentRuns · Task pane" },
  { id: "sprint_planner", label: "Sprint Planner", family: "gateway", icon: CalendarRange, hue: "#818188", coverage: "partial", surface: "AgentRuns · Sprint pane" },
  { id: "scrum_master", label: "Scrum Master", family: "gateway", icon: Users, hue: "#71717A", coverage: "full", surface: "AgentRuns · Scrum pane" },
  { id: "task_executor", label: "Task Executor", family: "gateway", icon: Terminal, hue: "#62626A", coverage: "full", surface: "AgentRuns · Executor pane" },
  { id: "gateway_integration", label: "Initiative Integration", family: "gateway", icon: Plug, hue: "#52525B", coverage: "partial", surface: "AgentRuns · Integration pane" },

  { id: "security_engineer", label: "Security Engineer", family: "review", icon: ShieldCheck, hue: "#A1A1AA", coverage: "minimal", surface: "Generic Bot node" },
];

export const ORG_ROLE_COUNT = 25;
export const PLAYBOOK_COUNT = 10;
export const PROMPT_TEMPLATE_COUNT = 19;

export function coverageStats(skills: SkillVisual[] = SKILL_VISUALS) {
  const counts = { full: 0, partial: 0, minimal: 0, none: 0, total: skills.length };
  for (const s of skills) counts[s.coverage] += 1;
  return counts;
}
