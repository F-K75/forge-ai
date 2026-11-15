import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { layout } from '../../lib/designTokens'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'rect' | 'circle'
  animate?: boolean
  width?: string | number
  height?: string | number
}

export function Skeleton({ variant = 'rect', animate = true, width, height, className, style, ...rest }: SkeletonProps) {
  return (
    <div
      className={twMerge(
        clsx(
          'bg-surface-high',
          animate && 'animate-shimmer',
          variant === 'text' && 'h-4 rounded-sm',
          variant === 'circle' && 'rounded-full',
          variant === 'rect' && 'rounded-md',
          className
        )
      )}
      style={{
        width: width,
        height: height,
        borderRadius: variant === 'circle' ? layout.radiusFull : variant === 'text' ? layout.radiusXs : layout.radiusSm,
        ...style,
      }}
      aria-hidden="true"
      {...rest}
    />
  )
}

export function SkeletonCard({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border border-border bg-panel rounded-lg p-6 shadow-m3" aria-hidden="true">
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
        <div key={i} className="flex items-center gap-3 p-4 rounded-lg border border-border bg-panel">
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

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full" aria-hidden="true">
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border-soft">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4 px-4 py-3 border-b border-border-soft last:border-b-0">
          {Array.from({ length: cols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}
