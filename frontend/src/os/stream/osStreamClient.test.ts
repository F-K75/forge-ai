import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { OsEvent, OsStreamHandlers } from "../contracts"
import { backoffDelay, createOsStreamClient, DEFAULT_BACKOFF, type StreamFetch } from "./osStreamClient"
import { createFixtureFetch, createFixtureSubscribe, toSseFrame } from "./fixtureReplayer"
import { createSseParser, type SseFrame } from "./sse"
import { FIXTURE_SESSION, loadOsEventExamples } from "./testFixtures"

const EXAMPLES = loadOsEventExamples()
const VALID = EXAMPLES.valid
const NON_HEARTBEAT = VALID.filter((e) => e.type !== "heartbeat")

function recorder() {
  const events: OsEvent[] = []
  const invalid: { raw: unknown; errors: { path: string; message: string }[] }[] = []
  const statuses: string[] = []
  const handlers: OsStreamHandlers = {
    onEvent: (e) => events.push(e),
    onInvalid: (raw, errors) => invalid.push({ raw, errors }),
    onStatus: (s) => statuses.push(s),
  }
  return { events, invalid, statuses, handlers }
}

const flush = () => vi.advanceTimersByTimeAsync(0)

function client(fetchImpl: StreamFetch, extra: Parameters<typeof createOsStreamClient>[0] = {}) {
  return createOsStreamClient({
    baseUrl: "http://api.test",
    fetch: fetchImpl,
    getAuthToken: () => "tok_123",
    random: () => 0.5,
    heartbeatTimeoutMs: 45_000,
    ...extra,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("SSE parser", () => {
  it("handles multi-line data, comments, ids and CRLF split across chunks", () => {
    const frames: SseFrame[] = []
    const p = createSseParser({ onFrame: (f) => frames.push(f) })
    p.push(": keepalive\r\nid: 7\r\nevent: text.delta\r\ndata: {\"a\":\r")
    p.push("\ndata: 1}\r\n\r\n")
    p.push("retry: 1000\nid\n\n") // no data: not a frame
    expect(frames).toEqual([{ id: "7", event: "text.delta", data: '{"a":\n1}', retry: null }])
  })

  it("skips an oversized frame without buffering it and keeps parsing", () => {
    const frames: SseFrame[] = []
    const oversized: number[] = []
    const p = createSseParser({ maxFrameBytes: 64, onFrame: (f) => frames.push(f), onOversized: (n) => oversized.push(n) })
    p.push("data: " + "x".repeat(50))
    p.push("y".repeat(100))
    p.push("\n\ndata: ok\n\n")
    expect(oversized).toHaveLength(1)
    expect(frames.map((f) => f.data)).toEqual(["ok"])
  })
})

describe("backoffDelay", () => {
  it("grows exponentially with jitter and is capped", () => {
    const mid = () => 0.5
    expect(backoffDelay(0, DEFAULT_BACKOFF, mid)).toBe(375)
    expect(backoffDelay(1, DEFAULT_BACKOFF, mid)).toBe(750)
    expect(backoffDelay(3, DEFAULT_BACKOFF, mid)).toBe(3000)
    expect(backoffDelay(30, DEFAULT_BACKOFF, () => 1)).toBe(DEFAULT_BACKOFF.maxMs)
    expect(backoffDelay(30, DEFAULT_BACKOFF, () => 0)).toBe(DEFAULT_BACKOFF.maxMs / 2)
  })
})

describe("osStreamClient", () => {
  it("replays the shared example stream in order, validates every frame and swallows heartbeats", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = []
    const f = createFixtureFetch(VALID, { onRequest: (url, headers) => seen.push({ url, headers }) })
    const c = client(f)
    const r = recorder()
    const unsubscribe = c.subscribeSession(FIXTURE_SESSION, r.handlers)
    await flush()
    expect(r.events.map((e) => e.seq)).toEqual(NON_HEARTBEAT.map((e) => e.seq))
    expect(r.events.some((e) => e.type === "heartbeat")).toBe(false)
    expect(r.invalid).toEqual([])
    expect(r.statuses).toEqual(["connecting", "open"])
    expect(seen[0].url).toBe(`http://api.test/v1/os/sessions/${FIXTURE_SESSION}/stream?after_seq=0`)
    expect(seen[0].headers.Authorization).toBe("Bearer tok_123")
    expect(seen[0].headers["Last-Event-ID"]).toBeUndefined()
    unsubscribe()
    expect(c.connectionCount()).toBe(0)
  })

  it("routes every invalid shared example to onInvalid and never applies it", async () => {
    const payloads = EXAMPLES.invalid.map((x) => x.payload)
    // Served raw (not filtered by seq/session) so every payload reaches the client.
    const c = client(createFixtureFetch([], { prelude: payloads.map(toSseFrame).join("") }))
    const r = recorder()
    c.subscribeSession("ses_1", r.handlers)
    await flush()
    expect(r.events).toEqual([])
    expect(r.invalid).toHaveLength(payloads.length)
    for (const i of r.invalid) expect(i.errors.length).toBeGreaterThan(0)
    c.closeAll()
  })

  it("reports malformed JSON, oversized frames and foreign-session events, then keeps streaming", async () => {
    const foreign = { ...VALID[0], session_id: "ses_other", seq: 1 }
    const prelude =
      "data: {not json\n\n" +
      `data: ${JSON.stringify({ ...VALID[1], data: { intent: { pad: "x".repeat(3000) } } })}\n\n` +
      toSseFrame(foreign).replace(/^/, "")
    const f = createFixtureFetch(VALID.slice(0, 3), { prelude })
    const c = client(f, { maxFrameBytes: 2048 })
    const r = recorder()
    c.subscribeSession(FIXTURE_SESSION, r.handlers)
    await flush()
    const messages = r.invalid.map((i) => i.errors[0].message)
    expect(messages[0]).toMatch(/not valid JSON/)
    expect(messages[1]).toMatch(/exceeds 2048 bytes/)
    expect(messages[2]).toMatch(/ses_other/)
    expect(r.events.map((e) => e.seq)).toEqual([1, 2, 3])
    c.closeAll()
  })

  it("resumes after a dropped connection with Last-Event-ID and after_seq, without duplicates", async () => {
    const seen: Record<string, string>[] = []
    const urls: string[] = []
    const f = createFixtureFetch(VALID, {
      dropAfterFrames: 3,
      onRequest: (url, headers) => {
        urls.push(url)
        seen.push(headers)
      },
    })
    const c = client(f)
    const r = recorder()
    c.subscribeSession(FIXTURE_SESSION, r.handlers)
    await flush()
    expect(r.events.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(r.statuses.at(-1)).toBe("reconnecting")
    await vi.advanceTimersByTimeAsync(backoffDelay(0, DEFAULT_BACKOFF, () => 0.5))
    expect(urls[1]).toMatch(/after_seq=3$/)
    expect(seen[1]["Last-Event-ID"]).toBe("3")
    expect(r.events.map((e) => e.seq)).toEqual(NON_HEARTBEAT.map((e) => e.seq))
    expect(r.statuses.at(-1)).toBe("open")
    c.closeAll()
  })

  it("starts from a caller-supplied afterSeq", async () => {
    const urls: string[] = []
    const c = client(createFixtureFetch(VALID, { onRequest: (u) => urls.push(u) }))
    const r = recorder()
    c.subscribeSession(FIXTURE_SESSION, r.handlers, 10)
    await flush()
    expect(urls[0]).toMatch(/after_seq=10$/)
    expect(r.events.every((e) => e.seq > 10)).toBe(true)
    c.closeAll()
  })

  it("backs off exponentially on 5xx and recovers", async () => {
    const f = createFixtureFetch(VALID.slice(0, 2), { failFirst: { count: 3, status: 503 } })
    const c = client(f)
    const r = recorder()
    c.subscribeSession(FIXTURE_SESSION, r.handlers)
    await flush()
    expect(f.requests).toBe(1)
    expect(r.statuses).toEqual(["connecting", "reconnecting"])
    await vi.advanceTimersByTimeAsync(374)
    expect(f.requests).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.requests).toBe(2)
    await vi.advanceTimersByTimeAsync(749)
    expect(f.requests).toBe(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(f.requests).toBe(3)
    await vi.advanceTimersByTimeAsync(1500)
    expect(f.requests).toBe(4)
    expect(r.statuses.at(-1)).toBe("open")
    expect(r.events.map((e) => e.seq)).toEqual([1, 2])
    c.closeAll()
  })

  it("treats 401/403/404 as terminal", async () => {
    for (const status of [401, 403, 404]) {
      const f = createFixtureFetch(VALID, { failFirst: { count: 99, status } })
      const c = client(f)
      const r = recorder()
      c.subscribeSession(FIXTURE_SESSION, r.handlers)
      await flush()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(f.requests).toBe(1)
      expect(r.statuses.at(-1)).toBe("closed")
      expect(c.connectionCount()).toBe(0)
    }
  })

  it("heartbeat watchdog reconnects a silent connection", async () => {
    const f = createFixtureFetch(VALID.slice(0, 2), { hold: true })
    const c = client(f, { heartbeatTimeoutMs: 1000 })
    const r = recorder()
    c.subscribeSession(FIXTURE_SESSION, r.handlers)
    await flush()
    expect(f.requests).toBe(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(f.requests).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(r.statuses.at(-1)).toBe("reconnecting")
    await vi.advanceTimersByTimeAsync(375)
    expect(f.requests).toBe(2)
    expect(r.events.map((e) => e.seq)).toEqual([1, 2])
    c.closeAll()
  })

  it("heartbeats keep the watchdog quiet", async () => {
    const hb = VALID.find((e) => e.type === "heartbeat")!
    const f = createFixtureFetch([VALID[0], hb, hb, hb], { frameDelayMs: 800, hold: true })
    const c = client(f, { heartbeatTimeoutMs: 1000 })
    const r = recorder()
    c.subscribeSession(FIXTURE_SESSION, { ...r.handlers, onEvent: (e) => r.events.push(e) })
    await vi.advanceTimersByTimeAsync(3200)
    expect(f.requests).toBe(1)
    expect(r.events).toHaveLength(1)
    c.closeAll()
  })

  it("fans out to multiple subscribers over one connection and catches late joiners up", async () => {
    const f = createFixtureFetch(VALID)
    const c = client(f)
    const a = recorder()
    const b = recorder()
    const late = recorder()
    const stopA = c.subscribeSession(FIXTURE_SESSION, a.handlers)
    const stopB = c.subscribeSession(FIXTURE_SESSION, b.handlers)
    await flush()
    const stopLate = c.subscribeSession(FIXTURE_SESSION, late.handlers, 8)
    expect(f.requests).toBe(1)
    expect(c.connectionCount()).toBe(1)
    expect(a.events.map((e) => e.seq)).toEqual(b.events.map((e) => e.seq))
    expect(late.events.map((e) => e.seq)).toEqual(NON_HEARTBEAT.filter((e) => e.seq > 8).map((e) => e.seq))
    expect(late.statuses).toEqual(["open"])
    stopA()
    expect(c.connectionCount()).toBe(1)
    stopB()
    stopLate()
    stopLate()
    expect(c.connectionCount()).toBe(0)
  })

  it("opens a dedicated connection when the replay buffer cannot cover a late subscriber", async () => {
    const f = createFixtureFetch(VALID)
    const c = client(f, { replayBufferSize: 3 })
    const a = recorder()
    c.subscribeSession(FIXTURE_SESSION, a.handlers)
    await flush()
    const late = recorder()
    c.subscribeSession(FIXTURE_SESSION, late.handlers)
    await flush()
    expect(f.requests).toBe(2)
    expect(c.connectionCount()).toBe(2)
    expect(late.events.map((e) => e.seq)).toEqual(NON_HEARTBEAT.map((e) => e.seq))
    c.closeAll()
  })

  it("isolates a throwing subscriber from the others", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const c = client(createFixtureFetch(VALID.slice(0, 2)))
    const good = recorder()
    c.subscribeSession(FIXTURE_SESSION, {
      onEvent: () => {
        throw new Error("boom")
      },
    })
    c.subscribeSession(FIXTURE_SESSION, good.handlers)
    await flush()
    expect(good.events).toHaveLength(2)
    spy.mockRestore()
    c.closeAll()
  })

  it("createFixtureSubscribe gives WS-A a ready SubscribeSession", async () => {
    const subscribe = createFixtureSubscribe(VALID)
    const r = recorder()
    const stop = subscribe(FIXTURE_SESSION, r.handlers)
    await flush()
    expect(r.events).toHaveLength(NON_HEARTBEAT.length)
    stop()
  })
})
