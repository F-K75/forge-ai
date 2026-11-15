import type { ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

interface TabsProps {
  value: string
  onChange: (value: string) => void
  items: { value: string; label: string; icon?: ReactNode; disabled?: boolean }[]
  className?: string
}

export function Tabs({ value, onChange, items, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={twMerge(clsx('flex items-center gap-1 overflow-x-auto p-1 bg-panel-alt border border-border rounded-md', className))}
    >
      {items.map((item) => {
        const isActive = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={twMerge(
              clsx(
                'relative inline-flex items-center gap-2 whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium transition-all duration-150 ease-in-out z-10 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isActive
                  ? 'bg-panel text-ink border border-border shadow-m3'
                  : 'bg-transparent text-muted hover:text-ink hover:bg-inlay-hover border border-transparent',
                item.disabled && 'cursor-not-allowed opacity-50'
              )
            )}
          >
            {item.icon && <span className="h-4 w-4" aria-hidden="true">{item.icon}</span>}
            <span className="relative z-10">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
