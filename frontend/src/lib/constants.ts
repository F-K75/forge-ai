export const BUILD_STATUS_LABELS: Record<string, string> = {
  idle: 'Stand by',
  pending: 'Pending',
  running: 'Building',
  success: 'Build ready',
  failed: 'Build failed',
  debugging: 'Debugging',
} as const

export const BUILD_STATUS_TONES: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  idle: 'neutral',
  pending: 'info',
  running: 'info',
  success: 'success',
  failed: 'danger',
  debugging: 'warning',
} as const

export const AGENT_TYPES = ['architect', 'designer', 'developer', 'integration', 'pm'] as const

export const SIDEBAR_ITEMS = [
  { label: 'Workspace', to: '/' },
  { label: 'Projects', to: '/' },
  { label: 'Marketplace', to: '/marketplace' },
  { label: 'Agents', to: '/' },
  { label: 'Tasks', to: '/' },
  { label: 'Files', to: '/' },
  { label: 'Deployments', to: '/' },
  { label: 'Billing', to: '/billing' },
  { label: 'Settings', to: '/settings' },
] as const

export const ROUTES = {
  LOGIN: '/login',
  SIGNUP: '/signup',
  FORGOT_PASSWORD: '/forgot-password',
  ONBOARDING: '/onboarding',
  BILLING: '/billing',
  SETTINGS: '/settings',
  ADMIN: '/admin',
  MARKETPLACE: '/marketplace',
  WORKSPACE: '/',
  PROJECT: '/project/:projectId',
} as const

export const COLORS = {
  primary: 'violet',
  success: 'emerald',
  warning: 'amber',
  danger: 'red',
} as const