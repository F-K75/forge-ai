import { useEffect, useState, Suspense, lazy } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { Toaster } from "react-hot-toast"
import { useAuthStore } from "./store/authStore"
import { ErrorBoundary } from "./components/ui/ErrorBoundary"
import { LIVE_MODE } from "./lib/env"
import GlobalBackground from "./components/GlobalBackground"

const AuthPage = lazy(() => import("./pages/AuthPage"))
const Signup = lazy(() => import("./pages/Signup"))
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"))
const Onboarding = lazy(() => import("./pages/Onboarding"))
const ResetPassword = lazy(() => import("./pages/ResetPassword"))
const VerifyEmail = lazy(() => import("./pages/VerifyEmail"))
const GoogleCallback = lazy(() => import("./pages/GoogleCallback"))
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"))

// App shell + routed pages (step 1)
const AppShell = lazy(() => import("./components/AppShell"))
const Launch = lazy(() => import("./pages/Launch"))
const ProjectsPage = lazy(() => import("./pages/ProjectsPage"))
const FlowPage = lazy(() => import("./pages/FlowPage"))
const MarketplacePage = lazy(() => import("./pages/MarketplacePage"))
const BillingPage = lazy(() => import("./pages/BillingPage"))
const SettingsPage = lazy(() => import("./pages/SettingsPage"))
const WorkspacePage = lazy(() => import("./pages/WorkspacePage"))
const LLMManagementPage = lazy(() => import("./pages/LLMManagementPage"))
const OptimizationDashboard = lazy(() => import("./pages/OptimizationDashboard"))
const EngineeringHealthPage = lazy(() => import("./pages/EngineeringHealthPage"))
const PromptStudioPage = lazy(() => import("./pages/PromptStudioPage"))
// Step 3: in-shell surfaces
const AdminConsole = lazy(() => import("./pages/AdminConsole"))
const ProjectHistory = lazy(() => import("./pages/ProjectHistory"))
const EngineeringOrgPage = lazy(() => import("./pages/EngineeringOrgPage"))
// AI-native Agile PM layer (Initiatives): vision/PRD -> epics/stories/tasks -> sprints -> board -> releases
const InitiativesListPage = lazy(() => import("./pages/pm/InitiativesListPage"))
const InitiativeLayout = lazy(() => import("./pages/pm/InitiativeLayout"))
const OverviewTab = lazy(() => import("./pages/pm/OverviewTab"))
const KanbanTab = lazy(() => import("./pages/pm/KanbanTab"))
const SprintsTab = lazy(() => import("./pages/pm/SprintsTab"))
const AgentRunsTab = lazy(() => import("./pages/pm/AgentRunsTab"))
const RoadmapTab = lazy(() => import("./pages/pm/RoadmapTab"))
const GraphTab = lazy(() => import("./pages/pm/GraphTab"))
const ReleasesTab = lazy(() => import("./pages/pm/ReleasesTab"))
const ActivityTab = lazy(() => import("./pages/pm/ActivityTab"))
const IntegrationsTab = lazy(() => import("./pages/pm/IntegrationsTab"))
const AnalyticsTab = lazy(() => import("./pages/pm/AnalyticsTab"))
// Review board — orchestrator UI (separate backend service, see lib/orchestratorApi.ts)
const ReviewsListPage = lazy(() => import("./pages/reviews/ReviewsListPage"))
const ReviewDetailPage = lazy(() => import("./pages/reviews/ReviewDetailPage"))
// Step 5: public marketing surface (independent theme, no shell, no auth)
const LandingPage = lazy(() => import("./pages/LandingPage"))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

function LoadingSpinner() {
  return (
    <div className="relative z-50 min-h-[100dvh] bg-[#07070b] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-ember border-t-transparent rounded-full animate-spin" />
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Booting Forge OS</p>
      </div>
    </div>
  )
}

function RouteSkeleton() {
  return (
    <div className="relative z-50 min-h-full flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-ember border-t-transparent rounded-full animate-spin" />
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Opening…</p>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, fetchMe } = useAuthStore()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetchMe()
      .catch(() => {
        useAuthStore.setState({ isAuthenticated: false, user: null })
      })
      .finally(() => setChecking(false))
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
    fetchMe()
      .catch(() => {
        useAuthStore.setState({ isAuthenticated: false, user: null })
      })
      .finally(() => setChecking(false))
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

  // Admin check: verify via server-side user object from /auth/me
  // The server enforces admin authorization on all protected endpoints.
  // The `is_admin` field is set by the backend based on server-side config,
  // NOT by a client-side env var that can be inspected or bypassed.
  const isAdmin = user?.is_admin === true

  if (!isAdmin) {
    return <Navigate to="/projects" replace />
  }

  // admin_required also demands MFA. Send admins here before they hit an
  // empty console whose every request 403s with "enable MFA in Settings".
  if (LIVE_MODE && user?.mfa_enabled !== true) {
    return <Navigate to="/settings?mfa=required" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="relative isolate min-h-screen bg-base">
        <GlobalBackground />
        <div className="relative z-50">
          <BrowserRouter>
            <Routes>
          {/* Step 5: public landing — independent theme, no shell, no auth gate */}
          <Route
            path="/home"
            element={
              <ErrorBoundary>
                <Suspense fallback={<RouteSkeleton />}>
                  <LandingPage />
                </Suspense>
              </ErrorBoundary>
            }
          />

          <Route
            path="/login"
            element={
              <ErrorBoundary>
                <Suspense fallback={<RouteSkeleton />}>
                  <AuthPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/signup"
            element={
              <ErrorBoundary>
                <PublicRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <Signup />
                  </Suspense>
                </PublicRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <ErrorBoundary>
                <PublicRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <ForgotPassword />
                  </Suspense>
                </PublicRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/reset-password"
            element={
              <ErrorBoundary>
                <PublicRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <ResetPassword />
                  </Suspense>
                </PublicRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/verify-email"
            element={
              <ErrorBoundary>
                <Suspense fallback={<RouteSkeleton />}>
                  <VerifyEmail />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/google-callback"
            element={
              <ErrorBoundary>
                <Suspense fallback={<RouteSkeleton />}>
                  <GoogleCallback />
                </Suspense>
              </ErrorBoundary>
            }
          />
          <Route
            path="/onboarding"
            element={
              <ErrorBoundary>
                <Suspense fallback={<RouteSkeleton />}>
                  <Onboarding />
                </Suspense>
              </ErrorBoundary>
            }
          />

          {/* Launch — public entry splash; already-authenticated visitors are bounced straight to /projects by PublicRoute */}
          <Route
            path="/"
            element={
              <ErrorBoundary>
                <PublicRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <Launch />
                  </Suspense>
                </PublicRoute>
              </ErrorBoundary>
            }
          />

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
            <Route
              path="/projects"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <ProjectsPage />
                </Suspense>
              }
            />
            <Route
              path="/marketplace"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <MarketplacePage />
                </Suspense>
              }
            />
            <Route
              path="/billing"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <BillingPage />
                </Suspense>
              }
            />
            <Route
              path="/settings"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <SettingsPage />
                </Suspense>
              }
            />
            <Route
              path="/llm-management"
              element={
                <AdminRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <LLMManagementPage />
                  </Suspense>
                </AdminRoute>
              }
            />
            <Route
              path="/optimization-dashboard"
              element={
                <AdminRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <OptimizationDashboard />
                  </Suspense>
                </AdminRoute>
              }
            />
            <Route
              path="/engineering-health"
              element={
                <AdminRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <EngineeringHealthPage />
                  </Suspense>
                </AdminRoute>
              }
            />
            <Route
              path="/prompt-studio"
              element={
                <AdminRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <PromptStudioPage />
                  </Suspense>
                </AdminRoute>
              }
            />
            {/* Step 3: in-shell surfaces */}
            <Route
              path="/admin-console"
              element={
                <AdminRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <AdminConsole />
                  </Suspense>
                </AdminRoute>
              }
            />
            <Route
              path="/project/:projectId"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <ProjectHistory />
                </Suspense>
              }
            />
            <Route
              path="/project/:projectId/org"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <EngineeringOrgPage />
                </Suspense>
              }
            />
            <Route
              path="/reviews"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <ReviewsListPage />
                </Suspense>
              }
            />
            <Route
              path="/reviews/:runId"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <ReviewDetailPage />
                </Suspense>
              }
            />
            <Route
              path="/flow"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <FlowPage />
                </Suspense>
              }
            />
            <Route
              path="/initiatives"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <InitiativesListPage />
                </Suspense>
              }
            />
            <Route
              path="/initiatives/:initiativeId"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <InitiativeLayout />
                </Suspense>
              }
            >
              <Route index element={<OverviewTab />} />
              <Route path="board" element={<KanbanTab />} />
              <Route path="sprints" element={<SprintsTab />} />
              <Route path="agent-runs" element={<AgentRunsTab />} />
              <Route path="roadmap" element={<RoadmapTab />} />
              <Route path="graph" element={<GraphTab />} />
              <Route path="releases" element={<ReleasesTab />} />
              <Route path="activity" element={<ActivityTab />} />
              <Route path="integrations" element={<IntegrationsTab />} />
              <Route path="analytics" element={<AnalyticsTab />} />
            </Route>
          </Route>

          {/* Workspace — full-screen, no shell (step 4 fills this) */}
          <Route
            path="/build/:projectId"
            element={
              <ErrorBoundary>
                <ProtectedRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <WorkspacePage />
                  </Suspense>
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />

          <Route
            path="*"
            element={
              <ErrorBoundary>
                <Suspense fallback={<RouteSkeleton />}>
                  <NotFoundPage />
                </Suspense>
              </ErrorBoundary>
            }
          />
        </Routes>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "#1C1C1E",
              color: "#F5F5F7",
              border: "1px solid rgba(255,255,255,0.12)",
              fontSize: "14px",
              borderRadius: "16px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.55)",
            },
          }}
        />
      </BrowserRouter>
      </div>
    </div>
    </QueryClientProvider>
  )
}
