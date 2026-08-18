import type { ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'
import { layout } from '../../lib/designTokens'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

const sideClasses: Record<string, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const reduceMotion = useReducedMotion()

  return (
    <div className={twMerge(clsx('relative inline-flex', className))}>
      {children}
      <div
        role="tooltip"
        className={twMerge(clsx(
          'pointer-events-none absolute z-[60] whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-ink apple-glass-strong shadow-apple',
          sideClasses[side]
        ))}
        style={{ borderRadius: layout.radiusSm }}
      >
        {content}
      </div>
    </div>
  )
}
