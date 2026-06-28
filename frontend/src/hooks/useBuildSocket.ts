import { useEffect, useRef, useCallback, useState } from 'react'
import { useBuildStore } from '../store/buildStore'
import { parseWSEvent } from '../lib/wsContract'


// Vite env typing fallback (prevents TS error in some toolchains)
const WS_URL = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8000'

export function useBuildSocket(buildId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const generationRef = useRef(0)
  const reconnectAttemptsRef = useRef(0)
  const [connectionStatus, setConnectionStatus] = useState<'offline' | 'connecting' | 'online' | 'error'>('offline')

  const { handleEvent } = useBuildStore()

  const connect = useCallback(
    (id: string) => {
      if (!id) return

      // Close any previous socket to avoid duplicate subscriptions.
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

        const ws = new WebSocket(`${WS_URL}/builds/ws/${id}`)
        wsRef.current = ws

        const heartbeat = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            // Backend ignores payloads, so keep it best-effort.
            ws.send('ping')
          }
        }, 30_000)

        ws.onopen = () => {
          clearInterval(heartbeat)
          // restart heartbeat on open (interval should continue)
          const hb = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send('ping')
          }, 30_000)
          ;(ws as any).__hb = hb
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

          // Guard: ignore events for other builds.
          if (event.build_id !== id) return

          handleEvent(event)
        }

        ws.onerror = () => {
          setConnectionStatus('error')
        }

        ws.onclose = () => {
          const hb = (ws as any).__hb
          if (hb) clearInterval(hb)
          wsRef.current = null
          if (generationRef.current !== gen) return

          const attempt = ++reconnectAttemptsRef.current
          if (attempt > maxAttempts) {
            setConnectionStatus('offline')
            return
          }

          const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
          setConnectionStatus('offline')
          window.setTimeout(connectOnce, delay)
        }
      }

      connectOnce()
    },
    [handleEvent]
  )

  useEffect(() => {
    if (!buildId) return
    connect(buildId)
    return () => {
      // Invalidate current generation so reconnect stops.
      generationRef.current += 1
      wsRef.current?.close()
    }
  }, [buildId, connect])

  return { ws: wsRef.current, connectionStatus }

}


