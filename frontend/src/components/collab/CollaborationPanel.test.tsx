import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe } from 'vitest-axe'

vi.mock('../../lib/env', () => ({ LIVE_MODE: true }))
const { mocks } = vi.hoisted(() => ({
  mocks: { respondToGate: vi.fn(), hydrateBuild: vi.fn(), toastError: vi.fn() },
}))
vi.mock('../../lib/api', () => ({ buildsApi: { respondToGate: mocks.respondToGate } }))
vi.mock('../../lib/buildSync', () => ({ hydrateBuild: mocks.hydrateBuild }))
vi.mock('react-hot-toast', () => {
  const t = Object.assign(vi.fn(), { success: vi.fn(), error: mocks.toastError })
  return { default: t, toast: t }
})

import { CollaborationPanel } from './CollaborationPanel'
import { useBuildStore } from '../../store/buildStore'
import { useCollaborationStore } from '../../store/collaborationStore'
import type { AnyWSEvent } from '../../lib/wsContract'

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface Assertion<T> {
    toHaveNoViolations(): void
  }
}

const ev = (type: string, data: unknown, timestamp?: string) =>
  ({ type, build_id: 'b1', version: 1, data, timestamp }) as unknown as AnyWSEvent
const send = (type: string, data: unknown, timestamp?: string) =>
  act(() => useBuildStore.getState().handleEvent(ev(type, data, timestamp)))

const message = {
  message_id: 'm1',
  conversation_id: 'c1',
  sender: 'developer',
  recipient: 'architect',
  message_type: 'clarification',
  question: 'Integer cents or decimals?',
  status: 'answered',
  answer: 'Integer cents.',
  credits_charged: 1,
  created_at: '2026-11-22T10:00:02',
}

const escalation = {
  escalation_id: 'x1',
  raised_by: 'designer',
  decision_owner: 'architect',
  subject: 'Amount representation conflict',
  detail: 'The designer assumed decimal strings.',
  options: ['Integer cents', 'Decimal strings'],
  conflict: { key: 'data.amount_representation', existing_value: 'Integer cents', proposed_value: 'Decimal strings' },
  state: 'open',
  resolution: null,
  resolved_by: null,
  rationale: null,
  created_at: '2026-11-22T10:00:05',
  resolved_at: null,
}

const gate = {
  gate_id: 'g1',
  stage: 'designer',
  agent: 'architect',
  kind: 'escalation',
  questions: [],
  timeout_seconds: 180,
  requested_at: '2026-11-22T10:00:05',
  escalation_id: 'x1',
  subject: escalation.subject,
  detail: escalation.detail,
  options: escalation.options,
}

beforeEach(() => {
  vi.clearAllMocks()
  useBuildStore.getState().reset()
  useBuildStore.getState().startBuild('b1', 'build a ledger')
})
afterEach(() => cleanup())

describe('CollaborationPanel: legacy builds (protocol 1)', () => {
  it('shows messages only', () => {
    send('agent_message_response', message)
    render(<CollaborationPanel />)
    expect(screen.getByText(/original protocol: agent messages only/)).toBeInTheDocument()
    const lane = screen.getByRole('region', { name: /Messages/ })
    expect(within(lane).getByText('Integer cents or decimals?')).toBeInTheDocument()
    expect(within(lane).getByText(/Integer cents\./)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Decisions/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Escalations/ })).not.toBeInTheDocument()
  })
})

describe('CollaborationPanel: protocol v2', () => {
  const v2 = () => {
    act(() =>
      useCollaborationStore.getState().hydrate('b1', {
        protocol_version: 2,
        messages: [],
        decisions: [],
        escalations: [],
        budget: { credits_used: 1, reserved_credits: 27, messages_used: 1, max_messages: 6 },
      }),
    )
  }

  it('renders the three lanes with activity, decisions and escalations', async () => {
    v2()
    send('agent_start', { agent: 'architect' }, '2026-11-22T10:00:00')
    send('agent_complete', { agent: 'architect' }, '2026-11-22T10:00:01')
    send('agent_message_response', { ...message, protocol_version: 2, state: 'completed', lane: 'activity' })
    send('collab_decision_recorded', {
      entry: {
        entry_id: 'e1',
        key: 'data.amount_representation',
        kind: 'decision',
        value: 'Store amounts as integer cents',
        rationale: 'Avoids float rounding',
        owner_agent: 'architect',
        source_message_id: 'm1',
        version: 1,
        created_at: '2026-11-22T10:00:03',
        superseded_by: null,
      },
    })
    send('collab_escalation_opened', { escalation })
    const { container } = render(<CollaborationPanel />)

    const activity = screen.getByRole('region', { name: /Activity/ })
    const items = within(activity).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Architect completed'),
      expect.stringContaining('Integer cents or decimals?'),
    ])

    const decisions = screen.getByRole('region', { name: /Decisions/ })
    expect(within(decisions).getByText('Store amounts as integer cents')).toBeInTheDocument()
    expect(within(decisions).getByText('Avoids float rounding')).toBeInTheDocument()

    const escalations = screen.getByRole('region', { name: /Escalations/ })
    expect(within(escalations).getByText('Amount representation conflict')).toBeInTheDocument()
    // No gate pending: the options are informational, not buttons.
    expect(within(escalations).queryByRole('button')).not.toBeInTheDocument()
    expect(within(escalations).getByText(/Waiting for Architect to decide/)).toBeInTheDocument()

    expect(screen.getByTestId('collab-budget')).toHaveTextContent('1/6 messages · 1 credit')
    expect(await axe(container, { rules: { 'color-contrast': { enabled: false } } })).toHaveNoViolations()
  })

  it('offers the escalation options as buttons while its gate is pending and answers via the gate endpoint', async () => {
    v2()
    send('collab_escalation_opened', { escalation })
    send('gate_request', gate)
    mocks.respondToGate.mockResolvedValue({ status: 'ok' })
    render(<CollaborationPanel />)

    const group = screen.getByRole('group', { name: 'Choose an option:' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Integer cents', 'Decimal strings'])
    expect(screen.getByText('Needs your decision')).toBeInTheDocument()

    fireEvent.click(within(group).getByRole('button', { name: 'Decimal strings' }))
    await waitFor(() =>
      expect(mocks.respondToGate).toHaveBeenCalledWith('b1', { gate_id: 'g1', action: 'answers', answers: ['Decimal strings'] }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Sent “Decimal strings”')

    // The backend resolves it: the buttons go away and the resolution shows.
    send('gate_resolved', { gate_id: 'g1', stage: 'designer', agent: 'architect', action: 'answers', auto: false })
    send('collab_escalation_resolved', {
      escalation: { ...escalation, state: 'resolved', resolution: 'Decimal strings', resolved_by: 'user', resolved_at: '2026-11-22T10:00:09' },
    })
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByText('Resolution:').parentElement).toHaveTextContent('Resolution: Decimal strings (by you)')

    // A replayed "opened" event can't re-open it.
    send('collab_escalation_opened', { escalation })
    expect(screen.getByText('Resolved')).toBeInTheDocument()
  })

  it('shows a pending escalation gate even if its escalation record never arrived', () => {
    v2()
    send('gate_request', { ...gate, escalation_id: 'x9' })
    render(<CollaborationPanel />)
    const group = screen.getByRole('group', { name: 'Choose an option:' })
    expect(within(group).getAllByRole('button')).toHaveLength(2)
  })

  it('re-hydrates when the gate was already answered elsewhere (409)', async () => {
    v2()
    send('collab_escalation_opened', { escalation })
    send('gate_request', gate)
    mocks.respondToGate.mockRejectedValue({ response: { status: 409 } })
    render(<CollaborationPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Integer cents' }))
    await waitFor(() => expect(mocks.hydrateBuild).toHaveBeenCalledWith('b1'))
    expect(mocks.toastError).toHaveBeenCalledWith('This decision has already been made.')
    // Buttons are usable again.
    expect(screen.getByRole('button', { name: 'Integer cents' })).not.toBeDisabled()
  })

  it('routes messages to the lane they name', () => {
    v2()
    send('agent_message_request', { ...message, message_id: 'p1', status: 'pending', answer: null, message_type: 'decision_proposal', lane: 'decisions', protocol_version: 2, question: 'Propose: use cents' })
    render(<CollaborationPanel />)
    expect(within(screen.getByRole('region', { name: /Decisions/ })).getByText('Propose: use cents')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /Activity/ })).queryByText('Propose: use cents')).not.toBeInTheDocument()
  })
})
