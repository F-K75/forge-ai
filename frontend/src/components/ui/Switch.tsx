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
        <div className="relative mt-0.5">
          <input
            ref={ref}
            type="checkbox"
            className="peer sr-only"
            {...props}
          />
          <div
            className={clsx(
              'h-6 w-11 rounded-full border border-border bg-panel-alt transition-colors duration-150 ease-in-out',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-base',
              'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
              props.checked && 'bg-accent border-accent'
            )}
          >
            <div
              className={clsx(
                'absolute left-0.5 top-0.5 h-5 w-5 rounded-full transition-transform duration-150 ease-in-out shadow-sm',
                props.checked ? 'translate-x-5 bg-[#09090B]' : 'bg-muted'
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
