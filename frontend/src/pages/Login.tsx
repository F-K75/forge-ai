import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Sparkles, Eye, EyeOff, Mail, Lock, CheckCircle2, Chrome, Github } from 'lucide-react'
import clsx from 'clsx'

export default function Login() {
  const { login } = useAuthStore()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const remembered = localStorage.getItem('forge_remember_email')
    if (remembered) {
      setEmail(remembered)
      setRememberMe(true)
    }
  }, [])

  const validateEmail = (value: string) => {
    if (!value) return 'Email is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email format'
    return ''
  }

  const validatePassword = (value: string) => {
    if (!value) return 'Password is required'
    if (value.length < 8) return 'Password must be at least 8 characters'
    return ''
  }

  const handleBlur = (field: string) => {
    setTouched(prev => ({ ...prev, [field]: true }))
    let error = ''
    if (field === 'email') error = validateEmail(email)
    if (field === 'password') error = validatePassword(password)
    setErrors(prev => ({ ...prev, [field]: error }))
  }

  const isValid = !validateEmail(email) && !validatePassword(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    
    const emailError = validateEmail(email)
    const passwordError = validatePassword(password)
    setErrors({ email: emailError, password: passwordError })
    
    if (emailError || passwordError) {
      if (emailError) emailRef.current?.focus()
      else if (passwordError) passwordRef.current?.focus()
      return
    }

    setLoading(true)
    setSuccess(false)
    
    if (rememberMe) {
      localStorage.setItem('forge_remember_email', email)
    } else {
      localStorage.removeItem('forge_remember_email')
    }

    try {
      await login(email, password)
      setSuccess(true)
      setTimeout(() => navigate('/'), 500)
    } catch (err: any) {
      setErrors({ submit: err.response?.data?.detail || 'Login failed' })
    } finally {
      setLoading(false)
    }
  }

  const handleSocialLogin = (provider: 'google' | 'github') => {
    // Placeholder for OAuth - would redirect to backend endpoint
    console.log(`Initiating ${provider} login`)
    // window.location.href = `/auth/${provider}`
  }

  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Welcome back</h1>
          <p className="text-forge-text-secondary">Sign in to continue to Forge</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-forge-surface border border-forge-border rounded-2xl p-6 space-y-4" noValidate>
          {errors.submit && (
            <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <span>{errors.submit}</span>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => handleSocialLogin('google')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-forge-border bg-forge-bg text-forge-text-secondary hover:bg-forge-surface transition focus:outline-none focus:ring-2 focus:ring-violet-500"
              aria-label="Continue with Google"
            >
              <Chrome className="w-5 h-5" />
              Continue with Google
            </button>
            <button
              type="button"
              onClick={() => handleSocialLogin('github')}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-forge-border bg-forge-bg text-forge-text-secondary hover:bg-forge-surface transition focus:outline-none focus:ring-2 focus:ring-violet-500"
              aria-label="Continue with GitHub"
            >
              <Github className="w-5 h-5" />
              Continue with GitHub
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-forge-border" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-forge-surface text-forge-text-secondary">Or continue with email</span>
            </div>
          </div>

          <div>
            <label htmlFor="email" className="block text-sm text-forge-text-secondary mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-muted" aria-hidden="true" />
              <input
                ref={emailRef}
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => handleBlur('email')}
                required
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className={clsx(
                  'w-full bg-forge-bg border rounded-xl pl-10 pr-4 py-3 text-white placeholder-forge-muted focus:outline-none focus:ring-2 transition',
                  errors.email && touched.email ? 'border-red-500 focus:ring-red-500' : 'border-forge-border focus:ring-violet-500'
                )}
                placeholder="you@example.com"
                autoComplete="email"
              />
              {touched.email && !errors.email && email && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" aria-hidden="true" />
              )}
            </div>
            {touched.email && errors.email && (
              <p id="email-error" role="alert" className="mt-1 text-xs text-red-400">{errors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-forge-text-secondary mb-2">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-muted" aria-hidden="true" />
              <input
                ref={passwordRef}
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => handleBlur('password')}
                required
                minLength={8}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
                className={clsx(
                  'w-full bg-forge-bg border rounded-xl pl-10 pr-10 py-3 text-white placeholder-forge-muted focus:outline-none focus:ring-2 transition',
                  errors.password && touched.password ? 'border-red-500 focus:ring-red-500' : 'border-forge-border focus:ring-violet-500'
                )}
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-forge-muted hover:text-white focus:text-white"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {touched.password && errors.password && (
              <p id="password-error" role="alert" className="mt-1 text-xs text-red-400">{errors.password}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded bg-forge-bg border-forge-border text-violet-600 focus:ring-violet-500"
                aria-describedby="remember-me-desc"
              />
              <span className="text-sm text-forge-text-secondary">Remember me</span>
            </label>
            <Link to="/forgot-password" className="text-sm text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            disabled={loading || !isValid || success}
            className={clsx(
              'w-full text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-violet-500',
              success ? 'bg-emerald-600' : 'bg-violet-600 hover:bg-violet-500 disabled:bg-violet-600/50',
              loading && 'cursor-wait'
            )}
            aria-disabled={loading || !isValid || success}
          >
            {success ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Signed in!
              </>
            ) : loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </button>

          <p className="text-center text-sm text-forge-text-secondary">
            Don't have an account?{' '}
            <Link to="/signup" className="text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded">
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}