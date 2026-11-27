import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";

// Mirrors backend agents/structured_schemas.py PM_VALIDATION_SCHEMA.
export interface QaIssue {
  severity?: "critical" | "high" | "medium" | "low" | string;
  description?: string;
  file?: string;
  suggestion?: string;
}

export interface QaValidation {
  passed?: boolean;
  score?: number;
  missing_features?: string[];
  issues?: QaIssue[];
  summary?: string;
}

interface Props {
  buildStatus: "idle" | "running" | "debugging" | "complete" | "failed";
  hasBuild: boolean;
  validation: QaValidation | null;
  debugIterations: number;
  debugErrors: string[];
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-error text-on-ink",
  high: "bg-error/10 text-error ",
  medium: "bg-warn/10 text-warn ",
  low: "bg-panel-alt text-ink ",
};

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-2 p-8 text-center font-mono">
      <p className="text-sm font-semibold uppercase text-ink">{title}</p>
      <p className="max-w-md text-xs text-muted">{body}</p>
    </div>
  );
}

/**
 * QA tab for live mode: the PM agent's real validation of the latest build
 * (score, pass/fail, issues, missing features) plus the debug loop's state.
 */
export function LiveQaSurface({ buildStatus, hasBuild, validation, debugIterations, debugErrors }: Props) {
  if (!hasBuild) {
    return (
      <Empty
        title="No QA results yet"
        body="Run a build from the command deck below. The PM agent validates the generated code against your spec, and its results appear here."
      />
    );
  }

  const inProgress = buildStatus === "running" || buildStatus === "debugging";

  if (!validation) {
    return inProgress ? (
      <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-3 font-mono text-xs text-muted">
        <Loader2 size={18} className="animate-spin" />
        <span>Build in progress — QA validation runs after code generation.</span>
      </div>
    ) : (
      <Empty
        title={buildStatus === "failed" ? "Build failed before QA ran" : "No QA results for this build"}
        body={
          buildStatus === "failed"
            ? "The build stopped before the PM agent validated it. Check the agent logs below for the error."
            : "This build didn't record a validation result."
        }
      />
    );
  }

  const issues = validation.issues ?? [];
  const missing = validation.missing_features ?? [];
  const passed = validation.passed !== false;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 font-mono text-xs space-y-5 text-ink">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 border-2 border-border font-semibold uppercase ${
            passed ? "bg-ok text-on-ink" : "bg-error text-on-ink"
          }`}
        >
          {passed ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          {passed ? "Passed" : "Failed"}
        </span>
        {typeof validation.score === "number" && (
          <span className="px-3 py-1.5 border-2 border-border font-semibold">
            Score {Math.round(validation.score)}
          </span>
        )}
        <span className="px-3 py-1.5 border-2 border-border">
          {issues.length} issue{issues.length === 1 ? "" : "s"} · {missing.length} missing feature
          {missing.length === 1 ? "" : "s"}
        </span>
        {debugIterations > 0 && (
          <span className="inline-flex items-center gap-1 px-3 py-1.5 border-2 border-border">
            <RotateCcw size={12} /> {debugIterations} debug pass{debugIterations === 1 ? "" : "es"}
          </span>
        )}
        {inProgress && (
          <span className="inline-flex items-center gap-1 text-muted">
            <Loader2 size={12} className="animate-spin" /> re-validating…
          </span>
        )}
      </div>

      {validation.summary && <p className="text-sm leading-relaxed font-sans">{validation.summary}</p>}

      {missing.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold uppercase text-[11px] text-muted">Missing features</h3>
          <ul className="space-y-1.5">
            {missing.map((m, i) => (
              <li key={i} className="flex gap-2 p-2 border border-border bg-panel">
                <AlertTriangle size={13} className="shrink-0 text-warn mt-0.5" />
                <span className="font-sans text-sm">{m}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {issues.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold uppercase text-[11px] text-muted">Issues</h3>
          <ul className="space-y-2">
            {issues.map((issue, i) => (
              <li key={i} className="p-3 border border-border bg-panel space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      SEVERITY_STYLES[issue.severity ?? ""] ?? SEVERITY_STYLES.low
                    }`}
                  >
                    {issue.severity ?? "issue"}
                  </span>
                  {issue.file && <span className="text-muted break-all">{issue.file}</span>}
                </div>
                {issue.description && <p className="font-sans text-sm">{issue.description}</p>}
                {issue.suggestion && (
                  <p className="font-sans text-sm text-muted">Suggested fix: {issue.suggestion}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {passed && issues.length === 0 && missing.length === 0 && (
        <p className="text-muted">The PM agent found no issues or missing features.</p>
      )}

      {buildStatus === "debugging" && debugErrors.length > 0 && (
        <section className="space-y-2">
          <h3 className="font-semibold uppercase text-[11px] text-muted">Being fixed in this debug pass</h3>
          <ul className="space-y-1">
            {debugErrors.map((e, i) => (
              <li key={i} className="p-2 border border-border break-words">
                {e}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
