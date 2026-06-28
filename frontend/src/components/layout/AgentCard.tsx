import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight, Circle, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import clsx from 'clsx'
import React from 'react'
import type { AgentState } from '../../store/buildStore'

const META: Record<string, { emoji: string; label: string }> = {
  architect: { emoji: '🏗️', label: 'Architect' },
  designer: { emoji: '🎨', label: 'Designer' },
  developer: { emoji: '⚡', label: 'Developer' },
  integration: { emoji: '🔌', label: 'Integration' },
  pm: { emoji: '✅', label: 'PM' },
}

function statusTone(status: AgentState['status']) {
  switch (status) {
    case 'running':
      return { pill: 'border-violet-500/35 bg-violet-500/10 text-violet-200', bar: 'bg-violet-500', icon: 'text-violet-400' }
    case 'complete':
      return { pill: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200', bar: 'bg-emerald-500', icon: 'text-emerald-400' }
    case 'failed':
      return { pill: 'border-red-500/35 bg-red-500/10 text-red-200', bar: 'bg-red-500', icon: 'text-red-400' }
    default:
      return { pill: 'border-forge-border bg-forge-surface/60 text-forge-text-secondary', bar: 'bg-forge-border', icon: 'text-forge-muted' }
  }
}

function statusIcon(status: AgentState['status']) {
  switch (status) {
    case 'running':
      return <Loader2 size={14} className="animate-spin" />
    case 'complete':
      return <CheckCircle2 size={14} />
    case 'failed':
      return <XCircle size={14} />
    default:
      return <Circle size={14} />
  }
}

export const AgentCard = React.memo(function AgentCard({ agent, index }: { agent: AgentState; index: number }) {
  const [open, setOpen] = useState(false)

  const tone = useMemo(() => statusTone(agent.status), [agent.status])
  const progress = useMemo(() => {
    if (agent.status === 'complete') return 1
    if (agent.status === 'running') return 0.72
    if (agent.status === 'failed') return 0.15
    return 0.1
  }, [agent.status])

  const meta = META[agent.type] ?? { emoji: '🤖', label: agent.type }

  return (
    <div className="rounded-[18px] border border-forge-border/70 bg-forge-bg/55 shadow-[0_18px_60px_rgba(0,0,0,0.12)]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-3 text-left"
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-lg">{meta.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-forge-text truncate">{meta.label}</div>
                <div className="mt-0.5 text-xs text-forge-text-secondary truncate">
                  {agent.status === 'idle' ? 'Waiting for signal…' : agent.status === 'running' ? 'Executing tasks' : agent.status === 'complete' ? 'Ready to hand off' : 'Needs review'}
                </div>
              </div>
              <div className={clsx('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium', tone.pill)}>
                <span className={tone.icon}>{statusIcon(agent.status)}</span>
                <span className="uppercase tracking-wide">{agent.status}</span>
              </div>
            </div>

            <div className="mt-2 h-2 rounded-full bg-forge-surface/70 overflow-hidden">
              <motion.div
                className={clsx('h-full rounded-full', tone.bar)}
                initial={false}
                animate={{ width: `${progress * 100}%` }}
                transition={{ type: 'spring', stiffness: 240, damping: 22 }}
              />
            </div>
          </div>

          <div className="pt-1">
            {open ? <ChevronDown size={16} className="text-forge-text-secondary" /> : <ChevronRight size={16} className="text-forge-text-secondary" />}
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">
              <div className="mt-1 rounded-[14px] border border-forge-border/60 bg-forge-surface/40 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.22em] text-forge-text-secondary">Current task</div>
                <div className="mt-1 text-sm text-forge-text">
                  {agent.status === 'running'
                    ? 'Working… streaming artifacts to the workspace'
                    : agent.status === 'complete'
                      ? `${agent.filesChanged.length} file artifacts applied`
                      : agent.status === 'failed'
                        ? 'Encountered an issue — awaiting retry'
                        : 'Stand by — ready when build starts'}
                </div>
              </div>

              <div className="mt-2 rounded-[14px] border border-forge-border/60 bg-forge-bg/60 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.22em] text-forge-text-secondary">Agent logs</div>
                <div className="mt-1 font-mono text-[11px] text-forge-text-secondary whitespace-pre-wrap leading-relaxed">
                  {agent.status === 'running'
                    ? '…'
                    : agent.filesChanged.length > 0
                      ? agent.filesChanged.slice(0, 4).join('\n')
                      : 'No logs yet'}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})