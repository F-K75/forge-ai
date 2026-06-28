import { useState, forwardRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { FormInput, type FormInputProps } from './FormInput'

interface PasswordInputProps extends Omit<FormInputProps, 'type'> {}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  (props, ref) => {
    const [showPassword, setShowPassword] = useState(false)

    return (
      <div className="relative">
        <FormInput
          ref={ref}
          type={showPassword ? 'text' : 'password'}
          {...props}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-forge-muted hover:text-white focus:text-white"
          tabIndex={-1}
        >
          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'