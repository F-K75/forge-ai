import { useEffect, useState, Suspense, lazy } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { Mail } from 'lucide-react'
import { useAuthStore } from './store/authStore'
import { api } from './lib/api'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { LIVE_MODE } from './lib/env'

const AuthPage = lazy(() => import('./pages/AuthPage'))
const Signup = lazy(() => import('./pages/Signup'))
const Onboarding = lazy(() => import('./pages/Onboarding'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

// App shell + routed pages (step 1)
const AppShell        = lazy(() => import('./components/AppShell'))
const Launch          = lazy(() => import('./pages/Launch'))
const ProjectsPage    = lazy(() => import('./pages/ProjectsPage'))
const MarketplacePage = lazy(() => import('./pages/MarketplacePage'))
const BillingPage     = lazy(() => import('./pages/BillingPage'))
const SettingsPage    = lazy(() => import('./pages/SettingsPage'))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'))
// Step 3: in-shell surfaces
const AdminConsole    = lazy(() => import('./pages/AdminConsole'))
const ProjectHistory  = lazy(() => import('./pages/ProjectHistory'))
// Review board — orchestrator UI (separate backend service, see lib/orchestratorApi.ts)
const ReviewsListPage  = lazy(() => import('./pages/reviews/ReviewsListPage'))
const ReviewDetailPage = lazy(() => import('./pages/reviews/ReviewDetailPage'))
// Step 5: public marketing surface (independent theme, no shell, no auth)
const LandingPage     = lazy(() => import('./pages/LandingPage'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

function LoadingSpinner() {
  return (
    <div className="min-h-screen bg-base flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function RouteSkeleton() {
  return (
    <div className="min-h-screen bg-base flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted">Loading...</p>
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
  // Demo mode has no real session — fetchMe() always reports "authenticated"
  // so the rest of the app can be clicked through without a backend. Applying
  // that here would make /signup and /forgot-password permanently
  // unreachable in demo mode, so this check only applies in live mode.
  const [checking, setChecking] = useState(LIVE_MODE)

  useEffect(() => {
    if (!LIVE_MODE) return
    fetchMe().catch(() => {
      useAuthStore.setState({ isAuthenticated: false, user: null })
    }).finally(() => setChecking(false))
  }, [fetchMe])

  if (checking || (LIVE_MODE && isLoading)) {
    return <LoadingSpinner />
  }

  if (LIVE_MODE && isAuthenticated) {
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
      <div className="min-h-screen bg-land-paper text-land-ink flex items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="w-10 h-10 rounded-full border border-land-border flex items-center justify-center mx-auto mb-6">
            <Mail className="w-4 h-4 text-land-ink" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-medium tracking-tight mb-2">Check your email</h1>
          <p className="text-sm text-land-muted mb-8">If an account with that email exists, we sent a reset link.</p>
          <Link to="/login" className="text-sm text-land-ink underline underline-offset-4 hover:text-land-muted transition">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-land-paper text-land-ink flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-[0.18em] text-land-muted mb-4 flex items-center gap-2">
            <span className="w-6 h-px bg-land-muted/50" aria-hidden="true" /> Reset password
          </div>
          <h1 className="font-display text-3xl font-medium tracking-tight">Forgot your password?</h1>
          <p className="text-sm text-land-muted mt-2">Enter your email to receive a reset link.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {emailError && touched && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-land-destructive/40 bg-land-destructive/10 p-3 text-sm text-land-destructive">
              <span>{emailError}</span>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="reset-email" className="block text-xs uppercase tracking-[0.14em] text-land-muted">
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched(true)}
              required
              autoComplete="email"
              autoFocus
              className={`w-full h-11 px-3 bg-transparent border rounded-md text-sm text-land-ink placeholder:text-land-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-land-ink/40 transition ${
                emailError && touched ? 'border-land-destructive/60' : 'border-land-border'
              }`}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-md bg-land-ink text-land-paper text-sm font-medium hover:bg-land-ink/90 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>

          <p className="text-center text-sm text-land-muted">
            <Link to="/login" className="text-land-ink hover:underline underline-offset-4">
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
          {/* Step 5: public landing — independent theme, no shell, no auth gate */}
          <Route path="/home" element={<ErrorBoundary><Suspense fallback={<RouteSkeleton />}><LandingPage /></Suspense></ErrorBoundary>} />

          <Route path="/login" element={<ErrorBoundary><Suspense fallback={<RouteSkeleton />}><AuthPage /></Suspense></ErrorBoundary>} />
          <Route path="/signup" element={<ErrorBoundary><PublicRoute><Suspense fallback={<RouteSkeleton />}><Signup /></Suspense></PublicRoute></ErrorBoundary>} />
          <Route path="/forgot-password" element={<ErrorBoundary><PublicRoute><ForgotPassword /></PublicRoute></ErrorBoundary>} />
          <Route path="/reset-password" element={<ErrorBoundary><PublicRoute><Suspense fallback={<RouteSkeleton />}><ResetPassword /></Suspense></PublicRoute></ErrorBoundary>} />
          <Route path="/verify-email" element={<ErrorBoundary><Suspense fallback={<RouteSkeleton />}><VerifyEmail /></Suspense></ErrorBoundary>} />
          <Route path="/onboarding" element={<ErrorBoundary><Suspense fallback={<RouteSkeleton />}><Onboarding /></Suspense></ErrorBoundary>} />

          {/* Launch — full-screen, no sidebar shell, still behind the auth gate */}
          <Route path="/" element={<ErrorBoundary><ProtectedRoute><Suspense fallback={<RouteSkeleton />}><Launch /></Suspense></ProtectedRoute></ErrorBoundary>} />

          {/* App shell — rail + routed pages */}
          <Route
            element={
              <ErrorBoundary>
                <ProtectedRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <AppShell />
                  </Suspense>
                </ProtectedRoute>
              </ErrorBoundary>
            }
          >
            <Route path="/projects" element={<Suspense fallback={<RouteSkeleton />}><ProjectsPage /></Suspense>} />
            <Route path="/marketplace" element={<Suspense fallback={<RouteSkeleton />}><MarketplacePage /></Suspense>} />
            <Route path="/billing" element={<Suspense fallback={<RouteSkeleton />}><BillingPage /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={<RouteSkeleton />}><SettingsPage /></Suspense>} />
            {/* Step 3: in-shell surfaces */}
            <Route path="/admin-console" element={<AdminRoute><Suspense fallback={<RouteSkeleton />}><AdminConsole /></Suspense></AdminRoute>} />
            <Route path="/project/:projectId" element={<Suspense fallback={<RouteSkeleton />}><ProjectHistory /></Suspense>} />
            <Route path="/reviews" element={<Suspense fallback={<RouteSkeleton />}><ReviewsListPage /></Suspense>} />
            <Route path="/reviews/:runId" element={<Suspense fallback={<RouteSkeleton />}><ReviewDetailPage /></Suspense>} />
          </Route>

          {/* Workspace — full-screen, no shell (step 4 fills this) */}
          <Route path="/build/:projectId" element={<ErrorBoundary><ProtectedRoute><Suspense fallback={<RouteSkeleton />}><WorkspacePage /></Suspense></ProtectedRoute></ErrorBoundary>} />

          <Route path="*" element={<ErrorBoundary><Suspense fallback={<RouteSkeleton />}><NotFoundPage /></Suspense></ErrorBoundary>} />
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