import clsx from 'clsx'
import React from 'react'

interface StatusBadgeProps {
  label: string
  tone?: 'success' | 'warning' | 'info' | 'neutral' | 'danger'
  compact?: boolean
}

export const StatusBadge = React.memo(function StatusBadge({ label, tone = 'neutral', compact = false }: StatusBadgeProps) {
  const toneClasses = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    info: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
    neutral: 'border-forge-border bg-forge-surface/70 text-forge-text-secondary',
    danger: 'border-red-500/30 bg-red-500/10 text-red-300',
  }

  return (
    <span className={clsx('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium', toneClasses[tone], compact && 'px-2 py-0.5 text-[10px]')}>
      {label}
    </span>
  )
})