import { useEffect, useRef, useCallback, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { parseOrgWSEvent, type AnyOrgWSEvent } from "../lib/orgWsContract"
import { api } from "../lib/api"

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000"

// Same shape as hooks/usePMSocket.ts (ws-token handshake, exponential
// backoff reconnect, generation-guarded cleanup) applied to the
// project_id-scoped engineering-org channel -- see
// backend/api/agent_registry.py's `@router.websocket("/ws")` (mounted under
// the `/projects/{project_id}/org` router, itself mounted under the global
// `/v1` prefix in backend/api/v1.py, giving the full path used below) and
// backend/services/org_ws_manager.py's authenticate_org_websocket.
//
// EngineeringOrgPage has no Zustand store like usePMStore -- every panel is
// local component state seeded from its own useQuery (via a
// useEffect([data]) resync, already present in each panel). So instead of
// exposing a handleEvent callback for a store to consume, this hook owns
// TanStack Query invalidation directly: on a valid OrgEvent it invalidates
// the query key(s) that event affects, the panel's useQuery refetches, and
// the panel's existing resync effect picks up the fresh data automatically.
export function useOrgSocket(projectId: string | null) {
  const wsRef = useRef<WebSocket | null>(null)
  const generationRef = useRef(0)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<"offline" | "connecting" | "online" | "error">("offline")

  const queryClient = useQueryClient()

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  const handleEvent = useCallback(
    (event: AnyOrgWSEvent) => {
      const pid = event.project_id
      // The activity timeline is a read-time projection over the same
      // records every other event type here already touches (decision
      // logs, change request history, plan decisions, findings, chat) --
      // so rather than mapping each event type to it individually, any
      // valid org event means "the timeline may have grown."
      queryClient.invalidateQueries({ queryKey: ["agent-org-activity", pid] })
      switch (event.type) {
        case "message_posted":
          queryClient.invalidateQueries({ queryKey: ["agent-org-chat", pid] })
          break
        case "change_request_updated":
          queryClient.invalidateQueries({ queryKey: ["agent-org-changes", pid] })
          // A change request's stage move changes whether it counts toward
          // its author's/reviewers' open workload -- see
          // backend/agent_registry/workload.py's get_workload(), which
          // derives open_change_requests_authored/pending_reviews from
          // change_requests.stage.
          queryClient.invalidateQueries({ queryKey: ["agent-org-workload", pid] })
          break
        case "finding_recorded":
        case "finding_resolved":
          // The findings query key also carries statusFilter/categoryFilter
          // (["agent-org-findings", projectId, statusFilter, categoryFilter]),
          // so match by prefix regardless of the panel's current filters.
          queryClient.invalidateQueries({ queryKey: ["agent-org-findings", pid], exact: false })
          break
        case "plan_created":
          queryClient.invalidateQueries({ queryKey: ["agent-org-plans", pid] })
          break
        case "plan_decided":
          queryClient.invalidateQueries({ queryKey: ["agent-org-plans", pid] })
          // Only APPROVED plans' tasks count toward open_plan_tasks in
          // workload.py -- a draft->approved/rejected decision changes that
          // count for every assigned agent, so the workload view needs a
          // refetch too (plan_created alone never does: new plans start in
          // DRAFT and aren't counted yet).
          queryClient.invalidateQueries({ queryKey: ["agent-org-workload", pid] })
          break
      }
    },
    [queryClient]
  )

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
      setConnectionStatus("connecting")

      const maxAttempts = 8
      const baseDelayMs = 500
      const maxDelayMs = 10_000

      const connectOnce = async () => {
        if (generationRef.current !== gen) return

        let wsToken: string | null = null
        try {
          const { data } = await api.post("/auth/ws-token")
          wsToken = data.token
        } catch {
          setConnectionStatus("error")
          return
        }

        if (!wsToken) {
          setConnectionStatus("error")
          return
        }

        const ws = new WebSocket(`${WS_URL}/v1/projects/${id}/org/ws?token=${encodeURIComponent(wsToken)}`)
        wsRef.current = ws

        ws.onopen = () => {
          reconnectAttemptsRef.current = 0
          setConnectionStatus("online")
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
          const event = parseOrgWSEvent(parsed)
          if (!event) return
          if (event.project_id !== id) return
          handleEvent(event)
        }

        ws.onerror = () => setConnectionStatus("error")

        ws.onclose = () => {
          wsRef.current = null
          if (generationRef.current !== gen) return
          const attempt = ++reconnectAttemptsRef.current
          if (attempt > maxAttempts) {
            setConnectionStatus("offline")
            return
          }
          clearReconnectTimeout()
          const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
          setConnectionStatus("offline")
          reconnectTimeoutRef.current = window.setTimeout(connectOnce, delay)
        }
      }

      connectOnce()
    },
    [handleEvent, clearReconnectTimeout]
  )

  useEffect(() => {
    if (!projectId) return
    connect(projectId)
    return () => {
      generationRef.current += 1
      clearReconnectTimeout()
      wsRef.current?.close()
    }
  }, [projectId, connect, clearReconnectTimeout])

  return { connectionStatus }
}
