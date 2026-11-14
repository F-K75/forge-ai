import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('api client', () => {
  let api: typeof import('./api').api
  let reposApi: typeof import('./api').reposApi

  beforeEach(async () => {
    vi.resetModules()
    const mod = await import('./api')
    api = mod.api
    reposApi = mod.reposApi
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an axios instance with credentials and a JSON content type', () => {
    expect(api.defaults.baseURL).toBeTruthy()
    expect(api.defaults.withCredentials).toBe(true)
    const headers = JSON.stringify(api.defaults.headers ?? {})
    expect(headers).toContain('application/json')
  })

  it('attaches an X-CSRF-Token header on mutating requests to protected paths', async () => {
    let captured: any = null
    api.defaults.adapter = (async (config: any) => {
      captured = config
      return {
        data: config.url === '/v1/auth/csrf-token' ? { csrf_token: 'tok-abc' } : {},
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }) as any

    await api.post('/projects/', { name: 'demo' })

    expect(captured).not.toBeNull()
    expect(captured.headers['X-CSRF-Token']).toBe('tok-abc')
  })

  it('does NOT attach a CSRF header for exempt auth paths', async () => {
    let captured: any = null
    api.defaults.adapter = (async (config: any) => {
      captured = config
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
    }) as any

    await api.post('/auth/login', { email: 'a@b.com', password: 'pw' })

    expect(captured.headers['X-CSRF-Token']).toBeUndefined()
  })

  it('does NOT attach a CSRF header for GET requests', async () => {
    let captured: any = null
    api.defaults.adapter = (async (config: any) => {
      captured = config
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
    }) as any

    await api.get('/projects/')

    expect(captured.headers['X-CSRF-Token']).toBeUndefined()
  })

  it('propagates rejected responses so callers can handle the error', async () => {
    api.defaults.adapter = (async () => {
      return Promise.reject({
        response: { status: 500, data: { detail: 'boom' } },
        config: {},
        isAxiosError: true,
      })
    }) as any

    await expect(api.get('/projects/')).rejects.toBeTruthy()
  })

  it('posts reposApi.import to /v1/repos/import with the repository payload', async () => {
    let captured: any = null
    api.defaults.adapter = (async (config: any) => {
      if (config.url !== '/v1/auth/csrf-token') {
        captured = config
      }
      return {
        data: config.url === '/v1/auth/csrf-token' ? { csrf_token: 'tok-repo' } : { project_id: 'proj-1' },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }) as any

    const payload = { repo_url: 'https://github.com/acme/forge', project_name: 'forge', branch: 'main' }
    const result = await reposApi.import(payload)

    expect(result).toEqual({ project_id: 'proj-1' })
    expect(captured).not.toBeNull()
    expect(captured.method).toBe('post')
    expect(captured.url).toBe('/v1/repos/import')
    expect(JSON.parse(captured.data)).toEqual(payload)
  })
})
