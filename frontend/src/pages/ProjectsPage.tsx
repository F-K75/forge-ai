import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Send } from "lucide-react";
import { PROJECTS, STARTERS, type Project as MockProject } from "../lib/mockData";
import { agentById } from "../lib/agents";
import { getIcon } from "../lib/iconMap";
import { LIVE_MODE } from "../lib/env";
import { projectsApi } from "../lib/api";
import { formatRelativeTime } from "../lib/format";

function toDisplayProject(raw: any): MockProject {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || "",
    agents: [],
    qaScore: NaN,
    lastBuilt: formatRelativeTime(raw.updated_at ?? raw.created_at),
    live: Boolean(raw.deployed_url),
  };
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [liveProjects, setLiveProjects] = useState<MockProject[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!LIVE_MODE) return;
    let cancelled = false;
    projectsApi
      .list()
      .then((data: any[]) => {
        if (!cancelled) setLiveProjects(data.map(toDisplayProject));
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load projects");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const projects = LIVE_MODE ? liveProjects ?? [] : PROJECTS;

  const handleBuild = async (initialPrompt?: string, template?: string) => {
    const trimmed = (initialPrompt ?? prompt).trim();

    if (!LIVE_MODE) {
      navigate("/build/new", trimmed ? { state: { prompt: trimmed, template } } : undefined);
      return;
    }

    setCreating(true);
    try {
      const name = trimmed ? trimmed.slice(0, 60) : "Untitled project";
      const project = await projectsApi.create({ name, description: trimmed, template });
      navigate(`/build/${project.id}`, trimmed ? { state: { prompt: trimmed } } : undefined);
    } catch {
      toast.error("Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <header className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-ink">Projects</h1>
          <p className="text-sm text-muted mt-0.5">{projects.length} apps built this month</p>
        </div>
        <button
          onClick={() => handleBuild("")}
          disabled={creating}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base transition-colors motion-reduce:transition-none shrink-0 disabled:opacity-50"
        >
          <Plus size={14} aria-hidden="true" />
          New project
        </button>
      </header>

      {/* Prompt hero */}
      <section
        aria-label="Build a new app"
        className="mb-8 rounded-xl bg-gradient-to-br from-accent/[0.08] to-panel-alt border border-border p-5 md:p-6"
      >
        <h2 className="text-base font-semibold text-ink mb-0.5">What do you want to build?</h2>
        <p className="text-sm text-muted mb-4">Describe your app and Forge builds it end-to-end.</p>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleBuild()}
            placeholder="A SaaS app that tracks habits with streaks…"
            className="flex-1 bg-base border border-border rounded-lg px-4 py-2.5 text-sm text-ink placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-accent min-w-0"
            aria-label="Describe your app"
          />
          <button
            onClick={() => handleBuild()}
            disabled={creating}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors motion-reduce:transition-none shrink-0 disabled:opacity-50"
          >
            <Send size={13} aria-hidden="true" />
            {creating ? "Creating…" : "Build"}
          </button>
        </div>

        {/* Starter chips */}
        <div className="flex flex-wrap gap-2" role="list" aria-label="Starter templates">
          {STARTERS.map(starter => {
            const Icon = getIcon(starter.iconName);
            return (
              <button
                key={starter.label}
                role="listitem"
                onClick={() => handleBuild(starter.label, starter.label)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-border-soft hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors motion-reduce:transition-none"
                style={{ color: starter.hue, background: `${starter.hue}14` }}
              >
                <Icon size={11} aria-hidden="true" />
                {starter.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Recent projects */}
      <section aria-label="Recent projects">
        <h2 className="text-xs font-medium text-faint uppercase tracking-wide mb-3">Recent</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/build/${project.id}`)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

type Project = MockProject;

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <article>
      <button
        onClick={onClick}
        className="w-full text-left p-4 rounded-xl bg-panel border border-border hover:border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent transition-colors motion-reduce:transition-none"
      >
        {/* Name row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${
                project.live ? "bg-ok" : "bg-faint"
              }`}
              aria-label={project.live ? "Live" : "Idle"}
            />
            <span className="font-mono text-sm text-ink truncate">{project.name}</span>
          </div>
          <span className="text-[11px] text-faint shrink-0">{project.lastBuilt}</span>
        </div>

        {/* Description */}
        <p className="text-xs text-muted mb-3 line-clamp-2">{project.description}</p>

        {/* Footer */}
        <div className="flex items-center justify-between">
          {/* Agent avatar cluster */}
          <div className="flex -space-x-1.5" aria-label="Agents involved">
            {project.agents.map(agentId => {
              const agent = agentById(agentId);
              if (!agent) return null;
              return (
                <span
                  key={agentId}
                  title={agent.label}
                  className="w-5 h-5 rounded-full border-2 border-panel flex items-center justify-center text-[7px] font-bold"
                  style={{ background: agent.hue, color: "#0A0A0F" }}
                >
                  {agent.label[0]}
                </span>
              );
            })}
          </div>

          {/* QA score */}
          <span className="font-mono text-xs text-muted">
            QA <span className="text-ink">{Number.isFinite(project.qaScore) ? project.qaScore : "—"}</span>
          </span>
        </div>
      </button>
    </article>
  );
}
