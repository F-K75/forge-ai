import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReviewSocket } from './useReviewSocket'
import * as orchestratorApiModule from '../lib/orchestratorApi'

describe('useReviewSocket', () => {
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket
  })

  it('does not open a WebSocket when orchestrator is unconfigured', () => {
    const wsConstructorSpy = vi.fn()
    globalThis.WebSocket = wsConstructorSpy as unknown as typeof WebSocket

    const { result } = renderHook(() => useReviewSocket('run-test-456'))

    expect(result.current.connectionStatus).toBe('offline')
    expect(result.current.ws).toBeNull()
    expect(wsConstructorSpy).not.toHaveBeenCalled()
  })

  it('does not open a WebSocket when runId is null', () => {
    const wsConstructorSpy = vi.fn()
    globalThis.WebSocket = wsConstructorSpy as unknown as typeof WebSocket

    const { result } = renderHook(() => useReviewSocket(null))

    expect(result.current.connectionStatus).toBe('offline')
    expect(result.current.ws).toBeNull()
    expect(wsConstructorSpy).not.toHaveBeenCalled()
  })

  it('attempts connection only when reviewSocketUrl returns a valid url', () => {
    const mockWs = {
      readyState: 0,
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
    }
    const wsConstructorSpy = vi.fn().mockImplementation(() => mockWs)
    globalThis.WebSocket = wsConstructorSpy as unknown as typeof WebSocket

    vi.spyOn(orchestratorApiModule, 'reviewSocketUrl').mockReturnValue(
      'ws://custom-orchestrator.internal/reviews/run-abc/stream'
    )

    const { result } = renderHook(() => useReviewSocket('run-abc'))

    expect(wsConstructorSpy).toHaveBeenCalledWith(
      'ws://custom-orchestrator.internal/reviews/run-abc/stream'
    )
    expect(result.current.connectionStatus).toBe('connecting')
  })
})
