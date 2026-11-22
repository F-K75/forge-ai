import { useEffect, useId, useRef } from "react";
import { ByokDisclosure } from "../byok/ByokDisclosure";

interface Props {
  open: boolean;
  prompt: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Build-start confirmation for BYOK builds (plan §5.6 placement): the
 * disclosure is shown, and the build created, only after the user confirms.
 */
export function ByokBuildConfirmDialog({ open, prompt, onConfirm, onCancel }: Props) {
  const titleId = useId();
  const descId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/55" aria-hidden="true" onClick={onCancel} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full max-w-lg rounded-xl border border-border bg-panel p-6 font-sans text-ink shadow-apple-float"
      >
        <h2 id={titleId} className="font-display text-lg font-semibold tracking-tight">
          Start this build with your own key?
        </h2>
        <p id={descId} className="mt-1 text-sm text-muted">
          This build runs on the API key saved in your model settings.
        </p>
        <p className="mt-3 truncate rounded-md border border-border bg-panel-alt px-3 py-2 font-mono text-xs" title={prompt}>
          {prompt}
        </p>
        <ByokDisclosure className="mt-4" />
        <div className="mt-6 flex items-center justify-end gap-2.5 border-t border-border pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 items-center rounded-md border border-border bg-panel px-4 text-sm font-medium text-ink hover:bg-panel-alt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-ember-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base"
          >
            Start build
          </button>
        </div>
      </div>
    </div>
  );
}
