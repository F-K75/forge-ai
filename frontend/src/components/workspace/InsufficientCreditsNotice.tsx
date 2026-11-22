import { useId } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import type { InsufficientCredits } from "../../lib/insufficientCredits";

interface Props {
  info: InsufficientCredits;
  /** The account balance from the profile, used only when the server didn't report `available`. */
  balance?: number | null;
  onDismiss: () => void;
}

const fmt = (n: number) => `${n.toLocaleString()} credit${n === 1 ? "" : "s"}`;

/**
 * Shown when POST /v1/builds/ answers 402 (B1-9): how many credits the build
 * needs, how many are available and what makes up the requirement, exactly
 * as the server reports them.
 */
export function InsufficientCreditsNotice({ info, balance, onDismiss }: Props) {
  const headingId = useId();
  const available = info.available ?? (info.isCreditShortfall ? balance ?? null : null);
  const availableFromProfile = info.available === null && available !== null;
  const shortfall = info.required !== null && available !== null ? Math.max(0, info.required - available) : null;
  const breakdownTotal = info.breakdown.reduce((sum, b) => sum + b.credits, 0);

  return (
    <section
      role="alert"
      aria-labelledby={headingId}
      data-testid="insufficient-credits"
      className="rounded-xl border border-warn/40 bg-panel p-4 shadow-apple font-sans text-ink"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h2 id={headingId} className="text-sm font-semibold">
              {info.isCreditShortfall ? "Not enough credits to start this build" : "Payment required"}
            </h2>
            <p className="mt-0.5 text-xs text-muted">{info.message}</p>
          </div>

          {info.isCreditShortfall && (
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-panel-alt px-3 py-2">
                <dt className="text-muted">Required</dt>
                <dd className="mt-0.5 font-mono font-semibold tabular-nums" data-testid="credits-required">
                  {info.required !== null ? fmt(info.required) : "Not reported"}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-panel-alt px-3 py-2">
                <dt className="text-muted">{availableFromProfile ? "Your balance" : "Available"}</dt>
                <dd className="mt-0.5 font-mono font-semibold tabular-nums" data-testid="credits-available">
                  {available !== null ? fmt(available) : "Not reported"}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-panel-alt px-3 py-2">
                <dt className="text-muted">Short by</dt>
                <dd className="mt-0.5 font-mono font-semibold tabular-nums" data-testid="credits-shortfall">
                  {shortfall !== null ? fmt(shortfall) : "—"}
                </dd>
              </div>
            </dl>
          )}

          {info.breakdown.length > 0 && (
            <div className="text-xs">
              <h3 className="font-medium text-ink">What this build reserves</h3>
              <ul className="mt-1.5 divide-y divide-border rounded-lg border border-border" aria-label="Credit breakdown">
                {info.breakdown.map((b, i) => (
                  <li key={`${b.label}-${i}`} className="flex items-center justify-between gap-3 px-3 py-1.5">
                    <span className="text-muted">{b.label}</span>
                    <span className="font-mono tabular-nums">{fmt(b.credits)}</span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 bg-panel-alt px-3 py-1.5 font-medium">
                  <span>Total</span>
                  <span className="font-mono tabular-nums">{fmt(info.required ?? breakdownTotal)}</span>
                </li>
              </ul>
            </div>
          )}

          {info.isCreditShortfall && info.required === null && (
            <p className="text-xs text-muted">The server didn’t report how many credits this build needs.</p>
          )}

          <div className="flex items-center gap-2">
            <Link
              to="/billing"
              className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-ember-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base"
            >
              {info.isCreditShortfall ? "Buy credits" : "View plans"}
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss credit notice"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-panel text-muted hover:bg-panel-alt hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
