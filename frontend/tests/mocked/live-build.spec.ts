// B1: a live build in the production bundle, backend mocked.
import { test, expect } from '@playwright/test'
import { MockBackend, wsEvent } from './mockBackend'

const BUILD = 'build-live-1'

function setup(backend: MockBackend) {
  backend.onCreateBuild = (body) => {
    backend.addBuild(
      BUILD,
      { prompt: body.prompt, status: 'pending', build_status: 'pending', agents: [], agent_messages: [], collab_config: { protocol_version: 2 } },
      {},
      { protocol_version: 2, messages: [], decisions: [], escalations: [], budget: { credits_used: 0, reserved_credits: 27, messages_used: 0, max_messages: 6 } },
    )
    backend.projectBuilds.unshift(BUILD)
    return { status: 200, body: { build_id: BUILD, status: 'pending' } }
  }
}

test('a live build follows the created build_id, applies events and ends only when the persisted state does', async ({ page }) => {
  const backend = new MockBackend()
  setup(backend)
  await backend.install(page)

  await page.goto('/p/proj-1/workspace')
  const status = page.getByTestId('live-build-status')
  await expect(status).toHaveText('No build yet')
  await expect(page.getByRole('button', { name: /Files \(0\)/ })).toBeVisible()

  await page.getByPlaceholder(/Describe a feature/).fill('Build a ledger with CSV export')
  await page.getByRole('button', { name: /^Run/ }).click()

  // F15: the socket is opened for the build_id of the create response.
  const ws = await backend.socket(BUILD)
  expect(backend.socketIds()).toEqual([BUILD])
  // F4: and the build is hydrated from the REST state on connect.
  await expect.poll(() => backend.count('GET', `/v1/builds/${BUILD}`)).toBeGreaterThan(0)
  await expect.poll(() => backend.count('GET', `/v1/builds/${BUILD}/collaboration`)).toBeGreaterThan(0)
  await expect(status).toHaveText('Build running')

  // The backend persists, then broadcasts.
  const b = backend.build(BUILD)
  b.doc.status = 'running'
  b.doc.build_status = 'running'
  b.doc.agents = [{ agent: 'architect', status: 'success', started_at: '2026-11-22T10:00:00', completed_at: '2026-11-22T10:00:04' }]
  b.files = { 'src/ledger.ts': 'export const ledger = []' }
  ws.send(wsEvent(BUILD, 'agent_start', { agent: 'architect' }))
  ws.send(wsEvent(BUILD, 'agent_complete', { agent: 'architect', files_changed: [] }))
  ws.send(wsEvent(BUILD, 'file_update', { delta: { changed: { 'src/ledger.ts': 'export const ledger = []' }, deleted: [] } }))
  // A v2 message carrying content/state (the relaxed parser accepts it).
  ws.send(
    wsEvent(BUILD, 'agent_message_response', {
      message_id: 'm1',
      sender: 'developer',
      recipient: 'architect',
      message_type: 'clarification',
      content: 'Store amounts as integer cents or decimals?',
      state: 'completed',
      answer: 'Integer cents.',
      lane: 'activity',
      protocol_version: 2,
      created_at: '2026-11-22T10:00:05',
    }),
  )
  ws.send(
    wsEvent(BUILD, 'collab_decision_recorded', {
      entry: {
        entry_id: 'e1',
        key: 'data.amount_representation',
        kind: 'decision',
        value: 'Store amounts as integer cents',
        rationale: 'Avoids float rounding',
        owner_agent: 'architect',
        source_message_id: 'm1',
        version: 1,
        created_at: '2026-11-22T10:00:06',
        superseded_by: null,
      },
    }),
  )
  await expect(page.getByRole('button', { name: /Files \(1\)/ })).toBeVisible()

  // B1-7: build_complete arrives before the persisted state says so; the UI
  // keeps showing a running build and re-reads the REST state.
  const before = backend.count('GET', `/v1/builds/${BUILD}`)
  ws.send(wsEvent(BUILD, 'build_complete', { files: b.files, validation: { score: 91 }, credits_used: 17 }))
  await expect.poll(() => backend.count('GET', `/v1/builds/${BUILD}`)).toBeGreaterThan(before)
  await expect(status).toHaveText('Build running')

  b.doc.status = 'success'
  b.doc.build_status = 'completed'
  b.doc.execution_transitions = [{ from: 'running', to: 'completed', at: '2026-11-22T10:01:00' }]
  await expect(status).toHaveText('Build complete', { timeout: 10_000 })

  // The collaboration panel shows the message and the decision.
  await page.getByRole('button', { name: /Collaboration/ }).click()
  const activity = page.getByRole('region', { name: /Activity/ })
  await expect(activity.getByText('Store amounts as integer cents or decimals?')).toBeVisible()
  await expect(activity.getByText('Architect completed')).toBeVisible()
  await expect(page.getByRole('region', { name: /Decisions/ }).getByText('Store amounts as integer cents', { exact: true })).toBeVisible()

  // F24: nothing was synthesized in the browser.
  expect(backend.synthesisRequests).toEqual([])
  expect(backend.unmocked).toEqual([])
})

test('B1-9: a 402 on build creation shows the required and available amounts and the breakdown', async ({ page }) => {
  const backend = new MockBackend()
  backend.onCreateBuild = () => ({
    status: 402,
    body: {
      detail: {
        code: 'insufficient_credits',
        required: 27,
        available: 12,
        breakdown: [
          { label: 'Agent stages', credits: 17 },
          { label: 'Debug iterations', credits: 6 },
          { label: 'Clarifications', credits: 4 },
        ],
      },
    },
  })
  await backend.install(page)
  await page.goto('/p/proj-1/workspace')
  await page.getByPlaceholder(/Describe a feature/).fill('Build a ledger')
  await page.getByRole('button', { name: /^Run/ }).click()

  const notice = page.getByTestId('insufficient-credits')
  await expect(notice).toBeVisible()
  await expect(notice.getByTestId('credits-required')).toHaveText('27 credits')
  await expect(notice.getByTestId('credits-available')).toHaveText('12 credits')
  await expect(notice.getByTestId('credits-shortfall')).toHaveText('15 credits')
  const breakdown = notice.getByRole('list', { name: 'Credit breakdown' })
  await expect(breakdown.getByRole('listitem')).toHaveText([/Agent stages\s*17 credits/, /Debug iterations\s*6 credits/, /Clarifications\s*4 credits/, /Total\s*27 credits/])
  expect(backend.sockets).toHaveLength(0)
})

test('B1-9: the legacy 402 shape is still explained', async ({ page }) => {
  const backend = new MockBackend()
  backend.onCreateBuild = () => ({ status: 402, body: { detail: 'Insufficient credits' } })
  await backend.install(page)
  await page.goto('/p/proj-1/workspace')
  await page.getByPlaceholder(/Describe a feature/).fill('Build a ledger')
  await page.getByRole('button', { name: /^Run/ }).click()
  const notice = page.getByTestId('insufficient-credits')
  await expect(notice.getByTestId('credits-required')).toHaveText('Not reported')
  await expect(notice.getByTestId('credits-available')).toHaveText('12 credits')
})
