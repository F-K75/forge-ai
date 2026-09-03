import { create } from 'zustand'
import { api, authApi } from '../lib/api'
import { LIVE_MODE } from '../lib/env'
import { usePMStore } from './pmStore'
import { useBuildStore } from './buildStore'
import { useDeploymentStore } from './deploymentStore'
import { useReviewStore } from './reviewStore'

export const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000'

export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  plan: 'free' | 'standard' | 'pro' | 'enterprise'
  credits: number
  created_at: string
  github_connected?: boolean
  byok_connected?: boolean
  llm_provider?: 'anthropic' | 'openai_compatible'
  llm_base_url?: string
  llm_model?: string
  mfa_enabled?: boolean
  is_admin?: boolean
  preferences?: Record<string, unknown>
  completed_onboarding?: boolean
}

// Returned by login() when the account has MFA enabled -- no session has
// been established yet, so the caller must collect a TOTP/backup code and
// call verifyMfa() to finish signing in.
export interface MfaRequired {
  mfaRequired: true
  mfaToken: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<MfaRequired | void>
  verifyMfa: (mfaToken: string, code: string) => Promise<void>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
  googleLogin: () => Promise<void>
  completeOnboarding: () => Promise<void>
}

// Demo mode has no backend to authenticate against — this stands in for a
// real session so route guards, onboarding, and the workspace all behave
// as if a user is signed in.
const demoUser = (overrides: Partial<User> = {}): User => {
  const email = overrides.email ?? 'demo@forge.dev'
  return {
    id: 'demo-user',
    email,
    name: 'Demo Builder',
    plan: 'pro',
    credits: 612,
    created_at: new Date().toISOString(),
    completed_onboarding: false,
    // Matches backend ADMIN_EMAILS default so a mock Pages build can open
    // /admin-console without a live API. Not a production grant.
    is_admin: email.toLowerCase() === 'admin@forge.ai',
    ...overrides,
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    if (!LIVE_MODE) {
      set({ user: demoUser({ email }), isAuthenticated: true, isLoading: false })
      return
    }
    set({ isLoading: true })
    const res = await api.post('/v1/auth/login', { email, password })
    if (res.data?.mfa_required) {
      set({ isLoading: false })
      return { mfaRequired: true, mfaToken: res.data.mfa_token }
    }
    set({ user: res.data.user, isAuthenticated: true, isLoading: false })
  },

  googleLogin: async () => {
    if (!LIVE_MODE) {
      set({ user: demoUser(), isAuthenticated: true, isLoading: false })
      return
    }
    // Use full-page redirect instead of popup to avoid cross-origin issues.
    window.location.href = `${API_URL}/v1/auth/google`
  },

  verifyMfa: async (mfaToken: string, code: string) => {
    set({ isLoading: true })
    const data = await authApi.mfa.verify(mfaToken, code)
    set({ user: data.user, isAuthenticated: true, isLoading: false })
  },

  register: async (email: string, name: string, password: string) => {
    if (!LIVE_MODE) {
      set({ user: demoUser({ email, name }), isAuthenticated: true, isLoading: false })
      return
    }
    set({ isLoading: true })
    const res = await api.post('/v1/auth/register', { email, name, password })
    set({ user: res.data.user, isAuthenticated: true, isLoading: false })
  },

  logout: async () => {
    if (!LIVE_MODE) {
      usePMStore.getState().reset()
      useBuildStore.getState().reset()
      useDeploymentStore.getState().reset()
      useReviewStore.getState().reset()
      set({ user: null, isAuthenticated: false })
      return
    }
    try {
      await api.post('/v1/auth/logout')
    } catch {
      // ignore
    } finally {
      usePMStore.getState().reset()
      useBuildStore.getState().reset()
      useDeploymentStore.getState().reset()
      useReviewStore.getState().reset()
    }
    set({ user: null, isAuthenticated: false })
  },

  fetchMe: async () => {
    if (!LIVE_MODE) {
      const current = useAuthStore.getState().user
      set({ user: current ?? demoUser(), isAuthenticated: true, isLoading: false })
      return
    }
    try {
      const res = await api.get('/v1/auth/me')
      set({ user: res.data, isAuthenticated: true, isLoading: false })
    } catch (err) {
      set({ isLoading: false })
      throw err
    }
  },

  completeOnboarding: async () => {
    if (!LIVE_MODE) {
      set({ user: demoUser({ completed_onboarding: true }), isAuthenticated: true, isLoading: false })
      return
    }
    await authApi.completeOnboarding()
    set((state) => ({
      user: state.user ? { ...state.user, completed_onboarding: true } : null,
    }))
  },
}))
