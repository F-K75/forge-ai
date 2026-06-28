import { create } from 'zustand'
import { api } from '../lib/api'

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
  demoMode: boolean
}

const DEMO_USER: User = {
  id: 'demo-user-1',
  email: 'demo@forge.ai',
  name: 'Demo User',
  plan: 'free',
  credits: 10,
  created_at: new Date().toISOString(),
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  demoMode: false,

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/auth/login', { email, password })
      set({ user: res.data.user, isAuthenticated: true, isLoading: false })
      await get().fetchMe()
    } catch (e) {
      // Demo mode fallback - auto-login with demo user
      console.log('Login failed, entering demo mode')
      set({ user: DEMO_USER, isAuthenticated: true, isLoading: false, demoMode: true })
    }
  },

  register: async (email: string, name: string, password: string) => {
    set({ isLoading: true })
    try {
      const res = await api.post('/auth/register', { email, name, password })
      set({ user: res.data.user, isAuthenticated: true, isLoading: false })
      await get().fetchMe()
    } catch (e) {
      // Demo mode fallback
      console.log('Register failed, entering demo mode')
      set({ user: DEMO_USER, isAuthenticated: true, isLoading: false, demoMode: true })
    }
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false, demoMode: false })
  },

  fetchMe: async () => {
    try {
      const res = await api.get('/auth/me')
      set({ user: res.data, isAuthenticated: true, isLoading: false })
    } catch {
      // Demo mode fallback - show demo user
      set({ user: DEMO_USER, isAuthenticated: true, isLoading: false, demoMode: true })
    }
  },
}))
