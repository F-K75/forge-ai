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
      className={twMerge(clsx('w-full', padding && 'py-8', className))}
      {...rest}
    >
      {(title || description || actions) && (
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            {title && <h2 className="text-xl font-black uppercase tracking-tight text-ink">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted font-medium">{description}</p>}
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
    up: 'text-ok font-bold',
    down: 'text-error font-bold',
    neutral: 'text-muted font-medium',
  }

  return (
    <div
      className={twMerge(clsx(
        'rounded-sm border-2 border-black bg-white p-5 shadow-brutal transition-all hover:shadow-brutal-lg hover:-translate-x-0.5 hover:-translate-y-0.5',
        className
      ))}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs font-black uppercase tracking-wider text-muted">{title}</p>
          <p className="mt-2 font-mono text-3xl font-black text-ink tracking-tight">{value}</p>
          {change && (
            <p className={clsx('mt-1 text-xs font-mono', trendColors[trend])}>
              {change}
            </p>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-black bg-brutal-yellow text-black shadow-brutal-xs">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
