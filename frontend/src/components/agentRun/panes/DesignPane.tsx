import { RunSectionLabel } from "../AgentRunShell";
import { motion } from "motion/react";
import { useReducedMotion } from "motion/react";

export function DesignPane({ design }: { design: Record<string, any> }) {
  const reduceMotion = useReducedMotion();
  const theme = design?.theme || {};
  const layout = design?.layout || {};
  const components = design?.components || {};
  const notes = design?.design_notes || "";

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="space-y-4"
    >
      {(Object.keys(theme).length > 0 || Object.keys(layout).length > 0) && (
        <div>
          <RunSectionLabel>Theme & layout</RunSectionLabel>
          <div className="flex flex-wrap gap-2">
            {Object.entries(theme).map(([key, value]) => (
              <span key={key} className="rounded-lg border border-border bg-panel-alt px-2.5 py-1 text-[11px] text-muted">
                <span className="text-faint">{key}:</span> {String(value)}
              </span>
            ))}
            {Object.entries(layout).map(([key, value]) => (
              <span key={key} className="rounded-lg border border-border bg-panel-alt px-2.5 py-1 text-[11px] text-muted">
                <span className="text-faint">{key}:</span> {String(value)}
              </span>
            ))}
          </div>
        </div>
      )}

      {Object.keys(components).length > 0 && (
        <div>
          <RunSectionLabel>Components</RunSectionLabel>
          <div className="space-y-2">
            {Object.entries(components).map(([name, spec]) => (
              <div key={name} className="rounded-lg border border-border bg-panel-alt p-3">
                <p className="text-xs font-semibold text-ink">{name}</p>
                {typeof spec === "object" && spec !== null ? (
                  <pre className="mt-1 whitespace-pre-wrap text-[10.5px] text-muted">
                    {JSON.stringify(spec, null, 2)}
                  </pre>
                ) : (
                  <p className="mt-1 text-[10.5px] text-muted">{String(spec)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {notes && (
        <div>
          <RunSectionLabel>Design notes</RunSectionLabel>
          <p className="text-xs text-muted leading-relaxed">{notes}</p>
        </div>
      )}

      {!Object.keys(theme).length && !Object.keys(components).length && !notes && (
        <p className="text-xs text-faint">No design output yet.</p>
      )}
    </motion.div>
  );
}
