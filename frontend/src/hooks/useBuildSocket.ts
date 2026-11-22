import { useEffect, useRef, useCallback, useState } from 'react'
import { useBuildStore } from '../store/buildStore'
import { parseWSEvent, type AnyWSEvent } from '../lib/wsContract'
import { api } from '../lib/api'
import { resolveWsBaseUrl } from '../lib/wsUrl'
import { confirmTerminalStatus, hydrateBuild } from '../lib/buildSync'

const WS_URL = resolveWsBaseUrl()

export type BuildConnectionStatus = 'offline' | 'connecting' | 'online' | 'error'

const isTerminalBuildEvent = (event: AnyWSEvent) =>
  (event.type === 'build_complete' || event.type === 'build_failed') &&
  // Deployment events reuse these types on the same channel.
  typeof (event.data as { deployment_id?: unknown })?.deployment_id !== 'string'

/**
 * Follows one build over its WebSocket. On every (re)connect the build is
 * hydrated from the REST state first; events that arrive meanwhile are held
 * and applied, in order, on top of that snapshot. Without this a reconnect
 * (or a reload) showed only whatever events happened to arrive afterwards.
 */
export function useBuildSocket(buildId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const generationRef = useRef(0)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<BuildConnectionStatus>('offline')

  // A selector, not the whole store: this hook's owner must not re-render
  // on every streamed token.
  const handleEvent = useBuildStore((s) => s.handleEvent)

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

      const apply = (event: AnyWSEvent) => {
        if (generationRef.current !== gen) return
        handleEvent(event)
        if (isTerminalBuildEvent(event)) void confirmTerminalStatus(id)
      }

      const connectOnce = async () => {
        if (generationRef.current !== gen) return

        let wsToken: string | null = null
        try {
          const { data } = await api.post('/v1/auth/ws-token')
          wsToken = data.token
        } catch {
          wsToken = null
        }

        if (generationRef.current !== gen) return
        if (!wsToken) {
          setConnectionStatus('error')
          // No live channel, but the persisted state can still be shown.
          void hydrateBuild(id)
          return
        }

        // Auth travels in the Sec-WebSocket-Protocol subprotocol so it never
        // appears in URLs/access logs; the server rejects unauthenticated
        // upgrades before accepting the socket.
        const ws = new WebSocket(`${WS_URL}/v1/builds/ws/${id}`, [wsToken])

        wsRef.current = ws

        // Events held while this connection's snapshot is being fetched.
        let buffer: AnyWSEvent[] | null = null

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0
          setConnectionStatus('online')
          const held: AnyWSEvent[] = []
          buffer = held
          void hydrateBuild(id).finally(() => {
            if (buffer === held) buffer = null
            for (const event of held) apply(event)
          })
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

          if (buffer) buffer.push(event)
          else apply(event)
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
            void hydrateBuild(id)
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
