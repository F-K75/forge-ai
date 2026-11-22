// Live mode (real backend): the workspace follows the real build only (B1).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { mocks, flags } = vi.hoisted(() => ({
  mocks: {
    projectGet: vi.fn(),
    projectBuilds: vi.fn(),
    buildCreate: vi.fn(),
    useBuildSocket: vi.fn(),
    synthesize: vi.fn(),
  },
  flags: { byok: false },
}))

vi.mock('../lib/env', () => ({ LIVE_MODE: true, IS_PUBLIC_DEMO: false, PUBLIC_DEMO_APP_URL: '' }))
vi.mock('../lib/api', () => ({
  projectsApi: { get: mocks.projectGet, getBuilds: mocks.projectBuilds, create: vi.fn() },
  buildsApi: { create: mocks.buildCreate, respondToGate: vi.fn() },
  deploymentsApi: { list: vi.fn().mockResolvedValue([]), create: vi.fn() },
}))
vi.mock('../hooks/useBuildSocket', () => ({ useBuildSocket: mocks.useBuildSocket }))
vi.mock('../lib/codeSynthesizer', () => ({ synthesizeCodeForPrompt: mocks.synthesize }))
vi.mock('../lib/byokDisclosure', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    get BYOK_DISCLOSURE_ENABLED() {
      return flags.byok
    },
  }
})
vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="mock-monaco-editor" />,
  DiffEditor: () => <div data-testid="mock-diff-editor" />,
}))
vi.mock('react-hot-toast', () => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() })
  return { default: t, toast: t }
})

import WorkspacePage from './WorkspacePage'
import { useBuildStore } from '../store/buildStore'
import { useAuthStore } from '../store/authStore'
import type { AnyWSEvent } from '../lib/wsContract'

const renderWorkspace = () =>
  render(
    <MemoryRouter initialEntries={['/p/proj-1/workspace']}>
      <Routes>
        <Route path="/p/:projectId/workspace" element={<WorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  )

const subscribedIds = () => mocks.useBuildSocket.mock.calls.map((c) => c[0])

async function runPrompt(text: string) {
  const input = await screen.findByPlaceholderText(/Describe a feature/)
  await waitFor(() => expect(mocks.projectGet).toHaveBeenCalled())
  fireEvent.change(input, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /Run/ }))
}

beforeEach(() => {
  vi.clearAllMocks()
  flags.byok = false
  useBuildStore.getState().reset()
  useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c', name: 'A', plan: 'pro', credits: 12, created_at: '' } })
  mocks.projectGet.mockResolvedValue({ id: 'proj-1', name: 'ledger', description: 'A ledger' })
  mocks.projectBuilds.mockResolvedValue([])
  mocks.useBuildSocket.mockReturnValue({ ws: null, connectionStatus: 'online' })
  mocks.buildCreate.mockResolvedValue({ build_id: 'build-123', status: 'pending' })
})
afterEach(() => cleanup())

describe('WorkspacePage in live mode (B1)', () => {
  it('starts with no demo build, files or logs', async () => {
    renderWorkspace()
    await waitFor(() => expect(mocks.projectBuilds).toHaveBeenCalledWith('proj-1'))
    expect(subscribedIds().every((id) => id === null)).toBe(true)
    expect(screen.getByTestId('live-build-status')).toHaveTextContent('No build yet')
    expect(screen.getByRole('button', { name: /Files \(0\)/ })).toBeInTheDocument()
    expect(screen.queryByText(/42\/42 Vitest passed/)).not.toBeInTheDocument()
  })

  it('subscribes to the build_id from the create response and never synthesizes in the browser', async () => {
    renderWorkspace()
    await runPrompt('Add CSV export')
    await waitFor(() => expect(mocks.buildCreate).toHaveBeenCalledWith({ project_id: 'proj-1', prompt: 'Add CSV export' }))
    await waitFor(() => expect(subscribedIds()).toContain('build-123'))
    expect(useBuildStore.getState().buildId).toBe('build-123')
    expect(useBuildStore.getState().persistedStatus?.status).toBe('pending')
    expect(mocks.synthesize).not.toHaveBeenCalled()
    expect(screen.getByTestId('live-build-status')).toHaveTextContent('Build running')
  })

  it("shows the build's files, from the store, as the only files", async () => {
    renderWorkspace()
    await runPrompt('Add CSV export')
    await waitFor(() => expect(subscribedIds()).toContain('build-123'))
    act(() => {
      useBuildStore.getState().hydrate({
        buildId: 'build-123',
        detail: { id: 'build-123', status: 'running' },
        files: { 'src/export.ts': 'export const csv = 1' },
      })
    })
    expect(await screen.findByRole('button', { name: /Files \(1\)/ })).toBeInTheDocument()
  })

  it('a terminal event alone does not mark the build complete (B1-7)', async () => {
    renderWorkspace()
    await runPrompt('Add CSV export')
    await waitFor(() => expect(subscribedIds()).toContain('build-123'))
    act(() => {
      useBuildStore.getState().handleEvent({ type: 'build_complete', build_id: 'build-123', version: 1, data: {} } as AnyWSEvent)
    })
    expect(screen.getByTestId('live-build-status')).toHaveTextContent('Build running')
    act(() => {
      useBuildStore.getState().hydrate({ buildId: 'build-123', detail: { id: 'build-123', build_status: 'completed' }, files: null })
    })
    expect(screen.getByTestId('live-build-status')).toHaveTextContent('Build complete')
  })

  it('follows the project’s latest build after a reload', async () => {
    mocks.projectBuilds.mockResolvedValue([{ id: 'build-old', prompt: 'First version', status: 'success' }])
    renderWorkspace()
    await waitFor(() => expect(subscribedIds()).toContain('build-old'))
    expect(useBuildStore.getState().buildId).toBe('build-old')
  })

  it('B1-9: a 402 shows the required and available amounts and the breakdown', async () => {
    mocks.buildCreate.mockRejectedValue({
      response: {
        status: 402,
        data: {
          detail: {
            code: 'insufficient_credits',
            required: 27,
            available: 12,
            breakdown: [
              { label: 'Agent stages', credits: 21 },
              { label: 'Debug iterations', credits: 6 },
            ],
          },
        },
      },
    })
    renderWorkspace()
    await runPrompt('Add CSV export')
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByTestId('credits-required')).toHaveTextContent('27 credits')
    expect(within(alert).getByTestId('credits-available')).toHaveTextContent('12 credits')
    expect(within(alert).getByText('Agent stages')).toBeInTheDocument()
    expect(within(alert).getByText('Debug iterations')).toBeInTheDocument()
    expect(subscribedIds()).not.toContain('build-123')
  })

  it('B1-9: the legacy 402 string is shown without invented amounts', async () => {
    mocks.buildCreate.mockRejectedValue({ response: { status: 402, data: { detail: 'Insufficient credits' } } })
    renderWorkspace()
    await runPrompt('Add CSV export')
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByTestId('credits-required')).toHaveTextContent('Not reported')
    expect(within(alert).getByTestId('credits-available')).toHaveTextContent('12 credits')
  })

  describe('B1-8: BYOK disclosure at build start', () => {
    beforeEach(() => {
      useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c', name: 'A', plan: 'pro', credits: 0, created_at: '', byok_connected: true } })
    })

    it('is not shown while the flag is off (the default until the copy is approved)', async () => {
      renderWorkspace()
      await runPrompt('Add CSV export')
      await waitFor(() => expect(mocks.buildCreate).toHaveBeenCalled())
      expect(screen.queryByTestId('byok-disclosure')).not.toBeInTheDocument()
    })

    it('with the flag on, BYOK builds start only after the disclosure is confirmed', async () => {
      flags.byok = true
      renderWorkspace()
      await runPrompt('Add CSV export')
      const dialog = await screen.findByRole('dialog', { name: /own key/ })
      expect(within(dialog).getByTestId('byok-disclosure')).toHaveTextContent('billed by your provider')
      expect(mocks.buildCreate).not.toHaveBeenCalled()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Start build' }))
      await waitFor(() => expect(mocks.buildCreate).toHaveBeenCalledTimes(1))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('with the flag on, cancelling does not start the build', async () => {
      flags.byok = true
      renderWorkspace()
      await runPrompt('Add CSV export')
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
      expect(mocks.buildCreate).not.toHaveBeenCalled()
    })

    it('with the flag on, Forge-key users are not asked', async () => {
      flags.byok = true
      useAuthStore.setState({ user: { id: 'u1', email: 'a@b.c', name: 'A', plan: 'pro', credits: 50, created_at: '', byok_connected: false } })
      renderWorkspace()
      await runPrompt('Add CSV export')
      await waitFor(() => expect(mocks.buildCreate).toHaveBeenCalled())
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('has a Collaboration surface that shows the panel', async () => {
    renderWorkspace()
    await runPrompt('Add CSV export')
    await waitFor(() => expect(subscribedIds()).toContain('build-123'))
    fireEvent.click(screen.getByRole('button', { name: /Collaboration/ }))
    expect(await screen.findByTestId('collaboration-panel')).toBeInTheDocument()
  })
})
