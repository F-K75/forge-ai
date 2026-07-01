import { create } from 'zustand'
import { api } from '../lib/api'
import { LIVE_MODE } from '../lib/env'

export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  plan: 'free' | 'standard' | 'pro' | 'enterprise'
  credits: number
  created_at: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, name: string, password: string) => Promise<void>
  logout: () => Promise<void>
  fetchMe: () => Promise<void>
}

// Demo mode has no backend to authenticate against — this stands in for a
// real session so route guards, onboarding, and the workspace all behave
// as if a user is signed in.
const demoUser = (overrides: Partial<User> = {}): User => ({
  id: 'demo-user',
  email: 'demo@forge.dev',
  name: 'Demo Builder',
  plan: 'pro',
  credits: 612,
  created_at: new Date().toISOString(),
  ...overrides,
})

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
    const res = await api.post('/auth/login', { email, password })
    set({ user: res.data.user, isAuthenticated: true, isLoading: false })
  },

  register: async (email: string, name: string, password: string) => {
    if (!LIVE_MODE) {
      set({ user: demoUser({ email, name }), isAuthenticated: true, isLoading: false })
      return
    }
    set({ isLoading: true })
    const res = await api.post('/auth/register', { email, name, password })
    set({ user: res.data.user, isAuthenticated: true, isLoading: false })
  },

  logout: async () => {
    if (!LIVE_MODE) {
      set({ user: null, isAuthenticated: false })
      return
    }
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false })
  },

  fetchMe: async () => {
    if (!LIVE_MODE) {
      set({ user: demoUser(), isAuthenticated: true, isLoading: false })
      return
    }
    const res = await api.get('/auth/me')
    set({ user: res.data, isAuthenticated: true, isLoading: false })
  },
}))
