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
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    set({ isLoading: true })
    const res = await api.post('/auth/login', { email, password })
    set({ user: res.data.user, isAuthenticated: true, isLoading: false })
    await get().fetchMe()
  },

  register: async (email: string, name: string, password: string) => {
    set({ isLoading: true })
    const res = await api.post('/auth/register', { email, name, password })
    set({ user: res.data.user, isAuthenticated: true, isLoading: false })
    await get().fetchMe()
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // ignore
    }
    set({ user: null, isAuthenticated: false })
  },

  fetchMe: async () => {
    const res = await api.get('/auth/me')
    set({ user: res.data, isAuthenticated: true, isLoading: false })
  },
}))
