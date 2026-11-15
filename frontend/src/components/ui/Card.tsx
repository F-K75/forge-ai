import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'
import { layout } from '../../lib/designTokens'

export type CardVariant = 'stat' | 'content' | 'panel' | 'empty-state' | 'interactive'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant
  children: ReactNode
  hoverable?: boolean
  clickable?: boolean
}

export function Card({ variant = 'content', children, hoverable = false, clickable = false, className, ...rest }: CardProps) {
  const reduceMotion = useReducedMotion()

  const isInteractive = hoverable || clickable

  return (
    <motion.div
      className={twMerge(
        clsx(
          'border border-border bg-panel text-ink shadow-m3 rounded-lg transition-all duration-150 ease-in-out',
          variant === 'stat' && 'px-4 py-3',
          variant === 'content' && 'p-5',
          variant === 'panel' && 'p-5',
          variant === 'empty-state' && 'p-8',
          isInteractive && 'cursor-pointer hover:border-ink/20 hover:bg-panel-alt/60 hover:shadow-m3-2 active:bg-panel-alt',
          className
        )
      )}
      style={{ borderRadius: layout.radiusLg }}
      whileTap={reduceMotion || !clickable ? {} : { scale: 0.99 }}
      transition={{ duration: 0.15, ease: 'easeInOut' }}
      {...(rest as any)}
    >
      {children}
    </motion.div>
  )
}
