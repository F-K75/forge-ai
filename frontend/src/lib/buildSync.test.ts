import { beforeEach, describe, expect, it, vi } from 'vitest'

const { buildsApi } = vi.hoisted(() => ({
  buildsApi: { get: vi.fn(), getFiles: vi.fn(), getCollaboration: vi.fn() },
}))
vi.mock('./api', () => ({ buildsApi }))

import { confirmTerminalStatus, hydrateBuild } from './buildSync'
import { useBuildStore } from '../store/buildStore'
import { useCollaborationStore } from '../store/collaborationStore'

const notFound = Object.assign(new Error('404'), { response: { status: 404 } })

beforeEach(() => {
  vi.clearAllMocks()
  useBuildStore.getState().reset()
  buildsApi.getFiles.mockResolvedValue({ 'a.ts': '1' })
  buildsApi.getCollaboration.mockRejectedValue(notFound)
})

describe('hydrateBuild', () => {
  it('applies the build document, files and collaboration snapshot', async () => {
    useBuildStore.getState().attachBuild('b1')
    buildsApi.get.mockResolvedValue({ id: 'b1', status: 'running' })
    buildsApi.getCollaboration.mockResolvedValue({
      protocol_version: 2,
      messages: [{ message_id: 'm1', sender: 'developer', recipient: 'designer', content: 'Grid?', state: 'dispatched', protocol_version: 2 }],
      decisions: [{ entry_id: 'e1', key: 'ui.grid', kind: 'decision', value: '8px', version: 1 }],
      escalations: [],
      budget: { credits_used: 1, reserved_credits: 27, messages_used: 1, max_messages: 6 },
    })
    expect(await hydrateBuild('b1')).toBe(true)
    expect(useBuildStore.getState().files).toEqual({ 'a.ts': '1' })
    const c = useCollaborationStore.getState()
    expect(c.protocolVersion).toBe(2)
    expect(c.messages[0].state).toBe('dispatched')
    expect(c.decisions[0].value).toBe('8px')
    expect(c.budget?.max_messages).toBe(6)
  })

  it('falls back to the build document when the hydration endpoint is missing (legacy builds)', async () => {
    useBuildStore.getState().attachBuild('b1')
    buildsApi.get.mockResolvedValue({
      id: 'b1',
      status: 'success',
      agent_messages: [{ message_id: 'm1', sender: 'developer', recipient: 'architect', question: 'q', status: 'answered' }],
    })
    await hydrateBuild('b1')
    const c = useCollaborationStore.getState()
    expect(c.protocolVersion).toBe(1)
    expect(c.messages).toHaveLength(1)
    expect(useBuildStore.getState().status).toBe('complete')
  })

  it('discards a response that arrives after a newer snapshot was applied', async () => {
    useBuildStore.getState().attachBuild('b1')
    let resolveOld: (v: unknown) => void = () => {}
    buildsApi.get
      .mockImplementationOnce(() => new Promise(r => { resolveOld = r }))
      .mockResolvedValueOnce({ id: 'b1', status: 'success' })
    const older = hydrateBuild('b1')
    expect(await hydrateBuild('b1')).toBe(true)
    resolveOld({ id: 'b1', status: 'running' })
    expect(await older).toBe(false)
    expect(useBuildStore.getState().status).toBe('complete')
  })

  it('does not throw when the build request fails', async () => {
    buildsApi.get.mockRejectedValue(new Error('down'))
    expect(await hydrateBuild('b1')).toBe(false)
  })
})

describe('confirmTerminalStatus', () => {
  it('re-reads the persisted state until it is terminal', async () => {
    useBuildStore.getState().startBuild('b1', 'p', { status: 'pending' })
    buildsApi.get
      .mockResolvedValueOnce({ id: 'b1', status: 'running' })
      .mockResolvedValueOnce({ id: 'b1', build_status: 'completed', status: 'success' })
    expect(await confirmTerminalStatus('b1', [0, 1, 1])).toBe(true)
    expect(buildsApi.get).toHaveBeenCalledTimes(2)
    expect(useBuildStore.getState().status).toBe('complete')
  })

  it('gives up after the last attempt, leaving the persisted status in charge', async () => {
    useBuildStore.getState().startBuild('b1', 'p', { status: 'pending' })
    buildsApi.get.mockResolvedValue({ id: 'b1', status: 'running' })
    expect(await confirmTerminalStatus('b1', [0, 1])).toBe(false)
    expect(useBuildStore.getState().status).toBe('running')
  })

  it('stops when the user has moved to another build', async () => {
    useBuildStore.getState().startBuild('b2', 'p')
    expect(await confirmTerminalStatus('b1', [0])).toBe(false)
    expect(buildsApi.get).not.toHaveBeenCalled()
  })
})
