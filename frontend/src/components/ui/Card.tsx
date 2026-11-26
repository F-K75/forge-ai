import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

export type CardVariant = 'stat' | 'content' | 'panel' | 'empty-state' | 'interactive'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  children: ReactNode
  hoverable?: boolean
  clickable?: boolean
}

export function Card({
  variant = 'content',
  children,
  hoverable = false,
  clickable = false,
  className,
  ...rest
}: CardProps) {
  const isInteractive = hoverable || clickable || variant === 'interactive'

  return (
    <div
      className={twMerge(
        clsx(
          'rounded-xl border border-border bg-panel text-ink transition-all duration-fast ease-in-out',
          variant === 'stat' && 'px-4 py-4',
          variant === 'content' && 'p-4 sm:p-5',
          variant === 'panel' && 'p-5',
          variant === 'empty-state' && 'p-8',
          isInteractive &&
            'cursor-pointer hover:border-ink/20 hover:bg-panel-alt active:scale-[0.995]',
          className
        )
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
