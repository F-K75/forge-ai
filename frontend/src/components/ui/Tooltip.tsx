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
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
}

export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  return (
    <div className={twMerge(clsx('group relative inline-flex', className))}>
      {children}
      <div
        role="tooltip"
        className={twMerge(
          clsx(
            'pointer-events-none absolute z-[60] whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-100 opacity-0 shadow-md transition-opacity duration-fast group-hover:opacity-100',
            sideClasses[side]
          )
        )}
      >
        {content}
      </div>
    </div>
  )
}
