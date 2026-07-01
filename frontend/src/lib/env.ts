// Single source of truth for "is a real backend wired up".
// Leave VITE_WS_URL unset to run the whole app off mock data/events —
// no API, DB, or WebSocket server required.
export const LIVE_MODE = Boolean(import.meta.env.VITE_WS_URL)
