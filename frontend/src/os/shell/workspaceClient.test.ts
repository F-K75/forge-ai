import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { WindowState, WorkspaceState } from "../contracts"
import { WORKSPACE_STORAGE_KEY, loadLocalWorkspace, mergeWorkspace, startWorkspaceSync, type WorkspaceTransport } from "./workspaceClient"
import { emptyWorkspace, useWindowStore } from "./windowStore"

const win = (id: string, patch: Partial<WindowState> = {}): WindowState => ({
  id,
  kind: "surface",
  title: id,
  presentation: "window",
  surface_id: id,
  z: 1,
  state: "normal",
  ...patch,
})
const ws = (version: number, windows: WindowState[], patch: Partial<WorkspaceState> = {}): WorkspaceState => ({
  ...emptyWorkspace(),
  version,
  windows,
  updated_at: "2026-11-27T10:00:00.000Z",
  ...patch,
})

describe("mergeWorkspace (409 reconciliation)", () => {
  it("server wins on workspace fields; local window changes, adds and deletes survive", () => {
    const base = ws(3, [win("a"), win("b"), win("c")])
    const local = ws(3, [win("a", { title: "moved", bounds: { x: 9, y: 9, w: 400, h: 300 } }), win("c"), win("new")], {
      nav_collapsed: true,
    })
    const server = ws(4, [win("a"), win("b", { title: "server edit" }), win("c", { title: "server c" }), win("srv")], {
      name: "Renamed on server",
    })
    const merged = mergeWorkspace(base, local, server)
    const byId = Object.fromEntries(merged.windows.map((w) => [w.id, w]))
    expect(merged.version).toBe(4)
    expect(merged.name).toBe("Renamed on server")
    expect(merged.nav_collapsed).toBe(false)
    expect(byId.a!.title).toBe("moved") // local change wins
    expect(byId.b).toBeUndefined() // deleted locally
    expect(byId.c!.title).toBe("server c") // unchanged locally -> server copy
    expect(byId.new).toBeDefined() // added locally
    expect(byId.srv).toBeDefined() // added on server
  })
})

describe("startWorkspaceSync", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it("mirrors to localStorage and survives a reload", () => {
    const h = startWorkspaceSync({ transport: null })
    useWindowStore.getState().open({ kind: "surface", surface_id: "x", title: "X" })
    expect(loadLocalWorkspace().windows).toHaveLength(1)
    expect(localStorage.getItem(WORKSPACE_STORAGE_KEY)).toContain('"surface_id":"x"')
    h.stop()
  })

  it("debounces PUTs with the server version and merges on 409", async () => {
    let serverState = ws(5, [win("srv")])
    const put = vi.fn(async (body: WorkspaceState) => {
      if (body.version !== serverState.version) throw { status: 409 }
      serverState = { ...body, version: body.version + 1 }
      return serverState
    })
    const transport: WorkspaceTransport = { getCurrent: vi.fn(async () => serverState), put }
    useWindowStore.getState().hydrate(emptyWorkspace())
    localStorage.clear()
    const h = startWorkspaceSync({ transport, debounceMs: 100 })
    await vi.runOnlyPendingTimersAsync() // initial GET
    expect(useWindowStore.getState().workspace.version).toBe(5)

    // Someone else bumps the server meanwhile.
    serverState = ws(6, [win("srv"), win("other")])
    useWindowStore.getState().open({ kind: "surface", surface_id: "mine", title: "Mine" })
    useWindowStore.getState().open({ kind: "surface", surface_id: "mine2", title: "Mine 2" })
    await vi.advanceTimersByTimeAsync(150) // one debounced PUT -> 409 -> merge
    await vi.advanceTimersByTimeAsync(150) // retry PUT
    await h.flush()
    const ids = useWindowStore.getState().workspace.windows.map((w) => w.surface_id)
    expect(ids).toEqual(expect.arrayContaining(["srv", "other", "mine", "mine2"]))
    expect(put.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(useWindowStore.getState().workspace.version).toBe(7)
    h.stop()
  })
})
