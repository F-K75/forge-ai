/**
 * Fixture replayer for the OS stream (until WS-C's `/v1/os/*` backend is live).
 *
 * `createFixtureFetch(events)` is a fake `fetch` that serves the given events
 * as an SSE stream, honouring `?after_seq=` / `Last-Event-ID` exactly like the
 * real endpoint. Plug it into `createOsStreamClient({ fetch })` so the shell
 * and tests exercise the real client (validation, resume, fan-out).
 *
 * `createFixtureSubscribe(events)` is that wiring in one call: a ready-made
 * `SubscribeSession` for WS-A's local fakes.
 *
 * Events are usually `shared/os-schemas/examples/os-event.examples.json`'s
 * `valid` list. They are served verbatim (including any invalid ones you mix
 * in), so the client's validation path is exercised too.
 */
import type { OsId, SubscribeSession } from "../contracts"
import { createOsStreamClient, type OsStreamClientOptions, type StreamFetch } from "./osStreamClient"

export interface FixtureFetchOptions {
  /** Delay between frames (ms). 0 = all frames in the first chunk. */
  frameDelayMs?: number
  /** Close the response after this many frames (to exercise resume). Applies to the first N connections. */
  dropAfterFrames?: number
  dropConnections?: number
  /** Keep the response open after the last frame (like a live tail). Default true. */
  hold?: boolean
  /** Fail the first N requests with this status before serving. */
  failFirst?: { count: number; status: number }
  /** Raw SSE text inserted before the event frames (garbage / attack frames for tests). */
  prelude?: string
  /** Observe each request (url + headers). */
  onRequest?: (url: string, headers: Record<string, string>) => void
}

/** Serialise one payload as the backend's `os_event_to_sse` does. */
export function toSseFrame(event: unknown): string {
  const e = event as { seq?: unknown; type?: unknown }
  const lines: string[] = []
  if (typeof e?.seq === "number") lines.push(`id: ${e.seq}`)
  if (typeof e?.type === "string") lines.push(`event: ${e.type}`)
  lines.push(`data: ${JSON.stringify(event)}`)
  return lines.join("\n") + "\n\n"
}

function afterSeqOf(url: string, headers: Record<string, string>): number {
  const q = /[?&]after_seq=(\d+)/.exec(url)
  const fromQuery = q ? Number(q[1]) : 0
  const fromHeader = Number(headers["Last-Event-ID"] ?? 0) || 0
  return Math.max(fromQuery, fromHeader)
}

function sessionOf(url: string): string | null {
  const m = /\/sessions\/([^/?]+)\/stream/.exec(url)
  return m ? decodeURIComponent(m[1]) : null
}

export function createFixtureFetch(events: readonly unknown[], opts: FixtureFetchOptions = {}): StreamFetch & { requests: number } {
  const encoder = new TextEncoder()
  let requests = 0
  let failures = 0
  let drops = 0
  const fetchImpl = (async (url, init) => {
    requests += 1
    fetchImpl.requests = requests
    opts.onRequest?.(url, init.headers)
    if (opts.failFirst && failures < opts.failFirst.count) {
      failures += 1
      return { ok: false, status: opts.failFirst.status, body: null }
    }
    const after = afterSeqOf(url, init.headers)
    const session = sessionOf(url)
    const selected = events.filter((ev) => {
      const e = ev as { seq?: unknown; session_id?: unknown }
      if (session !== null && typeof e?.session_id === "string" && e.session_id !== session) return false
      // Non-numeric seqs are malformed payloads: always serve them so validation sees them.
      return typeof e?.seq !== "number" || e.seq > after
    })
    const chunks: string[] = []
    if (opts.prelude && requests - failures === 1) chunks.push(opts.prelude)
    let frames = selected.map(toSseFrame)
    const drop = opts.dropAfterFrames !== undefined && drops < (opts.dropConnections ?? 1)
    if (drop) {
      drops += 1
      frames = frames.slice(0, opts.dropAfterFrames)
    }
    chunks.push(...frames)
    const delay = opts.frameDelayMs ?? 0
    let index = 0
    const signal = init.signal
    const reader = {
      read: () =>
        new Promise<{ value?: Uint8Array; done: boolean }>((resolve, reject) => {
          if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"))
          const onAbort = () => reject(new DOMException("Aborted", "AbortError"))
          signal.addEventListener("abort", onAbort, { once: true })
          const emit = () => {
            signal.removeEventListener("abort", onAbort)
            if (index < chunks.length) {
              if (delay === 0 && index === 0) {
                const all = chunks.join("")
                index = chunks.length
                resolve({ value: encoder.encode(all), done: false })
              } else {
                resolve({ value: encoder.encode(chunks[index++]), done: false })
              }
            } else if (drop || opts.hold === false) {
              resolve({ done: true })
            } else {
              // Live tail: stay open until aborted.
              signal.addEventListener("abort", onAbort, { once: true })
            }
          }
          if (index < chunks.length && delay > 0) setTimeout(emit, delay)
          else emit()
        }),
      cancel: async () => undefined,
    }
    return { ok: true, status: 200, body: { getReader: () => reader } }
  }) as StreamFetch & { requests: number }
  fetchImpl.requests = 0
  return fetchImpl
}

/** A `SubscribeSession` that replays fixture events through the real client. */
export function createFixtureSubscribe(
  events: readonly unknown[],
  opts: FixtureFetchOptions & Pick<OsStreamClientOptions, "heartbeatTimeoutMs" | "backoff"> = {}
): SubscribeSession {
  const client = createOsStreamClient({
    baseUrl: "http://fixture.local",
    fetch: createFixtureFetch(events, opts),
    getAuthToken: () => null,
    heartbeatTimeoutMs: opts.heartbeatTimeoutMs ?? 60 * 60 * 1000,
    backoff: opts.backoff,
  })
  return (sessionId: OsId, handlers, afterSeq) => client.subscribeSession(sessionId, handlers, afterSeq)
}
