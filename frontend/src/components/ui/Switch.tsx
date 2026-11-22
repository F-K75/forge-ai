import { type InputHTMLAttributes, forwardRef } from 'react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

interface SwitchProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  description?: string
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, className, ...props }, ref) => {
    return (
      <label className={twMerge(clsx('flex items-start gap-3 cursor-pointer select-none', className))}>
        <div className="relative mt-0.5 shrink-0">
          <input
            ref={ref}
            type="checkbox"
            className="peer sr-only"
            {...props}
          />
          <div
            className={clsx(
              'h-5 w-9 rounded-full border transition-colors duration-fast',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-base',
              props.checked
                ? 'border-accent bg-accent'
                : 'border-border bg-surface-high'
            )}
          >
            <div
              className={clsx(
                'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-xs transition-transform duration-fast',
                props.checked ? 'translate-x-4' : 'translate-x-0'
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
