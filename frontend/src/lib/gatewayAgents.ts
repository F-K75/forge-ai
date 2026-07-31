import {
  FileStack,
  Scale,
  Palette,
  Layers,
  NotebookPen,
  ListChecks,
  ListTodo,
  CalendarRange,
  Users,
  Terminal,
  Plug,
  type LucideIcon,
} from "lucide-react";

export interface GatewayAgent {
  id:
    | "business_analyst"
    | "decision_engine"
    | "prd_writer"
    | "designer"
    | "epic_generator"
    | "story_generator"
    | "task_generator"
    | "sprint_planner"
    | "scrum_master"
    | "task_executor"
    | "integration";
  label: string;
  purpose: string;
  icon: LucideIcon;
  hue: string;
  stage: "Discovery" | "Definition" | "Planning" | "Execution";
}

// Backend AI Gateway runtime agents (backend/agents/*.py). Distinct from the
// build-pipeline AGENTS in lib/agents.ts — that set drives the 6-node
// architect/developer/... pipeline visualization; this set drives the
// per-agent run view (AgentRunShell + panes/).
export const GATEWAY_AGENTS: GatewayAgent[] = [
  { id: "business_analyst", label: "Business Analyst", purpose: "Turns a raw ask into a scoped brief — problem, users, assumptions, risks", icon: FileStack, hue: "#0071E3", stage: "Discovery" },
  { id: "decision_engine", label: "Decision Engine", purpose: "Scores competing options against weighted criteria and recommends one", icon: Scale, hue: "#5E5CE6", stage: "Discovery" },
  { id: "prd_writer", label: "PRD Writer", purpose: "Renders the approved brief into a structured, section-numbered PRD", icon: NotebookPen, hue: "#BF5AF2", stage: "Definition" },
  { id: "designer", label: "Designer", purpose: "Proposes screen-level layout options as low-fi frames for a requirement", icon: Palette, hue: "#FF375F", stage: "Definition" },
  { id: "epic_generator", label: "Epic Generator", purpose: "Breaks the PRD into epics sized for a quarter, each with a story estimate", icon: Layers, hue: "#FF9F0A", stage: "Planning" },
  { id: "story_generator", label: "Story Generator", purpose: "Expands one epic into user stories with acceptance criteria", icon: ListChecks, hue: "#30D158", stage: "Planning" },
  { id: "task_generator", label: "Task Generator", purpose: "Decomposes a story into engineering-sized tasks with estimates and dependencies", icon: ListTodo, hue: "#64D2FF", stage: "Planning" },
  { id: "sprint_planner", label: "Sprint Planner", purpose: "Fits estimated tasks into the next sprint against team capacity", icon: CalendarRange, hue: "#AC8E68", stage: "Planning" },
  { id: "scrum_master", label: "Scrum Master", purpose: "Runs standup: rolls up progress, surfaces blockers, drafts the summary", icon: Users, hue: "#0A84FF", stage: "Execution" },
  { id: "task_executor", label: "Task Executor", purpose: "Executes a task in the sandbox and streams the run as it happens", icon: Terminal, hue: "#FFD60A", stage: "Execution" },
  { id: "integration", label: "Integration", purpose: "Opens the PR, links external systems, and confirms downstream sync", icon: Plug, hue: "#FF453A", stage: "Execution" },
];

export const gatewayAgentById = (id: string): GatewayAgent | undefined =>
  GATEWAY_AGENTS.find((a) => a.id === id);
