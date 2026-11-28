/**
 * TEMPORARY minimal `SubscribeSession` over `GET /v1/os/sessions/{id}/stream`
 * for live mode until WS-B's osStreamClient lands (src/os/stream/**). Fetch-
 * based SSE (same approach as kernelApi.subscribeAguiStream), Last-Event-ID
 * resume with a short fixed backoff, and `validateOsEvent` on every frame.
 * WS-B's client adds the heartbeat watchdog, jittered backoff and fan-out.
 */
import { api } from "../../../lib/api"
import type { OsEvent, SubscribeSession } from "../../contracts"
import { validateOsEvent } from "../../validate"

export const liveSubscribeSession: SubscribeSession = (sessionId, handlers, afterSeq = 0) => {
  const controller = new AbortController()
  const baseUrl = (api.defaults.baseURL || "http://localhost:8000").replace(/\/$/, "")
  let lastSeq = afterSeq
  let closed = false

  const connect = async (attempt: number): Promise<void> => {
    if (closed) return
    handlers.onStatus?.(attempt === 0 ? "connecting" : "reconnecting")
    try {
      const headers: Record<string, string> = { Accept: "text/event-stream" }
      if (lastSeq > 0) headers["Last-Event-ID"] = String(lastSeq)
      const token = typeof localStorage !== "undefined" ? localStorage.getItem("forge_access_token") : null
      if (token) headers.Authorization = `Bearer ${token}`
      const resp = await fetch(
        `${baseUrl}/v1/os/sessions/${encodeURIComponent(sessionId)}/stream?after_seq=${lastSeq}`,
        { headers, credentials: "include", signal: controller.signal },
      )
      if (!resp.ok || !resp.body) throw new Error(`stream ${resp.status}`)
      handlers.onStatus?.("open")
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const frames = buffer.split("\n\n")
        buffer = frames.pop() ?? ""
        for (const frame of frames) {
          const data = frame
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trimStart())
            .join("\n")
          if (!data) continue
          let parsed: unknown
          try {
            parsed = JSON.parse(data)
          } catch {
            handlers.onInvalid?.(data, [{ path: "", message: "Malformed JSON" }])
            continue
          }
          const result = validateOsEvent(parsed)
          if (!result.valid) {
            handlers.onInvalid?.(parsed, result.errors)
            continue
          }
          const event = parsed as OsEvent
          if (event.type === "heartbeat") continue
          if (event.seq <= lastSeq) continue
          lastSeq = event.seq
          handlers.onEvent(event)
        }
      }
    } catch {
      if (closed) return
    }
    if (!closed) setTimeout(() => void connect(attempt + 1), Math.min(8000, 500 * 2 ** Math.min(attempt, 4)))
  }

  void connect(0)
  return () => {
    closed = true
    controller.abort()
    handlers.onStatus?.("closed")
  }
}
