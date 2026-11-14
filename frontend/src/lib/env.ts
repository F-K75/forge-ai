// Single source of truth for "is a real backend wired up".
// Leave VITE_WS_URL unset to run the whole app off mock data/events —
// no API, DB, or WebSocket server required.
export const LIVE_MODE = Boolean(import.meta.env.VITE_WS_URL)

// Set only on the public demo build (.github/workflows/deploy-cloudflare.yml):
// the real app's URL. The demo has no backend, so its sign-in and sign-up
// buttons send visitors there instead.
export const PUBLIC_DEMO_APP_URL: string = (import.meta.env.VITE_PUBLIC_DEMO_APP_URL || "").replace(/\/$/, "")
export const IS_PUBLIC_DEMO = !LIVE_MODE && Boolean(PUBLIC_DEMO_APP_URL)
