import { LIVE_MODE, PUBLIC_DEMO_APP_URL } from "../lib/env";

/**
 * Shown whenever the app runs on sample data (no backend). Demo screens show
 * numbers like credit balances, passing tests and active agents; without this
 * a visitor could read them as real usage.
 */
export function DemoBanner() {
  if (LIVE_MODE) return null;
  return (
    <div
      role="status"
      aria-label="Demo notice"
      className="fixed bottom-0 inset-x-0 z-[1000] border-t-2 border-black bg-brutal-yellow text-black"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-mono font-bold">
        <span>Demo with sample data: nothing here is real.</span>
        {PUBLIC_DEMO_APP_URL && (
          <a
            href={`${PUBLIC_DEMO_APP_URL}/signup`}
            className="px-3 py-1 border-2 border-black bg-black text-white hover:bg-white hover:text-black"
          >
            Sign up free →
          </a>
        )}
      </div>
    </div>
  );
}
