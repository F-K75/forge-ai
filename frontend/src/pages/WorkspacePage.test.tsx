import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import WorkspacePage from './WorkspacePage'

// Mock APIs and Stores
vi.mock('../lib/api', () => ({
  projectsApi: {
    get: vi.fn().mockResolvedValue({ id: 'proj-001', name: 'habit-tracker', description: 'Test project' }),
    create: vi.fn().mockResolvedValue({ id: 'proj-new', name: 'New Project', description: 'New description' }),
  },
  buildsApi: {
    create: vi.fn().mockResolvedValue({ id: 'build-123' }),
  },
}))

vi.mock('../store/buildStore', () => ({
  useBuildStore: (selector: any) =>
    selector({
      startBuild: vi.fn(),
      sendMessage: vi.fn(),
      handleEvent: vi.fn(),
    }),
}))

vi.mock('../hooks/useBuildSocket', () => ({
  useBuildSocket: vi.fn().mockReturnValue({ connectionStatus: 'connected' }),
}))

// Mock Monaco Editor for JSDOM
vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="mock-monaco-editor">Monaco Editor Mock</div>,
  DiffEditor: () => <div data-testid="mock-diff-editor">Diff Editor Mock</div>,
}))

describe('WorkspacePage (Sui Neo-brutalist redesign)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the workspace with SuiWindowFrame and project title', async () => {
    render(
      <MemoryRouter initialEntries={['/build/proj-001']}>
        <Routes>
          <Route path="/build/:projectId" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: /habit-tracker/i })).toBeInTheDocument()
    })

    // Status chips
    expect(screen.getByText(/EDGE LIVE · READY/i)).toBeInTheDocument()
    expect(screen.getByText(/42\/42 VITEST PASSED/i)).toBeInTheDocument()
  })

  it('allows switching surfaces via navigation tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/build/proj-001']}>
        <Routes>
          <Route path="/build/:projectId" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>
    )

    // Default is Canvas
    await waitFor(() => {
      expect(screen.getByText(/System Architecture Canvas \(DAG\)/i)).toBeInTheDocument()
    })

    // Click on Code Studio tab
    const codeTab = screen.getByRole('button', { name: /Code Studio/i })
    fireEvent.click(codeTab)

    await waitFor(() => {
      expect(screen.getByText(/Code Studio · src\/api\/auth\.ts/i)).toBeInTheDocument()
    })

    // Click on QA Tests tab
    const testsTab = screen.getByRole('button', { name: /QA Tests/i })
    fireEvent.click(testsTab)

    await waitFor(() => {
      expect(screen.getByText(/Vitest Autonomous Assertion Suite/i)).toBeInTheDocument()
    })

    // Click on Agent Fleet tab
    const agentsTab = screen.getByRole('button', { name: /Agent Fleet/i })
    fireEvent.click(agentsTab)

    await waitFor(() => {
      expect(screen.getByText(/Autonomous Multi-Agent Fleet/i)).toBeInTheDocument()
      expect(screen.getByText(/Architect Agent/i)).toBeInTheDocument()
      expect(screen.getByText(/Security Auditor/i)).toBeInTheDocument()
    })
  })

  it('opens and closes the file explorer modal', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/build/proj-001']}>
        <Routes>
          <Route path="/build/:projectId" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>
    )

    const filesBtn = container.querySelector<HTMLButtonElement>('#ws-open-files-btn')!
    expect(filesBtn).toBeInTheDocument()
    fireEvent.click(filesBtn)

    await waitFor(() => {
      expect(screen.getByText(/FILES_EXPLORER\.SYS/i)).toBeInTheDocument()
    })
  })

  it('opens and closes the living agents fleet modal', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/build/proj-001']}>
        <Routes>
          <Route path="/build/:projectId" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>
    )

    const fleetBtn = container.querySelector<HTMLButtonElement>('#ws-open-fleet-btn')!
    expect(fleetBtn).toBeInTheDocument()
    fireEvent.click(fleetBtn)

    await waitFor(() => {
      expect(screen.getByText(/LIVING_AGENTS\.SYS/i)).toBeInTheDocument()
    })
  })

  it('submits a command prompt in the bottom command deck', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/build/proj-001']}>
        <Routes>
          <Route path="/build/:projectId" element={<WorkspacePage />} />
        </Routes>
      </MemoryRouter>
    )

    const input = container.querySelector<HTMLInputElement>('#ws-command-input')!
    expect(input).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'Add PKCE authentication flow' } })

    const executeBtn = container.querySelector<HTMLButtonElement>('#ws-execute-btn')!
    expect(executeBtn).toBeInTheDocument()
    fireEvent.click(executeBtn)

    await waitFor(() => {
      expect(screen.getByText(/SYNTHESIZING\.\.\./i)).toBeInTheDocument()
    })
  })
})
