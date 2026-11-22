import { create } from 'zustand'
import {
  mergeEntry,
  mergeEscalation,
  mergeMessage,
  normalizeMessage,
  upsertById,
  type BlackboardEntry,
  type CollaborationBudget,
  type CollaborationSnapshot,
  type CollabMessage,
  type Escalation,
} from '../lib/collabContract'

/**
 * Collaboration lanes of one build (protocol v2, docs/architecture/
 * collaboration-protocol-v2.md): agent messages (Activity), blackboard
 * entries (Decisions) and escalations (Escalations).
 *
 * Filled by hydration (GET /builds/{id}/collaboration on every (re)connect)
 * and by events forwarded from buildStore.handleEvent. Every write goes
 * through the monotonic merge in lib/collabContract.ts: records are
 * de-duplicated by id and never move back to an earlier state, whichever of
 * the snapshot or a (possibly stale or replayed) event arrives last.
 */
export interface CollaborationState {
  buildId: string | null
  /** 1 for legacy builds (messages only); 2 when the build runs protocol v2. */
  protocolVersion: number
  messages: CollabMessage[]
  decisions: BlackboardEntry[]
  escalations: Escalation[]
  budget: CollaborationBudget | null
  hydrated: boolean

  reset: (buildId?: string | null) => void
  hydrate: (buildId: string, snapshot: CollaborationSnapshot) => void
  applyMessage: (raw: unknown) => void
  applyDecision: (entry: BlackboardEntry) => void
  applyEscalation: (escalation: Escalation) => void
}

const messageId = (m: CollabMessage) => m.message_id
const entryId = (e: BlackboardEntry) => e.entry_id
const escalationId = (e: Escalation) => e.escalation_id

const empty = (buildId: string | null = null) => ({
  buildId,
  protocolVersion: 1,
  messages: [] as CollabMessage[],
  decisions: [] as BlackboardEntry[],
  escalations: [] as Escalation[],
  budget: null,
  hydrated: false,
})

export const useCollaborationStore = create<CollaborationState>((set) => ({
  ...empty(),

  reset: (buildId = null) => set(empty(buildId)),

  hydrate: (buildId, snapshot) =>
    set((state) => {
      // A snapshot for another build (e.g. a slow response after the user
      // started a new build) must not leak into this one.
      if (state.buildId !== null && state.buildId !== buildId) return state
      let { messages, decisions, escalations } = state
      for (const m of snapshot.messages) messages = upsertById(messages, m, messageId, mergeMessage)
      for (const d of snapshot.decisions) decisions = upsertById(decisions, d, entryId, mergeEntry)
      for (const e of snapshot.escalations) escalations = upsertById(escalations, e, escalationId, mergeEscalation)
      const v2Seen = messages.some((m) => m.protocol_version >= 2) || decisions.length > 0 || escalations.length > 0
      return {
        buildId,
        protocolVersion: Math.max(state.protocolVersion, snapshot.protocol_version, v2Seen ? 2 : 1),
        messages,
        decisions,
        escalations,
        budget: snapshot.budget ?? state.budget,
        hydrated: true,
      }
    }),

  applyMessage: (raw) =>
    set((state) => {
      const message = normalizeMessage(raw)
      if (!message) return state
      const messages = upsertById(state.messages, message, messageId, mergeMessage)
      const protocolVersion = Math.max(state.protocolVersion, message.protocol_version)
      if (messages === state.messages && protocolVersion === state.protocolVersion) return state
      return { messages, protocolVersion }
    }),

  applyDecision: (entry) =>
    set((state) => {
      const decisions = upsertById(state.decisions, entry, entryId, mergeEntry)
      if (decisions === state.decisions && state.protocolVersion >= 2) return state
      return { decisions, protocolVersion: Math.max(state.protocolVersion, 2) }
    }),

  applyEscalation: (escalation) =>
    set((state) => {
      const escalations = upsertById(state.escalations, escalation, escalationId, mergeEscalation)
      if (escalations === state.escalations && state.protocolVersion >= 2) return state
      return { escalations, protocolVersion: Math.max(state.protocolVersion, 2) }
    }),
}))
