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
          'rounded-lg border border-border bg-panel text-ink shadow-apple transition-all duration-fast ease-in-out',
          variant === 'stat' && 'px-5 py-4',
          variant === 'content' && 'p-5',
          variant === 'panel' && 'p-5',
          variant === 'empty-state' && 'p-8',
          isInteractive &&
            'cursor-pointer hover:border-faint hover:shadow-apple-lg active:scale-[0.995]',
          className
        )
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
