import { useEffect, useRef, useCallback, useState } from 'react'
import { useReviewStore } from '../store/reviewStore'
import { parseReviewWSEvent } from '../lib/reviewWsContract'
import { reviewSocketUrl } from '../lib/orchestratorApi'

export function useReviewSocket(runId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const generationRef = useRef(0)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<'offline' | 'connecting' | 'online' | 'error'>('offline')

  const { handleEvent } = useReviewStore()

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const connect = useCallback(
    (id: string) => {
      const url = reviewSocketUrl(id)
      if (!url) {
        setConnectionStatus('offline')
        return
      }

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

        const currentUrl = reviewSocketUrl(id)
        if (!currentUrl) {
          setConnectionStatus('offline')
          return
        }

        const ws = new WebSocket(currentUrl)
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

          const event = parseReviewWSEvent(parsed)
          if (!event) return

          // The server pushes {"type":"ping"} every 30s purely to keep proxies
          // from dropping the idle socket — nothing for the store to do.
          if (event.type === 'ping') return

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
    if (!runId || !reviewSocketUrl(runId)) {
      setConnectionStatus('offline')
      return
    }
    connect(runId)
    return () => {
      generationRef.current += 1
      clearReconnectTimeout()
      wsRef.current?.close()
    }
  }, [runId, connect, clearReconnectTimeout])

  return { ws: wsRef.current, connectionStatus }
}
