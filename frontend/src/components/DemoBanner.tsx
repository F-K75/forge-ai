import { LIVE_MODE, PUBLIC_DEMO_APP_URL } from "../lib/env";

/**
 * Shown whenever the app runs on sample data (no backend). Demo screens show
 * numbers like credit balances, passing tests and active agents; without this
 * a visitor could read them as real usage.
 *
 * `variant="pill"` is the quiet form used in the Forge OS top bar.
 */
export function DemoBanner({ variant = "bar" }: { variant?: "bar" | "pill" } = {}) {
  if (LIVE_MODE) return null;
  if (variant === "pill") {
    return (
      <span
        role="status"
        aria-label="Demo notice: sample data, nothing here is real"
        title="Demo with sample data: nothing here is real."
        className="hidden h-6 items-center rounded-pill bg-accent/[0.12] px-2.5 text-2xs font-medium text-accent sm:inline-flex"
      >
        Demo
      </span>
    );
  }
  return (
    <div
      role="status"
      aria-label="Demo notice"
      className="fixed bottom-0 inset-x-0 z-[1000] border-t-2 border-transparent bg-accent/[0.12] text-accent"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-mono font-semibold">
        <span>Demo with sample data: nothing here is real.</span>
        {PUBLIC_DEMO_APP_URL && (
          <a
            href={`${PUBLIC_DEMO_APP_URL}/signup`}
            className="px-3 py-1 border border-border bg-ink text-on-ink hover:bg-ink/5 hover:text-ink"
          >
            Sign up free →
          </a>
        )}
      </div>
    </div>
  );
}
