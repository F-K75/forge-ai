import * as Sentry from "@sentry/react"

// Mirrors the backend's pattern (core/config.py's sentry_dsn / main.py):
// gracefully does nothing when unset, rather than requiring it. Previously
// the frontend had zero error tracking at all (INF-006) -- unhandled
// exceptions here were invisible unless a user happened to report them.
const dsn = import.meta.env.VITE_SENTRY_DSN

export function initSentry() {
  if (!dsn) return
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}
