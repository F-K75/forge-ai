import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { parseInsufficientCredits } from './insufficientCredits'
import { InsufficientCreditsNotice } from '../components/workspace/InsufficientCreditsNotice'

const http = (status: number, detail: unknown) => ({ response: { status, data: { detail } } })

describe('parseInsufficientCredits (B1-9)', () => {
  it('reads the structured shape', () => {
    const info = parseInsufficientCredits(
      http(402, {
        code: 'insufficient_credits',
        required: 27,
        available: 12,
        breakdown: [
          { label: 'Architect', credits: 3 },
          { label: 'Developer', credits: 7 },
          { label: 'bad', credits: 'x' },
        ],
      }),
    )
    expect(info).toMatchObject({ code: 'insufficient_credits', isCreditShortfall: true, required: 27, available: 12 })
    expect(info?.breakdown).toEqual([
      { label: 'Architect', credits: 3 },
      { label: 'Developer', credits: 7 },
    ])
  })

  it('reads the legacy string shape without inventing amounts', () => {
    expect(parseInsufficientCredits(http(402, 'Insufficient credits'))).toMatchObject({
      code: null,
      isCreditShortfall: true,
      required: null,
      available: null,
      breakdown: [],
    })
  })

  it('keeps a non-credit 402 message (expired trial)', () => {
    const info = parseInsufficientCredits(http(402, 'Your trial has expired. Please upgrade to continue building.'))
    expect(info?.isCreditShortfall).toBe(false)
    expect(info?.message).toMatch(/trial has expired/)
  })

  it('ignores anything that is not a 402', () => {
    expect(parseInsufficientCredits(http(429, 'busy'))).toBeNull()
    expect(parseInsufficientCredits(new Error('network'))).toBeNull()
    expect(parseInsufficientCredits(null)).toBeNull()
  })
})

describe('InsufficientCreditsNotice', () => {
  afterEach(() => cleanup())
  const renderNotice = (detail: unknown, balance?: number) => {
    const info = parseInsufficientCredits(http(402, detail))!
    const onDismiss = vi.fn()
    render(
      <MemoryRouter>
        <InsufficientCreditsNotice info={info} balance={balance} onDismiss={onDismiss} />
      </MemoryRouter>,
    )
    return { onDismiss }
  }

  it('shows the required amount, the available amount and the breakdown', () => {
    renderNotice({
      code: 'insufficient_credits',
      required: 27,
      available: 12,
      breakdown: [
        { label: 'Pipeline stages', credits: 21 },
        { label: 'Debug loop', credits: 6 },
      ],
    })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Not enough credits to start this build')).toBeInTheDocument()
    expect(screen.getByTestId('credits-required')).toHaveTextContent('27 credits')
    expect(screen.getByTestId('credits-available')).toHaveTextContent('12 credits')
    expect(screen.getByTestId('credits-shortfall')).toHaveTextContent('15 credits')
    const list = screen.getByRole('list', { name: 'Credit breakdown' })
    expect(within(list).getByText('Pipeline stages')).toBeInTheDocument()
    expect(within(list).getByText('21 credits')).toBeInTheDocument()
    expect(within(list).getByText('Debug loop')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Buy credits' })).toHaveAttribute('href', '/billing')
  })

  it('legacy shape: says what is unknown and falls back to the profile balance', () => {
    renderNotice('Insufficient credits', 12)
    expect(screen.getByTestId('credits-required')).toHaveTextContent('Not reported')
    expect(screen.getByText('Your balance')).toBeInTheDocument()
    expect(screen.getByTestId('credits-available')).toHaveTextContent('12 credits')
    expect(screen.getByText(/didn’t report how many credits/)).toBeInTheDocument()
  })

  it('can be dismissed', () => {
    const { onDismiss } = renderNotice('Insufficient credits')
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss credit notice' }))
    expect(onDismiss).toHaveBeenCalled()
  })
})
