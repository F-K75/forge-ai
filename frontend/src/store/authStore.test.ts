import { describe, expect, it, beforeEach } from 'vitest'
import { useAuthStore } from './authStore'

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: true,
    })
  })

  it('starts with empty auth state', () => {
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
    expect(state.isLoading).toBe(true)
  })

  it('login sets demo user when LIVE_MODE is false', async () => {
    await useAuthStore.getState().login('user@example.com', 'secret')
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.isLoading).toBe(false)
    expect(state.user?.email).toBe('user@example.com')
    expect(state.user?.name).toBe('Demo Builder')
    expect(state.user?.plan).toBe('pro')
    expect(state.user?.is_admin).toBe(false)
  })

  it('login as admin@forge.ai is a demo admin when LIVE_MODE is false', async () => {
    await useAuthStore.getState().login('admin@forge.ai', 'anything')
    expect(useAuthStore.getState().user?.is_admin).toBe(true)
  })

  it('login returns undefined in demo mode (no MFA)', async () => {
    const result = await useAuthStore.getState().login('user@example.com', 'secret')
    expect(result).toBeUndefined()
  })

  it('register sets demo user in demo mode', async () => {
    await useAuthStore.getState().register('new@example.com', 'New User', 'password123')
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.isLoading).toBe(false)
    expect(state.user?.email).toBe('new@example.com')
    expect(state.user?.name).toBe('New User')
  })

  it('logout clears user in demo mode', async () => {
    useAuthStore.setState({ user: { id: '1', email: 'a@b.com', name: 'A', plan: 'free', credits: 0, created_at: '' }, isAuthenticated: true })
    await useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.isAuthenticated).toBe(false)
  })

  it('fetchMe sets demo user in demo mode when there is no session', async () => {
    await useAuthStore.getState().fetchMe()
    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.isLoading).toBe(false)
    expect(state.user?.email).toBe('demo@forge.dev')
    expect(state.user?.is_admin).toBe(false)
  })

  it('fetchMe keeps the demo admin instead of resetting to demo@forge.dev', async () => {
    await useAuthStore.getState().login('admin@forge.ai', 'anything')
    await useAuthStore.getState().fetchMe()
    const state = useAuthStore.getState()
    expect(state.user?.email).toBe('admin@forge.ai')
    expect(state.user?.is_admin).toBe(true)
  })

  it('isLoading is false after successful login', async () => {
    await useAuthStore.getState().login('a@b.com', 'p')
    expect(useAuthStore.getState().isLoading).toBe(false)
  })
})
