// B1 / F4: reconnect and reload re-hydrate from the persisted REST state;
// events are applied on top, de-duplicated and never moving records back.
import { test, expect } from '@playwright/test'
import { MockBackend, wsEvent } from './mockBackend'

const BUILD = 'build-r1'

const escalation = {
  escalation_id: 'x1',
  raised_by: 'designer',
  decision_owner: 'architect',
  subject: 'Amount representation conflict',
  detail: 'The designer assumed decimal strings; the blackboard says integer cents.',
  options: ['Integer cents', 'Decimal strings'],
  conflict: { key: 'data.amount_representation', existing_value: 'Integer cents', proposed_value: 'Decimal strings' },
  state: 'open',
  resolution: null,
  resolved_by: null,
  rationale: null,
  created_at: '2026-11-22T10:02:00',
  resolved_at: null,
}

const message = (state: string, extra: Record<string, unknown> = {}) => ({
  message_id: 'm1',
  conversation_id: 'c1',
  sender: 'developer',
  recipient: 'architect',
  message_type: 'clarification',
  question: 'Integer cents or decimals?',
  content: 'Integer cents or decimals?',
  status: state === 'completed' ? 'answered' : 'pending',
  state,
  lane: 'activity',
  protocol_version: 2,
  credits_charged: state === 'completed' ? 1 : 0,
  created_at: '2026-11-22T10:01:00',
  ...extra,
})

function runningBuild(backend: MockBackend) {
  backend.addBuild(
    BUILD,
    {
      prompt: 'Build a ledger',
      status: 'running',
      build_status: 'running',
      interactive: true,
      collab_config: { protocol_version: 2 },
      agents: [{ agent: 'architect', status: 'running', started_at: '2026-11-22T10:00:00' }],
      agent_messages: [message('dispatched')],
      pending_gate: null,
    },
    { 'README.md': '# Ledger' },
    {
      protocol_version: 2,
      messages: [message('dispatched')],
      decisions: [],
      escalations: [],
      budget: { credits_used: 0, reserved_credits: 27, messages_used: 1, max_messages: 6 },
    },
  )
  backend.projectBuilds = [BUILD]
}

test('after a dropped socket the workspace re-hydrates and answers an escalation gate', async ({ page }) => {
  const backend = new MockBackend()
  runningBuild(backend)
  await backend.install(page)

  // Opening the workspace follows the project's latest build.
  await page.goto('/p/proj-1/workspace')
  const first = await backend.socket(BUILD, 1)
  await expect(page.getByTestId('live-build-status')).toHaveText('Build running')
  await expect(page.getByRole('button', { name: /Files \(1\)/ })).toBeVisible()
  const hydrations = backend.count('GET', `/v1/builds/${BUILD}/collaboration`)
  expect(hydrations).toBeGreaterThan(0)

  // The connection drops. While it is down, the backend moves on; none of
  // these changes is ever sent as an event.
  await first.close({ code: 1006, reason: 'network' })
  await expect(page.getByTestId('live-connection')).toHaveText('Reconnecting…')
  const b = backend.build(BUILD)
  b.doc.agents = [
    { agent: 'architect', status: 'success', started_at: '2026-11-22T10:00:00', completed_at: '2026-11-22T10:00:30' },
    { agent: 'designer', status: 'running', started_at: '2026-11-22T10:00:31' },
  ]
  b.files = { 'README.md': '# Ledger', 'src/ledger.ts': 'export const ledger = []' }
  b.doc.pending_gate = {
    gate_id: 'g1',
    stage: 'designer',
    agent: 'architect',
    kind: 'escalation',
    questions: [],
    timeout_seconds: 180,
    requested_at: '2026-11-22T10:02:00',
    escalation_id: 'x1',
    subject: escalation.subject,
    detail: escalation.detail,
    options: escalation.options,
  }
  b.collaboration = {
    protocol_version: 2,
    messages: [message('completed', { answer: 'Integer cents.', resolved_at: '2026-11-22T10:01:10' })],
    decisions: [
      {
        entry_id: 'e1',
        key: 'data.amount_representation',
        kind: 'decision',
        value: 'Integer cents',
        rationale: 'Avoids float rounding',
        owner_agent: 'architect',
        source_message_id: 'm1',
        version: 1,
        created_at: '2026-11-22T10:01:10',
        superseded_by: null,
      },
    ],
    escalations: [escalation],
    budget: { credits_used: 1, reserved_credits: 27, messages_used: 1, max_messages: 6 },
  }

  // The client reconnects by itself and re-hydrates.
  const second = await backend.socket(BUILD, 2)
  await expect.poll(() => backend.count('GET', `/v1/builds/${BUILD}/collaboration`)).toBeGreaterThan(hydrations)
  await expect(page.getByTestId('live-connection')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Files \(2\)/ })).toBeVisible()

  // A stale event replayed after the snapshot must not move m1 back.
  second.send(wsEvent(BUILD, 'agent_message_request', message('queued')))

  await page.getByRole('button', { name: /Collaboration/ }).click()
  const activity = page.getByRole('region', { name: /Activity/ })
  await expect(activity.getByTestId('collab-message')).toHaveCount(1)
  await expect(activity.getByTestId('collab-message')).toContainText('Answered')
  await expect(activity.getByTestId('collab-message')).toContainText('Integer cents.')
  await expect(activity.getByText('Architect completed')).toBeVisible()
  await expect(page.getByRole('region', { name: /Decisions/ }).getByText('Avoids float rounding')).toBeVisible()

  // The escalation gate restored from the REST state: options are buttons.
  const escalations = page.getByRole('region', { name: /Escalations/ })
  await expect(escalations.getByText('Needs your decision')).toBeVisible()
  const options = escalations.getByRole('group', { name: 'Choose an option:' })
  await expect(options.getByRole('button')).toHaveText(['Integer cents', 'Decimal strings'])
  await options.getByRole('button', { name: 'Decimal strings' }).focus()
  await page.keyboard.press('Enter')
  await expect(escalations.getByRole('status')).toContainText('Sent “Decimal strings”')
  const gatePost = backend.requests.find((r) => r.method === 'POST' && r.path === `/v1/builds/${BUILD}/gate`)
  expect(gatePost?.body).toEqual({ gate_id: 'g1', action: 'answers', answers: ['Decimal strings'] })

  // The backend resolves it and broadcasts.
  b.doc.pending_gate = null
  second.send(wsEvent(BUILD, 'gate_resolved', { gate_id: 'g1', stage: 'designer', agent: 'architect', action: 'answers', auto: false }))
  second.send(
    wsEvent(BUILD, 'collab_escalation_resolved', {
      escalation: { ...escalation, state: 'resolved', resolution: 'Decimal strings', resolved_by: 'user', rationale: 'Chosen by the user.', resolved_at: '2026-11-22T10:02:30' },
    }),
  )
  await expect(escalations.getByText('Resolved', { exact: true })).toBeVisible()
  await expect(escalations.getByRole('group')).toHaveCount(0)
  // A replayed "opened" event can't re-open it.
  second.send(wsEvent(BUILD, 'collab_escalation_opened', { escalation }))
  await expect(escalations.getByText('Resolved', { exact: true })).toBeVisible()
  expect(backend.unmocked).toEqual([])
})

test('a reload re-attaches to the latest build and shows its persisted state', async ({ page }) => {
  const backend = new MockBackend()
  runningBuild(backend)
  const b = backend.build(BUILD)
  b.doc.status = 'success'
  b.doc.build_status = 'completed'
  b.doc.agents = [{ agent: 'architect', status: 'success', started_at: '2026-11-22T10:00:00', completed_at: '2026-11-22T10:00:30' }]
  b.collaboration = { ...(b.collaboration as object), messages: [message('completed', { answer: 'Integer cents.' })] }
  await backend.install(page)

  await page.goto('/p/proj-1/workspace')
  await expect(page.getByTestId('live-build-status')).toHaveText('Build complete')
  await page.reload()
  await expect(page.getByTestId('live-build-status')).toHaveText('Build complete')
  await expect(page.getByRole('button', { name: /Files \(1\)/ })).toBeVisible()
  // One socket per page load, both for the persisted build.
  await expect.poll(() => backend.socketIds()).toEqual([BUILD, BUILD])
})

test('legacy builds (protocol 1, no hydration endpoint) show messages only', async ({ page }) => {
  const backend = new MockBackend()
  backend.addBuild(
    'build-legacy',
    {
      prompt: 'Old build',
      status: 'success',
      agents: [],
      agent_messages: [
        { message_id: 'L1', conversation_id: 'c', sender: 'developer', recipient: 'architect', message_type: 'clarification', question: 'Which auth provider?', answer: 'Email and password.', status: 'answered', credits_charged: 1 },
      ],
    },
    {},
    null,
  )
  backend.projectBuilds = ['build-legacy']
  await backend.install(page)
  await page.goto('/p/proj-1/workspace')
  await expect(page.getByTestId('live-build-status')).toHaveText('Build complete')
  await page.getByRole('button', { name: /Collaboration/ }).click()
  await expect(page.getByText(/original protocol: agent messages only/)).toBeVisible()
  await expect(page.getByRole('region', { name: /Messages/ }).getByText('Which auth provider?')).toBeVisible()
  await expect(page.getByRole('region', { name: /Decisions/ })).toHaveCount(0)
  // The 404 from the missing endpoint is the expected fallback path.
  expect(backend.unmocked).toEqual([])
})
