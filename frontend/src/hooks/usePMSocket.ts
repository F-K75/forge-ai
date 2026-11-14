import { useEffect, useRef, useCallback, useState } from 'react'
import { usePMStore } from '../store/pmStore'
import { parsePMWSEvent } from '../lib/pmWsContract'
import { api } from '../lib/api'
import { resolveWsBaseUrl } from '../lib/wsUrl'

const WS_URL = resolveWsBaseUrl()

// Same shape as hooks/useBuildSocket.ts (ws-token handshake, exponential
// backoff reconnect, generation-guarded cleanup) applied to the
// initiative-scoped channel instead of the build-scoped one.
export function usePMSocket(initiativeId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const generationRef = useRef(0)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'offline' | 'connecting' | 'online' | 'error'>('offline')

  const { handleEvent } = usePMStore()

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const connect = useCallback(
    (id: string) => {
      if (!id) return
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        try {
          wsRef.current.close()
        } catch {
          // ignore
        }
      }

      const gen = ++generationRef.current
      reconnectAttemptsRef.current = 0
      setConnectionStatus('connecting')

      const maxAttempts = 8
      const baseDelayMs = 500
      const maxDelayMs = 10_000

      const connectOnce = async () => {
        if (generationRef.current !== gen) return

        let wsToken: string | null = null
        try {
          const { data } = await api.post('/v1/auth/ws-token')
          wsToken = data.token
        } catch {
          setConnectionStatus('error')
          return
        }

        if (!wsToken) {
          setConnectionStatus('error')
          return
        }

        const ws = new WebSocket(`${WS_URL}/v1/initiatives/ws/${id}`, [wsToken])
        wsRef.current = ws

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0
          setConnectionStatus('online')
        }

        ws.onmessage = e => {
          const parsed = (() => {
            try {
              return JSON.parse(e.data)
            } catch {
              return null
            }
          })()
          if (!parsed) return
          const event = parsePMWSEvent(parsed)
          if (!event) return
          if (event.initiative_id !== id) return
          handleEvent(event)
        }

        ws.onerror = () => setConnectionStatus('error')

        ws.onclose = () => {
          wsRef.current = null
          if (generationRef.current !== gen) return
          const attempt = ++reconnectAttemptsRef.current
          if (attempt > maxAttempts) {
            setConnectionStatus('offline')
            return
          }
          clearReconnectTimeout()
          const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
          setConnectionStatus('offline')
          reconnectTimeoutRef.current = window.setTimeout(connectOnce, delay)
        }
      }

      connectOnce()
    },
    [handleEvent, clearReconnectTimeout]
  )

  useEffect(() => {
    if (!initiativeId) return
    connect(initiativeId)
    return () => {
      generationRef.current += 1
      clearReconnectTimeout()
      wsRef.current?.close()
    }
  }, [initiativeId, connect, clearReconnectTimeout])

  return { connectionStatus }
}
