import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuildSocket } from './useBuildSocket'

vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

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
    expect(MockWebSocket.instances[0].url).toBe(`${WS_URL}/builds/ws/build-1`)
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
})
