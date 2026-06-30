import { useParams, Link } from "react-router-dom";
import { Zap } from "lucide-react";

export default function WorkspacePlaceholder() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div className="min-h-screen bg-base flex flex-col items-center justify-center gap-4 text-center p-6">
      <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
        <Zap size={18} className="text-white" aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-medium text-ink">
          Workspace{projectId ? ` — ${projectId}` : ""}
        </p>
        <p className="text-xs text-muted mt-1">Build step 4 wires this up.</p>
      </div>
      <Link
        to="/"
        className="text-xs text-accent hover:text-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded underline-offset-2 hover:underline"
      >
        Back to projects
      </Link>
    </div>
  );
}
