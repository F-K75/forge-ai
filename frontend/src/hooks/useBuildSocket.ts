import { useEffect, useRef, useCallback } from 'react'
import { useBuildStore } from '../store/buildStore'

// Vite env typing fallback (prevents TS error in some toolchains)
const WS_URL = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8000'

export function useBuildSocket(buildId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const { handleEvent } = useBuildStore()

  const connect = useCallback((id: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(`${WS_URL}/builds/ws/${id}`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        handleEvent(event)
      } catch (err) {
        console.error('WS parse error', err)
      }
    }

    ws.onerror = (e) => console.error('WS error', e)
    ws.onclose = () => {
      wsRef.current = null
    }

    // Keep-alive ping
    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping')
      }
    }, 30_000)

    ws.onclose = () => {
      clearInterval(ping)
      wsRef.current = null
    }
  }, [handleEvent])

  useEffect(() => {
    if (!buildId) return
    connect(buildId)
    return () => {
      wsRef.current?.close()
    }
  }, [buildId, connect])

  return { ws: wsRef.current }
}
