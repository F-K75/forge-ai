import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import Signup from './Signup'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}))

const mockRegister = vi.fn().mockResolvedValue(undefined)

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: any) => {
    const state = {
      register: mockRegister,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    }
    return selector ? selector(state) : state
  },
  API_URL: 'https://api.test',
}))

describe('Signup Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRegister.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders registration form fields and heading', () => {
    render(<Signup />)
    expect(screen.getByLabelText('Full name')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByLabelText('Confirm password')).toBeTruthy()
    expect(screen.getByText(/Create your account/i)).toBeTruthy()
  })

  it('shows validation errors on empty submit', async () => {
    render(<Signup />)
    const submitBtn = screen.getByRole('button', { name: /create workspace account/i })
    fireEvent.click(submitBtn)
    await waitFor(() => {
      expect(screen.getByText('Please enter your full name.')).toBeTruthy()
      expect(screen.getByText('Please enter your email.')).toBeTruthy()
      expect(screen.getByText('Password is required')).toBeTruthy()
      expect(screen.getByText('Please confirm your password.')).toBeTruthy()
    })
  })

  it('validates password mismatch and email format', async () => {
    render(<Signup />)
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Alex Chen' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'invalid-email' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'ValidPass123!@#' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'MismatchPass123!' } })

    const submitBtn = screen.getByRole('button', { name: /create workspace account/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address.')).toBeTruthy()
      expect(screen.getByText("The passwords you entered don't match.")).toBeTruthy()
    })
  })

  it('toggles password visibility', () => {
    render(<Signup />)
    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement
    const toggleButtons = screen.getAllByLabelText('Show password')
    expect(passwordInput.type).toBe('password')

    fireEvent.click(toggleButtons[0])
    expect(passwordInput.type).toBe('text')
  })

  it('auto-fills test account using the demo button', () => {
    render(<Signup />)
    const autoFillBtn = screen.getByRole('button', { name: /auto-fill test account/i })
    fireEvent.click(autoFillBtn)

    const nameInput = screen.getByLabelText('Full name') as HTMLInputElement
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement
    expect(nameInput.value).toBe('Alex Rivera')
    expect(emailInput.value).toBe('alex.rivera@forge.ai')
  })

  it('calls register and shows confirmation state on success', async () => {
    render(<Signup />)
    const autoFillBtn = screen.getByRole('button', { name: /auto-fill test account/i })
    fireEvent.click(autoFillBtn)

    const submitBtn = screen.getByRole('button', { name: /create workspace account/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        'alex.rivera@forge.ai',
        'Alex Rivera',
        'ForgeDeveloper2026!'
      )
      expect(screen.getByText(/CHECK YOUR INBOX/i)).toBeTruthy()
      expect(screen.getByText(/alex\.rivera@forge\.ai/i)).toBeTruthy()
    })
  })
})
