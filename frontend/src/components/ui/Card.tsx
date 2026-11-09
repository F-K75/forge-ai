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
          'border-2 border-black bg-white text-ink shadow-brutal rounded-sm transition-colors duration-fast',
          variant === 'stat' && 'px-4 py-3',
          variant === 'content' && 'p-5',
          variant === 'panel' && 'p-5',
          variant === 'empty-state' && 'p-8',
          isInteractive && 'cursor-pointer hover:shadow-brutal-lg active:shadow-brutal-sm',
          className
        )
      )}
      style={{ borderRadius: layout.radiusLg }}
      whileHover={reduceMotion || !isInteractive ? {} : { x: -2, y: -2 }}
      whileTap={reduceMotion || !clickable ? {} : { x: 2, y: 2 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      {...(rest as any)}
    >
      {children}
    </motion.div>
  )
}
