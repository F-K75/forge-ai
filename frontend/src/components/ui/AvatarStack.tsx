import type { HTMLAttributes } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

export interface AvatarStackItem {
  /** Full name or role, used for the accessible label and tooltip. */
  name: string
  /** Up to 2 characters shown in the circle. Derived from name if omitted. */
  initials?: string
}

interface AvatarStackProps extends HTMLAttributes<HTMLDivElement> {
  items: AvatarStackItem[]
  /** Max circles before collapsing the rest into "+N". */
  max?: number
  size?: 'xs' | 'sm'
}

function initialsOf(item: AvatarStackItem) {
  if (item.initials) return item.initials.slice(0, 2).toUpperCase()
  const parts = item.name.trim().split(/[\s_-]+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : item.name.slice(0, 2)).toUpperCase()
}

/** Overlapping initials circles (agents or members) with a "+N" overflow chip. */
export function AvatarStack({ items, max = 4, size = 'xs', className, ...rest }: AvatarStackProps) {
  const shown = items.slice(0, max)
  const extra = items.length - shown.length
  const dims = size === 'xs' ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-2xs'
  return (
    <div
      role="img"
      aria-label={items.map((i) => i.name).join(', ')}
      className={twMerge(clsx('flex items-center -space-x-1.5', className))}
      {...rest}
    >
      {shown.map((item, idx) => (
        <span
          key={`${item.name}-${idx}`}
          title={item.name}
          aria-hidden="true"
          className={clsx(
            'inline-flex shrink-0 items-center justify-center rounded-full border-2 border-panel bg-surface-high font-mono font-medium text-muted',
            dims
          )}
        >
          {initialsOf(item)}
        </span>
      ))}
      {extra > 0 && (
        <span
          aria-hidden="true"
          className={clsx(
            'inline-flex shrink-0 items-center justify-center rounded-full border-2 border-panel bg-panel-alt font-mono text-faint',
            dims
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}
