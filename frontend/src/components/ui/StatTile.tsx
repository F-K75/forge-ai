import type { HTMLAttributes, ReactNode } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react'

export type StatTrend = 'up' | 'down' | 'flat'

interface StatTileProps extends HTMLAttributes<HTMLDivElement> {
  label: string
  value: ReactNode
  icon?: LucideIcon
  /** Secondary value shown after the main value in faint mono, e.g. "/ $25". */
  suffix?: ReactNode
  /** Short change label such as "+2" or "12%". */
  delta?: ReactNode
  /** Direction of the delta. "up" is green, "down" red, "flat" muted. */
  trend?: StatTrend
  /** When true, a rising number is bad (e.g. spend), so the colours swap. */
  invertTrend?: boolean
  /** Faint comparison text, e.g. "vs yesterday". */
  hint?: ReactNode
}

/**
 * Dashboard metric tile: icon in a soft square, caption label, mono value, delta.
 * Mirrors the Ember Night "Stat tile" spec.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  suffix,
  delta,
  trend = 'flat',
  invertTrend = false,
  hint,
  className,
  ...rest
}: StatTileProps) {
  const good = invertTrend ? trend === 'down' : trend === 'up'
  const bad = invertTrend ? trend === 'up' : trend === 'down'
  const Arrow = trend === 'down' ? ArrowDownRight : ArrowUpRight

  return (
    <div
      className={twMerge(
        clsx('flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-panel p-4', className)
      )}
      {...rest}
    >
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink/[0.06] text-muted">
            <Icon size={15} aria-hidden="true" />
          </span>
        )}
        <span className="truncate text-caption text-muted">{label}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-2 gap-y-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-mono text-headline tabular-nums text-ink">{value}</span>
          {suffix && (
            <span className="truncate font-mono text-caption tabular-nums text-faint">{suffix}</span>
          )}
        </div>
        {(delta || hint) && (
          <div className="flex shrink-0 items-center gap-1.5 pb-1">
            {delta && (
              <span
                className={clsx(
                  'inline-flex items-center gap-0.5 font-mono text-xs tabular-nums',
                  good && 'text-ok',
                  bad && 'text-error',
                  !good && !bad && 'text-muted'
                )}
              >
                {trend !== 'flat' && <Arrow size={12} aria-hidden="true" />}
                {delta}
              </span>
            )}
            {hint && <span className="text-2xs text-faint">{hint}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
