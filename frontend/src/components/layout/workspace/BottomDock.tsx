import { useState, useCallback, useRef, useEffect } from 'react'
import { clsx } from 'clsx'
import { TerminalSquare, Gauge } from 'lucide-react'
import { motion } from 'framer-motion'
import { FileEditor } from '../../editor/FileEditor'
import { AiConsole } from '../AiConsole'
import type { AgentState } from '../../../store/buildStore'

type BuildStatus = 'idle' | 'pending' | 'running' | 'success' | 'failed' | 'debugging'

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

interface BottomDockProps {
  status: BuildStatus
  prompt: string
  streamBuffer: string
  agents: AgentState[]
  debugIterations: number
}

export const BottomDock = ({ status, prompt, streamBuffer, agents, debugIterations }: BottomDockProps) => {
  const [bottomTab, setBottomTab] = useState<BottomTab>('terminal')
  const [dockHeight, setDockHeight] = useState(280)
  const activeAgents = agents.filter(agent => agent.status === 'running').length

  const handleDockResize = useCallback((event: React.MouseEvent) => {
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
  }, [dockHeight])

  const renderTabContent = () => {
    switch (bottomTab) {
      case 'files':
        return (
          <div className="h-full overflow-hidden rounded-[20px] border border-forge-border/70 bg-forge-bg/70">
            <FileEditor />
          </div>
        )
      case 'console':
        return (
          <div className="h-full overflow-hidden rounded-[20px] border border-forge-border/70 bg-forge-bg/70">
            <AiConsole />
          </div>
        )
      default:
        return (
          <div className="flex h-full gap-3">
            <div className="w-1/2 rounded-[20px] border border-forge-border/70 bg-forge-bg/70 p-4">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">
                <TerminalSquare size={12} />
                {getTabLabel(bottomTab)}
              </div>
              <div className="mt-4 space-y-2 text-sm text-forge-text-secondary">
                {renderActivityContent(bottomTab, status, activeAgents)}
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
        )
    }
  }

  return (
    <motion.div
      initial={false}
      animate={{ height: dockHeight }}
      className="flex-shrink-0 border-t border-forge-border/80 bg-forge-surface/80"
    >
      <div className="flex items-center justify-between border-b border-forge-border/70 px-4 py-2">
        <div role="tablist" className="flex flex-wrap gap-2" aria-label="Bottom panel tabs">
          {bottomTabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={bottomTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => setBottomTab(tab.id)}
              className={clsx(
                'rounded-full px-3 py-1.5 text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-violet-500',
                bottomTab === tab.id
                  ? 'bg-violet-600 text-white'
                  : 'bg-forge-bg/70 text-forge-text-secondary hover:text-forge-text'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-forge-text-secondary" aria-live="polite">
          <span className="rounded-full border border-forge-border bg-forge-bg/70 px-2.5 py-1">{prompt || 'Awaiting request'}</span>
          <span className="rounded-full border border-forge-border bg-forge-bg/70 px-2.5 py-1">
            {streamBuffer ? 'Streaming' : 'Idle'}
          </span>
        </div>
      </div>

      <div className="relative h-[calc(100%-48px)] overflow-hidden p-3" id={`tabpanel-${bottomTab}`}>
        {renderTabContent()}
      </div>

      <div
        className="absolute bottom-0 left-1/2 h-2 w-20 -translate-x-1/2 cursor-row-resize rounded-full bg-forge-border/80 focus:outline-none focus:ring-2 focus:ring-violet-500"
        onMouseDown={handleDockResize}
        role="slider"
        aria-label="Resize bottom dock"
        tabIndex={0}
      />
    </motion.div>
  )
}

function getTabLabel(tab: BottomTab): string {
  switch (tab) {
    case 'build': return 'Build timeline'
    case 'logs': return 'Agent logs'
    case 'ai logs': return 'AI logs'
    case 'git': return 'Git'
    case 'testing': return 'Testing'
    case 'network': return 'Network'
    case 'search': return 'Search'
    default: return 'Live activity'
  }
}

function renderActivityContent(tab: BottomTab, status: BuildStatus, activeAgents: number): React.ReactNode {
  if (tab === 'build') {
    return (
      <>
        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">Planning architecture</div>
        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">Generating React components</div>
        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">Running checks and tests</div>
        <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">Deploying preview</div>
      </>
    )
  }

  return (
    <>
      <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">
        {getContentText(tab)}
      </div>
      <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">
        {status === 'running' ? 'Streaming updates…' : status === 'success' ? 'Last build completed' : 'Waiting for next run'}
      </div>
      <div className="rounded-2xl border border-forge-border/70 bg-forge-surface/70 p-3">Agents active: {activeAgents}</div>
    </>
  )
}

function getContentText(tab: BottomTab): string {
  switch (tab) {
    case 'logs': return 'Agent output stream'
    case 'ai logs': return 'AI reasoning events'
    case 'git': return 'Working tree status'
    case 'testing': return 'Playwright / unit checks'
    case 'network': return 'Build websocket activity'
    case 'search': return 'Search within workspace'
    default: return 'Live activity'
  }
}