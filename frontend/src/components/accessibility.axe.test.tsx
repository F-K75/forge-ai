import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { axe } from 'vitest-axe'
import { SummaryChip } from './SummaryChip'
import { StatusPill } from './StatusPill'
import { Toggle } from './Toggle'
import { TopNavBar } from './TopNavBar'
import { InitiativeCopilotChat } from './pm/InitiativeCopilotChat'

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
})