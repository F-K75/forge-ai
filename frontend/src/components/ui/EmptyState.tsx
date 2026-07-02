import { type LucideIcon } from 'lucide-react'
import clsx from 'clsx'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  primaryAction?: { label: string; onClick?: () => void }
  secondaryAction?: { label: string; onClick?: () => void }
  className?: string
}

export function EmptyState({ icon: Icon, title, description, primaryAction, secondaryAction, className }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center py-12 text-center', className)} role="status" aria-live="polite">
      <div className="w-16 h-16 rounded-2xl bg-panel border border-border flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted" aria-hidden="true" />
      </div>
      <h3 className="text-lg font-semibold text-ink mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-muted mb-4 max-w-sm">{description}</p>
      )}
      {primaryAction && (
        <button
          onClick={primaryAction.onClick}
          className="px-5 py-2 bg-accent text-white rounded-lg hover:opacity-90 transition focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {primaryAction.label}
        </button>
      )}
      {secondaryAction && (
        <button
          onClick={secondaryAction.onClick}
          className="mt-2 px-5 py-2 text-sm text-muted hover:text-ink transition focus:outline-none focus:ring-2 focus:ring-accent rounded"
        >
          {secondaryAction.label}
        </button>
      )}
    </div>
  )
}

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'rect' | 'circle'
  animate?: boolean
}

export function Skeleton({ className, variant = 'rect', animate = true }: SkeletonProps) {
  return (
    <div
      className={clsx(
        'bg-panel rounded',
        animate && 'animate-pulse',
        variant === 'text' && 'h-4',
        variant === 'circle' && 'rounded-full',
        variant === 'rect' && 'rounded-lg',
        className
      )}
      aria-hidden="true"
    />
  )
}

export function SkeletonCard({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-panel border border-border rounded-xl p-6" aria-hidden="true">
          <Skeleton className="h-6 w-3/4 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6 mb-4" />
          <div className="flex gap-2 mb-4">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </>
  )
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4 rounded-2xl border border-border/70 bg-panel/70">
          <Skeleton variant="circle" className="w-8 h-8" />
          <div className="flex-1">
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}