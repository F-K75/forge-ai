import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { SummaryChip } from './SummaryChip'
import { StatusPill } from './StatusPill'
import { Toggle } from './Toggle'

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
})