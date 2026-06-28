import { useEffect, useRef, useCallback, useState } from 'react'
import { useBuildStore } from '../store/buildStore'
import { parseWSEvent } from '../lib/wsContract'

const WS_URL = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8000'

export function useBuildSocket(buildId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<number | null>(null)
  const generationRef = useRef(0)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'offline' | 'connecting' | 'online' | 'error'>('offline')

  const { handleEvent } = useBuildStore()

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [])

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

      const connectOnce = () => {
        if (generationRef.current !== gen) return

        const token = (document.cookie || "")
          .split(';')
          .map(c => c.trim())
          .find(c => c.startsWith('access_token='))
          ?.split('=')[1]

        // Backend expects token via query param; fail closed if token missing.
        const ws = new WebSocket(`${WS_URL}/builds/ws/${id}?token=${encodeURIComponent(token || '')}`)

        wsRef.current = ws

        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
          }
        }, 30_000)

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
          clearHeartbeat()
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
    [handleEvent, clearHeartbeat, clearReconnectTimeout]
  )

  useEffect(() => {
    if (!buildId) return
    connect(buildId)
    return () => {
      generationRef.current += 1
      clearHeartbeat()
      clearReconnectTimeout()
      wsRef.current?.close()
    }
  }, [buildId, connect, clearHeartbeat, clearReconnectTimeout])

  return { ws: wsRef.current, connectionStatus }
}