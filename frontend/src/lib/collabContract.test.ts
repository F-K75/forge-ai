import { describe, expect, it } from 'vitest'
import {
  legacyStatusToState,
  mergeEntry,
  mergeEscalation,
  mergeMessage,
  normalizeEntry,
  normalizeEscalation,
  normalizeMessage,
  normalizeSnapshot,
  snapshotFromBuildDoc,
} from './collabContract'

const raw = {
  message_id: 'm1',
  sender: 'developer',
  recipient: 'architect',
  question: 'Cents?',
  status: 'pending',
}

describe('legacy status mapping (Revision 1 §4.3)', () => {
  it.each([
    ['pending', 0, null, 'queued'],
    ['pending', 1, null, 'dispatched'],
    ['answered', 1, null, 'completed'],
    ['rejected', 0, null, 'rejected'],
    ['timeout', 1, null, 'timed_out'],
    ['failed', 1, 'interrupted', 'interrupted'],
    ['failed', 1, 'boom', 'failed'],
  ])('%s (attempts %s, reason %s) → %s', (status, attempts, reason, expected) => {
    expect(legacyStatusToState(status, attempts, reason)).toBe(expected)
  })
})

describe('normalizers', () => {
  it('normalizes a legacy message into the v2 shape', () => {
    const m = normalizeMessage(raw)!
    expect(m.state).toBe('queued')
    expect(m.lane).toBe('activity')
    expect(m.content).toBe('Cents?')
    expect(m.protocol_version).toBe(1)
  })

  it('prefers v2 content/state/lane when present', () => {
    const m = normalizeMessage({ ...raw, content: 'v2 body', state: 'dispatched', lane: 'decisions', protocol_version: 2 })!
    expect(m.content).toBe('v2 body')
    expect(m.state).toBe('dispatched')
    expect(m.lane).toBe('decisions')
  })

  it('returns null for unusable records', () => {
    expect(normalizeMessage({ sender: 'a' })).toBeNull()
    expect(normalizeEntry({ key: 'k' })).toBeNull()
    expect(normalizeEscalation({ subject: 's' })).toBeNull()
    expect(normalizeSnapshot('nope')).toBeNull()
  })

  it('normalizes the hydration payload', () => {
    const s = normalizeSnapshot({
      protocol_version: 2,
      messages: [raw, { junk: true }],
      decisions: [{ entry_id: 'e1', key: 'k', kind: 'risk', value: 'v', version: 2 }],
      escalations: [{ escalation_id: 'x1', subject: 's', options: ['a', 1], state: 'open' }],
      budget: { credits_used: 2, reserved_credits: 27, messages_used: 1, max_messages: 6 },
    })!
    expect(s.protocol_version).toBe(2)
    expect(s.messages).toHaveLength(1)
    expect(s.decisions[0].kind).toBe('risk')
    expect(s.escalations[0].options).toEqual(['a'])
    expect(s.budget).toEqual({ credits_used: 2, reserved_credits: 27, messages_used: 1, max_messages: 6 })
  })

  it('builds a legacy snapshot from a build document without collab_config', () => {
    const s = snapshotFromBuildDoc({ agent_messages: [raw] })
    expect(s.protocol_version).toBe(1)
    expect(s.messages).toHaveLength(1)
    expect(s.decisions).toEqual([])
  })
})

describe('monotonic merge', () => {
  const queued = normalizeMessage(raw)!
  const completed = normalizeMessage({ ...raw, status: 'answered', answer: 'Yes, integer cents.' })!

  it('advances a message forward', () => {
    expect(mergeMessage(queued, completed).state).toBe('completed')
  })

  it('never moves a message back to an earlier state', () => {
    const merged = mergeMessage(completed, queued)
    expect(merged).toBe(completed)
    expect(merged.answer).toBe('Yes, integer cents.')
  })

  it('keeps the first terminal state', () => {
    const failed = normalizeMessage({ ...raw, status: 'failed', reason: 'boom' })!
    expect(mergeMessage(completed, failed)).toBe(completed)
  })

  it('never re-opens a resolved escalation', () => {
    const open = normalizeEscalation({ escalation_id: 'x1', subject: 's', options: ['a', 'b'], state: 'open' })!
    const resolved = normalizeEscalation({ escalation_id: 'x1', subject: 's', state: 'resolved', resolution: 'a', resolved_by: 'user' })!
    const merged = mergeEscalation(open, resolved)
    expect(merged.state).toBe('resolved')
    expect(merged.options).toEqual(['a', 'b'])
    expect(mergeEscalation(merged, open)).toBe(merged)
  })

  it('ignores older blackboard versions and keeps superseded_by sticky', () => {
    const v2 = normalizeEntry({ entry_id: 'e1', key: 'k', value: 'v2', version: 2, superseded_by: 'e2' })!
    const v1 = normalizeEntry({ entry_id: 'e1', key: 'k', value: 'v1', version: 1 })!
    expect(mergeEntry(v2, v1)).toBe(v2)
    const sameVersionUnsuperseded = normalizeEntry({ entry_id: 'e1', key: 'k', value: 'v2', version: 2 })!
    expect(mergeEntry(v2, sameVersionUnsuperseded).superseded_by).toBe('e2')
  })
})
