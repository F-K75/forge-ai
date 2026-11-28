import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { OsEvent } from "../contracts"
import { emptyThread, reduceThread, type SessionThread } from "./sessionStore"

// The shared fixture both contract suites run (seam 1 fixture replayer).
const valid = (
  JSON.parse(
    readFileSync(resolve(process.cwd(), "..", "shared/os-schemas/examples/os-event.examples.json"), "utf8"),
  ) as { valid: OsEvent[] }
).valid

function replay(events: OsEvent[], start: SessionThread = emptyThread(true)) {
  let t = start
  const placements = []
  const surfaces = []
  for (const e of events) {
    const r = reduceThread(t, e)
    t = r.thread
    placements.push(...r.effects.placements)
    surfaces.push(...r.effects.surfaceMessages)
  }
  return { t, placements, surfaces }
}

describe("reduceThread over the shared contract examples", () => {
  it("builds the joke turn as streamed text and the dataset turn as a window placement", () => {
    const { t, placements, surfaces } = replay(valid)
    const joke = t.messages.find((m) => m.role === "assistant" && m.turn_id === "turn_01")
    expect(joke?.text).toBe("Why do programmers prefer dark mode? Because light attracts bugs.")
    expect(joke?.streaming).toBe(false)
    expect(t.messages[0]).toMatchObject({ role: "user", text: "Tell me a joke" })
    expect(surfaces.length).toBeGreaterThan(0)
    expect(placements.map((p) => p.surface_id)).toContain("srf_sales")
    expect(t.lastSeq).toBe(Math.max(...valid.filter((e) => e.type !== "heartbeat").map((e) => e.seq)))
  })

  it("ignores replays at or below lastSeq (idempotent resume)", () => {
    const once = replay(valid).t
    const twice = replay(valid, once)
    expect(twice.t).toBe(once)
    expect(twice.placements).toHaveLength(0)
  })

  it("reconciles the optimistic user message by turn id and records failures", () => {
    const start: SessionThread = {
      ...emptyThread(true),
      messages: [
        { id: "ct_1", turn_id: "t1", role: "user", text: "hi", format: "plain", attachments: [], surface_ids: [], placements: [], streaming: false, pending: true, created_at: "" },
      ],
    }
    const base = { v: "forge-os/1" as const, session_id: "s", turn_id: "t1", ts: "2026-11-27T10:00:00Z" }
    const { t } = replay(
      [
        { ...base, seq: 1, type: "turn.started", data: { message_id: "msg_u", prompt_preview: "hi" } },
        { ...base, seq: 2, type: "turn.failed", data: { error: { code: "llm_unavailable", message: "no key", retryable: false } } },
      ],
      start,
    )
    expect(t.messages[0]).toMatchObject({ id: "msg_u", pending: false })
    expect(t.messages[1]!.error?.code).toBe("llm_unavailable")
    expect(t.runningTurnId).toBeNull()
  })
})
