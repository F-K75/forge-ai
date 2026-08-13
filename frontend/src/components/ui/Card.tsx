import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { layout } from '../../lib/designTokens'

export type CardVariant = 'stat' | 'content' | 'panel' | 'empty-state'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Content layout only — border, radius, padding & background are shared. */
  variant?: CardVariant
  children: ReactNode
}

/**
 * Base card. Every variant shares the same border/radius/padding-scale and
 * background from the token file; only the inner layout differs per variant.
 */
export function Card({ variant = 'content', className, children, style, ...rest }: CardProps) {
  return (
    <div
      className={twMerge(
        clsx(
          'border border-border bg-panel shadow-m3',
          // shared padding scale (16px inner), tightened per variant
          variant === 'stat' && 'px-4 py-3',
          variant === 'content' && 'p-4',
          variant === 'panel' && 'p-4',
          variant === 'empty-state' && 'p-8',
          className
        )
      )}
      style={{ borderRadius: layout.radiusMd, ...style }}
      {...rest}
    >
      {children}
    </div>
  )
}