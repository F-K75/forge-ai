import type { Project } from "./mockData";

// Shape returned by the backend's GET/POST /projects endpoints
// (backend/models/project.py). Only the fields the UI reads are listed.
export interface ApiProject {
  id: string;
  name: string;
  description?: string | null;
  template?: string | null;
  tech_stack?: Record<string, unknown> | string[] | null;
  deployed_url?: string | null;
  github_repo?: string | null;
  created_at?: string;
  updated_at?: string;
}

// The backend serialises naive UTC datetimes without a zone suffix; without
// one, `new Date()` would parse them as local time.
function asUtc(ts?: string): string {
  if (!ts) return "";
  return /([zZ]|[+-]\d\d:?\d\d)$/.test(ts) ? ts : `${ts}Z`;
}

function techStackList(raw: ApiProject["tech_stack"]): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  return Object.values(raw)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

/**
 * Convert a backend project into the UI's Project shape.
 *
 * The UI type carries several presentational fields (qaScore, agents, live)
 * that the backend doesn't track. They're filled with neutral values so a
 * freshly created project doesn't claim to be "live" or "99% QA" before a
 * single build has run.
 */
export function fromApiProject(p: ApiProject): Project {
  return {
    id: p.id,
    name: p.name,
    displayName: p.name,
    description: p.description || "",
    template: p.template || undefined,
    techStack: techStackList(p.tech_stack),
    agents: [],
    qaScore: 0,
    lastBuilt: asUtc(p.updated_at || p.created_at),
    live: Boolean(p.deployed_url),
    status: p.deployed_url ? "live" : "draft",
  };
}
