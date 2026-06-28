import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { buildsApi } from '../../lib/api'

import { PreviewPanel } from '../preview/PreviewPanel'
import { useBuildStore } from '../../store/buildStore'
import { useAuthStore } from '../../store/authStore'
import { useBuildSocket } from '../../hooks/useBuildSocket'
import { ResizablePanel } from './ResizablePanel'
import { ProjectOverview } from './ProjectOverview'
import { ActivityFeed } from './ActivityFeed'
import { PromptBox } from './PromptBox'

import {
  WorkspaceHeader,
  WorkspaceSidebar,
  MobileNavigation,
  WorkspaceMetrics,
  BottomDock,
  TabletSidebar,
  MobileBottomNav,
  WORKSPACE_SIDEBAR_ITEMS,
} from './workspace'

export default function WorkspaceLayout() {
  const params = useParams<{ projectId?: string }>()
  const projectId = params.projectId || 'default-project'

  const { user, logout } = useAuthStore()
  const {
    buildId,
    status,
    files,
    startBuild,
    agents,
    prompt,
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
    <div className="flex h-screen flex-col overflow-hidden bg-forge-bg text-forge-text">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded bg-violet-600 px-3 py-1 text-white focus:outline-none focus:ring-2 focus:ring-white">
        Skip to main content
      </a>

      <MobileNavigation
        items={WORKSPACE_SIDEBAR_ITEMS}
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

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

      <div className="flex flex-1 overflow-hidden">
        <ResizablePanel side="left" defaultSize={280} minSize={240} maxSize={360} className="hidden lg:block">
          <WorkspaceSidebar items={WORKSPACE_SIDEBAR_ITEMS} />
        </ResizablePanel>

        <ResizablePanel side="left" defaultSize={72} minSize={72} maxSize={72} className="hidden md:block lg:hidden">
          <TabletSidebar items={WORKSPACE_SIDEBAR_ITEMS} />
        </ResizablePanel>

        <div id="main-content" className="flex min-w-0 flex-1 flex-col" role="main">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              <ProjectOverview />

              <WorkspaceMetrics
                agents={agents}
                fileCount={fileCount}
                creditsUsed={creditsUsed}
                validation={validation}
                status={status}
              />

              <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                <div className="space-y-4">
                  <PromptBox
                    value={prompt}
                    onChange={v => useBuildStore.setState({ prompt: v })}
                    onSubmit={() => handleBuildStart(prompt)}
                    isLoading={status === 'running'}
                  />
                </div>
                <ActivityFeed />
              </div>
            </div>
          </div>

          <MobileBottomNav onNavClick={() => setMobileNavOpen(false)} />

          <BottomDock
            status={status}
            prompt={prompt}
            streamBuffer={streamBuffer}
            agents={agents}
            debugIterations={debugIterations}
          />
        </div>

        <ResizablePanel side="right" defaultSize={420} minSize={320} maxSize={560}>
          <PreviewPanel />
        </ResizablePanel>
      </div>
    </div>
  )
}