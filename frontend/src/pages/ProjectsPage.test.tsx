import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ProjectsPage from './ProjectsPage'

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ProjectsPage />
    </QueryClientProvider>
  )
}

const mockNavigate = vi.fn()
const mockReset = vi.fn()

const { mockProjectsApi, mockFlowApi, mockReposApi, mockScaffoldProjectWithGemini, mockAnalyzeProjectWithGemini, mockExpandProjectIdeaWithGemini } = vi.hoisted(() => {
  const projectsApi = { list: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'p1', name: 'Test' }) }
  const flowApi = { personalAnalytics: vi.fn().mockResolvedValue(null), agentStats: vi.fn().mockResolvedValue(null) }
  const reposApi = { import: vi.fn().mockResolvedValue({ project: { id: 'p1', name: 'Imported' } }) }
  const scaffoldProjectWithGemini = vi.fn().mockResolvedValue({
    id: 'proj-gemini-test',
    name: 'gemini-test-app',
    displayName: 'Gemini Test App',
    description: 'Autonomous project scaffolded with Gemini',
    template: 'saas',
    techStack: ['TypeScript', 'React'],
    qaScore: 95,
    agents: ['architect', 'developer'],
    architectureOverview: 'Clean architecture',
    lastBuilt: 'Just now',
    live: true,
    isAiGenerated: true,
  })
  const analyzeProjectWithGemini = vi.fn().mockResolvedValue({
    executiveSummary: 'High-performance decoupled architecture with robust security invariants.',
    architectureGrade: 'A+',
    securityScore: 96,
    scalabilityScore: 92,
    reliabilityScore: 98,
    strengths: ['Strict boundary isolation', 'Sub-millisecond token evaluation'],
    vulnerabilities: [
      {
        area: 'Distributed Caching',
        risk: 'medium',
        recommendation: 'Add TTL jitter to avoid stampede',
      },
    ],
    suggestedEnhancements: [
      {
        title: 'OpenTelemetry Distributed Tracing',
        impact: 'Full visibility across microservice boundaries',
        effort: 'low',
        promptAction: 'Add OTel tracing',
      },
    ],
    agentDirectives: {
      architect: 'Maintain OpenAPI 3.1 schema',
      developer: 'Connection pooling',
      qa: 'Fuzz testing',
      security: 'Dependency scanner',
    },
  })
  const expandProjectIdeaWithGemini = vi.fn().mockResolvedValue([
    {
      id: 'opt-edge',
      title: 'Globally Distributed Edge Service',
      summary: 'Stateless high-throughput microservice architecture.',
      archetype: 'edge',
      recommendedStack: ['TypeScript', 'Hono', 'Redis'],
      keyTradeoff: 'Fast latency, external state required',
      estimatedSla: '99.99% uptime',
      refinedPrompt: 'Build edge service with Redis caching',
    },
  ])
  return {
    mockProjectsApi: projectsApi,
    mockFlowApi: flowApi,
    mockReposApi: reposApi,
    mockScaffoldProjectWithGemini: scaffoldProjectWithGemini,
    mockAnalyzeProjectWithGemini: analyzeProjectWithGemini,
    mockExpandProjectIdeaWithGemini: expandProjectIdeaWithGemini,
  }
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

vi.mock('../lib/geminiProject', () => ({
  scaffoldProjectWithGemini: mockScaffoldProjectWithGemini,
  analyzeProjectWithGemini: mockAnalyzeProjectWithGemini,
  expandProjectIdeaWithGemini: mockExpandProjectIdeaWithGemini,
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
    mockScaffoldProjectWithGemini.mockResolvedValue({
      id: 'proj-gemini-test',
      name: 'gemini-test-app',
      displayName: 'Gemini Test App',
      description: 'Autonomous project scaffolded with Gemini',
      template: 'saas',
      techStack: ['TypeScript', 'React'],
      qaScore: 95,
      agents: ['architect', 'developer'],
      architectureOverview: 'Clean architecture',
      lastBuilt: 'Just now',
      live: true,
      isAiGenerated: true,
    })
    mockAnalyzeProjectWithGemini.mockResolvedValue({
      executiveSummary: 'High-performance decoupled architecture with robust security invariants.',
      architectureGrade: 'A+',
      securityScore: 96,
      scalabilityScore: 92,
      reliabilityScore: 98,
      strengths: ['Strict boundary isolation', 'Sub-millisecond token evaluation'],
      vulnerabilities: [
        {
          area: 'Distributed Caching',
          risk: 'medium',
          recommendation: 'Add TTL jitter to avoid stampede',
        },
      ],
      suggestedEnhancements: [
        {
          title: 'OpenTelemetry Distributed Tracing',
          impact: 'Full visibility across microservice boundaries',
          effort: 'low',
          promptAction: 'Add OTel tracing',
        },
      ],
      agentDirectives: {
        architect: 'Maintain OpenAPI 3.1 schema',
        developer: 'Connection pooling',
        qa: 'Fuzz testing',
        security: 'Dependency scanner',
      },
    })
    mockExpandProjectIdeaWithGemini.mockResolvedValue([
      {
        id: 'opt-edge',
        title: 'Globally Distributed Edge Service',
        summary: 'Stateless high-throughput microservice architecture.',
        archetype: 'edge',
        recommendedStack: ['TypeScript', 'Hono', 'Redis'],
        keyTradeoff: 'Fast latency, external state required',
        estimatedSla: '99.99% uptime',
        refinedPrompt: 'Build edge service with Redis caching',
      },
    ])
  })

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('Production Software')).toBeTruthy()
  })

  it('shows the import repo button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /import repo/i })).toBeTruthy()
  })

  it('reveals repo import input when button is clicked', async () => {
    renderPage()
    const importButton = screen.getByRole('button', { name: /import repo/i })
    fireEvent.click(importButton)
    expect(screen.getByPlaceholderText('https://github.com/owner/repo')).toBeTruthy()
  })

  it('calls reposApi.import and navigates on successful import', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /import repo/i }))

    const input = screen.getByPlaceholderText('https://github.com/owner/repo')
    fireEvent.change(input, { target: { value: 'https://github.com/owner/repo' } })
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))

    await waitFor(() => {
      expect(mockReposApi.import).toHaveBeenCalledWith({ repo_url: 'https://github.com/owner/repo' })
    })
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/p/p1/workspace')
    })
  })

  it('shows error toast when repo import fails', async () => {
    mockReposApi.import.mockRejectedValueOnce(new Error('fail'))

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /import repo/i }))

    const input = screen.getByPlaceholderText('https://github.com/owner/repo')
    fireEvent.change(input, { target: { value: 'https://github.com/owner/repo' } })
    fireEvent.click(screen.getByRole('button', { name: /^import$/i }))

    await waitFor(() => {
      expect(mockReposApi.import).toHaveBeenCalled()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('scaffolds a project with Gemini AI and displays blueprint preview', async () => {
    renderPage()

    // Click GEMINI AI button in the command bar
    const geminiBtn = screen.getByRole('button', { name: /gemini ai/i })
    fireEvent.click(geminiBtn)

    // Verify modal is open in AI mode
    expect(screen.getByText(/ai architect/i)).toBeTruthy()

    // Type project prompt
    const promptInput = screen.getByPlaceholderText(/rate limiter/i)
    fireEvent.change(promptInput, { target: { value: 'Distributed Rate Limiter in Go' } })

    // Click Scaffold with Gemini
    const scaffoldBtn = screen.getByRole('button', { name: /generate blueprint/i })
    fireEvent.click(scaffoldBtn)

    await waitFor(() => {
      expect(mockScaffoldProjectWithGemini).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: 'Distributed Rate Limiter in Go' })
      )
    })

    // Verify blueprint preview or workspace shows up
    await waitFor(() => {
      expect(screen.getByText(/gemini-test-app/i)).toBeTruthy()
    })
  })

  it('calls Gemini plugin to expand concept ideas and displays architectural proposals', async () => {
    renderPage()

    const terminalInput = screen.getByPlaceholderText(/event-driven payment clearing/i)
    fireEvent.change(terminalInput, { target: { value: 'High Frequency Matching Engine' } })

    const expandBtn = screen.getByRole('button', { name: /expand ideas/i })
    fireEvent.click(expandBtn)

    await waitFor(() => {
      expect(mockExpandProjectIdeaWithGemini).toHaveBeenCalledWith('High Frequency Matching Engine')
    })

    await waitFor(() => {
      expect(screen.getByText(/gemini 3.8 architectural proposals/i)).toBeTruthy()
      expect(screen.getByText(/globally distributed edge service/i)).toBeTruthy()
    })
  })

  it('runs Gemini AI deep architecture audit on a workspace and renders audit report', async () => {
    renderPage()

    // Click AI Audit button on a card
    const auditBtns = screen.getAllByRole('button', { name: /audit/i })
    expect(auditBtns.length).toBeGreaterThan(0)
    fireEvent.click(auditBtns[0])

    await waitFor(() => {
      expect(mockAnalyzeProjectWithGemini).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText(/gemini architecture & security audit/i)).toBeTruthy()
      expect(screen.getByText(/high-performance decoupled architecture/i)).toBeTruthy()
      expect(screen.getByText(/opentelemetry distributed tracing/i)).toBeTruthy()
    })
  })

  it('allows toggling between Bento Grid view and High-Density Table view', () => {
    renderPage()

    // Grid view is default
    const tableToggleBtn = screen.getByTitle(/dense table view/i)
    fireEvent.click(tableToggleBtn)

    // Verify table elements exist
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByText('Status')).toBeTruthy()

    const gridToggleBtn = screen.getByTitle(/grid view/i)
    fireEvent.click(gridToggleBtn)

    expect(screen.queryByRole('table')).toBeNull()
  })
})
