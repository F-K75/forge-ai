import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import type { MCPAppResourcePayload } from "../../../lib/kernelApi"
import { checkMCPAppCsp, validateMCPAppResource } from "../../../components/a2ui/mcpAppSecurity"
import type { MCPAppPlacement } from "../../contracts"
import { FIXTURE_SESSION, loadOsEventExamples } from "../../stream/testFixtures"
import { GenUIProvider } from "../GenUIProvider"
import { createSurfaceStore } from "../surfaceStore"
import { MCPAppSurface } from "./MCPAppSurface"

afterEach(cleanup)

const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; " +
  "media-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

function payload(overrides: Partial<MCPAppResourcePayload> = {}, csp = CSP): MCPAppResourcePayload {
  const html = `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, "&quot;")}">\n<p>forecast</p>`
  return {
    app_id: "app_weather",
    tool_name: "get_forecast",
    server_id: "srv_ext",
    resource_uri: "ui://srv_ext/forecast.html",
    mime_type: "text/html;profile=mcp-app",
    html,
    size_bytes: html.length,
    content_sha256: "0".repeat(64),
    protocol: "mcp-apps/v1",
    extension: "io.modelcontextprotocol/ui",
    warnings: [],
    sandbox: {
      render_mode: "iframe-srcdoc",
      iframe_sandbox: "allow-scripts",
      iframe_allow: "",
      referrer_policy: "no-referrer",
      csp,
      allowed_domains: { connect_domains: [], resource_domains: [], frame_domains: [] },
      denied_permissions: [],
      prefers_border: true,
    },
    ...overrides,
  }
}

const PLACEMENT = loadOsEventExamples().valid.find((e) => e.type === "mcp_app.placed")!.data as { placement: MCPAppPlacement }

describe("MCPAppSurface", () => {
  it("mounts the sandboxed frame for an mcp_app.placed event from the store", async () => {
    const store = createSurfaceStore()
    store.getState().applyEvent(loadOsEventExamples().valid.find((e) => e.type === "mcp_app.placed")!)
    const load = vi.fn().mockResolvedValue(payload())
    render(
      <GenUIProvider sessionId={FIXTURE_SESSION} store={store} loadMcpResource={load}>
        <MCPAppSurface appId="app_weather" />
      </GenUIProvider>
    )
    const frame = (await screen.findByTitle("MCP App: Forecast")) as HTMLIFrameElement
    expect(load).toHaveBeenCalledWith(PLACEMENT.placement)
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts")
    expect(frame.hasAttribute("src")).toBe(false)
    // The app's HTML lives only in srcdoc, never in the shell DOM.
    expect(document.body.querySelector("p")?.textContent ?? "").not.toBe("forecast")
  })

  it("refuses a resource served for a different app", async () => {
    const load = vi.fn().mockResolvedValue(payload({ app_id: "app_other" }))
    render(<MCPAppSurface placement={PLACEMENT.placement} loadResource={load} />)
    expect(await screen.findByRole("alert")).toHaveTextContent(/does not belong/)
    expect(document.querySelector("iframe")).toBeNull()
  })

  it("shows a status until the placement exists and a fallback for an invalid one", async () => {
    render(<MCPAppSurface appId="nope" />)
    expect(screen.getByRole("status")).toHaveTextContent("Preparing app")
    cleanup()
    const bad = { ...PLACEMENT.placement, presentation: "inline" } as unknown as MCPAppPlacement
    const load = vi.fn()
    await act(async () => {
      render(<MCPAppSurface placement={bad} loadResource={load} />)
    })
    expect(screen.getByRole("note")).toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
  })
})

describe("MCP App resource hardening", () => {
  it("accepts the backend's CSP shape", () => {
    expect(checkMCPAppCsp(CSP)).toBeNull()
    expect(validateMCPAppResource(payload(), { appId: "app_weather", serverId: "srv_ext", toolName: "get_forecast" })).toEqual({ ok: true, csp: CSP })
  })

  it("refuses wildcard, scheme-wide, data:, blob: and eval sources for code, connections and frames", () => {
    for (const [directive, source] of [
      ["script-src", "*"],
      ["script-src", "'unsafe-eval'"],
      ["script-src", "data:"],
      ["connect-src", "https:"],
      ["frame-src", "blob:"],
    ]) {
      const csp = CSP.replace(new RegExp(`${directive} [^;]+`), `${directive} ${source}`)
      expect(validateMCPAppResource(payload({}, csp))).toEqual({ ok: false, reason: expect.stringContaining(source) })
    }
  })

  it("allows object-src, base-uri and form-action only as 'none'", () => {
    for (const d of ["object-src", "base-uri", "form-action"]) {
      const csp = CSP.replace(new RegExp(`${d} 'none'`), `${d} https://evil.example`)
      expect(validateMCPAppResource(payload({}, csp))).toEqual({ ok: false, reason: expect.stringContaining(d) })
    }
  })

  it("refuses malformed metadata and mismatched server or tool ids", () => {
    expect(validateMCPAppResource(payload({ warnings: "x" as unknown as string[] })).ok).toBe(false)
    expect(validateMCPAppResource(payload({ warnings: [1 as unknown as string] })).ok).toBe(false)
    expect(validateMCPAppResource(payload(), { serverId: "srv_other" }).ok).toBe(false)
    expect(validateMCPAppResource(payload(), { toolName: "other" }).ok).toBe(false)
  })
})
