import { useState } from 'react'
import { MessageSquare, Code2, Monitor, Cpu, GitBranch, Download, Zap } from 'lucide-react'
import clsx from 'clsx'
import { ChatPanel } from '../chat/ChatPanel'
import { AgentPipeline } from '../chat/AgentPipeline'
import { FileEditor } from '../editor/FileEditor'
import { PreviewPanel } from '../preview/PreviewPanel'
import { useBuildStore } from '../../store/buildStore'
import { useBuildSocket } from '../../hooks/useBuildSocket'

type Panel = 'chat' | 'editor' | 'preview'

export function WorkspaceLayout() {
  const [activePanel, setActivePanel] = useState<Panel>('chat')
  const [projectId] = useState('default-project')
  const { buildId, status, files, startBuild } = useBuildStore()

  useBuildSocket(buildId)

  const handleBuildStart = (id: string, prompt: string) => {
    startBuild(id, prompt)
    setTimeout(() => setActivePanel('editor'), 1000)
  }

  const fileCount = Object.keys(files).length

  const tabs: { id: Panel; label: string; icon: any; badge?: string }[] = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'editor', label: 'Code', icon: Code2, badge: fileCount > 0 ? String(fileCount) : undefined },
    { id: 'preview', label: 'Preview', icon: Monitor },
  ]

  return (
    <div className="flex flex-col h-screen bg-forge-bg text-forge-text">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-forge-border bg-forge-surface flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shadow-[0_0_0_4px_rgba(124,58,237,0.12)]">
              <Zap size={14} className="text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-forge-text">Forge</span>
              <span className="text-[12px] text-forge-text-secondary">New project</span>
            </div>
          </div>
        </div>

        <nav
          aria-label="Workspace panels"
          className="flex items-center gap-1 bg-forge-bg rounded-xl p-1 border border-forge-border"
        >
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActivePanel(tab.id)}
              aria-current={activePanel === tab.id ? 'page' : undefined}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                activePanel === tab.id
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-forge-text-secondary hover:text-forge-text hover:bg-forge-border/50'
              )}
            >
              <tab.icon size={13} />
              {tab.label}
              {tab.badge && (
                <span
                  className={clsx(
                    'bb-badge',
                    activePanel === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-forge-muted/30 text-forge-text-secondary'
                  )}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {status === 'running' && (
            <div className="flex items-center gap-2 text-xs text-violet-300">
              <Cpu size={12} className="animate-pulse" />
              <span className="font-medium">Agents running</span>
            </div>
          )}
          {status === 'success' && (
            <button
              type="button"
              className="bb-btn bb-btn-ghost text-xs font-semibold px-2.5 py-1.5"
            >
              <GitBranch size={12} />
              Push to GitHub
            </button>
          )}
          {fileCount > 0 && (
            <button
              type="button"
              className="bb-btn bb-btn-subtle text-xs font-semibold px-2.5 py-1.5"
            >
              <Download size={12} />
              Export
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat + Pipeline */}
        <div className={clsx(
          'border-r border-forge-border flex flex-col transition-all duration-200',
          activePanel === 'chat' ? 'w-full md:w-80 lg:w-96' : 'hidden md:flex md:w-72 lg:w-80'
        )}>
          {/* Agent pipeline (visible during/after build) */}
          {(status !== 'idle') && (
            <div className="p-3 border-b border-forge-border bg-forge-surface/50 flex-shrink-0">
              <AgentPipeline />
            </div>
          )}

          {/* Chat */}
          <div className="flex-1 overflow-hidden">
            <ChatPanel projectId={projectId} onBuildStart={handleBuildStart} />
          </div>
        </div>

        {/* Right panels */}
        <div className={clsx(
          'flex-1 overflow-hidden',
          activePanel === 'chat' ? 'hidden md:block' : 'block'
        )}>
          {activePanel === 'editor' || activePanel === 'chat' ? (
            <div className={clsx(
              'h-full',
              activePanel !== 'editor' && 'hidden md:block'
            )}>
              <FileEditor />
            </div>
          ) : null}

          {activePanel === 'preview' && (
            <PreviewPanel />
          )}
        </div>
      </div>
    </div>
  )
}
