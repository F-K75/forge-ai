/**
 * Forge OS session stream client (WS-B). Implements the `SubscribeSession`
 * seam from ../contracts.ts over `GET /v1/os/sessions/{id}/stream` (SSE).
 *
 * - fetch + ReadableStream reader (same approach as
 *   `kernelApi.subscribeAguiStream`), so Bearer headers and cookies both work.
 * - Resume: every (re)connect sends `Last-Event-ID: <lastSeq>` and
 *   `?after_seq=<lastSeq>`; frames with `seq <= lastSeq` are dropped, so a
 *   replay overlap is never applied twice.
 * - Backoff: exponential with jitter between attempts; reset after the first
 *   good frame on a connection. 400/401/403/404/410 are terminal ("closed").
 * - Heartbeat watchdog: if no bytes arrive for `heartbeatTimeoutMs` (server
 *   heartbeats every 15 s) the connection is torn down and resumed.
 * - Validation: every frame goes through `validateOsEvent`. Malformed JSON,
 *   schema failures, oversized frames and events for another session are
 *   passed to `onInvalid` and are never delivered to `onEvent`.
 * - Fan-out: subscribers to the same session share one connection. A late
 *   subscriber is caught up from a bounded replay buffer; if the buffer cannot
 *   cover its `afterSeq`, it gets a dedicated connection instead.
 *
 * Heartbeats are consumed here (watchdog + backoff reset) and not forwarded.
 */
import { api } from "../../lib/api"
import type { OsEvent, OsId, OsStreamHandlers, SubscribeSession } from "../contracts"
import { validateOsEvent } from "../validate"
import { createSseParser, DEFAULT_MAX_FRAME_BYTES, type SseFrame } from "./sse"

export type StreamStatus = "connecting" | "open" | "reconnecting" | "closed"
export type StreamError = { path: string; message: string }

/** Minimal fetch surface the client needs (lets tests and the fixture replayer inject one). */
export type StreamFetch = (
  url: string,
  init: { method: "GET"; headers: Record<string, string>; credentials: "include"; signal: AbortSignal }
) => Promise<{
  ok: boolean
  status: number
  body: { getReader: () => { read: () => Promise<{ value?: Uint8Array; done: boolean }>; cancel?: () => Promise<void> } } | null
}>

export interface BackoffOptions {
  initialMs?: number
  maxMs?: number
  factor?: number
}

export interface OsStreamClientOptions {
  /** API origin; defaults to the axios client's baseURL. */
  baseUrl?: string
  fetch?: StreamFetch
  /** Bearer token source; defaults to localStorage `forge_access_token`. */
  getAuthToken?: () => string | null
  streamPath?: (sessionId: OsId) => string
  backoff?: BackoffOptions
  /** Injected for deterministic tests. */
  random?: () => number
  heartbeatTimeoutMs?: number
  maxFrameBytes?: number
  replayBufferSize?: number
}

export interface OsStreamClient {
  subscribeSession: SubscribeSession
  /** Number of open (or reconnecting) connections; for tests and diagnostics. */
  connectionCount: () => number
  /** Tear down every connection (tests, logout). */
  closeAll: () => void
}

export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 45_000
export const DEFAULT_BACKOFF: Required<BackoffOptions> = { initialMs: 500, maxMs: 30_000, factor: 2 }
const TERMINAL_STATUSES = new Set([400, 401, 403, 404, 410])

/** Delay before reconnect attempt `attempt` (0-based): "equal jitter" exponential backoff. */
export function backoffDelay(attempt: number, opts: Required<BackoffOptions>, random: () => number): number {
  const base = Math.min(opts.maxMs, opts.initialMs * Math.pow(opts.factor, Math.max(0, attempt)))
  return Math.round(base / 2 + random() * (base / 2))
}

function defaultToken(): string | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem("forge_access_token") : null
  } catch {
    return null
  }
}

function defaultBaseUrl(): string {
  return String(api.defaults.baseURL || "http://localhost:8000").replace(/\/$/, "")
}

interface Subscriber {
  handlers: OsStreamHandlers
  lastSeq: number
}

function safeCall(fn: () => void) {
  try {
    fn()
  } catch (err) {
    console.error("[os-stream] subscriber handler threw", err)
  }
}

class SessionConnection {
  readonly subscribers = new Set<Subscriber>()
  /** Highest seq delivered on this connection. */
  lastSeq: number
  /** The buffer holds every event with seq > bufferFloor. */
  private bufferFloor: number
  private buffer: OsEvent[] = []
  private status: StreamStatus = "connecting"
  private closed = false
  private controller: AbortController | null = null
  private attempt = 0
  private sleepTimer: ReturnType<typeof setTimeout> | null = null
  private wakeSleep: (() => void) | null = null
  private watchdog: ReturnType<typeof setTimeout> | null = null

  constructor(
    readonly sessionId: OsId,
    startSeq: number,
    private readonly cfg: ResolvedOptions,
    private readonly onDispose: (c: SessionConnection) => void
  ) {
    this.lastSeq = startSeq
    this.bufferFloor = startSeq
  }

  /** True when a subscriber starting after `afterSeq` can be fully caught up from the buffer. */
  covers(afterSeq: number): boolean {
    return !this.closed && afterSeq >= this.bufferFloor
  }

  add(sub: Subscriber) {
    this.subscribers.add(sub)
    safeCall(() => sub.handlers.onStatus?.(this.status))
    for (const event of this.buffer) {
      if (event.seq > sub.lastSeq) {
        sub.lastSeq = event.seq
        safeCall(() => sub.handlers.onEvent(event))
      }
    }
  }

  remove(sub: Subscriber) {
    this.subscribers.delete(sub)
    if (this.subscribers.size === 0) this.close(false)
  }

  start() {
    void this.run()
  }

  close(notify: boolean) {
    if (this.closed) return
    this.closed = true
    this.clearWatchdog()
    if (this.sleepTimer) clearTimeout(this.sleepTimer)
    this.wakeSleep?.()
    this.controller?.abort()
    if (notify) this.setStatus("closed")
    this.onDispose(this)
  }

  private setStatus(status: StreamStatus) {
    if (this.status === status) return
    this.status = status
    for (const sub of [...this.subscribers]) safeCall(() => sub.handlers.onStatus?.(status))
  }

  private invalid(raw: unknown, errors: StreamError[]) {
    for (const sub of [...this.subscribers]) safeCall(() => sub.handlers.onInvalid?.(raw, errors))
  }

  private async run() {
    let everOpened = false
    while (!this.closed) {
      this.setStatus(everOpened || this.attempt > 0 ? "reconnecting" : "connecting")
      const outcome = await this.connectOnce(() => {
        everOpened = true
      })
      if (this.closed) return
      if (outcome === "fatal") {
        this.close(true)
        return
      }
      this.setStatus("reconnecting")
      const delay = backoffDelay(this.attempt, this.cfg.backoff, this.cfg.random)
      this.attempt += 1
      await new Promise<void>((resolve) => {
        this.wakeSleep = resolve
        this.sleepTimer = setTimeout(resolve, delay)
      })
      this.wakeSleep = null
      this.sleepTimer = null
    }
  }

  private armWatchdog(controller: AbortController) {
    this.clearWatchdog()
    this.watchdog = setTimeout(() => controller.abort(), this.cfg.heartbeatTimeoutMs)
  }

  private clearWatchdog() {
    if (this.watchdog) clearTimeout(this.watchdog)
    this.watchdog = null
  }

  private async connectOnce(onOpen: () => void): Promise<"retry" | "fatal"> {
    const controller = new AbortController()
    this.controller = controller
    const headers: Record<string, string> = { Accept: "text/event-stream" }
    if (this.lastSeq > 0) headers["Last-Event-ID"] = String(this.lastSeq)
    const token = this.cfg.getAuthToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const url = `${this.cfg.baseUrl}${this.cfg.streamPath(this.sessionId)}?after_seq=${this.lastSeq}`
    try {
      // The watchdog also bounds how long we wait for response headers.
      this.armWatchdog(controller)
      const resp = await this.cfg.fetch(url, {
        method: "GET",
        headers,
        credentials: "include",
        signal: controller.signal,
      })
      if (!resp.ok || !resp.body) {
        this.clearWatchdog()
        return TERMINAL_STATUSES.has(resp.status) ? "fatal" : "retry"
      }
      onOpen()
      this.setStatus("open")
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      const parser = createSseParser({
        maxFrameBytes: this.cfg.maxFrameBytes,
        onFrame: (frame) => this.handleFrame(frame),
        onOversized: (bytes) =>
          this.invalid(null, [{ path: "", message: `frame exceeds ${this.cfg.maxFrameBytes} bytes (~${bytes})` }]),
      })
      this.armWatchdog(controller)
      while (!this.closed && !controller.signal.aborted) {
        const { value, done } = await reader.read()
        if (done) break
        this.armWatchdog(controller)
        if (value) parser.push(decoder.decode(value, { stream: true }))
      }
      this.clearWatchdog()
      void reader.cancel?.().catch(() => undefined)
      return "retry"
    } catch {
      this.clearWatchdog()
      return "retry"
    } finally {
      if (this.controller === controller) this.controller = null
    }
  }

  private handleFrame(frame: SseFrame) {
    let parsed: unknown
    try {
      parsed = JSON.parse(frame.data)
    } catch {
      this.invalid(frame.data.slice(0, 2048), [{ path: "", message: "frame data is not valid JSON" }])
      return
    }
    const result = validateOsEvent(parsed)
    if (!result.valid) {
      this.invalid(parsed, result.errors)
      return
    }
    const event = parsed as OsEvent
    if (event.session_id !== this.sessionId) {
      this.invalid(parsed, [{ path: "/session_id", message: `event for session ${event.session_id} on stream ${this.sessionId}` }])
      return
    }
    // A good frame proves the connection is healthy: reset the backoff.
    this.attempt = 0
    if (event.type === "heartbeat") return
    if (event.seq <= this.lastSeq) return
    this.lastSeq = event.seq
    this.buffer.push(event)
    while (this.buffer.length > this.cfg.replayBufferSize) {
      const evicted = this.buffer.shift()
      if (evicted) this.bufferFloor = evicted.seq
    }
    for (const sub of [...this.subscribers]) {
      if (event.seq > sub.lastSeq) {
        sub.lastSeq = event.seq
        safeCall(() => sub.handlers.onEvent(event))
      }
    }
  }
}

interface ResolvedOptions {
  baseUrl: string
  fetch: StreamFetch
  getAuthToken: () => string | null
  streamPath: (sessionId: OsId) => string
  backoff: Required<BackoffOptions>
  random: () => number
  heartbeatTimeoutMs: number
  maxFrameBytes: number
  replayBufferSize: number
}

export function createOsStreamClient(options: OsStreamClientOptions = {}): OsStreamClient {
  const connections = new Map<OsId, SessionConnection[]>()
  let resolved: ResolvedOptions | null = null
  const cfg = (): ResolvedOptions =>
    (resolved ??= {
      baseUrl: (options.baseUrl ?? defaultBaseUrl()).replace(/\/$/, ""),
      fetch: options.fetch ?? ((url, init) => fetch(url, init) as ReturnType<StreamFetch>),
      getAuthToken: options.getAuthToken ?? defaultToken,
      streamPath: options.streamPath ?? ((id) => `/v1/os/sessions/${encodeURIComponent(id)}/stream`),
      backoff: { ...DEFAULT_BACKOFF, ...options.backoff },
      random: options.random ?? Math.random,
      heartbeatTimeoutMs: options.heartbeatTimeoutMs ?? DEFAULT_HEARTBEAT_TIMEOUT_MS,
      maxFrameBytes: options.maxFrameBytes ?? DEFAULT_MAX_FRAME_BYTES,
      replayBufferSize: Math.max(1, options.replayBufferSize ?? 500),
    })

  const dispose = (conn: SessionConnection) => {
    const list = connections.get(conn.sessionId)
    if (!list) return
    const next = list.filter((c) => c !== conn)
    if (next.length) connections.set(conn.sessionId, next)
    else connections.delete(conn.sessionId)
  }

  const subscribeSession: SubscribeSession = (sessionId, handlers, afterSeq) => {
    const start = Math.max(0, Math.floor(afterSeq ?? 0))
    const sub: Subscriber = { handlers, lastSeq: start }
    let conn = connections.get(sessionId)?.find((c) => c.covers(start))
    if (!conn) {
      conn = new SessionConnection(sessionId, start, cfg(), dispose)
      connections.set(sessionId, [...(connections.get(sessionId) ?? []), conn])
      conn.add(sub)
      conn.start()
    } else {
      conn.add(sub)
    }
    const owner = conn
    let active = true
    return () => {
      if (!active) return
      active = false
      owner.remove(sub)
    }
  }

  return {
    subscribeSession,
    connectionCount: () => [...connections.values()].reduce((n, l) => n + l.length, 0),
    closeAll: () => {
      for (const list of [...connections.values()]) for (const c of list) c.close(true)
      connections.clear()
    },
  }
}

let defaultClient: OsStreamClient | null = null

/** The app-wide stream client (WS-A mounts this). */
export const subscribeSession: SubscribeSession = (sessionId, handlers, afterSeq) =>
  (defaultClient ??= createOsStreamClient()).subscribeSession(sessionId, handlers, afterSeq)
