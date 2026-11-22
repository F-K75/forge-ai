import { describe, expect, it } from 'vitest'
import { parseWSEvent } from './wsContract'

const envelope = (type: string, data: unknown) => ({ type, build_id: 'b1', version: 1, timestamp: '2026-11-22T10:00:00', data })

const legacyMessage = {
  message_id: 'm1',
  conversation_id: 'c1',
  sender: 'developer',
  recipient: 'architect',
  message_type: 'clarification',
  question: 'Cents or decimals?',
  status: 'pending',
  credits_charged: 0,
}

describe('parseWSEvent: agent messages', () => {
  it('still accepts the legacy (v1) payload unchanged', () => {
    const e = parseWSEvent(envelope('agent_message_request', legacyMessage))
    expect(e?.type).toBe('agent_message_request')
    expect(e && 'question' in e.data ? e.data.question : null).toBe('Cents or decimals?')
    expect(e && 'status' in e.data ? e.data.status : null).toBe('pending')
  })

  it('accepts a v2 payload that carries content and state instead of question and status', () => {
    const e = parseWSEvent(
      envelope('agent_message_response', {
        message_id: 'm2',
        sender: 'developer',
        recipient: 'designer',
        message_type: 'information',
        content: 'Using the 8px grid.',
        state: 'completed',
        lane: 'activity',
        protocol_version: 2,
      }),
    )
    expect(e).not.toBeNull()
    const data = e!.data as { question: string; status: string; state: string; conversation_id: string }
    expect(data.question).toBe('Using the 8px grid.')
    expect(data.status).toBe('answered')
    expect(data.state).toBe('completed')
    expect(data.conversation_id).toBe('')
  })

  it('accepts v2 extra keys alongside the legacy ones', () => {
    const e = parseWSEvent(
      envelope('agent_message_request', {
        ...legacyMessage,
        protocol_version: 2,
        message_type: 'clarification',
        state: 'queued',
        lane: 'activity',
        subject: 'Money',
        payload: { refs: [] },
        parent_message_id: null,
      }),
    )
    expect(e).not.toBeNull()
    expect((e!.data as { protocol_version: number }).protocol_version).toBe(2)
  })

  it('still rejects a message with neither question nor content', () => {
    const rest: Record<string, unknown> = { ...legacyMessage }
    delete rest.question
    expect(parseWSEvent(envelope('agent_message_request', rest))).toBeNull()
  })

  it('rejects a message with neither status nor a known state', () => {
    const rest: Record<string, unknown> = { ...legacyMessage }
    delete rest.status
    expect(parseWSEvent(envelope('agent_message_request', rest))).toBeNull()
    expect(parseWSEvent(envelope('agent_message_request', { ...rest, state: 'bogus' }))).toBeNull()
  })
})

describe('parseWSEvent: collaboration events', () => {
  const entry = {
    entry_id: 'e1',
    key: 'data.amount_representation',
    kind: 'decision',
    value: 'Store amounts as integer cents',
    rationale: 'No float rounding',
    owner_agent: 'architect',
    source_message_id: 'm1',
    version: 1,
    created_at: '2026-11-22T10:00:00',
    superseded_by: null,
  }
  const escalation = {
    escalation_id: 'x1',
    raised_by: 'developer',
    decision_owner: 'architect',
    subject: 'Amount representation conflict',
    detail: 'Designer assumed decimals',
    options: ['Integer cents', 'Decimal strings'],
    conflict: { key: 'data.amount_representation', existing_value: 'cents', proposed_value: 'decimals' },
    state: 'open',
    resolution: null,
    resolved_by: null,
    rationale: null,
    created_at: '2026-11-22T10:01:00',
    resolved_at: null,
  }

  it('accepts collab_decision_recorded with a blackboard entry', () => {
    const e = parseWSEvent(envelope('collab_decision_recorded', { entry }))
    expect(e?.type).toBe('collab_decision_recorded')
    expect((e!.data as { entry: { key: string } }).entry.key).toBe('data.amount_representation')
  })

  it('accepts collab_escalation_opened and collab_escalation_resolved', () => {
    expect(parseWSEvent(envelope('collab_escalation_opened', { escalation }))?.type).toBe('collab_escalation_opened')
    const resolved = parseWSEvent(
      envelope('collab_escalation_resolved', { escalation: { ...escalation, state: 'resolved', resolution: 'Integer cents', resolved_by: 'user' } }),
    )
    expect((resolved!.data as { escalation: { state: string } }).escalation.state).toBe('resolved')
  })

  it('rejects collaboration events without their record id', () => {
    expect(parseWSEvent(envelope('collab_decision_recorded', { entry: { key: 'k' } }))).toBeNull()
    expect(parseWSEvent(envelope('collab_escalation_opened', { escalation: { subject: 's' } }))).toBeNull()
    expect(parseWSEvent(envelope('collab_escalation_opened', {}))).toBeNull()
  })

  it('accepts an escalation gate_request and keeps its options', () => {
    const e = parseWSEvent(
      envelope('gate_request', {
        gate_id: 'g1',
        stage: 'developer',
        agent: 'architect',
        kind: 'escalation',
        questions: [],
        timeout_seconds: 180,
        requested_at: '2026-11-22T10:01:00',
        escalation_id: 'x1',
        subject: 'Amount representation conflict',
        detail: 'Designer assumed decimals',
        options: ['Integer cents', 'Decimal strings', 7],
      }),
    )
    const data = e!.data as { kind: string; options: string[]; escalation_id: string }
    expect(data.kind).toBe('escalation')
    expect(data.escalation_id).toBe('x1')
    expect(data.options).toEqual(['Integer cents', 'Decimal strings'])
  })

  it('still drops unknown event types silently', () => {
    expect(parseWSEvent(envelope('agent_review_started', {}))).toBeNull()
  })
})
