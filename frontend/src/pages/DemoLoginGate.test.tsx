import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import AuthPage from './AuthPage'
import Signup from './Signup'

// The demo sign-in shortcuts are driven by DEMO_LOGIN_ENABLED in lib/env.ts.
// The page-level tests flip that flag through this hoisted state; the env.ts
// tests further down check how the flag is derived from the build env.
const flags = vi.hoisted(() => ({ demoLogin: true }))

vi.mock('../lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/env')>()
  return {
    ...actual,
    get DEMO_LOGIN_ENABLED() {
      return flags.demoLogin
    },
  }
})

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
}))

const mockLogin = vi.fn()
const mockRegister = vi.fn()
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: any) => {
    const state = {
      login: mockLogin,
      register: mockRegister,
      verifyMfa: vi.fn(),
      user: null,
      isAuthenticated: false,
      isLoading: false,
    }
    return selector ? selector(state) : state
  },
  API_URL: 'https://api.test',
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockLogin.mockResolvedValue(undefined)
  mockRegister.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  flags.demoLogin = true
})

describe('demo sign-in shortcuts', () => {
  it('are hidden on the sign-in page when demo login is disabled (live build)', () => {
    flags.demoLogin = false
    render(<AuthPage />)
    expect(screen.queryByRole('button', { name: /sign in as admin/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /auto-fill demo/i })).toBeNull()
    expect(screen.queryByText(/admin@forge\.ai/)).toBeNull()
    expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'you@company.com')
  })

  it('are shown on the sign-in page in demo / flag mode', () => {
    flags.demoLogin = true
    render(<AuthPage />)
    expect(screen.getByRole('button', { name: /sign in as admin/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /auto-fill demo/i }))
    expect(screen.getByLabelText('Email')).toHaveValue('demo@forge.ai')
  })

  it('is hidden on the sign-up page when demo login is disabled', () => {
    flags.demoLogin = false
    render(<Signup />)
    expect(screen.queryByRole('button', { name: /auto-fill test account/i })).toBeNull()
    expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'you@company.com')
  })

  it('is shown on the sign-up page in demo / flag mode', () => {
    flags.demoLogin = true
    render(<Signup />)
    expect(screen.getByRole('button', { name: /auto-fill test account/i })).toBeInTheDocument()
  })

  it('a normal sign-in still redirects to /command with the shortcuts hidden', async () => {
    flags.demoLogin = false
    render(<AuthPage />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password123!' } })
    fireEvent.click(screen.getAllByRole('button', { name: /^sign in$/i })[0])
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/command', { replace: true }))
    expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'Password123!')
  })
})

describe('DEMO_LOGIN_ENABLED (lib/env.ts)', () => {
  async function load(env: Record<string, string>) {
    vi.resetModules()
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    const mod = await vi.importActual<typeof import('../lib/env')>('../lib/env')
    vi.unstubAllEnvs()
    return mod
  }

  it('is on in mock-data demo builds (no VITE_WS_URL)', async () => {
    const env = await load({ VITE_WS_URL: '', VITE_ENABLE_DEMO_LOGIN: '' })
    expect(env.LIVE_MODE).toBe(false)
    expect(env.DEMO_LOGIN_ENABLED).toBe(true)
  })

  it('is off by default in live builds', async () => {
    const env = await load({ VITE_WS_URL: 'wss://api.example.com/ws', VITE_ENABLE_DEMO_LOGIN: '' })
    expect(env.LIVE_MODE).toBe(true)
    expect(env.DEMO_LOGIN_ENABLED).toBe(false)
  })

  it('only turns on in live builds with VITE_ENABLE_DEMO_LOGIN=true exactly', async () => {
    expect(
      (await load({ VITE_WS_URL: 'wss://api.example.com/ws', VITE_ENABLE_DEMO_LOGIN: 'true' })).DEMO_LOGIN_ENABLED,
    ).toBe(true)
    expect(
      (await load({ VITE_WS_URL: 'wss://api.example.com/ws', VITE_ENABLE_DEMO_LOGIN: '1' })).DEMO_LOGIN_ENABLED,
    ).toBe(false)
  })
})
