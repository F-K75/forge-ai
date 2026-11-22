import { beforeEach, describe, expect, it } from 'vitest'
import { useBuildStore } from './buildStore'
import { useCollaborationStore } from './collaborationStore'
import { readPersistedStatus } from '../lib/buildContract'
import type { AnyWSEvent } from '../lib/wsContract'

const ev = (type: string, data: unknown) => ({ type, build_id: 'b1', version: 1, data }) as unknown as AnyWSEvent
const store = () => useBuildStore.getState()

describe('readPersistedStatus (B1-7)', () => {
  it('prefers build_status over the legacy status', () => {
    expect(readPersistedStatus({ build_status: 'completed', status: 'pending' })).toMatchObject({
      status: 'completed',
      source: 'build_status',
    })
  })

  it('uses the last execution transition when build_status is absent', () => {
    expect(
      readPersistedStatus({ execution_transitions: [{ to: 'running' }, { to: 'failed' }], status: 'pending' }),
    ).toMatchObject({ status: 'failed', source: 'execution_transitions' })
  })

  it('falls back to the legacy status', () => {
    expect(readPersistedStatus({ status: 'success' })).toMatchObject({ status: 'completed', source: 'status' })
    expect(readPersistedStatus({ status: 'debugging' })).toMatchObject({ status: 'running', debugging: true })
    expect(readPersistedStatus({})).toBeNull()
    expect(readPersistedStatus({ build_status: 'weird', status: 'nope' })).toBeNull()
  })
})

describe('buildStore hydration', () => {
  beforeEach(() => store().reset())

  it('hydrates agents, files, gate and messages from the REST state', () => {
    store().attachBuild('b1')
    store().hydrate({
      buildId: 'b1',
      detail: {
        id: 'b1',
        prompt: 'habit tracker',
        status: 'running',
        credits_used: 9,
        agents: [
          { agent: 'architect', status: 'success', output: '{"app_name":"habits"}', started_at: '2026-11-22T10:00:00', completed_at: '2026-11-22T10:00:05' },
          { agent: 'developer', status: 'running', started_at: '2026-11-22T10:00:06' },
        ],
        pending_gate: { gate_id: 'g1', stage: 'developer', agent: 'architect', kind: 'escalation', escalation_id: 'x1', options: ['A', 'B'], subject: 'S' },
        agent_messages: [{ message_id: 'm1', sender: 'developer', recipient: 'architect', question: 'q', status: 'answered', answer: 'a' }],
      },
      files: { 'src/App.tsx': 'export {}' },
    })
    const s = store()
    expect(s.status).toBe('running')
    expect(s.persistedStatus?.status).toBe('running')
    expect(s.prompt).toBe('habit tracker')
    expect(s.agentStates.architect).toBe('done')
    expect(s.agentStates.developer).toBe('active')
    expect(s.activeAgent).toBe('developer')
    expect(s.agentOutputs.architect).toEqual({ app_name: 'habits' })
    expect(s.files).toEqual({ 'src/App.tsx': 'export {}' })
    expect(s.openFile).toBe('src/App.tsx')
    expect(s.creditsUsed).toBe(9)
    expect(s.pendingGate).toMatchObject({ gateId: 'g1', kind: 'escalation', escalationId: 'x1', options: ['A', 'B'] })
    expect(s.agentMessages[0].status).toBe('answered')
    expect(s.steps.map(x => `${x.agent}:${x.status}`)).toEqual(['architect:success', 'developer:running'])
  })

  it('ignores a snapshot for another build', () => {
    store().attachBuild('b2')
    store().hydrate({ buildId: 'b1', detail: { id: 'b1', status: 'success' }, files: { a: 'b' } })
    expect(store().files).toEqual({})
    expect(store().persistedStatus).toBeNull()
  })

  it('applies events on top of the snapshot', () => {
    store().attachBuild('b1')
    store().hydrate({ buildId: 'b1', detail: { id: 'b1', status: 'running' }, files: { 'a.ts': '1' } })
    store().handleEvent(ev('file_update', { delta: { changed: { 'b.ts': '2' }, deleted: [] } }))
    expect(store().files).toEqual({ 'a.ts': '1', 'b.ts': '2' })
  })

  it('a re-hydration does not duplicate steps replayed by events', () => {
    store().attachBuild('b1')
    store().hydrate({ buildId: 'b1', detail: { id: 'b1', status: 'running', agents: [{ agent: 'architect', status: 'running' }] }, files: null })
    store().handleEvent(ev('agent_start', { agent: 'architect' }))
    expect(store().steps).toHaveLength(1)
    store().handleEvent(ev('agent_complete', { agent: 'architect' }))
    store().handleEvent(ev('agent_complete', { agent: 'architect' }))
    expect(store().steps).toHaveLength(1)
    expect(store().steps[0].status).toBe('success')
  })
})

describe('B1-7: status comes from the persisted state, not WS event order', () => {
  beforeEach(() => store().reset())

  it('a terminal event alone does not end a build whose persisted status is still running', () => {
    store().startBuild('b1', 'p', { status: 'pending' })
    store().handleEvent(ev('build_complete', { files: { 'a.ts': 'x' } }))
    expect(store().status).toBe('running')
    // The files the event carried are still applied.
    expect(store().files['a.ts']).toBe('x')
    // The re-read persisted state confirms it.
    store().hydrate({ buildId: 'b1', detail: { id: 'b1', status: 'success' }, files: null })
    expect(store().status).toBe('complete')
  })

  it('a late lifecycle event never moves a persisted terminal build back to running', () => {
    store().attachBuild('b1')
    store().hydrate({ buildId: 'b1', detail: { id: 'b1', build_status: 'completed', status: 'success' }, files: null })
    store().handleEvent(ev('agent_start', { agent: 'pm' }))
    store().handleEvent(ev('debug_start', { iteration: 1 }))
    expect(store().status).toBe('complete')
  })

  it('a build_failed event is only shown once the persisted state says failed', () => {
    store().startBuild('b1', 'p', { status: 'pending' })
    store().handleEvent(ev('build_failed', { error: 'boom' }))
    expect(store().status).toBe('running')
    store().hydrate({ buildId: 'b1', detail: { id: 'b1', build_status: 'failed', status: 'failed', error: 'boom' }, files: null })
    expect(store().status).toBe('failed')
    expect(store().error).toBe('boom')
  })

  it('the persisted state wins over earlier events in either direction', () => {
    store().startBuild('b1', 'p', { status: 'pending' })
    store().hydrate({ buildId: 'b1', detail: { id: 'b1', build_status: 'failed' }, files: null })
    expect(store().status).toBe('failed')
    // A resumed build that the backend records as running again.
    store().hydrate({ buildId: 'b1', detail: { id: 'b1', build_status: 'running' }, files: null })
    expect(store().status).toBe('running')
  })

  it('debug events still add the debugging sub-state of a persisted running build', () => {
    store().startBuild('b1', 'p', { status: 'pending' })
    store().handleEvent(ev('debug_start', { iteration: 1, errors: ['x'] }))
    expect(store().status).toBe('debugging')
    store().handleEvent(ev('agent_complete', { agent: 'debugger' }))
    expect(store().status).toBe('running')
  })

  it('without a persisted status (demo mode) events drive status but never leave a terminal state', () => {
    store().startBuild('b1', 'p')
    store().handleEvent(ev('build_complete', {}))
    expect(store().status).toBe('complete')
    store().handleEvent(ev('agent_start', { agent: 'pm' }))
    expect(store().status).toBe('complete')
  })
})

describe('collaboration forwarding', () => {
  beforeEach(() => store().reset())

  it('routes v2 events into the collaboration store, de-duplicated and monotonic', () => {
    store().startBuild('b1', 'p')
    const msg = { message_id: 'm1', conversation_id: '', sender: 'developer', recipient: 'architect', message_type: 'clarification', question: 'q', status: 'answered', state: 'completed', answer: 'a', credits_charged: 1, protocol_version: 2 }
    store().handleEvent(ev('agent_message_response', msg))
    store().handleEvent(ev('agent_message_request', { ...msg, status: 'pending', state: 'queued', answer: null }))
    const c = useCollaborationStore.getState()
    expect(c.messages).toHaveLength(1)
    expect(c.messages[0].state).toBe('completed')
    expect(c.protocolVersion).toBe(2)
    expect(store().agentMessages[0].status).toBe('answered')
    // The stale request isn't narrated a second time either.
    expect(store().messages.filter(m => m.text.includes('Developer → Architect'))).toHaveLength(0)
  })

  it('a resolved escalation clears its pending escalation gate', () => {
    store().startBuild('b1', 'p')
    store().handleEvent(ev('gate_request', { gate_id: 'g1', stage: 'developer', agent: 'architect', kind: 'escalation', questions: [], timeout_seconds: 180, requested_at: '', escalation_id: 'x1', options: ['A'] }))
    expect(store().pendingGate?.kind).toBe('escalation')
    store().handleEvent(ev('collab_escalation_resolved', { escalation: { escalation_id: 'x1', subject: 'S', detail: '', options: ['A'], state: 'resolved', resolution: 'A', resolved_by: 'user', conflict: null, raised_by: null, decision_owner: null, rationale: null, created_at: null, resolved_at: null } }))
    expect(store().pendingGate).toBeNull()
    expect(useCollaborationStore.getState().escalations[0].state).toBe('resolved')
  })

  it('startBuild resets the lanes for the new build', () => {
    store().startBuild('b1', 'p')
    store().handleEvent(ev('collab_decision_recorded', { entry: { entry_id: 'e1', key: 'k', kind: 'decision', value: 'v', version: 1, rationale: null, owner_agent: 'architect', source_message_id: null, created_at: null, superseded_by: null } }))
    expect(useCollaborationStore.getState().decisions).toHaveLength(1)
    store().startBuild('b2', 'p2')
    expect(useCollaborationStore.getState().decisions).toHaveLength(0)
    expect(useCollaborationStore.getState().buildId).toBe('b2')
  })
})
