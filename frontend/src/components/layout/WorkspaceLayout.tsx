import { useMemo, useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'

import { buildsApi, projectsApi } from '../../lib/api'


import { Activity, Bot, Boxes, Cpu, FileCode2, FolderKanban, Gauge, MonitorPlay, PanelsTopLeft, Search, Settings, Sparkles, TerminalSquare, Workflow } from 'lucide-react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { PreviewPanel } from '../preview/PreviewPanel'
import { useBuildStore } from '../../store/buildStore'

import { useBuildSocket } from '../../hooks/useBuildSocket'

import { ResizablePanel } from './ResizablePanel'
import { SidebarItem } from './SidebarItem'
import { ProjectOverview } from './ProjectOverview'
import { ActivityFeed } from './ActivityFeed'
import { MetricCard } from './MetricCard'
import { StatusBadge } from './StatusBadge'
import { FileEditor } from '../editor/FileEditor'
import { PromptBox } from './PromptBox'
import { AgentCard } from './AgentCard'
import { AiConsole } from './AiConsole'

type BottomTab =
  | 'terminal'
  | 'logs'
  | 'ai logs'
  | 'git'
  | 'testing'
  | 'build'
  | 'network'
  | 'console'
  | 'search'
  | 'files'

const sidebarItems = [
  { label: 'Workspace', icon: PanelsTopLeft, active: true },
  { label: 'Projects', icon: FolderKanban },
  { label: 'Agents', icon: Bot },
  { label: 'Tasks', icon: Workflow },
  { label: 'Files', icon: FileCode2 },
  { label: 'Deployments', icon: MonitorPlay },
  { label: 'Settings', icon: Settings },
]

const bottomTabs: { id: BottomTab; label: string }[] = [
  { id: 'terminal', label: 'Terminal' },
  { id: 'logs', label: 'Logs' },
  { id: 'ai logs', label: 'AI Logs' },
  { id: 'git', label: 'Git' },
  { id: 'testing', label: 'Testing' },
  { id: 'build', label: 'Build' },
  { id: 'files', label: 'Files' },
  { id: 'console', label: 'Console' },
  { id: 'search', label: 'Search' },
]

export function WorkspaceLayout() {
  const params = useParams<{ projectId?: string }>()
  const projectId = params.projectId || 'default-project'


  const [bottomTab, setBottomTab] = useState<BottomTab>('terminal')
  const [dockHeight, setDockHeight] = useState(280)

  const {
    buildId,
    status,
    files,
    startBuild,
    agents,
    prompt,
    validation,
    creditsUsed,
    debugIterations,
    streamBuffer,
  } = useBuildStore()

  const { connectionStatus } = useBuildSocket(buildId)


  const handleBuildStart = async (promptText: string) => {
    // Create build for the active project and then start websocket streaming.
    const created = await buildsApi.create({ project_id: projectId, prompt: promptText })
    const newBuildId = created.build_id || created.buildId || created.build_id
    useBuildStore.setState({ buildId: newBuildId })
    startBuild(newBuildId, promptText)

  }


  const fileCount = Object.keys(files).length
  const activeAgents = agents.filter(agent => agent.status === 'running').length
  const completedAgents = agents.filter(agent => agent.status === 'complete').length

  const metrics = useMemo(
    () => [
      { label: 'Running agents', value: activeAgents, icon: Cpu, tone: 'info' as const },
      { label: 'Files changed', value: fileCount, icon: Boxes, tone: 'success' as const },
      { label: 'Tokens used', value: `${creditsUsed}`, icon: Sparkles, tone: 'warning' as const },
      { label: 'Errors', value: validation?.missing_features?.length ?? 0, icon: Activity, tone: 'danger' as const },
    ],
    [activeAgents, fileCount, creditsUsed, validation]
  )

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-forge-bg text-forge-text">
      <header className="flex flex-shrink-0 items-center justify-between border-b border-forge-border/80 bg-forge-surface/80 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 shadow-[0_0_0_8px_rgba(124,58,237,0.18)]">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-forge-text">Forge AI</div>
            <div className="text-[11px] text-forge-text-secondary">Premium AI software engineering workspace</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge
            label={status === 'success' ? 'Build ready' : status === 'running' ? 'Building' : 'Stand by'}
            tone={status === 'success' ? 'success' : status === 'running' ? 'info' : 'neutral'}
          />
          <StatusBadge
            label={connectionStatus === 'online' ? 'WS connected' : connectionStatus === 'connecting' ? 'WS connecting' : connectionStatus === 'error' ? 'WS error' : 'WS offline'}
            tone={connectionStatus === 'online' ? 'success' : connectionStatus === 'connecting' ? 'info' : connectionStatus === 'error' ? 'danger' : 'neutral'}
          />

          <StatusBadge label={`${fileCount} files`} tone="neutral" compact />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ResizablePanel side="left" defaultSize={280} minSize={240} maxSize={360} className="hidden lg:block">
          <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
            <div className="rounded-[24px] border border-forge-border/70 bg-forge-surface/70 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">Workspace</div>
              <div className="mt-2 text-lg font-semibold text-forge-text">Current project</div>
              <div className="mt-3 space-y-2">
                {sidebarItems.map(item => (
                  <SidebarItem key={item.label} icon={item.icon} label={item.label} active={item.active} />
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-forge-border/70 bg-forge-surface/70 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">Agents</div>
                  <div className="mt-1 text-base font-semibold text-forge-text">Live pipeline</div>
                </div>
                <StatusBadge label={`${completedAgents}/${agents.length}`} tone="info" compact />
              </div>
              <div className="mt-3 space-y-2">
                {agents.map((agent, index) => (
                  <AgentCard key={agent.type} agent={agent} index={index} />
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-forge-border/70 bg-forge-surface/70 p-4">
              <div className="text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">Recent activity</div>
              <div className="mt-3 space-y-2">
                {['Created login page', 'Updated dashboard', 'Fixed API', 'Running tests'].map(item => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-2xl border border-forge-border/70 bg-forge-bg/70 px-3 py-2 text-sm text-forge-text-secondary"
                  >
                    <span className="text-emerald-300">✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ResizablePanel>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              <ProjectOverview />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {metrics.map(metric => (
                  <MetricCard key={metric.label} label={metric.label} value={metric.value} icon={metric.icon} tone={metric.tone} />
                ))}
              </div>

              <div className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                  <div className="space-y-4">
                    <PromptBox
                      value={prompt}
                      onChange={v => useBuildStore.setState({ prompt: v })}
                      onSubmit={() => handleBuildStart(prompt)}

                      isLoading={status === 'running'}
                    />
                    <ProjectOverview />
                  </div>
                  <ActivityFeed />
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {metrics.map(metric => (
                    <MetricCard key={metric.label} label={metric.label} value={metric.value} icon={metric.icon} tone={metric.tone} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <motion.div
            initial={false}
            animate={{ height: dockHeight }}
            className="flex-shrink-0 border-t border-forge-border/80 bg-forge-surface/80"
          >
            <div className="flex items-center justify-between border-b border-forge-border/70 px-4 py-2">
              <div className="flex flex-wrap gap-2">
                {bottomTabs.map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setBottomTab(tab.id)}
                    className={clsx(
                      'rounded-full px-3 py-1.5 text-xs font-medium transition',
                      bottomTab === tab.id
                        ? 'bg-violet-600 text-white'
                        : 'bg-forge-bg/70 text-forge-text-secondary hover:text-forge-text'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-forge-text-secondary">
                <span className="rounded-full border border-forge-border bg-forge-bg/70 px-2.5 py-1">{prompt || 'Awaiting request'}</span>
                <span className="rounded-full border border-forge-border bg-forge-bg/70 px-2.5 py-1">{streamBuffer ? 'Streaming' : 'Idle'}</span>
              </div>
            </div>

            <div className="relative h-[calc(100%-48px)] overflow-hidden p-3">
              {bottomTab === 'files' ? (
                <div className="h-full overflow-hidden rounded-[20px] border border-forge-border/70 bg-forge-bg/70">
                  <FileEditor />
                </div>
              ) : bottomTab === 'console' ? (
                <div className="h-full overflow-hidden rounded-[20px] border border-forge-border/70 bg-forge-bg/70">
                  <AiConsole />
                </div>
              ) : (
                <div className="flex h-full gap-3">
                  <div className="w-1/2 rounded-[20px] border border-forge-border/70 bg-forge-bg/70 p-4">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">
                      <TerminalSquare size={12} />
                      {bottomTab === 'build'
                        ? 'Build timeline'
                        : bottomTab === 'logs'
                          ? 'Agent logs'
                          : bottomTab === 'ai logs'
                            ? 'AI logs'
                            : bottomTab === 'git'
                              ? 'Git'
                              : bottomTab === 'testing'
                                ? 'Testing'
                                : bottomTab === 'network'
                                  ? 'Network'
                                  : bottomTab === 'search'
                                    ? 'Search'
                                    : 'Live activity'}
                    </div>
                    <div className="mt-4 space-y-2 text-sm text-forge-text-secondary">
                      {/* Premium-ish dock panes (UI-only, best-effort using existing build state) */}
                      {bottomTab === 'build' && (
                        <>
                          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">Planning architecture</div>
                          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">Generating React components</div>
                          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">Running checks and tests</div>
                          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">Deploying preview</div>
                        </>
                      )}

                      {bottomTab !== 'build' && (
                        <>
                          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">
                            {bottomTab === 'logs' && 'Agent output stream'}
                            {bottomTab === 'ai logs' && 'AI reasoning events'}
                            {bottomTab === 'git' && 'Working tree status'}
                            {bottomTab === 'testing' && 'Playwright / unit checks'}
                            {bottomTab === 'network' && 'Build websocket activity'}
                            {bottomTab === 'search' && 'Search within workspace'}
                            {bottomTab !== 'logs' && bottomTab !== 'ai logs' && bottomTab !== 'git' && bottomTab !== 'testing' && bottomTab !== 'network' && bottomTab !== 'search' && 'Live activity'}
                          </div>
                          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">
                            {status === 'running' ? 'Streaming updates…' : status === 'success' ? 'Last build completed' : 'Waiting for next run'}
                          </div>
                          <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">Agents active: {activeAgents}</div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="w-1/2 rounded-[20px] border border-forge-border/70 bg-forge-bg/70 p-4">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">
                      <Gauge size={12} />
                      Build summary
                    </div>
                    <div className="mt-4 space-y-3">
                      <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">
                        <div className="text-xs text-forge-text-secondary">Execution</div>
                        <div className="mt-2 text-lg font-semibold text-forge-text">
                          {status === 'success' ? 'Completed' : status === 'running' ? 'In progress' : 'Awaiting run'}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">
                        <div className="text-xs text-forge-text-secondary">Agent progress</div>
                        <div className="mt-2 text-lg font-semibold text-forge-text">
                          {activeAgents}/{agents.length} active
                        </div>
                      </div>
                      <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">
                        <div className="text-xs text-forge-text-secondary">Debug loops</div>
                        <div className="mt-2 text-lg font-semibold text-forge-text">{debugIterations}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}


              <div className="absolute bottom-2 right-3 flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-forge-border bg-forge-surface/70 px-2.5 py-1 text-xs text-forge-text-secondary"
                >
                  Collapse
                </button>
                <button
                  type="button"
                  className="rounded-full border border-forge-border bg-forge-surface/70 px-2.5 py-1 text-xs text-forge-text-secondary"
                >
                  Focus
                </button>
              </div>
            </div>

            <div
              className="absolute bottom-0 left-1/2 h-2 w-20 -translate-x-1/2 cursor-row-resize rounded-full bg-forge-border/80"
              onMouseDown={event => {
                event.preventDefault()
                const startY = event.clientY
                const startHeight = dockHeight
                const onMove = (moveEvent: MouseEvent) => {
                  const nextHeight = Math.max(220, Math.min(420, startHeight + startY - moveEvent.clientY))
                  setDockHeight(nextHeight)
                }
                const onUp = () => {
                  window.removeEventListener('mousemove', onMove)
                  window.removeEventListener('mouseup', onUp)
                }
                window.addEventListener('mousemove', onMove)
                window.addEventListener('mouseup', onUp)
              }}
            />
          </motion.div>
        </div>

        <ResizablePanel side="right" defaultSize={420} minSize={320} maxSize={560}>
          <PreviewPanel />
        </ResizablePanel>
      </div>
    </div>
  )
}

