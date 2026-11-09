import type { ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

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
  return (
    <div className={twMerge(clsx('relative inline-flex', className))}>
      {children}
      <div
        role="tooltip"
        className={twMerge(clsx(
          'pointer-events-none absolute z-[60] whitespace-nowrap px-2.5 py-1 text-xs font-bold text-white bg-black border-2 border-black shadow-brutal-sm rounded-none uppercase tracking-wider',
          sideClasses[side]
        ))}
      >
        {content}
      </div>
    </div>
  )
}
