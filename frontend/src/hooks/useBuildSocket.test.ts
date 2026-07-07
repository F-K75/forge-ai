import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBuildSocket } from './useBuildSocket'

vi.mock('../lib/api', () => ({
  api: {
    post: vi.fn(),
  },
}))

const WS_URL = 'ws://localhost:8000'

describe('useBuildSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('WebSocket', class extends EventTarget {
      static instances: any[] = []
      static handlers: Map<any, Record<string, any>> = new Map()

      constructor(url: string) {
        super()
        WebSocket.instances.push(this)
        this.url = url
        this.readyState = 0
      }

      get readyState() { return this._readyState }
      set readyState(v: number) { this._readyState = v }

      send(_data: any) {}
      close() {
        this._readyState = 3
        setTimeout(() => {
          const handler = WebSocket.handlers.get(this)
          if (handler?.onclose) handler.onclose(new Event('close'))
        }, 0)
      }
    } as any)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not connect when buildId is null', () => {
    const { result } = renderHook(() => useBuildSocket(null))
    expect(result.current.connectionStatus).toBe('offline')
    expect(WebSocket.instances).toHaveLength(0)
  })

  it('connects when buildId is provided', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { token: 'tok' } })
    const { result } = renderHook(() => useBuildSocket('build-1'))
    await act(async () => { await Promise.resolve() })
    expect(result.current.connectionStatus).toBe('connecting')
    expect(WebSocket.instances).toHaveLength(1)
    expect(WebSocket.instances[0].url).toBe(`${WS_URL}/builds/ws/build-1`)
  })

  it('sets online status on ws open', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { token: 'tok' } })
    const { result } = renderHook(() => useBuildSocket('build-1'))
    await act(async () => { await Promise.resolve() })
    const ws = WebSocket.instances[0]
    act(() => {
      ws.readyState = 1
      ws.onopen?.(new Event('open'))
    })
    expect(result.current.connectionStatus).toBe('online')
  })

  it('closes socket when buildId changes', async () => {
    const { api } = await import('../lib/api')
    vi.mocked(api.post).mockResolvedValueOnce({ data: { token: 'tok' } })
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => useBuildSocket(id), {
      initialProps: { id: 'build-1' },
    })
    await act(async () => { await Promise.resolve() })
    const firstWs = WebSocket.instances[0]
    const firstCloseSpy = vi.spyOn(firstWs, 'close')
    rerender({ id: 'build-2' })
    await act(async () => { await Promise.resolve() })
    expect(firstCloseSpy).toHaveBeenCalled()
  })
})
