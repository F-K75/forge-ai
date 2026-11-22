// An in-memory stand-in for the Forge backend, installed on a Playwright page
// by route interception: REST calls under API and build WebSockets under WS
// (see playwright.mocked.config.ts, which builds the bundle against them).
// Specs mutate the persisted state (`builds`) and push events on the open
// socket, exactly as the real backend persists first and then broadcasts.
import { expect, type Page, type Route, type WebSocketRoute } from '@playwright/test'

export const E2E_PORT = Number(process.env.FORGE_E2E_PORT || 4173)
export const API_PREFIX = '/api-mock'
export const WS_PREFIX = '/ws-mock'

export interface MockBuild {
  doc: Record<string, unknown>
  files: Record<string, string>
  /** Body of GET /v1/builds/{id}/collaboration; null answers 404 (legacy backend). */
  collaboration: Record<string, unknown> | null
}

export interface RecordedRequest {
  method: string
  path: string
  body: unknown
}

type Reply = { status: number; body: unknown }

export class MockBackend {
  user = {
    id: 'user-1',
    email: 'builder@example.com',
    name: 'Builder',
    plan: 'pro',
    credits: 12,
    created_at: '2026-11-01T00:00:00',
    completed_onboarding: true,
    is_admin: false,
  }
  project = { id: 'proj-1', name: 'ledger-app', description: 'A small ledger app' }
  builds = new Map<string, MockBuild>()
  /** Build ids of the project, newest first (GET /projects/{id}/builds). */
  projectBuilds: string[] = []
  requests: RecordedRequest[] = []
  unmocked: string[] = []
  /** Any request the browser makes to the client-side synthesis endpoint (must stay empty in live mode). */
  synthesisRequests: string[] = []
  sockets: Array<{ buildId: string; ws: WebSocketRoute }> = []
  onCreateBuild: (body: { project_id: string; prompt: string }) => Reply = () => ({
    status: 500,
    body: { detail: 'no create handler' },
  })

  addBuild(id: string, doc: Record<string, unknown>, files: Record<string, string> = {}, collaboration: Record<string, unknown> | null = null) {
    this.builds.set(id, { doc: { id, project_id: this.project.id, ...doc }, files, collaboration })
  }

  build(id: string): MockBuild {
    const b = this.builds.get(id)
    if (!b) throw new Error(`no mock build ${id}`)
    return b
  }

  count(method: string, path: string): number {
    return this.requests.filter((r) => r.method === method && r.path === path).length
  }

  async install(page: Page) {
    page.on('request', (req) => {
      if (req.url().includes('/api/gemini/')) this.synthesisRequests.push(req.url())
    })
    // Nothing leaves the machine (e.g. web fonts): the bundle must work without it.
    await page.route((url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost', (route) => route.abort())
    await page.route((url) => url.pathname.startsWith(`${API_PREFIX}/`), (route) => this.handle(route))
    await page.routeWebSocket(
      (url) => url.pathname.startsWith(`${WS_PREFIX}/v1/builds/ws/`),
      (ws) => {
        const buildId = new URL(ws.url()).pathname.split('/').pop() ?? ''
        this.sockets.push({ buildId, ws })
        // Fully mocked: no real server. Client messages are ignored, as the
        // real build socket only pushes.
        ws.onMessage(() => {})
      },
    )
  }

  /** The n-th (1-based) socket the page opened for this build, once it exists. */
  async socket(buildId: string, n = 1): Promise<WebSocketRoute> {
    await expect
      .poll(() => this.sockets.filter((s) => s.buildId === buildId).length, {
        message: `socket #${n} for ${buildId}`,
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(n)
    return this.sockets.filter((s) => s.buildId === buildId)[n - 1].ws
  }

  socketIds(): string[] {
    return this.sockets.map((s) => s.buildId)
  }

  private async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.slice(API_PREFIX.length)
    const method = req.method()
    let body: unknown = null
    try {
      body = req.postDataJSON()
    } catch {
      body = req.postData()
    }
    this.requests.push({ method, path, body })
    const reply = this.reply(method, path, body)
    await route.fulfill({ status: reply.status, contentType: 'application/json', body: JSON.stringify(reply.body) })
  }

  private reply(method: string, path: string, body: unknown): Reply {
    const ok = (b: unknown): Reply => ({ status: 200, body: b })
    const notFound: Reply = { status: 404, body: { detail: 'Not Found' } }
    let m: RegExpMatchArray | null

    if (method === 'GET' && path === '/v1/auth/me') return ok(this.user)
    if (method === 'GET' && path === '/v1/auth/csrf-token') return ok({ csrf_token: 'csrf-test' })
    if (method === 'POST' && path === '/v1/auth/ws-token') return ok({ token: 'ws-test-token' })
    if (method === 'GET' && path === '/growth/notifications') return ok({ notifications: [] })
    if (method === 'GET' && path === '/projects/') return ok({ projects: [this.project] })
    if (method === 'GET' && path === `/projects/${this.project.id}`) return ok(this.project)
    if (method === 'GET' && path === `/projects/${this.project.id}/builds`) {
      const builds = this.projectBuilds.map((id) => {
        const d = this.build(id).doc
        return { id, prompt: d.prompt, status: d.status, created_at: d.created_at }
      })
      return ok({ builds, total: builds.length, page: 1, per_page: 20 })
    }
    if (method === 'POST' && path === '/v1/builds/') {
      return this.onCreateBuild(body as { project_id: string; prompt: string })
    }
    if ((m = path.match(/^\/v1\/builds\/([^/]+)$/)) && method === 'GET') {
      const b = this.builds.get(m[1])
      return b ? ok(b.doc) : notFound
    }
    if ((m = path.match(/^\/v1\/builds\/([^/]+)\/files$/)) && method === 'GET') {
      const b = this.builds.get(m[1])
      return b ? ok(b.files) : notFound
    }
    if ((m = path.match(/^\/v1\/builds\/([^/]+)\/collaboration$/)) && method === 'GET') {
      const b = this.builds.get(m[1])
      return b?.collaboration ? ok(b.collaboration) : notFound
    }
    if ((m = path.match(/^\/v1\/builds\/([^/]+)\/gate$/)) && method === 'POST') {
      const b = this.builds.get(m[1])
      const gate = b?.doc.pending_gate as { gate_id?: string; response?: unknown } | null | undefined
      const gateId = (body as { gate_id?: string })?.gate_id
      if (!gate || gate.gate_id !== gateId) return { status: 409, body: { detail: 'No matching pending gate' } }
      gate.response = body
      return ok({ status: 'ok' })
    }
    this.unmocked.push(`${method} ${path}`)
    return notFound
  }
}

let seq = 0
export function wsEvent(buildId: string, type: string, data: unknown) {
  seq += 1
  const at = new Date(Date.UTC(2026, 10, 22, 10, 0, seq)).toISOString().replace('Z', '')
  return JSON.stringify({ type, build_id: buildId, version: 1, timestamp: at, data })
}
