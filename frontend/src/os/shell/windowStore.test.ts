import { beforeEach, describe, expect, it } from "vitest"
import { validateContract } from "../validate"
import { MAX_WINDOWS, emptyWorkspace, focusedWindow, tileBounds, useWindowStore } from "./windowStore"

const s = () => useWindowStore.getState()

describe("windowStore", () => {
  beforeEach(() => {
    s().hydrate(emptyWorkspace())
    s().setArea({ w: 1200, h: 800 })
  })

  it("opens, focuses and raises windows (z-order)", () => {
    const a = s().open({ kind: "legacy_route", route: "/projects", title: "Projects" })
    const b = s().open({ kind: "surface", surface_id: "srf_1", title: "Chart" })
    expect(focusedWindow(s().workspace)?.id).toBe(b)
    s().focus(a)
    expect(focusedWindow(s().workspace)?.id).toBe(a)
    expect(validateContract("WorkspaceState", s().workspace).errors).toEqual([])
  })

  it("de-duplicates the same route/surface and restores it from minimised", () => {
    const a = s().open({ kind: "legacy_route", route: "/projects", title: "Projects" })
    s().minimize(a)
    expect(focusedWindow(s().workspace)).toBeNull()
    const again = s().open({ kind: "legacy_route", route: "/projects", title: "Projects" })
    expect(again).toBe(a)
    expect(s().workspace.windows).toHaveLength(1)
    expect(s().workspace.windows[0]!.state).toBe("normal")
  })

  it("maximises, switches presentation and closes", () => {
    const a = s().open({ kind: "surface", surface_id: "srf_1", title: "Chart" })
    s().toggleMaximize(a)
    expect(s().workspace.windows[0]!.state).toBe("maximized")
    s().toggleMaximize(a)
    expect(s().workspace.windows[0]!.state).toBe("normal")
    s().setPresentation(a, "panel")
    expect(s().workspace.windows[0]!.presentation).toBe("panel")
    s().setPresentation(a, "fullscreen")
    expect(s().workspace.windows[0]!.state).toBe("maximized")
    s().close(a)
    expect(s().workspace.windows).toHaveLength(0)
  })

  it("tiles visible windows into a non-overlapping grid", () => {
    s().open({ kind: "surface", surface_id: "a", title: "A" })
    s().open({ kind: "surface", surface_id: "b", title: "B" })
    s().tile()
    const [w1, w2] = s().workspace.windows
    expect(s().workspace.layout).toBe("tiled")
    expect(w1!.bounds!.x + w1!.bounds!.w).toBeLessThanOrEqual(w2!.bounds!.x)
    expect(w1!.bounds!.y).toBe(w2!.bounds!.y)
    expect(tileBounds(5, { w: 1200, h: 800 })).toHaveLength(5)
  })

  it("scopes windows to their session unless pinned", () => {
    s().setActiveSession("ses_a")
    const w = s().open({ kind: "surface", surface_id: "a", title: "A", session_id: "ses_a" })
    s().setActiveSession("ses_b")
    expect(focusedWindow(s().workspace)).toBeNull()
    s().togglePin(w)
    expect(focusedWindow(s().workspace)?.id).toBe(w)
  })

  it("caps windows at the schema maximum by evicting the oldest", () => {
    for (let i = 0; i < MAX_WINDOWS + 3; i++) s().open({ kind: "surface", surface_id: `s${i}`, title: `S${i}` })
    expect(s().workspace.windows).toHaveLength(MAX_WINDOWS)
    expect(s().workspace.windows.some((w) => w.surface_id === "s0")).toBe(false)
  })

  it("cycles focus to the back-most window", () => {
    const a = s().open({ kind: "surface", surface_id: "a", title: "A" })
    s().open({ kind: "surface", surface_id: "b", title: "B" })
    s().cycleFocus(1)
    expect(focusedWindow(s().workspace)?.id).toBe(a)
  })
})
