import { type InputHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'
import { layout } from '../../lib/designTokens'

interface SwitchProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  description?: string
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, className, ...props }, ref) => {
    return (
      <label className={twMerge(clsx('flex items-start gap-3 cursor-pointer select-none', className))}>
        <div className="relative mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            className="peer sr-only"
            {...props}
          />
          <div
            className={clsx(
              'h-6 w-11 rounded-full transition-colors duration-fast',
              'bg-panel-alt peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-base',
              props.checked && 'bg-accent'
            )}
            style={{ borderRadius: layout.radiusFull }}
          >
            <div
              className={clsx(
                'absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-fast',
                props.checked && 'translate-x-5'
              )}
            />
          </div>
        </div>
        {(label || description) && (
          <div className="flex flex-col gap-0.5">
            {label && <span className="text-sm font-medium text-ink">{label}</span>}
            {description && <span className="text-xs text-muted">{description}</span>}
          </div>
        )}
      </label>
    )
  }
)

Switch.displayName = 'Switch'
