// Single source of truth for "is a real backend wired up".
// Leave VITE_WS_URL unset to run the whole app off mock data/events —
// no API, DB, or WebSocket server required.
export const LIVE_MODE = Boolean(import.meta.env.VITE_WS_URL)

// Set only on the public demo build (.github/workflows/deploy-cloudflare.yml):
// the real app's URL. The demo has no backend, so its sign-in and sign-up
// buttons send visitors there instead.
export const PUBLIC_DEMO_APP_URL: string = (import.meta.env.VITE_PUBLIC_DEMO_APP_URL || "").replace(/\/$/, "")
export const IS_PUBLIC_DEMO = !LIVE_MODE && Boolean(PUBLIC_DEMO_APP_URL)

// Demo sign-in shortcuts ("Sign in as Admin", "Auto-fill Demo" and the
// sign-up "Auto-fill test account" button). They fill in well-known demo
// credentials, so they belong only in mock-data demo builds. A live build hides
// them unless VITE_ENABLE_DEMO_LOGIN=true is set explicitly (for example on a
// staging stack seeded with the demo accounts).
export const DEMO_LOGIN_ENABLED: boolean =
  !LIVE_MODE || import.meta.env.VITE_ENABLE_DEMO_LOGIN === "true"

// Forge OS shell (docs/os/PHASE2_DECISIONS.md #2). On by default: signed-in
// users land on the prompt-first workspace at /os. Set VITE_OS_SHELL=false to
// restore the classic sidebar shell with the Command Center as home.
export const OS_SHELL_ENABLED: boolean = import.meta.env.VITE_OS_SHELL !== "false"
