import { ArrowLeft, Hammer } from "lucide-react";
import { Link } from "react-router-dom";
import { useBuildStore } from "../../store/buildStore";
import { StatusPill } from "../StatusPill";
import { DeployButton } from "./DeployButton";

export function TopBar({ projectName, projectId }: { projectName: string; projectId: string }) {
  const status = useBuildStore((s) => s.status);
  const prompt = useBuildStore((s) => s.prompt);

  return (
    <header className="h-12 shrink-0 flex items-center gap-3 px-3 bg-panel border-b border-border">
      <Link
        to="/projects"
        aria-label="Back to projects"
        className="p-1.5 rounded-md text-muted hover:text-ink hover:bg-panel-alt transition-colors"
      >
        <ArrowLeft size={16} aria-hidden="true" />
      </Link>

      <div className="w-6 h-6 rounded-md bg-accent-soft flex items-center justify-center shrink-0">
        <Hammer size={13} className="text-accent" aria-hidden="true" />
      </div>

      <div className="min-w-0 flex items-center gap-2.5">
        <h1 className="text-sm font-medium text-ink truncate">{projectName}</h1>
        {status !== "idle" && <StatusPill status={status} />}
      </div>

      {prompt && (
        <p className="ml-4 flex-1 text-xs text-faint truncate hidden md:block" title={prompt}>
          {prompt}
        </p>
      )}

      <div className="ml-auto shrink-0">
        <DeployButton projectId={projectId} />
      </div>
    </header>
  );
}
