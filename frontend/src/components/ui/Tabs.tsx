import type { ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { motion, useReducedMotion } from 'motion/react'
import { layout } from '../../lib/designTokens'

interface TabsProps {
  value: string
  onChange: (value: string) => void
  items: { value: string; label: string; icon?: ReactNode; disabled?: boolean }[]
  className?: string
}

export function Tabs({ value, onChange, items, className }: TabsProps) {
  const reduceMotion = useReducedMotion()

  return (
    <div
      role="tablist"
      className={twMerge(clsx('flex items-center gap-1 overflow-x-auto', className))}
      style={{ borderRadius: layout.radiusMd }}
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
                'relative inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-all duration-fast',
                isActive ? 'text-ink shadow-apple' : 'text-muted hover:text-ink',
                item.disabled && 'cursor-not-allowed opacity-50'
              )
            )}
            style={isActive ? { background: 'rgb(var(--surface-container))' } : undefined}
          >
            {item.icon && <span className="h-4 w-4" aria-hidden="true">{item.icon}</span>}
            {item.label}
            {isActive && (
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: 'rgb(var(--surface-container))' }}
                layoutId="activeTab"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
