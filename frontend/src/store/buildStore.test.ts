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
