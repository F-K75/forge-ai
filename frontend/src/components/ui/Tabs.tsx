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
      className={twMerge(clsx('flex items-center gap-1.5 overflow-x-auto p-1 bg-white border-2 border-black rounded-sm shadow-brutal-sm', className))}
    >
      {items.map((item) => {
        const isActive = item.value === value
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={isActive}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={twMerge(
              clsx(
                'relative inline-flex items-center gap-2 whitespace-nowrap rounded-sm px-3.5 py-1.5 text-xs font-bold transition-all duration-fast z-10 select-none uppercase tracking-wider',
                isActive
                  ? 'bg-brutal-yellow text-black border-2 border-black shadow-brutal-sm'
                  : 'bg-transparent text-ink hover:bg-black/5 border-2 border-transparent hover:border-black/20',
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
