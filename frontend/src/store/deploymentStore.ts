import { create } from 'zustand'

export type DeploymentPhase = 'idle' | 'pending' | 'building' | 'deploying' | 'live' | 'failed' | 'cancelled'

const STATUS_MAP: Record<string, DeploymentPhase> = {
  pending: 'pending',
  building: 'building',
  deploying: 'deploying',
  live: 'live',
  failed: 'failed',
  cancelled: 'cancelled',
}

interface DeploymentEventData {
  deployment_id: string
  status?: string
  url?: string
  error?: string
}

interface DeploymentState {
  deploymentId: string | null
  status: DeploymentPhase
  url: string | null
  error: string | null

  startDeployment: (deploymentId: string) => void
  // Deployment lifecycle reuses the build socket's event types (build_start,
  // agent_progress, build_complete, build_failed) tagged with a
  // deployment_id in `data` — buildStore.handleEvent routes those here
  // instead of treating them as code-build events (they share a channel).
  handleEvent: (type: string, data: DeploymentEventData) => void
  reset: () => void
}

export const useDeploymentStore = create<DeploymentState>((set, get) => ({
  deploymentId: null,
  status: 'idle',
  url: null,
  error: null,

  startDeployment: (deploymentId) => set({ deploymentId, status: 'pending', url: null, error: null }),

  handleEvent: (type, data) => {
    if (!data.deployment_id || data.deployment_id !== get().deploymentId) return

    if (type === 'build_failed') {
      set({ status: 'failed', error: data.error ?? 'Deployment failed' })
      return
    }

    set((state) => ({
      status: (data.status ? STATUS_MAP[data.status] : undefined) ?? state.status,
      url: data.url ?? state.url,
    }))
  },

  reset: () => set({ deploymentId: null, status: 'idle', url: null, error: null }),
}))
