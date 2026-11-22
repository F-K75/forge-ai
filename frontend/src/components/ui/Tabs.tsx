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
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-panel-alt p-1',
          className
        )
      )}
    >
      {items.map((item) => {
        const isActive = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={twMerge(
              clsx(
                'relative inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-fast select-none',
                isActive
                  ? 'bg-panel text-ink shadow-xs border border-border'
                  : 'border border-transparent bg-transparent text-muted hover:text-ink',
                item.disabled && 'cursor-not-allowed opacity-50'
              )
            )}
          >
            {item.icon && (
              <span className="h-3.5 w-3.5" aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
