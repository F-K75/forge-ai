import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { axe } from 'vitest-axe'
import { SummaryChip } from './SummaryChip'
import { StatusPill } from './StatusPill'
import { Toggle } from './Toggle'
import { TopNavBar } from './TopNavBar'
import { LeftNavRail } from './LeftNavRail'
import { AvatarStack, ProgressBar, SegmentedControl, StatTile } from './ui'
import { InitiativeCopilotChat } from './pm/InitiativeCopilotChat'
import { AgentPayloadModal } from '../pages/pm/agentRun/AgentPayloadModal'
import { RoadmapEpicModal } from '../pages/pm/roadmap/RoadmapEpicModal'

declare module 'vitest' {
  interface Assertion<T> {
    toHaveNoViolations(): void
  }
}

// vitest-axe computes color-contrast against actual computed styles; jsdom
// provides none, so disable the color-contrast/best-practice rules that would
// otherwise always false-fail in a headless DOM. We still assert structure,
// semantics, labels, and roles (critical/common axe rules).
const AXE_OPTIONS = {
  rules: {
    'color-contrast': { enabled: false },
  },
}

async function axeIt(element: HTMLElement) {
  const results = await axe(element, AXE_OPTIONS)
  expect(results).toHaveNoViolations()
}

describe('accessibility (axe) — core primitives', () => {
  afterEach(() => {
    cleanup()
  })

  it('SummaryChip is accessible', async () => {
    const { container } = render(<SummaryChip label="Credits" value="612" />)
    await axeIt(container)
  })

  it('Toggle is accessible as a labelled switch', async () => {
    const { container } = render(<Toggle on label="Enable notifications" onChange={vi.fn()} />)
    await axeIt(container)
  })

  it('Toggle requires a label for an accessible name', async () => {
    const { container } = render(<Toggle on label="Enable notifications" onChange={vi.fn()} />)
    await axeIt(container)
  })

  it('StatusPill is accessible', async () => {
    const { container } = render(<StatusPill status="complete" />)
    await axeIt(container)
  })

  it('LeftNavRail sidebar is accessible (desktop and mobile drawer)', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <LeftNavRail mobileOpen onCloseMobile={vi.fn()} />
        </BrowserRouter>
      </QueryClientProvider>
    )
    await axeIt(container)
  })

  it('Ember Night dashboard primitives are accessible', async () => {
    const { container } = render(
      <div>
        <StatTile label="Active runs" value={4} delta="+2" trend="up" hint="vs yesterday" />
        <ProgressBar value={72} label="Run progress" showValue />
        <AvatarStack items={[{ name: 'Backend Engineer' }, { name: 'QA Engineer' }]} />
        <SegmentedControl
          label="Billing period"
          value="monthly"
          onChange={vi.fn()}
          options={[
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' },
          ]}
        />
      </div>
    )
    await axeIt(container)
  })

  it('TopNavBar is accessible', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <TopNavBar />
        </BrowserRouter>
      </QueryClientProvider>
    )
    await axeIt(container)
  })

  it('InitiativeCopilotChat is accessible', async () => {
    const mockInit = {
      id: 'init-1',
      user_id: 'user-1',
      version: 1,
      name: 'Agent Pipeline',
      status: 'active',
      tech_stack: ['Next.js', 'Go'],
    }
    const { container } = render(
      <InitiativeCopilotChat
        initiative={mockInit}
        epics={[]}
        isOpen={true}
        onClose={vi.fn()}
      />
    )
    await axeIt(container)
  })

  it('AgentPayloadModal has dialog semantics, Escape close, and zero axe violations', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <AgentPayloadModal
        isOpen={true}
        onClose={onClose}
        title="Agent Output Payload"
        agentName="Frontend Agent"
        payload={{ status: 'ok' }}
      />
    )
    const dialog = within(container).getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'agent-payload-modal-title')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    await axeIt(container)
  })

  it('RoadmapEpicModal has dialog semantics, Escape close, and zero axe violations', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <RoadmapEpicModal
        isOpen={true}
        onClose={onClose}
        epic={{
          id: 'epic-1',
          initiative_id: 'init-1',
          title: 'Accessibility Hardening',
          description: 'Ensure all custom modals follow WCAG AA dialog semantics.',
          priority: 'p1',
          story_points: 8,
        }}
        stories={[]}
        tasks={[]}
      />
    )
    const dialog = within(container).getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'roadmap-epic-modal-title')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    await axeIt(container)
  })
})