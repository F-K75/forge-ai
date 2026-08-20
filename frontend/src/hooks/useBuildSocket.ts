import { useEffect, useRef, useCallback, useState } from 'react'
import { useBuildStore } from '../store/buildStore'
import { parseWSEvent } from '../lib/wsContract'
import { api } from '../lib/api'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000'

export function useBuildSocket(buildId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const generationRef = useRef(0)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'offline' | 'connecting' | 'online' | 'error'>('offline')

  const { handleEvent } = useBuildStore()

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

        // Auth travels in the Sec-WebSocket-Protocol subprotocol so it never
        // appears in URLs/access logs; the server rejects unauthenticated
        // upgrades before accepting the socket.
        const ws = new WebSocket(`${WS_URL}/v1/builds/ws/${id}`, [wsToken])

        wsRef.current = ws

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0
          setConnectionStatus('online')
        }

        ws.onmessage = (e) => {
          const parsed = (() => {
            try {
              return JSON.parse(e.data)
            } catch {
              return null
            }
          })()

          if (!parsed) return

          const event = parseWSEvent(parsed)
          if (!event) return

          if (event.build_id !== id) return

          handleEvent(event)
        }

        ws.onerror = () => {
          setConnectionStatus('error')
        }

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
    if (!buildId) return
    connect(buildId)
    return () => {
      generationRef.current += 1
      clearReconnectTimeout()
      wsRef.current?.close()
    }
  }, [buildId, connect, clearReconnectTimeout])

  return { ws: wsRef.current, connectionStatus }
}