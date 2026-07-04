import { forwardRef } from 'react'
import clsx from 'clsx'
import { CheckCircle2 } from 'lucide-react'

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean
  success?: boolean
}

export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading, success, children, className, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading || success}
        aria-disabled={loading || success || disabled}
        className={clsx(
          'w-full text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-accent',
          success ? 'bg-ok' : 'bg-accent hover:bg-accent/90 disabled:bg-accent/50',
          loading && 'cursor-wait',
          className
        )}
        {...props}
      >
        {success ? (
          <>
            <CheckCircle2 className="w-4 h-4" />
            Done
          </>
        ) : loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Loading...
          </>
        ) : (
          children
        )}
      </button>
    )
  }
)

LoadingButton.displayName = 'LoadingButton'