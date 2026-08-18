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
          'border border-outline bg-panel transition-all duration-med',
          variant === 'stat' && 'px-4 py-3',
          variant === 'content' && 'p-5',
          variant === 'panel' && 'p-5',
          variant === 'empty-state' && 'p-8',
          isInteractive && 'cursor-pointer shadow-apple hover:shadow-apple-lg',
          className
        )
      )}
      style={{ borderRadius: layout.radiusLg }}
      whileHover={reduceMotion || !isInteractive ? {} : { y: -2 }}
      whileTap={reduceMotion || !clickable ? {} : { scale: 0.99 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      {...(rest as any)}
    >
      {children}
    </motion.div>
  )
}
