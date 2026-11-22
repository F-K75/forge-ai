import type { HTMLAttributes } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rect' | 'circle'
  animate?: boolean
  width?: string | number
  height?: string | number
}

export function Skeleton({
  variant = 'rect',
  animate = true,
  width,
  height,
  className,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <div
      className={twMerge(
        clsx(
          'bg-panel-alt',
          animate && 'animate-shimmer',
          variant === 'text' && 'h-4 rounded',
          variant === 'circle' && 'rounded-full',
          variant === 'rect' && 'rounded-md',
          className
        )
      )}
      style={{ width, height, ...style }}
      aria-hidden="true"
      {...rest}
    />
  )
}

export function SkeletonCard({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-panel p-5" aria-hidden="true">
          <Skeleton className="mb-3 h-5 w-3/4" />
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
            <Skeleton className="mb-1.5 h-3.5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full rounded-lg border border-border bg-panel" aria-hidden="true">
      <div className="flex items-center gap-4 border-b border-border bg-panel-alt/60 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}
