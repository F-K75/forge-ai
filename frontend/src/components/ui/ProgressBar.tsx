import type { HTMLAttributes } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

export type ProgressTone = 'ok' | 'info' | 'warn' | 'error' | 'accent' | 'neutral'

interface ProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value: number
  tone?: ProgressTone
  /** Accessible name, e.g. "Run progress". */
  label: string
  /** Show the percentage above the bar (dashboard list-row style). */
  showValue?: boolean
  size?: 'sm' | 'md'
}

const toneClasses: Record<ProgressTone, string> = {
  ok: 'bg-ok',
  info: 'bg-info',
  warn: 'bg-warn',
  error: 'bg-error',
  accent: 'bg-accent',
  neutral: 'bg-muted',
}

/** Thin pill progress bar with an optional mono percentage label. */
export function ProgressBar({
  value,
  tone = 'ok',
  label,
  showValue = false,
  size = 'sm',
  className,
  ...rest
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className={twMerge(clsx('flex min-w-0 flex-col gap-1.5', className))} {...rest}>
      {showValue && (
        <span className="font-mono text-xs tabular-nums text-ink" aria-hidden="true">
          {pct}%
        </span>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className={clsx(
          'w-full overflow-hidden rounded-pill bg-ink/[0.08]',
          size === 'sm' ? 'h-1' : 'h-1.5'
        )}
      >
        <div
          className={clsx(
            'h-full rounded-pill transition-[width] duration-slow ease-out',
            toneClasses[tone]
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
