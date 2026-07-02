import { Monitor, Loader2, ShieldCheck } from "lucide-react";
import { useBuildStore } from "../../store/buildStore";

export function PreviewPanel() {
  const status = useBuildStore((s) => s.status);
  const qaScore = useBuildStore((s) => s.qaScore);
  const validation = useBuildStore((s) => s.validation);

  return (
    <aside className="w-72 shrink-0 hidden lg:flex flex-col bg-panel" aria-label="Preview">
      <div className="px-4 py-3 border-b border-border-soft">
        <h2 className="text-xs font-medium uppercase tracking-wider text-faint">Preview</h2>
      </div>

      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        {status === "running" || status === "debugging" ? (
          <>
            <Loader2 size={20} className="text-accent animate-spin motion-reduce:animate-none" aria-hidden="true" />
            <p className="text-xs text-muted">Agents are building your app…</p>
          </>
        ) : status === "complete" ? (
          <>
            <div className="w-10 h-10 rounded-lg bg-accent-soft flex items-center justify-center">
              <ShieldCheck size={18} className="text-accent" aria-hidden="true" />
            </div>
            {typeof qaScore === "number" && (
              <p className="text-sm text-ink font-medium">QA score {qaScore}/100</p>
            )}
            {Array.isArray(validation?.missing_features) && validation.missing_features.length > 0 && (
              <ul className="text-xs text-warn space-y-1">
                {validation.missing_features.slice(0, 4).map((f) => (
                  <li key={f}>missing: {f}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-faint">
              Live preview sandboxes are coming soon — sync to GitHub or deploy from the project page.
            </p>
          </>
        ) : (
          <>
            <Monitor size={20} className="text-faint" aria-hidden="true" />
            <p className="text-xs text-faint">The preview appears once a build completes.</p>
          </>
        )}
      </div>
    </aside>
  );
}
