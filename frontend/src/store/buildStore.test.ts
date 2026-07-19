import { beforeEach, describe, expect, it } from 'vitest'
import { useBuildStore } from './buildStore'

describe('buildStore', () => {
  beforeEach(() => {
    useBuildStore.getState().reset()
  })

  it('startBuild puts the store into a running state', () => {
    useBuildStore.getState().startBuild('b1', 'build a todo app')
    const s = useBuildStore.getState()
    expect(s.buildId).toBe('b1')
    expect(s.status).toBe('running')
    expect(s.prompt).toBe('build a todo app')
  })

  it('agent_start marks the agent active', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({ type: 'agent_start', data: { agent: 'developer' } } as any)
    const s = useBuildStore.getState()
    expect(s.activeAgent).toBe('developer')
    expect(s.agentStates.developer).toBe('active')
  })

  it('stream_token accumulates tokens and increments the token count', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({ type: 'stream_token', data: { token: 'hello ' } } as any)
    useBuildStore.getState().handleEvent({ type: 'stream_token', data: { token: 'world' } } as any)
    const s = useBuildStore.getState()
    expect(s.streamBuffer).toBe('hello world')
    expect(s.tokenCount).toBe(2)
  })

  it('build_complete sets status complete and records QA score/credits', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({
      type: 'build_complete',
      data: { files: { 'a.txt': 'x' }, validation: { score: 87 }, credits_used: 15 },
    } as any)
    const s = useBuildStore.getState()
    expect(s.status).toBe('complete')
    expect(s.qaScore).toBe(87)
    expect(s.creditsUsed).toBe(15)
    expect(s.files['a.txt']).toBe('x')
  })

  it('file_update merges changed files and drops deleted paths', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({
      type: 'file_update',
      data: { delta: { changed: { 'a.ts': 'A' }, deleted: ['old.ts'] } },
    } as any)
    const s = useBuildStore.getState()
    expect(s.files['a.ts']).toBe('A')
  })

  it('agent_complete marks the agent done and clears it as active', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({ type: 'agent_start', data: { agent: 'developer' } } as any)
    useBuildStore.getState().handleEvent({ type: 'agent_complete', data: { agent: 'developer', files_changed: ['x.ts'] } } as any)
    const s = useBuildStore.getState()
    expect(s.agentStates.developer).toBe('done')
    expect(s.activeAgent).toBeNull()
  })

  it('agent_output stores each agent\'s structured document keyed by agent id', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({
      type: 'agent_output',
      data: { agent: 'architect', output: { app_name: 'Habit Tracker', pages: [] } },
    } as any)
    useBuildStore.getState().handleEvent({
      type: 'agent_output',
      data: { agent: 'business_improver', output: { executive_summary: 'A habit tracker for teams.' } },
    } as any)
    const s = useBuildStore.getState()
    expect(s.agentOutputs.architect).toEqual({ app_name: 'Habit Tracker', pages: [] })
    expect(s.agentOutputs.business_improver).toEqual({ executive_summary: 'A habit tracker for teams.' })
  })

  it('a debugger agent_complete merges patched files into the developer agent, not a separate entry', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({ type: 'agent_complete', data: { agent: 'developer', files_changed: ['x.ts'] } } as any)
    useBuildStore.getState().handleEvent({ type: 'debug_start', data: { iteration: 1, errors: ['boom'] } } as any)
    useBuildStore.getState().handleEvent({ type: 'agent_complete', data: { agent: 'debugger', files_changed: ['y.ts'] } } as any)
    const s = useBuildStore.getState()
    expect(s.agentStates.developer).toBe('done')
    const developer = s.agents.find(a => a.type === 'developer')
    expect(developer?.filesChanged.sort()).toEqual(['x.ts', 'y.ts'])
    expect(s.agents.find(a => a.type === ('debugger' as any))).toBeUndefined()
  })

  it('gate_request records the pending gate and posts a chat message', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({
      type: 'gate_request',
      data: {
        gate_id: 'g1',
        stage: 'architect',
        agent: 'architect',
        kind: 'approval',
        questions: [],
        timeout_seconds: 180,
        requested_at: '2026-01-01T00:00:00Z',
      },
    } as any)
    const s = useBuildStore.getState()
    expect(s.pendingGate).toEqual({
      gateId: 'g1',
      stage: 'architect',
      agent: 'architect',
      kind: 'approval',
      questions: [],
      timeoutSeconds: 180,
      requestedAt: '2026-01-01T00:00:00Z',
    })
    expect(s.messages[s.messages.length - 1]?.text).toContain('waiting for approval')
  })

  it('gate_resolved clears a manually-approved gate and narrates the outcome', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({
      type: 'gate_request',
      data: { gate_id: 'g1', stage: 'architect', agent: 'architect', kind: 'approval', questions: [], timeout_seconds: 180, requested_at: 't' },
    } as any)
    useBuildStore.getState().handleEvent({
      type: 'gate_resolved',
      data: { gate_id: 'g1', stage: 'architect', agent: 'architect', action: 'approve', auto: false },
    } as any)
    const s = useBuildStore.getState()
    expect(s.pendingGate).toBeNull()
    expect(s.messages[s.messages.length - 1]?.text).toContain('approved')
  })

  it('gate_resolved with auto:true clears the gate without a duplicate narration message', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({
      type: 'gate_request',
      data: { gate_id: 'g1', stage: 'designer', agent: 'designer', kind: 'approval', questions: [], timeout_seconds: 180, requested_at: 't' },
    } as any)
    const messagesBefore = useBuildStore.getState().messages.length
    useBuildStore.getState().handleEvent({
      type: 'gate_resolved',
      data: { gate_id: 'g1', stage: 'designer', agent: 'designer', action: 'approve', auto: true },
    } as any)
    const s = useBuildStore.getState()
    expect(s.pendingGate).toBeNull()
    expect(s.messages.length).toBe(messagesBefore)
  })

  it('gate_resolved ignores a stale event for an already-cleared gate', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({
      type: 'gate_request',
      data: { gate_id: 'g1', stage: 'architect', agent: 'architect', kind: 'approval', questions: [], timeout_seconds: 180, requested_at: 't' },
    } as any)
    useBuildStore.getState().handleEvent({
      type: 'gate_request',
      data: { gate_id: 'g2', stage: 'business_improver', agent: 'business_improver', kind: 'approval', questions: [], timeout_seconds: 180, requested_at: 't' },
    } as any)
    useBuildStore.getState().handleEvent({
      type: 'gate_resolved',
      data: { gate_id: 'g1', stage: 'architect', agent: 'architect', action: 'approve', auto: false },
    } as any)
    const s = useBuildStore.getState()
    expect(s.pendingGate?.gateId).toBe('g2')
  })

  it('setAutoApprove toggles the client-only auto-approve preference', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    expect(useBuildStore.getState().autoApprove).toBe(false)
    useBuildStore.getState().setAutoApprove(true)
    expect(useBuildStore.getState().autoApprove).toBe(true)
  })

  it('build_failed moves the store into a failed state with an error message', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({ type: 'build_failed', data: { error: 'LLM timeout' } } as any)
    const s = useBuildStore.getState()
    expect(s.status).toBe('failed')
    expect(s.error).toBe('LLM timeout')
  })

  it('debug_start moves the store into a debugging state and records the iteration', () => {
    useBuildStore.getState().startBuild('b1', 'p')
    useBuildStore.getState().handleEvent({ type: 'debug_start', data: { iteration: 2, errors: ['type error'] } } as any)
    const s = useBuildStore.getState()
    expect(s.status).toBe('debugging')
    expect(s.debugIterations).toBe(2)
    expect(s.debug).toEqual({ iteration: 2, errors: ['type error'] })
    expect(s.agentStates.developer).toBe('debugging')
  })

  it('reset clears all build state back to idle', () => {
    const store = useBuildStore.getState()
    store.startBuild('b1', 'p')
    store.handleEvent({ type: 'stream_token', data: { token: 'x' } } as any)
    store.reset()
    const s = useBuildStore.getState()
    expect(s.status).toBe('idle')
    expect(s.buildId).toBeNull()
    expect(s.streamBuffer).toBe('')
    expect(s.tokenCount).toBe(0)
  })
})
