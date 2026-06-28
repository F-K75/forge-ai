import { useEffect, useState, Suspense, lazy } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Mail } from 'lucide-react'
import { useAuthStore } from './store/authStore'
import { api } from './lib/api'
import { ErrorBoundary } from './components/ui/ErrorBoundary'

const WorkspaceLayout = lazy(() => import('./components/layout/WorkspaceLayout'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const Settings = lazy(() => import('./pages/Settings'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const Billing = lazy(() => import('./pages/Billing'))
const Admin = lazy(() => import('./pages/Admin'))
const Marketplace = lazy(() => import('./pages/Marketplace'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function RouteSkeleton() {
  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-forge-text-secondary">Loading...</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, fetchMe } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetchMe().catch(() => {
      useAuthStore.setState({ isAuthenticated: false, user: null })
    }).finally(() => setChecking(false))
  }, [fetchMe])

  if (checking || isLoading) {
    return <LoadingSpinner />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, fetchMe } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetchMe().catch(() => {
      useAuthStore.setState({ isAuthenticated: false, user: null })
    }).finally(() => setChecking(false))
  }, [fetchMe])

  if (checking || isLoading) {
    return <LoadingSpinner />
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, fetchMe, isAuthenticated } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetchMe().finally(() => setChecking(false))
  }, [fetchMe])

  if (checking || !isAuthenticated) {
    return <LoadingSpinner />
  }

  // Admin check: verify via user object from /auth/me
  const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean)
  const isAdmin = adminEmails.includes(user?.email || '')
  
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [touched, setTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const validateEmail = (value: string) => {
    if (!value) return 'Email is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Invalid email format'
    return ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    const err = validateEmail(email)
    setEmailError(err)
    if (err) return
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSubmitted(true)
    } catch (_err: unknown) {
      // still return success to prevent email enumeration
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-forge-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 mb-4">
              <Mail className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Check your email</h1>
            <p className="text-forge-text-secondary">If an account with that email exists, we sent a reset link.</p>
          </div>
          <p className="text-center text-sm text-forge-text-secondary">
            <Link to="/login" className="text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 mb-4">
            <Mail className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Reset password</h1>
          <p className="text-forge-text-secondary">Enter your email to receive a reset link</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-forge-surface border border-forge-border rounded-2xl p-6 space-y-4" noValidate>
          {emailError && touched && (
            <div role="alert" className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">
              <span>{emailError}</span>
            </div>
          )}

          <div>
            <label htmlFor="reset-email" className="block text-sm text-forge-text-secondary mb-2">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-forge-muted" aria-hidden="true" />
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouched(true)}
                required
                className="w-full bg-forge-bg border border-forge-border rounded-xl pl-10 pr-4 py-3 text-white placeholder-forge-muted focus:outline-none focus:ring-2 focus:ring-violet-500"
                autoComplete="email"
                autoFocus
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-medium py-3 rounded-xl bg-violet-600 hover:bg-violet-500 transition focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>

          <p className="text-center text-sm text-forge-text-secondary">
            <Link to="/login" className="text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded">
              Back to sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<ErrorBoundary><PublicRoute><Suspense fallback={<RouteSkeleton />}><Login /></Suspense></PublicRoute></ErrorBoundary>} />
          <Route path="/signup" element={<ErrorBoundary><PublicRoute><Suspense fallback={<RouteSkeleton />}><Signup /></Suspense></PublicRoute></ErrorBoundary>} />
          <Route path="/forgot-password" element={<ErrorBoundary><PublicRoute><ForgotPassword /></PublicRoute></ErrorBoundary>} />
          <Route path="/onboarding" element={<ErrorBoundary><ProtectedRoute><Suspense fallback={<RouteSkeleton />}><Onboarding /></Suspense></ProtectedRoute></ErrorBoundary>} />
          <Route path="/billing" element={<ErrorBoundary><ProtectedRoute><Suspense fallback={<RouteSkeleton />}><Billing /></Suspense></ProtectedRoute></ErrorBoundary>} />
          <Route path="/settings" element={<ErrorBoundary><ProtectedRoute><Suspense fallback={<RouteSkeleton />}><Settings /></Suspense></ProtectedRoute></ErrorBoundary>} />
          <Route path="/admin" element={<ErrorBoundary><AdminRoute><Suspense fallback={<RouteSkeleton />}><Admin /></Suspense></AdminRoute></ErrorBoundary>} />
          <Route path="/marketplace" element={<ErrorBoundary><ProtectedRoute><Suspense fallback={<RouteSkeleton />}><Marketplace /></Suspense></ProtectedRoute></ErrorBoundary>} />
          <Route path="/" element={<ErrorBoundary><ProtectedRoute><Suspense fallback={<RouteSkeleton />}><WorkspaceLayout /></Suspense></ProtectedRoute></ErrorBoundary>} />
          <Route path="/project/:projectId" element={<ErrorBoundary><ProtectedRoute><Suspense fallback={<RouteSkeleton />}><WorkspaceLayout /></Suspense></ProtectedRoute></ErrorBoundary>} />
        </Routes>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#111118',
              color: '#e2e2f0',
              border: '1px solid #1e1e2e',
              fontSize: '13px',
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  )
}