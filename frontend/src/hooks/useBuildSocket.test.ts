import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuildSocket } from './useBuildSocket'
import { useBuildStore } from '../store/buildStore'

vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

const { sync } = vi.hoisted(() => ({
  sync: {
    hydrateBuild: vi.fn(),
    confirmTerminalStatus: vi.fn(),
  },
}))
vi.mock('../lib/buildSync', () => sync)

const WS_URL = 'ws://localhost:8000'

class MockWebSocket extends EventTarget {
  static instances: any[] = []
  static handlers: Map<any, Record<string, any>> = new Map()

  url: string
  protocols: string[] = []
  _readyState: number = 0

  constructor(url: string, protocols?: string[]) {
    super()
    MockWebSocket.instances.push(this)
    this.url = url
    this.protocols = protocols ?? []
    this.readyState = 0
  }

  get readyState() { return this._readyState }
  set readyState(v: number) { this._readyState = v }

  send(_data: any) {}
  close() {
    this._readyState = 3
    setTimeout(() => {
      const handler = MockWebSocket.handlers.get(this)
      if (handler?.onclose) handler.onclose(new Event('close'))
    }, 0)
  }
}

describe('useBuildSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockWebSocket.instances = []
    MockWebSocket.handlers = new Map()
    vi.stubGlobal('WebSocket', MockWebSocket as any)
    sync.hydrateBuild.mockResolvedValue(true)
    sync.confirmTerminalStatus.mockResolvedValue(true)
    useBuildStore.getState().reset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not connect when buildId is null', () => {
    const { result } = renderHook(() => useBuildSocket(null))
    expect(result.current.connectionStatus).toBe('offline')
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('connects when buildId is provided', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { token: 'tok' } })
    const { result } = renderHook(() => useBuildSocket('build-1'))
    await act(async () => { await Promise.resolve() })
    expect(result.current.connectionStatus).toBe('connecting')
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toBe(`${WS_URL}/v1/builds/ws/build-1`)
    expect(MockWebSocket.instances[0].protocols).toEqual(['tok'])
  })

  it('sets online status on ws open', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { token: 'tok' } })
    const { result } = renderHook(() => useBuildSocket('build-1'))
    await act(async () => { await Promise.resolve() })
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.readyState = 1
      ws.onopen?.(new Event('open'))
    })
    expect(result.current.connectionStatus).toBe('online')
  })

  it('closes socket when buildId changes', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { token: 'tok' } })
    const { rerender } = renderHook(({ id }: { id: string | null }) => useBuildSocket(id), {
      initialProps: { id: 'build-1' },
    })
    await act(async () => { await Promise.resolve() })
    const firstWs = MockWebSocket.instances[0]
    const firstCloseSpy = vi.spyOn(firstWs, 'close')
    rerender({ id: 'build-2' })
    await act(async () => { await Promise.resolve() })
    expect(firstCloseSpy).toHaveBeenCalled()
  })

  const event = (type: string, data: unknown, build_id = 'build-1') =>
    ({ data: JSON.stringify({ type, build_id, version: 1, data }) }) as MessageEvent

  async function openSocket() {
    const { api } = await import('../lib/api')
    vi.mocked(api.post).mockResolvedValue({ data: { token: 'tok' } })
    const hook = renderHook(() => useBuildSocket('build-1'))
    await act(async () => { await Promise.resolve() })
    return { hook, ws: MockWebSocket.instances[MockWebSocket.instances.length - 1] }
  }

  it('hydrates from the REST state on open, holding events until the snapshot is applied', async () => {
    let finishHydration: (v: boolean) => void = () => {}
    sync.hydrateBuild.mockImplementationOnce(() => new Promise<boolean>(r => { finishHydration = r }))
    useBuildStore.getState().attachBuild('build-1')
    const { ws } = await openSocket()
    act(() => { ws.onopen?.(new Event('open')) })
    expect(sync.hydrateBuild).toHaveBeenCalledWith('build-1')

    act(() => { ws.onmessage?.(event('file_update', { delta: { changed: { 'a.ts': '1' }, deleted: [] } })) })
    // Held: not applied before the snapshot.
    expect(useBuildStore.getState().files).toEqual({})

    await act(async () => { finishHydration(true); await Promise.resolve(); await Promise.resolve() })
    expect(useBuildStore.getState().files).toEqual({ 'a.ts': '1' })

    // After the snapshot, events apply directly.
    act(() => { ws.onmessage?.(event('file_update', { delta: { changed: { 'b.ts': '2' }, deleted: [] } })) })
    expect(useBuildStore.getState().files).toEqual({ 'a.ts': '1', 'b.ts': '2' })
  })

  it('re-hydrates on every reconnect', async () => {
    vi.useFakeTimers()
    try {
      const { ws } = await openSocket()
      act(() => { ws.onopen?.(new Event('open')) })
      expect(sync.hydrateBuild).toHaveBeenCalledTimes(1)
      act(() => { ws.onclose?.(new Event('close')) })
      await act(async () => { await vi.advanceTimersByTimeAsync(600) })
      const second = MockWebSocket.instances[MockWebSocket.instances.length - 1]
      expect(second).not.toBe(ws)
      act(() => { second.onopen?.(new Event('open')) })
      expect(sync.hydrateBuild).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('confirms a terminal event against the persisted state, but not a deployment event', async () => {
    const { ws } = await openSocket()
    await act(async () => { ws.onopen?.(new Event('open')); await Promise.resolve(); await Promise.resolve() })
    act(() => { ws.onmessage?.(event('build_complete', { deployment_id: 'd1', status: 'live' })) })
    expect(sync.confirmTerminalStatus).not.toHaveBeenCalled()
    act(() => { ws.onmessage?.(event('build_complete', { files: {} })) })
    expect(sync.confirmTerminalStatus).toHaveBeenCalledWith('build-1')
  })

  it('ignores events for another build', async () => {
    useBuildStore.getState().attachBuild('build-1')
    const { ws } = await openSocket()
    await act(async () => { ws.onopen?.(new Event('open')); await Promise.resolve(); await Promise.resolve() })
    act(() => { ws.onmessage?.(event('file_update', { delta: { changed: { 'x.ts': '1' }, deleted: [] } }, 'other')) })
    expect(useBuildStore.getState().files).toEqual({})
  })

  it('still shows the persisted state when no socket token can be obtained', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.post).mockRejectedValueOnce(new Error('401'))
    const { result } = renderHook(() => useBuildSocket('build-1'))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(result.current.connectionStatus).toBe('error')
    expect(sync.hydrateBuild).toHaveBeenCalledWith('build-1')
  })
})
