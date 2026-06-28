import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { Sparkles, Eye, EyeOff, Mail, Lock, CheckCircle2, User, Chrome, Github } from 'lucide-react'
import clsx from 'clsx'

type PasswordStrength = 'weak' | 'medium' | 'strong'

export default function Signup() {
  const { register } = useAuthStore()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const getPasswordStrength = (value: string): PasswordStrength => {
    if (!value) return 'weak'
    if (value.length < 8) return 'weak'
    if (value.length < 12) return 'medium'
    return 'strong'
  }

  const strength = getPasswordStrength(password)
  const strengthColors = {
    weak: 'bg-red-500',
    medium: 'bg-amber-500',
    strong: 'bg-emerald-500',
  }

  const validateName = (value: string) => {
    if (!value) return 'Name is required'
    if (value.length < 2) return 'Name must be at least 2 characters'
    return ''
  }

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
    if (field === 'name') error = validateName(name)
    if (field === 'email') error = validateEmail(email)
    if (field === 'password') error = validatePassword(password)
    setErrors(prev => ({ ...prev, [field]: error }))
  }

  const isValid = !validateName(name) && !validateEmail(email) && !validatePassword(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, email: true, password: true })

    const nameError = validateName(name)
    const emailError = validateEmail(email)
    const passwordError = validatePassword(password)
    setErrors({ name: nameError, email: emailError, password: passwordError })

    if (nameError || emailError || passwordError) {
      if (nameError) nameRef.current?.focus()
      else if (emailError) emailRef.current?.focus()
      else if (passwordError) passwordRef.current?.focus()
      return
    }

    setLoading(true)

    try {
      await register(email, name, password)
      setSuccess(true)
      setTimeout(() => navigate('/onboarding'), 500)
    } catch (err: any) {
      setErrors({ submit: err.response?.data?.detail || 'Registration failed' })
    } finally {
      setLoading(false)
    }
  }

  const handleSocialLogin = (provider: 'google' | 'github') => {
    console.log(`Initiating ${provider} signup`)
  }

  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Create account</h1>
          <p className="text-forge-text-secondary">Start building with Forge</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-forge-surface border border-forge-border rounded-2xl p-6 space-y-4" noValidate>
          {errors.submit && (
            <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
              {errors.submit}
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
              <span className="px-2 bg-forge-surface text-forge-text-secondary">Or sign up with email</span>
            </div>
          </div>

          <div>
            <label htmlFor="name" className="block text-sm text-forge-text-secondary mb-2">Full name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-muted" aria-hidden="true" />
              <input
                ref={nameRef}
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => handleBlur('name')}
                required
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
                className={clsx(
                  'w-full bg-forge-bg border rounded-xl pl-10 pr-4 py-3 text-white placeholder-forge-muted focus:outline-none focus:ring-2 transition',
                  errors.name && touched.name ? 'border-red-500 focus:ring-red-500' : 'border-forge-border focus:ring-violet-500'
                )}
                placeholder="Jane Doe"
                autoComplete="name"
              />
              {touched.name && !errors.name && name && (
                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400" aria-hidden="true" />
              )}
            </div>
            {touched.name && errors.name && (
              <p id="name-error" role="alert" className="mt-1 text-xs text-red-400">{errors.name}</p>
            )}
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
                aria-describedby="password-error password-strength"
                className={clsx(
                  'w-full bg-forge-bg border rounded-xl pl-10 pr-10 py-3 text-white placeholder-forge-muted focus:outline-none focus:ring-2 transition',
                  errors.password && touched.password ? 'border-red-500 focus:ring-red-500' : 'border-forge-border focus:ring-violet-500'
                )}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
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
            <div id="password-strength" className="mt-2">
              <div className="flex gap-1 h-1" role="progressbar" aria-valuenow={strength === 'weak' ? 33 : strength === 'medium' ? 66 : 100} aria-valuemin={0} aria-valuemax={100} aria-label="Password strength">
                <div className={clsx('flex-1 rounded-full', strength !== 'weak' ? strengthColors[strength] : 'bg-forge-border')} />
                <div className={clsx('flex-1 rounded-full', strength === 'strong' ? strengthColors.strong : strength !== 'weak' ? strengthColors.medium : 'bg-forge-border')} />
                <div className={clsx('flex-1 rounded-full', strength === 'strong' ? strengthColors[strength] : 'bg-forge-border')} />
              </div>
              <p className="text-xs text-forge-text-secondary mt-1">
                Password strength: <span className={clsx('font-medium', strength === 'weak' ? 'text-red-400' : strength === 'medium' ? 'text-amber-400' : 'text-emerald-400')}>
                  {strength.charAt(0).toUpperCase() + strength.slice(1)}
                </span>
              </p>
            </div>
            {touched.password && errors.password && (
              <p id="password-error" role="alert" className="mt-1 text-xs text-red-400">{errors.password}</p>
            )}
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
                Account created!
              </>
            ) : loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating account...
              </>
            ) : (
              'Create account'
            )}
          </button>

          <p className="text-center text-sm text-forge-text-secondary">
            Already have an account?{' '}
            <Link to="/login" className="text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}