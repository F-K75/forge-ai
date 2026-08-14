import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AuthPage from './AuthPage'

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}))

const mockLogin = vi.fn().mockResolvedValue(undefined)
const mockVerifyMfa = vi.fn()

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: any) => {
    const state = {
      login: mockLogin,
      verifyMfa: mockVerifyMfa,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    }
    return selector ? selector(state) : state
  },
}))

describe('AuthPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLogin.mockResolvedValue(undefined)
    mockVerifyMfa.mockResolvedValue(undefined)
  })

  it('renders login form fields', () => {
    render(<AuthPage />)
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
  })

  it('shows validation errors on empty submit', async () => {
    render(<AuthPage />)
    const forms = screen.getAllByRole('button', { name: /sign in/i })
    fireEvent.click(forms[0])
    await waitFor(() => {
      expect(screen.getByText('Please enter your email.')).toBeTruthy()
      expect(screen.getByText('Please enter your password.')).toBeTruthy()
    })
  })

  it('shows invalid email error', async () => {
    render(<AuthPage />)
    const emailInput = screen.getByLabelText('Email')
    const forms = screen.getAllByRole('button', { name: /sign in/i })
    fireEvent.change(emailInput, { target: { value: 'notanemail' } })
    fireEvent.blur(emailInput)
    fireEvent.click(forms[0])
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address.')).toBeTruthy()
    })
  })

  it('toggles password visibility', async () => {
    render(<AuthPage />)
    const passwordInput = screen.getByLabelText('Password') as HTMLInputElement
    const toggleBtn = screen.getAllByLabelText('Show password')[0]
    expect(passwordInput.type).toBe('password')
    fireEvent.click(toggleBtn)
    expect(passwordInput.type).toBe('text')
  })

  it('calls login on submit with valid data', async () => {
    render(<AuthPage />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass123' } })
    const forms = screen.getAllByRole('button', { name: /sign in/i })
    fireEvent.click(forms[0])
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('a@b.com', 'pass123')
    })
  })

  it('shows MFA form when login returns mfaRequired', async () => {
    mockLogin.mockResolvedValue({ mfaRequired: true, mfaToken: 'mfa-tok' })
    render(<AuthPage />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pass123' } })
    const forms = screen.getAllByRole('button', { name: /sign in/i })
    fireEvent.click(forms[0])
    await waitFor(() => {
      expect(screen.getByLabelText('Authentication code')).toBeTruthy()
    })
  })
})
