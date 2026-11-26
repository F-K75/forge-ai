import { ExternalLink, Code2, X, CheckCircle2 } from "lucide-react";

interface ForgeMomentCardProps {
  title?: string;
  filesChangedCount?: number;
  testsPassedCount?: number;
  onOpenPreview: () => void;
  onInspectCode?: () => void;
  onDismiss?: () => void;
}

export function ForgeMomentCard({
  title = "Authentication & Billing",
  filesChangedCount = 12,
  testsPassedCount = 42,
  onOpenPreview,
  onInspectCode,
  onDismiss,
}: ForgeMomentCardProps) {
  return (
    <div className="relative w-full max-w-md mx-auto rounded-xl bg-panel border border-border p-6 shadow-apple-lg select-none text-ink">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-4 right-4 w-7 h-7 rounded-md border border-border bg-panel-alt text-muted hover:text-ink hover:bg-base flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
          aria-label="Dismiss completion card"
        >
          <X size={14} />
        </button>
      )}

      {/* Status Label */}
      <div className="flex items-center gap-2 text-xs font-mono text-ok mb-2">
        <CheckCircle2 size={14} />
        <span>Synthesis Complete</span>
      </div>

      {/* Artifact Title */}
      <h3 className="font-display text-lg font-semibold text-ink tracking-tight pr-8">
        {title}
      </h3>

      {/* Verification Summary */}
      <div className="my-5 py-4 border-y border-border space-y-2 text-xs font-mono tabular-nums">
        <div className="flex items-center justify-between">
          <span className="text-muted">Files synthesized</span>
          <span className="font-medium text-ink">{filesChangedCount} files</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Vitest verification</span>
          <span className="font-medium text-ok">{testsPassedCount} assertions passed</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted">Edge runtime preview</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-ok">
            <span className="w-1.5 h-1.5 rounded-full bg-ok" />
            Ready
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenPreview}
          className="w-full h-9 px-4 rounded-lg bg-accent hover:bg-ember-glow text-on-ink text-xs font-medium transition-colors duration-150 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
        >
          <span>Open Preview</span>
          <ExternalLink size={13} />
        </button>

        {onInspectCode && (
          <button
            type="button"
            onClick={onInspectCode}
            className="w-full h-9 px-4 rounded-lg border border-border bg-panel-alt hover:bg-base text-ink text-xs font-medium transition-colors duration-150 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 cursor-pointer"
          >
            <Code2 size={13} />
            <span>Inspect Changes</span>
          </button>
        )}
      </div>
    </div>
  );
}
