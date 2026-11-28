import { describe, expect, it } from "vitest"
import type { OsEvent } from "../../contracts"
import { validateContract, validateOsEvent } from "../../validate"
import { createFakeOsBackend } from "./fakeOsBackend"

const PROMPTS = [
  "Tell me a joke",
  "Show my projects",
  "Chart revenue by region",
  "Compare models for coding",
  "How's run 42 going?",
  "Approve the prod deploy",
  "Build me a site for my bakery",
  "What can you do?",
  "Open billing",
  "Open the command center",
]

async function runTurn(prompt: string) {
  const be = createFakeOsBackend({ storage: null, speed: 0 })
  const accepted = await be.createTurn(null, { client_turn_id: "ct_1", prompt })
  expect(validateContract("TurnAccepted", accepted).errors).toEqual([])
  const events: OsEvent[] = []
  await new Promise<void>((done) => {
    be.subscribe(accepted.session_id, {
      onEvent: (e) => {
        events.push(e)
        if (e.type === "turn.completed" || e.type === "turn.failed") done()
      },
    }, accepted.after_seq)
  })
  return { be, accepted, events }
}

describe("fake OS backend (demo mode)", () => {
  it.each(PROMPTS)("streams contract-valid events for %s", async (prompt) => {
    const { events } = await runTurn(prompt)
    for (const e of events) expect(validateOsEvent(e).errors, `${e.type}`).toEqual([])
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1))
    expect(events.at(-1)!.type).toBe("turn.completed")
  })

  it("routes prompts to the owner-example capabilities and presentations", async () => {
    const placed = async (p: string) =>
      (await runTurn(p)).events.find((e) => e.type === "surface.placed")?.data as { placement: { capability_id: string; presentation: string } } | undefined
    expect((await placed("Show my projects"))?.placement).toMatchObject({ capability_id: "projects.manage", presentation: "window" })
    expect((await placed("Approve the prod deploy"))?.placement.presentation).toBe("inline")
    expect((await placed("How's run 42 going?"))?.placement.presentation).toBe("panel")
    expect(await placed("Tell me a joke")).toBeUndefined()
  })

  it("restores a session: history, surface snapshots and last_seq for resume", async () => {
    const { be, accepted, events } = await runTurn("Chart revenue by region")
    const d = await be.getSession(accepted.session_id)
    expect(validateContract("SessionSummary", d.session).errors).toEqual([])
    for (const m of d.messages) expect(validateContract("SessionMessage", m).errors).toEqual([])
    for (const s of d.surfaces) expect(validateContract("StoredSurface", s).errors).toEqual([])
    expect(d.messages.map((m) => m.role)).toEqual(["user", "assistant"])
    expect(d.messages[0]!.text).toBe("Chart revenue by region")
    expect(d.surfaces).toHaveLength(1)
    expect(d.last_seq).toBe(events.at(-1)!.seq)
    // Replays only what comes after the given seq.
    const replayed: OsEvent[] = []
    be.subscribe(accepted.session_id, { onEvent: (e) => replayed.push(e) }, d.last_seq - 2)
    await Promise.resolve()
    expect(replayed.map((e) => e.seq)).toEqual([d.last_seq - 1, d.last_seq])
  })

  it("rejects a second turn while one is running (409)", async () => {
    const be = createFakeOsBackend({ storage: null, speed: 1 })
    const a = await be.createTurn(null, { client_turn_id: "ct_a", prompt: "Tell me a joke" })
    await expect(be.createTurn(a.session_id, { client_turn_id: "ct_b", prompt: "again" })).rejects.toMatchObject({ status: 409 })
    await be.cancelTurn(a.session_id, a.turn_id)
  })
})
