import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from './LandingPage'
import { PLANS, FAQS, STEPS } from '../components/landing/landingContent'

beforeAll(() => {
  // jsdom has no canvas; the ember field must degrade silently.
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext']
})

afterEach(cleanup)

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/home']}>
      <LandingPage />
    </MemoryRouter>,
  )
}

describe('LandingPage', () => {
  it('renders one h1 and every section landmark', () => {
    renderPage()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ship ideas, autonomously.')
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    for (const name of [
      /See the work/,
      /Everything an engineering org needs/,
      /One OS for the whole lifecycle/,
      /Simple, credit-based pricing/,
      /Questions/,
      /Your next idea already has a team/,
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(screen.getByText(/Software shouldn't need a hundred handoffs/)).toBeInTheDocument()
  })

  it('labels the testimonial as illustrative', () => {
    renderPage()
    expect(screen.getByText(/Illustrative example, not a customer quote/)).toBeInTheDocument()
  })

  it('links the CTAs to /signup and /login', () => {
    renderPage()
    const start = screen.getAllByRole('link', { name: /Start building/ })
    expect(start.length).toBeGreaterThanOrEqual(2)
    start.forEach((a) => expect(a).toHaveAttribute('href', '/signup'))
    const signIn = screen.getAllByRole('link', { name: /^Sign in$/ })
    expect(signIn.length).toBeGreaterThanOrEqual(2)
    signIn.forEach((a) => expect(a).toHaveAttribute('href', '/login'))
  })

  it('switches lifecycle steps', async () => {
    renderPage()
    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(STEPS.length)
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: /04 Ship/ }))
    expect(screen.getByRole('tab', { name: /04 Ship/ })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(screen.getByRole('tabpanel')).toHaveTextContent(STEPS[3].title))
  })

  it('toggles pricing between monthly and yearly', () => {
    renderPage()
    const pro = PLANS.find((p) => p.tier === 'pro')!
    expect(screen.getByTestId('price-pro')).toHaveTextContent(`$${pro.monthly}`)
    const yearly = screen.getByRole('radio', { name: /Yearly/ })
    fireEvent.click(yearly)
    expect(yearly).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('price-pro')).toHaveTextContent(`$${pro.yearly}`)
    expect(screen.getByTestId('price-standard')).toHaveTextContent('$200')
    fireEvent.click(screen.getByRole('radio', { name: /Monthly/ }))
    expect(screen.getByTestId('price-standard')).toHaveTextContent('$20')
  })

  it('opens and closes FAQ answers accessibly', () => {
    renderPage()
    const faq = screen.getByRole('heading', { level: 2, name: /Questions/ }).closest('section')!
    const buttons = within(faq).getAllByRole('button')
    expect(buttons).toHaveLength(FAQS.length)
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'true')
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'false')

    const panelId = buttons[1].getAttribute('aria-controls')!
    expect(document.getElementById(panelId)).not.toBeVisible()
    fireEvent.click(buttons[1])
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'true')
    expect(buttons[0]).toHaveAttribute('aria-expanded', 'false')
    const region = screen.getByRole('region', { name: FAQS[1].q })
    expect(region).toHaveTextContent(FAQS[1].a)
    fireEvent.click(buttons[1])
    expect(buttons[1]).toHaveAttribute('aria-expanded', 'false')
  })
})
