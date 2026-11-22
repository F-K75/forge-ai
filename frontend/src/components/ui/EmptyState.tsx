import { type LucideIcon } from 'lucide-react'
import clsx from 'clsx'
import { Button, Heading } from './index'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  primaryAction?: { label: string; onClick?: () => void }
  secondaryAction?: { label: string; onClick?: () => void }
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={clsx('flex flex-col items-center justify-center py-14 px-6 text-center', className)}
      role="status"
      aria-live="polite"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-panel-alt text-muted">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="mb-1.5">
        <Heading level="h4">{title}</Heading>
      </div>
      {description && (
        <p className="mb-5 max-w-sm text-sm text-muted leading-relaxed">
          {description}
        </p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="flex items-center gap-2.5">
          {primaryAction && (
            <Button variant="primary" size="sm" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="secondary" size="sm" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
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
        'bg-panel-alt',
        animate && 'animate-shimmer',
        variant === 'text' && 'h-4 rounded',
        variant === 'circle' && 'rounded-full',
        variant === 'rect' && 'rounded-md',
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
        <div key={i} className="rounded-lg border border-border bg-panel p-5" aria-hidden="true">
          <Skeleton className="mb-3 h-5 w-2/3" />
          <Skeleton className="mb-2 h-3.5 w-full" />
          <Skeleton className="mb-4 h-3.5 w-5/6" />
          <div className="mb-4 flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
          </div>
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </>
  )
}

export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2.5" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border bg-panel p-4"
        >
          <Skeleton variant="circle" className="h-8 w-8" />
          <div className="flex-1">
            <Skeleton className="mb-1.5 h-3.5 w-36" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
