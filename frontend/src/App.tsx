import { useEffect, useState, Suspense } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom"
import { Toaster } from "react-hot-toast"
import { useAuthStore } from "./store/authStore"
import { ErrorBoundary } from "./components/ui/ErrorBoundary"
import { LIVE_MODE } from "./lib/env"
import { lazyWithRetry } from "./lib/lazyRetry"
import { useActiveProject } from "./hooks/useActiveProject"
import GlobalBackground from "./components/GlobalBackground"
import BrandLogo from "./components/BrandLogo"

const AuthPage = lazyWithRetry(() => import("./pages/AuthPage"))
const Signup = lazyWithRetry(() => import("./pages/Signup"))
const ForgotPassword = lazyWithRetry(() => import("./pages/ForgotPassword"))
const Onboarding = lazyWithRetry(() => import("./pages/Onboarding"))
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"))
const VerifyEmail = lazyWithRetry(() => import("./pages/VerifyEmail"))
const GoogleCallback = lazyWithRetry(() => import("./pages/GoogleCallback"))
const NotFoundPage = lazyWithRetry(() => import("./pages/NotFoundPage"))

// App shell + routed pages (step 1)
const AppShell = lazyWithRetry(() => import("./components/AppShell"))
const Launch = lazyWithRetry(() => import("./pages/Launch"))
const ProjectsPage = lazyWithRetry(() => import("./pages/ProjectsPage"))
const FlowPage = lazyWithRetry(() => import("./pages/FlowPage"))
const FilesPage = lazyWithRetry(() => import("./pages/FilesPage"))
const HistoryPage = lazyWithRetry(() => import("./pages/HistoryPage"))
const MarketplacePage = lazyWithRetry(() => import("./pages/MarketplacePage"))
const BillingPage = lazyWithRetry(() => import("./pages/BillingPage"))
const SettingsPage = lazyWithRetry(() => import("./pages/SettingsPage"))
const WorkspacePage = lazyWithRetry(() => import("./pages/WorkspacePage"))
const LLMManagementPage = lazyWithRetry(() => import("./pages/LLMManagementPage"))
const OptimizationDashboard = lazyWithRetry(() => import("./pages/OptimizationDashboard"))
const EngineeringHealthPage = lazyWithRetry(() => import("./pages/EngineeringHealthPage"))
const PromptStudioPage = lazyWithRetry(() => import("./pages/PromptStudioPage"))
// Step 3: in-shell surfaces
const AdminConsole = lazyWithRetry(() => import("./pages/AdminConsole"))
const ProjectHistory = lazyWithRetry(() => import("./pages/ProjectHistory"))
const EngineeringOrgPage = lazyWithRetry(() => import("./pages/EngineeringOrgPage"))
// AI-native Agile PM layer (Initiatives): vision/PRD -> epics/stories/tasks -> sprints -> board -> releases
const InitiativesListPage = lazyWithRetry(() => import("./pages/pm/InitiativesListPage"))
const InitiativeLayout = lazyWithRetry(() => import("./pages/pm/InitiativeLayout"))
const OverviewTab = lazyWithRetry(() => import("./pages/pm/OverviewTab"))
const KanbanTab = lazyWithRetry(() => import("./pages/pm/KanbanTab"))
const SprintsTab = lazyWithRetry(() => import("./pages/pm/SprintsTab"))
const AgentRunsTab = lazyWithRetry(() => import("./pages/pm/AgentRunsTab"))
const RoadmapTab = lazyWithRetry(() => import("./pages/pm/RoadmapTab"))
const GraphTab = lazyWithRetry(() => import("./pages/pm/GraphTab"))
const ReleasesTab = lazyWithRetry(() => import("./pages/pm/ReleasesTab"))
const ActivityTab = lazyWithRetry(() => import("./pages/pm/ActivityTab"))
const IntegrationsTab = lazyWithRetry(() => import("./pages/pm/IntegrationsTab"))
const AnalyticsTab = lazyWithRetry(() => import("./pages/pm/AnalyticsTab"))
// Review board — orchestrator UI (separate backend service, see lib/orchestratorApi.ts)
const ReviewsListPage = lazyWithRetry(() => import("./pages/reviews/ReviewsListPage"))
const ReviewDetailPage = lazyWithRetry(() => import("./pages/reviews/ReviewDetailPage"))
// Step 5: public marketing surface (independent theme, no shell, no auth)
const LandingPage = lazyWithRetry(() => import("./pages/LandingPage"))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

function LoadingSpinner() {
  return (
    <div className="relative z-50 min-h-[100dvh] bg-[#07070b] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <BrandLogo size="lg" />
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Booting Forge OS</p>
      </div>
    </div>
  )
}

function RouteSkeleton() {
  return (
    <div className="relative z-50 min-h-full flex items-center justify-center py-20">
      <div className="flex flex-col items-center gap-3">
        <BrandLogo size="md" />
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

  return <>{children}</>
}

function RootRoute() {
  const { isAuthenticated, fetchMe } = useAuthStore()
  const location = useLocation()
  const [checking, setChecking] = useState(LIVE_MODE)

  useEffect(() => {
    if (!LIVE_MODE) return
    fetchMe()
      .catch(() => {
        useAuthStore.setState({ isAuthenticated: false, user: null })
      })
      .finally(() => setChecking(false))
  }, [fetchMe])

  if (checking) {
    return <RouteSkeleton />
  }

  const searchParams = new URLSearchParams(location.search)
  const wantsApp = searchParams.get("app") === "true"

  if (LIVE_MODE && isAuthenticated) {
    // /projects resolves the user's real projects; a stale or foreign
    // "last project" id from localStorage would otherwise 404.
    return <Navigate to="/projects" replace />
  }
  if (wantsApp) {
    return <Navigate to="/p/demo-project/workspace" replace />
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteSkeleton />}>
        <LandingPage />
      </Suspense>
    </ErrorBoundary>
  )
}

function ProjectScopedRedirect({ sub }: { sub: string }) {
  const { projectPath, isLoading } = useActiveProject()
  if (LIVE_MODE && isLoading) return <RouteSkeleton />
  return <Navigate to={projectPath(sub)} replace />
}

function WorkspaceRedirect() {
  return <ProjectScopedRedirect sub="workspace" />
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

          {/* Layer 1: Public Marketing & CLI Launchpad */}
          <Route path="/" element={<RootRoute />} />
          <Route
            path="/demo"
            element={<Navigate to={LIVE_MODE ? "/projects" : "/p/demo-project/workspace"} replace />}
          />
          <Route
            path="/launch"
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

          {/* Layer 2 & 3: Platform Hub & Project-Scoped Workspaces */}
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
            {/* Backward-compatibility and global aliases */}
            <Route
              path="/workspace"
              element={<WorkspaceRedirect />}
            />
            <Route
              path="/build/:projectId"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <WorkspacePage />
                </Suspense>
              }
            />

            {/* Layer 3: Project-Scoped Deep Work Context (/p/:projectId/*) */}
            <Route path="/p/:projectId">
              <Route index element={<Navigate to="workspace" replace />} />
              <Route
                path="workspace"
                element={
                  <Suspense fallback={<RouteSkeleton />}>
                    <WorkspacePage />
                  </Suspense>
                }
              />
              <Route
                path="flow"
                element={
                  <Suspense fallback={<RouteSkeleton />}>
                    <FlowPage />
                  </Suspense>
                }
              />
              <Route
                path="agents"
                element={
                  <Suspense fallback={<RouteSkeleton />}>
                    <FlowPage />
                  </Suspense>
                }
              />
              <Route
                path="initiatives"
                element={
                  <Suspense fallback={<RouteSkeleton />}>
                    <InitiativesListPage />
                  </Suspense>
                }
              />
              <Route
                path="initiatives/:initiativeId"
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
              <Route
                path="reviews"
                element={
                  <Suspense fallback={<RouteSkeleton />}>
                    <ReviewsListPage />
                  </Suspense>
                }
              />
              <Route
                path="reviews/:runId"
                element={
                  <Suspense fallback={<RouteSkeleton />}>
                    <ReviewDetailPage />
                  </Suspense>
                }
              />
              <Route
                path="files"
                element={
                  <Suspense fallback={<RouteSkeleton />}>
                    <FilesPage />
                  </Suspense>
                }
              />
              <Route
                path="history"
                element={
                  <Suspense fallback={<RouteSkeleton />}>
                    {/* Live mode: the real, API-backed build history. */}
                    {LIVE_MODE ? <ProjectHistory /> : <HistoryPage />}
                  </Suspense>
                }
              />
              <Route
                path="settings"
                element={
                  <Suspense fallback={<RouteSkeleton />}>
                    <SettingsPage />
                  </Suspense>
                }
              />
            </Route>

            {/* Layer 2: Platform Hub Routes */}
            <Route
              path="/projects"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <ProjectsPage />
                </Suspense>
              }
            />
            <Route
              path="/agents"
              element={
                <Suspense fallback={<RouteSkeleton />}>
                  <FlowPage />
                </Suspense>
              }
            />
            <Route
              path="/files"
              element={
                LIVE_MODE ? (
                  <ProjectScopedRedirect sub="files" />
                ) : (
                  <Suspense fallback={<RouteSkeleton />}>
                    <FilesPage />
                  </Suspense>
                )
              }
            />
            <Route
              path="/history"
              element={
                LIVE_MODE ? (
                  <ProjectScopedRedirect sub="history" />
                ) : (
                  <Suspense fallback={<RouteSkeleton />}>
                    <HistoryPage />
                  </Suspense>
                )
              }
            />
            <Route
              path="/models"
              element={
                <AdminRoute>
                  <Suspense fallback={<RouteSkeleton />}>
                    <LLMManagementPage />
                  </Suspense>
                </AdminRoute>
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
