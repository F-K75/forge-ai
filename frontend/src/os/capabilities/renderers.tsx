import { Component, Suspense, type ComponentType, type ErrorInfo, type ReactNode } from "react"
import { Route, Routes } from "react-router-dom"
import { lazyWithRetry } from "../../lib/lazyRetry"
import { LIVE_MODE } from "../../lib/env"
import { useAuthStore } from "../../store/authStore"
import type { CapabilityDescriptor, CapabilityRendererProps } from "../contracts"
import { NoProjectState } from "../../components/capabilities/ProjectScope"
import { EmbeddedContext } from "./embedding"
import { paramString } from "./adapters/params"

export type CapabilityRendererComponent = ComponentType<CapabilityRendererProps>

// --------------------------------------------------------------------------- frame

function RendererSkeleton() {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center" aria-busy="true">
      <p className="text-xs font-medium text-muted">Opening…</p>
    </div>
  )
}

class RendererBoundary extends Component<{ title: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("capability renderer failed", error, info.componentStack)
  }
  render() {
    if (this.state.failed) {
      return (
        <div role="alert" className="flex h-full min-h-[160px] flex-col items-center justify-center gap-1 p-6 text-center">
          <p className="text-sm font-medium text-ink">{this.props.title} couldn’t be displayed</p>
          <p className="text-xs text-muted">Close this window and try again.</p>
        </div>
      )
    }
    return this.props.children
  }
}

/** Embedded page frame: no viewport assumptions, its own scroll, loading and error states. */
export function EmbeddedFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <EmbeddedContext.Provider value={true}>
      <div className="relative h-full min-h-0 w-full overflow-auto" data-os-embedded="true">
        <RendererBoundary title={title}>
          <Suspense fallback={<RendererSkeleton />}>{children}</Suspense>
        </RendererBoundary>
      </div>
    </EmbeddedContext.Provider>
  )
}

/**
 * Render a routed page inside a window with its own route params.
 *
 * Pages read `useParams` / `useSearchParams`; `<Routes location>` gives them a
 * synthetic location (e.g. `/p/abc/files`) inside the shell's router, so no
 * page needs to change how it reads its params. Links and `navigate()` inside
 * the page still drive the real router (the legacy-route bridge opens them).
 */
export function RouteScoped({ pattern, location, children }: { pattern: string; location: string; children: ReactNode }) {
  return (
    <Routes location={location}>
      <Route path={pattern} element={children} />
    </Routes>
  )
}

// --------------------------------------------------------------------------- helpers

type PageModule = { default: ComponentType<{ embedded?: boolean }> }

function page(load: () => Promise<PageModule>) {
  return lazyWithRetry(load)
}

function named<K extends string>(load: () => Promise<Record<K, ComponentType>>, key: K) {
  return lazyWithRetry(() => load().then((m) => ({ default: m[key] as ComponentType })))
}

function projectOf(props: CapabilityRendererProps): string | null {
  return props.projectId ?? paramString(props.params, "project_id")
}

const NoProject = NoProjectState

function withFrame(render: (props: CapabilityRendererProps) => ReactNode): CapabilityRendererComponent {
  function FramedRenderer(props: CapabilityRendererProps) {
    return <EmbeddedFrame title={props.capability.title}>{render(props)}</EmbeddedFrame>
  }
  return FramedRenderer
}

/** A page that needs no route params. */
function plainPage(load: () => Promise<PageModule>, pattern: string, location = pattern): CapabilityRendererComponent {
  const Page = page(load)
  return withFrame(() => (
    <RouteScoped pattern={pattern} location={location}>
      <Page embedded />
    </RouteScoped>
  ))
}

/** A page under `/p/:projectId/...`; global variant used when no project is in scope (if any). */
function projectPage(
  load: () => Promise<PageModule>,
  sub: string,
  opts: { global?: string; what: string }
): CapabilityRendererComponent {
  const Page = page(load)
  return withFrame((props) => {
    const projectId = projectOf(props)
    if (!projectId) {
      if (opts.global) {
        return (
          <RouteScoped pattern={opts.global} location={opts.global}>
            <Page embedded />
          </RouteScoped>
        )
      }
      return <NoProject what={opts.what} />
    }
    return (
      <RouteScoped pattern={`/p/:projectId/${sub}`} location={`/p/${encodeURIComponent(projectId)}/${sub}`}>
        <Page embedded />
      </RouteScoped>
    )
  })
}

// --------------------------------------------------------------------------- PM (initiative layout + tab)

const InitiativeLayout = page(() => import("../../pages/pm/InitiativeLayout"))
const PM_TABS: Record<string, { segment: string; load: () => Promise<PageModule> }> = {
  overview: { segment: "", load: () => import("../../pages/pm/OverviewTab") },
  board: { segment: "board", load: () => import("../../pages/pm/KanbanTab") },
  sprints: { segment: "sprints", load: () => import("../../pages/pm/SprintsTab") },
  agent_runs: { segment: "agent-runs", load: () => import("../../pages/pm/AgentRunsTab") },
  roadmap: { segment: "roadmap", load: () => import("../../pages/pm/RoadmapTab") },
  graph: { segment: "graph", load: () => import("../../pages/pm/GraphTab") },
  releases: { segment: "releases", load: () => import("../../pages/pm/ReleasesTab") },
  activity: { segment: "activity", load: () => import("../../pages/pm/ActivityTab") },
  integrations: { segment: "integrations", load: () => import("../../pages/pm/IntegrationsTab") },
  analytics: { segment: "analytics", load: () => import("../../pages/pm/AnalyticsTab") },
}

function initiativeTab(tab: string): CapabilityRendererComponent {
  const { segment, load } = PM_TABS[tab]
  const Tab = page(load)
  return withFrame((props) => {
    const initiativeId = paramString(props.params, "initiative_id")
    if (!initiativeId) {
      return <p className="p-6 text-center text-sm text-muted">Open an initiative first.</p>
    }
    const projectId = projectOf(props)
    const base = projectId
      ? `/p/${encodeURIComponent(projectId)}/initiatives/${encodeURIComponent(initiativeId)}`
      : `/initiatives/${encodeURIComponent(initiativeId)}`
    const pattern = projectId ? "/p/:projectId/initiatives/:initiativeId" : "/initiatives/:initiativeId"
    return (
      <Routes location={segment ? `${base}/${segment}` : base}>
        <Route path={pattern} element={<InitiativeLayout embedded />}>
          {segment ? <Route path={segment} element={<Tab />} /> : <Route index element={<Tab />} />}
        </Route>
      </Routes>
    )
  })
}

// --------------------------------------------------------------------------- admin console

function AdminOnly({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  if (user?.is_admin !== true) {
    return <p className="p-6 text-center text-sm text-muted" role="alert">Admin tools are only available to admin accounts.</p>
  }
  if (LIVE_MODE && user.mfa_enabled !== true) {
    return (
      <p className="p-6 text-center text-sm text-muted" role="alert">
        Admin tools require two-factor authentication. Turn it on in Security settings first.
      </p>
    )
  }
  return <>{children}</>
}

const AdminOpsPage = page(() => import("../../pages/AdminOpsPage"))
function adminTab(tab: string): CapabilityRendererComponent {
  return withFrame(() => (
    <AdminOnly>
      <RouteScoped pattern="/admin" location={`/admin?tab=${tab}`}>
        <AdminOpsPage embedded />
      </RouteScoped>
    </AdminOnly>
  ))
}

// --------------------------------------------------------------------------- settings panels

const SETTINGS_EXPORTS = {
  ProfileTab: () => import("../../pages/settings/ProfileTab"),
  AppearanceTab: () => import("../../pages/settings/AppearanceTab"),
  ModelsTab: () => import("../../pages/settings/ModelsTab"),
  AgentFleetTab: () => import("../../pages/settings/AgentFleetTab"),
  ApiKeysTab: () => import("../../pages/settings/ApiKeysTab"),
  IntegrationsTab: () => import("../../pages/settings/IntegrationsTab"),
  NotificationsTab: () => import("../../pages/settings/NotificationsTab"),
  SecurityTab: () => import("../../pages/settings/SecurityTab"),
  PrivacyTab: () => import("../../pages/settings/PrivacyTab"),
  SupportTab: () => import("../../pages/settings/SupportTab"),
} as const

function settingsPanel(key: keyof typeof SETTINGS_EXPORTS): CapabilityRendererComponent {
  const Panel = named(SETTINGS_EXPORTS[key] as () => Promise<Record<string, ComponentType>>, key)
  return withFrame(() => (
    <div className="p-4">
      <Panel />
    </div>
  ))
}

// --------------------------------------------------------------------------- adapters

function adapter(load: () => Promise<Record<string, unknown>>, key: string): CapabilityRendererComponent {
  const Lazy = lazyWithRetry(() =>
    load().then((m) => ({ default: m[key] as CapabilityRendererComponent }))
  )
  return withFrame((props) => <Lazy {...props} />)
}

const build = () => import("./adapters/BuildAdapters")
const misc = () => import("./adapters/MiscAdapters")

const ProjectHistoryLive = page(() => import("../../pages/ProjectHistory"))
const HistoryDemo = page(() => import("../../pages/HistoryPage"))
const ReviewDetail = page(() => import("../../pages/reviews/ReviewDetailPage"))
const SettingsPage = page(() => import("../../pages/SettingsPage"))

// --------------------------------------------------------------------------- registry

/**
 * `renderer.component_key` (shared/os-schemas/capabilities.json) → renderer.
 * Keys under `shell.` belong to WS-A (capability library, history panel) and
 * are resolved by the shell, not here.
 */
export const CAPABILITY_RENDERERS: Record<string, CapabilityRendererComponent> = {
  "pages.Launch": plainPage(() => import("../../pages/Launch"), "/launch"),
  "pages.ProjectsPage": plainPage(() => import("../../pages/ProjectsPage"), "/projects"),
  "pages.CommandCenterPage": plainPage(() => import("../../pages/CommandCenterPage"), "/command"),
  "pages.SkillsPage": plainPage(() => import("../../pages/SkillsPage"), "/skills"),
  "pages.ProtocolsPage": plainPage(() => import("../../pages/ProtocolsPage"), "/protocols"),
  "pages.ApprovalsPage": plainPage(() => import("../../pages/ApprovalsPage"), "/approvals"),
  "pages.MarketplacePage": plainPage(() => import("../../pages/MarketplacePage"), "/marketplace"),
  "pages.BillingPage": plainPage(() => import("../../pages/BillingPage"), "/billing"),
  "pages.SpatialStudioPage": plainPage(() => import("../../pages/SpatialStudioPage"), "/studio-3d"),
  "pages.SettingsPage": withFrame((props) => {
    const tab = paramString(props.params, "tab")
    return (
      <RouteScoped pattern="/settings" location={tab ? `/settings#${tab}` : "/settings"}>
        <SettingsPage embedded />
      </RouteScoped>
    )
  }),
  "pages.WorkspacePage": projectPage(() => import("../../pages/WorkspacePage"), "workspace", { what: "Build workspaces" }),
  "pages.FilesPage": projectPage(() => import("../../pages/FilesPage"), "files", { what: "Project files" }),
  "pages.FlowPage": projectPage(() => import("../../pages/FlowPage"), "agents", { global: "/agents", what: "Agents" }),
  "pages.ProjectHistory": withFrame((props) => {
    const projectId = projectOf(props)
    if (!projectId) return <NoProject what="Build histories" />
    const History = LIVE_MODE ? ProjectHistoryLive : HistoryDemo
    return (
      <RouteScoped pattern="/p/:projectId/history" location={`/p/${encodeURIComponent(projectId)}/history`}>
        <History embedded />
      </RouteScoped>
    )
  }),
  "pm.InitiativesListPage": projectPage(() => import("../../pages/pm/InitiativesListPage"), "initiatives", { global: "/initiatives", what: "Initiatives" }),
  ...Object.fromEntries(Object.keys(PM_TABS).map((tab) => [`pm.Initiative.${tab}`, initiativeTab(tab)])),
  "reviews.ReviewsListPage": projectPage(() => import("../../pages/reviews/ReviewsListPage"), "reviews", { global: "/reviews", what: "Reviews" }),
  "reviews.ReviewDetailPage": withFrame((props) => {
    const runId = paramString(props.params, "run_id")
    if (!runId) return <p className="p-6 text-center text-sm text-muted">Choose a review run to open.</p>
    return (
      <RouteScoped pattern="/reviews/:runId" location={`/reviews/${encodeURIComponent(runId)}`}>
        <ReviewDetail embedded />
      </RouteScoped>
    )
  }),
  "admin.Console.overview": adminTab("overview"),
  "admin.Console.llm": adminTab("llm"),
  "admin.Console.optimization": adminTab("optimization"),
  "admin.Console.health": adminTab("health"),
  "admin.Console.prompts": adminTab("prompts"),
  ...Object.fromEntries(
    (Object.keys(SETTINGS_EXPORTS) as (keyof typeof SETTINGS_EXPORTS)[]).map((k) => [`settings.${k}`, settingsPanel(k)])
  ),
  "composite.LivePreview": adapter(build, "BuildPreviewRenderer"),
  "composite.DeployPanel": adapter(build, "BuildDeployRenderer"),
  "build.CodeView": adapter(build, "BuildCodeRenderer"),
  "build.DebugConsole": adapter(build, "BuildDebugRenderer"),
  "composite.AgentConfigForm": adapter(misc, "AgentCreateRenderer"),
  "composite.WorkflowCanvas": adapter(misc, "WorkflowRenderer"),
  "agents.KernelRunPanel": adapter(misc, "KernelRunRenderer"),
  "fleet.AgentGraph": adapter(misc, "AgentGraphRenderer"),
  "protocols.McpApp": adapter(misc, "McpAppRenderer"),
  "projects.Settings": adapter(misc, "ProjectSettingsRenderer"),
}

/** Component keys resolved by the shell (WS-A), not by this registry. */
export const SHELL_COMPONENT_KEYS = ["shell.CapabilityLibrary", "shell.NavHistoryPanel"] as const

/**
 * The React component that renders a capability in a window, panel or inline
 * slot, or `null` when the capability is not a `component` renderer (A2UI
 * surfaces render through WS-B's SurfaceView, MCP Apps through its host,
 * `shell.*` keys through WS-A).
 */
export function resolveCapabilityRenderer(capability: CapabilityDescriptor): CapabilityRendererComponent | null {
  if (capability.renderer.kind !== "component") return null
  return CAPABILITY_RENDERERS[capability.renderer.component_key] ?? null
}
