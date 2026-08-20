import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { DesignPane } from './DesignPane'

vi.mock('../AgentRunShell', () => ({
  RunSectionLabel: ({ children }: any) => <p data-testid="label">{children}</p>,
}))

describe('DesignPane', () => {
  beforeEach(() => {
    cleanup()
  })
  it('renders empty state when design is empty', () => {
    render(<DesignPane design={{}} />)
    expect(screen.getByText('No design output yet.')).toBeTruthy()
  })

  it('renders empty state when design is undefined', () => {
    render(<DesignPane design={{}} />)
    expect(screen.getByText('No design output yet.')).toBeTruthy()
  })

  it('renders theme and layout chips when present', () => {
    render(
      <DesignPane
        design={{
          theme: { color: 'blue', font: 'Inter' },
          layout: { sidebar: 'left', density: 'comfortable' },
        }}
      />,
    )
    expect(screen.getByText('Theme & layout')).toBeTruthy()
    expect(screen.getByText(/color:/)).toBeTruthy()
    expect(screen.getByText(/font:/)).toBeTruthy()
    expect(screen.getByText(/sidebar:/)).toBeTruthy()
    expect(screen.getByText(/density:/)).toBeTruthy()
  })

  it('renders components list when present', () => {
    render(
      <DesignPane
        design={{
          components: {
            Header: { type: 'navbar', sticky: true },
            Footer: { type: 'static' },
          },
        }}
      />,
    )
    expect(screen.getByText('Components')).toBeTruthy()
    expect(screen.getByText('Header')).toBeTruthy()
    expect(screen.getByText('Footer')).toBeTruthy()
    expect(screen.getByText(/"type": "navbar"/)).toBeTruthy()
  })

  it('renders design notes when present', () => {
    render(<DesignPane design={{ design_notes: 'Use accessible colors only.' }} />)
    expect(screen.getByText('Design notes')).toBeTruthy()
    expect(screen.getByText('Use accessible colors only.')).toBeTruthy()
  })

  it('renders full design output together', () => {
    const { container } = render(
      <DesignPane
        design={{
          theme: { color: 'blue' },
          layout: { density: 'comfortable' },
          components: { Button: { variant: 'primary' } },
          design_notes: 'Keep it simple.',
        }}
      />,
    )
    expect(container.textContent).toContain('Theme & layout')
    expect(container.textContent).toContain('Components')
    expect(container.textContent).toContain('Design notes')
    expect(container.textContent).toContain('Keep it simple.')
  })
})
