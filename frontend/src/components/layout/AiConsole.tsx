import { useMemo } from 'react'
import { AgentPipeline } from '../chat/AgentPipeline'
import { useBuildStore } from '../../store/buildStore'
import { MessageSquare, Search, Sparkles } from 'lucide-react'
import clsx from 'clsx'

export type ConsoleFilter = 'all' | 'architect' | 'designer' | 'developer' | 'integration' | 'pm'

const FILTER_OPTIONS: { id: ConsoleFilter; label: string; icon: React.ReactNode }[] = [
  { id: 'all', label: 'All', icon: <Sparkles size={14} /> },
  { id: 'architect', label: 'Architect', icon: <MessageSquare size={14} /> },
  { id: 'designer', label: 'Designer', icon: <MessageSquare size={14} /> },
  { id: 'developer', label: 'Developer', icon: <MessageSquare size={14} /> },
  { id: 'integration', label: 'Integration', icon: <MessageSquare size={14} /> },
  { id: 'pm', label: 'PM', icon: <MessageSquare size={14} /> },
]

function bestEffortLogs({ agents }: { agents: { type: string; status: string; filesChanged: string[] }[] }) {
  // We don’t have a dedicated log stream in the current store; use file artifacts + status as UI logs.
  const lines: { agent: string; text: string; ts: string }[] = []
  for (const a of agents) {
    if (a.status === 'idle') continue
    if (a.status === 'running') {
      lines.push({ agent: a.type, text: `${a.type} is running…`, ts: 'now' })
    }
    if (a.filesChanged?.length) {
      const files = a.filesChanged.slice(0, 8)
      for (const f of files) {
        lines.push({ agent: a.type, text: `updated: ${f}`, ts: 'artifact' })
      }
    }
  }
  return lines
}

export function AiConsole() {
  const { agents } = useBuildStore()

  const logs = useMemo(() => bestEffortLogs({ agents }), [agents])

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-[20px] border border-forge-border/70 bg-forge-bg/70 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">
              <Search size={12} />
              AI Console
            </div>
            <div className="mt-2 text-sm font-semibold text-forge-text">Agent reasoning & artifacts</div>
            <div className="mt-1 text-xs text-forge-text-secondary">Auto-updates from workspace agents (UI-only best-effort logs).</div>
          </div>
        </div>

        <div className="mt-4">
          <AgentPipeline />
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-[20px] border border-forge-border/70 bg-forge-bg/70">
        <div className="flex items-center justify-between border-b border-forge-border/70 px-4 py-2">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-forge-text-secondary">
            <MessageSquare size={12} />
            Console output
          </div>
          <div className="text-xs text-forge-text-secondary">{logs.length} events</div>
        </div>

        <div className="h-[calc(100%-41px)] overflow-y-auto p-3">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-forge-surface border border-forge-border/70 flex items-center justify-center">
                <Sparkles size={20} className="text-violet-300" />
              </div>
              <div>
                <div className="text-sm font-semibold text-forge-text">Waiting for agent output</div>
                <div className="text-xs text-forge-text-secondary mt-1">Run a build to see live events here.</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((l, idx) => (
                <div
                  key={`${l.agent}-${idx}-${l.text}`}
                  className={clsx(
                    'rounded-[14px] border px-3 py-2 bg-forge-surface/40',
                    l.agent === 'architect' && 'border-violet-500/20',
                    l.agent === 'developer' && 'border-emerald-500/20',
                    l.agent === 'integration' && 'border-amber-500/20',
                    l.agent === 'pm' && 'border-blue-500/20'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-forge-text-secondary">{l.agent}</span>
                    <span className="text-[10px] text-forge-text-secondary">{l.ts}</span>
                  </div>
                  <div className="mt-1 font-mono text-[12px] text-forge-text-secondary whitespace-pre-wrap">{l.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

