export interface WsLocationLike {
  hostname: string
  protocol: string
  host: string
}

/**
 * Resolve the base WebSocket URL for API socket connections.
 *
 * Precedence:
 * 1. Explicit `VITE_WS_URL` when non-empty (trailing slashes stripped).
 * 2. In browser contexts on `localhost` / `127.0.0.1`, default to `ws://localhost:8000`.
 * 3. In production/non-local browser contexts, derive `wss://` or `ws://` from `window.location`.
 * 4. Non-browser fallback (`ws://localhost:8000`).
 */
export function resolveWsBaseUrl(
  envWsUrl: string | undefined = import.meta.env.VITE_WS_URL,
  loc: WsLocationLike | undefined = typeof window !== 'undefined' ? window.location : undefined,
): string {
  const configured = envWsUrl?.trim()
  if (configured) {
    return configured.replace(/\/+$/, '')
  }

  if (loc) {
    if (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1') {
      return 'ws://localhost:8000'
    }
    const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${loc.host}`
  }

  return 'ws://localhost:8000'
}
