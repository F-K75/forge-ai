import { useMemo } from "react";
import { LIVE_MODE } from "../lib/env";
import { PROJECTS, getCustomProjects } from "../lib/mockData";
import { useActiveProject } from "./useActiveProject";

export interface SwitcherProject {
  id: string;
  name: string;
  description: string;
}

export const DEMO_CORE_PROJECT: SwitcherProject = {
  id: "demo-project",
  name: "Forge Core Engine",
  description: "Autonomous multi-agent engineering platform",
};

/** Projects the workspace switcher lists: real ones in live mode, the demo catalogue otherwise. */
export function useSwitcherProjects(): SwitcherProject[] {
  const { projects } = useActiveProject();
  return useMemo(() => {
    if (LIVE_MODE) {
      return projects.map((p) => ({
        id: p.id,
        name: p.displayName || p.name,
        description: p.description,
      }));
    }
    const seen = new Set<string>();
    return [DEMO_CORE_PROJECT, ...getCustomProjects(), ...PROJECTS]
      .filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      })
      .map((p) => ({ id: p.id, name: p.name, description: p.description }));
  }, [projects]);
}

/** Human name for a project id, using the switcher catalogue. */
export function projectNameFrom(projects: SwitcherProject[], id: string | null | undefined) {
  if (!id) return null;
  return projects.find((p) => p.id === id)?.name ?? id;
}
