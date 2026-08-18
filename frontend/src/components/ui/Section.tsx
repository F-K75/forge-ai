import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { layout } from '../../lib/designTokens'

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
      className={twMerge(clsx('w-full', padding && 'py-8', className))}
      {...rest}
    >
      {(title || description || actions) && (
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            {title && <h2 className="text-xl font-semibold text-ink tracking-tight">{title}</h2>}
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
    <div className={twMerge(clsx(
      'mx-auto w-full px-4 sm:px-6',
      maxWidth !== 'none' && `max-w-${maxWidth}`,
      className
    ))}>
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
      className={twMerge(clsx(
        'rounded-m3-lg border border-border bg-panel p-5 shadow-apple transition-all duration-med hover:shadow-apple-lg',
        className
      ))}
      style={{ borderRadius: layout.radiusLg }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{title}</p>
          <p className="mt-2 text-3xl font-semibold text-ink tracking-tight">{value}</p>
          {change && (
            <p className={clsx('mt-1 text-xs font-medium', trendColors[trend])}>
              {change}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
