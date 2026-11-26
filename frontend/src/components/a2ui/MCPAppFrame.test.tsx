import { describe, it, expect, afterEach, vi } from "vitest"
import { render, screen, cleanup, waitFor, act, fireEvent } from "@testing-library/react"
import type { MCPAppResourcePayload } from "../../lib/kernelApi"
import { MCPAppFrame } from "./MCPAppFrame"
import { MCP_APP_MAX_HEIGHT, parseSizeChangedMessage, validateMCPAppResource } from "./mcpAppSecurity"

afterEach(cleanup)

const CSP =
  "default-src 'none'; script-src 'unsafe-inline' https://cdn.charts.example; style-src 'unsafe-inline'; " +
  "img-src data:; font-src data:; media-src data:; connect-src 'none'; frame-src 'none'; " +
  "object-src 'none'; base-uri 'none'; form-action 'none'"

function attr(v: string) {
  return v.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
}

function makePayload(overrides: Partial<MCPAppResourcePayload> = {}, html?: string): MCPAppResourcePayload {
  const doc =
    html ??
    `<!DOCTYPE html>\n<meta http-equiv="Content-Security-Policy" content="${attr(CSP)}">\n` +
      `<meta name="referrer" content="no-referrer">\n<html><body><div id=root>chart</div></body></html>`
  return {
    app_id: "app_chart",
    tool_name: "chart",
    server_id: "charts",
    resource_uri: "ui://charts/app.html",
    mime_type: "text/html;profile=mcp-app",
    html: doc,
    size_bytes: doc.length,
    content_sha256: "0".repeat(64),
    protocol: "mcp-apps/v1",
    extension: "io.modelcontextprotocol/ui",
    warnings: [],
    ...overrides,
    sandbox: {
      render_mode: "iframe-srcdoc",
      iframe_sandbox: "allow-scripts",
      iframe_allow: "",
      referrer_policy: "no-referrer",
      csp: CSP,
      allowed_domains: { connect_domains: [], resource_domains: ["https://cdn.charts.example"], frame_domains: [] },
      denied_permissions: [],
      prefers_border: true,
      ...(overrides.sandbox ?? {}),
    },
  }
}

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { detail: "x" } } })
}

async function renderReady(payload = makePayload()) {
  const load = vi.fn().mockResolvedValue(payload)
  render(<MCPAppFrame title="MCP App: Chart" loadResource={load} />)
  const frame = (await screen.findByTitle("MCP App: Chart")) as HTMLIFrameElement
  return { frame, load }
}

describe("MCPAppFrame", () => {
  it("renders the sanitized resource in an iframe whose sandbox is exactly allow-scripts", async () => {
    const payload = makePayload()
    const { frame, load } = await renderReady(payload)
    expect(load).toHaveBeenCalledTimes(1)
    expect(frame.tagName).toBe("IFRAME")
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts")
    const tokens = (frame.getAttribute("sandbox") ?? "").split(/\s+/).filter(Boolean)
    expect(tokens).toEqual(["allow-scripts"])
    expect(tokens).not.toContain("allow-same-origin")
    expect(frame.getAttribute("srcdoc")).toBe(payload.html)
    expect(frame.getAttribute("allow")).toBe("")
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer")
    expect(frame.hasAttribute("src")).toBe(false)
  })

  it("never widens the sandbox even if metadata asks for more, and refuses to render instead", async () => {
    for (const iframe_sandbox of [
      "allow-scripts allow-same-origin",
      "allow-scripts allow-top-navigation",
      "allow-scripts allow-popups",
      "allow-forms allow-scripts",
      "",
    ]) {
      const load = vi.fn().mockResolvedValue(makePayload({ sandbox: { iframe_sandbox } as never }))
      render(<MCPAppFrame title="MCP App: Chart" loadResource={load} />)
      expect(await screen.findByRole("alert")).toHaveTextContent(/sandbox capabilities/i)
      expect(screen.queryByTitle("MCP App: Chart")).toBeNull()
      cleanup()
    }
  })

  it("refuses to render a resource without the injected CSP meta", async () => {
    const noCsp = "<!DOCTYPE html>\n<html><body><script>alert(1)</script></body></html>"
    const load = vi.fn().mockResolvedValue(makePayload({}, noCsp))
    render(<MCPAppFrame title="MCP App: Chart" loadResource={load} />)
    expect(await screen.findByRole("alert")).toHaveTextContent(/missing its Content-Security-Policy/i)
    expect(screen.queryByTitle("MCP App: Chart")).toBeNull()
    expect(document.querySelector("iframe")).toBeNull()
  })

  it("refuses a CSP that is not first, not deny-by-default, or does not match the metadata", () => {
    const late = `<html><body>x</body></html><meta http-equiv="Content-Security-Policy" content="${attr(CSP)}">`
    expect(validateMCPAppResource(makePayload({}, late))).toMatchObject({ ok: false })

    const loose = `<meta http-equiv="Content-Security-Policy" content="default-src *">x`
    expect(validateMCPAppResource(makePayload({ sandbox: { csp: "default-src *" } as never }, loose))).toEqual({
      ok: false,
      reason: expect.stringMatching(/deny-by-default/),
    })

    const other = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'">x`
    expect(validateMCPAppResource(makePayload({}, other))).toEqual({
      ok: false,
      reason: expect.stringMatching(/does not match/),
    })

    expect(validateMCPAppResource(makePayload({ sandbox: { iframe_allow: "camera" } as never }))).toMatchObject({
      ok: false,
    })
    expect(validateMCPAppResource(null)).toMatchObject({ ok: false })
    expect(validateMCPAppResource(makePayload())).toEqual({ ok: true, csp: CSP })
  })

  it("shows a loading state, then specific errors for backend 403/404/413/415/502, with retry", async () => {
    let resolveLoad: (p: MCPAppResourcePayload) => void = () => {}
    const pending = vi.fn(() => new Promise<MCPAppResourcePayload>((r) => (resolveLoad = r)))
    render(<MCPAppFrame title="MCP App: Chart" loadResource={pending} />)
    expect(screen.getByRole("status")).toHaveTextContent(/Loading MCP App view/i)
    await act(async () => resolveLoad(makePayload()))
    expect(await screen.findByTitle("MCP App: Chart")).toBeInTheDocument()
    cleanup()

    const cases: Array<[number, RegExp]> = [
      [403, /not permitted/i],
      [404, /not found/i],
      [413, /too large/i],
      [415, /unsupported content type/i],
      [502, /server failed/i],
    ]
    for (const [status, message] of cases) {
      const load = vi.fn().mockRejectedValue(httpError(status))
      render(<MCPAppFrame title="MCP App: Chart" loadResource={load} />)
      const alert = await screen.findByRole("alert")
      expect(alert).toHaveTextContent(message)
      expect(alert).toHaveTextContent(`HTTP ${status}`)
      expect(document.querySelector("iframe")).toBeNull()
      cleanup()
    }

    const flaky = vi.fn().mockRejectedValueOnce(httpError(502)).mockResolvedValueOnce(makePayload())
    render(<MCPAppFrame title="MCP App: Chart" loadResource={flaky} />)
    fireEvent.click(await screen.findByRole("button", { name: /retry/i }))
    expect(await screen.findByTitle("MCP App: Chart")).toBeInTheDocument()
    expect(flaky).toHaveBeenCalledTimes(2)
  })

  it("resizes only on size-changed messages from its own iframe; ignores other sources and shapes", async () => {
    const { frame } = await renderReady()
    const container = screen.getByTestId("mcp-app-frame-container")
    const initial = container.style.height
    const sizeMsg = { jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 333 } }

    const post = (data: unknown, source: MessageEventSource | null, origin = "null") =>
      act(() => {
        window.dispatchEvent(new MessageEvent("message", { data, source, origin }))
      })

    // Wrong source: the parent window itself, and another iframe
    post(sizeMsg, window)
    const other = document.createElement("iframe")
    document.body.appendChild(other)
    post(sizeMsg, other.contentWindow)
    expect(container.style.height).toBe(initial)

    // Right source, wrong origin (a frame that somehow gained a real origin)
    post(sizeMsg, frame.contentWindow, "http://localhost:3000")
    expect(container.style.height).toBe(initial)

    // Right source, malformed / non-allowlisted messages
    post({ ...sizeMsg, method: "ui/open-link", params: { url: "https://evil.example" } }, frame.contentWindow)
    post({ ...sizeMsg, params: { height: "999px" } }, frame.contentWindow)
    post("ui/notifications/size-changed", frame.contentWindow)
    expect(container.style.height).toBe(initial)

    // Right source + well-formed message
    post(sizeMsg, frame.contentWindow)
    await waitFor(() => expect(container.style.height).toBe("333px"))

    // Clamped to the max height
    post({ ...sizeMsg, params: { height: 10_000 } }, frame.contentWindow)
    await waitFor(() => expect(container.style.height).toBe(`${MCP_APP_MAX_HEIGHT}px`))
    other.remove()
  })

  it("parseSizeChangedMessage validates the schema strictly", () => {
    expect(parseSizeChangedMessage({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: 120 } })).toBe(120)
    expect(parseSizeChangedMessage({ method: "ui/notifications/size-changed", params: { height: 120 } })).toBeNull()
    expect(parseSizeChangedMessage({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: [120] })).toBeNull()
    expect(parseSizeChangedMessage({ jsonrpc: "2.0", method: "ui/notifications/size-changed", params: { height: NaN } })).toBeNull()
    expect(parseSizeChangedMessage([])).toBeNull()
    expect(parseSizeChangedMessage(null)).toBeNull()
  })
})
