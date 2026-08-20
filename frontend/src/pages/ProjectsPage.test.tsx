import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { useNavigate } from 'react-router-dom'
import ProjectsPage from './ProjectsPage'

const mockNavigate = vi.fn()
const mockReset = vi.fn()

const { mockProjectsApi, mockFlowApi, mockReposApi } = vi.hoisted(() => {
  const projectsApi = { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'p1', name: 'Test' }) }
  const flowApi = { personalAnalytics: vi.fn().mockResolvedValue(null), agentStats: vi.fn().mockResolvedValue(null) }
  const reposApi = { import: vi.fn().mockResolvedValue({ project: { id: 'p1', name: 'Imported' } }) }
  return { mockProjectsApi: projectsApi, mockFlowApi: flowApi, mockReposApi: reposApi }
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: any) => {
    const state = {
      user: { id: 'u1', name: 'Builder', plan: 'free', credits: 100 },
      isAuthenticated: true,
      isLoading: false,
    }
    return selector ? selector(state) : state
  },
}))

vi.mock('../store/buildStore', () => ({
  useBuildStore: (selector: any) => {
    const state = { error: null, reset: mockReset }
    return selector ? selector(state) : state
  },
}))

vi.mock('../lib/api', () => ({
  projectsApi: mockProjectsApi,
  flowApi: mockFlowApi,
  reposApi: mockReposApi,
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('../components/BrandLogo', () => ({
  default: () => <div data-testid="brand-logo" />,
}))

vi.mock('../components/ui/EmptyState', () => ({
  EmptyState: ({ children }: any) => <div data-testid="empty-state">{children}</div>,
}))

vi.mock('../lib/animations', () => {
  const createMotionComponent = (tag: string) => {
    const Component = ({ children, ...props }: any) => {
      const { as, component, ...rest } = props
      const Tag = as || component || tag
      return <Tag {...rest}>{children}</Tag>
    }
    return Component
  }
  const motion = new Proxy({}, { get: (_, tag) => createMotionComponent(String(tag)) }) as any
  return {
    motion,
    motionVariants: {},
    useReducedMotion: () => false,
    useCountUp: () => {},
  }
})

vi.mock('../lib/animationPresets', () => ({
  presets: {
    button: {},
  },
}))

vi.mock('../lib/skillVisuals', () => ({
  coverageStats: [],
  ORG_ROLE_COUNT: 0,
  PLAYBOOK_COUNT: 0,
  PROMPT_TEMPLATE_COUNT: 0,
}))

vi.mock('../lib/coverArt', () => ({
  coverGradient: () => 'linear-gradient(to right, #000, #fff)',
}))

vi.mock('../lib/format', () => ({
  formatRelativeTime: (value: any) => value || 'just now',
}))

describe('ProjectsPage', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockNavigate.mockReturnValue(null)
    mockProjectsApi.list.mockResolvedValue([])
    mockFlowApi.personalAnalytics.mockResolvedValue(null)
    mockFlowApi.agentStats.mockResolvedValue(null)
    mockReposApi.import.mockResolvedValue({ project: { id: 'p1', name: 'Imported' } })
  })

  it('renders the page title', () => {
    render(<ProjectsPage />)
    expect(screen.getByText('Production Software')).toBeTruthy()
  })

  it('shows the import repo button', () => {
    render(<ProjectsPage />)
    expect(screen.getByRole('button', { name: /import repo/i })).toBeTruthy()
  })

  it('reveals repo import input when button is clicked', async () => {
    render(<ProjectsPage />)
    const importButton = screen.getByRole('button', { name: /import repo/i })
    fireEvent.click(importButton)
    expect(screen.getByPlaceholderText('https://github.com/owner/repo')).toBeTruthy()
  })

  it('calls reposApi.import and navigates on successful import', async () => {
    render(<ProjectsPage />)
    fireEvent.click(screen.getByRole('button', { name: /import repo/i }))

    const input = screen.getByPlaceholderText('https://github.com/owner/repo')
    fireEvent.change(input, { target: { value: 'https://github.com/owner/repo' } })
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))

    await waitFor(() => {
      expect(mockReposApi.import).toHaveBeenCalledWith({ repo_url: 'https://github.com/owner/repo' })
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/build/p1')
    })
  })

  it('shows error toast when repo import fails', async () => {
    mockReposApi.import.mockRejectedValueOnce(new Error('fail'))

    render(<ProjectsPage />)
    fireEvent.click(screen.getByRole('button', { name: /import repo/i }))

    const input = screen.getByPlaceholderText('https://github.com/owner/repo')
    fireEvent.change(input, { target: { value: 'https://github.com/owner/repo' } })
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))

    await waitFor(() => {
      expect(mockReposApi.import).toHaveBeenCalled()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
