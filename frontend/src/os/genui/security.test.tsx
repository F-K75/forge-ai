/**
 * Security tests for the generated-UI path: untrusted stream data must never
 * become code, HTML, script URLs or unbounded state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { FORGE_CATALOG_ID, type OsEvent } from "../contracts"
import { createFixtureFetch, createFixtureSubscribe, toSseFrame } from "../stream/fixtureReplayer"
import { createOsStreamClient } from "../stream/osStreamClient"
import { GenUIProvider } from "./GenUIProvider"
import { SurfaceView } from "./SurfaceView"
import { createSurfaceStore, MAX_DATA_MODEL_BYTES, surfaceStreamHandlers } from "./surfaceStore"
import { FALLBACK_MESSAGE } from "./TextFallback"

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SESSION = "ses_sec"
let seq = 0
function a2ui(message: unknown): OsEvent {
  seq += 1
  return { v: "forge-os/1", seq, session_id: SESSION, turn_id: "t1", ts: "2026-11-27T10:00:00Z", type: "a2ui.message", data: { message } } as OsEvent
}
const create = (surfaceId: string, components: unknown[], dataModel: Record<string, unknown> = {}) =>
  a2ui({ version: "1.0", createSurface: { surfaceId, catalogId: FORGE_CATALOG_ID, components, dataModel } })

async function streamInto(events: unknown[]) {
  const store = createSurfaceStore()
  const invalid: unknown[] = []
  const handlers = surfaceStreamHandlers(store)
  const stop = createFixtureSubscribe(events)(SESSION, {
    ...handlers,
    onInvalid: (raw, errors) => {
      invalid.push(raw)
      handlers.onInvalid(raw, errors)
    },
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
  stop()
  return { store, invalid }
}

function view(store: ReturnType<typeof createSurfaceStore>, surfaceId: string) {
  return render(
    <GenUIProvider sessionId={SESSION} store={store}>
      <SurfaceView surfaceId={surfaceId} />
    </GenUIProvider>
  )
}

describe("generated UI security", () => {
  it("drops an event carrying an unknown component: never rendered, text fallback shown", async () => {
    const { store, invalid } = await streamInto([
      create("srf_x", [
        { id: "root", component: "Column", children: ["evil"] },
        { id: "evil", component: "Script", src: "https://evil.example/x.js" },
      ]),
    ])
    expect(invalid).toHaveLength(1)
    view(store, "srf_x")
    expect(screen.getByText(FALLBACK_MESSAGE)).toBeInTheDocument()
    expect(document.querySelector("script")).toBeNull()
    expect(new XMLSerializer().serializeToString(document.body)).not.toContain("evil.example")
  })

  it("never renders components outside the registry even if they reach the store", () => {
    const store = createSurfaceStore()
    // Bypass validation entirely to prove the renderer is a second wall.
    store.setState({
      surfaces: {
        s: {
          surfaceId: "s", sessionId: null, turnId: null, catalogId: FORGE_CATALOG_ID, sendDataModel: false, version: 1, dropped: [], updatedAt: null, dataModel: {},
          components: {
            root: { id: "root", component: "Column", children: ["x", "y", "z"] },
            x: { id: "x", component: "Iframe", src: "https://evil.example" },
            y: { id: "y", component: "constructor" },
            z: { id: "z", component: "Text", text: "safe" },
          },
        },
      },
    })
    view(store, "s")
    expect(screen.getByText("safe")).toBeInTheDocument()
    expect(document.querySelector("iframe")).toBeNull()
  })

  it("keeps javascript:, data: and credentialed URLs inert", async () => {
    // Through the stream: the catalog's HttpUrl pattern rejects the whole message.
    const { invalid } = await streamInto([
      create("srf_l", [{ id: "root", component: "LinkList", links: [{ label: "x", url: "javascript:alert(1)" }] }]),
    ])
    expect(invalid).toHaveLength(1)

    // Through a data binding: script URLs in data are only ever text.
    const store = createSurfaceStore()
    store.getState().applyMessage({
      version: "1.0",
      createSurface: {
        surfaceId: "s",
        catalogId: FORGE_CATALOG_ID,
        components: [
          { id: "root", component: "Column", children: ["t", "md", "tbl"] },
          { id: "t", component: "Text", text: { "@path": "/u" } },
          { id: "md", component: "Text", format: "markdown", text: "[click](javascript:alert(1)) <a href='javascript:alert(2)'>a</a>" },
          { id: "tbl", component: "DataTable", columns: [{ key: "url", label: "URL" }], rows: [{ url: "javascript:alert(3)" }] },
        ],
        dataModel: { u: "javascript:alert(1)" },
      },
    })
    view(store, "s")
    expect(document.querySelector("a")).toBeNull()
    expect(document.querySelector('[href^="javascript"], [src^="javascript"]')).toBeNull()
    expect(screen.getByText("javascript:alert(1)")).toBeInTheDocument()
  })

  it("never turns strings into markup or event handlers", () => {
    const store = createSurfaceStore()
    store.getState().applyMessage({
      version: "1.0",
      createSurface: {
        surfaceId: "s",
        catalogId: FORGE_CATALOG_ID,
        components: [
          { id: "root", component: "Column", children: ["a", "b"] },
          { id: "a", component: "Heading", text: "<img src=x onerror=alert(1)>" },
          { id: "b", component: "CodeView", code: "<script>alert(1)</script>" },
        ],
      },
    })
    view(store, "s")
    expect(document.querySelector("img, script")).toBeNull()
    expect(screen.getByRole("heading")).toHaveTextContent("<img src=x onerror=alert(1)>")
  })

  it("rejects oversized frames at the stream and oversized data models at the store", async () => {
    const huge = "x".repeat(2 * 1024 * 1024)
    const client = createOsStreamClient({
      baseUrl: "http://t",
      getAuthToken: () => null,
      fetch: createFixtureFetch([], { prelude: toSseFrame(create("srf_big", [], { blob: huge })) }),
    })
    const invalid: unknown[] = []
    const events: unknown[] = []
    const stop = client.subscribeSession(SESSION, { onEvent: (e) => events.push(e), onInvalid: (r) => invalid.push(r) })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    stop()
    expect(events).toEqual([])
    expect(invalid).toHaveLength(1)

    const store = createSurfaceStore()
    store.getState().applyMessage({ version: "1.0", createSurface: { surfaceId: "s", catalogId: FORGE_CATALOG_ID, dataModel: { blob: "y".repeat(MAX_DATA_MODEL_BYTES) } } })
    expect(store.getState().surfaces.s).toBeUndefined()
    expect(store.getState().failures.s).toBeDefined()
  })

  it("rejects component lists over the schema cap", async () => {
    const components = Array.from({ length: 201 }, (_, i) => ({ id: `t${i}`, component: "Text", text: "x" }))
    const { store, invalid } = await streamInto([create("srf_many", components)])
    expect(invalid).toHaveLength(1)
    expect(store.getState().surfaces.srf_many).toBeUndefined()
  })

  it("contains no dangerouslySetInnerHTML, eval or new Function anywhere in src/os", () => {
    const root = resolve(process.cwd(), "src/os")
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p)
      }
    }
    walk(root)
    expect(files.length).toBeGreaterThan(10)
    for (const f of files) {
      const src = readFileSync(f, "utf8")
      expect(src, f).not.toMatch(/dangerouslySetInnerHTML|\beval\s*\(|new\s+Function\s*\(/)
    }
  })
})
