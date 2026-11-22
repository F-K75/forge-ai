// B1-8 with the flag ON (the state legal approval will switch on).
import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

vi.mock('../../lib/byokDisclosure', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  BYOK_DISCLOSURE_ENABLED: true,
}))
vi.mock('../../store/authStore', () => {
  const state = { user: { id: 'u1', plan: 'pro', byok_connected: false, preferences: {} }, fetchMe: vi.fn() }
  return { useAuthStore: (sel?: (s: typeof state) => unknown) => (typeof sel === 'function' ? sel(state) : state) }
})
vi.mock('react-hot-toast', () => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: t, toast: t }
})

import { ModelsTab } from '../../pages/settings/ModelsTab'
import { ByokBuildConfirmDialog } from '../workspace/ByokBuildConfirmDialog'
import { BYOK_DISCLOSURE_BODY } from '../../lib/byokDisclosure'

afterEach(() => cleanup())

describe('BYOK disclosure on the settings page', () => {
  it('is not shown while Forge-managed keys are selected', () => {
    render(<ModelsTab />)
    expect(screen.queryByTestId('byok-disclosure')).not.toBeInTheDocument()
  })

  it('is shown with the §5.6 copy before the key field once a BYOK provider is chosen', () => {
    render(<ModelsTab />)
    fireEvent.click(screen.getByRole('button', { name: /Anthropic Claude/ }))
    const disclosure = screen.getByTestId('byok-disclosure')
    expect(disclosure).toHaveTextContent('Using your own API key.')
    expect(disclosure).toHaveTextContent(BYOK_DISCLOSURE_BODY)
    expect(disclosure).toHaveTextContent('billed by your provider, including requests that fail')
    const keyInput = screen.getByLabelText(/Anthropic API Key/)
    // Rendered before (above) the key input, i.e. before the key is saved.
    expect(disclosure.compareDocumentPosition(keyInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('BYOK build-start confirmation', () => {
  it('shows the disclosure and starts only on confirm', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ByokBuildConfirmDialog open prompt="Build a habit tracker" onConfirm={onConfirm} onCancel={onCancel} />)
    const dialog = screen.getByRole('dialog', { name: /own key/ })
    expect(dialog).toHaveTextContent(BYOK_DISCLOSURE_BODY)
    expect(screen.getByRole('button', { name: 'Start build' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Start build' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('Escape and Cancel close it without starting', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    render(<ByokBuildConfirmDialog open prompt="p" onConfirm={onConfirm} onCancel={onCancel} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
