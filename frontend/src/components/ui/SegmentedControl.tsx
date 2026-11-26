import { useRef, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Optional count rendered in mono after the label. */
  count?: number
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name for the group. */
  label: string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Pill track with the active segment as a solid ink pill (Monthly/Yearly switch).
 * A radiogroup with roving tabindex and arrow-key navigation.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'sm',
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    const next = (idx + dir + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={twMerge(
        clsx('inline-flex items-center gap-0.5 rounded-pill bg-ink/[0.06] p-0.5', className)
      )}
    >
      {options.map((opt, idx) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[idx] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={clsx(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              size === 'sm' ? 'h-7 px-3 text-xs' : 'h-8 px-3.5 text-caption',
              active ? 'bg-ink text-[rgb(var(--bg))]' : 'text-muted hover:text-ink'
            )}
          >
            {opt.label}
            {typeof opt.count === 'number' && (
              <span
                className={clsx('font-mono tabular-nums', active ? 'text-[rgb(var(--bg)/0.6)]' : 'text-faint')}
              >
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
