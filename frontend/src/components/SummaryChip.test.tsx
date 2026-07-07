import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SummaryChip } from './SummaryChip'

describe('SummaryChip', () => {
  it('renders the label and value', () => {
    render(<SummaryChip label="Credits" value="612" />)
    expect(screen.getByText('Credits')).toBeTruthy()
    expect(screen.getByText('612')).toBeTruthy()
  })

  it('renders the value when warn is set', () => {
    const { container } = render(<SummaryChip label="Risk" value="high" warn />)
    expect(container.textContent).toContain('high')
  })
})
