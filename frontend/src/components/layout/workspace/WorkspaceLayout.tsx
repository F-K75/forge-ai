import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { buildsApi } from '../../lib/api'

import { PreviewPanel } from '../../preview/PreviewPanel'
import { useBuildStore } from '../../store/buildStore'
import { useAuthStore } from '../../store/authStore'
import { useBuildSocket } from '../../hooks/useBuildSocket'
import { ResizablePanel } from '../ResizablePanel'

import {
  WorkspaceHeader,
  WorkspaceSidebar,
  MobileNavigation,
  WorkspaceMetrics,
  BottomDock,
  TabletSidebar,
  MobileBottomNav,
  WORKSPACE_SIDEBAR_ITEMS,
} from './index'

export default function WorkspaceLayout() {
  const params = useParams<{ projectId?: string }>()
  const projectId = params.projectId || 'default-project'

  const { user, logout } = useAuthStore()
  const {
    buildId,
    status,
    files,
    agents,
    startBuild,
    creditsUsed,
    debugIterations,
    streamBuffer,
    validation,
  } = useBuildStore()

  const { connectionStatus } = useBuildSocket(buildId)

  const [showUserMenu, setShowUserMenu] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.user-menu-container')) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileNavOpen) {
        setMobileNavOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileNavOpen])

  useEffect(() => {
    if (mobileNavOpen) {
      const focusableElements = document.querySelectorAll(
        'nav [href], nav button, nav input, nav textarea, nav select'
      )
      const firstElement = focusableElements[0] as HTMLElement
      firstElement?.focus()
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileNavOpen])

  const handleLogout = useCallback(async () => {
    await logout()
    window.location.href = '/login'
  }, [logout])

  const handleBuildStart = useCallback(async (promptText: string) => {
    const created = await buildsApi.create({ project_id: projectId, prompt: promptText })
    const newBuildId = created.build_id || created.buildId || created.build_id
    useBuildStore.setState({ buildId: newBuildId })
    startBuild(newBuildId, promptText)
  }, [projectId, startBuild])

  const fileCount = Object.keys(files).length

  return (
    <div className="flex h-screen bg-forge-bg text-forge-text">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded bg-violet-600 px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-white">
        Skip to main content
      </a>

      <MobileNavigation
        items={WORKSPACE_SIDEBAR_ITEMS}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      <WorkspaceSidebar items={WORKSPACE_SIDEBAR_ITEMS} />

      <div className="flex flex-1 flex-col lg:pl-60">
        <WorkspaceHeader
          status={status}
          connectionStatus={connectionStatus}
          fileCount={fileCount}
          user={user}
          showUserMenu={showUserMenu}
          setShowUserMenu={setShowUserMenu}
          onLogout={handleLogout}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        <div id="main-content" className="flex-1 overflow-y-auto" role="main">
          <div className="p-6 space-y-6">
            <ProjectOverviewContent />

            <WorkspaceMetrics
              agents={agents}
              fileCount={fileCount}
              creditsUsed={creditsUsed}
              validation={validation}
              status={status}
            />

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-4">
                <ActivityFeed />
              </div>
              <ResizerPanelSide />
            </div>
          </div>
        </div>

        <MobileBottomNav onNavClick={() => setMobileNavOpen(false)} />

        <BottomDock
          status={status}
          prompt=""
          streamBuffer={streamBuffer}
          agents={agents}
          debugIterations={debugIterations}
        />
      </div>

      <ResizablePanel side="right" defaultSize={420} minSize={320} maxSize={560}>
        <PreviewPanel />
      </ResizablePanel>
    </div>
  )
}

function ProjectOverviewContent() {
  const { status, prompt, agents, creditsUsed, debugIterations } = useBuildStore()
  const activeAgents = agents.filter(agent => agent.status === 'running').length
  const completedAgents = agents.filter(agent => agent.status === 'complete').length

  return (
    <section className="rounded-xl border border-forge-border bg-forge-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-forge-text mb-3">Forge AI Workspace</h2>
          <div className="mb-4">
            <h3 className="text-xs uppercase tracking-wider text-forge-text-secondary mb-2">Stack</h3>
            <div className="flex flex-wrap gap-2">
              {['React • Framework', 'PostgreSQL • Database', 'FastAPI • Backend', 'Tailwind • Frontend'].map(item => (
                <span key={item} className="inline-flex items-center rounded-full bg-forge-border/20 px-3 py-1 text-xs text-forge-text-secondary">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 text-xs">
            <div><span className="text-forge-text-secondary">Agents:</span> <span className="text-forge-text">{activeAgents}/{agents.length}</span></div>
            <div><span className="text-forge-text-secondary">Completed:</span> <span className="text-forge-text">{completedAgents}</span></div>
            <div><span className="text-forge-text-secondary">Credits:</span> <span className="text-forge-text">{creditsUsed}</span></div>
          </div>
        </div>
        <div>
          <span className={`text-xs px-2.5 py-1 rounded-md ${status === 'running' ? 'bg-emerald-500/20 text-emerald-300' : status === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}`}>
            {status === 'success' ? 'Running' : status === 'running' ? 'Running' : 'Waiting'}
          </span>
        </div>
      </div>
    </section>
  )
}

function ActivityFeed() {
  const { agents, streamBuffer } = useBuildStore()
  return (
    <section className="rounded-xl border border-forge-border bg-forge-surface p-4">
      <h3 className="text-xs uppercase tracking-wider text-forge-text-secondary mb-3">Activity</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {agents.map(agent => (
          <div key={agent.type} className="flex items-center gap-2 text-sm">
            <span className="text-forge-text-secondary">{agent.type}</span>
            <span className={`text-xs ${agent.status === 'running' ? 'text-violet-400' : agent.status === 'complete' ? 'text-emerald-400' : 'text-forge-text-secondary'}`}>
              {agent.status}
            </span>
          </div>
        ))}
        {streamBuffer && (
          <div className="text-xs text-forge-text-secondary mt-2 p-2 bg-forge-border/20 rounded">
            {streamBuffer.slice(0, 200)}...
          </div>
        )}
      </div>
    </section>
  )
}

function ResizerPanelSide() {
  const { status } = useBuildStore()
  const [promptInput, setPromptInput] = useState('')

  const { startBuild } = useBuildStore()
  const projectId = useParams<{ projectId?: string }>().projectId || 'default-project'

  const handleSubmit = () => {
    if (promptInput.trim() && status !== 'running') {
      startBuild('new-build', promptInput)
      setPromptInput('')
    }
  }

  return (
    <section className="rounded-xl border border-forge-border bg-forge-surface p-4">
      <label className="block text-xs uppercase tracking-wider text-forge-text-secondary mb-2" htmlFor="prompt-input">
        Current intent
      </label>
      <div className="flex items-center gap-2">
        <input
          id="prompt-input"
          type="text"
          value={promptInput}
          onChange={e => setPromptInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="Enter your command..."
          className="flex-1 rounded-lg border border-forge-border bg-forge-bg text-sm text-forge-text placeholder-forge-text-secondary/50 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
          disabled={status === 'running'}
        />
        <button
          onClick={handleSubmit}
          disabled={!promptInput.trim() || status === 'running'}
          className="rounded-lg bg-violet-600 p-2.5 text-white hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-violet-500"
        >
          <Send size={16} />
        </button>
      </div>
    </section>
  )
}