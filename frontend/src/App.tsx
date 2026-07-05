import { useEffect, useState, Suspense, lazy } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/authStore'
import { ErrorBoundary } from './components/ui/ErrorBoundary'
import { LIVE_MODE } from './lib/env'

const AuthPage = lazy(() => import('./pages/AuthPage'))
const Signup = lazy(() => import('./pages/Signup'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
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
const LLMManagementPage = lazy(() => import('./pages/LLMManagementPage'))
// Step 3: in-shell surfaces
const AdminConsole    = lazy(() => import('./pages/AdminConsole'))
const ProjectHistory  = lazy(() => import('./pages/ProjectHistory'))
// AI-native Agile PM layer (Initiatives): vision/PRD -> epics/stories/tasks -> sprints -> board -> releases
const InitiativesListPage = lazy(() => import('./pages/pm/InitiativesListPage'))
const InitiativeLayout    = lazy(() => import('./pages/pm/InitiativeLayout'))
const OverviewTab         = lazy(() => import('./pages/pm/OverviewTab'))
const KanbanTab           = lazy(() => import('./pages/pm/KanbanTab'))
const SprintsTab          = lazy(() => import('./pages/pm/SprintsTab'))
const RoadmapTab          = lazy(() => import('./pages/pm/RoadmapTab'))
const GraphTab            = lazy(() => import('./pages/pm/GraphTab'))
const ReleasesTab         = lazy(() => import('./pages/pm/ReleasesTab'))
const ActivityTab         = lazy(() => import('./pages/pm/ActivityTab'))
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
    return <Navigate to="/projects" replace />
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
    return <Navigate to="/projects" replace />
  }

  return <>{children}</>
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
          <Route path="/forgot-password" element={<ErrorBoundary><PublicRoute><Suspense fallback={<RouteSkeleton />}><ForgotPassword /></Suspense></PublicRoute></ErrorBoundary>} />
          <Route path="/reset-password" element={<ErrorBoundary><PublicRoute><Suspense fallback={<RouteSkeleton />}><ResetPassword /></Suspense></PublicRoute></ErrorBoundary>} />
          <Route path="/verify-email" element={<ErrorBoundary><Suspense fallback={<RouteSkeleton />}><VerifyEmail /></Suspense></ErrorBoundary>} />
          <Route path="/onboarding" element={<ErrorBoundary><Suspense fallback={<RouteSkeleton />}><Onboarding /></Suspense></ErrorBoundary>} />

          {/* Launch — public entry splash; already-authenticated visitors are bounced straight to /projects by PublicRoute */}
          <Route path="/" element={<ErrorBoundary><PublicRoute><Suspense fallback={<RouteSkeleton />}><Launch /></Suspense></PublicRoute></ErrorBoundary>} />

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
            <Route path="/llm-management" element={<Suspense fallback={<RouteSkeleton />}><LLMManagementPage /></Suspense>} />
            {/* Step 3: in-shell surfaces */}
            <Route path="/admin-console" element={<AdminRoute><Suspense fallback={<RouteSkeleton />}><AdminConsole /></Suspense></AdminRoute>} />
            <Route path="/project/:projectId" element={<Suspense fallback={<RouteSkeleton />}><ProjectHistory /></Suspense>} />
            <Route path="/reviews" element={<Suspense fallback={<RouteSkeleton />}><ReviewsListPage /></Suspense>} />
            <Route path="/reviews/:runId" element={<Suspense fallback={<RouteSkeleton />}><ReviewDetailPage /></Suspense>} />
            <Route path="/initiatives" element={<Suspense fallback={<RouteSkeleton />}><InitiativesListPage /></Suspense>} />
            <Route path="/initiatives/:initiativeId" element={<Suspense fallback={<RouteSkeleton />}><InitiativeLayout /></Suspense>}>
              <Route index element={<OverviewTab />} />
              <Route path="board" element={<KanbanTab />} />
              <Route path="sprints" element={<SprintsTab />} />
              <Route path="roadmap" element={<RoadmapTab />} />
              <Route path="graph" element={<GraphTab />} />
              <Route path="releases" element={<ReleasesTab />} />
              <Route path="activity" element={<ActivityTab />} />
            </Route>
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