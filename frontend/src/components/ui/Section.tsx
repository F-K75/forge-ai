import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

interface SectionProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  title?: string
  description?: string
  actions?: ReactNode
  padding?: boolean
}

export function Section({ children, title, description, actions, padding = true, className, ...rest }: SectionProps) {
  return (
    <section
      className={twMerge(clsx('w-full', padding && 'py-6', className))}
      {...rest}
    >
      {(title || description || actions) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
                {title}
              </h2>
            )}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

interface PageContainerProps {
  children: ReactNode
  maxWidth?: 'content' | 'content-sm' | 'content-xs' | 'none'
  className?: string
}

export function PageContainer({ children, maxWidth = 'content', className }: PageContainerProps) {
  return (
    <div
      className={twMerge(
        clsx(
          'mx-auto w-full px-4 sm:px-6 lg:px-8',
          maxWidth !== 'none' && `max-w-${maxWidth}`,
          className
        )
      )}
    >
      {children}
    </div>
  )
}

interface StatCardProps {
  title: string
  value: string | number
  change?: string
  icon?: ReactNode
  trend?: 'up' | 'down' | 'neutral'
  className?: string
}

export function StatCard({ title, value, change, icon, trend = 'neutral', className }: StatCardProps) {
  const trendColors = {
    up: 'text-ok',
    down: 'text-error',
    neutral: 'text-muted',
  }

  return (
    <div
      className={twMerge(
        clsx(
          'rounded-lg border border-border bg-panel p-5 shadow-apple transition-colors duration-fast hover:border-faint',
          className
        )
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">{title}</p>
          <p className="mt-2 font-mono text-2xl font-semibold tracking-tight text-ink tabular-nums">
            {value}
          </p>
          {change && (
            <p className={clsx('mt-1 text-xs font-medium tabular-nums', trendColors[trend])}>
              {change}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-panel-alt text-muted">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
